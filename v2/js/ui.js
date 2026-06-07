/* ============================================================
   UI — shared helpers: toast, text-input modal, Hide-UI mode,
   project save/load to file. Exposed as window.UI.
   ============================================================ */
(() => {
  const S = window.Store;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  /* ---------- toast ---------- */
  const toastWrap = h('div', 'toast-wrap'); document.body.appendChild(toastWrap);
  let _tid = 0;
  function toast(msg, ms = 2600) {
    const el = h('div', 'toast', esc(msg)); toastWrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const id = ++_tid; el.dataset.id = id;
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 250); }, ms);
    return el;
  }

  /* ---------- text input modal (Promise) ---------- */
  function input({ title = 'Enter text', value = '', placeholder = '', ok = 'OK', multiline = false } = {}) {
    return new Promise(resolve => {
      const back = h('div', 'modal-back');
      const box = h('div', 'modal glass');
      box.appendChild(h('div', 'modal__t', esc(title)));
      const field = multiline ? h('textarea', 'modal__in') : h('input', 'modal__in');
      field.value = value; field.placeholder = placeholder; if (!multiline) field.type = 'text';
      box.appendChild(field);
      const row = h('div', 'modal__row');
      const cancel = h('button', 'modal__btn', 'Cancel');
      const okb = h('button', 'modal__btn modal__btn--ok', esc(ok));
      row.append(cancel, okb); box.appendChild(row); back.appendChild(box); document.body.appendChild(back);
      const close = v => { back.remove(); resolve(v); };
      cancel.onclick = () => close(null);
      okb.onclick = () => close(field.value);
      back.onclick = e => { if (e.target === back) close(null); };
      field.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); close(field.value); } if (e.key === 'Escape') close(null); });
      requestAnimationFrame(() => { back.classList.add('in'); field.focus(); field.select && field.select(); });
    });
  }

  /* ---------- Hide-UI (clean broadcast map) ---------- */
  function hideUI(on) {
    const v = on == null ? !document.body.classList.contains('ui-hidden') : on;
    document.body.classList.toggle('ui-hidden', v);
    toast(v ? 'UI hidden — press H to show' : 'UI shown', 1600);
    return v;
  }

  /* ---------- project save / load (file) ---------- */
  function saveProject(name) {
    try {
      const data = JSON.stringify(S.exportState(), null, 0);
      const a = h('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.download = (name || (S.state.rundown.title || 'news-map')).replace(/[^\w-]+/g, '_') + '.newsmap.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Project saved');
    } catch (e) { toast('Save failed'); }
  }
  function loadProject() {
    const inp = h('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.hidden = true;
    document.body.appendChild(inp);
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) { inp.remove(); return; }
      const fr = new FileReader();
      fr.onload = () => { try { S.importState(JSON.parse(fr.result)); toast('Project loaded'); } catch (e) { toast('Invalid project file'); } inp.remove(); };
      fr.onerror = () => { toast('Read failed'); inp.remove(); };
      fr.readAsText(f);
    };
    inp.click();
  }

  window.UI = { toast, input, hideUI, saveProject, loadProject };
})();
