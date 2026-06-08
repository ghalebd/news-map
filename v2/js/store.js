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
    visibility: { brand: true, status: true, deck: true, modeSwitch: true, fab: true, qtools: true, nownext: true, tracking: true },
    permissions: {
      tools: { select: true, marker: true, arrow: true, curve: true, ring: true, circle: true, polygon: true, sketch: true, text: true, measure: true, frontline: true, country: true, erase: true, asset: true },
      canDraw: true, canEditScenes: false, canNavigate: true, canChangeStyle: false, canChangeMapStyle: true, canTrack: true,
    },
    mapStyles: [
      { id: '019caada-7e48-7379-ba36-e8967f4fcc92', name: 'News', on: true },
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
    trackStyle: { shipColor: '#46d8ff', flightColor: '#ffd54a', lineWeight: 1, lineOpacity: 0.4, vectorMins: 3, trailPoints: 60, maxShips: 300, showVectors: true, showHistory: true, showRoutes: true },
    brand: { logo: null, size: 38, x: 70, y: 30 },   // logo data-URL + height(px) + position(px from top-left; 70 clears the gear)
    touch: false,            // large touch-friendly controls
    locator: false,          // mini locator inset map
    tilt: 0,                 // 3D perspective tilt (deg)
    drawDefaults: { color: '#ff453a', weight: 3 },   // default colour + stroke for new elements
    threeD: { exaggeration: 2.6, pitch: 62, labels3d: true },   // 3D terrain defaults (MapLibre)
    light3d: { on: true, az: 315, alt: 45, intensity: 1.9, ambient: 1.0, relief: 0.5 },   // 3D sun: lights terrain (hillshade) + GLB models from one direction
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
    layout: {},              // freely-dragged panel positions  { '.sel': {x,y} }
    qbar: { order: [], hidden: ['tarrow', 'curve', 'circle', 'polygon', 'sketch', 'frontline', 'country', 'measure', 'flags'] },   // vertical tool-bar: button order + hidden (extras off by default; add them from settings)
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
    // drop the rejected darkened-satellite / low-res NASA night styles; enable real dark vector maps
    if (!c._mig.nightClean) { const bad = ['satellite-night', 'satellite-dark', 'night-lights']; if (c.mapStyles) c.mapStyles = c.mapStyles.filter(m => !bad.includes(m.id)); if (bad.includes(state.mapStyle)) state.mapStyle = 'dataviz-dark'; ['streets-v2-dark', 'basic-v2-dark'].forEach(id => { const m = (c.mapStyles || []).find(x => x.id === id); if (m) m.on = true; }); c._mig.nightClean = true; }
  }
  function load() { try { return applyData(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return false; } }
  function exportState() { return { rundown: state.rundown, config: state.config, color: state.color, mapStyle: state.mapStyle, reveal: state.reveal, tracking: state.tracking }; }
  function importState(d) { applyData(d); emit('sync'); }
  window.addEventListener('storage', e => { if (e.key === KEY) { load(); emit('sync', { silent: true }); } });

  /* ---- scenes ---- */
  const scenes = () => state.rundown.scenes;
  const activeScene = () => scenes().find(s => s.id === state.rundown.activeId) || null;
  const sceneIndex = id => scenes().findIndex(s => s.id === id);
  function addScene(view, opts = {}) {
    const s = { id: uid('sc'), title: opts.title || ('Scene ' + (scenes().length + 1)), view: view || { lat: 29.5, lng: 45, zoom: 5 }, mapStyle: opts.mapStyle || null, transition: { type: 'flyTo', duration: 1.2 }, elements: [], revealOrder: [], reveal: false, lowerThird: null };
    scenes().push(s); state.rundown.activeId = s.id; revealReset(s.id); emit('scenes'); return s;
  }
  function removeScene(id) { const i = sceneIndex(id); if (i < 0) return; scenes().splice(i, 1); if (state.rundown.activeId === id) state.rundown.activeId = (scenes()[i] || scenes()[i - 1] || {}).id || null; emit('scenes'); }
  function moveScene(id, dir) { const i = sceneIndex(id), j = i + dir; if (i < 0 || j < 0 || j >= scenes().length) return; const a = scenes();[a[i], a[j]] = [a[j], a[i]]; emit('scenes'); }
  function setActive(id) { state.rundown.activeId = id; revealReset(id); emit('active'); }
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
  function setDrawDefaults(patch) { Object.assign(state.config.drawDefaults, patch); emit('config'); }
  function setLayout(sel, pos) { if (!state.config.layout) state.config.layout = {}; if (pos) state.config.layout[sel] = pos; else delete state.config.layout[sel]; emit('config'); }
  function clearLayout() { state.config.layout = {}; emit('config'); }
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
  function addModel3d(m) { m.id = m.id || uid('m3d'); if (m.on == null) m.on = true; if (m.scale == null) m.scale = 1; if (m.rotZ == null) m.rotZ = 0; if (m.pitch == null) m.pitch = 0; if (m.roll == null) m.roll = 0; if (m.alt == null) m.alt = 0; if (!m.mode) m.mode = 'both'; models3d().push(m); emit('models3d'); return m; }
  function updateModel3d(id, patch) { const m = models3d().find(x => x.id === id); if (m) { Object.assign(m, patch); emit('models3d'); } }
  function removeModel3d(id) { state.config.models3d = models3d().filter(x => x.id !== id); emit('models3d'); }
  function addPlace(p) { p.id = uid('pl'); state.config.places.push(p); emit('config'); return p; }
  function removePlace(id) { state.config.places = state.config.places.filter(x => x.id !== id); emit('config'); }
  function resetConfig() { state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); emit('config'); }

  /* ---- init ---- */
  load();

  return {
    state, on, emit, uid, load, exportState, importState, DEFAULT_CONFIG,
    scenes, activeScene, sceneIndex,
    addScene, removeScene, moveScene, setActive, nextScene, prevScene, renameScene, setSceneView,
    revealReset, revealedCount, revealNext, revealPrev, advance, retreat, toggleSceneReveal, setLowerThird, setTransition,
    setMode, toggleMode, setColor, setMapStyle, setTracking, setTrackFocus, setBanner, setTicker, setTour, setSpotlight, setAnim,
    addElement, removeElement, updateElement, clearElements, undo, redo,
    cfg, setStyle, setVisibility, setPerm, setToolPerm, toolAllowed,
    setMapStyleOn, addMapStyle, removeMapStyle, addAssetCat, removeAssetCat, addCustomAsset, removeCustomAsset, setTrackStyle, setLogo, setLogoSize, setBrand, setTouch, setLocator, setTilt, setDrawDefaults, setLayout, clearLayout, setQbar, addPlace, removePlace, resetConfig,
    overlays, addOverlay, updateOverlay, removeOverlay, moveOverlay, setOverlayWipe, setOverlayWipeDir, setThreeD, setLight3d, setGrid, setSea, setClouds, setLtStyle, setThirds, setDayNight, campath, setCampath, addCampathFrame, removeCampathFrame,
    models3d, addModel3d, updateModel3d, removeModel3d,
  };
})();
window.Store = Store;
