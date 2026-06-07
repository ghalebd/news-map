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
  /* permission gate — the control console (full console) always permits;
     the presenter is limited by config.permissions. */
  const permits = id => { if (window.APP_ROLE === 'control') return true; const p = S.cfg().permissions; if (id === 'select') return true; if (!p.canDraw) return false; return p.tools[id] !== false; };

  let tool = 'select', selected = null, dragStart = null, ghost = null, sketchPts = null, qbtns = {}, markerIcon = null, dragEl = null, dragPrev = null, skipClick = false;
  /* translate every coordinate of an element by a lat/lng delta (move) */
  function moveEl(el, dLat, dLng) {
    if (el.ll) el.ll = [el.ll[0] + dLat, el.ll[1] + dLng];
    if (el.a) el.a = [el.a[0] + dLat, el.a[1] + dLng];
    if (el.b) el.b = [el.b[0] + dLat, el.b[1] + dLng];
    if (el.pts) el.pts = el.pts.map(p => [p[0] + dLat, p[1] + dLng]);
  }

  /* marker icon set (broadcast) — keyed; '' = plain dot */
  const mk = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const MICONS = {
    pin: mk('<path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/>'),
    flag: mk('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5" fill="currentColor"/>'),
    star: mk('<path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.9 6.7 19.5l1.1-6L3.4 9.3l6-.8Z" fill="currentColor"/>'),
    alert: mk('<path d="M12 3 2 20h20L12 3Z" fill="currentColor"/><path d="M12 10v4" stroke="#0a0e16"/><circle cx="12" cy="17" r="1" fill="#0a0e16" stroke="none"/>'),
    fire: mk('<path d="M12 3c1 3 4 4 4 8a4 4 0 1 1-8 0c0-1 .5-2 1-2.5C9 11 8 9 12 3Z" fill="currentColor"/>'),
    blast: mk('<path d="M12 2l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2Z" fill="currentColor"/>'),
    capital: mk('<circle cx="12" cy="12" r="8"/><path d="M12 8l1.6 3.2 3.4.4-2.5 2.3.7 3.3L12 15.7 8.8 17.2l.7-3.3L7 11.6l3.4-.4Z" fill="currentColor" stroke="none"/>'),
    airport: mk('<path d="M12 3c.7 0 1 .8 1 2v4.5l7 4v2l-7-2v4l2 1.5v1.5L12 19l-3 1.5V19l2-1.5v-4l-7 2v-2l7-4V5c0-1.2.3-2 1-2Z" fill="currentColor" stroke="none"/>'),
    port: mk('<path d="M12 5v14M12 5a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 5ZM6 11h12M6 11a6 6 0 0 0 12 0"/>'),
    target: mk('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  };
  const MICON_KEYS = ['', 'pin', 'flag', 'star', 'alert', 'fire', 'blast', 'capital', 'airport', 'port', 'target'];

  /* ---------------- render the active scene ---------------- */
  let lastScene = null, lastN = 0;
  function render() {
    drawn.clearLayers();
    const sc = S.activeScene(); if (!sc) { lastScene = null; lastN = 0; return; }
    const live = S.state.mode === 'live';
    const n = live ? S.revealedCount(sc) : sc.elements.length;
    // which elements are newly revealed -> animate them in
    let animFrom = -1;
    if (live) { if (sc.id === lastScene && n > lastN) animFrom = lastN; lastScene = sc.id; lastN = n; }
    else { lastScene = sc.id; lastN = n; }
    sc.elements.slice(0, n).forEach((el, i) => {
      const l = buildLayer(el); if (!l) return;
      l.__id = el.id; drawn.addLayer(l);
      if (el.desc && l.bindTooltip) l.bindTooltip(esc(el.desc), { direction: 'top', offset: [0, -10], className: 'trk-tip' });
      bindSelect(l, el);
      if (animFrom >= 0 && i >= animFrom) animateIn(l, el);
    });
    refreshCtx();
  }
  /* draw-on / fade-in animation for a revealed element */
  function animateIn(layer, el) {
    const ms = (S.state.broadcast && S.state.broadcast.anim && S.state.broadcast.anim.ms) || 700;
    const paths = []; const marks = [];
    const collect = lyr => { if (lyr._path) paths.push(lyr._path); if (lyr._icon) marks.push(lyr._icon); };
    if (layer.eachLayer) layer.eachLayer(collect); else collect(layer);
    paths.forEach(p => { try { const len = p.getTotalLength ? p.getTotalLength() : 0; if (len) { p.style.transition = 'none'; p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.getBoundingClientRect(); p.style.transition = `stroke-dashoffset ${ms}ms ease`; p.style.strokeDashoffset = 0; } } catch (e) {} });
    marks.forEach(m => { m.style.animation = `mkIn ${Math.min(500, ms)}ms var(--ease-out)`; });
  }
  const dw = () => (S.cfg().drawDefaults && S.cfg().drawDefaults.weight) || 3;
  function buildLayer(el) {
    const o = { color: el.color, weight: el.weight || dw(), opacity: 1 };
    switch (el.type) {
      case 'marker':  {
        if (el.icon && MICONS[el.icon]) { const html = `<span class="map-mk" style="color:${el.color}">${MICONS[el.icon]}</span>${el.label ? `<span class="map-mk__lbl" style="border-color:${el.color}">${esc(el.label)}</span>` : ''}`; return L.marker(el.ll, { icon: L.divIcon({ className: 'map-mkw', html, iconSize: [30, 30], iconAnchor: [15, 15] }) }); }
        if (el.label) return L.marker(el.ll, { icon: L.divIcon({ className: 'map-mkw', html: `<span class="map-mk__dot" style="background:${el.color}"></span><span class="map-mk__lbl" style="border-color:${el.color}">${esc(el.label)}</span>`, iconSize: [14, 14], iconAnchor: [7, 7] }) });
        return L.circleMarker(el.ll, { radius: 7, color: '#fff', weight: 2, fillColor: el.color, fillOpacity: 1 });
      }
      case 'circle':  return L.circle(el.ll, { radius: el.radius, ...o, fillColor: el.color, fillOpacity: 0.12 });
      case 'ring':    { const g = L.layerGroup(); g.addLayer(L.circle(el.ll, { radius: el.radius, ...o, fill: false, dashArray: '6 5' })); g.addLayer(L.marker(el.ll, { icon: labelIcon((el.radius / 1000).toFixed(0) + ' KM', el.color) })); return g; }
      case 'arrow':   return arrowLine(L.latLng(el.a), L.latLng(el.b), o);
      case 'curve':   return curveLine(L.latLng(el.a), L.latLng(el.b), o);
      case 'polygon': return L.polygon(el.pts, { ...o, fillColor: el.color, fillOpacity: 0.12 });
      case 'sketch':  return L.polyline(el.pts, o);
      case 'measure': { const g = L.layerGroup(); g.addLayer(L.polyline([el.a, el.b], { ...o, dashArray: '4 4' })); g.addLayer(L.marker(el.b, { icon: labelIcon(fmtDist(map.distance(L.latLng(el.a), L.latLng(el.b))), el.color) })); return g; }
      case 'text':    return L.marker(el.ll, { icon: labelIcon(el.text, el.color) });
      case 'asset':   { const w = el.w || 54, rot = el.rot || 0; return L.marker(el.ll, { icon: L.divIcon({ className: 'map-asset', html: `<img class="asset-img" src="${el.src}" style="width:${w}px;height:auto;transform:rotate(${rot}deg)">${el.name ? `<span>${esc(el.name)}</span>` : ''}`, iconSize: [w, w], iconAnchor: [w / 2, w / 2] }) }); }
      case 'frontline': return frontLine(L.latLng(el.a), L.latLng(el.b), { color: el.color });
      case 'country': { const lyr = L.geoJSON({ type: 'Feature', geometry: el.geom }, { style: { color: el.color, weight: 2, fillColor: el.color, fillOpacity: 0.32 } }); if (el.name) lyr.bindTooltip(el.name, { sticky: true, className: 'trk-tip' }); return lyr; }
    }
    return null;
  }
  function frontLine(a, b, o) {
    const g = L.layerGroup();
    g.addLayer(L.polyline([a, b], { color: o.color, weight: 4, opacity: 1 }));
    const steps = 9, d = map.distance(a, b) * 0.045, ang = Math.atan2(b.lat - a.lat, b.lng - a.lng) + Math.PI / 2;
    for (let i = 0; i < steps; i++) { const t = (i + 0.5) / steps, lat = a.lat + (b.lat - a.lat) * t, lng = a.lng + (b.lng - a.lng) * t; const tl = lat + Math.sin(ang) * d / 111000, tg = lng + Math.cos(ang) * d / (111000 * Math.cos(lat * Math.PI / 180) || 1); g.addLayer(L.polyline([[lat, lng], [tl, tg]], { color: o.color, weight: 3, opacity: 1 })); }
    return g;
  }
  /* point-in-polygon (ray casting) for country highlight */
  function pir(p, ring) { let x = p[0], y = p[1], inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
  function pip(p, poly) { if (!pir(p, poly[0])) return false; for (let i = 1; i < poly.length; i++) if (pir(p, poly[i])) return false; return true; }
  function countryAt(lng, lat) { for (const c of (window.COUNTRIES || [])) { const g = c.g; if (g.type === 'Polygon') { if (pip([lng, lat], g.coordinates)) return c; } else if (g.type === 'MultiPolygon') { for (const poly of g.coordinates) if (pip([lng, lat], poly)) return c; } } return null; }
  function arrowLine(a, b, o) { const g = L.layerGroup(); g.addLayer(L.polyline([a, b], o)); const ang = Math.atan2(b.lat - a.lat, b.lng - a.lng); const d = map.distance(a, b) * 0.18; const head = w => L.latLng(b.lat + Math.sin(w) * d / 111000, b.lng + Math.cos(w) * d / 111000); g.addLayer(L.polyline([head(ang + 2.6), b, head(ang - 2.6)], o)); return g; }
  function curveLine(a, b, o) { const mid = L.latLng((a.lat + b.lat) / 2 + (b.lng - a.lng) * 0.2, (a.lng + b.lng) / 2 - (b.lat - a.lat) * 0.2); const p = []; for (let t = 0; t <= 1; t += 0.05) p.push([(1 - t) ** 2 * a.lat + 2 * (1 - t) * t * mid.lat + t * t * b.lat, (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * mid.lng + t * t * b.lng]); return L.polyline(p, o); }

  function bindSelect(layer, el) {
    const wire = lyr => lyr && lyr.on && lyr.on('mousedown', ev => {
      if (tool !== 'select' && tool !== 'erase') return;
      L.DomEvent.stopPropagation(ev);
      skipClick = true;   // swallow the map 'click' that follows so we don't deselect
      if (tool === 'erase') { S.removeElement(el.id); return; }
      selectEl(el);
      dragEl = el; dragPrev = ev.latlng; map.dragging.disable();   // begin move
    });
    if (layer.eachLayer) layer.eachLayer(wire); else wire(layer);
  }

  /* ---------------- tools ---------------- */
  const DRAG = ['arrow', 'curve', 'circle', 'ring', 'polygon', 'sketch', 'measure', 'frontline'];
  function setTool(t) { tool = t; if (t !== 'asset') assetPending = null; deselect(); closePalette(); map.getContainer().style.cursor = t === 'select' ? '' : 'crosshair'; armChip(); Object.keys(qbtns).forEach(id => qbtns[id].classList.toggle('is-on', id === t)); }

  map.on('mousedown', e => { if (!DRAG.includes(tool)) return; dragStart = e.latlng; map.dragging.disable(); sketchPts = tool === 'sketch' ? [[e.latlng.lat, e.latlng.lng]] : null; });
  map.on('mousemove', e => {
    if (dragEl) { moveEl(dragEl, e.latlng.lat - dragPrev.lat, e.latlng.lng - dragPrev.lng); dragPrev = e.latlng; render(); return; }
    if (!dragStart) return; if (tool === 'sketch') sketchPts.push([e.latlng.lat, e.latlng.lng]); if (ghost) drawn.removeLayer(ghost); ghost = preview(tool, dragStart, e.latlng); if (ghost) drawn.addLayer(ghost);
  });
  map.on('mouseup', e => {
    if (dragEl) { const patch = {}; ['ll', 'a', 'b', 'pts'].forEach(k => { if (dragEl[k] != null) patch[k] = dragEl[k]; }); if (Object.keys(patch).length) S.updateElement(dragEl.id, patch); dragEl = null; dragPrev = null; map.dragging.enable(); return; }
    if (!dragStart) return; if (ghost) { drawn.removeLayer(ghost); ghost = null; } commit(tool, dragStart, e.latlng); dragStart = null; sketchPts = null; map.dragging.enable();
  });
  map.on('click', e => {
    if (skipClick) { skipClick = false; return; }   // came from selecting/erasing an element
    if (tool === 'marker') S.addElement({ type: 'marker', ll: [e.latlng.lat, e.latlng.lng], color: S.state.color, icon: markerIcon || undefined });
    else if (tool === 'text') { const ll = [e.latlng.lat, e.latlng.lng]; if (window.UI) UI.input({ title: 'Label text', placeholder: 'Type a label…' }).then(t => { if (t && t.trim()) S.addElement({ type: 'text', ll, text: t.trim(), color: S.state.color }); }); else { const t = prompt('Label text:'); if (t) S.addElement({ type: 'text', ll, text: t, color: S.state.color }); } }
    else if (tool === 'asset' && assetPending) S.addElement({ type: 'asset', ll: [e.latlng.lat, e.latlng.lng], src: assetPending.url, name: assetPending.name || '', w: 54 });
    else if (tool === 'country') { const c = countryAt(e.latlng.lng, e.latlng.lat); if (c) S.addElement({ type: 'country', name: c.n, geom: c.g, color: S.state.color }); else window.UI && UI.toast('No country here'); }
    else if (tool === 'select') deselect();
  });
  function preview(t, a, b) {
    const o = { color: S.state.color, weight: dw(), opacity: 0.6 };
    if (t === 'circle') return L.circle(a, { radius: map.distance(a, b), ...o, fillOpacity: 0.08 });
    if (t === 'ring') { const g = L.layerGroup(); g.addLayer(L.circle(a, { radius: map.distance(a, b), ...o, fill: false, dashArray: '6 5' })); g.addLayer(L.marker(a, { icon: labelIcon((map.distance(a, b) / 1000).toFixed(0) + ' KM', S.state.color) })); return g; }
    if (t === 'arrow') return arrowLine(a, b, o);
    if (t === 'frontline') return frontLine(a, b, o);
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
    else if (t === 'frontline') S.addElement({ type: 'frontline', a: A, b: B, color: c });
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
    if (el.type === 'marker') {
      ctx.appendChild(ctxBtn(I.text, 'Edit label', () => { window.UI && UI.input({ title: 'Marker label', value: el.label || '', placeholder: 'Label (optional)' }).then(v => { if (v != null) { const lab = v.trim() || undefined; S.updateElement(el.id, { label: lab }); el.label = lab; } }); }));
      ctx.appendChild(ctxBtn(I.layers, 'Description', () => { window.UI && UI.input({ title: 'Marker description', value: el.desc || '', placeholder: 'Tooltip text', multiline: true }).then(v => { if (v != null) { const d = v.trim() || undefined; S.updateElement(el.id, { desc: d }); el.desc = d; } }); }));
    }
    if (el.type === 'asset') {
      ctx.appendChild(ctxBtn(I.minus, 'Smaller', () => { const w = Math.max(24, (el.w || 54) - 10); S.updateElement(el.id, { w }); el.w = w; }));
      ctx.appendChild(ctxBtn(I.plus, 'Larger', () => { const w = Math.min(220, (el.w || 54) + 10); S.updateElement(el.id, { w }); el.w = w; }));
      const ROT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v5h-5"/></svg>';
      ctx.appendChild(ctxBtn(ROT, 'Rotate', () => { const r = ((el.rot || 0) + 15) % 360; S.updateElement(el.id, { rot: r }); el.rot = r; }));
    }
    ctx.appendChild(ctxBtn(I.layers, 'Duplicate', () => { const copy = JSON.parse(JSON.stringify(el)); delete copy.id; S.addElement(copy); }));
    ctx.appendChild(ctxBtn(I.close, 'Delete', () => { S.removeElement(el.id); deselect(); }));
    ctx.hidden = false; positionCtx(el);
  }
  function ctxBtn(icon, title, fn) { const b = h('button', 'ctxbar__btn', icon); b.title = title; b.onclick = fn; return b; }
  function positionCtx(el) { const a = elAnchor(el); if (!a) return; const p = map.latLngToContainerPoint(L.latLng(a[0], a[1])); ctx.style.left = Math.max(10, Math.min(p.x - ctx.offsetWidth / 2, innerWidth - ctx.offsetWidth - 10)) + 'px'; ctx.style.top = Math.max(60, p.y - ctx.offsetHeight - 14) + 'px'; }
  function refreshCtx() { if (selected && !S.activeScene().elements.find(e => e.id === selected.id)) deselect(); else if (selected) positionCtx(selected); }
  map.on('move zoom', () => { if (selected) positionCtx(selected); });

  /* ---------------- asset library (image placement) ---------------- */
  let assetPending = null;
  const apal = h('div', 'qa qa--assets'); apal.hidden = true; document.body.appendChild(apal);
  function buildPalette() {
    apal.innerHTML = '';
    apal.appendChild(h('div', 'qa__title', 'PLACE IMAGE'));
    const assets = S.cfg().customAssets || [];
    if (!assets.length) { apal.appendChild(h('div', 'qa-asset__empty', 'No images yet. Add them from the Control Panel — Assets section.')); return; }
    const cats = (S.cfg().assetCats || []).concat(['(uncategorised)']);
    cats.forEach(cat => {
      const items = assets.filter(a => (a.cat || '(uncategorised)') === cat);
      if (!items.length) return;
      apal.appendChild(h('div', 'qa-asset__cat', cat));
      const grid = h('div', 'qa-asset__grid');
      items.forEach(a => { const b = h('button', 'qa-asset__item' + (assetPending && assetPending.id === a.id ? ' is-on' : ''), `<img src="${a.url}" alt=""><span>${esc(a.name || '')}</span>`); b.title = a.name || ''; b.onclick = () => { assetPending = a; setTool('asset'); }; grid.appendChild(b); });
      apal.appendChild(grid);
    });
  }
  function openPalette() { buildPalette(); apal.hidden = false; }
  function closePalette() { apal.hidden = true; }
  function togglePalette() { apal.hidden ? openPalette() : closePalette(); }
  document.addEventListener('click', e => { if (!apal.hidden && !apal.contains(e.target) && !e.target.closest('.qtool,.qa__tool')) closePalette(); });

  /* ---------------- quick-add launcher (+ FAB) + menu + arm chip ---------------- */
  const TOOLS = [
    ['marker', I.marker, 'Marker'], ['text', I.text, 'Label'], ['arrow', I.arrow, 'Arrow'], ['curve', I.curve, 'Curved arrow'],
    ['ring', I.target, 'Range ring'], ['circle', I.circle, 'Circle'], ['polygon', I.polygon, 'Area'], ['sketch', I.sketch, 'Freehand'],
    ['frontline', I.frontline, 'Front line'], ['country', I.country, 'Highlight country'],
    ['measure', I.ruler, 'Measure'], ['asset', I.asset, 'Image'], ['erase', I.erase, 'Erase'],
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
    TOOLS.filter(([id]) => permits(id)).forEach(([id, icon, label]) => { const b = h('button', 'qa__tool', `${icon}<span>${label}</span>`); b.onclick = e => { closeMenu(); if (id === 'asset') { e.stopPropagation(); openPalette(); } else setTool(id); }; grid.appendChild(b); });
    menu.append(h('div', 'qa__title', 'ADD'), cRow, grid);
    if (permits('marker')) {
      const iconRow = h('div', 'qa__icons');
      MICON_KEYS.forEach(k => { const b = h('button', 'qa__icon' + ((markerIcon || '') === k ? ' is-on' : ''), k ? MICONS[k] : '<span class="qa__dot"></span>'); b.title = k || 'Dot'; b.onclick = () => { markerIcon = k || null; setTool('marker'); closeMenu(); }; iconRow.appendChild(b); });
      menu.append(h('div', 'qa__sub', 'MARKER ICON'), iconRow);
    }
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
    ['asset', I.asset, 'Image'],
    ['erase', I.erase, 'Erase'],
  ];
  const qbar = h('div', 'qtools');
  QTOOLS.forEach(([id, icon, title]) => { const b = h('button', 'qtool' + (id === 'select' ? ' is-on' : ''), icon); b.title = title; b.dataset.qid = id; b.onclick = e => { if (id === 'asset') { e.stopPropagation(); togglePalette(); } else setTool(id); }; qbar.appendChild(b); qbtns[id] = b; });
  qbar.appendChild(h('div', 'qtools__sep'));
  // colour button + popover
  const qcolor = h('button', 'qtool qtool--color', '<span class="qtool__dot"></span>'); qcolor.title = 'Colour'; qcolor.dataset.qid = 'color';
  const setDot = () => qcolor.querySelector('.qtool__dot').style.background = S.state.color;
  setDot();
  const qpop = h('div', 'qtools-pop'); qpop.hidden = true;
  ['#ff453a', '#ff9f0a', '#ffd60a', '#36ff9e', '#38e6ff', '#0a84ff', '#bf5af2', '#ffffff'].forEach(c => { const s = h('button', 'qtools-pop__sw'); s.style.background = c; s.onclick = () => { S.setColor(c); setDot(); qpop.hidden = true; }; qpop.appendChild(s); });
  qcolor.onclick = e => { e.stopPropagation(); qpop.hidden = !qpop.hidden; };
  document.addEventListener('click', e => { if (e.target !== qcolor && !qpop.contains(e.target)) qpop.hidden = true; });
  qbar.append(qcolor, qpop);
  // undo
  const qundo = h('button', 'qtool', I.undo); qundo.title = 'Undo'; qundo.dataset.qid = 'undo'; qundo.onclick = () => S.undo(); qbar.appendChild(qundo);
  document.body.appendChild(qbar);

  /* hide presenter toolbar buttons the operator has disallowed (no-op for the control console) */
  function applyPerms() {
    Object.keys(qbtns).forEach(id => { qbtns[id].hidden = !permits(id); });
    const noDraw = window.APP_ROLE !== 'control' && !S.cfg().permissions.canDraw;
    qcolor.hidden = noDraw; qundo.hidden = noDraw;
    if (noDraw && tool !== 'select') setTool('select');
  }

  return { render, setTool, openMenu, closeMenu, toggleMenu, openPalette, closePalette, togglePalette, deselect, applyPerms, get tool() { return tool; } };
})();
window.Draw = Draw;
