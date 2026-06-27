/* ============================================================
   STORE — single shared source of truth.
   Rundown -> Scenes -> Elements  +  Config (style / visibility /
   permissions / map styles / assets). Persisted to localStorage
   and synced live across windows (Control <-> Presenter).
   ============================================================ */
const Store = (() => {
  const KEY = 'newsmap.v3';
  let n = 0;
  const uid = p => p + (++n) + '_' + Math.floor(performance.now());

  const DEFAULT_CONFIG = {
    style: { accent: '#5b9dff', glass: 55, blur: 24, distort: 46, radius: 14, sat: 1.7, sheen: 16, shadow: 1, brightness: 105 },
    // Per-MODEL heading correction (degrees), keyed by Store.modelKey (catalog → filename, uploads →
    // 'id:<id>'). Applied centrally in models3d eff() for ALL three view modes. The auto-orient gets
    // most models nose-forward already; these are the few the heuristic faces wrong (front/back is
    // geometrically ambiguous) — VERIFIED empirically from large top-down renders (nose must point
    // "up"/along travel). The operator's calibrator/Turn button writes here too, so any fix (incl.
    // future uploads) is remembered for every instance, view and device. THE permanent cure.
    modelFix: {
      'abrams-m1a2.glb': 180, 'abrams-mbt.glb': 180, 'al-khalid-type-90-iim-mbt-2000-main-battle-tank.glb': 180,
      'amx-30-tank.glb': 180, 'm60-t1-sabra.glb': 180, 'bm-21-grad.glb': 180,
      'embraer-legacy-650-fbx.glb': 270, 'fa-18f-raaf.glb': 270, 'geranium.glb': 270, 'shahed-238.glb': 180,
    },
    visibility: { brand: true, status: true, deck: true, modeSwitch: true, fab: true, qtools: true, nownext: true, tracking: true, sceneSettings: true, attribution: true },
    permissions: {
      tools: { select: true, marker: true, arrow: true, curve: true, ring: true, circle: true, polygon: true, sketch: true, text: true, measure: true, frontline: true, country: true, erase: true, asset: true },
      canDraw: true, canEditScenes: false, canNavigate: true, canChangeStyle: false, canChangeMapStyle: true, canTrack: true,
    },
    mapStyles: [
      { id: '019caada-7e48-7379-ba36-e8967f4fcc92', name: 'News', on: true },
      { id: 'wireframe', name: 'Wireframe', on: true },
      { id: 'satellite', name: 'Satellite', on: true },
      { id: 'hybrid', name: 'Hybrid', on: true },
      { id: 'dataviz-dark', name: 'Dark', on: true },
      { id: 'streets-v2-dark', name: 'Night streets', on: true },
      { id: 'basic-v2-dark', name: 'Night basic', on: true },
      { id: 'streets-v2', name: 'Streets', on: true },
      { id: 'ocean', name: 'Marine', on: true },
      { id: 'topo-v2', name: 'Topo', on: false },
      { id: 'topographique', name: 'Relief (3D-look)', on: false },
      { id: 'outdoor-v2', name: 'Outdoor', on: false },
      { id: 'winter-v2', name: 'Winter', on: false },
      { id: 'basic-v2', name: 'Basic', on: false },
      { id: 'bright-v2', name: 'Bright', on: false },
      { id: 'toner-v2', name: 'Toner', on: false },
      { id: 'dataviz', name: 'Light', on: false },
      { id: 'landscape', name: 'Landscape', on: false },
      { id: 'openstreetmap', name: 'OpenStreetMap', on: false },
    ],
    assetCats: ['ground', 'air', 'naval', 'weapons', 'infra'],
    customAssets: [],   // { id, name, cat, url }
    models3d: [],       // 3D GLB assets — binary lives in IndexedDB (Assets3D), here is metadata:
                        // { id, name, lat, lng, alt, scale, rotZ, mode:'both'|'3d'|'2d', on }
    trackStyle: { shipColor: '#46d8ff', flightColor: '#ffd54a', lineWeight: 1, lineOpacity: 0.4, vectorMins: 3, trailPoints: 60, maxShips: 1000, showVectors: true, showHistory: true, showRoutes: true },
    brand: { logo: null, size: 38, x: 70, y: 30 },   // logo data-URL + height(px) + position(px from top-left; 70 clears the gear)
    touch: false,            // large touch-friendly controls
    locator: false,          // mini locator inset map
    tilt: 0,                 // 3D perspective tilt (deg)
    easing: 'inout',         // motion easing for route + timeline playback: 'inout' (smooth) | 'linear'
    follow: { on: false, kind: null, id: null, zoom: null },   // camera follow: lock onto a moving target (model | ship | flight)
    drawDefaults: { color: '#ff453a', weight: 3 },   // default colour + stroke for new elements
    markerScale: 1,          // global size multiplier for placed marker / targeting icons (synced)
    threeD: { exaggeration: 2.6, pitch: 62, labels3d: true, globe: false },   // 3D terrain defaults (MapLibre); globe = planet projection
    light3d: { on: true, az: 315, alt: 45, intensity: 1.9, ambient: 1.0, relief: 0.5, shadow: 55, tshadow: 55 },   // 3D sun: terrain hillshade + terrain shadow + GLB models + ground shadows
    timeline: { dur: 15, head: 0, playing: false, loop: false, t0: 0, cam: [], models: {} },   // keyframe choreography (camera + models), synced
    track3d: { on: true, shipKm: 5, planeKm: 4, realAlt: true },   // live ships/planes as lightweight 3D in the 3D map
    ui: { scaleBar: false, compass: false },   // optional map chrome
    grid: { on: false, size: 60, color: '#7fb0ff', opacity: 16, weight: 1 },   // aesthetic square grid overlay
    sea: { on: false, intensity: 55, wave: 36, speed: 26, color: '#2c7fd6' },   // masked water caustics (wave = size %)
    clouds: { on: false, amount: 32, size: 50, softness: 55, speed: 70 },        // drifting clouds (size %, softness %)
    ltStyle: 'news',         // lower-third template: news | breaking | glass | box | minimal | bold
    thirds: false,           // rule-of-thirds + title-safe composition overlay
    dayNight: { on: false, opacity: 60, live: true, offsetH: 0 },   // real-time day/night terminator shading
    campath: { frames: [], legSec: 3, loop: false, playing: false },   // recorded camera path (record/replay)
    overlays: [],            // georeferenced image layers { id,name,url,bounds:[[s,w],[n,e]],opacity,wipe,on }
    overlayWipe: 0.5,        // global before/after wipe position (0..1)
    overlayWipeDir: 'v',     // wipe direction: v (vertical) | h (horizontal) | radial
    // panel positions are NOT here — they live in a per-window local store (see LAYOUT_KEY).
    // panel SIZE (scale) IS synced, so resizing a panel on the control reflects on the presenter:
    panelScale: {},          // { '.sel': scale }
    qbar: { order: [], hidden: ['tarrow', 'curve', 'circle', 'polygon', 'sketch', 'frontline', 'country', 'measure', 'flags', 'redo', 'hideui', 'grid', 'sea', 'clouds', 'daynight', 'fullscreen'], pinned: [] },   // pinned = settings sections shown as quick "jump" buttons on the bar   // vertical tool-bar: button order + hidden (extras off by default; add them from settings)
    places: [
      { id: 'pl1', name: 'Doha', lat: 25.29, lng: 51.53, zoom: 10 },
      { id: 'pl2', name: 'Gaza', lat: 31.5, lng: 34.47, zoom: 11 },
      { id: 'pl3', name: 'Jerusalem', lat: 31.78, lng: 35.22, zoom: 11 },
      { id: 'pl4', name: 'Beirut', lat: 33.89, lng: 35.5, zoom: 11 },
      { id: 'pl5', name: 'Tehran', lat: 35.69, lng: 51.39, zoom: 10 },
      { id: 'pl6', name: 'Baghdad', lat: 33.31, lng: 44.36, zoom: 10 },
    ],
  };

  const state = {
    mode: 'build',                 // 'build' | 'live'
    color: '#ff453a',
    mapStyle: '019caada-7e48-7379-ba36-e8967f4fcc92',   // custom broadcast "News" style (default)
    rundown: { title: 'News Rundown', scenes: [], activeId: null },
    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    reveal: {},                    // sceneId -> number of revealed elements (synced)
    tracking: { ships: false, flights: false, trails: true },  // live overlays (synced)
    trackFocus: null,             // focused ship MMSI (route shown) — synced
    broadcast: { banner: { on: false, text: 'BREAKING NEWS' }, ticker: { on: false, text: '', speed: 60 }, tour: { playing: false, sec: 8 }, spotlight: { on: false, lat: 25, lng: 45, radiusKm: 400, feather: 40, dim: 66 }, anim: { ms: 700, loop: false, playing: false } },
  };

  /* ---- panel layout is PER-WINDOW LOCAL, NOT synced: the control console and the presenter
     keep their own dragged positions + per-panel scale, so moving a panel on one window never
     moves it on the other. Stored under a role-specific localStorage key. ---- */
  const LAYOUT_KEY = 'newsmap.v3.layout.' + (window.APP_ROLE === 'control' ? 'control' : 'presenter');
  let layoutMap = (() => { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') || {}; } catch (e) { return {}; } })();
  function persistLayout() { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutMap)); } catch (e) {} }
  function layout() { return layoutMap; }

  /* ---- pub/sub + persistence + cross-window sync ---- */
  const subs = [];
  const on = fn => { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; };
  let _t = null;
  function persist() { clearTimeout(_t); _t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ rundown: state.rundown, config: state.config, color: state.color, mapStyle: state.mapStyle, reveal: state.reveal, tracking: state.tracking, trackFocus: state.trackFocus, broadcast: state.broadcast })); } catch (e) {} }, 120); }
  const emit = (evt, opts) => { subs.forEach(fn => fn(state, evt || 'change')); if (!(opts && opts.silent)) persist(); };

  function deepMerge(def, ov) { const o = JSON.parse(JSON.stringify(def)); for (const k in ov) { if (ov[k] && typeof ov[k] === 'object' && !Array.isArray(ov[k])) o[k] = deepMerge(def[k] || {}, ov[k]); else o[k] = ov[k]; } return o; }
  function mergeNewMapStyles() { const have = new Set(state.config.mapStyles.map(m => m.id)); DEFAULT_CONFIG.mapStyles.forEach(m => { if (!have.has(m.id)) state.config.mapStyles.push({ ...m }); }); }
  function applyData(d) { if (!d) return false; if (d.rundown) state.rundown = d.rundown; if (d.config) state.config = deepMerge(DEFAULT_CONFIG, d.config); if (d.color) state.color = d.color; if (d.mapStyle) state.mapStyle = d.mapStyle; if (d.reveal) state.reveal = d.reveal; if (d.tracking) state.tracking = d.tracking; if ('trackFocus' in d) state.trackFocus = d.trackFocus; if (d.broadcast) state.broadcast = deepMerge(state.broadcast, d.broadcast); mergeNewMapStyles(); migrate(); return true; }
  // one-time fixes for older persisted configs
  function migrate() {
    const c = state.config; if (!c._mig) c._mig = {};
    // legacy logos sat under the gear (x16–60): nudge clear of it once
    if (!c._mig.logoX) { if (c.brand && c.brand.x != null && c.brand.x < 64) c.brand.x = 70; c._mig.logoX = true; }
    // the expanded tool-bar library: keep the new extra buttons hidden by default once
    if (!c._mig.qbar2) { c.qbar = c.qbar || { order: [], hidden: [] }; const def = ['tarrow', 'curve', 'circle', 'polygon', 'sketch', 'frontline', 'country', 'measure']; const set = new Set(c.qbar.hidden || []); def.forEach(id => set.add(id)); c.qbar.hidden = [...set]; c._mig.qbar2 = true; }
    if (!c._mig.qbar3) { c.qbar = c.qbar || { order: [], hidden: [] }; const set = new Set(c.qbar.hidden || []); set.add('flags'); c.qbar.hidden = [...set]; c._mig.qbar3 = true; }
    if (!c._mig.qbar4) { c.qbar = c.qbar || { order: [], hidden: [] }; const set = new Set(c.qbar.hidden || []); ['redo', 'hideui', 'grid', 'sea', 'clouds', 'daynight', 'fullscreen'].forEach(id => set.add(id)); c.qbar.hidden = [...set]; c._mig.qbar4 = true; }   // new extras off the bar by default; add them via the customiser
    // drop the rejected darkened-satellite / low-res NASA night styles; enable real dark vector maps
    if (!c._mig.nightClean) { const bad = ['satellite-night', 'satellite-dark', 'night-lights']; if (c.mapStyles) c.mapStyles = c.mapStyles.filter(m => !bad.includes(m.id)); if (bad.includes(state.mapStyle)) state.mapStyle = 'dataviz-dark'; ['streets-v2-dark', 'basic-v2-dark'].forEach(id => { const m = (c.mapStyles || []).find(x => x.id === id); if (m) m.on = true; }); c._mig.nightClean = true; }
    // add the Wireframe map style for configs saved before it existed
    if (!c._mig.wireframe) { c.mapStyles = c.mapStyles || []; if (!c.mapStyles.some(m => m.id === 'wireframe')) c.mapStyles.splice(1, 0, { id: 'wireframe', name: 'Wireframe', on: true }); c._mig.wireframe = true; }
    // raise the old 300 default ship cap so more live ships show
    if (!c._mig.maxShips1k) { if (c.trackStyle && (c.trackStyle.maxShips == null || c.trackStyle.maxShips === 300)) c.trackStyle.maxShips = 1000; c._mig.maxShips1k = true; }
    // panel layout moved to a per-window local store: seed this window's layout from the old
    // synced positions once (preserve current look), then strip it out of the synced config.
    if (c.layout) { if (Object.keys(c.layout).length && !Object.keys(layoutMap).length) { layoutMap = JSON.parse(JSON.stringify(c.layout)); persistLayout(); } delete c.layout; }
    // panel SIZE now syncs (config.panelScale); position stays local. Lift any scale that still
    // sits inside the local layout entries up into the synced panelScale once.
    if (!c._mig.panelScale) {
      c.panelScale = c.panelScale || {}; let moved = false;
      for (const k in layoutMap) { const e = layoutMap[k]; if (e && e.s && e.s !== 1) { if (c.panelScale[k] == null) c.panelScale[k] = e.s; delete e.s; moved = true; } }
      if (moved) persistLayout();
      c._mig.panelScale = true;
    }
  }
  function load() { try { return applyData(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return false; } }
  // true when the look hasn't been customised — lets the sync layer tell a FRESH window (which should
  // adopt the live room style) from a configured source-of-truth (which must not be reset).
  function isDefaultStyle() { try { return JSON.stringify(state.config.style) === JSON.stringify(DEFAULT_CONFIG.style); } catch (e) { return false; } }
  function exportState() { return { rundown: state.rundown, config: state.config, color: state.color, mapStyle: state.mapStyle, reveal: state.reveal, tracking: state.tracking }; }
  function importState(d) { applyData(d); emit('sync'); }
  // The control console is authoritative and must NOT be overwritten by another window writing the
  // shared key (e.g. a presenter tab in the same browser mirroring the cloud) — only the presenter
  // reloads from cross-window writes. This mirrors the same guard in sync-client's onmessage.
  window.addEventListener('storage', e => { if (e.key === KEY && window.APP_ROLE !== 'control') { load(); emit('sync', { silent: true }); } });

  /* ---- scenes ---- */
  const scenes = () => state.rundown.scenes;
  const activeScene = () => scenes().find(s => s.id === state.rundown.activeId) || null;
  const sceneIndex = id => scenes().findIndex(s => s.id === id);
  function addScene(view, opts = {}) {
    const okView = view && typeof view === 'object' && Number.isFinite(view.lat) && Number.isFinite(view.lng) && Number.isFinite(view.zoom);
    const s = { id: uid('sc'), title: opts.title || ('Scene ' + (scenes().length + 1)), view: okView ? view : { lat: 29.5, lng: 45, zoom: 5 }, mapStyle: opts.mapStyle || null, transition: { type: 'flyTo', duration: 1.2 }, elements: [], revealOrder: [], reveal: false, lowerThird: null };
    scenes().push(s); state.rundown.activeId = s.id; revealReset(s.id); emit('scenes'); return s;
  }
  function removeScene(id) { const i = sceneIndex(id); if (i < 0) return; scenes().splice(i, 1); if (state.rundown.activeId === id) state.rundown.activeId = (scenes()[i] || scenes()[i - 1] || {}).id || null; emit('scenes'); }
  function moveScene(id, dir) { const i = sceneIndex(id), j = i + dir; if (i < 0 || j < 0 || j >= scenes().length) return; const a = scenes();[a[i], a[j]] = [a[j], a[i]]; emit('scenes'); }
  function setActive(id) {
    state.rundown.activeId = id; revealReset(id);
    // a scene switch is a fresh shot: release the camera-owning animations so they don't fight the
    // scene's own camera move (fixes the snap-then-drag-back the operator saw on every cut).
    if (state.config.follow && state.config.follow.on) setFollow({ on: false, id: null, kind: null });
    if (state.config.campath && state.config.campath.playing) setCampath({ playing: false });
    if (timeline().playing) setTimeline({ playing: false });
    emit('active');
  }
  function nextScene() { const i = sceneIndex(state.rundown.activeId); if (i < scenes().length - 1) setActive(scenes()[i + 1].id); }
  function prevScene() { const i = sceneIndex(state.rundown.activeId); if (i > 0) setActive(scenes()[i - 1].id); }
  function renameScene(id, title) { const s = scenes().find(x => x.id === id); if (s) { s.title = title; emit('scenes'); } }
  function setSceneView(id, view) { const s = scenes().find(x => x.id === id); if (s && view) { s.view = view; emit('scenes'); } }

  /* ---- storyboard reveal + scene settings ---- */
  function revealReset(id) { const s = scenes().find(x => x.id === id); if (!s) return; state.reveal[id] = s.reveal ? 0 : s.elements.length; }
  function revealedCount(s) { if (!s) return 0; if (!s.reveal) return s.elements.length; const v = state.reveal[s.id]; return v == null ? 0 : Math.min(v, s.elements.length); }
  function revealNext() { const s = activeScene(); if (!s || !s.reveal) return false; const cur = revealedCount(s); if (cur >= s.elements.length) return false; state.reveal[s.id] = cur + 1; emit('reveal'); return true; }
  function revealPrev() { const s = activeScene(); if (!s || !s.reveal) return false; const cur = revealedCount(s); if (cur <= 0) return false; state.reveal[s.id] = cur - 1; emit('reveal'); return true; }
  function advance() { if (!revealNext()) nextScene(); }
  function retreat() { if (!revealPrev()) prevScene(); }
  function toggleSceneReveal(id) { const s = scenes().find(x => x.id === id); if (!s) return; s.reveal = !s.reveal; state.reveal[id] = s.reveal ? 0 : s.elements.length; emit('scenes'); }
  function setLowerThird(id, lt) { const s = scenes().find(x => x.id === id); if (!s) return; s.lowerThird = lt; emit('scenes'); }
  function setTransition(id, tr) { const s = scenes().find(x => x.id === id); if (!s) return; s.transition = tr; emit('scenes'); }

  function setMode(m) { state.mode = m; emit('mode'); }
  function toggleMode() { setMode(state.mode === 'build' ? 'live' : 'build'); }
  function setColor(c) { state.color = c; emit('color'); }
  function setMapStyle(id) { state.mapStyle = id; emit('mapstyle'); }
  function setTracking(kind, on) { state.tracking[kind] = on; emit('tracking'); }
  function setTrackFocus(mmsi) { state.trackFocus = mmsi; emit('trackfocus'); }
  function setBanner(patch) { Object.assign(state.broadcast.banner, patch); emit('broadcast'); }
  function setTicker(patch) { Object.assign(state.broadcast.ticker, patch); emit('broadcast'); }
  function setTour(patch) { Object.assign(state.broadcast.tour, patch); emit('broadcast'); }
  function setSpotlight(patch) { Object.assign(state.broadcast.spotlight, patch); emit('broadcast'); }
  function setAnim(patch) { Object.assign(state.broadcast.anim, patch); emit('broadcast'); }

  /* ---- elements (active scene) ---- */
  function addElement(rec) { const s = activeScene(); if (!s) return null; rec.id = uid('el'); s.__redo = []; s.elements.push(rec); emit('elements'); return rec; }
  function removeElement(id) { const s = activeScene(); if (!s) return; s.elements = s.elements.filter(e => e.id !== id); s.revealOrder = s.revealOrder.filter(x => x !== id); emit('elements'); }
  function updateElement(id, patch) { const s = activeScene(); if (!s) return; const e = s.elements.find(x => x.id === id); if (e) { Object.assign(e, patch); emit('elements'); } }
  function clearElements() { const s = activeScene(); if (!s) return; s.elements = []; s.revealOrder = []; s.__redo = []; emit('elements'); }
  function undo() { const s = activeScene(); if (!s || !s.elements.length) return; (s.__redo = s.__redo || []).push(s.elements.pop()); emit('elements'); }
  function redo() { const s = activeScene(); if (!s || !s.__redo || !s.__redo.length) return; s.elements.push(s.__redo.pop()); emit('elements'); }

  /* ---- config ---- */
  const cfg = () => state.config;
  function setStyle(patch) { Object.assign(state.config.style, patch); emit('config'); }
  function modelFix() { if (!state.config.modelFix) state.config.modelFix = {}; return state.config.modelFix; }
  // STABLE per-model key for the heading-correction table: catalog models share their filename (so
  // calibrating one fixes EVERY copy + all future placements of that model); uploaded blobs have no
  // filename, so they key by their own id. Used by eff() (render), the Turn button + the calibrator.
  function modelKey(m) { return m ? (m.src ? String(m.src).split('/').pop() : ('id:' + m.id)) : ''; }
  function setModelFix(key, deg) { if (!key) return; modelFix()[key] = ((Math.round(deg) % 360) + 360) % 360; emit('models3d'); }   // per-model heading correction (synced) — re-renders every instance keyed the same
  function setVisibility(key, on) { state.config.visibility[key] = on; emit('config'); }
  function setPerm(key, val) { state.config.permissions[key] = val; emit('config'); }
  function setToolPerm(tool, on) { state.config.permissions.tools[tool] = on; emit('config'); }
  function toolAllowed(tool) { return state.config.permissions.tools[tool] !== false; }
  function setMapStyleOn(id, on) { const m = state.config.mapStyles.find(x => x.id === id); if (m) { m.on = on; emit('config'); } }
  function addMapStyle(id, name) { if (!state.config.mapStyles.find(x => x.id === id)) { state.config.mapStyles.push({ id, name: name || id, on: true }); emit('config'); } }
  function removeMapStyle(id) { state.config.mapStyles = state.config.mapStyles.filter(x => x.id !== id); emit('config'); }
  function addAssetCat(name) { if (name && !state.config.assetCats.includes(name)) { state.config.assetCats.push(name); emit('config'); } }
  function removeAssetCat(name) { state.config.assetCats = state.config.assetCats.filter(c => c !== name); emit('config'); }
  function addCustomAsset(a) { a.id = uid('img'); state.config.customAssets.push(a); emit('config'); return a; }
  function removeCustomAsset(id) { state.config.customAssets = state.config.customAssets.filter(a => a.id !== id); emit('config'); }
  function setTrackStyle(patch) { Object.assign(state.config.trackStyle, patch); emit('config'); }
  function setLogo(url) { state.config.brand.logo = url; emit('config'); }
  function setLogoSize(px) { state.config.brand.size = px; emit('config'); }
  function setBrand(patch) { Object.assign(state.config.brand, patch); emit('config'); }
  function setTouch(on) { state.config.touch = on; emit('config'); }
  function setLocator(on) { state.config.locator = on; emit('config'); }
  function setTilt(v) { state.config.tilt = v; emit('config'); }
  function setEasing(v) { state.config.easing = v; emit('config'); }
  function setFollow(patch) { if (!state.config.follow) state.config.follow = { on: false, kind: null, id: null, zoom: null }; Object.assign(state.config.follow, patch); emit('follow'); }
  function setDrawDefaults(patch) { Object.assign(state.config.drawDefaults, patch); emit('config'); }
  function setMarkerScale(v) { state.config.markerScale = v; emit('config'); }
  function setLayout(sel, pos) { if (pos) layoutMap[sel] = pos; else delete layoutMap[sel]; persistLayout(); emit('layout', { silent: true }); }   // local-only position — see LAYOUT_KEY
  function clearLayout() { layoutMap = {}; persistLayout(); emit('layout', { silent: true }); }
  function setPanelScale(sel, s) { if (!state.config.panelScale) state.config.panelScale = {}; if (s && s !== 1) state.config.panelScale[sel] = s; else delete state.config.panelScale[sel]; emit('config'); }   // SYNCED — size reflects on the presenter
  function setQbar(patch) { if (!state.config.qbar) state.config.qbar = { order: [], hidden: [] }; Object.assign(state.config.qbar, patch); emit('config'); }
  function overlays() { if (!state.config.overlays) state.config.overlays = []; return state.config.overlays; }
  function addOverlay(o) { o.id = uid('ov'); if (o.on == null) o.on = true; if (o.opacity == null) o.opacity = 1; overlays().push(o); emit('overlays'); return o; }
  function updateOverlay(id, patch) { const o = overlays().find(x => x.id === id); if (o) { Object.assign(o, patch); emit('overlays'); } }
  function removeOverlay(id) { state.config.overlays = overlays().filter(x => x.id !== id); emit('overlays'); }
  function moveOverlay(id, dir) { const a = overlays(), i = a.findIndex(x => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; emit('overlays'); }
  function setOverlayWipe(f) { state.config.overlayWipe = Math.max(0, Math.min(1, f)); emit('overlays'); }
  function setOverlayWipeDir(d) { state.config.overlayWipeDir = d; emit('overlays'); }
  function setThreeD(patch) { if (!state.config.threeD) state.config.threeD = {}; Object.assign(state.config.threeD, patch); emit('threed'); }
  function setLight3d(patch) { if (!state.config.light3d) state.config.light3d = {}; Object.assign(state.config.light3d, patch); emit('light3d'); }
  function timeline() { if (!state.config.timeline) state.config.timeline = { dur: 15, head: 0, playing: false, loop: false, t0: 0, cam: [], models: {} }; return state.config.timeline; }
  function setTimeline(patch) {
    if (patch && Array.isArray(patch.cam)) patch.cam = patch.cam.filter(k => k && Number.isFinite(k.t) && Number.isFinite(k.lat) && Number.isFinite(k.lng));
    Object.assign(timeline(), patch); emit('timeline');
  }
  function setTrack3d(patch) { if (!state.config.track3d) state.config.track3d = {}; Object.assign(state.config.track3d, patch); emit('track3d'); }
  function setUI(patch) { if (!state.config.ui) state.config.ui = {}; Object.assign(state.config.ui, patch); emit('config'); }
  function setGrid(patch) { if (!state.config.grid) state.config.grid = {}; Object.assign(state.config.grid, patch); emit('config'); }
  function setSea(patch) { if (!state.config.sea) state.config.sea = {}; Object.assign(state.config.sea, patch); emit('config'); }
  function setClouds(patch) { if (!state.config.clouds) state.config.clouds = {}; Object.assign(state.config.clouds, patch); emit('config'); }
  function setLtStyle(v) { state.config.ltStyle = v; emit('scenes'); }
  function setThirds(on) { state.config.thirds = on; emit('config'); }
  function setDayNight(patch) { if (!state.config.dayNight) state.config.dayNight = {}; Object.assign(state.config.dayNight, patch); emit('config'); }
  function campath() { if (!state.config.campath) state.config.campath = { frames: [], legSec: 3, loop: false, playing: false }; return state.config.campath; }
  function setCampath(patch) { Object.assign(campath(), patch); emit('config'); }
  function addCampathFrame(v) { campath().frames.push(v); emit('config'); }
  function removeCampathFrame(i) { campath().frames.splice(i, 1); emit('config'); }
  function models3d() { if (!state.config.models3d) state.config.models3d = []; return state.config.models3d; }
  function addModel3d(m) { m.id = m.id || uid('m3d'); if (m.on == null) m.on = true; if (m.scale == null) m.scale = 1; if (m.rotZ == null) m.rotZ = 0; if (m.pitch == null) m.pitch = 0; if (m.roll == null) m.roll = 0; if (m.alt == null) m.alt = 0; if (!m.mode) m.mode = 'both'; if (!m.style) m.style = 'solid'; models3d().push(m); emit('models3d'); return m; }
  function updateModel3d(id, patch) { const m = models3d().find(x => x.id === id); if (m) { Object.assign(m, patch); emit('models3d'); } }
  function removeModel3d(id) { state.config.models3d = models3d().filter(x => x.id !== id); emit('models3d'); }
  function clearModels3d() { state.config.models3d = []; emit('models3d'); }
  function addPlace(p) { p.id = uid('pl'); state.config.places.push(p); emit('config'); return p; }
  function removePlace(id) { state.config.places = state.config.places.filter(x => x.id !== id); emit('config'); }
  function resetConfig() { state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); emit('config'); }

  /* ---- init ---- */
  load();

  return {
    state, on, emit, uid, load, exportState, importState, isDefaultStyle, modelFix, setModelFix, modelKey, DEFAULT_CONFIG,
    scenes, activeScene, sceneIndex,
    addScene, removeScene, moveScene, setActive, nextScene, prevScene, renameScene, setSceneView,
    revealReset, revealedCount, revealNext, revealPrev, advance, retreat, toggleSceneReveal, setLowerThird, setTransition,
    setMode, toggleMode, setColor, setMapStyle, setTracking, setTrackFocus, setBanner, setTicker, setTour, setSpotlight, setAnim,
    addElement, removeElement, updateElement, clearElements, undo, redo,
    cfg, setStyle, setVisibility, setPerm, setToolPerm, toolAllowed,
    setMapStyleOn, addMapStyle, removeMapStyle, addAssetCat, removeAssetCat, addCustomAsset, removeCustomAsset, setTrackStyle, setLogo, setLogoSize, setBrand, setTouch, setLocator, setTilt, setEasing, setFollow, setDrawDefaults, setMarkerScale, layout, setLayout, clearLayout, setPanelScale, setQbar, addPlace, removePlace, resetConfig,
    overlays, addOverlay, updateOverlay, removeOverlay, moveOverlay, setOverlayWipe, setOverlayWipeDir, setThreeD, setLight3d, setGrid, setSea, setClouds, setLtStyle, setThirds, setDayNight, campath, setCampath, addCampathFrame, removeCampathFrame,
    models3d, addModel3d, updateModel3d, removeModel3d, clearModels3d,
    timeline, setTimeline, setTrack3d, setUI,
  };
})();
window.Store = Store;
