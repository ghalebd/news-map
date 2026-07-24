/* ============================================================================
   Rock Garden — WebGL prototype (Three.js r137, local build, no CDN)
   صخرة فنية تنمو عليها زهور وأعشاب

   Everything here is procedural so the prototype runs standalone.
   If ./assets/rock.glb exists (exported from Blender via blender/rock_garden.py)
   it is loaded and used instead of the procedural rock — the grass/flower
   scattering then runs on the Blender mesh exactly the same way.
   ========================================================================== */
(function () {
  'use strict';

  const { fbm3, ridged3, simplex3 } = window.NM3D_NOISE;

  // ---------------------------------------------------------------- params
  const P = {
    grass: 16000,
    flowers: 700,
    wind: 1.0,
    autoRotate: true,
    timeOfDay: 0.35,       // 0 = dawn, 0.5 = noon, 1 = dusk
    bloomTint: 0.0
  };

  const PALETTES = {
    warm:  [0xf2b93c, 0xef6d3a, 0xe8467a, 0xf0d9a8],
    cool:  [0x74b7ec, 0x5a86e0, 0x9c6fe0, 0xbcd9f2],
    aj:    [0xe8b53f, 0xdb8a3a, 0xc0392b, 0xefdcb0]
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
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f14);
  scene.fog = new THREE.FogExp2(0x0a0f14, 0.17);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  camera.position.set(2.3, 1.5, 3.0);

  // ------------------------------------------------------- orbit controller
  // Small hand-rolled controller: r137's OrbitControls isn't vendored here and
  // we do not pull anything off a CDN (network is restricted on the AJ side).
  const orbit = {
    target: new THREE.Vector3(0, 0.55, 0),
    theta: Math.atan2(camera.position.x, camera.position.z),
    phi: Math.acos(THREE.MathUtils.clamp(camera.position.y / camera.position.length(), -1, 1)),
    radius: camera.position.length(),
    dragging: false, px: 0, py: 0, vTheta: 0, vPhi: 0
  };

  function applyCamera() {
    orbit.phi = THREE.MathUtils.clamp(orbit.phi, 0.22, Math.PI * 0.49);
    orbit.radius = THREE.MathUtils.clamp(orbit.radius, 1.8, 14);
    const s = Math.sin(orbit.phi), r = orbit.radius;
    camera.position.set(
      orbit.target.x + r * s * Math.sin(orbit.theta),
      orbit.target.y + r * Math.cos(orbit.phi),
      orbit.target.z + r * s * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);
  }

  function pointerDown(e) {
    orbit.dragging = true;
    orbit.px = e.clientX; orbit.py = e.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  }
  function pointerMove(e) {
    if (!orbit.dragging) return;
    const dx = (e.clientX - orbit.px) / window.innerWidth;
    const dy = (e.clientY - orbit.py) / window.innerHeight;
    orbit.px = e.clientX; orbit.py = e.clientY;
    orbit.vTheta -= dx * 4.2;
    orbit.vPhi -= dy * 3.2;
  }
  function pointerUp(e) {
    orbit.dragging = false;
    canvas.releasePointerCapture && e.pointerId != null &&
      canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId) &&
      canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.radius *= Math.pow(1.0015, e.deltaY);
    applyCamera();
  }, { passive: false });

  // ---------------------------------------------------------------- lighting
  const key = new THREE.DirectionalLight(0xfff0d0, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -3.5;
  key.shadow.camera.right = 3.5;
  key.shadow.camera.top = 3.5;
  key.shadow.camera.bottom = -3.5;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x5f97d8, 0.9);
  rim.position.set(-3, 1.6, -3.2);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0x6f93bd, 0x201a12, 0.42);
  scene.add(hemi);

  function applyTimeOfDay(t) {
    // t: 0 dawn -> 0.5 noon -> 1 dusk
    const elev = Math.sin(t * Math.PI) * 0.85 + 0.12;      // 0.12 .. 0.97
    const az = THREE.MathUtils.lerp(-2.4, 2.4, t);
    key.position.set(az * 2.2, elev * 5.0, 2.6 - t * 5.2);
    key.target.position.set(0, 0.4, 0);
    key.target.updateMatrixWorld();

    const warm = new THREE.Color(0xff9c4a);
    const noon = new THREE.Color(0xfff4e0);
    const k = 1 - Math.abs(t - 0.5) * 2;                    // 0 at edges, 1 at noon
    key.color.copy(warm).lerp(noon, k);
    key.intensity = 1.5 + k * 1.6;

    const skyDawn = new THREE.Color(0x120d12);
    const skyNoon = new THREE.Color(0x0d151c);
    const sky = skyDawn.clone().lerp(skyNoon, k);
    scene.background = sky;
    scene.fog.color.copy(sky);
    hemi.intensity = 0.28 + k * 0.3;
    rim.intensity = 1.0 - k * 0.5;
  }
  applyTimeOfDay(P.timeOfDay);

  // ------------------------------------------------------------ ground disc
  const groundGeo = new THREE.CircleGeometry(14, 96);
  groundGeo.rotateX(-Math.PI / 2);
  {
    // gentle undulation so the ground doesn't read as a flat cut-out
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, fbm3(x * 0.35, 0, z * 0.35, 3) * 0.22 - 0.02);
    }
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    color: 0x0b0f0b, roughness: 1.0, metalness: 0.0
  }));
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // ------------------------------------------------------------- the rock
  function buildRock() {
    const geo = new THREE.IcosahedronGeometry(1, 48);   // ~46k tris, plenty of detail
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize();

      // large-scale boulder shape (squashed + leaning)
      let r = 1.0;
      r += fbm3(n.x * 1.15, n.y * 1.15, n.z * 1.15, 3) * 0.30;
      // mid fractures
      r += (ridged3(n.x * 3.1, n.y * 3.1, n.z * 3.1, 4) - 0.5) * 0.20;
      // fine grain
      r += fbm3(n.x * 9.0, n.y * 9.0, n.z * 9.0, 3) * 0.045;

      v.copy(n).multiplyScalar(r);
      v.y *= 0.72;                    // sit low and wide
      v.x *= 1.12;
      v.y += 0.12 * v.x;              // slight lean
      // flatten the underside so it beds into the ground
      if (v.y < -0.18) v.y = -0.18 + (v.y + 0.18) * 0.25;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    return geo;
  }

  function paintRock(geo) {
    // vertex colours: cool grey stone, damp dark in the crevices,
    // moss on upward-facing sheltered faces
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const stone = new THREE.Color(0x665d51);
    const dark = new THREE.Color(0x2b2721);
    const moss = new THREE.Color(0x53702f);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const up = nor.getY(i);
      const grain = fbm3(x * 6.5, y * 6.5, z * 6.5, 4) * 0.5 + 0.5;

      c.copy(dark).lerp(stone, THREE.MathUtils.clamp(grain * 1.35, 0, 1));

      const mossMask = THREE.MathUtils.smoothstep(up, 0.15, 0.75) *
        THREE.MathUtils.smoothstep(fbm3(x * 2.4 + 11, y * 2.4, z * 2.4, 3) * 0.5 + 0.5, 0.35, 0.8);
      c.lerp(moss, mossMask * 0.85);

      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  const rockGeo = buildRock();
  paintRock(rockGeo);
  const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.02, flatShading: false
  }));
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.position.y = 0.30;
  scene.add(rock);

  // ------------------------------------------------ scatter points on a mesh
  // Area-weighted triangle sampling, filtered by how upward-facing the face is.
  function buildSampler(geometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position;
    const triCount = pos.count / 3;
    const areas = new Float32Array(triCount);
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
      areas[t] = area;
      total += area;
      cdf[t] = total;
    }

    return {
      geometry: g,
      sample(rand, out, outNormal) {
        // rejection-sample until we land on a face that plants can grow on
        for (let attempt = 0; attempt < 24; attempt++) {
          const target = rand() * total;
          let lo = 0, hi = triCount - 1;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < target) lo = mid + 1; else hi = mid; }
          const t = lo;
          const ny = normals[t * 3 + 1];
          if (ny < 0.34) continue;                       // too steep — nothing grows
          if (rand() > Math.pow(ny, 1.6)) continue;      // favour flatter ledges

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

  // deterministic RNG for the scatter, so the composition is reproducible
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
  function bladeGeometry(segments) {
    // tapered strip, origin at the base, growing +Y, facing +Z
    const w = 0.0075, h = 1.0;
    const verts = [], uvs = [], idx = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const taper = Math.pow(1 - t, 0.75);
      const y = t * h;
      verts.push(-w * taper, y, 0, w * taper, y, 0);
      uvs.push(0, t, 1, t);
    }
    for (let i = 0; i < segments; i++) {
      const o = i * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // shared uniforms for every wind-driven material
  const windUniforms = {
    uTime: { value: 0 },
    uWind: { value: P.wind }
  };

  function makeWindMaterial(base) {
    const mat = new THREE.MeshStandardMaterial(base);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.uWind = windUniforms.uWind;
      shader.vertexShader = `
        uniform float uTime;
        uniform float uWind;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // sway increases with height along the blade (uv.y = 0 at the root)
        float swayAmt = pow(uv.y, 1.6) * uWind;
        vec4 wp = instanceMatrix * vec4(transformed, 1.0);
        float phase = wp.x * 2.7 + wp.z * 3.1;
        float gust = sin(uTime * 0.7 + phase * 0.35) * 0.5 + 0.5;
        float s = sin(uTime * 2.1 + phase) * 0.055 + sin(uTime * 5.3 + phase * 1.7) * 0.018;
        transformed.x += s * swayAmt * (0.5 + gust);
        transformed.z += s * 0.6 * swayAmt * (0.5 + gust);
        transformed.y -= abs(s) * swayAmt * 0.25;
        `
      );
      mat.userData.shader = shader;
    };
    return mat;
  }

  // --------------------------------------------------------------- scatter
  let grassMesh = null, flowerMesh = null, stemMesh = null, leafMesh = null;

  function clearScatter() {
    [grassMesh, flowerMesh, stemMesh, leafMesh].forEach((m) => {
      if (!m) return;
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    grassMesh = flowerMesh = stemMesh = leafMesh = null;
  }

  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  function scatter(targetMesh, grassCount, flowerCount) {
    clearScatter();

    const sampler = buildSampler(targetMesh.geometry);
    const rand = makeRand(20260724);
    const p = new THREE.Vector3(), n = new THREE.Vector3();

    // ---- grass ----
    const gGeo = bladeGeometry(5);
    const gMat = makeWindMaterial({
      color: 0xffffff, roughness: 0.85, metalness: 0.0,
      side: THREE.DoubleSide, vertexColors: true
    });
    grassMesh = new THREE.InstancedMesh(gGeo, gMat, grassCount);
    grassMesh.castShadow = true;
    grassMesh.receiveShadow = true;
    grassMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const gColors = new Float32Array(grassCount * 3);
    const cBlade = new THREE.Color();
    const dry = new THREE.Color(0xb8a86a);
    const fresh = new THREE.Color(0x4f7f2e);
    const deep = new THREE.Color(0x27461c);

    let placed = 0;
    for (let i = 0; i < grassCount; i++) {
      if (!sampler.sample(rand, p, n)) { continue; }

      // clumping: thin out blades on exposed slopes
      const clump = fbm3(p.x * 5.5, p.y * 5.5, p.z * 5.5, 3) * 0.5 + 0.5;
      if (rand() > Math.pow(clump, 1.5) * 1.15) continue;

      dummy.position.copy(p).add(targetMesh.position);
      // orient to the surface normal, then tilt outward a little
      q.setFromUnitVectors(upVec, n);
      dummy.quaternion.copy(q);
      dummy.rotateY(rand() * Math.PI * 2);
      dummy.rotateX((rand() - 0.5) * 0.55);
      dummy.rotateZ((rand() - 0.5) * 0.55);

      const h = 0.085 + rand() * 0.10 + clump * 0.07;
      const wsc = 0.7 + rand() * 0.7;
      dummy.scale.set(wsc, h, wsc);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(placed, dummy.matrix);

      cBlade.copy(deep).lerp(fresh, clump);
      cBlade.lerp(dry, Math.pow(rand(), 2.2) * 0.55);
      gColors[placed * 3] = cBlade.r;
      gColors[placed * 3 + 1] = cBlade.g;
      gColors[placed * 3 + 2] = cBlade.b;
      placed++;
    }
    grassMesh.count = placed;
    gGeo.setAttribute('color', new THREE.InstancedBufferAttribute(gColors, 3));
    scene.add(grassMesh);

    // ---- flowers: a stem + a petal head ----
    const stemGeo = bladeGeometry(4);
    const stemMat = makeWindMaterial({
      color: 0x5c7d3a, roughness: 0.8, side: THREE.DoubleSide
    });
    stemMesh = new THREE.InstancedMesh(stemGeo, stemMat, flowerCount);
    stemMesh.castShadow = true;

    const headGeo = flowerHeadGeometry();
    const headMat = makeWindMaterial({
      color: 0xffffff, roughness: 0.55, metalness: 0.0,
      side: THREE.DoubleSide, vertexColors: true,
      emissive: 0x000000
    });
    flowerMesh = new THREE.InstancedMesh(headGeo, headMat, flowerCount);
    flowerMesh.castShadow = true;

    const fColors = new Float32Array(flowerCount * 3);
    const cF = new THREE.Color();
    let fPlaced = 0;

    for (let i = 0; i < flowerCount; i++) {
      if (!sampler.sample(rand, p, n)) continue;
      const clump = fbm3(p.x * 3.2 + 40, p.y * 3.2, p.z * 3.2, 3) * 0.5 + 0.5;
      if (rand() > clump * 0.9) continue;                 // flowers grow in patches

      const height = 0.13 + rand() * 0.12;
      dummy.position.copy(p).add(targetMesh.position);
      q.setFromUnitVectors(upVec, n);
      dummy.quaternion.copy(q);
      dummy.rotateY(rand() * Math.PI * 2);
      dummy.rotateX((rand() - 0.5) * 0.3);
      dummy.scale.set(0.7, height, 1);
      dummy.updateMatrix();
      stemMesh.setMatrixAt(fPlaced, dummy.matrix);

      // head sits at the tip of the stem
      const tip = new THREE.Vector3(0, height, 0).applyQuaternion(dummy.quaternion);
      dummy.position.add(tip);
      dummy.scale.setScalar(0.028 + rand() * 0.022);
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
    scene.add(stemMesh, flowerMesh);

    updateStats(placed, fPlaced);
  }

  function flowerHeadGeometry() {
    // 6 rounded petals arranged around a small centre disc.
    // Each petal is an ellipse fan, slightly cupped upward — much softer
    // silhouette than a flat star.
    const petals = 6, seg = 7, verts = [], uvs = [], idx = [];
    const push = (x, y, z, u, v) => { verts.push(x, y, z); uvs.push(u, v); return verts.length / 3 - 1; };

    for (let i = 0; i < petals; i++) {
      const dir = (i / petals) * Math.PI * 2;
      const cx = Math.cos(dir), cz = Math.sin(dir);
      const dist = 0.62, len = 0.46, wide = 0.30;
      const base = push(cx * 0.12, 0.02, cz * 0.12, 0.5, 0.85);
      const ring = [];
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        const ex = Math.cos(a) * len;       // along the petal
        const ez = Math.sin(a) * wide;      // across it
        const px = cx * (dist + ex) - cz * ez;
        const pz = cz * (dist + ex) + cx * ez;
        const cup = 0.16 * (1 - Math.cos(a) * 0.5);   // petal tips lift
        ring.push(push(px, 0.04 + cup, pz, 0.5 + ez, 1.0));
      }
      for (let s = 0; s < seg; s++) idx.push(base, ring[s], ring[s + 1]);
    }

    // centre disc
    const centre = push(0, 0.06, 0, 0.5, 0.7);
    const cRing = [];
    for (let s = 0; s <= 10; s++) {
      const a = (s / 10) * Math.PI * 2;
      cRing.push(push(Math.cos(a) * 0.26, 0.03, Math.sin(a) * 0.26, 0.5, 0.6));
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
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 2.6;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.1 + Math.random() * 2.2;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = Math.random() * 100;
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
          p.y += sin(uTime * 0.35 + aSeed) * 0.35 + mod(uTime * 0.06 + aSeed * 0.1, 1.0) * 0.4;
          p.x += sin(uTime * 0.5 + aSeed * 1.7) * 0.18;
          p.z += cos(uTime * 0.42 + aSeed * 2.3) * 0.18;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vAlpha = smoothstep(0.0, 1.2, p.y) * (0.35 + 0.35 * sin(uTime + aSeed * 3.0));
          gl_PointSize = (7.0 * uPixelRatio) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.72), a);
        }
      `
    });
    return new THREE.Points(geo, mat);
  }
  const pollen = buildPollen(420);
  scene.add(pollen);

  // ---------------------------------------------------------------- optional
  // If a Blender-authored rock is present, swap it in and re-scatter on it.
  function tryLoadBlenderRock() {
    if (typeof THREE.GLTFLoader !== 'function') return;
    const loader = new THREE.GLTFLoader();
    loader.load('./assets/rock.glb', (gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      if (!mesh) return;
      mesh.geometry.computeVertexNormals();
      mesh.castShadow = mesh.receiveShadow = true;
      scene.remove(rock);
      mesh.position.copy(rock.position);
      scene.add(mesh);
      scatter(mesh, P.grass, P.flowers);
      setStatus('rock.glb (Blender) محمّل');
    }, undefined, () => { /* no GLB yet — procedural rock stays */ });
  }

  // ------------------------------------------------------------------- UI
  function setStatus(txt) {
    const el = document.getElementById('status');
    if (el) el.textContent = txt;
  }
  function updateStats(g, f) {
    const el = document.getElementById('stats');
    if (el) el.innerHTML =
      `<span>أعشاب: <b>${g.toLocaleString('en-US')}</b></span>` +
      `<span>زهور: <b>${f.toLocaleString('en-US')}</b></span>`;
  }

  function bindUI() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => fn(el));
      return el;
    };

    on('grassRange', (el) => {
      P.grass = +el.value;
      document.getElementById('grassVal').textContent = P.grass.toLocaleString('en-US');
      clearTimeout(bindUI._t);
      bindUI._t = setTimeout(() => scatter(activeRock(), P.grass, P.flowers), 140);
    });
    on('flowerRange', (el) => {
      P.flowers = +el.value;
      document.getElementById('flowerVal').textContent = P.flowers.toLocaleString('en-US');
      clearTimeout(bindUI._t2);
      bindUI._t2 = setTimeout(() => scatter(activeRock(), P.grass, P.flowers), 140);
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
        P.timeOfDay < 0.33 ? 'فجر' : P.timeOfDay > 0.67 ? 'غروب' : 'ظهيرة';
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
      rot.textContent = P.autoRotate ? 'إيقاف الدوران' : 'تشغيل الدوران';
    });

    const shot = document.getElementById('shotBtn');
    if (shot) shot.addEventListener('click', () => {
      renderer.render(scene, camera);           // ensure the buffer is fresh
      const a = document.createElement('a');
      a.download = 'rock-garden.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    });

    // panel show/hide is handled by the inline script in index.html
  }

  let blenderRock = null;
  function activeRock() { return blenderRock || rock; }

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
  }
  window.addEventListener('resize', resize);

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    windUniforms.uTime.value += dt;

    if (P.autoRotate && !orbit.dragging) orbit.theta += dt * 0.075;
    orbit.theta += orbit.vTheta * dt * 6;
    orbit.phi += orbit.vPhi * dt * 6;
    orbit.vTheta *= 0.86;
    orbit.vPhi *= 0.86;
    applyCamera();

    renderer.render(scene, camera);

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 0.5) {
      const el = document.getElementById('fps');
      if (el) el.textContent = Math.round(fpsFrames / fpsAcc) + ' fps';
      fpsAcc = 0; fpsFrames = 0;
    }
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------ boot
  resize();
  applyCamera();
  scatter(rock, P.grass, P.flowers);
  bindUI();
  setStatus('صخرة إجرائية (Procedural)');
  tryLoadBlenderRock();
  tick();

  window.NM3D = { scene, camera, renderer, P, scatter, activeRock };
})();
