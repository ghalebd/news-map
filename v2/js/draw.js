/* ============================================================
   DRAW — per-scene elements: render, draw interactions, and the
   CONTEXTUAL tools (quick-add launcher + selection context-bar).
   No fixed toolbar — tools are summoned and dismissed.
   ============================================================ */
const Draw = (() => {
  const map = GameMap.map, drawn = GameMap.drawn, S = Store, I = ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const fmtDist = m => m > 1000 ? (m / 1000).toFixed(1) + ' KM' : Math.round(m) + ' M';
  const labelIcon = (txt, color) => L.divIcon({ className: 'map-label', html: `<span style="border-color:${color}">${esc(txt)}</span>`, iconAnchor: [0, 8] });

  let tool = 'select', selected = null, dragStart = null, ghost = null, sketchPts = null, qbtns = {};

  /* ---------------- render the active scene ---------------- */
  function render() {
    drawn.clearLayers();
    const sc = S.activeScene(); if (!sc) return;
    sc.elements.forEach(el => { const l = buildLayer(el); if (l) { l.__id = el.id; drawn.addLayer(l); bindSelect(l, el); } });
    refreshCtx();
  }
  function buildLayer(el) {
    const o = { color: el.color, weight: 3, opacity: 1 };
    switch (el.type) {
      case 'marker':  return L.circleMarker(el.ll, { radius: 7, color: '#fff', weight: 2, fillColor: el.color, fillOpacity: 1 });
      case 'circle':  return L.circle(el.ll, { radius: el.radius, ...o, fillColor: el.color, fillOpacity: 0.12 });
      case 'ring':    { const g = L.layerGroup(); g.addLayer(L.circle(el.ll, { radius: el.radius, ...o, fill: false, dashArray: '6 5' })); g.addLayer(L.marker(el.ll, { icon: labelIcon((el.radius / 1000).toFixed(0) + ' KM', el.color) })); return g; }
      case 'arrow':   return arrowLine(L.latLng(el.a), L.latLng(el.b), o);
      case 'curve':   return curveLine(L.latLng(el.a), L.latLng(el.b), o);
      case 'polygon': return L.polygon(el.pts, { ...o, fillColor: el.color, fillOpacity: 0.12 });
      case 'sketch':  return L.polyline(el.pts, o);
      case 'measure': { const g = L.layerGroup(); g.addLayer(L.polyline([el.a, el.b], { ...o, dashArray: '4 4' })); g.addLayer(L.marker(el.b, { icon: labelIcon(fmtDist(map.distance(L.latLng(el.a), L.latLng(el.b))), el.color) })); return g; }
      case 'text':    return L.marker(el.ll, { icon: labelIcon(el.text, el.color) });
    }
    return null;
  }
  function arrowLine(a, b, o) { const g = L.layerGroup(); g.addLayer(L.polyline([a, b], o)); const ang = Math.atan2(b.lat - a.lat, b.lng - a.lng); const d = map.distance(a, b) * 0.18; const head = w => L.latLng(b.lat + Math.sin(w) * d / 111000, b.lng + Math.cos(w) * d / 111000); g.addLayer(L.polyline([head(ang + 2.6), b, head(ang - 2.6)], o)); return g; }
  function curveLine(a, b, o) { const mid = L.latLng((a.lat + b.lat) / 2 + (b.lng - a.lng) * 0.2, (a.lng + b.lng) / 2 - (b.lat - a.lat) * 0.2); const p = []; for (let t = 0; t <= 1; t += 0.05) p.push([(1 - t) ** 2 * a.lat + 2 * (1 - t) * t * mid.lat + t * t * b.lat, (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * mid.lng + t * t * b.lng]); return L.polyline(p, o); }

  function bindSelect(layer, el) {
    const wire = lyr => lyr && lyr.on && lyr.on('mousedown', ev => {
      if (tool !== 'select' && tool !== 'erase') return;
      L.DomEvent.stopPropagation(ev);
      if (tool === 'erase') { S.removeElement(el.id); return; }
      selectEl(el);
    });
    if (layer.eachLayer) layer.eachLayer(wire); else wire(layer);
  }

  /* ---------------- tools ---------------- */
  const DRAG = ['arrow', 'curve', 'circle', 'ring', 'polygon', 'sketch', 'measure'];
  function setTool(t) { tool = t; deselect(); map.getContainer().style.cursor = t === 'select' ? '' : 'crosshair'; armChip(); Object.keys(qbtns).forEach(id => qbtns[id].classList.toggle('is-on', id === t)); }

  map.on('mousedown', e => { if (!DRAG.includes(tool)) return; dragStart = e.latlng; map.dragging.disable(); sketchPts = tool === 'sketch' ? [[e.latlng.lat, e.latlng.lng]] : null; });
  map.on('mousemove', e => { if (!dragStart) return; if (tool === 'sketch') sketchPts.push([e.latlng.lat, e.latlng.lng]); if (ghost) drawn.removeLayer(ghost); ghost = preview(tool, dragStart, e.latlng); if (ghost) drawn.addLayer(ghost); });
  map.on('mouseup', e => { if (!dragStart) return; if (ghost) { drawn.removeLayer(ghost); ghost = null; } commit(tool, dragStart, e.latlng); dragStart = null; sketchPts = null; map.dragging.enable(); });
  map.on('click', e => {
    if (tool === 'marker') S.addElement({ type: 'marker', ll: [e.latlng.lat, e.latlng.lng], color: S.state.color });
    else if (tool === 'text') { const t = prompt('Label text:'); if (t) S.addElement({ type: 'text', ll: [e.latlng.lat, e.latlng.lng], text: t, color: S.state.color }); }
    else if (tool === 'select') deselect();
  });
  function preview(t, a, b) {
    const o = { color: S.state.color, weight: 3, opacity: 0.6 };
    if (t === 'circle') return L.circle(a, { radius: map.distance(a, b), ...o, fillOpacity: 0.08 });
    if (t === 'ring') { const g = L.layerGroup(); g.addLayer(L.circle(a, { radius: map.distance(a, b), ...o, fill: false, dashArray: '6 5' })); g.addLayer(L.marker(a, { icon: labelIcon((map.distance(a, b) / 1000).toFixed(0) + ' KM', S.state.color) })); return g; }
    if (t === 'arrow') return arrowLine(a, b, o);
    if (t === 'curve') return curveLine(a, b, o);
    if (t === 'polygon') return L.polygon([a, b, [a.lat, b.lng]], { ...o, fillOpacity: 0.08 });
    if (t === 'measure') { const g = L.layerGroup(); g.addLayer(L.polyline([a, b], { ...o, dashArray: '4 4' })); g.addLayer(L.marker(b, { icon: labelIcon(fmtDist(map.distance(a, b)), S.state.color) })); return g; }
    if (t === 'sketch') return L.polyline(sketchPts, o);
    return null;
  }
  function commit(t, a, b) {
    const c = S.state.color, A = [a.lat, a.lng], B = [b.lat, b.lng];
    if (map.distance(a, b) < 1 && t !== 'sketch') return;
    if (t === 'circle') S.addElement({ type: 'circle', ll: A, radius: map.distance(a, b), color: c });
    else if (t === 'ring') S.addElement({ type: 'ring', ll: A, radius: map.distance(a, b), color: c });
    else if (t === 'arrow') S.addElement({ type: 'arrow', a: A, b: B, color: c });
    else if (t === 'curve') S.addElement({ type: 'curve', a: A, b: B, color: c });
    else if (t === 'polygon') S.addElement({ type: 'polygon', pts: [A, B, [a.lat, b.lng]], color: c });
    else if (t === 'measure') S.addElement({ type: 'measure', a: A, b: B, color: c });
    else if (t === 'sketch' && sketchPts && sketchPts.length > 1) S.addElement({ type: 'sketch', pts: sketchPts.slice(), color: c });
  }

  /* ---------------- selection + context bar ---------------- */
  const ctx = h('div', 'ctxbar'); ctx.hidden = true; document.body.appendChild(ctx);
  function selectEl(el) { selected = el; buildCtx(el); }
  function deselect() { selected = null; ctx.hidden = true; }
  function elAnchor(el) { if (el.ll) return el.ll; if (el.a) return el.a; if (el.pts) return el.pts[0]; return null; }
  function buildCtx(el) {
    ctx.innerHTML = '';
    const COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#36ff9e', '#38e6ff', '#0a84ff', '#bf5af2', '#ffffff'];
    const colors = h('div', 'ctxbar__colors');
    COLORS.forEach(c => { const s = h('button', 'ctxbar__sw' + (c === el.color ? ' is-on' : '')); s.style.background = c; s.onclick = () => { S.updateElement(el.id, { color: c }); el.color = c; buildCtx(el); }; colors.appendChild(s); });
    ctx.appendChild(colors);
    if (el.type === 'arrow' || el.type === 'curve') ctx.appendChild(ctxBtn(I.curve, 'Straight ↔ Curved', () => { S.updateElement(el.id, { type: el.type === 'arrow' ? 'curve' : 'arrow' }); el.type = el.type === 'arrow' ? 'curve' : 'arrow'; }));
    ctx.appendChild(ctxBtn(I.layers, 'Duplicate', () => { const copy = JSON.parse(JSON.stringify(el)); delete copy.id; S.addElement(copy); }));
    ctx.appendChild(ctxBtn(I.close, 'Delete', () => { S.removeElement(el.id); deselect(); }));
    ctx.hidden = false; positionCtx(el);
  }
  function ctxBtn(icon, title, fn) { const b = h('button', 'ctxbar__btn', icon); b.title = title; b.onclick = fn; return b; }
  function positionCtx(el) { const a = elAnchor(el); if (!a) return; const p = map.latLngToContainerPoint(L.latLng(a[0], a[1])); ctx.style.left = Math.max(10, Math.min(p.x - ctx.offsetWidth / 2, innerWidth - ctx.offsetWidth - 10)) + 'px'; ctx.style.top = Math.max(60, p.y - ctx.offsetHeight - 14) + 'px'; }
  function refreshCtx() { if (selected && !S.activeScene().elements.find(e => e.id === selected.id)) deselect(); else if (selected) positionCtx(selected); }
  map.on('move zoom', () => { if (selected) positionCtx(selected); });

  /* ---------------- quick-add launcher (+ FAB) + menu + arm chip ---------------- */
  const TOOLS = [
    ['marker', I.marker, 'Marker'], ['text', I.text, 'Label'], ['arrow', I.arrow, 'Arrow'], ['curve', I.curve, 'Curved arrow'],
    ['ring', I.target, 'Range ring'], ['circle', I.circle, 'Circle'], ['polygon', I.polygon, 'Area'], ['sketch', I.sketch, 'Freehand'],
    ['measure', I.ruler, 'Measure'], ['erase', I.erase, 'Erase'],
  ];
  const COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#36ff9e', '#38e6ff', '#0a84ff', '#bf5af2', '#ffffff'];

  const fab = h('button', 'fab', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'); fab.title = 'Add element  ( / )'; document.body.appendChild(fab);
  const menu = h('div', 'qa'); menu.hidden = true; document.body.appendChild(menu);
  const arm = h('div', 'armchip'); arm.hidden = true; document.body.appendChild(arm);

  function buildMenu() {
    menu.innerHTML = '';
    const cRow = h('div', 'qa__colors');
    COLORS.forEach(c => { const s = h('button', 'qa__sw' + (c === S.state.color ? ' is-on' : '')); s.style.background = c; s.onclick = () => { S.setColor(c); cRow.querySelectorAll('.qa__sw').forEach(x => x.classList.remove('is-on')); s.classList.add('is-on'); }; cRow.appendChild(s); });
    const grid = h('div', 'qa__tools');
    TOOLS.forEach(([id, icon, label]) => { const b = h('button', 'qa__tool', `${icon}<span>${label}</span>`); b.onclick = () => { setTool(id); closeMenu(); }; grid.appendChild(b); });
    menu.append(h('div', 'qa__title', 'ADD'), cRow, grid);
  }
  function openMenu() { buildMenu(); menu.hidden = false; }
  function closeMenu() { menu.hidden = true; }
  function toggleMenu() { menu.hidden ? openMenu() : closeMenu(); }
  fab.onclick = e => { e.stopPropagation(); toggleMenu(); };
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== fab) closeMenu(); });

  function armChip() {
    if (tool === 'select') { arm.hidden = true; return; }
    const def = TOOLS.find(t => t[0] === tool);
    arm.innerHTML = `${def ? def[1] : ''}<span>${def ? def[2] : tool}</span>`;
    const x = h('button', 'armchip__x', I.close); x.title = 'Done (Esc)'; x.onclick = () => setTool('select');
    arm.appendChild(x); arm.hidden = false;
  }

  /* ---------------- presenter quick toolbar (vertical, left edge) ---------------- */
  const QTOOLS = [
    ['select', I.pan, 'Select / Pan'],
    ['arrow', I.arrow, 'Arrow'],
    ['marker', I.marker, 'Marker'],
    ['ring', I.target, 'Range ring'],
    ['text', I.text, 'Label'],
    ['erase', I.erase, 'Erase'],
  ];
  const qbar = h('div', 'qtools');
  QTOOLS.forEach(([id, icon, title]) => { const b = h('button', 'qtool' + (id === 'select' ? ' is-on' : ''), icon); b.title = title; b.onclick = () => setTool(id); qbar.appendChild(b); qbtns[id] = b; });
  qbar.appendChild(h('div', 'qtools__sep'));
  // colour button + popover
  const qcolor = h('button', 'qtool qtool--color', '<span class="qtool__dot"></span>'); qcolor.title = 'Colour';
  const setDot = () => qcolor.querySelector('.qtool__dot').style.background = S.state.color;
  setDot();
  const qpop = h('div', 'qtools-pop'); qpop.hidden = true;
  ['#ff453a', '#ff9f0a', '#ffd60a', '#36ff9e', '#38e6ff', '#0a84ff', '#bf5af2', '#ffffff'].forEach(c => { const s = h('button', 'qtools-pop__sw'); s.style.background = c; s.onclick = () => { S.setColor(c); setDot(); qpop.hidden = true; }; qpop.appendChild(s); });
  qcolor.onclick = e => { e.stopPropagation(); qpop.hidden = !qpop.hidden; };
  document.addEventListener('click', e => { if (e.target !== qcolor && !qpop.contains(e.target)) qpop.hidden = true; });
  qbar.append(qcolor, qpop);
  // undo
  const qundo = h('button', 'qtool', I.undo); qundo.title = 'Undo'; qundo.onclick = () => S.undo(); qbar.appendChild(qundo);
  document.body.appendChild(qbar);

  return { render, setTool, openMenu, closeMenu, toggleMenu, deselect, get tool() { return tool; } };
})();
window.Draw = Draw;
