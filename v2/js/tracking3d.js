/* ============================================================
   TRACKING3D — live ships & flights as LIGHTWEIGHT 3D shapes in
   the 3D map. Uses two THREE InstancedMeshes (one for ships, one
   for planes) so hundreds of targets render in a single draw call
   each — fast enough for live tracking. Positions/headings come
   from window.Tracking (Ships.ships / Flights.flights), refreshed
   on a timer while in 3D. config.track3d (synced): { on, shipKm,
   planeKm, realAlt }.
   ============================================================ */
(() => {
  const S = window.Store, THREE = window.THREE;
  if (!S || !THREE) { return; }
  const D2R = Math.PI / 180;
  const MAXS = 600, MAXF = 600;
  const cfg = () => Object.assign({ on: true, shipKm: 5, planeKm: 4, realAlt: true }, S.cfg().track3d || {});
  const TS = () => S.cfg().trackStyle || {};

  let glmap = null, layer = null, timer = null;
  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), upZ = new THREE.Vector3(0, 0, 1);

  // simple low-poly shapes, built pointing +Y (forward), lying in the ground plane
  function planeGeo() { const g = new THREE.ConeGeometry(0.34, 1.5, 4); g.scale(1, 1, 0.5); return g; }   // 4-sided dart
  function shipGeo() { const g = new THREE.BoxGeometry(0.32, 1.1, 0.28); return g; }                       // long narrow hull

  const customLayer = {
    id: 'tracking3d', type: 'custom', renderingMode: '3d',
    onAdd(map, gl) {
      this.cam = new THREE.Camera(); this.scene = new THREE.Scene();
      // unlit, always-visible flat colour (fast + clear on air); the 3D shape reads
      // from its silhouette under the tilted camera
      this.shipMat = new THREE.MeshBasicMaterial({ color: 0x3ad6ff });
      this.planeMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
      this.ships = new THREE.InstancedMesh(shipGeo(), this.shipMat, MAXS); this.ships.frustumCulled = false; this.ships.count = 0;
      this.planes = new THREE.InstancedMesh(planeGeo(), this.planeMat, MAXF); this.planes.frustumCulled = false; this.planes.count = 0;
      this.scene.add(this.ships, this.planes);
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      layer = this; update();
    },
    render(gl, args) {
      if (!this.scene) return;
      const m = (args && args.defaultProjectionData) ? args.defaultProjectionData.mainMatrix : args;
      this.cam.projectionMatrix = new THREE.Matrix4().fromArray(m);
      this.renderer.resetState(); this.renderer.render(this.scene, this.cam);
    },
  };

  function setInst(mesh, i, lat, lng, altM, heading, sizeM) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], altM || 0);
    const mpu = mc.meterInMercatorCoordinateUnits(), sc = sizeM * mpu;
    tmpP.set(mc.x, mc.y, mc.z);
    tmpQ.setFromAxisAngle(upZ, (180 - (heading || 0)) * D2R);   // face the heading (cw from north)
    tmpS.set(sc, sc, sc);
    tmpM.compose(tmpP, tmpQ, tmpS);
    mesh.setMatrixAt(i, tmpM);
  }

  function update() {
    if (!layer || !glmap) return;
    const c = cfg();
    layer.shipMat.color.set(TS().shipColor || '#3ad6ff');
    layer.planeMat.color.set(TS().flightColor || '#ffd166');
    const T = window.Tracking;
    let i = 0, j = 0;
    if (c.on && T) {
      if (T.Ships && T.Ships.on && T.Ships.ships) for (const [, s] of T.Ships.ships) { if (i >= MAXS) break; setInst(layer.ships, i, s.lat, s.lng, 0, s.course || s.heading || 0, c.shipKm * 1000); i++; }
      if (T.Flights && T.Flights.on && T.Flights.flights) for (const [, f] of T.Flights.flights) { if (j >= MAXF) break; const altM = c.realAlt ? (f.alt || 0) * 0.3048 : 0; setInst(layer.planes, j, f.lat, f.lng, altM, f.heading || 0, c.planeKm * 1000); j++; }
    }
    layer.ships.count = i; layer.ships.instanceMatrix.needsUpdate = true;
    layer.planes.count = j; layer.planes.instanceMatrix.needsUpdate = true;
    glmap.triggerRepaint();
  }

  function attach3D(map) {
    glmap = map;
    if (!map.getLayer('tracking3d')) { try { map.addLayer(customLayer); } catch (e) { console.warn('Tracking3D layer', e); return; } }
    layer = customLayer; update();
  }

  // refresh on a timer while in 3D (positions update slowly), and on store changes
  timer = setInterval(() => { if (window.Map3D && Map3D.on) update(); }, 700);
  S.on((st, evt) => { if ((evt === 'tracking' || evt === 'config' || evt === 'sync' || evt === 'track3d') && window.Map3D && Map3D.on) update(); });

  window.Tracking3D = { attach3D, refresh: update, _counts() { return (layer && layer.ships) ? { ships: layer.ships.count, planes: layer.planes.count } : null; } };
})();
