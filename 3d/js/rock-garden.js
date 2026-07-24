/* ============================================================================
   Floating Island — WebGL prototype (Three.js r137, local build, no CDN)
   جزيرة صخرية عائمة تنمو عليها الأعشاب والزهور وتتدلّى منها النباتات

   Realism pass:
     • image-based lighting from a procedural sky (cirrus above, a cloud sea
       below), baked into an environment map with PMREMGenerator
     • cavity + sky occlusion baked into the rock's vertex colours, plus a
       bounce light standing in for the lit cloud deck underneath
     • curved, cross-sectioned grass blades with root occlusion and
       subsurface translucency (they glow when backlit)
     • vines hanging off the torn underside, drifting on the same wind
     • post chain: depth of field, bloom, film grade, vignette, grain, CA

   Everything is procedural so the prototype runs standalone. If
   ./assets/rock.glb exists (exported from Blender via blender/rock_garden.py)
   it replaces the procedural rock and the scattering runs on it unchanged.
   ========================================================================== */
(function () {
  'use strict';

  const { fbm3, ridged3 } = window.NM3D_NOISE;

  // ---------------------------------------------------------------- params
  const P = {
    grass: 30000,
    flowers: 900,
    wind: 1.0,
    autoRotate: true,
    timeOfDay: 0.28,       // 0 = dawn, 0.5 = noon, 1 = dusk
    quality: 'high',
    postfx: true
  };

  const PALETTES = {
    warm: [0xf2b93c, 0xef6d3a, 0xe8467a, 0xf0d9a8],
    cool: [0x74b7ec, 0x5a86e0, 0x9c6fe0, 0xbcd9f2],
    aj:   [0xe8b53f, 0xdb8a3a, 0xc0392b, 0xefdcb0]
  };
  let palette = PALETTES.warm;

  // ---------------------------------------------------------------- renderer
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  camera.position.set(4.6, 1.9, 5.8);

  // ------------------------------------------------------- orbit controller
  // Small hand-rolled controller: r137's OrbitControls isn't vendored here and
  // we do not pull anything off a CDN (network is restricted on the AJ side).
  const orbit = {
    target: new THREE.Vector3(0, -0.15, 0),
    theta: Math.atan2(camera.position.x, camera.position.z),
    phi: Math.acos(THREE.MathUtils.clamp(camera.position.y / camera.position.length(), -1, 1)),
    radius: camera.position.length(),
    dragging: false, px: 0, py: 0, vTheta: 0, vPhi: 0
  };

  function applyCamera() {
    orbit.phi = THREE.MathUtils.clamp(orbit.phi, 0.18, Math.PI * 0.86);  // you can look up at the keel
    orbit.radius = THREE.MathUtils.clamp(orbit.radius, 2.0, 16);
    const s = Math.sin(orbit.phi), r = orbit.radius;
    camera.position.set(
      orbit.target.x + r * s * Math.sin(orbit.theta),
      orbit.target.y + r * Math.cos(orbit.phi),
      orbit.target.z + r * s * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);
  }

  canvas.addEventListener('pointerdown', (e) => {
    orbit.dragging = true;
    orbit.px = e.clientX; orbit.py = e.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  window.addEventListener('pointermove', (e) => {
    if (!orbit.dragging) return;
    const dx = (e.clientX - orbit.px) / window.innerWidth;
    const dy = (e.clientY - orbit.py) / window.innerHeight;
    orbit.px = e.clientX; orbit.py = e.clientY;
    orbit.vTheta -= dx * 4.2;
    orbit.vPhi -= dy * 3.2;
  });
  window.addEventListener('pointerup', () => { orbit.dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.radius *= Math.pow(1.0015, e.deltaY);
    applyCamera();
  }, { passive: false });

  // ------------------------------------------------------------ the sky
  // A gradient dome with a real sun disc. It is both the visible background
  // and the source for image-based lighting, so sky and lighting always agree.
  const skyUniforms = {
    uZenith:  { value: new THREE.Color(0x0d1b2e) },
    uHorizon: { value: new THREE.Color(0x2b2a33) },
    uGround:  { value: new THREE.Color(0x8fa1b3) },
    uSunDir:  { value: new THREE.Vector3(0, 0.4, 1) },
    uSunCol:  { value: new THREE.Color(0xffb066) },
    uSunSize: { value: 0.035 },
    uTime:    { value: 0 }
  };

  function makeSkyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith, uHorizon, uGround, uSunCol;
        uniform vec3 uSunDir;
        uniform float uSunSize;
        uniform float uTime;
        varying vec3 vDir;

        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }
        float vnoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n000 = hash(i), n100 = hash(i + vec3(1,0,0));
          float n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
          float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1));
          float n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
          return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                     mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
        }
        float fbm(vec3 p) {
          float a = 0.5, s = 0.0, n = 0.0;
          for (int i = 0; i < 5; i++) { s += a * vnoise(p); n += a; p *= 2.03; a *= 0.5; }
          return s / n;
        }

        // Cloud layers are sampled on a plane the view ray hits — the ray
        // stretches near the horizon, which is exactly the perspective real
        // cloud decks have.
        float layer(vec3 d, float planeY, float scale, float drift, float coverage) {
          if (abs(d.y) < 0.02) return 0.0;
          vec3 hit = d * (planeY / d.y);
          float n = fbm(vec3(hit.x, hit.z, drift) * scale);
          float f = smoothstep(coverage, coverage + 0.22, n);
          // fade the layer out as it approaches the horizon line
          return f * smoothstep(0.02, 0.16, abs(d.y));
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 sun = normalize(uSunDir);
          float cosA = dot(d, sun);

          vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
          col = mix(uGround * 0.55, col, smoothstep(-0.55, 0.03, h));

          // sun disc + wide atmospheric halo
          float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, cosA);
          float halo = pow(max(cosA, 0.0), 26.0);
          col += uSunCol * (disc * 9.0 + halo * 0.85);
          float sunAz = pow(max(cosA, 0.0), 3.0) * (1.0 - smoothstep(0.0, 0.35, abs(h)));
          col += uSunCol * sunAz * 0.35;

          // --- high cirrus, thin and stretched
          float cirrus = layer(d, 26.0, 0.055, uTime * 0.004, 0.54) * step(0.0, h);
          // --- the cloud sea far below the island
          float seaFar = layer(d, -34.0, 0.030, uTime * 0.002, 0.30) * step(h, 0.0);
          float seaNear = layer(d, -18.0, 0.055, uTime * 0.003, 0.44) * step(h, 0.0);

          // clouds are lit from the sun's side and shadowed away from it
          float lit = clamp(cosA * 0.5 + 0.5, 0.0, 1.0);
          vec3 cloudLit = mix(uHorizon * 1.15, uSunCol * 1.25, pow(lit, 1.6));
          vec3 cloudDark = uHorizon * 0.55;

          col = mix(col, mix(cloudDark, cloudLit, 0.65), cirrus * 0.55);
          vec3 seaCol = mix(cloudDark * 1.1, cloudLit * 1.1, 0.7);
          col = mix(col, seaCol * 0.85, clamp(seaFar * 0.75, 0.0, 1.0));
          col = mix(col, seaCol, clamp(seaNear * 0.8, 0.0, 1.0));

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
  }

  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), makeSkyMaterial());
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  // separate copy of the dome for PMREM baking (fromScene wants its own scene)
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 24), makeSkyMaterial()));

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  let envRT = null;

  function bakeEnvironment() {
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(skyScene, 0, 0.5, 40);
    scene.environment = envRT.texture;
  }

  scene.fog = new THREE.FogExp2(0x131a20, 0.042);

  // ---------------------------------------------------------------- lighting
  const key = new THREE.DirectionalLight(0xfff0d0, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 26;
  key.shadow.camera.left = -3.6;
  key.shadow.camera.right = 3.6;
  key.shadow.camera.top = 3.6;
  key.shadow.camera.bottom = -3.6;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 2.2;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0x5f97d8, 0.35);
  fill.position.set(-3, 1.6, -3.2);
  scene.add(fill);

  // the cloud sea below is a huge white reflector — without this the keel
  // and the vines read as a black cut-out
  const bounce = new THREE.DirectionalLight(0xc2d4e4, 1.15);
  bounce.position.set(0.6, -5, 1.2);
  scene.add(bounce);

  const sunDir = new THREE.Vector3();

  function applyTimeOfDay(t) {
    // t: 0 dawn -> 0.5 noon -> 1 dusk
    const elev = Math.sin(t * Math.PI) * 0.88 + 0.06;
    const az = THREE.MathUtils.lerp(-1.0, 1.0, t) * Math.PI * 0.55;
    sunDir.set(Math.sin(az) * (1 - elev * 0.7), elev, Math.cos(az) * (1 - elev * 0.7)).normalize();

    key.position.copy(sunDir).multiplyScalar(9);
    key.target.position.set(0, 0.4, 0);
    key.target.updateMatrixWorld();

    const k = 1 - Math.abs(t - 0.5) * 2;                 // 0 at the edges, 1 at noon
    const low = new THREE.Color(0xff8f3c);               // low sun, heavily filtered
    const high = new THREE.Color(0xfff2dc);
    key.color.copy(low).lerp(high, k * k);
    key.intensity = 1.7 + k * 1.9;

    // sky tints: cold blue at noon, magenta-amber at the edges of the day
    const zenithDawn = new THREE.Color(0x1b2450);
    const zenithNoon = new THREE.Color(0x2f6ab0);
    const horizDawn = new THREE.Color(0x8a4c42);
    const horizNoon = new THREE.Color(0x9fb6c6);

    skyUniforms.uZenith.value.copy(zenithDawn).lerp(zenithNoon, k);
    skyUniforms.uHorizon.value.copy(horizDawn).lerp(horizNoon, k);
    skyUniforms.uGround.value.copy(skyUniforms.uHorizon.value).lerp(new THREE.Color(0xc9d6e2), 0.55);
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uSunCol.value.copy(low).lerp(high, k * k);
    skyUniforms.uSunSize.value = 0.028;

    fill.color.copy(skyUniforms.uZenith.value).multiplyScalar(2.2);
    fill.intensity = 0.55 - k * 0.2;
    bounce.color.copy(skyUniforms.uGround.value);
    bounce.intensity = 1.15 + k * 0.5;

    scene.fog.color.copy(skyUniforms.uHorizon.value).multiplyScalar(0.55);
    scene.fog.density = 0.050 - k * 0.014;

    bakeEnvironment();
  }

  // --------------------------------------------------------- the cloud sea
  // The island floats, so there is no ground — only a deck of cloud far below
  // and a few drifting mist sheets that pass under the rock.
  function cloudTexture(size, seedOffset) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size - 0.5) * 2, v = (y / size - 0.5) * 2;
        const d = Math.hypot(u, v);
        let a = fbm3(x / size * 4 + seedOffset, y / size * 4, seedOffset * 0.5, 5) * 0.5 + 0.5;
        a *= THREE.MathUtils.clamp(1 - d, 0, 1);            // fade to nothing at the edge
        a = Math.pow(THREE.MathUtils.clamp(a, 0, 1), 1.8);
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }


  const mistSheets = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(9 + i * 2.5, 9 + i * 2.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: cloudTexture(128, i * 7.3),
        transparent: true, opacity: 0.30 - i * 0.035,
        depthWrite: false, fog: true
      })
    );
    m.position.set((i % 2 ? 1 : -1) * (0.4 + i * 0.3), -1.1 - i * 0.85, (i % 3 - 1) * 0.6);
    m.renderOrder = 2;
    scene.add(m);
    mistSheets.push({ mesh: m, speed: 0.02 + i * 0.011, phase: i * 1.7 });
  }

  // everything that belongs to the island lives in this group, so the whole
  // thing can drift as one body
  const island = new THREE.Group();
  scene.add(island);

  // ------------------------------------------------------------ the island
  // occlusion is computed alongside the displacement: the same noise that
  // carves a crevice tells us how deep (and therefore how dark) it is
  let rockAO = null;

  function buildRock() {
    const geo = new THREE.IcosahedronGeometry(1, 56);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    rockAO = new Float32Array(pos.count);

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();

      const big = fbm3(n.x * 1.15, n.y * 1.15, n.z * 1.15, 3) * 0.30;
      const mid = (ridged3(n.x * 3.1, n.y * 3.1, n.z * 3.1, 4) - 0.5) * 0.20;
      const fine = fbm3(n.x * 9.0, n.y * 9.0, n.z * 9.0, 3) * 0.045;
      const micro = fbm3(n.x * 22.0, n.y * 22.0, n.z * 22.0, 2) * 0.012;

      // the underside is torn rock, so it gets far harsher fracturing
      const under = Math.max(0, -n.y);
      const tear = (ridged3(n.x * 5.4, n.y * 2.6 - 3.0, n.z * 5.4, 5) - 0.45) * 0.42 * Math.pow(under, 0.8);

      const rSmooth = 1.0 + big;
      const r = rSmooth + mid + fine + micro + tear;

      // below the smoothed surface = inside a crevice = occluded
      rockAO[i] = THREE.MathUtils.clamp(0.5 + (r - rSmooth) * 4.5, 0.12, 1.0);

      v.copy(n).multiplyScalar(r);
      v.y *= 0.72;
      v.x *= 1.12;
      v.y += 0.12 * v.x;

      // pull the underside down into a hanging keel: the deeper a point sits,
      // the further it is drawn toward the tip and the tighter it pinches in
      if (n.y < 0) {
        const t = Math.pow(Math.max(0, -n.y), 1.35);
        const pinch = 1.0 - 0.72 * t;
        v.x *= pinch;
        v.z *= pinch;
        v.y -= t * 1.85;
        // spiral grooves down the keel, like water-worn stone
        const swirl = Math.sin(Math.atan2(v.z, v.x) * 4.0 + v.y * 3.2) * 0.045 * t;
        v.x += swirl; v.z += swirl;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function paintRock(geo) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);

    const stone = new THREE.Color(0x8a7f6e);
    const pale = new THREE.Color(0xa89e8d);    // sun-bleached upper faces
    const dark = new THREE.Color(0x342c23);
    const moss = new THREE.Color(0x4a6329);
    const soil = new THREE.Color(0x3b2b1c);     // earth band under the turf
    const ochre = new THREE.Color(0x9a7345);    // exposed, weathered underside
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const up = nor.getY(i);
      const grain = fbm3(x * 6.5, y * 6.5, z * 6.5, 4) * 0.5 + 0.5;
      const veins = ridged3(x * 14.0, y * 14.0, z * 14.0, 3);

      c.copy(dark).lerp(stone, THREE.MathUtils.clamp(grain * 1.4, 0, 1));
      c.lerp(pale, THREE.MathUtils.clamp((up - 0.2) * 0.55, 0, 1) * grain);
      c.lerp(dark, THREE.MathUtils.clamp(veins - 0.55, 0, 1) * 0.6);   // mineral veining

      // torn underside: oxidised, ochre-stained rock with no moss on it
      const under = THREE.MathUtils.smoothstep(y, 0.15, -0.9);
      c.lerp(ochre, under * (0.22 + grain * 0.26));

      // soil band where the turf ends and the cliff begins
      const rim = THREE.MathUtils.smoothstep(y, 0.34, 0.06) *
        THREE.MathUtils.smoothstep(y, -0.55, -0.05);
      c.lerp(soil, rim * 0.75);

      const mossMask = THREE.MathUtils.smoothstep(up, 0.12, 0.72) *
        THREE.MathUtils.smoothstep(fbm3(x * 2.4 + 11, y * 2.4, z * 2.4, 3) * 0.5 + 0.5, 0.35, 0.8) *
        (1.0 - under);
      c.lerp(moss, mossMask * 0.8);

      // bake occlusion: crevice depth × how much sky the face can see
      const skyAO = 0.42 + 0.58 * THREE.MathUtils.smoothstep(up, -0.35, 0.85);
      const ao = Math.pow(rockAO[i], 1.25) * skyAO;
      c.multiplyScalar(0.52 + 0.48 * ao);

      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  const rockMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, envMapIntensity: 1.15
  });
  // Surface detail lives in the shader, not in the mesh: the geometry only
  // carries the boulder's shape, while grain, pitting and hairline cracks are
  // evaluated per pixel from world position. That keeps detail sharp no matter
  // how close the camera gets, and needs no UVs on an icosphere (which has
  // terrible ones).
  const ROCK_NOISE_GLSL = `
    float rk_hash(vec3 p) {
      return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
    }
    float rk_noise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(rk_hash(i), rk_hash(i + vec3(1,0,0)), f.x),
                     mix(rk_hash(i + vec3(0,1,0)), rk_hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(rk_hash(i + vec3(0,0,1)), rk_hash(i + vec3(1,0,1)), f.x),
                     mix(rk_hash(i + vec3(0,1,1)), rk_hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float rk_fbm(vec3 p) {
      float a = 0.5, s = 0.0, n = 0.0;
      for (int i = 0; i < 4; i++) { s += a * rk_noise(p); n += a; p *= 2.11; a *= 0.5; }
      return s / n;
    }
    // grain + coarse pitting + sharp hairline cracks
    float rk_height(vec3 p) {
      float grain = rk_fbm(p * 34.0);
      float pits = rk_fbm(p * 9.0);
      float crack = 1.0 - abs(rk_fbm(p * 5.5) * 2.0 - 1.0);
      crack = pow(clamp(crack, 0.0, 1.0), 7.0);
      return grain * 0.45 + pits * 0.55 - crack * 0.9;
    }
  `;

  rockMat.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      varying vec3 vRockPos;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vRockPos = transformed;
      `
    );

    shader.fragmentShader = `
      varying vec3 vRockPos;
      ${ROCK_NOISE_GLSL}
      ${shader.fragmentShader}
    `.replace(
      '#include <normal_fragment_begin>',
      `
      #include <normal_fragment_begin>
      {
        // finite-difference the height field to get a real bump normal
        float e = 0.0045;
        float h0 = rk_height(vRockPos);
        vec3 grad = vec3(
          rk_height(vRockPos + vec3(e, 0.0, 0.0)) - h0,
          rk_height(vRockPos + vec3(0.0, e, 0.0)) - h0,
          rk_height(vRockPos + vec3(0.0, 0.0, e)) - h0
        ) / e;
        // normalMatrix is vertex-stage only; the island barely rotates, so the
        // view matrix is an accurate enough object → view transform here
        vec3 vg = (viewMatrix * vec4(grad, 0.0)).xyz;
        vg -= normal * dot(normal, vg);
        normal = normalize(normal - vg * 0.055);
      }
      `
    ).replace(
      '#include <roughnessmap_fragment>',
      `
      #include <roughnessmap_fragment>
      float rkGrain = rk_fbm(vRockPos * 34.0);
      float rkCrack = pow(clamp(1.0 - abs(rk_fbm(vRockPos * 5.5) * 2.0 - 1.0), 0.0, 1.0), 7.0);
      float lum = dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      // damp crevices read glossier than dry, sun-bleached tops
      roughnessFactor = mix(0.70, 1.0, smoothstep(0.02, 0.35, lum));
      roughnessFactor = clamp(roughnessFactor - rkGrain * 0.12 + rkCrack * 0.1, 0.25, 1.0);
      `
    ).replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      // speckled mineral grain, and cracks that swallow light
      float rkSpeck = rk_fbm(vRockPos * 60.0);
      rkSpeck = mix(rkSpeck, 0.5, smoothstep(-0.3, -1.4, vRockPos.y));
      diffuseColor.rgb *= 0.86 + rkSpeck * 0.28;
      diffuseColor.rgb *= 1.0 - pow(clamp(1.0 - abs(rk_fbm(vRockPos * 5.5) * 2.0 - 1.0), 0.0, 1.0), 7.0) * 0.45;
      `
    );
  };

  const rock = new THREE.Mesh(buildRock(), rockMat);
  paintRock(rock.geometry);
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.position.y = 0.30;
  island.add(rock);

  // ------------------------------------------------- distant sister islands
  // Same silhouette at a fraction of the size, deep in the haze — they give
  // the main island a sense of scale and altitude.
  (function buildDistantIslands() {
    const src = rock.geometry;
    const spots = [
      { x: -11.0, y: 3.2, z: -15.0, s: 0.7, rot: 0.7 },
      { x: 16.0, y: -2.4, z: -19.0, s: 1.1, rot: 2.1 },
      { x: -19.0, y: -5.0, z: 7.0, s: 0.9, rot: 4.4 },
      { x: 9.0, y: 5.2, z: -28.0, s: 1.6, rot: 5.2 },
      { x: -6.0, y: -7.5, z: -23.0, s: 1.3, rot: 3.1 }
    ];
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.98, metalness: 0.0, envMapIntensity: 0.9
    });
    spots.forEach((s) => {
      const m = new THREE.Mesh(src, mat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.set(0.12, s.rot, -0.08);
      m.scale.setScalar(s.s);
      scene.add(m);
    });
  })();

  // ------------------------------------------------ scatter points on a mesh
  function buildSampler(geometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position;
    const triCount = pos.count / 3;
    const cdf = new Float32Array(triCount);
    const normals = new Float32Array(triCount * 3);

    const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3();
    let total = 0;

    for (let t = 0; t < triCount; t++) {
      a.fromBufferAttribute(pos, t * 3);
      b.fromBufferAttribute(pos, t * 3 + 1);
      cc.fromBufferAttribute(pos, t * 3 + 2);
      ab.subVectors(b, a); ac.subVectors(cc, a);
      nrm.crossVectors(ab, ac);
      const area = nrm.length() * 0.5;
      nrm.normalize();
      normals[t * 3] = nrm.x; normals[t * 3 + 1] = nrm.y; normals[t * 3 + 2] = nrm.z;
      total += area;
      cdf[t] = total;
    }

    return {
      // mode 'top'   — upward-facing ledges (turf, flowers)
      // mode 'under' — the torn underside (hanging vines)
      sample(rand, out, outNormal, mode) {
        for (let attempt = 0; attempt < 24; attempt++) {
          const target = rand() * total;
          let lo = 0, hi = triCount - 1;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < target) lo = mid + 1; else hi = mid; }
          const t = lo;
          const ny = normals[t * 3 + 1];
          if (mode === 'under') {
            if (ny > -0.05) continue;                    // must face downward
          } else {
            if (ny < 0.34) continue;                     // too steep — nothing grows
            if (rand() > Math.pow(ny, 1.6)) continue;    // favour flatter ledges
          }

          let u = rand(), v = rand();
          if (u + v > 1) { u = 1 - u; v = 1 - v; }
          a.fromBufferAttribute(pos, t * 3);
          b.fromBufferAttribute(pos, t * 3 + 1);
          cc.fromBufferAttribute(pos, t * 3 + 2);
          ab.subVectors(b, a); ac.subVectors(cc, a);
          out.copy(a).addScaledVector(ab, u).addScaledVector(ac, v);
          outNormal.set(normals[t * 3], ny, normals[t * 3 + 2]);
          return true;
        }
        return false;
      }
    };
  }

  function makeRand(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  // ---------------------------------------------------------- grass geometry
  function bladeGeometry(segments, opts) {
    // Three columns of vertices so the blade has a rounded cross-section —
    // that curvature is what makes light travel along a blade instead of
    // flat-shading it. The blade also arcs forward and tapers to a point.
    opts = opts || {};
    const w = opts.width != null ? opts.width : 0.0032;
    const h = 1.0;
    const arc = opts.arc != null ? opts.arc : 0.42;
    const verts = [], uvs = [], idx = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const taper = Math.pow(1 - t, 0.7);
      const y = t * h;
      const bend = arc * t * t;              // gravity droop
      const rise = w * 0.75 * taper;         // spine of the blade
      verts.push(-w * taper, y, bend, 0, y, bend + rise, w * taper, y, bend);
      uvs.push(0, t, 0.5, t, 1, t);
    }
    for (let i = 0; i < segments; i++) {
      const o = i * 3;
      idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4);       // left half
      idx.push(o + 1, o + 4, o + 2, o + 2, o + 4, o + 5);   // right half
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const windUniforms = {
    uTime: { value: 0 },
    uWind: { value: P.wind }
  };

  // Wind in the vertex shader, root occlusion + subsurface translucency in the
  // fragment shader. Nothing here costs CPU time per blade.
  function makePlantMaterial(base, opts) {
    opts = opts || {};
    const rootAO = opts.rootAO != null ? opts.rootAO : 0.24;
    const sss = opts.sss != null ? opts.sss : 0.9;
    const mat = new THREE.MeshStandardMaterial(base);

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.uWind = windUniforms.uWind;
      shader.uniforms.uRootAO = { value: rootAO };
      shader.uniforms.uSSS = { value: sss };

      shader.vertexShader = `
        uniform float uTime;
        uniform float uWind;
        varying float vT;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vT = uv.y;
        float swayAmt = pow(uv.y, 1.6) * uWind;
        vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        float phase = wp.x * 2.7 + wp.z * 3.1;
        float gust = sin(uTime * 0.55 + phase * 0.28) * 0.5 + 0.5;
        float s = sin(uTime * 2.1 + phase) * 0.055 + sin(uTime * 5.3 + phase * 1.7) * 0.018;
        transformed.x += s * swayAmt * (0.45 + gust);
        transformed.z += s * 0.6 * swayAmt * (0.45 + gust);
        transformed.y -= abs(s) * swayAmt * 0.25;
        `
      );

      shader.fragmentShader = `
        uniform float uRootAO;
        uniform float uSSS;
        varying float vT;
        ${shader.fragmentShader}
      `.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // light does not reach the base of a clump
        diffuseColor.rgb *= mix(uRootAO, 1.0, smoothstep(0.0, 0.55, vT));
        `
      ).replace(
        '#include <lights_fragment_end>',
        `
        #include <lights_fragment_end>
        #if ( NUM_DIR_LIGHTS > 0 )
        {
          vec3 viewDir = normalize(vViewPosition);
          for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
            // backlit leaves transmit light — the effect that sells grass
            float trans = pow(clamp(dot(viewDir, -directionalLights[i].direction), 0.0, 1.0), 3.0);
            float wrap = clamp((dot(normal, directionalLights[i].direction) + 0.6) / 1.6, 0.0, 1.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[i].color *
              (trans * uSSS * vT + wrap * 0.12);
          }
        }
        #endif
        `
      );
    };
    return mat;
  }

  // --------------------------------------------------------------- scatter
  let grassMesh = null, flowerMesh = null, stemMesh = null, hangingVines = null;
  let broadLeaves = null, pebbles = null;

  function clearScatter() {
    [grassMesh, flowerMesh, stemMesh, hangingVines, broadLeaves, pebbles].forEach((m) => {
      if (!m) return;
      island.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    grassMesh = flowerMesh = stemMesh = hangingVines = broadLeaves = pebbles = null;
  }

  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  function scatter(targetMesh, grassCount, flowerCount) {
    clearScatter();

    const sampler = buildSampler(targetMesh.geometry);
    const rand = makeRand(20260724);
    const p = new THREE.Vector3(), n = new THREE.Vector3();

    // ---- grass on the rock ----
    const gGeo = bladeGeometry(6);
    const gMat = makePlantMaterial({
      color: 0xffffff, roughness: 0.62, metalness: 0.0,
      side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.5
    }, { rootAO: 0.20, sss: 1.15 });

    grassMesh = new THREE.InstancedMesh(gGeo, gMat, grassCount);
    grassMesh.castShadow = true;
    grassMesh.receiveShadow = true;

    const gColors = new Float32Array(grassCount * 3);
    const cBlade = new THREE.Color();
    const dry = new THREE.Color(0x8d8340);
    const fresh = new THREE.Color(0x43762a);
    const deep = new THREE.Color(0x223d17);

    // Grass does not grow one blade at a time — it grows in tufts. Each tuft
    // gets a shared colour and a splayed fan of blades, tallest at the centre.
    // That structure, more than blade count, is what reads as real turf.
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), off = new THREE.Vector3();

    // broad, drooping leaves — a second species mixed through the turf
    const leafBudget = Math.round(grassCount * 0.03);
    const lGeo = bladeGeometry(6, { width: 0.0055, arc: 0.8 });
    const lMat = makePlantMaterial({
      color: 0xffffff, roughness: 0.55, metalness: 0.0,
      side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.55
    }, { rootAO: 0.22, sss: 1.25 });
    broadLeaves = new THREE.InstancedMesh(lGeo, lMat, leafBudget);
    broadLeaves.castShadow = true;
    broadLeaves.receiveShadow = true;
    const lColors = new Float32Array(leafBudget * 3);
    let lPlaced = 0;

    let placed = 0;
    const tuftTarget = Math.ceil(grassCount / 7);

    for (let tuft = 0; tuft < tuftTarget && placed < grassCount; tuft++) {
      if (!sampler.sample(rand, p, n)) continue;

      const clump = fbm3(p.x * 5.5, p.y * 5.5, p.z * 5.5, 3) * 0.5 + 0.5;
      if (rand() > Math.pow(clump, 1.1) * 1.35) continue;

      // tangent frame on the surface, so a tuft spreads across the rock face
      t1.set(0, 1, 0).cross(n);
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0);
      t1.normalize();
      t2.crossVectors(n, t1).normalize();

      const blades = 4 + Math.floor(rand() * 7);
      const spread = 0.018 + rand() * 0.045;
      const tuftHeight = 0.085 + rand() * 0.085 + clump * 0.07;

      // one hue per tuft, with only slight per-blade drift
      cBlade.copy(deep).lerp(fresh, clump * (0.6 + rand() * 0.5));
      cBlade.lerp(dry, Math.pow(rand(), 3.0) * 0.5);
      const tuftR = cBlade.r, tuftG = cBlade.g, tuftB = cBlade.b;

      for (let b = 0; b < blades && placed < grassCount; b++) {
        const a = rand() * Math.PI * 2;
        const rr = Math.pow(rand(), 0.65);          // denser toward the centre
        off.copy(t1).multiplyScalar(Math.cos(a) * rr * spread)
          .addScaledVector(t2, Math.sin(a) * rr * spread);

        dummy.position.copy(p).add(off).add(targetMesh.position);
        q.setFromUnitVectors(upVec, n);
        dummy.quaternion.copy(q);
        dummy.rotateY(a + (rand() - 0.5) * 0.9);
        // blades splay outward the further they sit from the tuft centre
        dummy.rotateX(rr * 0.55 + (rand() - 0.5) * 0.25);
        dummy.rotateZ((rand() - 0.5) * 0.3);

        const h = tuftHeight * (1.05 - rr * 0.45) * (0.8 + rand() * 0.4);
        const wsc = 0.7 + rand() * 0.7;
        dummy.scale.set(wsc, h, h * (0.75 + rand() * 0.6));
        dummy.updateMatrix();

        const isLeaf = lPlaced < leafBudget && rand() < 0.03;
        if (isLeaf) {
          broadLeaves.setMatrixAt(lPlaced, dummy.matrix);
          lColors[lPlaced * 3] = tuftR * 0.82;
          lColors[lPlaced * 3 + 1] = tuftG * 0.90;
          lColors[lPlaced * 3 + 2] = tuftB * 0.78;
          lPlaced++;
        } else {
          grassMesh.setMatrixAt(placed, dummy.matrix);
          const j = 0.88 + rand() * 0.26;
          gColors[placed * 3] = tuftR * j;
          gColors[placed * 3 + 1] = tuftG * j;
          gColors[placed * 3 + 2] = tuftB * j;
          placed++;
        }
      }
    }
    grassMesh.count = placed;
    gGeo.setAttribute('color', new THREE.InstancedBufferAttribute(gColors, 3));
    island.add(grassMesh);

    broadLeaves.count = lPlaced;
    lGeo.setAttribute('color', new THREE.InstancedBufferAttribute(lColors, 3));
    island.add(broadLeaves);

    // ---- loose pebbles and grit caught in the turf ----
    const pebbleBudget = Math.round(grassCount * 0.02);
    const pebGeo = new THREE.IcosahedronGeometry(1, 1);
    {
      // squash each pebble so they don't read as identical balls
      const pp = pebGeo.attributes.position;
      for (let i = 0; i < pp.count; i++) {
        pp.setXYZ(i, pp.getX(i) * 1.15, pp.getY(i) * 0.62, pp.getZ(i) * 0.92);
      }
      pebGeo.computeVertexNormals();
    }
    pebbles = new THREE.InstancedMesh(pebGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0.0, envMapIntensity: 1.0
    }), pebbleBudget);
    pebbles.castShadow = true;
    pebbles.receiveShadow = true;
    const pebColors = new Float32Array(pebbleBudget * 3);
    const cPeb = new THREE.Color();
    let pebPlaced = 0;

    for (let i = 0; i < pebbleBudget; i++) {
      if (!sampler.sample(rand, p, n)) continue;
      if (rand() < 0.45) continue;
      dummy.position.copy(p).add(targetMesh.position);
      q.setFromUnitVectors(upVec, n);
      dummy.quaternion.copy(q);
      dummy.rotateY(rand() * Math.PI * 2);
      dummy.rotateX((rand() - 0.5) * 0.8);
      const sc = 0.006 + Math.pow(rand(), 2.2) * 0.030;
      dummy.scale.set(sc * (0.8 + rand() * 0.5), sc, sc * (0.8 + rand() * 0.5));
      dummy.updateMatrix();
      pebbles.setMatrixAt(pebPlaced, dummy.matrix);

      cPeb.setHex(0x6b6156).offsetHSL(0, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.22);
      pebColors[pebPlaced * 3] = cPeb.r;
      pebColors[pebPlaced * 3 + 1] = cPeb.g;
      pebColors[pebPlaced * 3 + 2] = cPeb.b;
      pebPlaced++;
    }
    pebbles.count = pebPlaced;
    pebGeo.setAttribute('color', new THREE.InstancedBufferAttribute(pebColors, 3));
    island.add(pebbles);

    // ---- vines hanging off the torn underside ----
    // Same blade geometry, flipped to grow downward: the wind shader already
    // drives sway from uv.y, so the tips trail while the anchor stays put.
    const vineCount = Math.round(grassCount * 0.16);
    const vGeo = bladeGeometry(10, { width: 0.0042, arc: 0.62 });
    const vMat = makePlantMaterial({
      color: 0xffffff, roughness: 0.72, metalness: 0.0,
      side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.45
    }, { rootAO: 0.30, sss: 1.35 });

    hangingVines = new THREE.InstancedMesh(vGeo, vMat, vineCount);
    hangingVines.castShadow = true;
    const vColors = new Float32Array(vineCount * 3);
    const vine = new THREE.Color();
    const vineGreen = new THREE.Color(0x3a5c26);
    const vineDry = new THREE.Color(0x5d5330);
    const down = new THREE.Vector3(0, -1, 0);

    let vPlaced = 0;
    for (let i = 0; i < vineCount; i++) {
      if (!sampler.sample(rand, p, n, 'under')) continue;

      // vines cluster near the rim and thin out toward the tip of the keel
      const depth = THREE.MathUtils.clamp((0.1 - p.y) / 1.9, 0, 1);
      if (rand() < depth * 0.85) continue;      // almost nothing survives near the tip

      const clump = fbm3(p.x * 4.0 + 7, p.y * 4.0, p.z * 4.0, 3) * 0.5 + 0.5;
      if (rand() > Math.pow(clump, 1.3) * 1.2) continue;

      dummy.position.copy(p).add(targetMesh.position);
      // hang along gravity, tilted slightly toward the surface normal
      q.setFromUnitVectors(upVec, down.clone().lerp(n, 0.28).normalize());
      dummy.quaternion.copy(q);
      dummy.rotateY(rand() * Math.PI * 2);

      const len = 0.30 + Math.pow(rand(), 1.4) * 1.5 * (1.0 - depth * 0.4);
      const wsc = 0.30 + rand() * 0.45;
      dummy.scale.set(wsc, len, len * (0.5 + rand() * 0.5));
      dummy.updateMatrix();
      hangingVines.setMatrixAt(vPlaced, dummy.matrix);

      vine.copy(vineGreen).lerp(vineDry, Math.pow(rand(), 2.0) * 0.55 + depth * 0.2);
      vine.multiplyScalar(0.8 + rand() * 0.3);
      vColors[vPlaced * 3] = vine.r;
      vColors[vPlaced * 3 + 1] = vine.g;
      vColors[vPlaced * 3 + 2] = vine.b;
      vPlaced++;
    }
    hangingVines.count = vPlaced;
    vGeo.setAttribute('color', new THREE.InstancedBufferAttribute(vColors, 3));
    island.add(hangingVines);

    // ---- flowers: stem + petal head ----
    const stemGeo = bladeGeometry(5);
    const stemMat = makePlantMaterial({
      color: 0x5f7f3c, roughness: 0.7, side: THREE.DoubleSide, envMapIntensity: 0.5
    }, { rootAO: 0.3, sss: 0.7 });
    stemMesh = new THREE.InstancedMesh(stemGeo, stemMat, flowerCount);
    stemMesh.castShadow = true;

    const headGeo = flowerHeadGeometry();
    const headMat = makePlantMaterial({
      color: 0xffffff, roughness: 0.5, metalness: 0.0,
      side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.7
    }, { rootAO: 0.55, sss: 1.6 });
    flowerMesh = new THREE.InstancedMesh(headGeo, headMat, flowerCount);
    flowerMesh.castShadow = true;

    const fColors = new Float32Array(flowerCount * 3);
    const cF = new THREE.Color();
    let fPlaced = 0;

    for (let i = 0; i < flowerCount; i++) {
      if (!sampler.sample(rand, p, n)) continue;
      const clump = fbm3(p.x * 3.2 + 40, p.y * 3.2, p.z * 3.2, 3) * 0.5 + 0.5;
      if (rand() > clump * 0.9) continue;

      const height = 0.13 + rand() * 0.12;
      dummy.position.copy(p).add(targetMesh.position);
      q.setFromUnitVectors(upVec, n);
      dummy.quaternion.copy(q);
      dummy.rotateY(rand() * Math.PI * 2);
      dummy.rotateX((rand() - 0.5) * 0.3);
      dummy.scale.set(0.8, height, height);
      dummy.updateMatrix();
      stemMesh.setMatrixAt(fPlaced, dummy.matrix);

      const tip = new THREE.Vector3(0, height, 0).applyQuaternion(dummy.quaternion);
      dummy.position.add(tip);
      dummy.rotateX((rand() - 0.5) * 0.6);                  // heads nod
      dummy.rotateZ((rand() - 0.5) * 0.6);
      dummy.scale.setScalar(0.026 + rand() * 0.022);
      dummy.updateMatrix();
      flowerMesh.setMatrixAt(fPlaced, dummy.matrix);

      cF.setHex(palette[(rand() * palette.length) | 0]);
      cF.offsetHSL((rand() - 0.5) * 0.04, 0.05, (rand() - 0.5) * 0.10);
      cF.multiplyScalar(0.85);
      fColors[fPlaced * 3] = cF.r;
      fColors[fPlaced * 3 + 1] = cF.g;
      fColors[fPlaced * 3 + 2] = cF.b;
      fPlaced++;
    }
    stemMesh.count = fPlaced;
    flowerMesh.count = fPlaced;
    headGeo.setAttribute('color', new THREE.InstancedBufferAttribute(fColors, 3));
    island.add(stemMesh, flowerMesh);

    updateStats(placed + lPlaced, fPlaced, vPlaced);
  }

  function flowerHeadGeometry() {
    // 6 cupped petals around a centre disc. uv.y drives the shader's root
    // occlusion, so petal roots sit darker than their tips.
    const petals = 6, seg = 7, verts = [], uvs = [], idx = [];
    const push = (x, y, z, u, v) => { verts.push(x, y, z); uvs.push(u, v); return verts.length / 3 - 1; };

    for (let i = 0; i < petals; i++) {
      const dir = (i / petals) * Math.PI * 2;
      const cx = Math.cos(dir), cz = Math.sin(dir);
      const dist = 0.62, len = 0.46, wide = 0.30;
      const base = push(cx * 0.12, 0.02, cz * 0.12, 0.5, 0.55);
      const ring = [];
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        const ex = Math.cos(a) * len;
        const ez = Math.sin(a) * wide;
        const px = cx * (dist + ex) - cz * ez;
        const pz = cz * (dist + ex) + cx * ez;
        const cup = 0.16 * (1 - Math.cos(a) * 0.5);
        ring.push(push(px, 0.04 + cup, pz, 0.5 + ez, 1.0));
      }
      for (let s = 0; s < seg; s++) idx.push(base, ring[s], ring[s + 1]);
    }

    const centre = push(0, 0.08, 0, 0.5, 0.35);
    const cRing = [];
    for (let s = 0; s <= 10; s++) {
      const a = (s / 10) * Math.PI * 2;
      cRing.push(push(Math.cos(a) * 0.26, 0.03, Math.sin(a) * 0.26, 0.5, 0.3));
    }
    for (let s = 0; s < 10; s++) idx.push(centre, cRing[s], cRing[s + 1]);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ------------------------------------------------------------ pollen motes
  function buildPollen(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const rand = makeRand(99);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.6 + rand() * 3.2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.05 + rand() * 2.0;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = rand() * 100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: windUniforms.uTime, uPixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y += sin(uTime * 0.35 + aSeed) * 0.3 + mod(uTime * 0.05 + aSeed * 0.1, 1.0) * 0.5;
          p.x += sin(uTime * 0.5 + aSeed * 1.7) * 0.16;
          p.z += cos(uTime * 0.42 + aSeed * 2.3) * 0.16;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vAlpha = smoothstep(0.0, 1.0, p.y) * (0.3 + 0.4 * sin(uTime + aSeed * 3.0));
          gl_PointSize = (9.0 * uPixelRatio) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.68), a);
        }
      `
    });
    return new THREE.Points(geo, mat);
  }
  const pollen = buildPollen(500);
  scene.add(pollen);

  // ------------------------------------------------------------------- post
  const post = new window.NM3D_PostFX(renderer, scene, camera);

  // ---------------------------------------------------------------- optional
  let blenderRock = null;
  function activeRock() { return blenderRock || rock; }

  function tryLoadBlenderRock() {
    if (typeof THREE.GLTFLoader !== 'function') return;
    new THREE.GLTFLoader().load('./assets/rock.glb', (gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      if (!mesh) return;
      mesh.geometry.computeVertexNormals();
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.copy(rock.position);
      island.remove(rock);
      island.add(mesh);
      blenderRock = mesh;
      scatter(mesh, P.grass, P.flowers);
      setStatus('rock.glb (Blender) loaded');
    }, undefined, () => { /* no GLB yet — the procedural rock stays */ });
  }

  // ------------------------------------------------------------------- UI
  function setStatus(txt) {
    const el = document.getElementById('status');
    if (el) el.textContent = txt;
  }
  function updateStats(g, f, v) {
    const el = document.getElementById('stats');
    if (el) el.innerHTML =
      `<span>Grass <b>${g.toLocaleString('en-US')}</b></span>` +
      `<span>Flowers <b>${f.toLocaleString('en-US')}</b></span>` +
      `<span>Vines <b>${(v || 0).toLocaleString('en-US')}</b></span>`;
  }

  function applyQuality() {
    const high = P.quality === 'high';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1));
    key.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    post.enabled = P.postfx && high;
    resize();
  }

  function bindUI() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => fn(el));
    };
    let t1, t2;

    on('grassRange', (el) => {
      P.grass = +el.value;
      document.getElementById('grassVal').textContent = P.grass.toLocaleString('en-US');
      clearTimeout(t1);
      t1 = setTimeout(() => scatter(activeRock(), P.grass, P.flowers), 160);
    });
    on('flowerRange', (el) => {
      P.flowers = +el.value;
      document.getElementById('flowerVal').textContent = P.flowers.toLocaleString('en-US');
      clearTimeout(t2);
      t2 = setTimeout(() => scatter(activeRock(), P.grass, P.flowers), 160);
    });
    on('windRange', (el) => {
      P.wind = +el.value / 100;
      windUniforms.uWind.value = P.wind;
      document.getElementById('windVal').textContent = Math.round(P.wind * 100) + '%';
    });
    on('todRange', (el) => {
      P.timeOfDay = +el.value / 100;
      applyTimeOfDay(P.timeOfDay);
      document.getElementById('todVal').textContent =
        P.timeOfDay < 0.3 ? 'Sunrise' : P.timeOfDay > 0.7 ? 'Sunset' : 'Midday';
    });

    document.querySelectorAll('[data-palette]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-palette]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        palette = PALETTES[btn.dataset.palette] || PALETTES.warm;
        scatter(activeRock(), P.grass, P.flowers);
      });
    });

    const rot = document.getElementById('rotBtn');
    if (rot) rot.addEventListener('click', () => {
      P.autoRotate = !P.autoRotate;
      rot.classList.toggle('active', P.autoRotate);
      rot.textContent = P.autoRotate ? 'Stop rotation' : 'Start rotation';
    });

    const fx = document.getElementById('fxBtn');
    if (fx) fx.addEventListener('click', () => {
      P.postfx = !P.postfx;
      fx.classList.toggle('active', P.postfx);
      fx.textContent = P.postfx ? 'Cinematic FX: on' : 'Cinematic FX: off';
      applyQuality();
    });

    const qb = document.getElementById('qualityBtn');
    if (qb) qb.addEventListener('click', () => {
      P.quality = P.quality === 'high' ? 'perf' : 'high';
      qb.textContent = P.quality === 'high' ? 'Quality: high' : 'Quality: fast';
      qb.classList.toggle('active', P.quality === 'high');
      applyQuality();
    });

    const shot = document.getElementById('shotBtn');
    if (shot) shot.addEventListener('click', () => {
      post.render(windUniforms.uTime.value);
      const a = document.createElement('a');
      a.download = 'rock-garden.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    });
  }

  // ------------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsFrames = 0;

  const BASE_FOV = 38;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // portrait/broadcast-vertical: widen the vertical FOV so the rock still
    // frames properly instead of filling the screen
    if (camera.aspect < 1) {
      const halfH = Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2);
      const target = Math.min(halfH / camera.aspect, Math.tan(THREE.MathUtils.degToRad(58) / 2));
      camera.fov = THREE.MathUtils.radToDeg(Math.atan(target) * 2);
    } else {
      camera.fov = BASE_FOV;
    }
    camera.updateProjectionMatrix();
    post.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    windUniforms.uTime.value += dt;
    skyUniforms.uTime.value += dt;

    // the island is not bolted down: it rises, falls and yaws very slowly
    const t = windUniforms.uTime.value;
    island.position.y = Math.sin(t * 0.24) * 0.045 + Math.sin(t * 0.11 + 1.3) * 0.025;
    island.rotation.z = Math.sin(t * 0.17) * 0.012;
    island.rotation.x = Math.sin(t * 0.13 + 2.1) * 0.010;
    island.rotation.y += dt * 0.008;

    for (let i = 0; i < mistSheets.length; i++) {
      const m = mistSheets[i];
      m.mesh.rotation.y = t * m.speed + m.phase;
      m.mesh.position.x = Math.sin(t * m.speed * 1.7 + m.phase) * 0.9;
      m.mesh.position.z = Math.cos(t * m.speed * 1.3 + m.phase) * 0.9;
    }

    if (P.autoRotate && !orbit.dragging) orbit.theta += dt * 0.06;
    orbit.theta += orbit.vTheta * dt * 6;
    orbit.phi += orbit.vPhi * dt * 6;
    orbit.vTheta *= 0.86;
    orbit.vPhi *= 0.86;
    applyCamera();

    // keep the rock in focus, everything nearer/further falls off
    // where is the sun on screen, and is it actually in shot?
    const sunWorld = sunDir.clone().multiplyScalar(60).project(camera);
    const camFwd = new THREE.Vector3();
    camera.getWorldDirection(camFwd);
    const facing = camFwd.dot(sunDir);
    const inFrame = Math.max(Math.abs(sunWorld.x), Math.abs(sunWorld.y));
    post.composite.mat.uniforms.uSunScreen.value.set(sunWorld.x * 0.5 + 0.5, sunWorld.y * 0.5 + 0.5);
    post.composite.mat.uniforms.uShaft.value =
      facing > 0 ? THREE.MathUtils.clamp(1.0 - (inFrame - 0.6) / 0.9, 0, 1) * 0.75 : 0;

    post.composite.mat.uniforms.uFocus.value = camera.position.distanceTo(orbit.target);
    post.composite.mat.uniforms.uRange.value = Math.max(1.6, orbit.radius * 0.35);
    post.render(windUniforms.uTime.value);

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 0.5) {
      const el = document.getElementById('fps');
      if (el) el.textContent = Math.round(fpsFrames / fpsAcc) + ' fps';
      fpsAcc = 0; fpsFrames = 0;
    }
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------ boot
  applyTimeOfDay(P.timeOfDay);
  resize();
  applyCamera();
  applyQuality();
  scatter(rock, P.grass, P.flowers);
  bindUI();
  setStatus('Procedural rock');
  tryLoadBlenderRock();
  tick();

  window.NM3D = { scene, camera, renderer, post, P, orbit, applyCamera, scatter, activeRock };
})();
