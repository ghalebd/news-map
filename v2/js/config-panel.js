/* ============================================================
   CONFIG PANEL — the Control Panel drawer (control.html only).
   Edits the shared Store.config; changes persist + sync live to
   the Presenter window.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  /* read + downscale an uploaded image to a small PNG data-URL (keeps the
     shared store light enough for localStorage + cross-window sync) */
  function readImage(file, max = 256) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const img = new Image(); img.onload = () => { let w = img.width, hh = img.height; const sc = Math.min(1, max / Math.max(w, hh)); w = Math.round(w * sc); hh = Math.round(hh * sc); const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; cv.getContext('2d').drawImage(img, 0, 0, w, hh); res(cv.toDataURL('image/png')); }; img.onerror = rej; img.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }

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
      const { sec, bd } = section('Assets & images', I.folder);
      // categories
      bd.appendChild(h('div', 'cfg-field', '<div class="lab"><span>CATEGORIES</span></div>'));
      const chips = h('div', 'cfg-chips');
      C.assetCats.forEach(cat => { const c = h('span', 'cfg-chip', `${cat}<button class="x" title="Remove">×</button>`); c.querySelector('.x').onclick = () => { S.removeAssetCat(cat); render(); }; chips.appendChild(c); });
      const addc = h('div', 'cfg-add', '<input placeholder="New category">'); const acb = h('button', null, 'Add'); addc.appendChild(acb);
      acb.onclick = () => { const v = addc.querySelector('input').value.trim(); if (v) { S.addAssetCat(v); render(); } };
      bd.append(chips, addc);
      // upload
      bd.appendChild(h('div', 'cfg-field', '<div class="lab"><span>ADD IMAGE</span></div>'));
      const up = h('div', 'cfg-up');
      const file = h('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
      const cat = h('select', 'cfg-sel'); C.assetCats.forEach(x => { const o = h('option', null, x); o.value = x; cat.appendChild(o); });
      const name = h('input', 'cfg-name'); name.placeholder = 'Name (optional)';
      const pick = h('button', 'cfg-uploadbtn', `${I.upload}<span>Choose image…</span>`);
      pick.onclick = () => file.click();
      file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const url = await readImage(f); S.addCustomAsset({ name: name.value.trim() || f.name.replace(/\.[^.]+$/, ''), cat: cat.value || C.assetCats[0], url }); render(); } catch (e) { alert('Could not read that image.'); } };
      up.append(pick, cat, name, file); bd.appendChild(up);
      // library
      const assets = C.customAssets || [];
      if (assets.length) {
        const grid = h('div', 'cfg-aset');
        assets.forEach(a => { const it = h('div', 'cfg-aset__i', `<img src="${a.url}" alt=""><div class="m"><b>${a.name || ''}</b><small>${a.cat || ''}</small></div>`); const del = h('button', 'cfg-aset__x', I.close); del.title = 'Delete'; del.onclick = () => { S.removeCustomAsset(a.id); render(); }; it.appendChild(del); grid.appendChild(it); });
        bd.appendChild(grid);
      } else bd.appendChild(h('div', 'hint', 'No images yet. Uploads are stored in the shared store and appear in the presenter\'s Image tool.'));
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
