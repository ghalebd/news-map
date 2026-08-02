/* ============================================================
   CFG-TABS-B — settings-console tab builders, console + on-air
   group: Layout (presenter visibility, vertical tool bar, panel
   size/position) · Live tracking · Broadcast · Assets · Project.
   Split out of config-panel.js (over the 500-line limit).

   WHY A FACTORY AND NOT PLAIN CODE — read before editing:
   in config-panel.js every builder lived in ONE IIFE, so a
   builder could call section() / renderTab() / sectionCatalog()
   that are DECLARED HUNDREDS OF LINES LATER; function hoisting
   covered it. Hoisting does NOT cross files. Every one of those
   late-bound calls now arrives as an explicit parameter instead.
   config-panel.js calls this factory ONCE, after it has defined
   section / renderTab / live. Nothing here executes at load time
   — only the factory is defined — so this file may load before
   config-panel.js.

   THE SEAM THAT MATTERS — `live`:
   `live` is a SHARED MUTABLE map of the toggle elements that the
   Store.on() subscriber at the bottom of config-panel.js re-reads
   on every 'sync'/'tracking' event to keep this window's toggles
   mirroring the other window. tabMap (which STAYS in
   config-panel.js) writes live.seg; tabTracking (here) writes
   live.ships / live.flights / live.trails. Both must write the
   SAME object, so it is passed by reference through ctx — never
   copied, never re-created here, never destructured to its
   properties. If this file ever made its own {}, the tracking
   toggles would silently stop following a remote change: no
   error, no boot failure, just a wrong-looking console
   mid-broadcast. That is why the two `live`-writing tabs were
   split across files only after confirming the object itself
   crosses the boundary intact.

   WHY tabLayout IS HERE AND NOT IN cfg-tabs-a.js:
   purely a size decision — it is the single largest builder (77
   lines) and moving it is what puts BOTH new files and the
   remaining shell comfortably under the 500-line limit. It is
   also the only moved builder that needs the pin machinery
   (pinnedSet / togglePin / sectionCatalog) and the CfgKit
   interaction latch (K), so those three cross the seam for its
   sake alone. Note sectionCatalog() re-enters this builder (it
   renders every tab to enumerate sections) — its `_building`
   re-entrancy guard stays in config-panel.js and is unaffected
   by the move, because the guard and the catalogue both live on
   the config-panel side of the call.
   ============================================================ */
window.CfgTabsB = ctx => {
  // Explicit imports — the hoisting that used to make these visible is gone.
  // `live` MUST stay the ctx object's own reference (see header).
  const { S, I, h, esc, D, cp, live, K, section, renderTab, pinnedSet, sectionCatalog, togglePin,
    readImage, tog, rowTog, rowWith, field, swatches, slider, knob, knobs, TC, VIS } = ctx;

  function tabLayout(C, ct) {
    const { sec, bd } = section('Presenter visibility', I.eye, () => Object.keys(D.visibility).forEach(k => S.setVisibility(k, D.visibility[k])));
    VIS.forEach(([k, lab]) => bd.appendChild(rowTog(lab, C.visibility[k] !== false, on => S.setVisibility(k, on))));
    ct.appendChild(sec);

    // ---- vertical tool-bar: reorder + show/hide buttons ----
    const q = section('Vertical tool bar', I.sliders, () => { window.QBar && QBar.reset(); renderTab(); });
    const items = window.QBar ? QBar.list() : [];
    const lst = h('div', 'cfg-qbar');
    let dragId = null;
    items.forEach((it, idx) => {
      const row = h('div', 'cfg-qrow' + (it.hidden ? ' is-off' : '') + (it.sep ? ' is-sep' : ''));
      row.draggable = true; row.dataset.qid = it.id;
      row.appendChild(h('span', 'cfg-qrow__grip', '⋮⋮'));
      row.appendChild(h('span', 'cfg-qrow__n', esc(it.label)));
      // latched like the other grips — a sync-driven rebuild mid-drag would delete this row
      row.ondragstart = e => { K.hold(); dragId = it.id; row.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; };
      row.ondragend = () => { K.release(); dragId = null; row.classList.remove('is-drag'); lst.querySelectorAll('.is-over').forEach(r => r.classList.remove('is-over')); };
      row.ondragover = e => { e.preventDefault(); if (dragId && dragId !== it.id) row.classList.add('is-over'); };
      row.ondragleave = () => row.classList.remove('is-over');
      row.ondrop = e => {
        e.preventDefault(); row.classList.remove('is-over');
        if (!dragId || dragId === it.id) return;
        const ord = QBar.orderFull(); const from = ord.indexOf(dragId), to = ord.indexOf(it.id);
        if (from < 0 || to < 0) return; ord.splice(to, 0, ord.splice(from, 1)[0]);
        QBar.setOrder(ord); renderTab();
      };
      const up = h('button', 'cfg-ordb', I.chevron); up.style.transform = 'rotate(180deg)'; up.title = 'Move up'; up.disabled = idx === 0; up.onclick = () => { QBar.move(it.id, -1); renderTab(); };
      const dn = h('button', 'cfg-ordb', I.chevron); dn.title = 'Move down'; dn.disabled = idx === items.length - 1; dn.onclick = () => { QBar.move(it.id, 1); renderTab(); };
      row.append(up, dn);
      if (it.sep) { const del = h('button', 'cfg-ordb', I.close); del.title = 'Remove separator'; del.onclick = () => { QBar.removeSep(it.id); renderTab(); }; row.appendChild(del); }
      else { const vis = h('button', 'cfg-ordb' + (it.hidden ? '' : ' is-on'), it.hidden ? I.eyeOff : I.eye); vis.title = it.hidden ? 'Show in bar' : 'Hide from bar'; vis.onclick = () => { QBar.toggle(it.id); renderTab(); }; row.appendChild(vis); }
      lst.appendChild(row);
    });
    q.bd.appendChild(lst);
    const addSep = h('button', 'cfg-btn', I.plus + ' Add separator'); addSep.title = 'Insert a divider line — drag it between buttons to group your tools';
    addSep.onclick = () => { QBar.addSep(); renderTab(); };
    q.bd.appendChild(addSep);
    q.bd.appendChild(h('div', 'hint', 'Drag rows to reorder (or use the arrows), show/hide buttons, and add separator lines to group tools your way.'));
    // add ANY settings panel as a quick bar button (opens it as a popup from the bar)
    q.bd.appendChild(h('div', 'cfg-subhd', 'Add a settings panel to the bar'));
    const plist = h('div', 'cfg-qbar'); const pinned = pinnedSet(); let lastCat = null;
    sectionCatalog().forEach(s => {
      if (s.cat !== lastCat) { plist.appendChild(h('div', 'cfg-qcat', esc(s.cat))); lastCat = s.cat; }
      const row = h('div', 'cfg-qrow'); row.appendChild(h('span', 'cfg-qrow__n', esc(s.title)));
      const on = pinned.has(s.id); const add = h('button', 'cfg-ordb' + (on ? ' is-on' : ''), on ? I.eye : I.plus); add.title = on ? 'Remove from bar' : 'Add to bar';
      add.onclick = () => { togglePin(s.title, s.icon); renderTab(); }; row.appendChild(add); plist.appendChild(row);
    });
    q.bd.appendChild(plist);
    q.bd.appendChild(h('div', 'hint', 'Added panels appear as buttons on the bar; clicking one pops the panel open next to the bar — no need to open the whole settings drawer.'));
    ct.appendChild(q.sec);

    // ---- per-panel size & position ----
    const p = section('Panel size & position', I.pan, () => { S.clearLayout(); S.setBrand({ x: D.brand.x, y: D.brand.y }); });
    p.bd.appendChild(h('div', 'hint', 'Grab any panel by the tab on its top edge to drag it. Per panel: set the size, snap it to any edge / corner, or centre it.'));
    const ANCH = [['tl', '⌜'], ['tc', '↑'], ['tr', '⌝'], ['ml', '←'], ['mc', '◉'], ['mr', '→'], ['bl', '⌞'], ['bc', '↓'], ['br', '⌟']];
    (window.Movable ? Movable.panels : []).forEach(({ sel, label, axis }) => {
      const card = h('div', 'cfg-pan');
      const head = h('div', 'cfg-pan__h'); head.appendChild(h('span', 'cfg-pan__n', label));
      const rst = h('button', 'cfg-pan__x', I.undo); rst.title = 'Reset this panel'; rst.onclick = () => { Movable.resetPanel(sel); renderTab(); };
      head.appendChild(rst); card.appendChild(head);
      const pct = Math.round(Movable.scaleOf(sel) * 100);
      const srow = h('div', 'cfg-scl'); srow.appendChild(h('span', 'cfg-scl__n', 'Size'));
      const rng = h('input'); rng.type = 'range'; rng.min = '50'; rng.max = '170'; rng.step = '5'; rng.value = pct;
      const val = h('span', 'cfg-scl__v', pct + '%');
      rng.oninput = () => { val.textContent = rng.value + '%'; Movable.setScale(sel, (+rng.value) / 100); };
      srow.append(rng, val); card.appendChild(srow);
      const grid = h('div', 'cfg-anch');
      ANCH.forEach(([code, glyph]) => { const b = h('button', 'cfg-anch__b' + (axis === 'y' && code[1] !== 'c' ? ' is-dim' : '') + (code === 'mc' ? ' is-mid' : ''), glyph); b.title = code === 'mc' ? 'Centre' : 'Snap ' + code.toUpperCase(); b.onclick = () => Movable.snap(sel, code); grid.appendChild(b); });
      card.appendChild(grid);
      p.bd.appendChild(card);
    });
    const rb = h('button', 'cfg-btn', 'Reset all sizes & positions');
    rb.onclick = () => { S.clearLayout(); S.setBrand({ x: D.brand.x, y: D.brand.y }); renderTab(); };
    p.bd.appendChild(rb);
    ct.appendChild(p.sec);
  }

  function tabTracking(C, ct) {
    const T0 = window.Tracking || {};
    const sc = T0.Ships && T0.Ships.ships ? T0.Ships.ships.size : 0, fc = T0.Flights && T0.Flights.flights ? T0.Flights.flights.size : 0;
    const t1 = section('Live ships & flights', I.ship);
    live.ships = tog(!!S.state.tracking.ships, on => S.setTracking('ships', on));
    live.flights = tog(!!S.state.tracking.flights, on => S.setTracking('flights', on));
    live.trails = tog(S.state.tracking.trails !== false, on => S.setTracking('trails', on));
    t1.bd.append(rowWith('Live ships (AIS)' + (sc ? ` · ${sc}` : ''), live.ships), rowWith('Live flights' + (fc ? ` · ${fc}` : ''), live.flights), rowWith('Route / trail lines', live.trails));
    ct.appendChild(t1.sec);
    const T = Object.assign({ shipColor: '#46d8ff', flightColor: '#ffd54a', lineWeight: 1, lineOpacity: 0.4, vectorMins: 3, trailPoints: 60, maxShips: 1000, showVectors: true, showHistory: true, showRoutes: true }, C.trackStyle || {});
    const t2 = section('Tracking style', I.curve, () => S.setTrackStyle(cp(D.trackStyle)));
    t2.bd.append(field('Ship colour', swatches(TC, T.shipColor, c => S.setTrackStyle({ shipColor: c }))),
      field('Flight colour', swatches(TC, T.flightColor, c => S.setTrackStyle({ flightColor: c }))),
      knobs(
        knob('Thick', T.lineWeight, 0.5, 4, 0.5, v => S.setTrackStyle({ lineWeight: v })),
        knob('Opacity', Math.round(T.lineOpacity * 100), 10, 100, 5, v => S.setTrackStyle({ lineOpacity: v / 100 })),
        knob('Vector', T.vectorMins, 0, 15, 1, v => S.setTrackStyle({ vectorMins: v })),
        knob('Trail', T.trailPoints, 5, 200, 5, v => S.setTrackStyle({ trailPoints: v })),
        knob('Max', T.maxShips, 100, 3000, 100, v => S.setTrackStyle({ maxShips: v })),
      ),
      rowTog('Course vectors', T.showVectors !== false, on => S.setTrackStyle({ showVectors: on })),
      rowTog('Travelled trails', T.showHistory !== false, on => S.setTrackStyle({ showHistory: on })),
      rowTog('Destination routes', T.showRoutes !== false, on => S.setTrackStyle({ showRoutes: on })));
    ct.appendChild(t2.sec);
    // live ships/planes as lightweight 3D in the 3D map
    const L3 = Object.assign({ on: true, shipKm: 5, planeKm: 4, realAlt: true }, C.track3d || {});
    const t3 = section('Live 3D tracking', I.ship, () => S.setTrack3d(cp(S.DEFAULT_CONFIG.track3d)));
    t3.bd.appendChild(rowTog('Show ships & planes in 3D', L3.on !== false, on => S.setTrack3d({ on })));
    t3.bd.append(
      slider('Ship size (km)', Math.round(L3.shipKm * 10) / 10, 0.5, 40, 0.5, v => S.setTrack3d({ shipKm: v })),
      slider('Plane size (km)', Math.round(L3.planeKm * 10) / 10, 0.5, 40, 0.5, v => S.setTrack3d({ planeKm: v })));
    t3.bd.appendChild(rowTog('Planes at real altitude', L3.realAlt !== false, on => S.setTrack3d({ realAlt: on })));
    t3.bd.appendChild(h('div', 'hint', 'In the 3D map, live ships and flights are drawn as fast, low-poly 3D shapes (instanced — hundreds render cheaply), coloured by the tracking colours and pointed along their heading. Planes can sit at their real altitude.'));
    ct.appendChild(t3.sec);
  }
  function tabBroadcast(C, ct) {
    const bc = S.state.broadcast;
    const b1 = section('Breaking banner', I.film);
    b1.bd.appendChild(rowTog('Show banner', !!bc.banner.on, on => S.setBanner({ on })));
    const bt = h('input', 'cfg-name'); bt.placeholder = 'Banner headline'; bt.value = bc.banner.text || ''; bt.oninput = () => S.setBanner({ text: bt.value }); b1.bd.appendChild(bt);
    ct.appendChild(b1.sec);
    const b2 = section('News ticker', I.film);
    b2.bd.appendChild(rowTog('Show ticker', !!bc.ticker.on, on => S.setTicker({ on })));
    const tt = h('input', 'cfg-name'); tt.placeholder = 'Ticker text'; tt.value = bc.ticker.text || ''; tt.oninput = () => S.setTicker({ text: tt.value }); b2.bd.appendChild(tt);
    b2.bd.appendChild(slider('Ticker speed', bc.ticker.speed || 60, 20, 160, 5, v => S.setTicker({ speed: v })));
    ct.appendChild(b2.sec);
    const lt = section('Lower-third style', I.text);
    const cur = S.cfg().ltStyle || 'news';
    const seg = h('div', 'cfg-seg');
    [['news', 'News'], ['breaking', 'Breaking'], ['glass', 'Glass'], ['box', 'Box'], ['minimal', 'Minimal'], ['bold', 'Bold']].forEach(([id, lab]) => { const bb = h('button', 'cfg-seg__b' + (cur === id ? ' on' : ''), lab); bb.onclick = () => { S.setLtStyle(id); renderTab(); }; seg.appendChild(bb); });
    lt.bd.append(seg, h('div', 'hint', 'Template for the on-air lower-third. Set its text per scene in the Scene inspector (live mode shows it).'));
    ct.appendChild(lt.sec);
    const b3 = section('Auto-tour', I.play);
    b3.bd.append(rowTog('Auto-play scenes', !!bc.tour.playing, on => S.setTour({ playing: on })), slider('Interval (s)', bc.tour.sec || 8, 2, 30, 1, v => S.setTour({ sec: v })));
    ct.appendChild(b3.sec);
    // camera path record / replay
    const cpc = S.cfg().campath || { frames: [], legSec: 3, loop: false, playing: false };
    const cpSec = section('Camera path (record / replay)', I.film, () => S.setCampath({ frames: [], playing: false }));
    const cap = h('button', 'cfg-btn', `${I.target || I.marker}<span>Capture current view</span>`);
    cap.onclick = () => { S.addCampathFrame(window.GameMap.currentView()); renderTab(); };
    cpSec.bd.append(cap, h('div', 'hint', `${cpc.frames.length} keyframe(s) recorded — capture a few views, then play to fly between them.`));
    if (cpc.frames.length) { const clr = h('button', 'cfg-btn', 'Clear path'); clr.onclick = () => { S.setCampath({ frames: [], playing: false }); renderTab(); }; cpSec.bd.appendChild(clr); }
    cpSec.bd.append(
      slider('Leg duration (s)', cpc.legSec || 3, 1, 12, 1, v => S.setCampath({ legSec: v })),
      rowTog('Loop path', !!cpc.loop, on => S.setCampath({ loop: on })));
    const cpPlay = h('button', 'cfg-btn', `${cpc.playing ? I.minus : I.play}<span>${cpc.playing ? 'Stop' : 'Play path'}</span>`);
    cpPlay.onclick = () => { S.setCampath({ playing: !cpc.playing }); renderTab(); };
    cpSec.bd.appendChild(cpPlay);
    ct.appendChild(cpSec.sec);
    const sp = bc.spotlight || {};
    const b4 = section('Spotlight', I.target, () => S.setSpotlight({ radiusKm: 400, feather: 40, dim: 66 }));
    b4.bd.appendChild(rowTog('Focus mask', !!sp.on, on => { const cv = window.GameMap.currentView(); S.setSpotlight(on ? { on: true, lat: cv.lat, lng: cv.lng } : { on: false }); }));
    b4.bd.appendChild(knobs(
      knob('Radius', sp.radiusKm || 400, 50, 8000, 50, v => S.setSpotlight({ radiusKm: v })),
      knob('Feather', sp.feather == null ? 40 : sp.feather, 0, 100, 5, v => S.setSpotlight({ feather: v })),
      knob('Dim', sp.dim == null ? 66 : sp.dim, 0, 95, 5, v => S.setSpotlight({ dim: v })),
    ));
    const rc = h('button', 'cfg-btn', `${I.target}<span>Centre on view</span>`); rc.onclick = () => { const cv = window.GameMap.currentView(); S.setSpotlight({ lat: cv.lat, lng: cv.lng }); }; b4.bd.appendChild(rc);
    ct.appendChild(b4.sec);
    // animation engine (auto-build the scene with draw-on)
    const an = bc.anim || {};
    const b5 = section('Animation', I.play);
    const play = h('button', 'cfg-btn', `${an.playing ? I.minus : I.play}<span>${an.playing ? 'Stop' : 'Play scene build'}</span>`);
    play.onclick = () => S.setAnim({ playing: !an.playing });
    b5.bd.appendChild(play);
    b5.bd.appendChild(slider('Step speed (ms)', an.ms || 700, 150, 2500, 50, v => S.setAnim({ ms: v })));
    b5.bd.appendChild(rowTog('Loop', !!an.loop, on => S.setAnim({ loop: on })));
    b5.bd.appendChild(h('div', 'hint', 'Reveals the scene\'s elements one-by-one with draw-on animation (presenter mode).'));
    ct.appendChild(b5.sec);
  }
  function tabAssets(C, ct) {
    const { sec, bd } = section('Categories', I.folder);
    const chips = h('div', 'cfg-chips');
    C.assetCats.forEach(cat => { const c = h('span', 'cfg-chip', `${esc(cat)}<button class="x" title="Remove">×</button>`); c.querySelector('.x').onclick = () => { S.removeAssetCat(cat); renderTab(); }; chips.appendChild(c); });
    const addc = h('div', 'cfg-add', '<input placeholder="New category">'); const acb = h('button', null, 'Add'); addc.appendChild(acb);
    acb.onclick = () => { const v = addc.querySelector('input').value.trim(); if (v) { S.addAssetCat(v); renderTab(); } };
    bd.append(chips, addc); ct.appendChild(sec);
    const u = section('Upload image', I.upload);
    const file = h('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    const cat = h('select', 'cfg-sel'); C.assetCats.forEach(z => { const o = h('option', null, esc(z)); o.value = z; cat.appendChild(o); });
    const name = h('input', 'cfg-name'); name.placeholder = 'Name (optional)';
    const pick = h('button', 'cfg-uploadbtn', `${I.upload}<span>Choose image…</span>`); pick.onclick = () => file.click();
    file.onchange = async () => { const f = file.files[0]; if (!f) return; try { S.addCustomAsset({ name: name.value.trim() || f.name.replace(/\.[^.]+$/, ''), cat: cat.value || C.assetCats[0], url: await readImage(f) }); renderTab(); } catch (e) { alert('Could not read image.'); } };
    const up = h('div', 'cfg-up'); up.append(pick, cat, name, file); u.bd.appendChild(up); ct.appendChild(u.sec);
    const lib = section('Library', I.folder);
    const assets = C.customAssets || [];
    if (assets.length) { const grid = h('div', 'cfg-aset'); assets.forEach(a => { const it = h('div', 'cfg-aset__i', `<img src="${esc(a.url)}" alt=""><div class="m"><b>${esc(a.name || '')}</b><small>${esc(a.cat || '')}</small></div>`); const del = h('button', 'cfg-aset__x', I.close); del.onclick = () => { S.removeCustomAsset(a.id); renderTab(); }; it.appendChild(del); grid.appendChild(it); }); lib.bd.appendChild(grid); }
    else lib.bd.appendChild(h('div', 'hint', 'No images yet. Uploads appear in the presenter Image tool.'));
    ct.appendChild(lib.sec);
  }
  function tabProject(C, ct) {
    const { sec, bd } = section('Project', I.save);
    const row = h('div', 'cfg-btnrow');
    const mkBtn = (icon, label, fn) => { const b = h('button', 'cfg-btn', `${icon}<span>${label}</span>`); b.onclick = fn; return b; };
    row.append(
      mkBtn(I.save, 'Save file', () => window.UI && UI.saveProject(S.state.rundown.title)),
      mkBtn(I.load || I.upload, 'Load file', () => window.UI && UI.loadProject()),
      mkBtn(I.camera || I.eye, 'Export PNG', () => window.UI && UI.exportPNG()),
      mkBtn(I.save, 'Export PDF', () => window.UI && UI.exportPDF()),
      mkBtn(I.eyeOff || I.eye, 'Hide UI', () => window.UI && UI.hideUI(true)),
      mkBtn(I.erase, 'Clear scene', () => { if (confirm('Clear all elements of the current scene?')) { S.clearElements(); window.UI && UI.toast('Scene cleared'); } }),
    );
    bd.appendChild(row); ct.appendChild(sec);
    const sn = section('Snapshots', I.layers);
    const snapAdd = h('div', 'cfg-add', '<input placeholder="Snapshot name">'); const sab = h('button', null, 'Save'); snapAdd.appendChild(sab);
    sab.onclick = () => { window.UI && UI.saveSnapshot(snapAdd.querySelector('input').value.trim()); renderTab(); };
    sn.bd.appendChild(snapAdd);
    const snList = h('div', 'cfg-list');
    (window.UI ? UI.snaps() : []).forEach(s => { const li = h('div', 'cfg-li'); li.style.cursor = 'pointer'; li.innerHTML = `<div class="nm">${esc(s.name)} <small>${esc(s.at)}</small></div>`; li.onclick = () => UI.restoreSnapshot(s.id); const del = h('button', 'cfg-aset__x', I.close); del.style.position = 'static'; del.style.opacity = '1'; del.onclick = e => { e.stopPropagation(); UI.deleteSnapshot(s.id); renderTab(); }; li.appendChild(del); snList.appendChild(li); });
    sn.bd.appendChild(snList);
    const reset = h('button', 'cfg-reset', 'Reset all settings to defaults');
    reset.onclick = () => { if (confirm('Reset all control settings to defaults?')) { S.resetConfig(); renderTab(); } };
    sn.bd.appendChild(reset); ct.appendChild(sn.sec);
  }

  return { tabLayout, tabTracking, tabBroadcast, tabAssets, tabProject };
};
