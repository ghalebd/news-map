/* ============================================================
   CONTROL PANEL — large tabbed console (control.html only).
   Category rail + multi-column content. Edits the shared
   Store.config; changes persist + sync live to the Presenter.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const aspectOf = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res((im.naturalWidth / im.naturalHeight) || 1); im.onerror = rej; im.src = url; });
  // parse a single Google-style coordinate string "lat, lng" (also tolerates ° and N/S/E/W)
  const parseLatLng = s => { const m = String(s || '').match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?/); if (!m) return null; let lat = +m[1], lng = +m[3]; if (/[Ss]/.test(m[2] || '')) lat = -Math.abs(lat); if (/[Ww]/.test(m[4] || '')) lng = -Math.abs(lng); return (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ? [lat, lng] : null; };
  function readImage(file, max = 256) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const img = new Image(); img.onload = () => { let w = img.width, hh = img.height; const sc = Math.min(1, max / Math.max(w, hh)); w = Math.round(w * sc); hh = Math.round(hh * sc); const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; cv.getContext('2d').drawImage(img, 0, 0, w, hh); res(cv.toDataURL('image/png')); }; img.onerror = rej; img.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }

  const ACCENTS = ['#5b9dff', '#22d3ee', '#2dd4bf', '#34d399', '#d9b25f', '#ffb020', '#fb7185', '#8b7bff'];
  const DTOOLS = [['select', 'Select'], ['marker', 'Marker'], ['arrow', 'Arrow'], ['curve', 'Curve'], ['ring', 'Range'], ['circle', 'Circle'], ['polygon', 'Area'], ['sketch', 'Freehand'], ['text', 'Label'], ['measure', 'Measure'], ['frontline', 'Front line'], ['country', 'Country'], ['asset', 'Assets'], ['erase', 'Erase']];
  const VIS = [['deck', 'Scene deck'], ['modeSwitch', 'Mode switch'], ['qtools', 'Tool bar'], ['fab', 'Add launcher'], ['status', 'Coordinates'], ['brand', 'Logo'], ['nownext', 'Now / Next'], ['tracking', 'Live tracking'], ['sceneSettings', 'Scene settings'], ['attribution', 'Map credit']];
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
    document.body.classList.add('cfg-resizing');
    const mv = ev => {
      const w = Math.max(360, Math.min(window.innerWidth * 0.96, startW + (ev.clientX - startX)));
      drawer.style.width = w + 'px'; document.body.style.setProperty('--cfg-w', w + 'px');
      if (window.Movable) { Movable.setCfgOffset(w); Movable.reflow(); }
      relayout();   // add/remove columns live as the panel widens/narrows
    };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.body.classList.remove('cfg-resizing'); try { localStorage.setItem(CW_KEY, Math.round(drawer.getBoundingClientRect().width)); } catch (e) {} };
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
  // open the drawer and reveal a section by title (used by the pinned bar buttons)
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
  function tog(on, fn) { const t = h('div', 'tog' + (on ? ' on' : '')); t.onclick = () => { const nv = !t.classList.contains('on'); t.classList.toggle('on', nv); fn(nv); }; return t; }
  function rowTog(label, on, fn) { const r = h('div', 'cfg-row'); r.appendChild(h('div', 'lab', label)); r.appendChild(tog(on, fn)); return r; }
  function rowWith(label, el) { const r = h('div', 'cfg-row'); r.appendChild(h('div', 'lab', label)); r.appendChild(el); return r; }
  /* DaVinci Resolve-style rotary dial — THE numeric control for the whole console.
     270° arc · vertical drag (Shift = fine ×10) · scroll wheel · click number to type */
  function slider(label, val, min, max, step, fn) {
    const st = step || 1, dec = st < 1 ? (st < 0.1 ? 2 : 1) : 0;
    const fmt = x => (+x).toFixed(dec);
    const R = 21, CX = 27, CY = 27, SWEEP = 270, A0 = 135;
    const pt = aDeg => { const a = aDeg * Math.PI / 180; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
    const [sx, sy] = pt(A0), [ex, ey] = pt(A0 + SWEEP);
    const ARC = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R} ${R} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
    const LEN = 2 * Math.PI * R * (SWEEP / 360);
    const wrap = h('div', 'dknob');
    wrap.innerHTML = `<div class="dknob__dial" title="Drag up/down · Shift = fine · scroll = step">
      <svg viewBox="0 0 54 54">
        <path class="dknob__trk" d="${ARC}"/>
        <path class="dknob__arc" d="${ARC}" stroke-dasharray="${LEN.toFixed(2)}"/>
        <circle class="dknob__dot" r="2.6"/>
      </svg>
      <button class="dknob__num" title="Click to type"></button>
    </div><div class="dknob__lab">${label}</div>`;
    const arc = wrap.querySelector('.dknob__arc'), dot = wrap.querySelector('.dknob__dot'),
      num = wrap.querySelector('.dknob__num'), dial = wrap.querySelector('.dknob__dial');
    let v = Math.max(min, Math.min(max, val));
    const paint = () => {
      const f = (v - min) / (max - min);
      arc.style.strokeDashoffset = (LEN * (1 - f)).toFixed(2);
      const [dx, dy] = pt(A0 + SWEEP * f); dot.setAttribute('cx', dx.toFixed(2)); dot.setAttribute('cy', dy.toFixed(2));
      num.textContent = fmt(v);
    };
    const setV = nv => { nv = Math.max(min, Math.min(max, Math.round(nv / st) * st)); if (nv === v) return; v = nv; paint(); fn(v); };
    paint();
    function openEdit() {
      const ed = h('input', 'dknob__edit'); ed.type = 'text'; ed.value = fmt(v);
      num.replaceWith(ed); ed.focus(); ed.select();
      const done = ok => { const nv = parseFloat(ed.value); ed.replaceWith(num); if (ok && !isNaN(nv)) setV(nv); else paint(); };
      ed.onkeydown = ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); };
      ed.onblur = () => done(true);
    }
    // The WHOLE dial face is draggable (vertical = value), not just the thin ring — much easier to
    // grab. A clean tap on the centred number (no drag) opens the type-in editor. touch-action:none
    // (CSS) stops the settings panel from stealing the vertical gesture on touch screens / trackpads.
    let drag = false, sy2 = 0, sv = 0, moved = false, onNum = false;
    dial.addEventListener('pointerdown', e => { drag = true; moved = false; onNum = (e.target === num); sy2 = e.clientY; sv = v; try { dial.setPointerCapture(e.pointerId); } catch (err) {} dial.classList.add('is-drag'); e.preventDefault(); });
    dial.addEventListener('pointermove', e => { if (!drag) return; if (Math.abs(e.clientY - sy2) > 3) moved = true; const fine = e.shiftKey ? 10 : 1; setV(sv + ((sy2 - e.clientY) / (150 * fine)) * (max - min)); });
    const end = () => { if (!drag) return; drag = false; dial.classList.remove('is-drag'); if (!moved && onNum) openEdit(); };
    dial.addEventListener('pointerup', end); dial.addEventListener('pointercancel', end);
    dial.addEventListener('wheel', e => { e.preventDefault(); setV(v + (e.deltaY < 0 ? st : -st) * (e.shiftKey ? 10 : 1)); }, { passive: false });
    return wrap;
  }
  /* knob() and slider() are the same Resolve dial — one visual language */
  function knob(label, val, min, max, step, fn) { return slider(label, val, min, max, step, fn); }
  function swatches(list, cur, fn) {
    const sw = h('div', 'cfg-sw');
    const mark = el => { sw.querySelectorAll('button').forEach(z => z.classList.remove('on')); el.classList.add('on'); };
    list.forEach(c => { const b = h('button'); b.style.background = c; b.title = c; if ((c || '').toLowerCase() === (cur || '').toLowerCase()) b.classList.add('on'); b.onclick = () => { mark(b); fn(c); }; sw.appendChild(b); });
    // custom colour chip — rainbow ring, embedded native picker, shows the picked colour
    const custom = h('button', 'cfg-sw__custom'); custom.title = 'Custom colour';
    const dot = h('i'); custom.appendChild(dot);
    const ci = h('input'); ci.type = 'color'; ci.value = /^#/.test(cur || '') ? cur : '#ffffff'; custom.appendChild(ci);
    if (cur && !list.some(c => (c || '').toLowerCase() === cur.toLowerCase())) { custom.classList.add('on'); dot.style.background = cur; }
    ci.oninput = () => { dot.style.background = ci.value; mark(custom); fn(ci.value); };
    sw.appendChild(custom);
    return sw;
  }
  const knobs = (...ks) => { const g = h('div', 'cfg-knobs'); ks.forEach(k => g.appendChild(k)); return g; };
  function field(label, el) { const f = h('div', 'cfg-field'); f.appendChild(h('div', 'lab', `<span>${label}</span>`)); if (el) f.appendChild(el); return f; }
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
      row.appendChild(h('span', 'cfg-qrow__n', it.label));
      row.ondragstart = e => { dragId = it.id; row.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; };
      row.ondragend = () => { dragId = null; row.classList.remove('is-drag'); lst.querySelectorAll('.is-over').forEach(r => r.classList.remove('is-over')); };
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
      if (s.cat !== lastCat) { plist.appendChild(h('div', 'cfg-qcat', s.cat)); lastCat = s.cat; }
      const row = h('div', 'cfg-qrow'); row.appendChild(h('span', 'cfg-qrow__n', s.title));
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
      knob('Radius', sp.radiusKm || 400, 50, 2000, 50, v => S.setSpotlight({ radiusKm: v })),
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
  // sensible default on-map size (km) by type so a carrier ≠ a missile
  const m3dScale = (cat, file) => { const f = file || ''; if (/carrier|lincoln|eisenhower|cvn/.test(f)) return 12; if (cat === 'Naval') return 6; if (cat === 'Aircraft') return /c-130|hercules|a-3|707|boein|awacs|e-3|sentry|b-2|spirit|b21|tu160|legacy|embraer/.test(f) ? 4.5 : 2.2; if (cat === 'Drones / UAV') return 1.4; if (cat === 'Air defense / Radar') return 2; if (cat === 'Missiles / Rockets') return 1; if (cat === 'Armor / Vehicles') return 1.4; return 2.5; };
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
        const b = h('button', 'cfg-cat3d__i', `<span>${esc(m.name)}</span><small>${esc(m.cat)}</small>`);
        b.dataset.cat = m.cat; b.dataset.q = (m.name + ' ' + m.cat + ' ' + m.file).toLowerCase().replace(/[^a-z0-9]/g, '');
        b.title = 'Add “' + m.name + '” at the current map centre';
        b.onclick = () => { const cv = window.GameMap.currentView(); S.addModel3d({ src: 'assets3d/' + m.file, name: m.name, cat: m.cat, lat: cv.lat, lng: cv.lng, scale: m3dScale(m.cat, m.file), rotZ: 0, pitch: 0, roll: 0, alt: 0, mode: 'both', style: 'solid', on: true }); renderTab(); };
        grid.appendChild(b);
      });
      function filterGrid() { const q = m3dSearch.toLowerCase().replace(/[^a-z0-9]/g, ''); grid.querySelectorAll('.cfg-cat3d__i').forEach(it => { const ok = (m3dCat === 'All' || it.dataset.cat === m3dCat) && (!q || it.dataset.q.indexOf(q) >= 0); it.style.display = ok ? '' : 'none'; }); }
      srch.oninput = () => { m3dSearch = srch.value; filterGrid(); };
      filterGrid();
      lb.bd.appendChild(grid);
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
    targets.forEach(t => { const o = h('option', null, t.name); o.value = t.kind + '|' + t.id; if (f.on && f.kind === t.kind && String(f.id) === String(t.id)) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => { const v = sel.value; if (!v) { S.setFollow({ on: false, kind: null, id: null }); return; } const ix = v.indexOf('|'); S.setFollow({ on: true, kind: v.slice(0, ix), id: v.slice(ix + 1) }); };
    bd.appendChild(rowWith('Follow target', sel));
    bd.appendChild(h('div', 'hint', 'Smooth motion eases route + timeline playback in/out (off = linear). Follow locks the camera onto a moving target — a model along its route, or a live ship / flight — and keeps it centred on both the flat and 3D maps; the presenter follows in lockstep. Pick a target to start, “Off” to release.'));
    ct.appendChild(sec);
  }

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
    grip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/cat', key); e.dataTransfer.effectAllowed = 'move'; band.classList.add('dragging'); });
    grip.addEventListener('dragend', () => band.classList.remove('dragging'));
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
      grip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', title(sec)); e.dataTransfer.effectAllowed = 'move'; sec.classList.add('dragging'); });
      grip.addEventListener('dragend', () => sec.classList.remove('dragging'));
    }
    sec.addEventListener('dragover', e => { e.preventDefault(); sec.classList.add('dragover'); });
    sec.addEventListener('dragleave', () => sec.classList.remove('dragover'));
    sec.addEventListener('drop', e => { e.preventDefault(); sec.classList.remove('dragover'); const from = e.dataTransfer.getData('text/plain'), to = title(sec); if (from && from !== to) reorder(from, to); });
  }
  // responsive column count from the panel width (~300px per column)
  function colCount() { const w = bodyEl.clientWidth || drawer.getBoundingClientRect().width || 600; return Math.max(1, Math.min(4, Math.round((w - 24) / 300))); }
  // responsive column count from the panel width (~300px per column)
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
      const hd = h('div', 'cfg-bandhd', `<span class="cfg-bandgrip" title="Drag to move this category">${I.gripH}</span><span class="cfg-bandlbl">${c.label}</span><span class="cfg-bandchev">${I.chevron}</span>`);
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
      const live = !!bodyEl.offsetParent && !collapsed;
      const per = Math.max(1, Math.ceil(secs.length / n));
      secs.forEach((sec, i) => {
        setupDnD(sec); sec._ord = i; autoGroup(sec);
        if (live && n > 1) { let best = cols[0]; for (const col of cols) if (col.offsetHeight < best.offsetHeight) best = col; best.appendChild(sec); }
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
  renderBarButtons();   // place any pinned section buttons on the tool bar
  window.addEventListener('resize', relayout);

  S.on((st, evt) => {
    if (evt === 'config' || evt === 'sync') renderBarButtons();   // keep pinned bar buttons in step (cross-window too)
    // don't rebuild the panel out from under an input the operator is typing in
    if (evt === 'sync') { const f = document.activeElement; if (!(f && drawer.contains(f) && /INPUT|TEXTAREA|SELECT/.test(f.tagName))) renderTab(); }
    if (evt === 'tracking' || evt === 'sync') {
      if (live.ships) live.ships.classList.toggle('on', !!S.state.tracking.ships);
      if (live.flights) live.flights.classList.toggle('on', !!S.state.tracking.flights);
      if (live.trails) live.trails.classList.toggle('on', S.state.tracking.trails !== false);
    }
    if (evt === 'mapstyle' || evt === 'sync') { if (live.seg) live.seg.querySelectorAll('.cfg-seg__b').forEach(z => z.classList.toggle('on', z.dataset.id === S.state.mapStyle)); }
  });
})();
