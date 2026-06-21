/* ============================================================
   TRACKING3D — live ships & flights as REAL 3D GLB MODELS in the
   3D map (same quality as placed models). One ship GLB + one plane
   GLB are loaded once, each merged into a single mesh, then cloned
   into a pooled set placed at the live MercatorCoordinates and
   rotated to heading — lit, upright, on the water/at altitude.
   config.track3d (synced): { on, shipKm, planeKm }.
   ============================================================ */
(() => {
  const S = window.Store, THREE = window.THREE;
  if (!S || !THREE || !THREE.GLTFLoader) { return; }
  const D2R = Math.PI / 180;
  const CAP = 70;                         // max rendered targets per type (nearest first)
  const SHIP_GLB = 'us-coastguard-nsc.glb', PLANE_GLB = 'a-330.glb';
  const SHIP_FWD = 0, PLANE_FWD = 0;      // heading calibration offset (deg), tuned per model
  const cfg = () => Object.assign({ on: true, shipKm: 5, planeKm: 4 }, S.cfg().track3d || {});
  const TS = () => S.cfg().trackStyle || {};
  let glmap = null, layer = null;

  const loader = new THREE.GLTFLoader();
  try { if (THREE.DRACOLoader) { const d = new THREE.DRACOLoader(); d.setDecoderPath('lib/draco/'); loader.setDRACOLoader(d); } } catch (e) {}

  // merge a loaded GLB into ONE unit-sized, Y-up, origin-centred geometry (sits on Y=0 = waterline)
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
    return geo;
  }
  const loadModel = file => new Promise(res => loader.load('assets3d/' + file, g => res(mergeScene(g.scene)), undefined, () => res(null)));

  function buildPool(L, kind) {
    const geo = kind === 'ship' ? L.shipGeo : L.planeGeo; if (!geo) return;
    const mat = kind === 'ship' ? L.shipMat : L.planeMat;
    const pool = [];
    for (let i = 0; i < CAP; i++) {
      const grp = new THREE.Group(); grp.rotation.x = Math.PI / 2;             // Y-up model -> Z-up world (upright)
      const inner = new THREE.Mesh(geo, mat); inner.rotation.order = 'YXZ';
      grp.add(inner); grp.visible = false; L.scene.add(grp);
      pool.push({ grp, inner });
    }
    if (kind === 'ship') L.shipPool = pool; else L.planePool = pool;
  }

  const customLayer = {
    id: 'trk3d', type: 'custom', renderingMode: '3d',
    onAdd(map, gl) {
      if (!this.scene) {
        this.cam = new THREE.Camera(); this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
        const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(0.5, 1.2, 0.8); this.scene.add(key);
        const fill = new THREE.DirectionalLight(0xbcd4ff, 0.4); fill.position.set(-0.6, 0.4, -0.5); this.scene.add(fill);
        this.shipMat = new THREE.MeshLambertMaterial({ color: 0x9fb7c9 });
        this.planeMat = new THREE.MeshLambertMaterial({ color: 0xe8eef5 });
        this.shipPool = []; this.planePool = [];
        loadModel(SHIP_GLB).then(g => { this.shipGeo = g; buildPool(this, 'ship'); update(); });
        loadModel(PLANE_GLB).then(g => { this.planeGeo = g; buildPool(this, 'plane'); update(); });
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

  function place(item, lat, lng, altM, headingDeg, km, fwd) {
    const ground = (() => { try { return glmap.queryTerrainElevation ? (glmap.queryTerrainElevation([lng, lat]) || 0) : 0; } catch (e) { return 0; } })();
    const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], ground + (altM || 0));
    const mpu = mc.meterInMercatorCoordinateUnits(), meters = Math.max(10, (km || 5) * 1000);
    item.grp.position.set(mc.x, mc.y, mc.z);
    item.grp.scale.setScalar(meters * mpu);
    item.inner.rotation.set(0, (fwd - (headingDeg || 0)) * D2R, 0);   // heading about up (compass cw)
    item.grp.visible = true;
  }

  function update() {
    if (!layer || !glmap) return;
    if (layer.shipMat) layer.shipMat.color.set(TS().shipColor || '#9fb7c9');
    if (layer.planeMat) layer.planeMat.color.set(TS().flightColor || '#e8eef5');
    const c = cfg(), T = window.Tracking;
    let si = 0, pi = 0;
    if (c.on && T) {
      if (layer.shipPool && layer.shipPool.length && T.Ships && T.Ships.on && T.Ships.ships)
        for (const [, s] of T.Ships.ships) { if (si >= CAP) break; if (s.lat == null) continue; place(layer.shipPool[si], s.lat, s.lng, 0, s.course != null ? s.course : (s.heading || 0), c.shipKm, SHIP_FWD); si++; }
      if (layer.planePool && layer.planePool.length && T.Flights && T.Flights.on && T.Flights.flights)
        for (const [, f] of T.Flights.flights) { if (pi >= CAP) break; if (f.lat == null) continue; place(layer.planePool[pi], f.lat, f.lng, (f.alt || 0) * 0.3048, f.heading || 0, c.planeKm, PLANE_FWD); pi++; }
    }
    if (layer.shipPool) for (let i = si; i < layer.shipPool.length; i++) layer.shipPool[i].grp.visible = false;
    if (layer.planePool) for (let i = pi; i < layer.planePool.length; i++) layer.planePool[i].grp.visible = false;
    layer._n = si + pi; if (glmap) glmap.triggerRepaint();
  }

  function attach3D(map) {
    glmap = map;
    if (!map.getLayer('trk3d')) { try { map.addLayer(customLayer); } catch (e) { console.warn('Tracking3D', e); return; } }
    layer = customLayer; update();
  }

  setInterval(() => { if (window.Map3D && Map3D.on) update(); }, 700);
  S.on((st, evt) => { if ((evt === 'tracking' || evt === 'config' || evt === 'sync' || evt === 'track3d') && window.Map3D && Map3D.on) update(); });

  window.Tracking3D = {
    attach3D, refresh: update,
    _counts() { const T = window.Tracking; if (!T) return null; return { ships: (T.Ships && T.Ships.on && T.Ships.ships) ? Math.min(CAP, T.Ships.ships.size) : 0, planes: (T.Flights && T.Flights.on && T.Flights.flights) ? Math.min(CAP, T.Flights.flights.size) : 0 }; },
  };
})();
