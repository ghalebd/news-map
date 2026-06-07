/* ============================================================
   DRAW — per-scene elements: render, draw interactions, and the
   CONTEXTUAL tools (quick-add launcher + selection context-bar).
   No fixed toolbar — tools are summoned and dismissed.
   ============================================================ */
const Draw = (() => {
  const map = GameMap.map, drawn = GameMap.drawn, S = Store, I = ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const fmtDist = m => m > 1000 ? (m / 1000).toFixed(1) + ' KM' : Math.round(m) + ' M';
  const labelIcon = (txt, color) => L.divIcon({ className: 'map-label', html: `<span style="border-color:${color}">${esc(txt)}</span>`, iconAnchor: [0, 8] });
  /* permission gate — the control console (full console) always permits;
     the presenter is limited by config.permissions. */
  const permits = id => { if (window.APP_ROLE === 'control') return true; const p = S.cfg().permissions; if (id === 'select') return true; if (!p.canDraw) return false; return p.tools[id] !== false; };

  let tool = 'select', selected = null, selLayer = null, dragStart = null, ghost = null, sketchPts = null, polyPts = null, qbtns = {}, markerIcon = null, dragEl = null, dragPrev = null, skipClick = false;
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
    // --- animated targeting / live markers ---
    pulse:  mk('<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/><circle class="mkfx-ping" cx="12" cy="12" r="5"/><circle class="mkfx-ping mkfx-ping-b" cx="12" cy="12" r="5"/>'),
    radar:  mk('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><g class="mkfx-spin"><path d="M12 12 12 3"/><path d="M12 3a9 9 0 0 1 7.8 4.5L12 12Z" fill="currentColor" stroke="none" opacity=".22"/></g>'),
    reticle: mk('<g class="mkfx-spin-slow"><circle cx="12" cy="12" r="9" stroke-dasharray="4 4"/></g><line x1="12" y1="1" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="1" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="23" y2="12"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>'),
    blink:  mk('<circle class="mkfx-blink" cx="12" cy="12" r="5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9" opacity=".4"/>'),
    locked: mk('<g class="mkfx-pulse"><path d="M4 8V4h4"/><path d="M20 8V4h-4"/><path d="M4 16v4h4"/><path d="M20 16v4h-4"/></g><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>'),
    spinner: mk('<g class="mkfx-spin"><circle cx="12" cy="12" r="8" stroke-dasharray="3 5"/></g><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>'),
  };
  const MICON_KEYS = ['', 'pin', 'flag', 'star', 'alert', 'fire', 'blast', 'capital', 'airport', 'port', 'target', 'pulse', 'radar', 'reticle', 'blink', 'locked', 'spinner'];

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
    const paths = []; const fades = []; const marks = [];
    const collect = lyr => {
      if (lyr._path) { const cl = lyr._path.getAttribute('class') || ''; const dashed = lyr._path.getAttribute('stroke-dasharray'); if (/el-flow|el-ring|el-head/.test(cl) || dashed) fades.push(lyr._path); else paths.push(lyr._path); }
      if (lyr._icon) marks.push(lyr._icon);
    };
    if (layer.eachLayer) layer.eachLayer(collect); else collect(layer);
    paths.forEach(p => { try { const len = p.getTotalLength ? p.getTotalLength() : 0; if (len) { p.style.transition = 'none'; p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.getBoundingClientRect(); p.style.transition = `stroke-dashoffset ${ms}ms ease`; p.style.strokeDashoffset = 0; } } catch (e) {} });
    fades.forEach(p => { p.style.animation = `mkIn ${Math.min(500, ms)}ms var(--ease-out)`; });
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
      case 'circle':  return L.circle(el.ll, { radius: el.radius, ...o, fillColor: el.color, fillOpacity: 0.12, className: 'el-pulse' });
      case 'ring':    { const g = L.layerGroup(); g.addLayer(L.circle(el.ll, { radius: el.radius, ...o, fill: false, dashArray: '6 5', className: 'el-ring' })); g.addLayer(L.marker(el.ll, { icon: labelIcon((el.radius / 1000).toFixed(0) + ' KM', el.color) })); return g; }
      case 'arrow':   return arrowLine(L.latLng(el.a), L.latLng(el.b), o);
      case 'curve':   return curveLine(L.latLng(el.a), L.latLng(el.b), o);
      case 'tarrow':  return tarrowLine(el.pts, o);
      case 'polygon': return L.polygon(el.pts, { ...o, fillColor: el.color, fillOpacity: 0.12 });
      case 'sketch':  return L.polyline(el.pts, o);
      case 'measure': { const g = L.layerGroup(); g.addLayer(L.polyline([el.a, el.b], { ...o, dashArray: '4 4' })); g.addLayer(L.marker(el.b, { icon: labelIcon(fmtDist(map.distance(L.latLng(el.a), L.latLng(el.b))), el.color) })); return g; }
      case 'text':    return L.marker(el.ll, { icon: labelIcon(el.text, el.color) });
      case 'asset':   { const w = el.w || 54, rot = el.rot || 0; return L.marker(el.ll, { icon: L.divIcon({ className: 'map-asset', html: `<img class="asset-img" src="${esc(el.src)}" style="width:${w}px;height:auto;transform:rotate(${rot}deg)">${el.name ? `<span>${esc(el.name)}</span>` : ''}`, iconSize: [w, w], iconAnchor: [w / 2, w / 2] }) }); }
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
  /* filled triangular arrowhead at b, pointing along a→b, sized in screen pixels (consistent regardless of length) */
  function pxHead(a, b, o) {
    const pa = map.latLngToContainerPoint(a), pb = map.latLngToContainerPoint(b);
    const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x), len = 15, half = 7;
    const back = { x: pb.x - Math.cos(ang) * len, y: pb.y - Math.sin(ang) * len }, nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    const toLL = p => map.containerPointToLatLng(p);
    return L.polygon([toLL(pb), toLL({ x: back.x + nx * half, y: back.y + ny * half }), toLL({ x: back.x - nx * half, y: back.y - ny * half })],
      { color: o.color, weight: 1, opacity: o.opacity != null ? o.opacity : 1, fillColor: o.color, fillOpacity: o.opacity != null ? o.opacity : 1, className: 'el-head' });
  }
  function flowOpts(o) { return { color: o.color, weight: o.weight || dw(), opacity: o.opacity != null ? o.opacity : 1, dashArray: '2 12', lineCap: 'round', className: 'el-flow' }; }
  function arrowLine(a, b, o) { const g = L.layerGroup(); g.addLayer(L.polyline([a, b], o)); g.addLayer(L.polyline([a, b], flowOpts(o))); g.addLayer(pxHead(a, b, o)); return g; }
  function curvePts(a, b) { const mid = L.latLng((a.lat + b.lat) / 2 + (b.lng - a.lng) * 0.2, (a.lng + b.lng) / 2 - (b.lat - a.lat) * 0.2); const p = []; for (let t = 0; t <= 1.0001; t += 0.05) p.push([(1 - t) ** 2 * a.lat + 2 * (1 - t) * t * mid.lat + t * t * b.lat, (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * mid.lng + t * t * b.lng]); return p; }
  function curveLine(a, b, o) { const p = curvePts(a, b), g = L.layerGroup(); g.addLayer(L.polyline(p, o)); g.addLayer(L.polyline(p, flowOpts(o))); const n = p.length; g.addLayer(pxHead(L.latLng(p[n - 2][0], p[n - 2][1]), L.latLng(p[n - 1][0], p[n - 1][1]), o)); return g; }
  function tarrowLine(pts, o) { if (!pts || pts.length < 2) return L.layerGroup(); const g = L.layerGroup(); g.addLayer(L.polyline(pts, o)); g.addLayer(L.polyline(pts, flowOpts(o))); const n = pts.length; g.addLayer(pxHead(L.latLng(pts[n - 2][0], pts[n - 2][1]), L.latLng(pts[n - 1][0], pts[n - 1][1]), o)); return g; }

  function bindSelect(layer, el) {
    const wire = lyr => lyr && lyr.on && lyr.on('mousedown', ev => {
      if (tool !== 'select' && tool !== 'erase') return;
      L.DomEvent.stopPropagation(ev);
      skipClick = true;   // swallow the map 'click' that follows so we don't deselect
      if (tool === 'erase') { S.removeElement(el.id); return; }
      selectEl(el, layer);
      dragEl = el; dragPrev = ev.latlng; map.dragging.disable();   // begin move
    });
    if (layer.eachLayer) layer.eachLayer(wire); else wire(layer);
  }
  function findLayer(id) { let r = null; drawn.eachLayer(l => { if (l.__id === id) r = l; }); return r; }
  function highlight(layer, on) { if (!layer) return; const f = lyr => { if (lyr._path) lyr._path.classList.toggle('el-sel', on); if (lyr._icon) lyr._icon.classList.toggle('mk-sel', on); }; if (layer.eachLayer) layer.eachLayer(f); else f(layer); }

  /* ---------------- tools ---------------- */
  const DRAG = ['arrow', 'curve', 'circle', 'ring', 'polygon', 'sketch', 'measure', 'frontline'];
  function setTool(t) {
    const prev = tool; tool = t;
    if (prev === 'tarrow' && t !== 'tarrow') cancelPoly();
    if (t === 'tarrow') { polyPts = []; if (map.doubleClickZoom) map.doubleClickZoom.disable(); }
    else if (map.doubleClickZoom) map.doubleClickZoom.enable();
    if (t !== 'asset') assetPending = null; deselect(); closePalette(); map.getContainer().style.cursor = t === 'select' ? '' : 'crosshair'; armChip(); Object.keys(qbtns).forEach(id => qbtns[id].classList.toggle('is-on', id === t));
  }
  /* multi-point zigzag-arrow drawing */
  function drawPolyGhost(cur) { if (ghost) { drawn.removeLayer(ghost); ghost = null; } const pts = (polyPts || []).concat(cur ? [[cur.lat, cur.lng]] : []); if (pts.length >= 2) { ghost = tarrowLine(pts, { color: S.state.color, weight: dw(), opacity: 0.7 }); drawn.addLayer(ghost); } }
  function finishPoly() { if (ghost) { drawn.removeLayer(ghost); ghost = null; } const pts = (polyPts || []).filter((p, i, a) => i === 0 || map.distance(L.latLng(p[0], p[1]), L.latLng(a[i - 1][0], a[i - 1][1])) > 2); if (pts.length >= 2) S.addElement({ type: 'tarrow', pts, color: S.state.color }); polyPts = []; }
  function cancelPoly() { if (ghost) { drawn.removeLayer(ghost); ghost = null; } polyPts = []; }

  map.on('mousedown', e => { if (!DRAG.includes(tool)) return; dragStart = e.latlng; map.dragging.disable(); sketchPts = tool === 'sketch' ? [[e.latlng.lat, e.latlng.lng]] : null; });
  map.on('mousemove', e => {
    if (dragEl) { moveEl(dragEl, e.latlng.lat - dragPrev.lat, e.latlng.lng - dragPrev.lng); dragPrev = e.latlng; render(); return; }
    if (tool === 'tarrow' && polyPts && polyPts.length) { drawPolyGhost(e.latlng); return; }
    if (!dragStart) return; if (tool === 'sketch') sketchPts.push([e.latlng.lat, e.latlng.lng]); if (ghost) drawn.removeLayer(ghost); ghost = preview(tool, dragStart, e.latlng); if (ghost) drawn.addLayer(ghost);
  });
  map.on('dblclick', e => { if (tool === 'tarrow') { if (e.originalEvent) L.DomEvent.stop(e.originalEvent); finishPoly(); } });
  map.on('mouseup', e => {
    if (dragEl) { const patch = {}; ['ll', 'a', 'b', 'pts'].forEach(k => { if (dragEl[k] != null) patch[k] = dragEl[k]; }); if (Object.keys(patch).length) S.updateElement(dragEl.id, patch); dragEl = null; dragPrev = null; map.dragging.enable(); return; }
    if (!dragStart) return; if (ghost) { drawn.removeLayer(ghost); ghost = null; } commit(tool, dragStart, e.latlng); dragStart = null; sketchPts = null; map.dragging.enable();
  });
  map.on('click', e => {
    if (skipClick) { skipClick = false; return; }   // came from selecting/erasing an element
    if (tool === 'tarrow') { polyPts.push([e.latlng.lat, e.latlng.lng]); drawPolyGhost(e.latlng); return; }
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
  function selectEl(el, layer) { if (selLayer) highlight(selLayer, false); selected = el; selLayer = layer || findLayer(el.id); highlight(selLayer, true); buildCtx(el); }
  function deselect() { if (selLayer) highlight(selLayer, false); selLayer = null; selected = null; ctx.hidden = true; }
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
  function refreshCtx() { if (!selected) return; const fresh = S.activeScene().elements.find(e => e.id === selected.id); if (!fresh) { deselect(); return; } selected = fresh; selLayer = findLayer(selected.id); highlight(selLayer, true); positionCtx(selected); }
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
    ['marker', I.marker, 'Marker'], ['text', I.text, 'Label'], ['arrow', I.arrow, 'Arrow'], ['tarrow', I.arrowZig, 'Zigzag arrow'], ['curve', I.curve, 'Curved arrow'],
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
  // Full button library — every tool can be shown/reordered in the bar (extras hidden by default via config.qbar)
  const QTOOLS = [
    ['select', I.pan, 'Select / Pan'],
    ['arrow', I.arrow, 'Arrow'],
    ['tarrow', I.arrowZig, 'Zigzag arrow'],
    ['curve', I.curve, 'Curved arrow'],
    ['marker', I.marker, 'Marker'],
    ['ring', I.target, 'Range ring'],
    ['circle', I.circle, 'Circle'],
    ['polygon', I.polygon, 'Area'],
    ['sketch', I.sketch, 'Freehand'],
    ['frontline', I.frontline, 'Front line'],
    ['country', I.country, 'Highlight country'],
    ['text', I.text, 'Label'],
    ['measure', I.ruler, 'Measure'],
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
  const qpop = h('div', 'qtools-pop lbar-pop'); qpop.hidden = true;
  ['#ff453a', '#ff9f0a', '#ffd60a', '#36ff9e', '#38e6ff', '#0a84ff', '#bf5af2', '#ffffff'].forEach(c => { const s = h('button', 'qtools-pop__sw'); s.style.background = c; s.onclick = () => { S.setColor(c); setDot(); qpop.hidden = true; }; qpop.appendChild(s); });
  qcolor.onclick = e => { e.stopPropagation(); window.LBar ? LBar.toggle(qcolor, qpop) : (qpop.hidden = !qpop.hidden); };
  document.addEventListener('click', e => { if (e.target !== qcolor && !qcolor.contains(e.target) && !qpop.contains(e.target)) qpop.hidden = true; });
  qbar.appendChild(qcolor); document.body.appendChild(qpop);
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
