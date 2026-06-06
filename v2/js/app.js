/* ============================================================
   APP — builds the UI, boots the map, wires tools + dock.
   ============================================================ */
(() => {
  const KEY = 'tnFJbEP9ELhQqkA6rPY2';
  const I = window.ICONS, D = window.Dock;
  const $ = (sel, r = document) => r.querySelector(sel);
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const btn = (icon, title, attrs = {}) => { const b = h('button', 'btn', icon); b.title = title; Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v)); return b; };

  /* ---------------- map ---------------- */
  const STYLES = [
    { id: 'satellite',     name: 'Satellite', icon: I.layers },
    { id: 'hybrid',        name: 'Hybrid',    icon: I.country },
    { id: 'dataviz-dark',  name: 'Dark',      icon: I.layers },
    { id: 'streets-v2',    name: 'Streets',   icon: I.country },
    { id: 'topo-v2',       name: 'Topo',      icon: I.polygon },
    { id: 'ocean',         name: 'Marine',    icon: I.ship },
  ];
  const tileURL = id => `https://api.maptiler.com/maps/${id}/{z}/{x}/{y}.png?key=${KEY}`;
  const map = L.map('map', { zoomControl: false, attributionControl: false, zoomSnap: 0.25 }).setView([29.5, 45], 5);
  const baseLayer = L.tileLayer(tileURL('satellite'), { maxZoom: 20, tileSize: 256 }).addTo(map);
  L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution('© MapTiler © OpenStreetMap').addTo(map);
  function setStyle(id) { baseLayer.setUrl(tileURL(id)); }   // swap tiles in place — no layer churn

  /* ---------------- state ---------------- */
  const state = { tool: 'pan', color: '#ff3b30', drawn: L.layerGroup().addTo(map) };
  const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#30d158', '#00d4ee', '#0a84ff', '#bf5af2', '#ffffff'];

  /* ---------------- HUD overlay (grid · scanlines · viewport brackets) ---------------- */
  ['hud-grid', 'hud-scan', 'hud-frame'].forEach(c => document.body.appendChild(h('div', c)));

  /* ---------------- brand + status ---------------- */
  const brand = h('div', 'brand', `<img src="../live_assets/aljazeera_logo.png" alt="Al Jazeera" onerror="this.style.display='none'">`);
  const status = h('div', 'status'); document.body.append(brand, status);
  const updateStatus = () => { const c = map.getCenter(); status.innerHTML = `${I.marker.replace('width="2"','width="1.6"')}<span>${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}</span> · <b>Z${map.getZoom().toFixed(1)}</b>`; };
  map.on('move zoom', updateStatus); updateStatus();

  /* ---------------- left toolbar ---------------- */
  const toolbar = h('div', 'toolbar');
  toolbar.append(grip('toolbar__grip'));
  const TOOLS = [
    ['pan', I.pan, 'Pan (V)'], ['marker', I.marker, 'Pin (M)'], ['asset', I.asset, 'Asset (U)'],
    ['arrow', I.arrow, 'Arrow (A)'], ['curve', I.curve, 'Curved arrow (B)'], ['circle', I.circle, 'Range circle (C)'],
    ['polygon', I.polygon, 'Area (P)'], ['sketch', I.sketch, 'Freehand (F)'], ['text', I.text, 'Label (L)'],
    ['ruler', I.ruler, 'Measure (R)'], ['erase', I.erase, 'Erase (E)'],
  ];
  TOOLS.forEach(([id, icon, title]) => { const b = btn(icon, title, { 'data-tool': id }); b.addEventListener('click', () => setTool(id)); toolbar.appendChild(b); });
  toolbar.appendChild(h('div', 'toolbar__sep'));
  const studioBtn = btn(I.sliders, 'Studio Tools'); toolbar.appendChild(studioBtn);
  const colorBtn = btn(I.color, 'Drawing colour'); colorBtn.style.color = state.color; toolbar.appendChild(colorBtn);
  toolbar.appendChild(h('div', 'toolbar__sep'));
  const zin = btn(I.zoomIn, 'Zoom in'); zin.onclick = () => map.zoomIn();
  const zout = btn(I.zoomOut, 'Zoom out'); zout.onclick = () => map.zoomOut();
  const ctr = btn(I.center, 'Centre / reset'); ctr.onclick = () => map.flyTo([29.5, 45], 5, { duration: 0.6 });
  toolbar.append(zin, zout, ctr);
  document.body.appendChild(toolbar);
  D.register(toolbar, { mode: 'y', home: 'left', x: 8, gripSel: '.toolbar__grip' });

  function setTool(id) {
    state.tool = id;
    toolbar.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.tool === id));
    map.getContainer().style.cursor = id === 'pan' ? '' : 'crosshair';
    if (id === 'asset') openMenu(assetPanel); else D.close(assetPanel);
    if (id !== 'asset') { /* keep */ }
  }

  /* ---------------- right rail: Map Style ---------------- */
  const rail = h('div', 'rail');
  rail.appendChild(grip('rail__grip'));
  const styleCard = card('Map Style', I.layers, () => {
    const g = h('div', 'grid');
    STYLES.forEach((st, i) => { const b = h('button', 'grid__btn' + (i === 0 ? ' is-active' : ''), `${st.icon}<span>${st.name}</span>`);
      b.onclick = () => { g.querySelectorAll('.grid__btn').forEach(x => x.classList.remove('is-active')); b.classList.add('is-active'); setStyle(st.id); }; g.appendChild(b); });
    return g;
  });
  rail.appendChild(styleCard);
  document.body.appendChild(rail);
  D.register(rail, { mode: 'y', home: 'right', gripSel: '.rail__grip' });

  /* ---------------- studio panel (left flyout, toolbar-triggered) ---------------- */
  const studio = panel('STUDIO TOOLS', studioBody());
  studio.dataset.menu = '1';
  document.body.appendChild(studio);
  D.register(studio, { mode: 'y', home: 'left', menu: true, accordion: 'left', trigger: studioBtn, startClosed: true,
    gripSel: '.panel__head', closeSel: '.panel__close', icon: I.sliders });
  studioBtn.addEventListener('click', () => D.toggle(studio));

  /* ---------------- colour popover ---------------- */
  const colorPop = h('div', 'panel'); colorPop.dataset.menu = '1';
  const sw = h('div', 'swatches');
  COLORS.forEach((c, i) => { const s = h('div', 'swatch' + (i === 0 ? ' is-active' : '')); s.style.background = c;
    s.onclick = () => { sw.querySelectorAll('.swatch').forEach(x => x.classList.remove('is-active')); s.classList.add('is-active'); state.color = c; colorBtn.style.color = c; D.close(colorPop); }; sw.appendChild(s); });
  colorPop.appendChild(sw); document.body.appendChild(colorPop);
  D.register(colorPop, { menu: true, accordion: 'left', trigger: colorBtn, startClosed: true });
  colorBtn.addEventListener('click', () => D.toggle(colorPop));

  /* ---------------- asset palette (left flyout) ---------------- */
  const assetPanel = panel('MILITARY ASSETS', assetBody());
  assetPanel.dataset.menu = '1'; document.body.appendChild(assetPanel);
  D.register(assetPanel, { mode: 'y', home: 'left', menu: true, accordion: 'left', trigger: toolbar.querySelector('[data-tool="asset"]'), startClosed: true, gripSel: '.panel__head', closeSel: '.panel__close', icon: I.asset });

  function openMenu(el) { D.open(el); }

  /* ---------------- presenter bar (top) ---------------- */
  const top = h('div', 'bar'); top.style.left = '280px'; top.style.top = '68px';
  top.append(grip('bar__grip'), liveBadge(), sep(),
    barBtn(I.zoomIn, 'Zoom in', () => map.zoomIn()), barBtn(I.zoomOut, 'Zoom out', () => map.zoomOut()), barBtn(I.center, 'Reset', () => map.flyTo([29.5,45],5)), sep(),
    barBtn(I.eye, 'Hide UI', toggleHideUI), barBtn(I.lock, 'Lock layout', toggleLock), barBtn(I.camera, 'Snapshot', snapshot), barBtn(I.play, 'Presenter mode', () => {}));
  document.body.appendChild(top);
  D.register(top, { mode: 'free', home: 'top', keepOpen: true, gripSel: '.bar__grip' });

  /* ---------------- bottom dock (undo/redo/clear) ---------------- */
  const bottom = h('div', 'bar'); bottom.style.left = '50%'; bottom.style.transform = 'translateX(-50%)'; bottom.style.bottom = '14px';
  bottom.append(grip('bar__grip'),
    barBtn(I.undo, 'Undo', () => {}), barBtn(I.redo, 'Redo', () => {}), sep(),
    barBtn(I.erase, 'Clear all', () => state.drawn.clearLayers()));
  document.body.appendChild(bottom);
  D.register(bottom, { mode: 'free', home: 'bottom', keepOpen: true, gripSel: '.bar__grip' });

  /* ---------------- drawing tools ---------------- */
  let dragStart = null, ghost = null;
  map.on('mousedown', e => { if (['arrow', 'curve', 'circle', 'polygon'].includes(state.tool)) { dragStart = e.latlng; map.dragging.disable(); } });
  map.on('mousemove', e => { if (!dragStart) return; ghost && state.drawn.removeLayer(ghost); ghost = drawShape(state.tool, dragStart, e.latlng, true); ghost && state.drawn.addLayer(ghost); });
  map.on('mouseup', e => { if (!dragStart) return; ghost && state.drawn.removeLayer(ghost); const s = drawShape(state.tool, dragStart, e.latlng, false); s && state.drawn.addLayer(s); dragStart = ghost = null; map.dragging.enable(); });
  map.on('click', e => {
    if (state.tool === 'marker') state.drawn.addLayer(L.circleMarker(e.latlng, { radius: 7, color: '#fff', weight: 2, fillColor: state.color, fillOpacity: 1 }));
    else if (state.tool === 'text') { const t = prompt('Label text:'); if (t) state.drawn.addLayer(L.marker(e.latlng, { icon: L.divIcon({ className: 'map-label', html: `<span style="background:rgba(8,11,20,.7);color:#fff;padding:3px 8px;border-radius:6px;font:600 12px var(--font,sans-serif);white-space:nowrap;border:1px solid ${state.color}">${t}</span>` }) })); }
  });
  function drawShape(tool, a, b, preview) {
    const o = { color: state.color, weight: 3, opacity: preview ? 0.6 : 1 };
    if (tool === 'circle') return L.circle(a, { radius: map.distance(a, b), ...o, fillColor: state.color, fillOpacity: 0.12 });
    if (tool === 'arrow') return arrowLine(a, b, o);
    if (tool === 'curve') return curveLine(a, b, o);
    if (tool === 'polygon') return L.polygon([a, b, [a.lat, b.lng]], { ...o, fillColor: state.color, fillOpacity: 0.12 });
    return null;
  }
  function arrowLine(a, b, o) { const g = L.layerGroup(); g.addLayer(L.polyline([a, b], o)); const ang = Math.atan2(b.lat - a.lat, b.lng - a.lng); const d = map.distance(a, b) * 0.18; const head = ll => L.latLng(b.lat + Math.sin(ll) * d / 111000, b.lng + Math.cos(ll) * d / 111000); g.addLayer(L.polyline([head(ang + 2.6), b, head(ang - 2.6)], o)); return g; }
  function curveLine(a, b, o) { const mid = L.latLng((a.lat + b.lat) / 2 + (b.lng - a.lng) * 0.2, (a.lng + b.lng) / 2 - (b.lat - a.lat) * 0.2); const pts = []; for (let t = 0; t <= 1; t += 0.05) { const x = (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * mid.lat + t * t * b.lat; const y = (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * mid.lng + t * t * b.lng; pts.push([x, y]); } return L.polyline(pts, o); }
  map.on('click', e => { if (state.tool === 'erase') { /* erase nearest */ let best, bd = Infinity; state.drawn.eachLayer(l => { const ll = l.getLatLng ? l.getLatLng() : (l.getBounds && l.getBounds().getCenter()); if (!ll) return; const d = map.distance(ll, e.latlng); if (d < bd) { bd = d; best = l; } }); if (best && bd < map.distance(map.getBounds().getNorthWest(), map.getBounds().getSouthEast()) * 0.04) state.drawn.removeLayer(best); } });

  /* ---------------- presenter helpers ---------------- */
  let hidden = false, locked = false;
  function toggleHideUI() { hidden = !hidden; document.querySelectorAll('.toolbar,.rail,.bar,.panel,.status').forEach(e => { if (e !== top) e.style.visibility = hidden ? 'hidden' : ''; }); }
  function toggleLock() { locked = !locked; document.body.classList.toggle('is-locked', locked); top.querySelectorAll('.bar__grip').forEach(g => g.style.pointerEvents = locked ? 'none' : ''); }
  function snapshot() { alert('Snapshot — export coming in the export module.'); }

  /* ---------------- builders ---------------- */
  function grip(cls) { const g = h('div', cls, I.grip); return g; }
  function sep() { return h('div', 'bar__sep'); }
  function barBtn(icon, title, fn) { const b = h('button', 'btn', icon); b.title = title; b.onclick = fn; return b; }
  function liveBadge() { return h('div', 'bar__live', `<span class="bar__dot"></span><span class="bar__live-txt">LIVE</span>`); }
  function card(title, icon, bodyFn) {
    const c = h('div', 'card is-open');
    const head = h('div', 'card__head', `<span class="card__icon">${icon}</span><span class="card__title">${title}</span><span class="card__chev">${I.chevron}</span>`);
    const body = h('div', 'card__body'); body.appendChild(bodyFn());
    head.onclick = () => c.classList.toggle('is-open');
    c.append(head, body); return c;
  }
  function panel(title, body) {
    const p = h('div', 'panel');
    const head = h('div', 'panel__head', `<span class="panel__grip">${I.grip}</span><span class="panel__title">${title}</span>`);
    head.appendChild(Object.assign(h('button', 'panel__close', I.minus), {}));
    const b = h('div', 'panel__body'); b.appendChild(body);
    p.append(head, b); p.style.width = '220px'; return p;
  }
  function studioBody() {
    const w = h('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    const sec = (label, ...kids) => { const s = h('div'); s.style.cssText = 'display:flex;flex-direction:column;gap:7px'; s.appendChild(h('div', 'section__label', label)); kids.forEach(k => s.appendChild(k)); return s; };
    const full = (icon, txt) => { const b = h('button', 'tbtn grow', `${icon}<span>${txt}</span>`); return b; };
    w.append(
      sec('Motion', full(I.curve, 'Draw Motion Path'), h('div', 'hint', 'Pick an asset, then draw. Auto-rotates to face travel.')),
      sec('Range Ring', full(I.target, 'Draw Range Ring'), h('div', 'hint', 'Click the map, then enter radius in km.')),
      sec('Session', rowOf(full(I.save, 'Auto-save'), full(I.undo, 'Restore'))),
      sec('Presets', full(I.layers, 'Save Preset')),
    );
    return w;
  }
  function rowOf(...kids) { const r = h('div', 'row'); kids.forEach(k => r.appendChild(k)); return r; }
  function assetBody() {
    const w = h('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    w.appendChild(h('div', 'hint', 'Asset library loads here. Pick a category, then click the map to place.'));
    const g = h('div', 'grid');
    ['Air', 'Naval', 'Ground', 'Drone', 'Missile', 'Radar'].forEach(n => g.appendChild(h('button', 'grid__btn', `${I.asset}<span>${n}</span>`)));
    w.appendChild(g); return w;
  }

  /* ---------------- keyboard ---------------- */
  const KEYMAP = { v: 'pan', m: 'marker', u: 'asset', a: 'arrow', b: 'curve', c: 'circle', p: 'polygon', f: 'sketch', l: 'text', r: 'ruler', e: 'erase' };
  window.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; const t = KEYMAP[e.key.toLowerCase()]; if (t) setTool(t); });

  /* ---------------- responsive bar layout (centre in the free gap, clamped) ---------------- */
  function layoutBars() {
    const tbR = toolbar.getBoundingClientRect().right;
    const railL = rail.getBoundingClientRect().left;
    [top, bottom].forEach(bar => {
      if (bar.__placed) return;                         // respect a user drag
      const bw = bar.offsetWidth;
      const left = Math.max(tbR + 12, Math.min((tbR + railL) / 2 - bw / 2, railL - bw - 12));
      bar.style.left = Math.round(left) + 'px'; bar.style.transform = 'none'; bar.style.right = 'auto';
    });
  }
  requestAnimationFrame(layoutBars);
  window.addEventListener('resize', () => requestAnimationFrame(layoutBars));

  /* expose for tests */
  window.__app = { map, state, setTool, setStyle };
  console.log('[v2] ready');
})();
