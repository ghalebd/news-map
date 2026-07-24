/* ============================================================================
   PostFX — hand-written post chain for Three.js r137.
   EffectComposer/UnrealBloomPass are not vendored in this repo (and we pull
   nothing off a CDN), so the whole chain is built from plain ShaderMaterials.

   scene ──▶ rtScene (full res, +depth)
            ├─▶ half-res copy ─▶ blur H ─▶ blur V ──▶ rtBlur   (DoF source)
            │                                   └─▶ bright ─▶ blur ─▶ rtBloom
            └────────────────────────────────────────────────▶ composite ─▶ screen

   composite = scene ⊕ bloom, lerped toward rtBlur by circle-of-confusion,
   then vignette + film grain + a touch of chromatic aberration.
   ========================================================================== */
(function () {
  'use strict';

  const QUAD = new THREE.PlaneGeometry(2, 2);

  const VERT = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `;

  function makePass(fragmentShader, uniforms) {
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(QUAD, mat));
    return { scene, mat };
  }

  function makeRT(w, h, withDepth) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      encoding: THREE.sRGBEncoding
    });
    if (withDepth) {
      rt.depthTexture = new THREE.DepthTexture(w, h);
      rt.depthTexture.type = THREE.UnsignedIntType;
      rt.depthTexture.format = THREE.DepthFormat;
    }
    return rt;
  }

  const COPY_FS = `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
  `;

  // 9-tap gaussian, separable
  const BLUR_FS = `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;          // texel-sized step, horizontal or vertical
    varying vec2 vUv;
    void main() {
      vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
      vec2 o1 = uDir * 1.3846153846;
      vec2 o2 = uDir * 3.2307692308;
      sum += texture2D(tDiffuse, vUv + o1) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv + o2) * 0.0702702703;
      sum += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
      gl_FragColor = sum;
    }
  `;

  const BRIGHT_FS = `
    uniform sampler2D tDiffuse;
    uniform float uThreshold;
    uniform float uSoft;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float k = smoothstep(uThreshold, uThreshold + uSoft, l);
      gl_FragColor = vec4(c * k, 1.0);
    }
  `;

  const COMPOSITE_FS = `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBlur;
    uniform sampler2D tBloom;
    uniform sampler2D tDepth;
    uniform float uNear;
    uniform float uFar;
    uniform float uFocus;        // focus distance, world units
    uniform float uRange;        // depth that stays acceptably sharp
    uniform float uAperture;     // strength of the defocus falloff
    uniform float uBloom;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uCA;
    uniform float uTime;
    varying vec2 vUv;

    float viewZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      // perspectiveDepthToViewZ
      return (uNear * uFar) / ((uFar - uNear) * d - uFar);
    }

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCentre = uv - 0.5;

      // chromatic aberration grows toward the frame edge — lens character
      float r2 = dot(fromCentre, fromCentre);
      vec2 caOff = fromCentre * uCA * r2;
      vec3 sharp;
      sharp.r = texture2D(tDiffuse, uv + caOff).r;
      sharp.g = texture2D(tDiffuse, uv).g;
      sharp.b = texture2D(tDiffuse, uv - caOff).b;

      vec3 soft = texture2D(tBlur, uv).rgb;

      // depth of field
      float z = -viewZ(uv);
      float coc = clamp((abs(z - uFocus) - uRange) / max(uRange * 2.0, 0.001) * uAperture, 0.0, 1.0);
      coc = smoothstep(0.0, 1.0, coc);
      vec3 col = mix(sharp, soft, coc);

      // bloom
      col += texture2D(tBloom, uv).rgb * uBloom;

      // film grade: cool shadows, warm highlights, a little extra saturation
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col * vec3(0.90, 0.97, 1.10), col * vec3(1.08, 1.01, 0.90),
                smoothstep(0.12, 0.72, lum));
      col = mix(vec3(lum), col, 1.10);
      col = clamp(col, 0.0, 1.5);

      // vignette
      float vig = 1.0 - uVignette * smoothstep(0.25, 0.85, length(fromCentre));
      col *= vig;

      // film grain — animated, stronger in the shadows like real sensor noise
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float g = (rand(uv * 900.0 + fract(uTime) * 37.0) - 0.5);
      col += g * uGrain * (1.0 - smoothstep(0.0, 0.8, l));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  class PostFX {
    constructor(renderer, scene, camera) {
      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.enabled = true;

      this.params = {
        bloom: 0.38,
        threshold: 0.75,
        focus: 6.0,
        range: 2.2,
        aperture: 0.85,
        vignette: 0.34,
        grain: 0.022,
        ca: 0.0015
      };

      this.copy = makePass(COPY_FS, { tDiffuse: { value: null } });
      this.blur = makePass(BLUR_FS, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
      this.bright = makePass(BRIGHT_FS, {
        tDiffuse: { value: null },
        uThreshold: { value: this.params.threshold },
        uSoft: { value: 0.28 }
      });
      this.composite = makePass(COMPOSITE_FS, {
        tDiffuse: { value: null }, tBlur: { value: null },
        tBloom: { value: null }, tDepth: { value: null },
        uNear: { value: camera.near }, uFar: { value: camera.far },
        uFocus: { value: this.params.focus },
        uRange: { value: this.params.range },
        uAperture: { value: this.params.aperture },
        uBloom: { value: this.params.bloom },
        uVignette: { value: this.params.vignette },
        uGrain: { value: this.params.grain },
        uCA: { value: this.params.ca },
        uTime: { value: 0 }
      });

      this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.setSize(1, 1);
    }

    setSize(w, h) {
      const dpr = this.renderer.getPixelRatio();
      const fw = Math.max(2, Math.floor(w * dpr));
      const fh = Math.max(2, Math.floor(h * dpr));
      const hw = Math.max(2, fw >> 1), hh = Math.max(2, fh >> 1);
      const qw = Math.max(2, fw >> 2), qh = Math.max(2, fh >> 2);

      [this.rtScene, this.rtA, this.rtB, this.rtC, this.rtD].forEach((rt) => rt && rt.dispose());
      this.rtScene = makeRT(fw, fh, true);
      this.rtA = makeRT(hw, hh, false);   // blurred scene (DoF source)
      this.rtB = makeRT(hw, hh, false);   // ping-pong
      this.rtC = makeRT(qw, qh, false);   // bright pass
      this.rtD = makeRT(qw, qh, false);   // bloom
      this.size = { fw, fh, hw, hh, qw, qh };
    }

    _run(pass, target) {
      this.renderer.setRenderTarget(target || null);
      this.renderer.render(pass.scene, this.quadCam);
    }

    _blur(src, dstA, dstB, w, h, radius) {
      this.blur.mat.uniforms.tDiffuse.value = src.texture;
      this.blur.mat.uniforms.uDir.value.set(radius / w, 0);
      this._run(this.blur, dstA);
      this.blur.mat.uniforms.tDiffuse.value = dstA.texture;
      this.blur.mat.uniforms.uDir.value.set(0, radius / h);
      this._run(this.blur, dstB);
    }

    render(time) {
      const r = this.renderer;
      if (!this.enabled) {
        r.setRenderTarget(null);
        r.render(this.scene, this.camera);
        return;
      }

      const s = this.size;

      // 1. scene at full res, with depth
      r.setRenderTarget(this.rtScene);
      r.clear();
      r.render(this.scene, this.camera);

      // 2. half-res copy, then blur it twice for a wide, smooth defocus
      this.copy.mat.uniforms.tDiffuse.value = this.rtScene.texture;
      this._run(this.copy, this.rtA);
      this._blur(this.rtA, this.rtB, this.rtA, s.hw, s.hh, 1.0);
      this._blur(this.rtA, this.rtB, this.rtA, s.hw, s.hh, 2.0);

      // 3. bright pass off the blurred scene, blurred again → bloom
      this.bright.mat.uniforms.tDiffuse.value = this.rtA.texture;
      this._run(this.bright, this.rtC);
      this._blur(this.rtC, this.rtD, this.rtC, s.qw, s.qh, 1.5);
      this._blur(this.rtC, this.rtD, this.rtC, s.qw, s.qh, 3.0);

      // 4. composite
      const u = this.composite.mat.uniforms;
      u.tDiffuse.value = this.rtScene.texture;
      u.tBlur.value = this.rtA.texture;
      u.tBloom.value = this.rtC.texture;
      u.tDepth.value = this.rtScene.depthTexture;
      u.uNear.value = this.camera.near;
      u.uFar.value = this.camera.far;
      u.uTime.value = time;
      this._run(this.composite, null);
    }
  }

  window.NM3D_PostFX = PostFX;
})();
