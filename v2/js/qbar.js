/* ============================================================
   QBAR — customise the left vertical tool bar (.qtools):
   reorder buttons, hide/show ("add / remove"). Order + hidden
   ids live in config.qbar and sync across windows.
   window.QBar exposes list()/move()/setOrder()/toggle()/reset()
   for the settings card in config-panel.js.
   ============================================================ */
(() => {
  const S = window.Store;
  const LABELS = {
    select: 'Select / Pan', arrow: 'Arrow', tarrow: 'Freehand arrow', curve: 'Curved arrow',
    marker: 'Marker', ring: 'Range ring', circle: 'Circle', polygon: 'Area', sketch: 'Freehand',
    frontline: 'Front line', country: 'Highlight country', text: 'Label', measure: 'Measure',
    asset: 'Image', flags: 'Flags', erase: 'Erase', color: 'Colour', undo: 'Undo',
    mapstyle: 'Base map', ships: 'Live ships', flights: 'Live flights', trails: 'Trails',
  };
  const bar = () => document.querySelector('.qtools');
  const btns = () => { const b = bar(); return b ? [...b.querySelectorAll('.qtool[data-qid]')] : []; };
  const map = () => { const m = {}; btns().forEach(b => m[b.dataset.qid] = b); return m; };
  const cfg = () => S.cfg().qbar || { order: [], hidden: [] };

  function ordered(m) {
    const present = Object.keys(m), c = cfg();
    const ord = (c.order || []).filter(id => present.includes(id));
    present.forEach(id => { if (!ord.includes(id)) ord.push(id); });
    return ord;
  }

  function apply() {
    const b = bar(); if (!b) return;
    b.querySelectorAll('.qtools__sep').forEach(s => s.remove());   // flat, fully-custom bar
    const m = map(), hidden = cfg().hidden || [];
    ordered(m).forEach(id => { const el = m[id]; if (!el) return; el.style.display = hidden.includes(id) ? 'none' : ''; b.appendChild(el); });
  }

  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') apply(); });
  apply();

  window.QBar = {
    apply,
    list() { const m = map(); return ordered(m).map(id => ({ id, label: LABELS[id] || (m[id] && m[id].title) || id, hidden: (cfg().hidden || []).includes(id) })); },
    setOrder(order) { S.setQbar({ order: order.slice() }); },
    move(id, dir) { const ord = ordered(map()); const i = ord.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= ord.length) return; [ord[i], ord[j]] = [ord[j], ord[i]]; S.setQbar({ order: ord }); },
    toggle(id) { const hid = (cfg().hidden || []).slice(); const i = hid.indexOf(id); if (i >= 0) hid.splice(i, 1); else hid.push(id); S.setQbar({ hidden: hid }); },
    reset() { S.setQbar({ order: [], hidden: [] }); },
  };
})();
