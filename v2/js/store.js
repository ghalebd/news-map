/* ============================================================
   STORE — single source of truth: Rundown -> Scenes -> Elements.
   Tiny pub/sub. Everything (build + live) reads/writes here.
   ============================================================ */
const Store = (() => {
  let n = 0;
  const uid = p => p + (++n) + '_' + Math.floor(performance.now());

  const state = {
    mode: 'build',                 // 'build' | 'live'
    color: '#ffb000',
    mapStyle: 'satellite',
    rundown: { title: 'News Rundown', scenes: [], activeId: null },
  };

  const subs = [];
  const on = fn => { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; };
  const emit = (evt) => subs.forEach(fn => fn(state, evt || 'change'));

  const scenes = () => state.rundown.scenes;
  const activeScene = () => scenes().find(s => s.id === state.rundown.activeId) || null;
  const sceneIndex = id => scenes().findIndex(s => s.id === id);

  function addScene(view, opts = {}) {
    const s = {
      id: uid('sc'),
      title: opts.title || ('Scene ' + (scenes().length + 1)),
      view: view || { lat: 29.5, lng: 45, zoom: 5 },
      mapStyle: opts.mapStyle || null,
      transition: { type: 'flyTo', duration: 1.2 },
      elements: [],
      revealOrder: [],
      lowerThird: null,
    };
    scenes().push(s);
    state.rundown.activeId = s.id;
    emit('scenes');
    return s;
  }
  function removeScene(id) {
    const i = sceneIndex(id); if (i < 0) return;
    scenes().splice(i, 1);
    if (state.rundown.activeId === id) state.rundown.activeId = (scenes()[i] || scenes()[i - 1] || {}).id || null;
    emit('scenes');
  }
  function moveScene(id, dir) {
    const i = sceneIndex(id), j = i + dir;
    if (i < 0 || j < 0 || j >= scenes().length) return;
    const arr = scenes(); [arr[i], arr[j]] = [arr[j], arr[i]];
    emit('scenes');
  }
  function setActive(id) { state.rundown.activeId = id; emit('active'); }
  function nextScene() { const i = sceneIndex(state.rundown.activeId); if (i < scenes().length - 1) setActive(scenes()[i + 1].id); }
  function prevScene() { const i = sceneIndex(state.rundown.activeId); if (i > 0) setActive(scenes()[i - 1].id); }
  function renameScene(id, title) { const s = scenes().find(x => x.id === id); if (s) { s.title = title; emit('scenes'); } }

  function setMode(m) { state.mode = m; emit('mode'); }
  function toggleMode() { setMode(state.mode === 'build' ? 'live' : 'build'); }
  function setColor(c) { state.color = c; emit('color'); }
  function setMapStyle(id) { state.mapStyle = id; emit('style'); }

  /* element ops (operate on the active scene) */
  function addElement(rec) { const s = activeScene(); if (!s) return null; rec.id = uid('el'); s.__redo = []; s.elements.push(rec); emit('elements'); return rec; }
  function removeElement(elId) { const s = activeScene(); if (!s) return; s.elements = s.elements.filter(e => e.id !== elId); s.revealOrder = s.revealOrder.filter(x => x !== elId); emit('elements'); }
  function updateElement(elId, patch) { const s = activeScene(); if (!s) return; const e = s.elements.find(x => x.id === elId); if (e) { Object.assign(e, patch); emit('elements'); } }
  function clearElements() { const s = activeScene(); if (!s) return; s.elements = []; s.revealOrder = []; s.__redo = []; emit('elements'); }
  function undo() { const s = activeScene(); if (!s || !s.elements.length) return; (s.__redo = s.__redo || []).push(s.elements.pop()); emit('elements'); }
  function redo() { const s = activeScene(); if (!s || !s.__redo || !s.__redo.length) return; s.elements.push(s.__redo.pop()); emit('elements'); }

  return {
    state, on, emit, uid,
    scenes, activeScene, sceneIndex,
    addScene, removeScene, moveScene, setActive, nextScene, prevScene, renameScene,
    setMode, toggleMode, setColor, setMapStyle,
    addElement, removeElement, updateElement, clearElements, undo, redo,
  };
})();
window.Store = Store;
