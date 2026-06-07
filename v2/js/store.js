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
    style: { accent: '#5b9dff', glass: 55, blur: 24, distort: 46, radius: 14 },
    visibility: { brand: true, status: true, deck: true, modeSwitch: true, fab: true, qtools: true, nownext: true },
    permissions: {
      tools: { select: true, marker: true, arrow: true, curve: true, ring: true, circle: true, polygon: true, sketch: true, text: true, measure: true, erase: true, asset: true },
      canDraw: true, canEditScenes: false, canNavigate: true, canChangeStyle: false, canChangeMapStyle: true,
    },
    mapStyles: [
      { id: 'satellite', name: 'Satellite', on: true },
      { id: 'hybrid', name: 'Hybrid', on: true },
      { id: 'dataviz-dark', name: 'Dark', on: true },
      { id: 'streets-v2', name: 'Streets', on: true },
      { id: 'topo-v2', name: 'Topo', on: false },
      { id: 'ocean', name: 'Marine', on: true },
    ],
    assetCats: ['ground', 'air', 'naval', 'weapons', 'infra'],
    customAssets: [],   // { id, name, cat, url }
  };

  const state = {
    mode: 'build',                 // 'build' | 'live'
    color: '#ff453a',
    mapStyle: 'satellite',
    rundown: { title: 'News Rundown', scenes: [], activeId: null },
    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    reveal: {},                    // sceneId -> number of revealed elements (synced)
  };

  /* ---- pub/sub + persistence + cross-window sync ---- */
  const subs = [];
  const on = fn => { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; };
  let _t = null;
  function persist() { clearTimeout(_t); _t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ rundown: state.rundown, config: state.config, color: state.color, mapStyle: state.mapStyle, reveal: state.reveal })); } catch (e) {} }, 120); }
  const emit = (evt, opts) => { subs.forEach(fn => fn(state, evt || 'change')); if (!(opts && opts.silent)) persist(); };

  function deepMerge(def, ov) { const o = JSON.parse(JSON.stringify(def)); for (const k in ov) { if (ov[k] && typeof ov[k] === 'object' && !Array.isArray(ov[k])) o[k] = deepMerge(def[k] || {}, ov[k]); else o[k] = ov[k]; } return o; }
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!d) return false; if (d.rundown) state.rundown = d.rundown; if (d.config) state.config = deepMerge(DEFAULT_CONFIG, d.config); if (d.color) state.color = d.color; if (d.mapStyle) state.mapStyle = d.mapStyle; if (d.reveal) state.reveal = d.reveal; return true; } catch (e) { return false; } }
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
  function resetConfig() { state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); emit('config'); }

  /* ---- init ---- */
  load();

  return {
    state, on, emit, uid, load, DEFAULT_CONFIG,
    scenes, activeScene, sceneIndex,
    addScene, removeScene, moveScene, setActive, nextScene, prevScene, renameScene,
    revealReset, revealedCount, revealNext, revealPrev, advance, retreat, toggleSceneReveal, setLowerThird, setTransition,
    setMode, toggleMode, setColor, setMapStyle,
    addElement, removeElement, updateElement, clearElements, undo, redo,
    cfg, setStyle, setVisibility, setPerm, setToolPerm, toolAllowed,
    setMapStyleOn, addMapStyle, removeMapStyle, addAssetCat, removeAssetCat, addCustomAsset, removeCustomAsset, resetConfig,
  };
})();
window.Store = Store;
