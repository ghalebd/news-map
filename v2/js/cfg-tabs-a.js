/* ============================================================
   CFG-TABS-A — settings-console tab builders, map-surface + 3D
   group: Satellite overlays · 3D terrain · 3D lighting · 3D
   model library / placed models · Grid-sea-clouds · Motion.
   Split out of config-panel.js (over the 500-line limit).

   WHY A FACTORY AND NOT PLAIN CODE — read before editing:
   in config-panel.js every builder lived in ONE IIFE, so a
   builder could call section() / renderTab() that are DECLARED
   HUNDREDS OF LINES LATER; function hoisting covered it. Hoisting
   does NOT cross files. So every late-bound call these builders
   make now has to arrive as an explicit parameter instead.
   config-panel.js calls this factory ONCE, after it has defined
   section / renderTab / live, and we close over the ctx it hands
   us. Nothing here executes at load time — only the factory is
   defined — so this file may load before config-panel.js.

   WHY THE BOUNDARY IS DRAWN HERE:
   · These five are the only tabs that touch window.Overlays /
     Map3D / Models3D / ModelsAnim / Assets3D, and the only ones
     that need the 3D-catalog module state (m3dCat, m3dSearch,
     thumbIO) declared below. That state is read AND written only
     inside tabModels3d, so it travels with it. Leaving it behind
     in config-panel.js would have forced a second shared mutable
     object across the seam for no gain.
   · The state stays at FACTORY scope, not inside tabModels3d:
     it must survive across renderTab() calls exactly as the old
     module-level `let` did (the chosen category, the search text
     and the observer that must be disconnected on the next
     render). The factory is invoked once, so the lifetime is
     identical to before.
   · `live` — the shared map of synced toggle elements — is
     deliberately NOT in this file's ctx: none of these tabs read
     or write it (only tabMap, which stays in config-panel.js,
     and tabTracking, which is in cfg-tabs-b.js).
   ============================================================ */
window.CfgTabsA = ctx => {
  // Explicit imports — the hoisting that used to make these visible is gone.
  const { S, I, h, esc, cp, section, renderTab, aspectOf, parseLatLng, readImage, slider, rowTog, rowWith, field, swatches } = ctx;

  function tabOverlays(C, ct) {
    const { sec, bd } = section('Satellite overlays', I.layers);
    // ---- add a new overlay ----
    let pendingUrl = null, pendingAspect = 1;
    const file = h('input'); file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
    const pick = h('button', 'cfg-btn', `${I.upload}<span>Choose image…</span>`); pick.onclick = () => file.click();
    file.onchange = async () => { const f = file.files[0]; if (!f) return; try { pendingUrl = await readImage(f, 1280); pendingAspect = await aspectOf(pendingUrl).catch(() => 1); pick.querySelector('span').textContent = f.name.slice(0, 22); } catch (e) { alert('Could not read image.'); } };
    const nameI = h('input', 'cfg-in'); nameI.placeholder = 'Layer name (optional)';
    const urlI = h('input', 'cfg-in'); urlI.placeholder = '…or paste an image URL';
    const coordI = h('input', 'cfg-in'); coordI.placeholder = 'Paste Google coords  e.g.  25.2048, 55.2708';
    const wI = h('input', 'cfg-in cfg-in--n'); wI.type = 'number'; wI.step = 'any'; wI.placeholder = 'Width km';
    const coordRow = h('div', 'cfg-ovrow2'); coordRow.append(coordI, wI);
    const srcUrl = async () => { if (pendingUrl) return { url: pendingUrl, aspect: pendingAspect }; const u = urlI.value.trim(); if (!u) return null; return { url: u, aspect: await aspectOf(u).catch(() => 1) }; };
    const reset = () => { pendingUrl = null; pendingAspect = 1; file.value = ''; pick.querySelector('span').textContent = 'Choose image…'; };
    const bView = h('button', 'cfg-btn', `${I.target}<span>Place at current view</span>`);
    bView.onclick = async () => { const s = await srcUrl(); if (!s) { alert('Choose an image or paste a URL first.'); return; } S.addOverlay({ name: nameI.value.trim() || 'Overlay', url: s.url, bounds: window.Overlays.viewBounds() }); reset(); renderTab(); };
    const bCoord = h('button', 'cfg-btn', `${I.marker}<span>Place at coordinates</span>`);
    bCoord.onclick = async () => { const s = await srcUrl(); if (!s) { alert('Choose an image or paste a URL first.'); return; } const co = parseLatLng(coordI.value); const w = +wI.value || 10; if (!co) { alert('Paste coordinates like  25.2048, 55.2708'); return; } S.addOverlay({ name: nameI.value.trim() || 'Overlay', url: s.url, bounds: window.Overlays.boundsFromCenter(co[0], co[1], w, s.aspect) }); reset(); renderTab(); };
    bd.append(pick, file, nameI, urlI, coordRow, bView, bCoord, h('div', 'hint', 'Frame the map like your image, then “Place at current view” — or drop it by centre coordinates (width in km; height auto from the image). Then nudge / scale to align.'));

    // ---- existing layers ----
    const ovs = S.overlays();
    ovs.forEach((o, idx) => {
      const card = h('div', 'cfg-pan');
      const head = h('div', 'cfg-pan__h');
      const nm = h('input', 'cfg-in cfg-in--name'); nm.value = o.name || 'Overlay'; nm.oninput = () => S.updateOverlay(o.id, { name: nm.value });
      const onb = h('button', 'cfg-ordb' + (o.on !== false ? ' is-on' : ''), o.on !== false ? I.eye : I.eyeOff); onb.title = 'Show / hide'; onb.onclick = () => { S.updateOverlay(o.id, { on: o.on === false }); renderTab(); };
      const del = h('button', 'cfg-pan__x', I.close); del.title = 'Delete layer'; del.onclick = () => { S.removeOverlay(o.id); renderTab(); };
      head.append(nm, onb, del); card.appendChild(head);
      card.appendChild(slider('Opacity', Math.round((o.opacity != null ? o.opacity : 1) * 100), 0, 100, 1, v => S.updateOverlay(o.id, { opacity: v / 100 })));
      card.appendChild(rowTog('Before / after wipe', !!o.wipe, on => { S.updateOverlay(o.id, { wipe: on }); }));
      const editing = window.Overlays && Overlays.editing === o.id;
      const align = h('button', 'cfg-btn' + (editing ? ' is-on' : ''), `${I.pan}<span>${editing ? 'Done aligning' : 'Align on map (drag)'}</span>`);
      align.onclick = () => { if (window.Overlays) Overlays.edit(o.id); renderTab(); };
      card.appendChild(align);
      // align controls: nudge pad + scale + order
      const tools = h('div', 'cfg-ovtools');
      const nb = (label, fn) => { const b = h('button', 'cfg-ordb', label); b.onclick = fn; return b; };
      const span = () => { const b = S.overlays().find(x => x.id === o.id).bounds; return { dLat: (b[1][0] - b[0][0]) * 0.06, dLng: (b[1][1] - b[0][1]) * 0.06 }; };
      tools.append(
        nb('↑', () => { const s = span(); window.Overlays.nudge(o.id, s.dLat, 0); }),
        nb('↓', () => { const s = span(); window.Overlays.nudge(o.id, -s.dLat, 0); }),
        nb('←', () => { const s = span(); window.Overlays.nudge(o.id, 0, -s.dLng); }),
        nb('→', () => { const s = span(); window.Overlays.nudge(o.id, 0, s.dLng); }),
        nb('−', () => window.Overlays.scale(o.id, 0.92)),
        nb('+', () => window.Overlays.scale(o.id, 1.08)),
        nb(I.chevron, () => { S.moveOverlay(o.id, 1); renderTab(); }),   // down = later = on top
      );
      card.appendChild(tools);
      bd.appendChild(card);
    });
    if (ovs.some(o => o.wipe && o.on !== false)) {
      const dir = C.overlayWipeDir || 'v', dseg = h('div', 'cfg-seg');
      [['v', 'Vertical'], ['h', 'Horizontal'], ['radial', 'Radial']].forEach(([id, lab]) => { const bb = h('button', 'cfg-seg__b' + (dir === id ? ' on' : ''), lab); bb.onclick = () => { S.setOverlayWipeDir(id); renderTab(); }; dseg.appendChild(bb); });
      bd.append(field('Wipe direction', dseg), slider('Wipe position', Math.round(((C.overlayWipe == null ? 0.5 : C.overlayWipe)) * 100), 0, 100, 1, v => S.setOverlayWipe(v / 100)));
    }
    ct.appendChild(sec);
  }

  function tabThreeD(C, ct) {
    const t = Object.assign({ exaggeration: 2.6, pitch: 62 }, C.threeD || {});
    const { sec, bd } = section('3D terrain', I.layers, () => S.setThreeD(cp(S.DEFAULT_CONFIG.threeD)));
    const enter = h('button', 'cfg-btn', `${I.target}<span>Enter / exit 3D</span>`);
    enter.onclick = () => window.Map3D && Map3D.toggle();
    bd.append(enter,
      slider('Terrain height', Math.round(t.exaggeration * 10) / 10, 0.3, 8, 0.1, v => S.setThreeD({ exaggeration: v })),
      slider('Camera pitch', Math.round(t.pitch), 0, 80, 1, v => S.setThreeD({ pitch: v })));
    bd.appendChild(rowTog('3D names (lie on terrain)', t.labels3d !== false, on => S.setThreeD({ labels3d: on })));
    bd.appendChild(rowTog('Globe (planet) view', !!t.globe, on => S.setThreeD({ globe: on })));
    bd.appendChild(rowTog('Sharp render (retina — slower)', !!t.hi, on => S.setThreeD({ hi: on })));
    bd.appendChild(h('div', 'hint', 'Real 3D terrain (MapLibre). Toggle from here or the “3D” button by the zoom controls; rotate with right-drag or the on-screen rotate buttons. Globe view shows the whole Earth as a sphere (zoom out); zoom in returns to the terrain. 3D models are shown in flat terrain view.'));
    ct.appendChild(sec);

    const L = Object.assign({ on: true, az: 315, alt: 45, intensity: 1.9, ambient: 1.0, relief: 0.5, shadow: 55, tshadow: 55 }, C.light3d || {});
    const lt = section('3D lighting', I.target, () => S.setLight3d(cp(S.DEFAULT_CONFIG.light3d)));
    lt.bd.appendChild(rowTog('Sun lighting', L.on !== false, on => S.setLight3d({ on })));
    lt.bd.append(
      slider('Sun direction', Math.round(L.az), 0, 359, 1, v => S.setLight3d({ az: v })),
      slider('Sun height', Math.round(L.alt), 0, 90, 1, v => S.setLight3d({ alt: v })),
      slider('Light brightness', Math.round(L.intensity * 10) / 10, 0, 4, 0.1, v => S.setLight3d({ intensity: v })),
      slider('Ambient fill', Math.round(L.ambient * 10) / 10, 0, 3, 0.1, v => S.setLight3d({ ambient: v })),
      slider('Terrain relief', Math.round(L.relief * 100) / 100, 0, 1, 0.05, v => S.setLight3d({ relief: v })),
      slider('Terrain shadow', Math.round(L.tshadow == null ? 55 : L.tshadow), 0, 100, 1, v => S.setLight3d({ tshadow: v })),
      slider('Model shadows', Math.round(L.shadow == null ? 55 : L.shadow), 0, 100, 1, v => S.setLight3d({ shadow: v })));
    lt.bd.appendChild(h('div', 'hint', 'Applies in 3D. Every slider changes the map: Sun direction/height set where the light comes from (low sun = deeper, longer shadows); Light brightness lifts the lit slopes; Ambient fill softens the dark side; Terrain relief sets shading strength; Terrain shadow sets how dark the shaded terrain gets; Model shadows drop a soft ground shadow under each model.'));
    ct.appendChild(lt.sec);
  }

  let m3dCat = 'All', m3dSearch = '';   // persisted catalog filter/search across re-renders
  let thumbIO = null;                    // reused across renders — disconnect the old one so renderTab() doesn't leak an observer + its detached nodes each call
  // sensible default on-map size (km) by type so a carrier ≠ a missile
  const m3dScale = (cat, file) => { const f = file || ''; if (/carrier|lincoln|eisenhower|cvn/.test(f)) return 12; if (cat === 'Naval') return 6; if (cat === 'Aircraft') return /c-130|hercules|a-3|707|boein|awacs|e-3|sentry|b-2|spirit|b21|tu160|legacy|embraer/.test(f) ? 4.5 : 2.2; if (cat === 'Drones / UAV') return 1.4; if (cat === 'Air defense / Radar') return 2; if (cat === 'Missiles / Rockets') return 1; if (cat === 'Armor / Vehicles') return 1.4; return 2.5; };
  // sensible DEFAULT altitude by category so assets land in the right layer: aircraft in the air,
  // ships/armor/ground on the surface (alt 0 → models3d grounds them on the terrain/sea). Tunable later.
  const m3dAlt = (cat) => cat === 'Aircraft' ? 9000 : cat === 'Drones / UAV' ? 3000 : cat === 'Missiles / Rockets' ? 1500 : 0;
  // Per-file heading correction now lives in Store.config.modelFix (synced, seeded with the known-bad
  // catalog GLBs, operator-adjustable via the HUD "Turn" button) and is applied centrally in models3d
  // eff() for ALL three view modes — so it's no longer seeded per-instance here (that double-applied it).
  function tabModels3d(C, ct) {
    const list = C.models3d || [];

    // ---- built-in, broadcast-optimized model library (Draco GLB catalog) ----
    const CAT = window.MODELS3D_CATALOG || [];
    if (CAT.length) {
      const cats = ['All']; CAT.forEach(m => { if (!cats.includes(m.cat)) cats.push(m.cat); });
      const lb = section('3D model library', I.folder);
      const srch = h('input', 'cfg-in'); srch.placeholder = 'Search ' + CAT.length + ' models…'; srch.value = m3dSearch;
      lb.bd.appendChild(srch);
      const chips = h('div', 'cfg-chips');
      const chipEls = {};
      cats.forEach(c => { const n = c === 'All' ? CAT.length : CAT.filter(x => x.cat === c).length; const ch = h('button', 'cfg-chip2' + (m3dCat === c ? ' on' : ''), `${c} <b>${n}</b>`); ch.onclick = () => { m3dCat = c; Object.values(chipEls).forEach(x => x.classList.remove('on')); ch.classList.add('on'); filterGrid(); }; chipEls[c] = ch; chips.appendChild(ch); });
      lb.bd.appendChild(chips);
      // build ALL items once; category chip + search filter them in place (keeps focus, no rebuild)
      const grid = h('div', 'cfg-cat3d');
      CAT.forEach(m => {
        const b = h('button', 'cfg-cat3d__i', `<span class="cfg-cat3d__thumb"></span><span class="cfg-cat3d__nm">${esc(m.name)}</span><small>${esc(m.cat)}</small>`);
        b.dataset.cat = m.cat; b.dataset.q = (m.name + ' ' + m.cat + ' ' + m.file).toLowerCase().replace(/[^a-z0-9]/g, '');
        // lazy 3D preview thumbnail (offscreen-rendered GLB PNG) — render when first scrolled near
        if (window.Models3D && Models3D.thumb) { const th = b.querySelector('.cfg-cat3d__thumb'); const draw = () => Models3D.thumb(m.file).then(url => { if (url) th.style.backgroundImage = `url(${url})`; }).catch(() => {}); b._drawThumb = draw; }
        b.title = 'Add “' + m.name + '” at the current map centre';
        b.onclick = () => { const cv = window.GameMap.currentView(); S.addModel3d({ src: 'assets3d/' + m.file, name: m.name, cat: m.cat, lat: cv.lat, lng: cv.lng, scale: m3dScale(m.cat, m.file), rotZ: 0, pitch: 0, roll: 0, alt: m3dAlt(m.cat), kind: m.cat, mode: 'both', style: 'solid', on: true }); renderTab(); };
        grid.appendChild(b);
      });
      function filterGrid() { const q = m3dSearch.toLowerCase().replace(/[^a-z0-9]/g, ''); grid.querySelectorAll('.cfg-cat3d__i').forEach(it => { const ok = (m3dCat === 'All' || it.dataset.cat === m3dCat) && (!q || it.dataset.q.indexOf(q) >= 0); it.style.display = ok ? '' : 'none'; }); }
      srch.oninput = () => { m3dSearch = srch.value; filterGrid(); };
      filterGrid();
      lb.bd.appendChild(grid);
      // render the 3D preview thumbnails lazily as items scroll into view (69 models — don't render
      // every GLB offscreen at once). Each thumb is cached by file, so re-opens are instant.
      try {
        if (thumbIO) { try { thumbIO.disconnect(); } catch (e) {} }   // drop the previous render's observer (was leaking one IO + its detached nodes per renderTab)
        const io = thumbIO = new IntersectionObserver((ents) => ents.forEach(e => { if (e.isIntersecting && e.target._drawThumb) { e.target._drawThumb(); e.target._drawThumb = null; io.unobserve(e.target); } }), { rootMargin: '120px' });
        grid.querySelectorAll('.cfg-cat3d__i').forEach(it => io.observe(it));
      } catch (e) { grid.querySelectorAll('.cfg-cat3d__i').forEach(it => it._drawThumb && it._drawThumb()); }
      lb.bd.appendChild(h('div', 'hint', CAT.length + ' built-in military models (aircraft, naval, armour, missiles, air-defence, drones). Search or filter, then click one to drop it at the map centre and steer it with the control HUD.'));
      ct.appendChild(lb.sec);
    }

    const up = section('Upload your own GLB', I.upload, () => { list.forEach(m => { try { window.Assets3D && Assets3D.del(m.id); } catch (e) {} S.removeModel3d(m.id); }); });
    const file = h('input'); file.type = 'file'; file.accept = '.glb,.gltf,model/gltf-binary'; file.hidden = true;
    const name = h('input', 'cfg-name'); name.placeholder = 'Name (optional)';
    const pick = h('button', 'cfg-uploadbtn', `${I.upload}<span>Choose GLB…</span>`); pick.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      if (f.size > 40 * 1024 * 1024) { alert('GLB too large (max ~40 MB). Compress it (Draco / meshopt) first.'); file.value = ''; return; }
      try {
        const id = S.uid('m3d'); await window.Assets3D.put(id, f);
        const cv = window.GameMap.currentView();
        S.addModel3d({ id, name: name.value.trim() || f.name.replace(/\.[^.]+$/, ''), lat: cv.lat, lng: cv.lng, scale: 3, rotZ: 0, alt: 0, mode: 'both', style: 'solid', on: true });
        name.value = ''; file.value = ''; renderTab();
      } catch (e) { alert('Could not read GLB.'); file.value = ''; }
    };
    const wrap = h('div', 'cfg-up'); wrap.append(pick, name, file); up.bd.appendChild(wrap);
    up.bd.appendChild(h('div', 'hint', 'Best format: GLB (single file, PBR + animation, compressed). Dropped at the current map centre — drag it on the 2D map, or set coordinates below. Shows on both the flat and 3D maps.'));
    ct.appendChild(up.sec);

    const lib = section('Placed models', I.folder);
    if (!list.length) lib.bd.appendChild(h('div', 'hint', 'No models yet. Upload a GLB above.'));
    list.forEach(m => {
      const it = h('div', 'cfg-m3d');
      const hd = h('div', 'cfg-m3d__hd');
      const ttl = h('div', 'cfg-m3d__nm', esc(m.name || 'Model'));
      const onb = h('button', 'cfg-ordb' + (m.on !== false ? ' is-on' : ''), m.on !== false ? I.eye : I.eyeOff); onb.title = 'Show / hide'; onb.onclick = () => { S.updateModel3d(m.id, { on: m.on === false }); renderTab(); };
      const ctl = h('button', 'cfg-ordb', I.move); ctl.title = 'Control on map (live HUD)'; ctl.onclick = () => window.ModelControl && ModelControl.select(m.id);
      const fly = h('button', 'cfg-ordb', I.target); fly.title = 'Fly to'; fly.onclick = () => window.GameMap.flyToView({ lat: m.lat, lng: m.lng, zoom: 9 }, { type: 'flyTo', duration: 1 });
      const del = h('button', 'cfg-pan__x', I.close); del.title = 'Delete model'; del.onclick = () => { try { window.Assets3D && Assets3D.del(m.id); } catch (e) {} S.removeModel3d(m.id); renderTab(); };
      hd.append(ttl, ctl, fly, onb, del); it.appendChild(hd);
      it.appendChild(slider('Size (km)', Math.round((m.scale || 1) * 10) / 10, 0.1, 200, 0.1, v => S.updateModel3d(m.id, { scale: v })));
      it.appendChild(slider('Rotation', Math.round(m.rotZ || 0), 0, 359, 1, v => S.updateModel3d(m.id, { rotZ: v })));
      it.appendChild(slider('Height (m)', Math.round(m.alt || 0), -500, 8000, 10, v => S.updateModel3d(m.id, { alt: v })));
      const seg = h('div', 'cfg-seg');
      [['both', 'Both maps'], ['3d', '3D only'], ['2d', '2D only']].forEach(([id, lab]) => { const bb = h('button', 'cfg-seg__b' + ((m.mode || 'both') === id ? ' on' : ''), lab); bb.onclick = () => { S.updateModel3d(m.id, { mode: id }); renderTab(); }; seg.appendChild(bb); });
      it.appendChild(seg);
      const sseg = h('div', 'cfg-seg');
      [['solid', 'Solid'], ['wireframe', 'Wireframe']].forEach(([id, lab]) => { const bb = h('button', 'cfg-seg__b' + ((m.style || 'solid') === id ? ' on' : ''), lab); bb.onclick = () => { S.updateModel3d(m.id, { style: id }); renderTab(); }; sseg.appendChild(bb); });
      it.appendChild(sseg);
      const cr = h('div', 'cfg-ovrow2'); const ci = h('input', 'cfg-in'); ci.value = `${(+m.lat).toFixed(4)}, ${(+m.lng).toFixed(4)}`; ci.placeholder = 'lat, lng';
      const sb = h('button', 'cfg-in cfg-in--n', 'Set'); sb.onclick = () => { const co = parseLatLng(ci.value); if (!co) { alert('Paste coordinates like  25.2048, 55.2708'); return; } S.updateModel3d(m.id, { lat: co[0], lng: co[1] }); };
      cr.append(ci, sb); it.appendChild(cr);
      // ---- movement path ----
      const r = m.route || {}; const hasR = (r.pts || []).length >= 2;
      const patchRoute = patch => { const cur = (S.models3d().find(x => x.id === m.id) || {}).route || {}; S.updateModel3d(m.id, { route: Object.assign({}, cur, patch) }); };
      const rrow = h('div', 'cfg-m3drte');
      const drawB = h('button', 'cfg-btn cfg-btn--sm', `${I.sketch}<span>${hasR ? 'Redraw path' : 'Draw path'}</span>`); drawB.onclick = () => window.ModelControl && ModelControl.drawPath(m.id);
      rrow.appendChild(drawB);
      if (hasR) {
        const playing = window.ModelsAnim && ModelsAnim.playing(m.id);
        const pb = h('button', 'cfg-btn cfg-btn--sm', playing ? `${I.close}<span>Stop</span>` : `${I.play}<span>Play</span>`); pb.onclick = () => { const A = window.ModelsAnim; if (A) { A.playing(m.id) ? A.stop(m.id) : A.play(m.id); } renderTab(); };
        const cb = h('button', 'cfg-btn cfg-btn--sm', `${I.undo}<span>Clear</span>`); cb.onclick = () => { S.updateModel3d(m.id, { route: null }); renderTab(); };
        rrow.append(pb, cb);
      }
      it.appendChild(rrow);
      if (hasR) {
        it.appendChild(slider('Travel time (s)', Math.round(r.dur || 20), 1, 600, 1, v => patchRoute({ dur: v })));
        it.appendChild(rowTog('Loop path', !!r.loop, on => patchRoute({ loop: on })));
        it.appendChild(rowTog('Auto-heading', r.heading !== false, on => patchRoute({ heading: on })));
      }
      lib.bd.appendChild(it);
    });
    ct.appendChild(lib.sec);
  }

  function tabFx(C, ct) {
    const { sec, bd } = section('Grid · sea · clouds', I.grid || I.layers, () => { S.setGrid(cp(S.DEFAULT_CONFIG.grid)); S.setSea(cp(S.DEFAULT_CONFIG.sea)); S.setClouds(cp(S.DEFAULT_CONFIG.clouds)); });
    const g = Object.assign({}, S.DEFAULT_CONFIG.grid, C.grid || {});
    bd.appendChild(rowTog('Square grid', !!g.on, on => { S.setGrid({ on }); }));
    bd.append(
      field('Grid colour', swatches(['#7fb0ff', '#46d8ff', '#ffffff', '#ffd60a', '#36ff9e', '#ff453a'], g.color, c => S.setGrid({ color: c }))),
      slider('Cell size', g.size, 20, 160, 2, v => S.setGrid({ size: v })),
      slider('Line opacity', g.opacity, 0, 60, 1, v => S.setGrid({ opacity: v })),
      slider('Line weight', g.weight, 1, 4, 1, v => S.setGrid({ weight: v })));
    const s = Object.assign({}, S.DEFAULT_CONFIG.sea, C.sea || {});
    bd.appendChild(rowTog('Sea water (masked to sea)', !!s.on, on => { S.setSea({ on }); }));
    bd.append(
      field('Water colour', swatches(['#3aa0ff', '#46d8ff', '#1d7fd6', '#2bd0c0', '#5b9dff'], s.color, c => S.setSea({ color: c }))),
      slider('Wave size', s.wave, 5, 100, 1, v => S.setSea({ wave: v })),
      slider('Water intensity', s.intensity, 0, 90, 1, v => S.setSea({ intensity: v })),
      slider('Water speed (s)', s.speed, 8, 60, 1, v => S.setSea({ speed: v })));
    const cl = Object.assign({}, S.DEFAULT_CONFIG.clouds, C.clouds || {});
    bd.appendChild(rowTog('Drifting clouds', !!cl.on, on => { S.setClouds({ on }); }));
    bd.append(
      slider('Cloud amount', cl.amount, 0, 80, 1, v => S.setClouds({ amount: v })),
      slider('Cloud size', cl.size, 20, 120, 1, v => S.setClouds({ size: v })),
      slider('Cloud softness', cl.softness, 0, 100, 1, v => S.setClouds({ softness: v })),
      slider('Cloud speed (s)', cl.speed, 20, 200, 1, v => S.setClouds({ speed: v })));
    const dn = Object.assign({}, S.DEFAULT_CONFIG.dayNight, C.dayNight || {});
    bd.appendChild(rowTog('Day / night shading', !!dn.on, on => S.setDayNight({ on })));
    bd.append(
      slider('Night darkness', dn.opacity, 0, 100, 1, v => S.setDayNight({ opacity: v })),
      slider('Time shift (h)', dn.offsetH, -12, 12, 1, v => S.setDayNight({ offsetH: v })));
    bd.appendChild(rowTog('Rule of thirds (composition guide)', !!C.thirds, on => S.setThirds(on)));
    bd.appendChild(h('div', 'hint', 'Sea water renders only over the sea (land masked) and scales with zoom; clouds drift and scale too. Rule-of-thirds adds a composition + title-safe guide (hidden in clean output).'));
    ct.appendChild(sec);
  }

  function tabMotion(C, ct) {
    const { sec, bd } = section('Motion & camera', I.film, () => { S.setEasing('inout'); S.setFollow({ on: false, kind: null, id: null, zoom: null }); });
    bd.appendChild(rowTog('Smooth motion (ease in / out)', (C.easing || 'inout') !== 'linear', on => S.setEasing(on ? 'inout' : 'linear')));
    const f = C.follow || {};
    const sel = h('select', 'cfg-sel');
    const off = h('option', null, 'Off — release camera'); off.value = ''; sel.appendChild(off);
    const targets = (window.Follow && Follow.targets) ? Follow.targets() : [];
    targets.forEach(t => { const o = h('option', null, esc(t.name)); o.value = t.kind + '|' + t.id; if (f.on && f.kind === t.kind && String(f.id) === String(t.id)) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => { const v = sel.value; if (!v) { S.setFollow({ on: false, kind: null, id: null }); return; } const ix = v.indexOf('|'); S.setFollow({ on: true, kind: v.slice(0, ix), id: v.slice(ix + 1) }); };
    bd.appendChild(rowWith('Follow target', sel));
    bd.appendChild(h('div', 'hint', 'Smooth motion eases route + timeline playback in/out (off = linear). Follow locks the camera onto a moving target — a model along its route, or a live ship / flight — and keeps it centred on both the flat and 3D maps; the presenter follows in lockstep. Pick a target to start, “Off” to release.'));
    ct.appendChild(sec);
  }

  return { tabOverlays, tabThreeD, tabModels3d, tabFx, tabMotion };
};
