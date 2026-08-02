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
  // GLB load + geometry pipeline (loadRaw / buildInner / forget / fileOf) lives in js/models3d-geo.js,
  // which MUST be the earlier `defer` script — deferred scripts run in document order, so if the tag
  // were placed after this one G would be undefined here. See that file's header for why the seam is
  // there and, in particular, why it owns the master cache instead of exporting it.
  const G = window.Models3DGeo;
  if (!G) { console.warn('Models3D: models3d-geo.js missing'); return; }
  // watchLoad() cannot move with loadRaw() (it calls syncAll() + UI.toast()), and hoisting does NOT
  // cross files — so it is handed over explicitly here, before anything can call loadRaw().
  G.init({ watchLoad });
  // js/util.js. NOTE `gl` is deliberately NOT taken from U here: the MapLibre custom layer below uses
  // `gl` as its own WebGL-context parameter (onAdd(map, gl) / render(gl, args)), and importing the
  // helper of that name would put a confusing shadowed binding in scope for no benefit.
  const { D2R, models } = window.U;
  // transient per-instance render override (route playback / 3D drag preview) — does
  // NOT touch the Store, so animation never spams persistence/sync.
  const poses = new Map();   // id -> { lat, lng, rotZ?, pitch?, roll?, alt? }
  const keyOf = m => (S.modelKey ? S.modelKey(m) : (m.src ? G.fileOf(m.src) : ('id:' + m.id)));   // stable per-model key (catalog=file, upload=id)
  // effective render props: live route pose over the stored metadata, plus the persistent heading
  // correction — a PER-MODEL fix (Store.config.modelFix, keyed by modelKey, synced, set by the
  // calibrator / Turn button, seeded for the few catalog GLBs the heuristic faces wrong) and an
  // optional per-instance headOff. Front/back is geometrically ambiguous for many GLBs, so this
  // table — applied identically in all 3 view modes — not the geometry heuristic, is the cure.
  const eff = m => {
    const e = Object.assign({}, m, poses.get(m.id) || {});
    const off = (m.headOff || 0) + (((S.cfg && S.cfg().modelFix) || {})[keyOf(m)] || 0);
    if (off) e.rotZ = (e.rotZ || 0) + off;
    return e;
  };

  // A GLB that 404s, is corrupt, or simply never answers used to fail in COMPLETE silence — no
  // placeholder, no console line, no toast — while the panel still listed the model as "on" and
  // nothing existed on air. Warn once per id (racing a timeout so a stalled fetch is caught too) and
  // re-render. The load itself is never cancelled: a slow model that lands after the warning still shows.
  const LOAD_TIMEOUT = 20000;
  const loadFailed = new Set();   // ids already warned about — don't re-toast on every re-render / 3D re-attach
  function watchLoad(m, p) {
    if (/^(top)?thumb:/.test(String(m.id))) return;   // catalog preview renders draw their own empty tile
    let settled = false;
    const warn = why => {
      if (settled || loadFailed.has(m.id)) return;
      loadFailed.add(m.id);
      console.error('Models3D: "' + (m.name || m.id) + '" failed to load — ' + why);
      try { if (window.UI && UI.toast) UI.toast('3D model "' + (m.name || 'model') + '" failed to load (' + why + ')'); } catch (e) {}
      syncAll();
    };
    const t = setTimeout(() => warn('timed out'), LOAD_TIMEOUT);
    p.then(() => { settled = true; clearTimeout(t); loadFailed.delete(m.id); }, e => { clearTimeout(t); warn((e && e.message) || 'load error'); });
  }
  function dropBillboards(id) { for (const k of [...billboards.keys()]) if (k.indexOf(id + ':') === 0) billboards.delete(k); }
  // fully forget a model (re-upload of same id, or it was deleted): dispose its 2D
  // marker, 3D group, cached scene + billboards, and free the object URL.
  function purge(id) {
    poses.delete(id);   // drop any transient route/drag pose so a deleted-mid-animation model can't linger in eff()
    const mk = markers.get(id); if (mk) { L2.removeLayer(mk); markers.delete(id); }
    const g = groups.get(id); if (g) { if (layer && layer.scene) { layer.scene.remove(g.group); if (g.shadow) layer.scene.remove(g.shadow); } groups.delete(id); }   // clone — not disposed
    G.forget(id);   // dispose + evict the MASTER scene. The cache itself stays inside models3d-geo.js: clones share the master's geometry/materials/textures, so dispose-and-delete must remain one indivisible step owned by the file that hands the clones out.
    loadFailed.delete(id);   // a re-upload of the same id must be free to warn again if it also fails
    dropBillboards(id);
    // free the globe symbol-layer images for this model (both style variants) — MapLibre's sprite atlas
    // keeps them forever otherwise, leaking a GPU texture per model/style over a long broadcast session.
    if (glmap) ['solid', 'wireframe'].forEach(sty => { const iid = 'm3dico:' + id + ':N:' + sty; try { if (glmap.hasImage(iid)) glmap.removeImage(iid); } catch (e) {} });
    if (window.Assets3D && Assets3D.revoke) Assets3D.revoke(id);
  }
  function invalidate(id) { purge(id); }   // re-upload: forget everything so it reloads fresh

  /* ============ 2D billboard: offscreen three.js -> PNG ============ */
  const BB = 256;
  // heading calibration for the TOP-DOWN map/globe billboard. rotZ IS the compass bearing (route
  // playback writes the raw travel bearing into it), and the frame correction now lives in the
  // negated rotation inside billboard() — so no extra offset is needed here.
  const TOP_OFF = 0;
  // LRU cap for the rendered-PNG cache. Kept well above the 70-file catalog's thumbnails so opening
  // the 3D library never re-renders every model while an animated one cycles its heading buckets.
  const BB_MAX = 260;
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
  const billboards = new Map();   // `${id}:${rotZ}:${style}:${view}` -> Promise<dataURL>  (LRU: oldest key first)
  function billboard(m, rotZ, view) {
    const top = view === 'top';
    // quantise the top-down heading to 6° buckets: a model animating along a route changes rotZ every
    // frame, and each distinct value used to trigger a fresh offscreen render + synchronous toDataURL
    // PNG encode. 60 cached variants are visually indistinguishable on a small icon and reused instantly.
    const rz = top ? Math.round((rotZ || 0) / 6) * 6 : Math.round(rotZ || 0);
    const key = m.id + ':' + rz + ':' + (m.style || 'solid') + ':' + (view || 'hero');
    if (billboards.has(key)) { const hit = billboards.get(key); billboards.delete(key); billboards.set(key, hit); return hit; }   // re-insert = mark most-recently-used
    const p = (async () => {
      if (!ensureOffscreen()) return null;
      const raw = await G.loadRaw(m); const obj = G.buildInner(raw, m.style);
      // NEGATED: the top-down camera looks down +Y with up = -Z, so a POSITIVE three.js Y-rotation
      // sweeps the model ANTI-clockwise on screen — rotZ used to render as bearing -rotZ, i.e. east and
      // west mirrored (only 0/180 ever looked right, which is also what made the calibrator run
      // backwards). With the sign flipped the rendered heading IS rotZ, matching the globe icons and
      // the 3D mesh. The image itself was never mirrored, so only the angle needs correcting here.
      obj.rotation.y = -(rz + (top ? TOP_OFF : 0)) * D2R;
      const root = new THREE.Group(); root.add(obj); bscene.add(root);
      try { rdr.render(bscene, top ? bcamTop : bcam); return rdr.domElement.toDataURL('image/png'); }
      finally { bscene.remove(root); }
    })().catch(() => null);
    billboards.set(key, p);
    // A model animating a full 360° route mints ~60 of these 256×256 PNG data-URLs per style, and
    // nothing released them until the model was purged (~1–2 MB retained per animated model, forever).
    while (billboards.size > BB_MAX) { const k = billboards.keys().next().value; if (k === key) break; billboards.delete(k); }
    return p;
  }

  /* ============ 2D Leaflet markers + route lines ============ */
  const markers = new Map();   // id -> L.marker
  const routeLayer = L.layerGroup().addTo(L2);
  function syncRoutes2D() {
    routeLayer.clearLayers();
    models().forEach(m => { const r = m.route; if (m.on !== false && m.mode !== '3d' && r && (r.pts || []).length >= 2) { L.polyline(r.pts, { color: '#ffb020', weight: 2, opacity: 0.75, dashArray: '5 5', interactive: false }).addTo(routeLayer); r.pts.forEach(p => L.circleMarker(p, { radius: 2.5, color: '#ffb020', weight: 0, fillColor: '#ffb020', fillOpacity: 0.9, interactive: false }).addTo(routeLayer)); } });
  }
  function px(m) { return Math.max(46, Math.min(280, Math.round(96 * ((m.scale || 1) / 10 + 0.52)))); }   // 2D-map icon size (fixed px) — enlarged: models read too small on the flat map
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
    G.loadRaw(m).then(raw => { g.raw = raw; g.failed = null; g.inner = G.buildInner(raw, m.style); g.group.add(g.inner); g.loading = false; update3D(); })
      .catch(e => { g.failed = (e && e.message) || 'load error'; g.loading = false; });   // reason kept for the _groups test hook; the operator-facing warning comes from watchLoad()
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
      if (g.raw && g.styleVal !== (m.style || 'solid')) { g.group.remove(g.inner); g.inner = G.buildInner(g.raw, m.style); g.group.add(g.inner); g.styleVal = m.style || 'solid'; }
      try {
        const e = eff(m);
        let ground = 0; try { ground = glmap.queryTerrainElevation ? (glmap.queryTerrainElevation([e.lng, e.lat]) || 0) : 0; } catch (er) {}
        // AIRBORNE assets (aircraft/drones/missiles with altitude) fly at a STABLE absolute altitude so
        // they don't bob up and down following the terrain underneath as they move along a route ("مطبات").
        // Ground assets (tanks/ships, or a grounded aircraft) hug the terrain. The shadow still uses `ground`.
        const airborne = (e.alt || 0) > 0 && /aircraft|drone|uav|missile|rocket|jet|helicop/i.test(String(e.kind || e.cat || ''));
        const mc = maplibregl.MercatorCoordinate.fromLngLat([e.lng, e.lat], airborne ? (e.alt || 0) : (ground + (e.alt || 0)));
        const mpu = mc.meterInMercatorCoordinateUnits();      // mercator units per metre at this latitude
        // Size = the slider's real km when zoomed in, but NEVER smaller than ~52 screen px so an
        // asset can't shrink to an invisible speck when zoomed out (the #1 "models don't show in 3D"
        // cause — 2D billboards are fixed-pixel so they always showed, 3D used raw geographic size).
        const mPerPx = 156543.03392 * Math.cos(e.lat * D2R) / Math.pow(2, glmap.getZoom());
        const meters = Math.max(10, (e.scale || 1) * 1000, 52 * mPerPx);   // scale slider ≈ size in km
        const sz = meters * mpu;
        g.group.position.set(mc.x, mc.y, mc.z);
        // Z IS NEGATED — this is the mirror fix. MapLibre's mercator world is +X east / +Y SOUTH: a
        // LEFT-handed geographic frame, so a three.js model dropped into it renders as its own mirror
        // image — port and starboard swapped, and the heading sweeping backwards (rotZ came out as
        // bearing 180−rotZ, east/west reversed). A mirror can't be undone by a rotation, which is why no
        // modelFix value could ever make the 3D mesh and the 2D map agree. Flipping the group's Z
        // (applied AFTER the child's yaw, before the X-rotation below) undoes it; three.js reverses the
        // triangle winding itself for a negative-determinant world matrix, so faces + lighting stay right.
        g.group.scale.set(sz, sz, -sz);
        g.group.rotation.x = Math.PI / 2;                     // Y-up model -> Z-up world (stand upright)
        g.inner.rotation.order = 'YXZ';                       // heading → pitch → roll (aircraft attitude)
        // yaw negated against the mirrored frame above: the pair renders bearing = +rotZ (compass,
        // clockwise from north) — the same convention as the 2D billboard and the globe icons.
        g.inner.rotation.set((e.pitch || 0) * D2R, (-(e.rotZ || 0)) * D2R, (e.roll || 0) * D2R);
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
  const M3D_ICO_SRC = 'm3d-ico', M3D_ICO_LYR = 'm3d-ico-sym', M3D_ICO_SHADOW = 'm3d-ico-shadow';
  const isGlobe = () => { try { return glmap && glmap.getProjection && glmap.getProjection().type === 'globe'; } catch (e) { return false; } };
  function ensureShadowImg() {
    if (!glmap || glmap.hasImage('m3d-shadow')) return;
    try {
      const SZ = 64, cv = document.createElement('canvas'); cv.width = cv.height = SZ; const cx = cv.getContext('2d');
      const gr = cx.createRadialGradient(SZ / 2, SZ / 2, 1, SZ / 2, SZ / 2, SZ / 2); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = gr; cx.beginPath(); cx.ellipse(SZ / 2, SZ / 2, SZ / 2, SZ / 2 * 0.6, 0, 0, Math.PI * 2); cx.fill();   // flattened blob = ground contact
      glmap.addImage('m3d-shadow', { width: SZ, height: SZ, data: cx.getImageData(0, 0, SZ, SZ).data });
    } catch (e) {}
  }
  function setIcoVis(v) { [M3D_ICO_SHADOW, M3D_ICO_LYR].forEach(id => { try { if (glmap && glmap.getLayer(id)) glmap.setLayoutProperty(id, 'visibility', v); } catch (e) {} }); }
  function ensureIcoLayer() {
    if (!glmap) return;
    try {
      if (!glmap.getSource(M3D_ICO_SRC)) glmap.addSource(M3D_ICO_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      ensureShadowImg();
      // soft ground shadow UNDER the icons (added first → drawn beneath) so globe models read as grounded
      if (!glmap.getLayer(M3D_ICO_SHADOW)) glmap.addLayer({
        id: M3D_ICO_SHADOW, type: 'symbol', source: M3D_ICO_SRC,
        layout: { 'icon-image': 'm3d-shadow', 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.3, 5, 0.46, 8, 0.66], 'icon-offset': [0, 13], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'visibility': 'none' },
        paint: { 'icon-opacity': 0.55 },
      });
      if (!glmap.getLayer(M3D_ICO_LYR)) glmap.addLayer({
        id: M3D_ICO_LYR, type: 'symbol', source: M3D_ICO_SRC,
        // The icon image is rendered NORTH-facing once; heading comes from a VIEWPORT-aligned icon-rotate
        // (radar style, matching the live ship/plane tracking icons — the only alignment that actually
        // rotates on the globe projection: 'map' alignment left the icon FROZEN at its baked orientation,
        // so models pointed backward/wrong on the globe). icon-pitch-alignment:viewport keeps it flat-facing
        // the camera so it never tilts into the terrain. hdg = (e.rotZ+180) → nose along the travel bearing.
        layout: { 'icon-image': ['get', 'img'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.34, 5, 0.5, 8, 0.72], 'icon-rotate': ['get', 'hdg'], 'icon-rotation-alignment': 'viewport', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport', 'visibility': 'none' },
      });
    } catch (e) {}
  }
  let globeIcoToken = 0;
  async function updateGlobeIcons() {
    if (!glmap || !glmap.getSource(M3D_ICO_SRC)) return;
    // re-entrancy guard: this is async (awaits image decode) and is called every animation frame on the
    // globe. Without a token, a call that started earlier could resolve LATER and setData a stale frame
    // (icon jumps backward / a just-deleted model reappears for a frame). Only the newest call may write.
    const tok = ++globeIcoToken;
    const ms = models().filter(m => m.on !== false && m.mode !== '2d');
    const feats = [];
    for (const m of ms) {
      const e = eff(m);
      // ONE north-facing image per model+style (the heading comes from the map-aligned icon-rotate
      // below, not from the PNG) → correct heading on the globe + far fewer offscreen renders.
      const imgId = 'm3dico:' + m.id + ':N:' + (m.style || 'solid');
      if (!glmap.hasImage(imgId)) {
        try { const url = await billboard(m, 180, 'top'); if (url) await new Promise(res => { const im = new Image(); im.onload = () => { try { if (glmap && !glmap.hasImage(imgId)) glmap.addImage(imgId, im); } catch (er) {} res(); }; im.onerror = () => res(); im.src = url; }); } catch (er) {}
      }
      if (glmap.hasImage(imgId)) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { img: imgId, hdg: ((e.rotZ || 0) + 180) % 360 } });
    }
    if (tok !== globeIcoToken) return;   // a newer updateGlobeIcons superseded us while we awaited
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
    if (isGlobe()) { setIcoVis('visible'); updateGlobeIcons(); }
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
  // A 'models3d' event means the operator changed a model (HUD D-pad, heading/size, settings, drag).
  // The timeline writes transient poses through tick() and never cleared them, so once a model had a
  // keyframe it stayed frozen at that pose and eff() kept overriding the Store — every HUD edit updated
  // the numbers and moved nothing. While playback is NOT running the Store is authoritative, so release
  // the overlay. Route/timeline playback re-applies its pose on the very next frame, so this is invisible
  // during actual playback.
  function releasePosesIfIdle() {
    const tl = (S.cfg().timeline) || {};
    if (tl.playing || !poses.size) return;
    const o = {}; poses.forEach((_, id) => { o[id] = null; });
    tick(o);
  }
  S.on((st, evt) => { if (evt === 'models3d') releasePosesIfIdle(); if (evt === 'models3d' || evt === 'sync') syncAll(); });

  // transient render override for animation / drag (no Store writes).
  // poseMap: { id: pose|null }. Re-places only the affected models.
  function tick(poseMap) {
    for (const id in poseMap) { const p = poseMap[id]; if (p) poses.set(id, p); else poses.delete(id); }
    for (const id in poseMap) { const m = models().find(x => x.id === id); if (m && m.on !== false && m.mode !== '3d') place2D(m); }
    if (window.Map3D && Map3D.on) { update3D(); if (isGlobe()) updateGlobeIcons(); }   // on the GLOBE the model is a billboard icon — refresh it each frame so it moves + turns with the route (was frozen)
  }
  function setPose(id, pose) { tick({ [id]: pose }); }
  function clearPoses() { const o = {}; poses.forEach((_, id) => o[id] = null); if (Object.keys(o).length) tick(o); }

  window.Models3D = {
    attach3D,
    setLight,              // sync model lighting to the 3D sun (from map3d)
    tick, setPose, clearPoses,   // route/timeline playback / drag preview
    setVisible(v) {   // v=true flat (three.js models) · v=false globe (2D billboard icons instead)
      hidden = !v;
      if (glmap) { setIcoVis(v ? 'none' : 'visible'); if (!v) updateGlobeIcons(); glmap.triggerRepaint(); }
    },
    project: (lng, lat) => (glmap ? glmap.project([lng, lat]) : null),   // for 3D selection/drag
    refresh: syncAll,
    invalidate,            // call after a GLB is (re)uploaded for an id
    thumb: (file, style) => billboard({ id: 'thumb:' + file, src: 'assets3d/' + file, style: style || 'solid' }, 0),   // catalog preview PNG (offscreen render, cached)
    topThumb: (file, rotZ) => billboard({ id: 'topthumb:' + file + ':' + (rotZ || 0), src: 'assets3d/' + file, style: 'solid' }, rotZ || 0, 'top'),   // top-down render at a heading (heading-calibration tool)
    topThumbModel: (m, rotZ) => billboard(m, rotZ || 0, 'top'),   // top-down render of ANY model object (catalog or upload) — drives the orientation calibrator preview
    has2D: id => markers.has(id),
    marker: id => markers.get(id) || null,   // for the control HUD's selection highlight
    // hit-test the RENDERED pose (eff), not the stored lat/lng: during route/timeline playback the model
    // is drawn at a transient pose, so testing m.lat/m.lng left the clickable hotspot parked at the start
    // of the route — clicking the moving jet selected nothing.
    nearestId(point, px) { if (!glmap) return null; let best = null, bd = px || 60; models().forEach(m => { if (m.on === false || m.mode === '2d') return; try { const e = eff(m); const p = glmap.project([e.lng, e.lat]); const d = Math.hypot(p.x - point.x, p.y - point.y); if (d < bd) { bd = d; best = m.id; } } catch (er) {} }); return best; },
    _groups: groups,       // test hook
  };
  syncAll();

  // housekeeping (control window only): delete GLB blobs no longer referenced by any model, so
  // failed/half uploads don't accumulate in IndexedDB over time.
  // IndexedDB holds the ONLY copy of an uploaded model's binary, while models() only reflects
  // localStorage — the authoritative room snapshot arrives asynchronously over the network. The old
  // fixed 4s timer therefore DELETED a model that had been uploaded just before a reload whenever sync
  // was slow. Now the sweep refuses to run until the room has actually answered (a snapshot adopt, or
  // the sync badge going live; ?nosync means there is no room and local state is authoritative), it
  // spares every id seen in ANY snapshot this session, and if the room never answers it simply never
  // sweeps — leaking a stale blob is recoverable, deleting a live one is not.
  if (window.APP_ROLE === 'control') {
    const seen = new Set();   // grace list: every model id observed this session
    const note = () => models().forEach(m => seen.add(m.id));
    note();
    S.on((st, evt) => { if (evt === 'models3d' || evt === 'sync') note(); });
    const roomAnswered = () => /[?&]nosync/.test(location.search) || !!document.querySelector('#syncdot.syncdot--live');
    let tries = 0;
    const sweep = async () => {
      note();
      if (!roomAnswered()) { if (++tries < 20) setTimeout(sweep, 3000); return; }   // ~60s of patience, then give up quietly
      try { const ks = await window.Assets3D.keys(); ks.forEach(k => { if (!seen.has(k)) window.Assets3D.del(k); }); } catch (e) {}
    };
    setTimeout(sweep, 8000);
  }
})();
