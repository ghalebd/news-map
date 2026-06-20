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

  // merge several indexed box geometries into one (MeshBasicMaterial is unlit, so normals/uvs don't matter)
  function mergeGeos(geos) {
    let vCount = 0, iCount = 0;
    geos.forEach(g => { vCount += g.attributes.position.count; iCount += g.index.count; });
    const pos = new Float32Array(vCount * 3), idx = (vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount));
    let vo = 0, io = 0;
    geos.forEach(g => { const p = g.attributes.position.array, ix = g.index.array; pos.set(p, vo * 3); for (let k = 0; k < ix.length; k++) idx[io + k] = ix[k] + vo; vo += g.attributes.position.count; io += ix.length; });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
  const box = (w, l, h, x, y, z) => { const g = new THREE.BoxGeometry(w, l, h); g.translate(x || 0, y || 0, z || 0); return g; };

  // SOLID, chunky silhouettes (no thin masts/fins that read as "sticks"), with real height so they
  // stay readable even at a low/near-horizontal camera angle. Pointing +Y (nose/bow forward).
  function planeGeo() {
    return mergeGeos([
      box(0.30, 1.6, 0.30, 0, 0.05, 0),     // chunky fuselage (nose toward +Y)
      box(1.7, 0.55, 0.18, 0, -0.05, 0),    // thick main wings (span along X)
      box(0.7, 0.36, 0.16, 0, -0.66, 0),    // tailplane
      box(0.20, 0.40, 0.46, 0, -0.62, 0.24),// vertical tail fin (chunky block, not a sliver)
    ]);
  }
  function shipGeo() {
    return mergeGeos([
      box(0.52, 1.5, 0.34, 0, 0, 0.0),      // chunky hull
      box(0.52, 0.42, 0.22, 0, 0.66, 0.10), // raised bow (toward +Y)
      box(0.46, 0.7, 0.6, 0, -0.18, 0.46),  // tall solid bridge/superstructure (vertical presence)
      box(0.5, 0.22, 0.26, 0, -0.74, 0.14), // stern block
    ]);
  }

  const customLayer = {
    id: 'tracking3d', type: 'custom', renderingMode: '3d',
    onAdd(map, gl) {
      // build the scene/meshes ONCE and reuse across style swaps (MapLibre re-adds the
      // custom layer on style.load) so we never leak InstancedMeshes/geometry/materials
      if (!this.scene) {
        this.cam = new THREE.Camera(); this.scene = new THREE.Scene();
        // unlit, always-visible flat colour (fast + clear on air)
        this.shipMat = new THREE.MeshBasicMaterial({ color: 0x3ad6ff });
        this.planeMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
        this.ships = new THREE.InstancedMesh(shipGeo(), this.shipMat, MAXS); this.ships.frustumCulled = false; this.ships.count = 0;
        this.planes = new THREE.InstancedMesh(planeGeo(), this.planeMat, MAXF); this.planes.frustumCulled = false; this.planes.count = 0;
        this.scene.add(this.ships, this.planes);
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

  function setInst(mesh, i, lat, lng, altM, heading, sizeM) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], altM || 0);
    const mpu = mc.meterInMercatorCoordinateUnits(), sc = sizeM * mpu;
    tmpP.set(mc.x, mc.y, mc.z);
    tmpQ.setFromAxisAngle(upZ, (180 + (heading || 0)) * D2R);   // face the heading (clockwise from north; +Z is up in mercator space)
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
    if (i || j || layer._lastN) glmap.triggerRepaint();   // skip the repaint when there's nothing (and nothing was) shown
    layer._lastN = i + j;
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
