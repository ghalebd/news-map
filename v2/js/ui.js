/* ============================================================
   UI — shared helpers: toast, text-input modal, Hide-UI mode,
   project save/load to file. Exposed as window.UI.
   ============================================================ */
(() => {
  const S = window.Store;
  const { h, esc } = window.U;   // js/util.js — destructured so the bodies below keep the bare names, and so a broken script order throws at load

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

  /* ---------- storage alarm (persistent, operator console only) ----------
     A localStorage write failure used to be a console.warn and nothing else, so the operator — who
     cannot open devtools mid-show — kept building a rundown that was no longer being saved anywhere.
     Reuses sync-client's .sync-alarm banner styling (same severity class: "your work is not where you
     think it is") but pinned to the BOTTOM, so if the sync alarm is up too they stack instead of
     hiding each other. Never rendered on the presenter — that window is on air. */
  let alarmEl = null;
  function storageAlarm(on, why) {
    if (window.APP_ROLE !== 'control') return;
    if (!on) { if (alarmEl) { alarmEl.remove(); alarmEl = null; } return; }
    if (!alarmEl) {
      alarmEl = h('div', 'sync-alarm');
      alarmEl.style.top = 'auto'; alarmEl.style.bottom = '0';
      document.body.appendChild(alarmEl);
    }
    alarmEl.textContent = 'BROWSER STORAGE FULL (' + (why || 'write failed') + ') — this console is NO LONGER SAVING. Delete snapshots / custom assets in Settings, then re-save.';
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
      // Validate BEFORE importing. Previously any syntactically-valid JSON went straight into applyData,
      // so a wrong-shaped file overwrote the live rundown and THEN showed "Invalid project file" — the
      // operator read a rejection message while already running on that file's data.
      fr.onload = () => {
        try {
          const d = JSON.parse(fr.result);
          const v = (S.validateState ? S.validateState(d) : { ok: true });
          if (!v.ok) { toast('Invalid project file — ' + v.reason); inp.remove(); return; }
          S.importState(d); toast('Project loaded');
        } catch (e) { toast('Invalid project file'); }
        inp.remove();
      };
      fr.onerror = () => { toast('Read failed'); inp.remove(); };
      fr.readAsText(f);
    };
    inp.click();
  }

  /* ---------- export current frame to PNG ---------- */
  function exportPNG() {
    const t = toast('Rendering image…', 8000);
    window.loadScript('lib/html2canvas.min.js')   // heavy lib (194KB) — fetched on first export, not at boot
      .then(() => html2canvas(document.body, { useCORS: true, allowTaint: false, backgroundColor: '#0e1622', logging: false, scale: 2 }))
      .then(canvas => {
        canvas.toBlob(blob => {
          if (!blob) { toast('Export failed (tainted canvas)'); return; }
          const a = h('a'); a.href = URL.createObjectURL(blob);
          a.download = 'news-map-' + ((S.state.rundown.title || 'frame').replace(/[^\w-]+/g, '_')) + '.png';
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          t.remove(); toast('Image exported');
        }, 'image/png');
      }).catch(() => { t.remove(); toast('Export failed'); });
  }
  function exportPDF() {
    const t = toast('Rendering PDF…', 8000);
    window.loadScript('lib/html2canvas.min.js')   // heavy lib (194KB) — fetched on first export, not at boot
      .then(() => html2canvas(document.body, { useCORS: true, allowTaint: false, backgroundColor: '#0e1622', logging: false, scale: 2 }))
      .then(canvas => {
        const data = canvas.toDataURL('image/png');
        const w = window.open('', '_blank');
        t.remove();
        if (!w) { toast('Allow pop-ups to export PDF'); return; }
        const title = esc(S.state.rundown.title || 'news-map');
        const orient = canvas.width >= canvas.height ? 'landscape' : 'portrait';
        w.document.write(`<!doctype html><html><head><title>${title}</title><style>@page{size:${orient};margin:0}html,body{margin:0;background:#0e1622}img{width:100%;display:block}</style></head><body><img src="${data}" onload="setTimeout(function(){window.focus();window.print();},200)"></body></html>`);
        w.document.close();
        toast('PDF ready — choose “Save as PDF”');
      }).catch(() => { t.remove(); toast('Export failed'); });
  }

  /* ---------- snapshots (named restore points, local) ----------
     Only the INDEX (id / name / at) stays in localStorage, so the settings panel can still list
     snapshots synchronously; the PAYLOAD — a full exportState carrying the brand logo data-URL and
     every custom-asset data-URL — now lives in IndexedDB. 30 of those used to share the ~5MB origin
     budget with the live state, which made taking restore points the very thing that pushed
     Store.persist() over quota mid-show. Same IndexedDB pattern js/assets3d.js uses for GLB binaries. */
  const SNAP_KEY = 'newsmap.v3.snapshots', SNAP_DB = 'newsmap.snapshots', SNAP_STORE = 'snap', SNAP_MAX = 30;
  let snapDbp = null;
  function snapDb() {
    if (snapDbp) return snapDbp;
    snapDbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      const r = indexedDB.open(SNAP_DB, 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(SNAP_STORE)) db.createObjectStore(SNAP_STORE); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return snapDbp;
  }
  const snapReq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const snapTx = mode => snapDb().then(db => db.transaction(SNAP_STORE, mode).objectStore(SNAP_STORE));
  const snapPut = (id, data) => snapTx('readwrite').then(st => snapReq(st.put(data, id)));
  const snapGet = id => snapTx('readonly').then(st => snapReq(st.get(id)));
  const snapDel = id => snapTx('readwrite').then(st => snapReq(st.delete(id)));

  // The index must be readable with NO await: config-panel renders the snapshot list inline, and
  // tools/deep.js saves + restores inside a single tick. snapMem keeps this window's own payloads so
  // restore stays synchronous too; older ones come back from IndexedDB.
  let snapIdx = (() => { try { const a = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); return Array.isArray(a) ? a.filter(s => s && typeof s === 'object' && s.id) : []; } catch (e) { return []; } })();
  const snapMem = new Map();
  function writeIdx() { try { localStorage.setItem(SNAP_KEY, JSON.stringify(snapIdx)); return true; } catch (e) { storageAlarm(true, 'snapshot index'); return false; } }
  const snaps = () => snapIdx.slice();

  // MIGRATION — snapshots taken before this carry their payload inline in the index. Move each across,
  // and strip the localStorage copy ONLY once every write has actually landed: a half-migration that
  // dropped it first would destroy restore points we could no longer read back.
  (() => {
    const old = snapIdx.filter(s => s.data);
    if (!old.length) return;
    Promise.all(old.map(s => snapPut(s.id, s.data)))
      .then(() => { old.forEach(s => { delete s.data; }); writeIdx(); })
      .catch(e => console.warn('[snapshots] IndexedDB migration failed — keeping the localStorage copies', e && e.name));
  })();

  function saveSnapshot(name) {
    const rec = { id: 's' + Date.now(), name: name || ('Snapshot ' + (snapIdx.length + 1)), at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    // DEEP COPY: exportState() hands back live references to state, and the old code only froze them
    // because it JSON.stringify'd straight into localStorage. Keeping the live objects would make the
    // "restore point" track every later edit — i.e. restore to exactly the state you wanted to undo.
    let data; try { data = JSON.parse(JSON.stringify(S.exportState())); } catch (e) { toast('Snapshot failed'); return; }
    snapIdx.unshift(rec); snapMem.set(rec.id, data);
    snapIdx.splice(SNAP_MAX).forEach(s => { snapMem.delete(s.id); snapDel(s.id).catch(() => {}); });   // evict past the cap from BOTH stores, else IndexedDB grows forever
    writeIdx();
    snapPut(rec.id, data).then(() => toast('Snapshot saved')).catch(() => {
      // IndexedDB blocked (private mode / policy): fall back to the old inline-in-localStorage payload
      // so snapshots still work at all, and only give up — un-listing the entry — if that fails too.
      rec.data = data;
      if (writeIdx()) toast('Snapshot saved');
      else { snapIdx = snapIdx.filter(x => x !== rec); snapMem.delete(rec.id); writeIdx(); toast('Snapshot failed (storage full)'); }
    });
  }
  // Same gate as loadProject — a snapshot is a restore point, i.e. exactly what gets reached for when the
  // app is already misbehaving. It had no try/catch at all, so a corrupt one deepened the problem.
  function restoreSnapshot(id) {
    const rec = snapIdx.find(x => x.id === id); if (!rec) return;
    const apply = data => {
      if (!data) { toast('Snapshot data is missing'); return; }
      try {
        // clone again: importState adopts these objects INTO the live state, so handing over the cached
        // copy would let the next edit mutate the snapshot and make a second restore a no-op.
        const d = JSON.parse(JSON.stringify(data));
        const v = (S.validateState ? S.validateState(d) : { ok: true });
        if (!v.ok) { toast('Snapshot is corrupt — ' + v.reason); return; }
        S.importState(d); toast('Snapshot restored');
      } catch (e) { toast('Snapshot restore failed'); }
    };
    if (snapMem.has(id)) apply(snapMem.get(id));            // taken in this window — stays synchronous
    else if (rec.data) apply(rec.data);                     // pre-migration entry still carrying its payload
    else snapGet(id).then(apply).catch(() => toast('Snapshot restore failed'));
  }
  function deleteSnapshot(id) { snapIdx = snapIdx.filter(x => x.id !== id); snapMem.delete(id); writeIdx(); snapDel(id).catch(() => {}); }

  window.UI = { toast, input, hideUI, saveProject, loadProject, exportPNG, exportPDF, snaps, saveSnapshot, restoreSnapshot, deleteSnapshot, storageAlarm };
})();
