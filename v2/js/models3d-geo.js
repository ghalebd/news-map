/* ============================================================
   MODELS3D-GEO — the GLB loading + geometry pipeline behind models3d.js.
   Lifted out of models3d.js purely to keep both files under the 500-line
   limit. Behaviour is byte-for-byte the same; nothing here is new.

   WHY THE SEAM IS HERE: everything in this file is a pure function of a
   GLB (bytes → master scene → oriented, unit-sized, styled clone). It
   touches no map, no Store, no marker / group / layer / pose state, so it
   is the one part of models3d.js that can be lifted without dragging
   mutable module locals across a file boundary. The MapLibre custom layer
   and the Leaflet markers deliberately did NOT come with it: they share
   eight mutable locals (glmap, layer, hidden, groups, lightCfg, shadowMat,
   shadowGeo, globeIcoToken) that purge() and syncAll() also reach into, and
   a shared-mutable context object across two files would be far more
   fragile on a live broadcast tool than the long file it replaced.

   MUST LOAD BEFORE js/models3d.js (both `defer`, so document order = exec
   order) — models3d.js reads window.Models3DGeo during its own IIFE.

   ---- export surface (window.Models3DGeo) ----
     init({ watchLoad })  inject the load-failure watchdog. watchLoad STAYS
                          in models3d.js because it calls syncAll() and
                          UI.toast(); function hoisting does not cross files,
                          so loadRaw() can only reach it through this hook.
     fileOf(src)          catalog filename — also used by models3d's keyOf().
     loadRaw(m)           Promise<master scene>, cached per model id.
     buildInner(raw, sty) oriented + unit-sized + styled CLONE of a master.
     forget(id)           dispose + evict exactly one master.

   ---- the one piece of state that crosses, and why it is NOT exported ----
   rawCache holds the MASTER scenes. A master owns its geometry / materials /
   textures; every clone handed out by buildInner() SHARES those references.
   Exporting the Map would let a second file dispose a master while live
   clones still point at its GPU buffers — which shows up on air as models
   rendering black or vanishing. So purge() in models3d.js (which must stay
   there: it also touches markers, groups, layer, glmap, poses, billboards)
   calls forget(id) and never sees the cache itself.
   ============================================================ */
(() => {
  const THREE = window.THREE;
  if (!THREE || !THREE.GLTFLoader) { console.warn('Models3D-geo: deps missing'); return; }   // same guard models3d.js uses; it bails too, so this file simply sits unused
  const loader = new THREE.GLTFLoader();
  // Draco decoder — the bundled catalog models are Draco-compressed (≈20–50× smaller)
  try { if (THREE.DRACOLoader) { const draco = new THREE.DRACOLoader(); draco.setDecoderPath('lib/draco/'); loader.setDRACOLoader(draco); } } catch (e) { console.warn('Models3D: Draco init', e); }
  // was a deliberate local copy of models3d.js's D2R, to avoid a load-order dependency for a plain
  // number. That trade-off no longer applies: js/util.js is the FIRST project <script> in both pages,
  // is unconditional (no early return), and is non-defer — so it has always run before this deferred
  // file's body does. If that order is ever broken this destructure throws at LOAD, not on air.
  const { D2R } = window.U;
  const fileOf = s => (s || '').split('/').pop();

  // Injected by models3d.js's init() (see header). Left null-safe on purpose: if the
  // consumer never inits, loading still works — only the failure toast goes quiet.
  let watchLoad = null;

  /* ---- shared GLB loading (model -> Promise<THREE.Object3D raw scene>).
     Source is either a bundled catalog file (m.src URL) or an uploaded blob
     in IndexedDB (m.id). Cached per instance id. ---- */
  const rawCache = new Map();
  function loadRaw(m) {
    const id = m.id;
    if (rawCache.has(id)) return rawCache.get(id);
    const p = (async () => {
      const url = m.src ? m.src : await window.Assets3D.url(id);
      if (!url) throw new Error('no-glb');
      const scene = await new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));
      const sc = deskin(scene);   // bake any rig to a static rest-pose mesh ONCE, so orientation analysis + render agree
      try { sc.userData.__file = fileOf(m.src); } catch (e) {}   // remember the catalog filename for the baked HEADING_FIX
      return sc;
    })();
    rawCache.set(id, p);
    if (watchLoad) watchLoad(m, p);
    return p;
  }
  // apply a render style by swapping in per-instance materials (so the shared
  // master is never mutated). 'wireframe' draws the mesh as a glowing wireframe.
  function applyStyle(obj, style) {
    const wire = style === 'wireframe';
    // Convert PBR (MeshStandardMaterial) to a simple LIT material. PBR materials render black /
    // invisible inside MapLibre's shared-context custom 3D layer (they rely on GL state the shared
    // context doesn't provide) — while MeshLambertMaterial draws reliably (the same approach the
    // live-ship layer uses). Colour / texture / transparency / emissive are preserved.
    obj.traverse(o => {
      if (o.isMesh) {
        // sanitise geometry so a lit material can render it: some catalog GLBs ship meshes with no
        // normals (lighting needs them — without, three.js crashes reading a null attribute, which is
        // why e.g. the Saar-5 corvette never appeared) or no positions at all (empty helper meshes).
        const g = o.geometry;
        if (!g || !g.attributes || !g.attributes.position) { o.visible = false; return; }
        // drop attributes explicitly set to null — three.js's `null !== undefined` guard lets them
        // through and then crashes reading `.isGLBufferAttribute` on null (the Saar-5's broken UVs).
        for (const k in g.attributes) if (g.attributes[k] == null) delete g.attributes[k];
        if (g.morphAttributes) for (const k in g.morphAttributes) if (g.morphAttributes[k] == null) delete g.morphAttributes[k];
        if (!g.attributes.normal) { try { g.computeVertexNormals(); } catch (e) {} }
      }
      if (o.isMesh && o.material) {
        const conv = mm => {
          const lm = new THREE.MeshLambertMaterial({
            color: mm.color ? mm.color.clone() : new THREE.Color(0xb9c2cc),
            map: mm.map || null,
            transparent: !!mm.transparent,
            opacity: mm.opacity != null ? mm.opacity : 1,
            emissive: mm.emissive ? mm.emissive.clone() : new THREE.Color(0x000000),
            side: mm.side != null ? mm.side : THREE.FrontSide,
          });
          lm.wireframe = wire;
          return lm;
        };
        o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      }
    });
    return obj;
  }
  // a unit-sized, origin-centred, Y-up clone of the model, styled.
  // NOTE: clone(true) SHARES geometry/material/textures with the master, so this
  // clone must NEVER be disposed — only the master (rawCache) owns GPU resources.
  // CANONICAL ORIENTATION — every catalog GLB models its vehicle facing a different local axis,
  // so a single heading offset can't be right for all of them (the bug: F-16 flew nose-first but
  // the drone flew backward and others sideways). We derive each model's nose direction ONCE from
  // its geometry and rotate it to a shared canonical forward (nose → -Z), so afterwards ONE heading
  // convention is correct for every model across all views (2D top-down, flat-3D, globe, thumbnail).
  // Long axis = PCA of the top-down (XZ) footprint; nose = the NARROWER tip of that axis (planes,
  // drones, ships, missiles all taper to a point at the front). Cached on the master; per-model
  // `headOff` (degrees) lets the operator flip/nudge the rare model the heuristic misjudges.
  function canonicalOrient(raw) {
    if (raw.userData && raw.userData.canonRot) return raw.userData.canonRot;
    let rx = 0, deg = 0;
    try {
      raw.updateMatrixWorld(true);
      const xs = [], ys = [], zs = []; const v = new THREE.Vector3();
      raw.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        const pos = o.geometry.attributes.position, stride = Math.max(1, Math.floor(pos.count / 1500));
        for (let i = 0; i < pos.count; i += stride) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); }
      });
      const n = xs.length;
      if (n >= 8) {
        // STANDING model? If the vertical (Y) extent is the largest, the GLB was authored on its tail
        // (e.g. the Bayraktar: 485×1692×50) — lay it flat (rotate -90° about X: y→z, z→-y) before the
        // heading pass. Tall-masted ships are safe: their length still exceeds their height, so Y isn't max.
        let exX = ext(xs), exY = ext(ys), exZ = ext(zs);
        if (exY > exX && exY > exZ) { rx = -Math.PI / 2; for (let i = 0; i < n; i++) { const z = zs[i]; zs[i] = -ys[i]; ys[i] = z; } }
        let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += xs[i]; cz += zs[i]; } cx /= n; cz /= n;
        let Cxx = 0, Cxz = 0, Czz = 0;
        for (let i = 0; i < n; i++) { const dx = xs[i] - cx, dz = zs[i] - cz; Cxx += dx * dx; Cxz += dx * dz; Czz += dz * dz; }
        const a0 = 0.5 * Math.atan2(2 * Cxz, Cxx - Czz);          // PCA major axis angle in XZ
        // Measure both candidate axes (major + perpendicular). The FORWARD axis is the fuselage/hull,
        // identified by its dissimilar tips (pointed nose vs blunt tail); the wing/beam axis has
        // near-identical tips. So pick the axis with the greater tip-width asymmetry, then nose = narrower tip.
        const tipStats = (a) => {
          const ux = Math.cos(a), uz = Math.sin(a);
          let tmin = 1e9, tmax = -1e9;
          for (let i = 0; i < n; i++) { const t = (xs[i] - cx) * ux + (zs[i] - cz) * uz; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
          const band = 0.18 * ((tmax - tmin) || 1);
          let sLo = 0, nLo = 0, sHi = 0, nHi = 0;
          for (let i = 0; i < n; i++) {
            const dx = xs[i] - cx, dz = zs[i] - cz; const t = dx * ux + dz * uz, p = Math.abs(-dx * uz + dz * ux);
            if (t <= tmin + band) { sLo += p; nLo++; } else if (t >= tmax - band) { sHi += p; nHi++; }
          }
          const wLo = nLo ? sLo / nLo : 1e9, wHi = nHi ? sHi / nHi : 1e9;
          return { ux, uz, wLo, wHi, len: tmax - tmin, asym: Math.abs(wHi - wLo) / ((wHi + wLo) || 1) };
        };
        const A = tipStats(a0), B = tipStats(a0 + Math.PI / 2);
        // forward axis: if one axis is clearly the longer (hull/fuselage of a ship, tank, missile,
        // most jets → aspect ≥ 1.6) trust LENGTH; only for near-square footprints (delta drones,
        // flying wings, wide-span UAVs where span ≈ length) fall back to the more-asymmetric axis.
        const longer = A.len >= B.len ? A : B, shorter = A.len >= B.len ? B : A;
        const F = (longer.len / (shorter.len || 1) >= 1.6) ? longer : (A.asym >= B.asym ? A : B);
        // nose = narrower tip — a heuristic; front/back is geometrically ambiguous for some models (a
        // transport's tail-cone is as pointy as its nose), so the wrong ones are corrected per-file in
        // the catalog's baked HEADING_FIX list and via the Flip button.
        const noseAtMax = F.wHi < F.wLo;
        const nx = (noseAtMax ? 1 : -1) * F.ux, nz = (noseAtMax ? 1 : -1) * F.uz;
        deg = -Math.atan2(-nx, -nz) * 180 / Math.PI;                      // rotate nose → -Z (canonical fwd)
        deg = ((Math.round(deg) % 360) + 360) % 360;
      }
    } catch (e) {}
    // NOTE: per-file heading correction is NO LONGER baked here. The geometric heuristic above is
    // front/back ambiguous for many GLBs, so the correction lives in eff() via config.modelFix
    // (synced + operator-adjustable via the HUD's "Turn" button), not baked into the canonical mesh.
    const rot = { rx, ry: deg * D2R };
    if (raw.userData) raw.userData.canonRot = rot;
    return rot;
  }
  function ext(arr) { let lo = 1e30, hi = -1e30; for (let i = 0; i < arr.length; i++) { if (arr[i] < lo) lo = arr[i]; if (arr[i] > hi) hi = arr[i]; } return hi - lo; }
  // DE-SKIN — some catalog GLBs ship as rigged SkinnedMeshes (e.g. rampage-missile). Skinned vertices
  // are posed by the skeleton in WORLD space and ignore their parent's transform, so heading rotation
  // had no effect (the model rendered the same at every rotZ). We never play the rig, so bake the bind
  // (rest) pose into a static Mesh that follows its parent normally. Helps any rigged model.
  function deskin(root) {
    const skins = []; root.traverse(o => { if (o.isSkinnedMesh) skins.push(o); });
    if (!skins.length) return root;
    try { root.updateMatrixWorld(true); } catch (e) {}
    for (const sk of skins) {
      try {
        if (sk.skeleton && sk.skeleton.update) sk.skeleton.update();
        const g = sk.geometry, pos = g.attributes && g.attributes.position; if (!pos) continue;
        const n = pos.count, arr = new Float32Array(n * 3), v = new THREE.Vector3();
        const fn = sk.applyBoneTransform ? 'applyBoneTransform' : (sk.boneTransform ? 'boneTransform' : null);
        for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i); if (fn) sk[fn](i, v); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
        const baked = new THREE.BufferGeometry();
        baked.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        if (g.attributes.uv) baked.setAttribute('uv', g.attributes.uv.clone());
        if (g.index) baked.setIndex(g.index.clone());
        baked.computeVertexNormals();
        const mesh = new THREE.Mesh(baked, sk.material);
        mesh.position.copy(sk.position); mesh.quaternion.copy(sk.quaternion); mesh.scale.copy(sk.scale);
        if (sk.parent) { sk.parent.add(mesh); sk.parent.remove(sk); }
      } catch (e) {}
    }
    return root;
  }
  function buildInner(raw, style) {
    const obj = raw.clone(true);   // master is already de-skinned (loadRaw); clone is a plain static hierarchy
    // apply canonical orientation FIRST (lay-down rx, then heading-align ry), then re-centre + scale
    // the oriented result so the model sits centred and unit-sized regardless of how it was authored.
    const cr = canonicalOrient(raw);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), cr.rx);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cr.ry);
    obj.quaternion.premultiply(qy.multiply(qx));   // qx (lay flat) first, then qy (nose → -Z)
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1;
    obj.position.sub(c);
    const wrap = new THREE.Group(); wrap.add(obj); wrap.scale.setScalar(1 / maxd);
    return applyStyle(wrap, style);
  }
  // free three.js GPU resources of a MASTER scene (geometries, materials, textures).
  // Only ever call on rawCache masters — clones share these references. Kept PRIVATE
  // (reachable only through forget()) so no other file can aim it at a clone.
  function disposeObject(obj) {
    if (!obj || !obj.traverse) return;
    obj.traverse(o => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture && v.dispose) v.dispose(); } if (m.dispose) m.dispose(); });
    });
  }
  // dispose + evict ONE master. This is the only door into rawCache from outside, and it
  // exists so that purge() (models3d.js) can drop a model without ever holding the Map:
  // dispose-and-delete stay one indivisible step owned by the file that owns the masters.
  function forget(id) {
    if (!rawCache.has(id)) return;
    rawCache.get(id).then(disposeObject).catch(() => {});   // master owns the GPU resources
    rawCache.delete(id);
  }

  window.Models3DGeo = {
    init(hooks) { watchLoad = (hooks && hooks.watchLoad) || null; },
    fileOf, loadRaw, buildInner, forget,
  };
})();
