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
  // Draco decoder — the bundled catalog models are Draco-compressed (≈20–50× smaller)
  try { if (THREE.DRACOLoader) { const draco = new THREE.DRACOLoader(); draco.setDecoderPath('lib/draco/'); loader.setDRACOLoader(draco); } } catch (e) { console.warn('Models3D: Draco init', e); }
  const D2R = Math.PI / 180;
  const models = () => (S.models3d ? S.models3d() : []);
  // transient per-instance render override (route playback / 3D drag preview) — does
  // NOT touch the Store, so animation never spams persistence/sync.
  const poses = new Map();   // id -> { lat, lng, rotZ?, pitch?, roll?, alt? }
  const eff = m => { const p = poses.get(m.id); return p ? Object.assign({}, m, p) : m; };

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
      return new Promise((res, rej) => loader.load(url, g => res(g.scene), undefined, rej));
    })();
    rawCache.set(id, p);
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
  function buildInner(raw, style) {
    const obj = raw.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const maxd = Math.max(sz.x, sz.y, sz.z) || 1;
    obj.position.sub(c);
    const wrap = new THREE.Group(); wrap.add(obj); wrap.scale.setScalar(1 / maxd);
    return applyStyle(wrap, style);
  }
  // free three.js GPU resources of a MASTER scene (geometries, materials, textures).
  // Only ever call on rawCache masters — clones share these references.
  function disposeObject(obj) {
    if (!obj || !obj.traverse) return;
    obj.traverse(o => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture && v.dispose) v.dispose(); } if (m.dispose) m.dispose(); });
    });
  }
  function dropBillboards(id) { for (const k of [...billboards.keys()]) if (k.indexOf(id + ':') === 0) billboards.delete(k); }
  // fully forget a model (re-upload of same id, or it was deleted): dispose its 2D
  // marker, 3D group, cached scene + billboards, and free the object URL.
  function purge(id) {
    const mk = markers.get(id); if (mk) { L2.removeLayer(mk); markers.delete(id); }
    const g = groups.get(id); if (g) { if (layer && layer.scene) { layer.scene.remove(g.group); if (g.shadow) layer.scene.remove(g.shadow); } groups.delete(id); }   // clone — not disposed
    if (rawCache.has(id)) { rawCache.get(id).then(disposeObject).catch(() => {}); rawCache.delete(id); }   // master owns the GPU resources
    dropBillboards(id);
    if (window.Assets3D && Assets3D.revoke) Assets3D.revoke(id);
  }
  function invalidate(id) { purge(id); }   // re-upload: forget everything so it reloads fresh

  /* ============ 2D billboard: offscreen three.js -> PNG ============ */
  const BB = 256;
  // heading calibration for the TOP-DOWN map/globe billboard: rotZ already carries the route
  // bearing as (bearing+180); this offset turns the top-down render so the model's NOSE points
  // along the travel bearing on screen (north-up). Tuned empirically against the F-16 planform.
  const TOP_OFF = 0;
  let rdr = null, bscene = null, bcam = null, bcamTop = null;
  function ensureOffscreen() {
    if (rdr) return true;
    try {
      rdr = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      rdr.setSize(BB, BB); rdr.setClearColor(0x000000, 0);
      bscene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(0xffffff, 0x223044, 1.15); bscene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 1.5); dir.position.set(2, 4, 3); bscene.add(dir);
      // hero 3/4 view — used for catalog thumbnails (recognisable, no heading)
      bcam = new THREE.PerspectiveCamera(32, 1, 0.01, 100); bcam.position.set(1.5, 1.25, 1.9); bcam.lookAt(0, 0, 0);
      // top-down view — used for MAP markers + globe icons so the nose reads cleanly along the
      // travel direction (broadcast-standard). up = -Z maps world-north to screen-up.
      bcamTop = new THREE.PerspectiveCamera(32, 1, 0.01, 100); bcamTop.up.set(0, 0, -1); bcamTop.position.set(0, 2.72, 0); bcamTop.lookAt(0, 0, 0);
    } catch (e) { console.warn('Models3D offscreen failed', e); return false; }
    return true;
  }
  const billboards = new Map();   // `${id}:${rotZ}:${style}:${view}` -> Promise<dataURL>
  function billboard(m, rotZ, view) {
    const top = view === 'top';
    const key = m.id + ':' + Math.round(rotZ || 0) + ':' + (m.style || 'solid') + ':' + (view || 'hero');
    if (billboards.has(key)) return billboards.get(key);
    const p = (async () => {
      if (!ensureOffscreen()) return null;
      const raw = await loadRaw(m); const obj = buildInner(raw, m.style);
      obj.rotation.y = ((rotZ || 0) + (top ? TOP_OFF : 0)) * D2R;
      const root = new THREE.Group(); root.add(obj); bscene.add(root);
      try { rdr.render(bscene, top ? bcamTop : bcam); return rdr.domElement.toDataURL('image/png'); }
      finally { bscene.remove(root); }
    })().catch(() => null);
    billboards.set(key, p);
    return p;
  }

  /* ============ 2D Leaflet markers + route lines ============ */
  const markers = new Map();   // id -> L.marker
  const routeLayer = L.layerGroup().addTo(L2);
  function syncRoutes2D() {
    routeLayer.clearLayers();
    models().forEach(m => { const r = m.route; if (m.on !== false && m.mode !== '3d' && r && (r.pts || []).length >= 2) { L.polyline(r.pts, { color: '#ffb020', weight: 2, opacity: 0.75, dashArray: '5 5', interactive: false }).addTo(routeLayer); r.pts.forEach(p => L.circleMarker(p, { radius: 2.5, color: '#ffb020', weight: 0, fillColor: '#ffb020', fillOpacity: 0.9, interactive: false }).addTo(routeLayer)); } });
  }
  function px(m) { return Math.max(28, Math.min(200, Math.round(60 * ((m.scale || 1) / 10 + 0.4)))); }
  const BLANK = L.divIcon({ className: 'm3d-billboard', html: '<span class="m3d-wait"><i></i></span>', iconSize: [34, 34], iconAnchor: [17, 17] });
  async function place2D(m) {
    // reserve the marker SYNCHRONOUSLY so a second sync2D (e.g. a 'models3d' emit
    // immediately followed by a 'sync') can't create a duplicate before the await resolves
    let mk = markers.get(m.id);
    if (!mk) {
      mk = L.marker([m.lat, m.lng], { icon: BLANK, draggable: true, keyboard: false, zIndexOffset: 500 });
      mk.on('dragend', () => { const ll = mk.getLatLng(); S.updateModel3d(m.id, { lat: ll.lat, lng: ll.lng }); });
      mk.on('click', () => { if (window.ModelControl) window.ModelControl.select(m.id); });
      mk.addTo(L2); markers.set(m.id, mk);
    }
    const e = eff(m);
    mk.setLatLng([e.lat, e.lng]);
    const url = await billboard(m, e.rotZ, 'top');
    if (markers.get(m.id) !== mk || !url) return;   // deleted/replaced while rendering
    const s = px(e);
    const pop = !mk._revealed; mk._revealed = true;   // soft drop-in on FIRST reveal only
    mk.setIcon(L.divIcon({
      className: 'm3d-billboard',
      html: `<img src="${url}" class="m3d-img${pop ? ' m3d-pop' : ''}" style="width:${s}px;height:${s}px" draggable="false">`,
      iconSize: [s, s], iconAnchor: [s / 2, s / 2],   // top-down render is centred in its frame → anchor on centre (sits exactly on its lat/lng)
    }));
  }
  function sync2D() {
    const live = models().filter(m => m.on !== false && m.mode !== '3d');
    const keep = new Set(live.map(m => m.id));
    for (const [id, mk] of markers) if (!keep.has(id)) { L2.removeLayer(mk); markers.delete(id); }
    live.forEach(place2D);
  }

  /* ============ 3D MapLibre custom layer ============ */
  let glmap = null, layer = null, hidden = false;   // hidden: suppressed on the globe projection
  const groups = new Map();   // id -> { group, inner, shadow, loading, failed }
  // sun (synced from map3d via setLight) — direction the light comes FROM (azimuth/altitude)
  const lightCfg = { az: 315, alt: 45, intensity: 1.9, ambient: 1.0, shadow: 0.55 };
  // soft round ground-shadow under each model (one shared texture+material+geometry)
  let shadowMat = null, shadowGeo = null;
  function ensureShadow() {
    if (shadowMat) return;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    shadowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: lightCfg.shadow });
    shadowGeo = new THREE.PlaneGeometry(1, 1);   // lies in the mercator XY ground plane
  }
  function sunVec(az, alt) { const a = (alt || 0) * D2R, z = (az || 0) * D2R; return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)]; }
  function applyLightTo(lyr) { if (!lyr || !lyr.dir) return; const v = sunVec(lightCfg.az, lightCfg.alt); lyr.dir.position.set(v[0], v[1], v[2]); lyr.dir.intensity = lightCfg.intensity; if (lyr.hemi) lyr.hemi.intensity = lightCfg.ambient; }
  function setLight(L) { if (!L) return; if (L.az != null) lightCfg.az = L.az; if (L.alt != null) lightCfg.alt = L.alt; if (L.intensity != null) lightCfg.intensity = L.intensity; if (L.ambient != null) lightCfg.ambient = L.ambient; if (L.shadow != null) lightCfg.shadow = L.shadow; if (shadowMat) shadowMat.opacity = lightCfg.shadow; applyLightTo(layer); update3D(); if (glmap) glmap.triggerRepaint(); }
  const customLayer = {
    id: 'models3d-gl', type: 'custom', renderingMode: '3d',
    onAdd(map, gl) {
      // build once + reuse across style swaps (no renderer/scene churn)
      if (!this.scene) {
        this.cam = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x223044, lightCfg.ambient); this.scene.add(this.hemi);
        this.dir = new THREE.DirectionalLight(0xffffff, lightCfg.intensity); this.scene.add(this.dir);
        applyLightTo(this);
      }
      if (!this.renderer || this._gl !== gl) { this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true }); this.renderer.autoClear = false; this._gl = gl; }
    },
    render(gl, args) {
      if (!this.scene || hidden) return;
      // MapLibre v5 passes an args object (mercator matrix in defaultProjectionData);
      // v4 passed the matrix array directly — support both.
      const matrix = (args && args.defaultProjectionData) ? args.defaultProjectionData.mainMatrix : args;
      this.cam.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
      this.renderer.resetState();
      this.renderer.clearDepth();   // draw models ON TOP of the 3D terrain (terrain's depth buffer
                                    // was occluding ground-placed models); self-occlusion stays correct.
      this.renderer.render(this.scene, this.cam);
    },
  };
  function ensureGroup(m, scene) {
    let g = groups.get(m.id);
    if (g) return g;
    ensureShadow();
    g = { group: new THREE.Group(), inner: null, raw: null, styleVal: m.style || 'solid', loading: true, shadow: new THREE.Mesh(shadowGeo, shadowMat) };
    g.shadow.visible = false; g.group.visible = false; scene.add(g.shadow); scene.add(g.group); groups.set(m.id, g);
    loadRaw(m).then(raw => { g.raw = raw; g.inner = buildInner(raw, m.style); g.group.add(g.inner); g.loading = false; update3D(); })
      .catch(() => { g.failed = true; g.loading = false; });
    return g;
  }
  function update3D() {
    if (!glmap || !layer || !layer.scene) return;
    const scene = layer.scene;
    const want = new Set(models().filter(m => m.on !== false && m.mode !== '2d').map(m => m.id));
    for (const [id, g] of groups) if (!want.has(id)) { scene.remove(g.group); if (g.shadow) scene.remove(g.shadow); groups.delete(id); }   // clone — never dispose (shares the master's GPU resources)
    models().forEach(m => {
      if (m.on === false || m.mode === '2d') return;
      const g = ensureGroup(m, scene);
      if (!g.inner) return;
      // style change → rebuild the inner from the cached master (no dispose: shared)
      if (g.raw && g.styleVal !== (m.style || 'solid')) { g.group.remove(g.inner); g.inner = buildInner(g.raw, m.style); g.group.add(g.inner); g.styleVal = m.style || 'solid'; }
      try {
        const e = eff(m);
        let ground = 0; try { ground = glmap.queryTerrainElevation ? (glmap.queryTerrainElevation([e.lng, e.lat]) || 0) : 0; } catch (er) {}
        const mc = maplibregl.MercatorCoordinate.fromLngLat([e.lng, e.lat], ground + (e.alt || 0));
        const mpu = mc.meterInMercatorCoordinateUnits();      // mercator units per metre at this latitude
        // Size = the slider's real km when zoomed in, but NEVER smaller than ~52 screen px so an
        // asset can't shrink to an invisible speck when zoomed out (the #1 "models don't show in 3D"
        // cause — 2D billboards are fixed-pixel so they always showed, 3D used raw geographic size).
        const mPerPx = 156543.03392 * Math.cos(e.lat * D2R) / Math.pow(2, glmap.getZoom());
        const meters = Math.max(10, (e.scale || 1) * 1000, 52 * mPerPx);   // scale slider ≈ size in km
        g.group.position.set(mc.x, mc.y, mc.z);
        g.group.scale.set(meters * mpu, meters * mpu, meters * mpu);
        g.group.rotation.x = Math.PI / 2;                     // Y-up model -> Z-up world (stand upright)
        g.inner.rotation.order = 'YXZ';                       // heading → pitch → roll (aircraft attitude)
        g.inner.rotation.set((e.pitch || 0) * D2R, (e.rotZ || 0) * D2R, (e.roll || 0) * D2R);
        g.group.visible = true;
        // ground shadow: a soft blob on the terrain below the model, cast away from
        // the sun and lengthened when the sun is low (so azimuth/height read visibly)
        if (g.shadow) {
          if (lightCfg.shadow > 0.01) {
            const gmc = maplibregl.MercatorCoordinate.fromLngLat([e.lng, e.lat], ground);
            const low = 1 + (1 - Math.sin(Math.max(6, lightCfg.alt) * D2R)) * 1.6;   // low sun → longer
            const fp = meters * mpu * 1.2, az = lightCfg.az * D2R;
            const off = fp * 0.45 * (low - 1);
            g.shadow.position.set(gmc.x - Math.sin(az) * off, gmc.y + Math.cos(az) * off, gmc.z);
            g.shadow.scale.set(fp, fp * low, 1);          // stretch along the sun axis
            g.shadow.rotation.z = -az;
            g.shadow.visible = true;
          } else g.shadow.visible = false;
        }
      } catch (e) { /* placement guard — never poison the load state */ }
    });
    glmap.triggerRepaint();
  }
  /* ---- GLOBE billboards: three.js custom layers can't project on the globe, so on the planet
     view we show each model as its 2D billboard PNG via a native symbol layer (icons follow the
     camera, like the live ship/plane icons). Reuses the same offscreen PNGs as the flat 2D map. ---- */
  const M3D_ICO_SRC = 'm3d-ico', M3D_ICO_LYR = 'm3d-ico-sym';
  const isGlobe = () => { try { return glmap && glmap.getProjection && glmap.getProjection().type === 'globe'; } catch (e) { return false; } };
  function ensureIcoLayer() {
    if (!glmap) return;
    try {
      if (!glmap.getSource(M3D_ICO_SRC)) glmap.addSource(M3D_ICO_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!glmap.getLayer(M3D_ICO_LYR)) glmap.addLayer({
        id: M3D_ICO_LYR, type: 'symbol', source: M3D_ICO_SRC,
        layout: { 'icon-image': ['get', 'img'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.34, 5, 0.5, 8, 0.72], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport', 'visibility': 'none' },
      });
    } catch (e) {}
  }
  async function updateGlobeIcons() {
    if (!glmap || !glmap.getSource(M3D_ICO_SRC)) return;
    const ms = models().filter(m => m.on !== false && m.mode !== '2d');
    const feats = [];
    for (const m of ms) {
      const e = eff(m);
      const imgId = 'm3dico:' + m.id + ':' + Math.round(e.rotZ || 0) + ':' + (m.style || 'solid');
      if (!glmap.hasImage(imgId)) {
        try { const url = await billboard(m, e.rotZ, 'top'); if (url) await new Promise(res => { const im = new Image(); im.onload = () => { try { if (glmap && !glmap.hasImage(imgId)) glmap.addImage(imgId, im); } catch (er) {} res(); }; im.onerror = () => res(); im.src = url; }); } catch (er) {}
      }
      if (glmap.hasImage(imgId)) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { img: imgId } });
    }
    try { const s = glmap.getSource(M3D_ICO_SRC); if (s) s.setData({ type: 'FeatureCollection', features: feats }); } catch (e) {}
  }
  function attach3D(map) {
    glmap = map;
    if (!map.getLayer('models3d-gl')) { try { map.addLayer(customLayer); } catch (e) { console.warn('Models3D 3D layer', e); return; } }
    layer = customLayer;
    ensureIcoLayer();
    // scene is reused across style swaps — detach the previous groups before rebuilding
    if (customLayer.scene) groups.forEach(g => { customLayer.scene.remove(g.group); if (g.shadow) customLayer.scene.remove(g.shadow); });
    groups.clear();   // drop stale clone refs; masters stay cached and re-clone on rebuild
    update3D();
    if (isGlobe()) { try { glmap.setLayoutProperty(M3D_ICO_LYR, 'visibility', 'visible'); } catch (e) {} updateGlobeIcons(); }
  }

  /* ---- wiring ---- */
  let known = new Set();
  function syncAll() {
    // fully clean up any model that disappeared (deleted here OR in the other window)
    const cur = new Set(models().map(m => m.id));
    for (const id of known) if (!cur.has(id)) purge(id);
    known = cur;
    // NOTE: billboards are keyed by id:rotZ, so a rotation change makes a fresh key
    // automatically and size/position changes reuse the cached PNG — no global clear()
    // (which used to re-render every model's PNG on every slider tick).
    sync2D(); syncRoutes2D();
    if (window.Map3D && Map3D.on) { update3D(); if (isGlobe()) updateGlobeIcons(); }   // globe icons follow model add/move/rotate
  }
  S.on((st, evt) => { if (evt === 'models3d' || evt === 'sync') syncAll(); });

  // transient render override for animation / drag (no Store writes).
  // poseMap: { id: pose|null }. Re-places only the affected models.
  function tick(poseMap) {
    for (const id in poseMap) { const p = poseMap[id]; if (p) poses.set(id, p); else poses.delete(id); }
    for (const id in poseMap) { const m = models().find(x => x.id === id); if (m && m.on !== false && m.mode !== '3d') place2D(m); }
    if (window.Map3D && Map3D.on) update3D();
  }
  function setPose(id, pose) { tick({ [id]: pose }); }
  function clearPoses() { const o = {}; poses.forEach((_, id) => o[id] = null); if (Object.keys(o).length) tick(o); }

  window.Models3D = {
    attach3D,
    setLight,              // sync model lighting to the 3D sun (from map3d)
    tick, setPose, clearPoses,   // route/timeline playback / drag preview
    setVisible(v) {   // v=true flat (three.js models) · v=false globe (2D billboard icons instead)
      hidden = !v;
      if (glmap) { try { if (glmap.getLayer(M3D_ICO_LYR)) glmap.setLayoutProperty(M3D_ICO_LYR, 'visibility', v ? 'none' : 'visible'); } catch (e) {} if (!v) updateGlobeIcons(); glmap.triggerRepaint(); }
    },
    project: (lng, lat) => (glmap ? glmap.project([lng, lat]) : null),   // for 3D selection/drag
    refresh: syncAll,
    invalidate,            // call after a GLB is (re)uploaded for an id
    thumb: (file, style) => billboard({ id: 'thumb:' + file, src: 'assets3d/' + file, style: style || 'solid' }, 0),   // catalog preview PNG (offscreen render, cached)
    has2D: id => markers.has(id),
    marker: id => markers.get(id) || null,   // for the control HUD's selection highlight
    nearestId(point, px) { if (!glmap) return null; let best = null, bd = px || 60; models().forEach(m => { if (m.on === false || m.mode === '2d') return; try { const p = glmap.project([m.lng, m.lat]); const d = Math.hypot(p.x - point.x, p.y - point.y); if (d < bd) { bd = d; best = m.id; } } catch (e) {} }); return best; },
    _groups: groups,       // test hook
  };
  syncAll();

  // housekeeping (control window only): delete GLB blobs no longer referenced by any
  // model, so failed/half uploads don't accumulate in IndexedDB over time.
  if (window.APP_ROLE === 'control') {
    setTimeout(async () => {
      try { const ids = new Set(models().map(m => m.id)); const ks = await window.Assets3D.keys(); ks.forEach(k => { if (!ids.has(k)) window.Assets3D.del(k); }); } catch (e) {}
    }, 4000);
  }
})();
