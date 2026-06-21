/* ============================================================
   TRACKING3D — live ships & flights as REAL 3D GLB models in the
   3D map, rendered with InstancedMesh (one draw call per type) so
   hundreds of targets stay LIGHT and fast. One ship GLB + one plane
   GLB are loaded once, merged + normalized + stood upright, then
   drawn at every live MercatorCoordinate, rotated to heading.
   config.track3d (synced): { on, shipKm, planeKm }.
   ============================================================ */
(() => {
  const S = window.Store, THREE = window.THREE;
  if (!S || !THREE || !THREE.GLTFLoader) { return; }
  const D2R = Math.PI / 180;
  const MAXS = 3000, MAXF = 3000;
  const SHIP_GLB = 'cargo-ship.glb', PLANE_GLB = 'a-330.glb';   // cargo ship: Alex Safayan / Poly Pizza (CC-BY)
  const SHIP_FWD = 180, PLANE_FWD = 180;            // heading calibration (deg) per model
  const SHIP_MUL = 0.42, PLANE_MUL = 0.42;          // size factor (km slider × this) — kept small/proportional
  const PLANE_ALT_CAP = 2600;                       // metres — keep aircraft at a sensible visual height
  const cfg = () => Object.assign({ on: true, shipKm: 5, planeKm: 4 }, S.cfg().track3d || {});
  let glmap = null, layer = null;

  const loader = new THREE.GLTFLoader();
  try { if (THREE.DRACOLoader) { const d = new THREE.DRACOLoader(); d.setDecoderPath('lib/draco/'); loader.setDRACOLoader(d); } } catch (e) {}

  // merge a GLB into ONE unit-sized geometry (Z-up, base z=0). Each mesh's material colour is
  // baked into per-vertex colours so the model keeps its REAL colours in a single instanced mesh.
  function mergeScene(scene) {
    scene.updateMatrixWorld(true);
    const parts = [];
    scene.traverse(o => {
      if (!(o.isMesh && o.geometry)) return;
      let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.index) g = g.toNonIndexed(); if (!g.getAttribute('normal')) g.computeVertexNormals();
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const col = (m && m.color) ? m.color : new THREE.Color(0xbcc8d4);
      const n = g.getAttribute('position').count, ca = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { ca[k * 3] = col.r; ca[k * 3 + 1] = col.g; ca[k * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      parts.push(g);
    });
    if (!parts.length) return null;
    let nv = 0; parts.forEach(g => nv += g.getAttribute('position').count);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), colr = new Float32Array(nv * 3); let o = 0;
    parts.forEach(g => { pos.set(g.getAttribute('position').array, o * 3); nor.set(g.getAttribute('normal').array, o * 3); colr.set(g.getAttribute('color').array, o * 3); o += g.getAttribute('position').count; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.computeBoundingBox(); const bb = geo.boundingBox, c = new THREE.Vector3(), sz = new THREE.Vector3(); bb.getCenter(c); bb.getSize(sz);
    geo.translate(-c.x, -bb.min.y, -c.z);                       // centre XZ, base on Y=0
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1; geo.scale(1 / maxd, 1 / maxd, 1 / maxd);
    geo.rotateX(Math.PI / 2);                                   // Y-up model -> Z-up world (base stays at z=0)
    return geo;
  }
  const loadModel = file => new Promise(res => loader.load('assets3d/' + file, g => res(mergeScene(g.scene)), undefined, () => res(null)));

  /* ---- GLOBE fallback: native billboard icons (3D meshes can't render in the globe projection,
        so on the globe we show flat icons that always face the camera and rotate to heading) ---- */
  const ICO_SRC = 'trk3d-ico', ICO_LYR = 'trk3d-ico-sym';
  function drawIcon(kind, color) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.scale(2, 2);
    x.lineJoin = x.lineCap = 'round'; x.strokeStyle = 'rgba(3,10,20,.92)'; x.lineWidth = 3; x.fillStyle = color;
    const poly = pts => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); x.stroke(); };
    if (kind === 'plane') poly([[32, 7], [37, 17], [37, 30], [60, 43], [60, 49], [37, 42], [37, 52], [46, 58], [46, 61], [32, 57], [18, 61], [18, 58], [27, 52], [27, 42], [4, 49], [4, 43], [27, 30], [27, 17]]);
    else { poly([[32, 6], [43, 22], [43, 50], [38, 58], [26, 58], [21, 50], [21, 22]]); x.fillStyle = 'rgba(3,12,22,.85)'; x.fillRect(27, 30, 10, 16); }
    return x.getImageData(0, 0, 128, 128);
  }
  // render a merged GLB geometry to a 3/4-view sprite (so globe icons look like the 3D models,
  // not flat outlines). One-shot offscreen WebGL render, disposed immediately.
  const sprites = {};   // kind -> ImageData
  function spriteFromGeo(geo) {
    try {
      const W = 192, cv = document.createElement('canvas'); cv.width = cv.height = W;
      const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); r.setClearColor(0x000000, 0);
      const sc = new THREE.Scene();
      sc.add(new THREE.AmbientLight(0xffffff, 0.95));
      const dl = new THREE.DirectionalLight(0xffffff, 1.05); dl.position.set(1, 1.4, 2); sc.add(dl);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); sc.add(mesh);
      geo.computeBoundingSphere(); const R = (geo.boundingSphere && geo.boundingSphere.radius) || 0.7;
      const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 100); cam.up.set(0, 0, 1);
      cam.position.set(R * 1.6, -R * 2.0, R * 1.7); cam.lookAt(0, 0, R * 0.25);
      r.render(sc, cam);
      const c2 = document.createElement('canvas'); c2.width = c2.height = W; const x = c2.getContext('2d'); x.drawImage(cv, 0, 0);
      const img = x.getImageData(0, 0, W, W); r.dispose(); return img;
    } catch (e) { return null; }
  }
  function ensureIcons(map) {
    const TS = S.cfg().trackStyle || {};
    [['trk-ship', 'ship', TS.shipColor || '#36c8ff'], ['trk-plane', 'plane', TS.flightColor || '#ffcf4d']].forEach(([id, k, c]) => {
      const img = sprites[k] || drawIcon(k, c);   // prefer the 3D-rendered sprite; flat icon as fallback
      try { if (map.hasImage(id)) map.removeImage(id); } catch (e) {} try { map.addImage(id, img, { pixelRatio: 2 }); } catch (e) {}
    });
  }
  function icoFeatures() {
    const c = cfg(), T = window.Tracking, f = [];
    const pt = (lng, lat, kind, hdg) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { kind, hdg: Math.round(hdg) || 0 } });
    if (c.on && T) {
      if (T.Ships && T.Ships.on && T.Ships.ships) for (const [, s] of T.Ships.ships) { if (s.lat != null) f.push(pt(s.lng, s.lat, 'ship', s.course != null ? s.course : (s.heading || 0))); }
      if (T.Flights && T.Flights.on && T.Flights.flights) for (const [, p] of T.Flights.flights) { if (p.lat != null) f.push(pt(p.lng, p.lat, 'plane', p.heading || 0)); }
    }
    return { type: 'FeatureCollection', features: f };
  }

  // procedural CARGO (container) ship — bow toward +Y, up +Z, base z=0. A container vessel is
  // genuinely box-shaped, so this reads true and is extremely light. Built to the same
  // unit-size / Z-up / base-z=0 convention as the merged GLBs.
  const box = (w, l, h, x, y, z) => { const g = new THREE.BoxGeometry(w, l, h); g.translate(x, y, z); return g; };
  function mergeBoxes(geos) {
    const parts = geos.map(g => g.toNonIndexed());
    let nv = 0; parts.forEach(g => nv += g.getAttribute('position').count);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3); let o = 0;
    parts.forEach(g => { pos.set(g.getAttribute('position').array, o * 3); nor.set(g.getAttribute('normal').array, o * 3); o += g.getAttribute('position').count; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return geo;
  }
  function buildCargoShipGeo() {
    const geo = mergeBoxes([
      box(0.34, 1.55, 0.16, 0, 0, 0.08),     // hull
      box(0.24, 0.36, 0.14, 0, 0.82, 0.07),  // narrower bow (forward +Y)
      box(0.32, 0.32, 0.20, 0, 0.36, 0.26),  // container stack fwd
      box(0.32, 0.32, 0.24, 0, 0.00, 0.28),  // container stack mid (tallest)
      box(0.32, 0.32, 0.18, 0, -0.36, 0.25), // container stack aft
      box(0.30, 0.20, 0.34, 0, -0.70, 0.33), // bridge/superstructure (stern)
      box(0.09, 0.12, 0.14, 0, -0.74, 0.55), // funnel
    ]);
    geo.computeBoundingBox(); const bb = geo.boundingBox, c = new THREE.Vector3(), sz = new THREE.Vector3(); bb.getCenter(c); bb.getSize(sz);
    geo.translate(-c.x, -c.y, -bb.min.z);                       // centre XY, base on z=0 (waterline)
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1; geo.scale(1 / maxd, 1 / maxd, 1 / maxd);
    return geo;
  }

  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), upZ = new THREE.Vector3(0, 0, 1);
  function setInst(mesh, i, lat, lng, altM, heading, km, fwd) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], altM || 0);   // sea level (fast — no per-instance terrain query)
    const sc = Math.max(10, (km || 1) * 1000) * mc.meterInMercatorCoordinateUnits();
    tmpP.set(mc.x, mc.y, mc.z);
    tmpQ.setFromAxisAngle(upZ, (fwd - (heading || 0)) * D2R);
    tmpS.set(sc, sc, sc);
    tmpM.compose(tmpP, tmpQ, tmpS);
    mesh.setMatrixAt(i, tmpM);
  }

  const customLayer = {
    id: 'trk3d', type: 'custom', renderingMode: '3d',
    onAdd(map, gl) {
      if (!this.scene) {
        this.cam = new THREE.Camera(); this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(0.4, 1.3, 0.7); this.scene.add(key);
        const fill = new THREE.DirectionalLight(0xcfe0f5, 0.35); fill.position.set(-0.6, 0.5, -0.4); this.scene.add(fill);
        // light, low-saturation finishes so they read as clean models, not loud blobs
        // vertex colours carry the model's real materials (container colours, livery, etc.)
        this.shipMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.planeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        loadModel(SHIP_GLB).then(g => { if (!g) return; this.ships = new THREE.InstancedMesh(g, this.shipMat, MAXS); this.ships.frustumCulled = false; this.ships.count = 0; this.scene.add(this.ships); sprites.ship = spriteFromGeo(g); if (glmap) ensureIcons(glmap); update(); });
        loadModel(PLANE_GLB).then(g => { if (!g) return; this.planes = new THREE.InstancedMesh(g, this.planeMat, MAXF); this.planes.frustumCulled = false; this.planes.count = 0; this.scene.add(this.planes); sprites.plane = spriteFromGeo(g); if (glmap) ensureIcons(glmap); update(); });
      }
      if (!this.renderer || this._gl !== gl) { this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true }); this.renderer.autoClear = false; this._gl = gl; }
      layer = this; update();
    },
    render(gl, args) {
      if (!this.scene) return;
      const m = (args && args.defaultProjectionData) ? args.defaultProjectionData.mainMatrix : args;
      this.cam.projectionMatrix = new THREE.Matrix4().fromArray(m);
      this.renderer.resetState(); this.renderer.render(this.scene, this.cam);
    },
  };

  function update() {
    if (!layer || !glmap) return;
    let globe = false; try { globe = !!(glmap.getProjection && glmap.getProjection().type === 'globe'); } catch (e) {}
    // GLOBE: 3D meshes don't render in the globe projection → hide them, show native billboard icons.
    if (globe) {
      if (layer.ships) layer.ships.count = 0;
      if (layer.planes) layer.planes.count = 0;
      try {
        const ts = (S.cfg().trackStyle || {}); if ((ts.shipColor || '') + (ts.flightColor || '') !== layer._ic) { ensureIcons(glmap); layer._ic = (ts.shipColor || '') + (ts.flightColor || ''); }
        const src = glmap.getSource(ICO_SRC); if (src) src.setData(icoFeatures());
        if (glmap.getLayer(ICO_LYR)) glmap.setLayoutProperty(ICO_LYR, 'visibility', 'visible');
      } catch (e) {}
      glmap.triggerRepaint(); return;
    }
    try { if (glmap.getLayer(ICO_LYR)) glmap.setLayoutProperty(ICO_LYR, 'visibility', 'none'); } catch (e) {}
    const c = cfg(), T = window.Tracking;
    let i = 0, j = 0;
    if (c.on && T) {
      if (layer.ships && T.Ships && T.Ships.on && T.Ships.ships)
        for (const [, s] of T.Ships.ships) { if (i >= MAXS) break; if (s.lat == null) continue; setInst(layer.ships, i, s.lat, s.lng, 0, s.course != null ? s.course : (s.heading || 0), (c.shipKm || 5) * SHIP_MUL, SHIP_FWD); i++; }
      if (layer.planes && T.Flights && T.Flights.on && T.Flights.flights)
        for (const [, f] of T.Flights.flights) { if (j >= MAXF) break; if (f.lat == null) continue; setInst(layer.planes, j, f.lat, f.lng, Math.min((f.alt || 0) * 0.3048, PLANE_ALT_CAP), f.heading || 0, (c.planeKm || 4) * PLANE_MUL, PLANE_FWD); j++; }
    }
    if (layer.ships) { layer.ships.count = i; layer.ships.instanceMatrix.needsUpdate = true; }
    if (layer.planes) { layer.planes.count = j; layer.planes.instanceMatrix.needsUpdate = true; }
    if (i || j || layer._n) glmap.triggerRepaint();
    layer._n = i + j;
  }

  function attach3D(map) {
    glmap = map;
    if (!map.getLayer('trk3d')) { try { map.addLayer(customLayer); } catch (e) { console.warn('Tracking3D', e); return; } }
    layer = customLayer;
    try {
      ensureIcons(map);
      if (!map.getSource(ICO_SRC)) map.addSource(ICO_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!map.getLayer(ICO_LYR)) map.addLayer({
        id: ICO_LYR, type: 'symbol', source: ICO_SRC,
        layout: {
          'icon-image': ['match', ['get', 'kind'], 'plane', 'trk-plane', 'trk-ship'],
          // small + zoom-responsive so they don't dominate the globe
          'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.13, 5, 0.22, 8, 0.34],
          'icon-pitch-alignment': 'viewport',   // face the camera (billboard); NO heading rotation (avoids the flipped look)
          'icon-allow-overlap': false, 'icon-ignore-placement': false,   // let MapLibre declutter overlapping icons
          'visibility': 'none',
        },
      });
    } catch (e) { console.warn('Tracking3D icons', e); }
    update();
  }

  setInterval(() => { if (window.Map3D && Map3D.on) update(); }, 600);
  S.on((st, evt) => { if ((evt === 'tracking' || evt === 'config' || evt === 'sync' || evt === 'track3d') && window.Map3D && Map3D.on) update(); });

  window.Tracking3D = {
    attach3D, refresh: update,
    _counts() { try { const f = icoFeatures().features; const ig = layer && layer.ships && layer.ships.count === 0 && f.length; if (ig) return { ships: f.filter(x => x.properties.kind === 'ship').length, planes: f.filter(x => x.properties.kind === 'plane').length }; } catch (e) {} return layer ? { ships: (layer.ships && layer.ships.count) || 0, planes: (layer.planes && layer.planes.count) || 0 } : null; },
  };
})();
