/* ============================================================
   CONFIG PANEL — the Control Panel drawer (control.html only).
   Edits the shared Store.config; changes persist + sync live to
   the Presenter window.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };

  const ACCENTS = ['#5b9dff', '#22d3ee', '#2dd4bf', '#34d399', '#d9b25f', '#ffb020', '#fb7185', '#8b7bff'];
  const TOOLS = [['select', 'Select'], ['marker', 'Marker'], ['arrow', 'Arrow'], ['curve', 'Curve'], ['ring', 'Range'], ['circle', 'Circle'], ['polygon', 'Area'], ['sketch', 'Freehand'], ['text', 'Label'], ['measure', 'Measure'], ['erase', 'Erase'], ['asset', 'Assets']];
  const VIS = [['deck', 'Scene deck'], ['modeSwitch', 'Mode switch'], ['qtools', 'Tool bar'], ['fab', 'Add launcher'], ['status', 'Coordinates'], ['brand', 'Logo'], ['nownext', 'Now / Next']];
  const PERMS = [['canDraw', 'Can draw on map'], ['canNavigate', 'Can change scenes'], ['canEditScenes', 'Can edit scene list'], ['canChangeMapStyle', 'Can change map style'], ['canChangeStyle', 'Can change theme']];

  /* ---- shell ---- */
  const toggle = h('button', 'cfg-toggle', I.settings); toggle.title = 'Control settings';
  const drawer = h('div', 'cfg-drawer');
  const head = h('div', 'cfg-hd', `<div class="t">Control Panel<small>NEWS MAP · CONFIG</small></div>`);
  const x = h('button', 'x', I.close); head.appendChild(x);
  const body = h('div', 'cfg-body');
  drawer.append(head, body);
  document.body.append(toggle, drawer);
  const open = () => { drawer.classList.add('open'); toggle.classList.add('is-open'); };
  const close = () => { drawer.classList.remove('open'); toggle.classList.remove('is-open'); };
  toggle.onclick = () => drawer.classList.contains('open') ? close() : open();
  x.onclick = close;

  /* ---- builders ---- */
  function section(title, icon, open) {
    const sec = h('div', 'cfg-sec' + (open ? ' open' : ''));
    const hd = h('div', 'cfg-sec__hd', `<span class="i">${icon}</span><span class="t">${title}</span><span class="chev">${I.chevron}</span>`);
    const bd = h('div', 'cfg-sec__bd');
    hd.onclick = () => sec.classList.toggle('open');
    sec.append(hd, bd); return { sec, bd };
  }
  function tog(on, fn) { const t = h('div', 'tog' + (on ? ' on' : '')); t.onclick = () => { const nv = !t.classList.contains('on'); t.classList.toggle('on', nv); fn(nv); }; return t; }
  function rowTog(label, on, fn) { const r = h('div', 'cfg-row'); r.appendChild(h('div', 'lab', label)); r.appendChild(tog(on, fn)); return r; }
  function slider(label, val, min, max, step, fn) {
    const f = h('div', 'cfg-field'); const lab = h('div', 'lab', `<span>${label}</span><span class="val">${val}</span>`);
    const inp = h('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step || 1; inp.value = val;
    inp.oninput = () => { lab.querySelector('.val').textContent = inp.value; fn(parseFloat(inp.value)); };
    f.append(lab, inp); return f;
  }

  /* ---- render ---- */
  function render() {
    body.innerHTML = '';
    const C = S.cfg();

    // STYLE
    {
      const { sec, bd } = section('Style', I.sliders, true);
      const sw = h('div', 'cfg-sw');
      ACCENTS.forEach(c => { const b = h('button'); b.style.background = c; if (c === C.style.accent) b.classList.add('on'); b.onclick = () => { sw.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); S.setStyle({ accent: c }); }; sw.appendChild(b); });
      const fl = h('div', 'cfg-field'); fl.append(h('div', 'lab', '<span>ACCENT</span>'), sw);
      bd.append(fl,
        slider('Glass opacity', C.style.glass, 25, 85, 1, v => S.setStyle({ glass: v })),
        slider('Blur', C.style.blur, 0, 60, 1, v => S.setStyle({ blur: v })),
        slider('Glass distortion', C.style.distort, 0, 120, 1, v => S.setStyle({ distort: v })),
        slider('Corner radius', C.style.radius, 0, 22, 1, v => S.setStyle({ radius: v })),
      );
      body.appendChild(sec);
    }
    // VISIBILITY
    {
      const { sec, bd } = section('Presenter visibility', I.eye);
      VIS.forEach(([k, lab]) => bd.appendChild(rowTog(lab, C.visibility[k] !== false, on => S.setVisibility(k, on))));
      body.appendChild(sec);
    }
    // PERMISSIONS
    {
      const { sec, bd } = section('Permissions', I.lock);
      const grid = h('div', 'cfg-tools');
      TOOLS.forEach(([id, lab]) => { const on = C.permissions.tools[id] !== false; const t = h('div', 'cfg-tool ' + (on ? 'on' : 'off'), `${I[id] || I.marker}<span>${lab}</span>`); t.onclick = () => { const nv = t.classList.contains('off'); t.classList.toggle('on', nv); t.classList.toggle('off', !nv); S.setToolPerm(id, nv); }; grid.appendChild(t); });
      bd.appendChild(h('div', 'cfg-field', '<div class="lab"><span>ALLOWED TOOLS</span></div>')); bd.lastChild.appendChild(grid);
      PERMS.forEach(([k, lab]) => bd.appendChild(rowTog(lab, C.permissions[k] !== false, on => S.setPerm(k, on))));
      body.appendChild(sec);
    }
    // MAP STYLES
    {
      const { sec, bd } = section('Map styles', I.layers);
      const list = h('div', 'cfg-list');
      C.mapStyles.forEach(m => { const li = h('div', 'cfg-li', `<div class="nm">${m.name} <small>${m.id}</small></div>`); li.appendChild(tog(m.on !== false, on => S.setMapStyleOn(m.id, on))); list.appendChild(li); });
      const add = h('div', 'cfg-add', '<input placeholder="MapTiler id (e.g. winter-v2)">'); const ab = h('button', null, 'Add'); add.appendChild(ab);
      ab.onclick = () => { const v = add.querySelector('input').value.trim(); if (v) { S.addMapStyle(v, v.replace(/-v?\d+$/, '').replace(/-/g, ' ')); render(); } };
      bd.append(list, add); body.appendChild(sec);
    }
    // ASSETS
    {
      const { sec, bd } = section('Asset categories', I.folder);
      const chips = h('div', 'cfg-chips');
      C.assetCats.forEach(cat => chips.appendChild(h('span', 'cfg-chip', cat)));
      const add = h('div', 'cfg-add', '<input placeholder="New category">'); const ab = h('button', null, 'Add'); add.appendChild(ab);
      ab.onclick = () => { const v = add.querySelector('input').value.trim(); if (v) { S.addAssetCat(v); render(); } };
      bd.append(chips, add, h('div', 'hint', 'Image upload is added with the asset library.'));
      body.appendChild(sec);
    }
    // RESET
    const reset = h('button', 'cfg-reset', 'Reset all settings to defaults');
    reset.onclick = () => { if (confirm('Reset all control settings to defaults?')) { S.resetConfig(); render(); } };
    body.appendChild(reset);
  }

  render();
  S.on((st, evt) => { if (evt === 'sync') render(); });   // reflect remote changes
})();
