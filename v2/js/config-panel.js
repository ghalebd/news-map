/* ============================================================
   CONTROL PANEL — large tabbed console (control.html only).
   Category rail + multi-column content. Edits the shared
   Store.config; changes persist + sync live to the Presenter.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  function readImage(file, max = 256) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const img = new Image(); img.onload = () => { let w = img.width, hh = img.height; const sc = Math.min(1, max / Math.max(w, hh)); w = Math.round(w * sc); hh = Math.round(hh * sc); const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; cv.getContext('2d').drawImage(img, 0, 0, w, hh); res(cv.toDataURL('image/png')); }; img.onerror = rej; img.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }

  const ACCENTS = ['#5b9dff', '#22d3ee', '#2dd4bf', '#34d399', '#d9b25f', '#ffb020', '#fb7185', '#8b7bff'];
  const DTOOLS = [['select', 'Select'], ['marker', 'Marker'], ['arrow', 'Arrow'], ['curve', 'Curve'], ['ring', 'Range'], ['circle', 'Circle'], ['polygon', 'Area'], ['sketch', 'Freehand'], ['text', 'Label'], ['measure', 'Measure'], ['frontline', 'Front line'], ['country', 'Country'], ['asset', 'Assets'], ['erase', 'Erase']];
  const VIS = [['deck', 'Scene deck'], ['modeSwitch', 'Mode switch'], ['qtools', 'Tool bar'], ['fab', 'Add launcher'], ['status', 'Coordinates'], ['brand', 'Logo'], ['nownext', 'Now / Next'], ['tracking', 'Live tracking']];
  const PERMS = [['canDraw', 'Can draw on map'], ['canNavigate', 'Can change scenes'], ['canEditScenes', 'Can edit scene list'], ['canChangeMapStyle', 'Can change map style'], ['canChangeStyle', 'Can change theme'], ['canTrack', 'Can toggle live tracking']];
  const TC = ['#46d8ff', '#7cf3ff', '#34d399', '#ffd54a', '#ff9f0a', '#fb7185', '#bf5af2', '#ffffff'];
  const DCOLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#36ff9e', '#38e6ff', '#0a84ff', '#bf5af2', '#ffffff'];

  /* ---- shell: right-side drawer with quick actions + collapsible sections ---- */
  const toggle = h('button', 'cfg-toggle', I.settings); toggle.title = 'Control panel';
  const drawer = h('div', 'cfg-drawer cfg-panel');
  const head = h('div', 'cfg-hd', `<div class="t">Control Panel<small>NEWS MAP · CONSOLE</small></div>`);
  const qa = h('div', 'cfg-qa');
  const qbtn = (icon, title, fn) => { const b = h('button', 'cfg-qbtn', icon); b.title = title; b.onclick = fn; return b; };
  qa.append(
    qbtn(I.eyeOff || I.eye, 'Hide UI (H)', () => window.UI && UI.hideUI(true)),
    qbtn(I.camera || I.eye, 'Export PNG', () => window.UI && UI.exportPNG()),
    qbtn(I.save, 'Save file', () => window.UI && UI.saveProject(S.state.rundown.title)),
    qbtn(I.load || I.upload, 'Load file', () => window.UI && UI.loadProject()),
  );
  const x = h('button', 'x', I.close); head.append(qa, x);
  const search = h('input', 'cfg-search'); search.type = 'search'; search.placeholder = 'Search settings…';
  const bodyEl = h('div', 'cfg-body'); drawer.append(head, search, bodyEl); document.body.append(toggle, drawer);
  toggle.onclick = () => { const o = !drawer.classList.contains('open'); drawer.classList.toggle('open', o); toggle.classList.toggle('is-open', o); };
  x.onclick = () => { drawer.classList.remove('open'); toggle.classList.remove('is-open'); };

  /* ---- builders ---- */
  function section(title, icon) {
    const sec = h('div', 'cfg-sec');
    const hd = h('div', 'cfg-sec__hd', `<span class="cfg-grip" title="Drag to reorder">${I.grip || '⋮⋮'}</span><span class="i">${icon}</span><span class="t">${title}</span><span class="chev">${I.chevron}</span>`);
    const bd = h('div', 'cfg-sec__bd');
    hd.onclick = () => sec.classList.toggle('open');
    sec.append(hd, bd); return { sec, bd };
  }
  function tog(on, fn) { const t = h('div', 'tog' + (on ? ' on' : '')); t.onclick = () => { const nv = !t.classList.contains('on'); t.classList.toggle('on', nv); fn(nv); }; return t; }
  function rowTog(label, on, fn) { const r = h('div', 'cfg-row'); r.appendChild(h('div', 'lab', label)); r.appendChild(tog(on, fn)); return r; }
  function rowWith(label, el) { const r = h('div', 'cfg-row'); r.appendChild(h('div', 'lab', label)); r.appendChild(el); return r; }
  function slider(label, val, min, max, step, fn) {
    const f = h('div', 'cfg-field'); const lab = h('div', 'lab', `<span>${label}</span><span class="val">${val}</span>`);
    const inp = h('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step || 1; inp.value = val;
    inp.oninput = () => { lab.querySelector('.val').textContent = inp.value; fn(parseFloat(inp.value)); };
    f.append(lab, inp); return f;
  }
  function swatches(list, cur, fn) { const sw = h('div', 'cfg-sw'); list.forEach(c => { const b = h('button'); b.style.background = c; if (c === cur) b.classList.add('on'); b.onclick = () => { sw.querySelectorAll('button').forEach(z => z.classList.remove('on')); b.classList.add('on'); fn(c); }; sw.appendChild(b); }); return sw; }
  function field(label, el) { const f = h('div', 'cfg-field'); f.appendChild(h('div', 'lab', `<span>${label}</span>`)); if (el) f.appendChild(el); return f; }
  const live = {};

  /* ---- tab builders ---- */
  function tabIdentity(C, ct) {
    const st = C.style;
    const { sec, bd } = section('Theme', I.sliders);
    const ci = h('input', 'cfg-color'); ci.type = 'color'; ci.value = st.accent; ci.oninput = () => S.setStyle({ accent: ci.value });
    const accField = field('Accent', swatches(ACCENTS, st.accent, c => { ci.value = c; S.setStyle({ accent: c }); })); accField.appendChild(ci);
    bd.append(accField,
      slider('Glass opacity %', st.glass, 0, 100, 1, v => S.setStyle({ glass: v })),
      slider('Blur (px)', st.blur, 0, 60, 1, v => S.setStyle({ blur: v })),
      slider('Glass saturation', st.sat == null ? 1.7 : st.sat, 1, 3, 0.05, v => S.setStyle({ sat: v })),
      slider('Glass brightness %', st.brightness == null ? 105 : st.brightness, 70, 140, 1, v => S.setStyle({ brightness: v })),
      slider('Glass distortion', st.distort, 0, 120, 1, v => S.setStyle({ distort: v })),
      slider('Sheen %', st.sheen == null ? 16 : st.sheen, 0, 50, 1, v => S.setStyle({ sheen: v })),
      slider('Shadow strength', st.shadow == null ? 1 : st.shadow, 0, 2.5, 0.1, v => S.setStyle({ shadow: v })),
      slider('Corner radius (px)', st.radius, 0, 24, 1, v => S.setStyle({ radius: v })),
      slider('3D perspective tilt °', C.tilt || 0, 0, 55, 1, v => S.setTilt(v)),
      rowTog('Touch mode (large controls)', !!C.touch, on => S.setTouch(on)));
    ct.appendChild(sec);
    const lg = section('Logo', I.camera); const Br = C.brand || {};
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
  function tabLayout(C, ct) {
    const { sec, bd } = section('Presenter visibility', I.eye);
    VIS.forEach(([k, lab]) => bd.appendChild(rowTog(lab, C.visibility[k] !== false, on => S.setVisibility(k, on))));
    ct.appendChild(sec);
  }
  function tabPermissions(C, ct) {
    const { sec, bd } = section('Allowed tools', I.lock);
    const grid = h('div', 'cfg-tools');
    DTOOLS.forEach(([id, lab]) => { const on = C.permissions.tools[id] !== false; const t = h('div', 'cfg-tool ' + (on ? 'on' : 'off'), `${I[id] || I.marker}<span>${lab}</span>`); t.onclick = () => { const nv = t.classList.contains('off'); t.classList.toggle('on', nv); t.classList.toggle('off', !nv); S.setToolPerm(id, nv); }; grid.appendChild(t); });
    bd.appendChild(grid); ct.appendChild(sec);
    const p2 = section('Presenter permissions', I.lock);
    PERMS.forEach(([k, lab]) => p2.bd.appendChild(rowTog(lab, C.permissions[k] !== false, on => S.setPerm(k, on))));
    ct.appendChild(p2.sec);
  }
  function tabTools(C, ct) {
    const D = Object.assign({ color: '#ff453a', weight: 3, markerIcon: '' }, C.drawDefaults || {});
    const { sec, bd } = section('Drawing defaults', I.sketch);
    bd.append(field('Default colour', swatches(DCOLORS, D.color, c => { S.setDrawDefaults({ color: c }); S.setColor(c); })),
      slider('Stroke weight', D.weight, 1, 8, 1, v => S.setDrawDefaults({ weight: v })));
    bd.appendChild(h('div', 'hint', 'Applies to new shapes/lines. Per-element colour stays editable from the on-map context bar.'));
    ct.appendChild(sec);
  }
  function tabMap(C, ct) {
    const m1 = section('Active map type', I.layers);
    const seg = h('div', 'cfg-seg'); live.seg = seg;
    C.mapStyles.filter(m => m.on !== false).forEach(m => { const b = h('button', 'cfg-seg__b' + (m.id === S.state.mapStyle ? ' on' : ''), m.name); b.dataset.id = m.id; b.onclick = () => { S.setMapStyle(m.id); seg.querySelectorAll('.cfg-seg__b').forEach(y => y.classList.toggle('on', y === b)); }; seg.appendChild(b); });
    m1.bd.appendChild(seg); ct.appendChild(m1.sec);
    const m2 = section('Enabled styles', I.layers);
    const list = h('div', 'cfg-list');
    C.mapStyles.forEach(m => { const li = h('div', 'cfg-li', `<div class="nm">${m.name} <small>${m.id}</small></div>`); li.appendChild(tog(m.on !== false, on => S.setMapStyleOn(m.id, on))); list.appendChild(li); });
    const add = h('div', 'cfg-add', '<input placeholder="MapTiler id (e.g. winter-v2)">'); const ab = h('button', null, 'Add'); add.appendChild(ab);
    ab.onclick = () => { const v = add.querySelector('input').value.trim(); if (v) { S.addMapStyle(v, v.replace(/-v?\d+$/, '').replace(/-/g, ' ')); renderTab(); } };
    m2.bd.append(list, add); ct.appendChild(m2.sec);
    const m3 = section('Places & locator', I.target);
    m3.bd.appendChild(rowTog('Locator inset map', !!C.locator, on => S.setLocator(on)));
    const pl = h('div', 'cfg-list');
    (C.places || []).forEach(p => { const li = h('div', 'cfg-li'); li.style.cursor = 'pointer'; li.innerHTML = `<div class="nm">${p.name} <small>${(+p.lat).toFixed(1)}, ${(+p.lng).toFixed(1)}</small></div>`; li.onclick = () => window.GameMap.flyToView({ lat: p.lat, lng: p.lng, zoom: p.zoom }, { type: 'flyTo', duration: 1 }); const del = h('button', 'cfg-aset__x', I.close); del.style.position = 'static'; del.style.opacity = '1'; del.onclick = e => { e.stopPropagation(); S.removePlace(p.id); renderTab(); }; li.appendChild(del); pl.appendChild(li); });
    const pa = h('div', 'cfg-add', '<input placeholder="Name this view">'); const pab = h('button', null, 'Add'); pa.appendChild(pab);
    pab.onclick = () => { const v = pa.querySelector('input').value.trim(); if (v) { const cv = window.GameMap.currentView(); S.addPlace({ name: v, lat: cv.lat, lng: cv.lng, zoom: cv.zoom }); renderTab(); } };
    m3.bd.append(pl, pa); ct.appendChild(m3.sec);
  }
  function tabTracking(C, ct) {
    const t1 = section('Live layers', I.ship);
    live.ships = tog(!!S.state.tracking.ships, on => S.setTracking('ships', on));
    live.flights = tog(!!S.state.tracking.flights, on => S.setTracking('flights', on));
    live.trails = tog(S.state.tracking.trails !== false, on => S.setTracking('trails', on));
    t1.bd.append(rowWith('Live ships (AIS)', live.ships), rowWith('Live flights', live.flights), rowWith('Route / trail lines', live.trails));
    ct.appendChild(t1.sec);
    const T = Object.assign({ shipColor: '#46d8ff', flightColor: '#ffd54a', lineWeight: 1, lineOpacity: 0.4, vectorMins: 3, trailPoints: 60, maxShips: 300, showVectors: true, showHistory: true, showRoutes: true }, C.trackStyle || {});
    const t2 = section('Tracking style', I.curve);
    t2.bd.append(field('Ship colour', swatches(TC, T.shipColor, c => S.setTrackStyle({ shipColor: c }))),
      field('Flight colour', swatches(TC, T.flightColor, c => S.setTrackStyle({ flightColor: c }))),
      slider('Line thickness', T.lineWeight, 0.5, 4, 0.5, v => S.setTrackStyle({ lineWeight: v })),
      slider('Line opacity %', Math.round(T.lineOpacity * 100), 10, 100, 5, v => S.setTrackStyle({ lineOpacity: v / 100 })),
      slider('Vector length (min)', T.vectorMins, 0, 15, 1, v => S.setTrackStyle({ vectorMins: v })),
      slider('Trail length (pts)', T.trailPoints, 5, 200, 5, v => S.setTrackStyle({ trailPoints: v })),
      slider('Max ships', T.maxShips, 50, 1000, 50, v => S.setTrackStyle({ maxShips: v })),
      rowTog('Course vectors', T.showVectors !== false, on => S.setTrackStyle({ showVectors: on })),
      rowTog('Travelled trails', T.showHistory !== false, on => S.setTrackStyle({ showHistory: on })),
      rowTog('Destination routes', T.showRoutes !== false, on => S.setTrackStyle({ showRoutes: on })));
    ct.appendChild(t2.sec);
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
    const b3 = section('Auto-tour', I.play);
    b3.bd.append(rowTog('Auto-play scenes', !!bc.tour.playing, on => S.setTour({ playing: on })), slider('Interval (s)', bc.tour.sec || 8, 2, 30, 1, v => S.setTour({ sec: v })));
    ct.appendChild(b3.sec);
    const sp = bc.spotlight || {};
    const b4 = section('Spotlight', I.target);
    b4.bd.appendChild(rowTog('Focus mask', !!sp.on, on => { const cv = window.GameMap.currentView(); S.setSpotlight(on ? { on: true, lat: cv.lat, lng: cv.lng } : { on: false }); }));
    b4.bd.appendChild(slider('Radius (km)', sp.radiusKm || 400, 50, 2000, 50, v => S.setSpotlight({ radiusKm: v })));
    b4.bd.appendChild(slider('Edge feather %', sp.feather == null ? 40 : sp.feather, 0, 100, 5, v => S.setSpotlight({ feather: v })));
    b4.bd.appendChild(slider('Dim outside %', sp.dim == null ? 66 : sp.dim, 0, 95, 5, v => S.setSpotlight({ dim: v })));
    const rc = h('button', 'cfg-btn', `${I.target}<span>Centre on view</span>`); rc.onclick = () => { const cv = window.GameMap.currentView(); S.setSpotlight({ lat: cv.lat, lng: cv.lng }); }; b4.bd.appendChild(rc);
    ct.appendChild(b4.sec);
  }
  function tabAssets(C, ct) {
    const { sec, bd } = section('Categories', I.folder);
    const chips = h('div', 'cfg-chips');
    C.assetCats.forEach(cat => { const c = h('span', 'cfg-chip', `${cat}<button class="x" title="Remove">×</button>`); c.querySelector('.x').onclick = () => { S.removeAssetCat(cat); renderTab(); }; chips.appendChild(c); });
    const addc = h('div', 'cfg-add', '<input placeholder="New category">'); const acb = h('button', null, 'Add'); addc.appendChild(acb);
    acb.onclick = () => { const v = addc.querySelector('input').value.trim(); if (v) { S.addAssetCat(v); renderTab(); } };
    bd.append(chips, addc); ct.appendChild(sec);
    const u = section('Upload image', I.upload);
    const file = h('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    const cat = h('select', 'cfg-sel'); C.assetCats.forEach(z => { const o = h('option', null, z); o.value = z; cat.appendChild(o); });
    const name = h('input', 'cfg-name'); name.placeholder = 'Name (optional)';
    const pick = h('button', 'cfg-uploadbtn', `${I.upload}<span>Choose image…</span>`); pick.onclick = () => file.click();
    file.onchange = async () => { const f = file.files[0]; if (!f) return; try { S.addCustomAsset({ name: name.value.trim() || f.name.replace(/\.[^.]+$/, ''), cat: cat.value || C.assetCats[0], url: await readImage(f) }); renderTab(); } catch (e) { alert('Could not read image.'); } };
    const up = h('div', 'cfg-up'); up.append(pick, cat, name, file); u.bd.appendChild(up); ct.appendChild(u.sec);
    const lib = section('Library', I.folder);
    const assets = C.customAssets || [];
    if (assets.length) { const grid = h('div', 'cfg-aset'); assets.forEach(a => { const it = h('div', 'cfg-aset__i', `<img src="${a.url}" alt=""><div class="m"><b>${a.name || ''}</b><small>${a.cat || ''}</small></div>`); const del = h('button', 'cfg-aset__x', I.close); del.onclick = () => { S.removeCustomAsset(a.id); renderTab(); }; it.appendChild(del); grid.appendChild(it); }); lib.bd.appendChild(grid); }
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
      mkBtn(I.eyeOff || I.eye, 'Hide UI', () => window.UI && UI.hideUI(true)),
      mkBtn(I.erase, 'Clear scene', () => { if (confirm('Clear all elements of the current scene?')) { S.clearElements(); window.UI && UI.toast('Scene cleared'); } }),
    );
    bd.appendChild(row); ct.appendChild(sec);
    const sn = section('Snapshots', I.layers);
    const snapAdd = h('div', 'cfg-add', '<input placeholder="Snapshot name">'); const sab = h('button', null, 'Save'); snapAdd.appendChild(sab);
    sab.onclick = () => { window.UI && UI.saveSnapshot(snapAdd.querySelector('input').value.trim()); renderTab(); };
    sn.bd.appendChild(snapAdd);
    const snList = h('div', 'cfg-list');
    (window.UI ? UI.snaps() : []).forEach(s => { const li = h('div', 'cfg-li'); li.style.cursor = 'pointer'; li.innerHTML = `<div class="nm">${s.name} <small>${s.at}</small></div>`; li.onclick = () => UI.restoreSnapshot(s.id); const del = h('button', 'cfg-aset__x', I.close); del.style.position = 'static'; del.style.opacity = '1'; del.onclick = e => { e.stopPropagation(); UI.deleteSnapshot(s.id); renderTab(); }; li.appendChild(del); snList.appendChild(li); });
    sn.bd.appendChild(snList);
    const reset = h('button', 'cfg-reset', 'Reset all settings to defaults');
    reset.onclick = () => { if (confirm('Reset all control settings to defaults?')) { S.resetConfig(); renderTab(); } };
    sn.bd.appendChild(reset); ct.appendChild(sn.sec);
  }

  const GROUPS = [tabIdentity, tabLayout, tabPermissions, tabTools, tabMap, tabTracking, tabBroadcast, tabAssets, tabProject];
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    bodyEl.querySelectorAll('.cfg-sec').forEach(sec => {
      let any = false;
      sec.querySelectorAll('.cfg-sec__bd > *').forEach(row => { const hit = !q || row.textContent.toLowerCase().includes(q); row.style.display = hit ? '' : 'none'; if (hit) any = true; });
      const titleHit = !q || sec.querySelector('.cfg-sec__hd .t').textContent.toLowerCase().includes(q);
      sec.style.display = (titleHit || any) ? '' : 'none';
      if (q && (any || titleHit)) sec.classList.add('open');
    });
  }
  search.oninput = applyFilter;
  /* drag-to-reorder: persisted section order (local UI preference) */
  const ORDER_KEY = 'newsmap.v3.panelOrder';
  const title = sec => sec.querySelector('.cfg-sec__hd .t').textContent;
  const getOrder = () => { try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch (e) { return []; } };
  const saveOrder = a => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(a)); } catch (e) {} };
  function reorder(from, to) { let o = getOrder().filter(x => x !== from); const i = o.indexOf(to); o.splice(i < 0 ? o.length : i, 0, from); saveOrder(o); renderTab(); }
  function setupDnD(sec) {
    const hd = sec.querySelector('.cfg-sec__hd'); hd.setAttribute('draggable', 'true');
    hd.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', title(sec)); e.dataTransfer.effectAllowed = 'move'; sec.classList.add('dragging'); });
    hd.addEventListener('dragend', () => sec.classList.remove('dragging'));
    sec.addEventListener('dragover', e => { e.preventDefault(); sec.classList.add('dragover'); });
    sec.addEventListener('dragleave', () => sec.classList.remove('dragover'));
    sec.addEventListener('drop', e => { e.preventDefault(); sec.classList.remove('dragover'); const from = e.dataTransfer.getData('text/plain'), to = title(sec); if (from && from !== to) reorder(from, to); });
  }
  function renderTab() {
    const openT = new Set([...bodyEl.querySelectorAll('.cfg-sec.open .cfg-sec__hd .t')].map(t => t.textContent));
    bodyEl.innerHTML = '';
    const colA = h('div', 'cfg-col'), colB = h('div', 'cfg-col'); bodyEl.append(colA, colB);
    const tmp = document.createElement('div'); GROUPS.forEach(b => b(S.cfg(), tmp));
    let secs = [...tmp.children];
    const natural = secs.map(title);
    let order = getOrder(); if (!order.length) { order = natural; saveOrder(order); }
    secs.sort((a, b) => { const ia = order.indexOf(title(a)), ib = order.indexOf(title(b)); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
    secs.forEach((sec, i) => { setupDnD(sec); (i % 2 === 0 ? colA : colB).appendChild(sec); });
    if (openT.size) secs.forEach(s => { if (openT.has(title(s))) s.classList.add('open'); });
    else if (secs[0]) secs[0].classList.add('open');
    applyFilter();
  }
  renderTab();

  S.on((st, evt) => {
    if (evt === 'sync') renderTab();
    if (evt === 'tracking' || evt === 'sync') {
      if (live.ships) live.ships.classList.toggle('on', !!S.state.tracking.ships);
      if (live.flights) live.flights.classList.toggle('on', !!S.state.tracking.flights);
      if (live.trails) live.trails.classList.toggle('on', S.state.tracking.trails !== false);
    }
    if (evt === 'mapstyle' || evt === 'sync') { if (live.seg) live.seg.querySelectorAll('.cfg-seg__b').forEach(z => z.classList.toggle('on', z.dataset.id === S.state.mapStyle)); }
  });
})();
