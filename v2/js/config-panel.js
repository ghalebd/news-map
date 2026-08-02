/* ============================================================
   CONTROL PANEL — large tabbed console (control.html only).
   Category rail + multi-column content. Edits the shared
   Store.config; changes persist + sync live to the Presenter.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  // js/util.js. These two are also handed to cfg-tabs-a.js / cfg-tabs-b.js through the ctx object
  // below, so the tab builders keep getting the SAME shared implementation without importing it
  // themselves — one seam, not three.
  const { h, esc } = window.U;
  // widget kit + shared tables live in js/cfg-kit.js (loaded immediately before this file)
  const K = window.CfgKit;
  const { aspectOf, parseLatLng, readImage, ACCENTS, DTOOLS, VIS, PERMS, TC, DCOLORS, tog, rowTog, rowWith, slider, knob, swatches, knobs, field } = K;

  /* ---- shell: right-side drawer with quick actions + collapsible sections ---- */
  const toggle = h('button', 'cfg-toggle', I.settings); toggle.title = 'Control panel';
  const drawer = h('div', 'cfg-drawer cfg-panel');
  const head = h('div', 'cfg-hd', `<div class="t">Control Panel<small>NEWS MAP · CONSOLE</small></div>`);
  const qa = h('div', 'cfg-qa');
  const qbtn = (icon, title, fn) => { const b = h('button', 'cfg-qbtn', icon); b.title = title; b.onclick = fn; return b; };
  qa.append(
    qbtn(I.grid || I.layers, 'Reset section order & layout', () => { saveOrder([]); bodyEl.querySelectorAll('.cfg-sec.open').forEach(s => s.classList.remove('open')); renderTab(); }),
    qbtn(I.eyeOff || I.eye, 'Hide UI (H)', () => window.UI && UI.hideUI(true)),
    qbtn(I.camera || I.eye, 'Export PNG', () => window.UI && UI.exportPNG()),
    qbtn(I.save, 'Save file', () => window.UI && UI.saveProject(S.state.rundown.title)),
    qbtn(I.load || I.upload, 'Load file', () => window.UI && UI.loadProject()),
  );
  const x = h('button', 'x', I.close); head.append(qa, x);
  const search = h('input', 'cfg-search'); search.type = 'search'; search.placeholder = 'Search settings…';
  const bodyEl = h('div', 'cfg-body'); const resize = h('div', 'cfg-resize'); resize.title = 'Drag to resize'; drawer.append(head, search, bodyEl, resize); document.body.append(toggle, drawer);
  // restore a saved width
  const CW_KEY = 'newsmap.v3.cfgW';
  try { const w = +localStorage.getItem(CW_KEY); if (w >= 360) drawer.style.width = w + 'px'; } catch (e) {}
  const setOpen = o => { drawer.classList.toggle('open', o); toggle.classList.toggle('is-open', o); const w = drawer.getBoundingClientRect().width; document.body.style.setProperty('--cfg-w', w + 'px'); document.body.classList.toggle('cfg-open', o); if (window.Movable) { Movable.setCfgOffset(o ? w : 0); Movable.reflow(); setTimeout(Movable.reflow, 330); } };
  toggle.onclick = () => setOpen(!drawer.classList.contains('open'));
  x.onclick = () => setOpen(false);
  // interactive resize — widen toward the right; the tool bar + panels shift with it live
  resize.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startW = drawer.getBoundingClientRect().width;
    K.hold();   // a sync-driven renderTab() mid-resize would delete the handle under the pointer
    document.body.classList.add('cfg-resizing');
    const mv = ev => {
      const w = Math.max(360, Math.min(window.innerWidth * 0.96, startW + (ev.clientX - startX)));
      drawer.style.width = w + 'px'; document.body.style.setProperty('--cfg-w', w + 'px');
      if (window.Movable) { Movable.setCfgOffset(w); Movable.reflow(); }
      relayout();   // add/remove columns live as the panel widens/narrows
    };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); K.release(); document.body.classList.remove('cfg-resizing'); try { localStorage.setItem(CW_KEY, Math.round(drawer.getBoundingClientRect().width)); } catch (e) {} };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });

  /* ---- builders ---- */
  // every settings section can be "pinned" as a quick jump-button on the vertical tool
  // bar. This is wired into the shared section() helper, so EVERY current and FUTURE
  // section gets it automatically — no per-section work.
  const slugOf = t => 'cfg:' + String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const sectionMeta = {};   // qid -> { title, icon }
  const pinnedSet = () => new Set(((S.cfg().qbar || {}).pinned) || []);
  function togglePin(title, icon) {
    const id = slugOf(title); const cur = ((S.cfg().qbar || {}).pinned) || [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    sectionMeta[id] = { title, icon }; S.setQbar({ pinned: next }); renderBarButtons();
  }
  function section(title, icon, onReset) {
    sectionMeta[slugOf(title)] = { title, icon };
    const sec = h('div', 'cfg-sec');
    const hd = h('div', 'cfg-sec__hd', `<span class="cfg-grip" title="Drag to reorder">${I.grip || '⋮⋮'}</span><span class="i">${icon}</span><span class="t">${title}</span>`);
    if (window.Help) hd.appendChild(Help.dot(title));   // tiny "?" explainer for every section
    if (onReset) { const rb = h('button', 'cfg-sec__rst', I.undo); rb.title = 'Reset this section to defaults'; rb.onclick = e => { e.stopPropagation(); onReset(); renderTab(); }; hd.appendChild(rb); }
    hd.appendChild(h('span', 'chev', I.chevron));
    const bd = h('div', 'cfg-sec__bd');
    hd.onclick = () => { sec.classList.toggle('open'); repack(); };   // re-balance columns with a smooth FLIP slide (no hard jumps)
    sec.append(hd, bd); return { sec, bd };
  }
  // a single settings section as a POPUP flyout anchored to its tool-bar button
  let flyoutEl = null;
  function buildOne(title) { const tmp = document.createElement('div'); GROUPS.forEach(b => b(S.cfg(), tmp)); return [...tmp.children].find(s => s.querySelector('.t') && s.querySelector('.t').textContent === title); }
  function onFlyOut(e) { if (flyoutEl && !flyoutEl.contains(e.target) && !(e.target.closest && e.target.closest('.qtool[data-qid^="cfg:"]'))) closeFlyout(); }
  function onFlyKey(e) { if (e.key === 'Escape') closeFlyout(); }
  function closeFlyout() { if (!flyoutEl) return; flyoutEl.remove(); flyoutEl = null; document.removeEventListener('pointerdown', onFlyOut, true); document.removeEventListener('keydown', onFlyKey); }
  function popupSection(title, anchor) {
    if (flyoutEl && flyoutEl._title === title) { closeFlyout(); return; }   // toggle off
    closeFlyout();
    const sec = buildOne(title); if (!sec) return; sec.classList.add('open');
    const fly = h('div', 'cfg-flyout glass'); fly._title = title;   // NOT cfg-panel (that carries the drawer's slide transform)
    const x = h('button', 'cfg-flyout__x', I.close); x.title = 'Close'; x.onclick = closeFlyout;
    fly.append(x, sec); autoGroup(fly); document.body.appendChild(fly); flyoutEl = fly;
    const a = anchor.getBoundingClientRect(), w = fly.offsetWidth;
    // open to the right of the bar, or to the left if the bar sits on the right half
    let left = (a.left > window.innerWidth / 2) ? (a.left - w - 10) : (a.right + 10);
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    fly.style.left = Math.round(left) + 'px';
    fly.style.top = Math.round(Math.max(12, Math.min(a.top, window.innerHeight - fly.offsetHeight - 12))) + 'px';
    setTimeout(() => { document.addEventListener('pointerdown', onFlyOut, true); document.addEventListener('keydown', onFlyKey); }, 0);
  }
  // sync the cfg:* quick-buttons on the tool bar to match config.qbar.pinned
  function renderBarButtons() {
    const bar = document.querySelector('.qtools'); if (!bar) return;
    const pinned = ((S.cfg().qbar || {}).pinned) || [];
    bar.querySelectorAll('.qtool[data-qid^="cfg:"]').forEach(b => { if (!pinned.includes(b.dataset.qid)) b.remove(); });
    pinned.forEach(id => {
      if (bar.querySelector('.qtool[data-qid="' + id + '"]')) return;
      const meta = sectionMeta[id] || { title: id.slice(4), icon: I.sliders };
      const b = h('button', 'qtool', meta.icon); b.title = meta.title; b.dataset.qid = id; b.onclick = () => popupSection(meta.title, b); bar.appendChild(b);
    });
    if (window.QBar) QBar.apply();
  }
  const D = S.DEFAULT_CONFIG, cp = o => JSON.parse(JSON.stringify(o));
  const live = {};

  /* ---- tab builders ---- */
  function tabIdentity(C, ct) {
    const st = C.style;
    const { sec, bd } = section('Theme', I.sliders, () => { S.setStyle(cp(D.style)); S.setTilt(D.tilt); S.setTouch(D.touch); });
    const accField = field('Accent', swatches(ACCENTS, st.accent, c => S.setStyle({ accent: c })));
    bd.append(accField,
      knobs(
        knob('Opacity', st.glass, 0, 100, 1, v => S.setStyle({ glass: v })),
        knob('Blur', st.blur, 0, 60, 1, v => S.setStyle({ blur: v })),
        knob('Satur', st.sat == null ? 1.7 : st.sat, 1, 3, 0.05, v => S.setStyle({ sat: v })),
        knob('Bright', st.brightness == null ? 105 : st.brightness, 70, 140, 1, v => S.setStyle({ brightness: v })),
        knob('Distort', st.distort, 0, 120, 1, v => S.setStyle({ distort: v })),
        knob('Sheen', st.sheen == null ? 16 : st.sheen, 0, 50, 1, v => S.setStyle({ sheen: v })),
        knob('Shadow', st.shadow == null ? 1 : st.shadow, 0, 2.5, 0.1, v => S.setStyle({ shadow: v })),
        knob('Radius', st.radius, 0, 24, 1, v => S.setStyle({ radius: v })),
        knob('Tilt', C.tilt || 0, 0, 55, 1, v => S.setTilt(v)),
      ),
      rowTog('Touch mode (large controls)', !!C.touch, on => S.setTouch(on)));
    ct.appendChild(sec);
    const lg = section('Logo', I.camera, () => S.setBrand(cp(D.brand))); const Br = C.brand || {};
    const lf = h('input'); lf.type = 'file'; lf.accept = 'image/*'; lf.hidden = true;
    const pick = h('button', 'cfg-btn', `${I.upload}<span>Upload</span>`); pick.onclick = () => lf.click();
    const clr = h('button', 'cfg-btn', `${I.close}<span>Clear</span>`); clr.onclick = () => S.setLogo(null);
    lf.onchange = async () => { const f = lf.files[0]; if (!f) return; try { S.setLogo(await readImage(f, 512)); } catch (e) { alert('Could not read image'); } lf.value = ''; };
    const row = h('div', 'cfg-btnrow'); row.append(pick, clr, lf); lg.bd.appendChild(row);
    lg.bd.append(slider('Height', Br.size || 38, 16, 120, 2, v => S.setBrand({ size: v })),
      slider('X (from left)', Br.x == null ? 16 : Br.x, 0, 1200, 4, v => S.setBrand({ x: v })),
      slider('Y (from top)', Br.y == null ? 30 : Br.y, 10, 700, 4, v => S.setBrand({ y: v })));
    ct.appendChild(lg.sec);
  }
  function tabPermissions(C, ct) {
    const { sec, bd } = section('Allowed tools', I.lock, () => { Object.keys(D.permissions.tools).forEach(t => S.setToolPerm(t, D.permissions.tools[t])); ['canDraw', 'canNavigate', 'canEditScenes', 'canChangeMapStyle', 'canChangeStyle', 'canTrack'].forEach(k => S.setPerm(k, D.permissions[k])); });
    const grid = h('div', 'cfg-tools');
    DTOOLS.forEach(([id, lab]) => { const on = C.permissions.tools[id] !== false; const t = h('div', 'cfg-tool ' + (on ? 'on' : 'off'), `${I[id] || I.marker}<span>${lab}</span>`); t.onclick = () => { const nv = t.classList.contains('off'); t.classList.toggle('on', nv); t.classList.toggle('off', !nv); S.setToolPerm(id, nv); }; grid.appendChild(t); });
    bd.appendChild(grid); ct.appendChild(sec);
    const p2 = section('Presenter permissions', I.lock);
    PERMS.forEach(([k, lab]) => p2.bd.appendChild(rowTog(lab, C.permissions[k] !== false, on => S.setPerm(k, on))));
    ct.appendChild(p2.sec);
  }
  function tabTools(C, ct) {
    const D = Object.assign({ color: '#ff453a', weight: 3, markerIcon: '' }, C.drawDefaults || {});
    const { sec, bd } = section('Drawing defaults', I.sketch, () => S.setDrawDefaults(cp(S.DEFAULT_CONFIG.drawDefaults)));
    bd.append(field('Default colour', swatches(DCOLORS, D.color, c => { S.setDrawDefaults({ color: c }); S.setColor(c); })),
      knobs(
        slider('Stroke weight', D.weight, 1, 8, 1, v => S.setDrawDefaults({ weight: v })),
        slider('Marker size', C.markerScale == null ? 1 : C.markerScale, 0.6, 3, 0.1, v => S.setMarkerScale(v)),
      ));
    bd.appendChild(h('div', 'hint', 'Marker size scales every placed marker / targeting reticle (synced to the presenter). Per-element colour stays editable from the on-map context bar.'));
    ct.appendChild(sec);
  }
  function tabMap(C, ct) {
    const m1 = section('Active map type', I.layers);
    const seg = h('div', 'cfg-seg'); live.seg = seg;
    C.mapStyles.filter(m => m.on !== false).forEach(m => { const b = h('button', 'cfg-seg__b' + (m.id === S.state.mapStyle ? ' on' : ''), esc(m.name)); b.dataset.id = m.id; b.onclick = () => { S.setMapStyle(m.id); seg.querySelectorAll('.cfg-seg__b').forEach(y => y.classList.toggle('on', y === b)); }; seg.appendChild(b); });
    m1.bd.appendChild(seg); ct.appendChild(m1.sec);
    const m2 = section('Enabled styles', I.layers);
    const list = h('div', 'cfg-list');
    C.mapStyles.forEach(m => { const li = h('div', 'cfg-li', `<div class="nm">${esc(m.name)} <small>${esc(m.id)}</small></div>`); li.appendChild(tog(m.on !== false, on => S.setMapStyleOn(m.id, on))); list.appendChild(li); });
    const add = h('div', 'cfg-add', '<input placeholder="MapTiler id (e.g. winter-v2)">'); const ab = h('button', null, 'Add'); add.appendChild(ab);
    ab.onclick = () => { const v = add.querySelector('input').value.trim(); if (v) { S.addMapStyle(v, v.replace(/-v?\d+$/, '').replace(/-/g, ' ')); renderTab(); } };
    m2.bd.append(list, add); ct.appendChild(m2.sec);
    const m3 = section('Places & locator', I.target);
    m3.bd.appendChild(rowTog('Locator inset map', !!C.locator, on => S.setLocator(on)));
    const uiC = C.ui || {};
    m3.bd.appendChild(rowTog('Scale bar', !!uiC.scaleBar, on => S.setUI({ scaleBar: on })));
    m3.bd.appendChild(rowTog('Compass (rotates in 3D)', !!uiC.compass, on => S.setUI({ compass: on })));
    const pl = h('div', 'cfg-list');
    (C.places || []).forEach(p => { const li = h('div', 'cfg-li'); li.style.cursor = 'pointer'; li.innerHTML = `<div class="nm">${esc(p.name)} <small>${(+p.lat).toFixed(1)}, ${(+p.lng).toFixed(1)}</small></div>`; li.onclick = () => window.GameMap.flyToView({ lat: p.lat, lng: p.lng, zoom: p.zoom }, { type: 'flyTo', duration: 1 }); const del = h('button', 'cfg-aset__x', I.close); del.style.position = 'static'; del.style.opacity = '1'; del.onclick = e => { e.stopPropagation(); S.removePlace(p.id); renderTab(); }; li.appendChild(del); pl.appendChild(li); });
    const pa = h('div', 'cfg-add', '<input placeholder="Name this view">'); const pab = h('button', null, 'Add'); pa.appendChild(pab);
    pab.onclick = () => { const v = pa.querySelector('input').value.trim(); if (v) { const cv = window.GameMap.currentView(); S.addPlace({ name: v, lat: cv.lat, lng: cv.lng, zoom: cv.zoom }); renderTab(); } };
    m3.bd.append(pl, pa); ct.appendChild(m3.sec);
  }

  /* ---- tab builders that live in their own files ----
     cfg-tabs-a.js (overlays / 3D terrain / 3D models / fx / motion) and cfg-tabs-b.js
     (layout / tracking / broadcast / assets / project) hold the bulk of the tab
     builders — this file was over the 500-line limit. Those files only DEFINE a
     factory at load time, so their <script> tags may sit anywhere before this one.
     The factories are INVOKED here, and this is the only point where that is correct:
       · section / renderTab / sectionCatalog / togglePin are function DECLARATIONS in
         this IIFE, so they hoist — which is exactly why the split is dangerous:
         hoisting stops at the file edge. Handing them over by value, once, is what
         converts that invisible dependency into a checkable parameter.
       · `live` is passed as the OBJECT, never as its properties. tabMap (below) writes
         live.seg; tabTracking (cfg-tabs-b) writes live.ships/flights/trails; the
         Store.on subscriber at the bottom of this file reads all four to keep the
         toggles mirroring the other window on 'sync'. One object, three files — copy
         it and the tracking toggles silently stop following a remote change.
       · Invoke ONCE, never per render: cfg-tabs-a.js keeps the 3D catalogue's
         category / search text / IntersectionObserver at factory scope so they
         survive renderTab(), exactly as the old module-level `let`s did.
       · Must sit ABOVE `const GROUPS` / `const CATS` — they reference the returned
         builders and const does not hoist. */
  const CTX = { S, I, h, esc, D, cp, live, K, section, renderTab, pinnedSet, sectionCatalog, togglePin,
    aspectOf, parseLatLng, readImage, tog, rowTog, rowWith, field, swatches, slider, knob, knobs, TC, VIS };
  const { tabOverlays, tabThreeD, tabModels3d, tabFx, tabMotion } = window.CfgTabsA(CTX);
  const { tabLayout, tabTracking, tabBroadcast, tabAssets, tabProject } = window.CfgTabsB(CTX);

  const GROUPS = [tabIdentity, tabLayout, tabPermissions, tabTools, tabMap, tabOverlays, tabThreeD, tabModels3d, tabMotion, tabFx, tabTracking, tabBroadcast, tabAssets, tabProject];
  // category BANDS — all categories stacked in one vertical scroll. Each band is
  // collapsible and the whole band can be dragged to reorder categories; sections
  // inside a band stay individually reorderable. Add a new tabX to the right entry.
  const CATS = [
    { key: 'look', label: 'Look', groups: [tabIdentity] },
    { key: 'layout', label: 'Layout', groups: [tabLayout] },
    { key: 'tools', label: 'Tools', groups: [tabPermissions, tabTools] },
    { key: 'map', label: 'Map', groups: [tabMap, tabOverlays, tabFx] },
    { key: '3d', label: '3D', groups: [tabThreeD, tabModels3d, tabMotion] },
    { key: 'live', label: 'Live', groups: [tabTracking] },
    { key: 'cast', label: 'Broadcast', groups: [tabBroadcast] },
    { key: 'assets', label: 'Assets', groups: [tabAssets] },
    { key: 'project', label: 'Project', groups: [tabProject] },
  ];
  const COLL_KEY = 'newsmap.v3.cfgCatColl', CATORD_KEY = 'newsmap.v3.cfgCatOrder', CATACT_KEY = 'newsmap.v3.cfgCatActive';
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const catCollapsed = k => !!jget(COLL_KEY, {})[k];
  const toggleCat = k => { const c = jget(COLL_KEY, {}); c[k] = !c[k]; jset(COLL_KEY, c); renderTab(); };
  function orderedCats() { const o = jget(CATORD_KEY, []); return CATS.slice().sort((a, b) => { const ia = o.indexOf(a.key), ib = o.indexOf(b.key); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); }); }
  function reorderCat(from, to) { let o = jget(CATORD_KEY, []); if (!o.length) o = CATS.map(c => c.key); o = o.filter(x => x !== from); const i = o.indexOf(to); o.splice(i < 0 ? o.length : i, 0, from); jset(CATORD_KEY, o); renderTab(); }
  // flat catalog of every settings section { cat, title, icon(html), id } — built once
  let _catalog = null, _building = false;
  function sectionCatalog() {
    if (_catalog) return _catalog;
    if (_building) return [];   // re-entrancy guard: tabLayout builds this list while we render it
    _building = true; const out = [];
    CATS.forEach(c => { const tmp = document.createElement('div'); c.groups.forEach(b => b(S.cfg(), tmp)); [...tmp.children].forEach(secEl => { const t = secEl.querySelector('.t'); if (!t) return; const ic = secEl.querySelector('.i'); out.push({ cat: c.label, title: t.textContent, icon: ic ? ic.innerHTML : I.sliders, id: slugOf(t.textContent) }); }); });
    _building = false; _catalog = out; return out;
  }
  function setupCatDnD(band, key) {
    const grip = band.querySelector('.cfg-bandgrip'); if (!grip) return;
    grip.setAttribute('draggable', 'true'); grip.addEventListener('click', e => e.stopPropagation());
    // latch the drag: a sync-driven rebuild would delete the band being dragged mid-gesture
    grip.addEventListener('dragstart', e => { K.hold(); e.dataTransfer.setData('text/cat', key); e.dataTransfer.effectAllowed = 'move'; band.classList.add('dragging'); });
    grip.addEventListener('dragend', () => { K.release(); band.classList.remove('dragging'); });
    band.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/cat')) { e.preventDefault(); band.classList.add('catover'); } });
    band.addEventListener('dragleave', () => band.classList.remove('catover'));
    band.addEventListener('drop', e => { const from = e.dataTransfer.getData('text/cat'); if (!from) return; e.preventDefault(); band.classList.remove('catover'); if (from !== key) reorderCat(from, key); });
  }
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    bodyEl.querySelectorAll('.cfg-sec').forEach(sec => {
      let any = false;
      sec.querySelectorAll('.cfg-sec__bd > *').forEach(row => { const hit = !q || row.textContent.toLowerCase().includes(q); row.style.display = hit ? '' : 'none'; if (hit) any = true; });
      const titleHit = !q || sec.querySelector('.cfg-sec__hd .t').textContent.toLowerCase().includes(q);
      sec.style.display = (titleHit || any) ? '' : 'none';
      if (q && (any || titleHit)) sec.classList.add('open');
    });
    // when searching, hide a whole category band that has no matching section
    bodyEl.querySelectorAll('.cfg-band').forEach(band => { if (!q) { band.style.display = ''; return; } const vis = [...band.querySelectorAll('.cfg-sec')].some(s => s.style.display !== 'none'); band.style.display = vis ? '' : 'none'; });
  }
  search.oninput = () => renderTab();   // searching spans all categories → re-render then filter
  /* drag-to-reorder: persisted section order (local UI preference) */
  const ORDER_KEY = 'newsmap.v3.panelOrder';
  const title = sec => sec.querySelector('.cfg-sec__hd .t').textContent;
  const getOrder = () => { try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch (e) { return []; } };
  const saveOrder = a => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(a)); } catch (e) {} };
  function reorder(from, to) { let o = getOrder().filter(x => x !== from); const i = o.indexOf(to); o.splice(i < 0 ? o.length : i, 0, from); saveOrder(o); renderTab(); }
  function setupDnD(sec) {
    // only the grip drags — so a click anywhere else on the header reliably toggles open/close
    const grip = sec.querySelector('.cfg-grip');
    if (grip) {
      grip.setAttribute('draggable', 'true');
      grip.addEventListener('click', e => e.stopPropagation());
      // same latch as the category grip — the section being dragged must survive a remote sync
      grip.addEventListener('dragstart', e => { K.hold(); e.dataTransfer.setData('text/plain', title(sec)); e.dataTransfer.effectAllowed = 'move'; sec.classList.add('dragging'); });
      grip.addEventListener('dragend', () => { K.release(); sec.classList.remove('dragging'); });
    }
    sec.addEventListener('dragover', e => { e.preventDefault(); sec.classList.add('dragover'); });
    sec.addEventListener('dragleave', () => sec.classList.remove('dragover'));
    sec.addEventListener('drop', e => { e.preventDefault(); sec.classList.remove('dragover'); const from = e.dataTransfer.getData('text/plain'), to = title(sec); if (from && from !== to) reorder(from, to); });
  }
  // responsive column count from the panel width (~300px per column)
  function colCount() { const w = bodyEl.clientWidth || drawer.getBoundingClientRect().width || 600; return Math.max(1, Math.min(4, Math.round((w - 24) / 300))); }
  let _lastCols = 0;
  function relayout() { const n = colCount(); if (n === _lastCols) return; renderTab(); }
  function renderTab() {
    const openT = new Set([...bodyEl.querySelectorAll('.cfg-sec.open .cfg-sec__hd .t')].map(t => t.textContent));
    const sc = bodyEl.scrollTop;   // keep the operator anchored — never yank the list to the top
    bodyEl.innerHTML = '';
    const n = colCount(); _lastCols = n;
    const searching = !!search.value.trim();
    // section order (seed once across ALL sections so within-band reorder is stable)
    let order = getOrder();
    if (!order.length) { const all = document.createElement('div'); GROUPS.forEach(b => b(S.cfg(), all)); order = [...all.children].map(title); saveOrder(order); }
    // category BANDS stacked vertically (the original layout) + height-balanced masonry inside each
    bodyEl.classList.remove('cfg-railmode');
    orderedCats().forEach(c => {
      const collapsed = !searching && catCollapsed(c.key);
      const band = h('div', 'cfg-band' + (collapsed ? '' : ' open'));
      const hd = h('div', 'cfg-bandhd', `<span class="cfg-bandgrip" title="Drag to move this category">${I.gripH}</span><span class="cfg-bandlbl">${esc(c.label)}</span><span class="cfg-bandchev">${I.chevron}</span>`);
      hd.onclick = e => { if (e.target.closest('.cfg-bandgrip')) return; toggleCat(c.key); };
      band.appendChild(hd);
      const body = h('div', 'cfg-bandbody'); if (collapsed) body.style.display = 'none';
      const cols = []; for (let i = 0; i < n; i++) { const col = h('div', 'cfg-col'); cols.push(col); body.appendChild(col); }
      const tmp = document.createElement('div'); c.groups.forEach(b => b(S.cfg(), tmp));
      const secs = [...tmp.children].sort((a, b) => { const ia = order.indexOf(title(a)), ib = order.indexOf(title(b)); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
      secs.forEach(s => { if (openT.has(title(s))) s.classList.add('open'); });
      band.appendChild(body);
      setupCatDnD(band, c.key);
      bodyEl.appendChild(band);
      // height-balanced masonry: each section flows into the currently-shortest column
      const isVisible = !!bodyEl.offsetParent && !collapsed;   // named apart from the module-level `live` map of synced controls it used to shadow
      const per = Math.max(1, Math.ceil(secs.length / n));
      secs.forEach((sec, i) => {
        setupDnD(sec); sec._ord = i; autoGroup(sec);
        if (isVisible && n > 1) { let best = cols[0]; for (const col of cols) if (col.offsetHeight < best.offsetHeight) best = col; best.appendChild(sec); }
        else cols[Math.min(n - 1, Math.floor(i / per))].appendChild(sec);
      });
    });
    applyFilter();
    autoGroup(bodyEl);   // smart layout: pack consecutive dials into adaptive grids
    bodyEl.scrollTop = sc;   // restore scroll after the rebuild (no jump)
  }
  /* layout intelligence — wrap runs of 2+ sibling dials into an auto-fit grid so
     they distribute evenly at any panel width (no ragged gaps, any column count) */
  function autoGroup(root) {
    root.querySelectorAll('.cfg-sec__bd').forEach(bd => {
      let run = [];
      const flush = () => {
        if (run.length >= 2) { const g = h('div', 'cfg-knobs'); run[0].before(g); run.forEach(k => g.appendChild(k)); }
        run = [];
      };
      [...bd.children].forEach(ch => {
        if (ch.classList.contains('dknob')) run.push(ch);
        else if (ch.classList.contains('cfg-knobs')) flush();   // already grouped
        else flush();
      });
      flush();
    });
  }
  /* live re-balance: redistribute sections to the shortest columns and FLIP-animate
     them from their old positions — space stays packed, motion stays traceable */
  function repack() {
    if (!bodyEl.offsetParent) return;
    const all = [...bodyEl.querySelectorAll('.cfg-sec')];
    const first = new Map(all.map(s => [s, s.getBoundingClientRect()]));
    bodyEl.querySelectorAll('.cfg-bandbody').forEach(body => {
      if (body.style.display === 'none') return;
      const cols = [...body.children].filter(c => c.classList.contains('cfg-col'));
      if (cols.length < 2) return;
      const secs = cols.flatMap(c => [...c.children]).sort((a, b) => (a._ord || 0) - (b._ord || 0));
      const hts = new Map(secs.map(s => [s, s.offsetHeight]));   // measure BEFORE detaching
      secs.forEach(s => s.remove());
      const acc = cols.map(() => 0);
      secs.forEach(s => {
        let bi = 0; for (let i = 1; i < cols.length; i++) if (acc[i] < acc[bi]) bi = i;
        cols[bi].appendChild(s); acc[bi] += (hts.get(s) || 0) + 12;
      });
    });
    all.forEach(s => {
      const f = first.get(s), l = s.getBoundingClientRect();
      const dx = f.left - l.left, dy = f.top - l.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      s.style.transition = 'none'; s.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => {
        s.style.transition = 'transform .28s cubic-bezier(.25,.8,.3,1)'; s.style.transform = '';
        setTimeout(() => { s.style.transition = ''; }, 330);
      });
    });
  }
  renderTab();
  // models3d.js / models-anim.js are DEFERRED (they need the deferred three.min.js), so they run AFTER
  // this file. The first renderTab() above therefore sees window.Models3D === undefined and never wires
  // up the catalogue thumbnails — all 69 entries stayed blank squares for the whole session, and a model
  // whose route was already playing showed "Play". Deferred scripts finish before DOMContentLoaded, so
  // one re-render there picks them all up.
  if (!window.Models3D || !window.ModelsAnim) window.addEventListener('DOMContentLoaded', () => renderTab(), { once: true });
  renderBarButtons();   // place any pinned section buttons on the tool bar
  window.addEventListener('resize', relayout);

  // A remote sync must never rebuild the console mid-gesture. Typing is caught by the focus test,
  // but every dial / grip / resize handle is a pointer-captured plain <div> that never becomes
  // activeElement — those raise the CfgKit latch instead, and the rebuild waits for the gesture to
  // finish rather than being dropped.
  let syncPending = false;
  const typing = () => { const f = document.activeElement; return !!(f && drawer.contains(f) && /INPUT|TEXTAREA|SELECT/.test(f.tagName)); };
  const flushSync = () => { if (!syncPending || K.busy() || typing()) return; syncPending = false; renderTab(); };
  K.onIdle(flushSync);
  // a clean tap on a dial's number opens its type-in editor on the SAME pointerup that drops the
  // latch — so a deferred rebuild has to wait for that editor to be left, not just for the gesture
  drawer.addEventListener('focusout', () => setTimeout(flushSync, 0));
  S.on((st, evt) => {
    if (evt === 'config' || evt === 'sync') renderBarButtons();   // keep pinned bar buttons in step (cross-window too)
    // don't rebuild the panel out from under an input the operator is typing in
    if (evt === 'sync') {
      if (K.busy()) syncPending = true;
      else if (!typing()) renderTab();
    }
    if (evt === 'tracking' || evt === 'sync') {
      if (live.ships) live.ships.classList.toggle('on', !!S.state.tracking.ships);
      if (live.flights) live.flights.classList.toggle('on', !!S.state.tracking.flights);
      if (live.trails) live.trails.classList.toggle('on', S.state.tracking.trails !== false);
    }
    if (evt === 'mapstyle' || evt === 'sync') { if (live.seg) live.seg.querySelectorAll('.cfg-seg__b').forEach(z => z.classList.toggle('on', z.dataset.id === S.state.mapStyle)); }
  });
})();
