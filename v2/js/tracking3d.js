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
  const MAXS = 800, MAXF = 800;
  const SHIP_GLB = 'us-coastguard-nsc.glb', PLANE_GLB = 'a-330.glb';
  const SHIP_FWD = 180, PLANE_FWD = 180;            // heading calibration (deg) per model
  const SHIP_MUL = 0.42, PLANE_MUL = 0.42;          // size factor (km slider × this) — kept small/proportional
  const PLANE_ALT_CAP = 2600;                       // metres — keep aircraft at a sensible visual height
  const cfg = () => Object.assign({ on: true, shipKm: 5, planeKm: 4 }, S.cfg().track3d || {});
  let glmap = null, layer = null;

  const loader = new THREE.GLTFLoader();
  try { if (THREE.DRACOLoader) { const d = new THREE.DRACOLoader(); d.setDecoderPath('lib/draco/'); loader.setDRACOLoader(d); } } catch (e) {}

  // merge a GLB into ONE unit-sized geometry, then stand it upright (Z-up) with its base at z=0
  function mergeScene(scene) {
    scene.updateMatrixWorld(true);
    const parts = [];
    scene.traverse(o => { if (o.isMesh && o.geometry) { let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.index) g = g.toNonIndexed(); if (!g.getAttribute('normal')) g.computeVertexNormals(); parts.push(g); } });
    if (!parts.length) return null;
    let nv = 0; parts.forEach(g => nv += g.getAttribute('position').count);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3); let o = 0;
    parts.forEach(g => { pos.set(g.getAttribute('position').array, o * 3); nor.set(g.getAttribute('normal').array, o * 3); o += g.getAttribute('position').count; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.computeBoundingBox(); const bb = geo.boundingBox, c = new THREE.Vector3(), sz = new THREE.Vector3(); bb.getCenter(c); bb.getSize(sz);
    geo.translate(-c.x, -bb.min.y, -c.z);                       // centre XZ, base on Y=0
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1; geo.scale(1 / maxd, 1 / maxd, 1 / maxd);
    geo.rotateX(Math.PI / 2);                                   // Y-up model -> Z-up world (base stays at z=0)
    return geo;
  }
  const loadModel = file => new Promise(res => loader.load('assets3d/' + file, g => res(mergeScene(g.scene)), undefined, () => res(null)));

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
        this.shipMat = new THREE.MeshLambertMaterial({ color: 0xbcc8d4 });
        this.planeMat = new THREE.MeshLambertMaterial({ color: 0xe9edf2 });
        { const g = buildCargoShipGeo(); this.ships = new THREE.InstancedMesh(g, this.shipMat, MAXS); this.ships.frustumCulled = false; this.ships.count = 0; this.scene.add(this.ships); }
        loadModel(PLANE_GLB).then(g => { if (!g) return; this.planes = new THREE.InstancedMesh(g, this.planeMat, MAXF); this.planes.frustumCulled = false; this.planes.count = 0; this.scene.add(this.planes); update(); });
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
    layer = customLayer; update();
  }

  setInterval(() => { if (window.Map3D && Map3D.on) update(); }, 600);
  S.on((st, evt) => { if ((evt === 'tracking' || evt === 'config' || evt === 'sync' || evt === 'track3d') && window.Map3D && Map3D.on) update(); });

  window.Tracking3D = {
    attach3D, refresh: update,
    _counts() { return layer ? { ships: (layer.ships && layer.ships.count) || 0, planes: (layer.planes && layer.planes.count) || 0 } : null; },
  };
})();
