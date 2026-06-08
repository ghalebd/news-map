/* ============================================================
   MODELS3D — render uploaded GLB assets on BOTH maps.
   • 2D (Leaflet): each model is rendered offscreen with three.js
     to a transparent PNG "billboard" and placed as a draggable
     marker at its lat/lng (so a 3D object reads on the flat map).
   • 3D (MapLibre): a single three.js custom layer places every
     model at its real MercatorCoordinate on the terrain, with
     per-model scale / yaw / altitude.
   Binary GLB comes from window.Assets3D (IndexedDB, shared by
   both windows); metadata (lat/lng/scale/rotZ/mode/on) is synced
   through the Store (event 'models3d'). Runs in control + presenter.
   ============================================================ */
(() => {
  const S = window.Store, L2 = window.GameMap && window.GameMap.map;
  const THREE = window.THREE;
  if (!S || !L2 || !THREE || !THREE.GLTFLoader) { console.warn('Models3D: deps missing'); return; }
  const loader = new THREE.GLTFLoader();
  const D2R = Math.PI / 180;
  const models = () => (S.models3d ? S.models3d() : []);

  /* ---- shared GLB loading (id -> Promise<THREE.Object3D raw scene>) ---- */
  const rawCache = new Map();
  function loadRaw(id) {
    if (rawCache.has(id)) return rawCache.get(id);
    const p = (async () => {
      const url = await window.Assets3D.url(id);
      if (!url) throw new Error('no-glb');
      return new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));
    })();
    rawCache.set(id, p);
    return p;
  }
  // a unit-sized, origin-centred, Y-up clone of the model
  function normalized(raw) {
    const obj = raw.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1;
    obj.position.sub(c);
    const wrap = new THREE.Group(); wrap.add(obj); wrap.scale.setScalar(1 / maxd);
    return wrap;
  }
  function invalidate(id) { rawCache.delete(id); for (const k of [...billboards.keys()]) if (k.indexOf(id + ':') === 0) billboards.delete(k); }

  /* ============ 2D billboard: offscreen three.js -> PNG ============ */
  const BB = 256;
  let rdr = null, bscene = null, bcam = null;
  function ensureOffscreen() {
    if (rdr) return true;
    try {
      rdr = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      rdr.setSize(BB, BB); rdr.setClearColor(0x000000, 0);
      bscene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(0xffffff, 0x223044, 1.15); bscene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 1.5); dir.position.set(2, 4, 3); bscene.add(dir);
      bcam = new THREE.PerspectiveCamera(32, 1, 0.01, 100); bcam.position.set(1.5, 1.25, 1.9); bcam.lookAt(0, 0, 0);
    } catch (e) { console.warn('Models3D offscreen failed', e); return false; }
    return true;
  }
  const billboards = new Map();   // `${id}:${rotZ}` -> Promise<dataURL>
  function billboard(id, rotZ) {
    const key = id + ':' + Math.round(rotZ || 0);
    if (billboards.has(key)) return billboards.get(key);
    const p = (async () => {
      if (!ensureOffscreen()) return null;
      const raw = await loadRaw(id); const obj = normalized(raw);
      obj.rotation.y = (rotZ || 0) * D2R;
      const root = new THREE.Group(); root.add(obj); bscene.add(root);
      try { rdr.render(bscene, bcam); return rdr.domElement.toDataURL('image/png'); }
      finally { bscene.remove(root); }
    })().catch(() => null);
    billboards.set(key, p);
    return p;
  }

  /* ============ 2D Leaflet markers ============ */
  const markers = new Map();   // id -> L.marker
  function px(m) { return Math.max(28, Math.min(200, Math.round(60 * ((m.scale || 1) / 10 + 0.4)))); }
  async function place2D(m) {
    const url = await billboard(m.id, m.rotZ);
    if (!url) return;
    const s = px(m), icon = L.icon({ iconUrl: url, iconSize: [s, s], iconAnchor: [s / 2, Math.round(s * 0.82)], className: 'm3d-billboard' });
    let mk = markers.get(m.id);
    if (!mk) {
      mk = L.marker([m.lat, m.lng], { icon, draggable: true, keyboard: false, zIndexOffset: 500 });
      mk.on('dragend', () => { const ll = mk.getLatLng(); S.updateModel3d(m.id, { lat: ll.lat, lng: ll.lng }); });
      mk.addTo(L2); markers.set(m.id, mk);
    } else { mk.setIcon(icon); mk.setLatLng([m.lat, m.lng]); }
  }
  function sync2D() {
    const live = models().filter(m => m.on !== false && m.mode !== '3d');
    const keep = new Set(live.map(m => m.id));
    for (const [id, mk] of markers) if (!keep.has(id)) { L2.removeLayer(mk); markers.delete(id); }
    live.forEach(place2D);
  }

  /* ============ 3D MapLibre custom layer ============ */
  let glmap = null, layer = null;
  const groups = new Map();   // id -> { group, inner, loading, failed }
  const customLayer = {
    id: 'models3d-gl', type: 'custom', renderingMode: '3d',
    onAdd(map, gl) {
      this.cam = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223044, 1.1));
      const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(0.5, -1, 1); this.scene.add(d);
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
    },
    render(gl, matrix) {
      if (!this.scene) return;
      this.cam.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.cam);
    },
  };
  function ensureGroup(m, scene) {
    let g = groups.get(m.id);
    if (g) return g;
    g = { group: new THREE.Group(), inner: null, loading: true };
    g.group.visible = false; scene.add(g.group); groups.set(m.id, g);
    loadRaw(m.id).then(raw => { g.inner = normalized(raw); g.group.add(g.inner); g.loading = false; update3D(); })
      .catch(() => { g.failed = true; g.loading = false; });
    return g;
  }
  function update3D() {
    if (!glmap || !layer || !layer.scene) return;
    const scene = layer.scene;
    const want = new Set(models().filter(m => m.on !== false && m.mode !== '2d').map(m => m.id));
    for (const [id, g] of groups) if (!want.has(id)) { scene.remove(g.group); groups.delete(id); }
    models().forEach(m => {
      if (m.on === false || m.mode === '2d') return;
      const g = ensureGroup(m, scene);
      if (!g.inner) return;
      try {
        let ground = 0; try { ground = glmap.queryTerrainElevation ? (glmap.queryTerrainElevation([m.lng, m.lat]) || 0) : 0; } catch (e) {}
        const mc = maplibregl.MercatorCoordinate.fromLngLat([m.lng, m.lat], ground + (m.alt || 0));
        const mpu = mc.meterInMercatorCoordinateUnits();      // mercator units per metre at this latitude
        const meters = Math.max(10, (m.scale || 1) * 1000);   // scale slider ≈ size in km
        g.group.position.set(mc.x, mc.y, mc.z);
        g.group.scale.set(meters * mpu, meters * mpu, meters * mpu);
        g.group.rotation.x = Math.PI / 2;                     // Y-up model -> Z-up world (stand upright)
        g.inner.rotation.y = (m.rotZ || 0) * D2R;             // yaw
        g.group.visible = true;
      } catch (e) { /* placement guard — never poison the load state */ }
    });
    glmap.triggerRepaint();
  }
  function attach3D(map) {
    glmap = map;
    if (!map.getLayer('models3d-gl')) { try { map.addLayer(customLayer); } catch (e) { console.warn('Models3D 3D layer', e); return; } }
    layer = customLayer;
    groups.clear();   // style (re)loaded — the custom-layer scene was rebuilt, so repopulate it
    update3D();
  }

  /* ---- wiring ---- */
  function syncAll() { sync2D(); if (window.Map3D && Map3D.on) update3D(); }
  S.on((st, evt) => {
    if (evt === 'models3d' || evt === 'sync') {
      // a metadata change may invalidate cached billboards (rotation) — drop & rebuild those
      if (evt === 'models3d') billboards.clear();
      syncAll();
    }
  });
  window.Models3D = {
    attach3D,
    refresh: syncAll,
    invalidate,            // call after a GLB is (re)uploaded for an id
    has2D: id => markers.has(id),
    _groups: groups,       // test hook
  };
  syncAll();
})();
