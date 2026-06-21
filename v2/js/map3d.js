/* ============================================================
   MAP3D — real 3D terrain view (MapLibre GL) layered over the
   Leaflet map. A cinematic establishing/fly-over mode with true
   elevation, sky and a free camera (pitch / bearing / zoom).
   Leaflet stays the 2D working map; entering 3D syncs the camera
   and mirrors the active scene's geometry as GeoJSON so the shot
   isn't empty. Exiting syncs the centre/zoom back to Leaflet.
   ============================================================ */
(() => {
  const S = window.Store, L2 = window.GameMap.map, I = window.ICONS;
  const D2R = Math.PI / 180;
  const KEY = 'tnFJbEP9ELhQqkA6rPY2';
  // "wireframe" in 3D = a near-black vector base with glowing contour lines draped on the
  // terrain (the lines follow the elevation, so mountains read as a topographic wireframe).
  const realStyle = id => (id === 'wireframe' ? 'dataviz-dark' : id);
  const styleUrl = id => `https://api.maptiler.com/maps/${realStyle(id)}/style.json?key=${KEY}`;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  if (typeof maplibregl === 'undefined') { console.warn('MapLibre not loaded'); return; }

  const cont = h('div'); cont.id = 'map3d'; document.body.appendChild(cont);
  const cfg3 = () => (S.cfg().threeD) || { exaggeration: 2.6, pitch: 62 };
  let map = null, on = false, builtStyle = null, exaggeration = cfg3().exaggeration;   // clearly-3D default; tune in Settings or with ▲/▽

  /* ---- build the MapLibre map lazily on first use ---- */
  function ensure() {
    if (map) return;
    const c = L2.getCenter();
    map = new maplibregl.Map({
      container: cont, style: styleUrl(S.state.mapStyle || 'satellite'),
      center: [c.lng, c.lat], zoom: Math.max(2.6, L2.getZoom() - 1), pitch: cfg3().pitch, bearing: 0,
      minZoom: 3, maxPitch: 75, attributionControl: false, antialias: true, dragRotate: true, renderWorldCopies: true,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© MapTiler © OpenStreetMap' }));
    window.__m3 = map; builtStyle = S.state.mapStyle || 'satellite';   // debug/inspection hook
    map.on('error', e => { const err = e && e.error; if (err && (err.name === 'AbortError' || /abort/i.test(err.message || ''))) return; });   // swallow benign style-swap aborts
    map.on('style.load', onStyle);
    map.on('move', () => { try { if (window.Draw && Draw.reposition) Draw.reposition(); } catch (e) {} });   // keep the selection context bar following the camera in 3D
    // re-seat 3D models on the terrain once elevation tiles load / after camera moves
    // (queryTerrainElevation returns 0 until tiles arrive). Loop-safe: only re-ground
    // once per movement/idle cycle, so update3D's repaint can't re-trigger us.
    let regroundPending = true;
    map.on('movestart', () => { regroundPending = true; });
    map.on('sourcedata', e => { if (e.sourceId === 'dem' && e.isSourceLoaded) regroundPending = true; });
    map.on('idle', () => { if (on && regroundPending) { regroundPending = false; try { if (window.Models3D) Models3D.refresh(); } catch (e) {} } });
    bridgeDrawing();
  }
  function onStyle() {
    try {
      if (!map.getSource('dem')) map.addSource('dem', { type: 'raster-dem', url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${KEY}`, tileSize: 256 });
      map.setTerrain({ source: 'dem', exaggeration });
    } catch (e) {}
    try { map.setSky({ 'sky-color': '#0a1830', 'sky-horizon-blend': 0.6, 'horizon-color': '#16335c', 'horizon-fog-blend': 0.5, 'fog-color': '#0a1322', 'fog-ground-blend': 0.4 }); } catch (e) {}
    addHillshade();
    addSceneLayers(); mirror(); mirrorOverlays(); applyLabels3D();
    try { if (window.Models3D) window.Models3D.attach3D(map); } catch (e) {}   // GLB model layer
    try { if (window.Tracking3D) window.Tracking3D.attach3D(map); } catch (e) {}   // live ships/planes as 3D
    applyLight(); applyProjection(); applyPerf(); applyWireframe3D();
  }

  /* ---- 3D WIREFRAME: glowing contour lines draped over the terrain. The lines come
     from MapTiler's vector contour tileset (zoom 9–14), so they only appear when zoomed
     into a mountain/relief region — at that scale they hug the 3D surface and the peaks
     read as a stacked topographic wireframe. Two layers give a neon glow: a wide blurred
     halo under a crisp bright line, with index lines (every 5th/10th) emphasised. ---- */
  const WF_SRC = 'wf-contours', WF_GLOW = 'wf-contour-glow', WF_LINE = 'wf-contour', WF_COL = '#3fd8ff';
  function applyWireframe3D() {
    if (!map) return;
    const wf = (S.state.mapStyle || 'satellite') === 'wireframe';
    document.body.classList.toggle('map-wireframe', wf);
    try {
      if (wf) {
        if (!map.getSource(WF_SRC)) map.addSource(WF_SRC, { type: 'vector', url: `https://api.maptiler.com/tiles/contours-v2/tiles.json?key=${KEY}` });
        // index lines (nth_line 5/10) brighter+thicker than the minor lines between them
        const widthBy = ['interpolate', ['linear'], ['coalesce', ['get', 'nth_line'], 1], 1, 0.5, 5, 1.1, 10, 1.8];
        if (!map.getLayer(WF_GLOW)) map.addLayer({ id: WF_GLOW, type: 'line', source: WF_SRC, 'source-layer': 'contour',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': WF_COL, 'line-blur': 1.6, 'line-width': ['*', widthBy, 1.8], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.06, 12, 0.12, 14, 0.18] } });
        if (!map.getLayer(WF_LINE)) map.addLayer({ id: WF_LINE, type: 'line', source: WF_SRC, 'source-layer': 'contour',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': WF_COL, 'line-width': widthBy, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 12, 0.7, 14, 0.9] } });
      } else {
        [WF_LINE, WF_GLOW].forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
        try { if (map.getSource(WF_SRC)) map.removeSource(WF_SRC); } catch (e) {}
      }
    } catch (e) {}
  }
  // PERFORMANCE: on a retina display the GL terrain renders ~4× the pixels (devicePixelRatio 2 → 2²).
  // Cap to 1× by default (huge speedup for the heavy 3D + terrain scene); the operator can opt back
  // into full-resolution "sharp" render from Settings ▸ 3D when the machine can afford it.
  function applyPerf() {
    if (!map || !map.setPixelRatio) return;
    const hi = !!cfg3().hi, dpr = window.devicePixelRatio || 1;
    try { map.setPixelRatio(hi ? dpr : Math.min(dpr, 1)); } catch (e) {}
  }
  // globe ↔ flat projection (MapLibre v5). Models are mercator-projected, so they
  // are hidden on the globe (the planet view is an establishing/whole-Earth shot).
  function applyProjection() {
    if (!map) return;
    const globe = !!cfg3().globe;
    try { map.setProjection({ type: globe ? 'globe' : 'mercator' }); } catch (e) {}
    try { if (window.Models3D && Models3D.setVisible) Models3D.setVisible(!globe); } catch (e) {}
    try { btn3globe.classList.toggle('is-on', globe); } catch (e) {}
  }

  /* ---- 3D sun lighting: a directional sun that shades the terrain (hillshade)
     and lights the GLB models from the same azimuth/altitude, so relief and
     equipment "pop". config.light3d (synced): { on, az, alt, intensity, ambient, relief } ---- */
  const cfgL = () => Object.assign({ on: true, az: 315, alt: 45, intensity: 1.9, ambient: 1.0, relief: 0.5, shadow: 55, tshadow: 55 }, S.cfg().light3d || {});
  function firstSymbolId() { try { const ls = map.getStyle().layers; for (const l of ls) if (l.type === 'symbol') return l.id; } catch (e) {} return undefined; }
  function addHillshade() {
    try {
      if (map.getLayer('hillshade')) return;
      map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem',
        paint: { 'hillshade-illumination-anchor': 'map', 'hillshade-shadow-color': '#05101f', 'hillshade-highlight-color': '#fff6e6', 'hillshade-accent-color': '#1d3a5f' }
      }, firstSymbolId());   // under the base map's labels so names stay readable
    } catch (e) {}
  }
  function applyLight() {
    if (!map) return;
    const L = cfgL();
    const lowBoost = 1 + (1 - Math.sin(Math.max(6, L.alt) * D2R)) * 0.9;   // low sun → deeper terrain shading
    try {
      if (map.getLayer('hillshade')) {
        map.setLayoutProperty('hillshade', 'visibility', L.on ? 'visible' : 'none');
        if (L.on) {
          map.setPaintProperty('hillshade', 'hillshade-illumination-direction', Math.round(L.az));
          map.setPaintProperty('hillshade', 'hillshade-exaggeration', Math.max(0, Math.min(1, L.relief * lowBoost)));
          const tsh = Math.min(0.95, (L.tshadow == null ? 55 : L.tshadow) / 100 * (0.5 + 0.5 / Math.max(0.35, Math.sin(Math.max(6, L.alt) * D2R))));
          map.setPaintProperty('hillshade', 'hillshade-shadow-color', `rgba(4,10,22,${(0.25 + tsh * 0.7).toFixed(2)})`);
          const hi = Math.min(1, 0.45 + (L.intensity / 4) * 0.55);   // sun brightness → highlights
          map.setPaintProperty('hillshade', 'hillshade-highlight-color', `rgba(255,247,232,${hi.toFixed(2)})`);
          const amb = Math.min(0.65, 0.18 + (L.ambient / 3) * 0.5);   // ambient fill → cool accent
          map.setPaintProperty('hillshade', 'hillshade-accent-color', `rgba(38,72,116,${amb.toFixed(2)})`);
        }
      }
    } catch (e) {}
    // global light (affects any extrusions + overall model shading anchor)
    try { map.setLight({ anchor: 'map', position: [1.5, L.az, Math.max(0, 90 - L.alt)], color: '#ffffff', intensity: L.on ? 0.5 : 0.2 }); } catch (e) {}
    try { if (window.Models3D && Models3D.setLight) Models3D.setLight(L.on ? Object.assign({}, L, { shadow: (L.shadow || 0) / 100 }) : Object.assign({}, L, { intensity: 0.9, ambient: 1.4, shadow: 0 })); } catch (e) {}
  }
  // make every label (base style + scene) lie on the terrain so names read as 3D when tilted
  function applyLabels3D() {
    if (!map) return;
    const align = (cfg3().labels3d !== false) ? 'map' : 'viewport';
    try { map.getStyle().layers.forEach(l => { if (l.type === 'symbol') { try { map.setLayoutProperty(l.id, 'text-pitch-alignment', align); } catch (e) {} } }); } catch (e) {}
  }

  /* ---- mirror the active scene geometry into GeoJSON ---- */
  const SRC = 'scene';
  function ringFor(lat, lng, radiusM, n = 64) { const pts = []; const dLat = radiusM / 111320; for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; pts.push([lng + (dLat / Math.cos(lat * Math.PI / 180)) * Math.cos(a), lat + dLat * Math.sin(a)]); } return pts; }
  function toFeatures() {
    const sc = S.activeScene(); if (!sc) return [];
    const live = S.state.mode === 'live';
    const n = live ? S.revealedCount(sc) : sc.elements.length;
    const F = []; const add = (geom, props) => F.push({ type: 'Feature', geometry: geom, properties: props });
    sc.elements.slice(0, n).forEach(el => {
      const col = el.color || '#ff453a';
      switch (el.type) {
        case 'marker': add({ type: 'Point', coordinates: [el.ll[1], el.ll[0]] }, { kind: 'pt', color: col, label: el.label || '' }); break;
        case 'text': add({ type: 'Point', coordinates: [el.ll[1], el.ll[0]] }, { kind: 'txt', color: col, label: el.text || '' }); break;
        case 'asset': add({ type: 'Point', coordinates: [el.ll[1], el.ll[0]] }, { kind: 'pt', color: col, label: el.name || '' }); break;
        case 'arrow': case 'curve': add({ type: 'LineString', coordinates: [[el.a[1], el.a[0]], [el.b[1], el.b[0]]] }, { kind: 'line', color: col }); break;
        case 'tarrow': case 'sketch': add({ type: 'LineString', coordinates: (el.pts || []).map(p => [p[1], p[0]]) }, { kind: 'line', color: col }); break;
        case 'frontline': add({ type: 'LineString', coordinates: [[el.a[1], el.a[0]], [el.b[1], el.b[0]]] }, { kind: 'line', color: col }); break;
        case 'measure': add({ type: 'LineString', coordinates: [[el.a[1], el.a[0]], [el.b[1], el.b[0]]] }, { kind: 'line', color: col }); break;
        case 'circle': case 'ring': add({ type: 'Polygon', coordinates: [ringFor(el.ll[0], el.ll[1], el.radius)] }, { kind: 'area', color: col }); break;
        case 'polygon': add({ type: 'Polygon', coordinates: [(el.pts || []).map(p => [p[1], p[0]])] }, { kind: 'area', color: col }); break;
        case 'country': if (el.geom) add(el.geom, { kind: 'area', color: col }); break;
      }
    });
    return F;
  }
  function addSceneLayers() {
    if (map.getSource(SRC)) return;
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'sc-area', type: 'fill', source: SRC, filter: ['==', ['get', 'kind'], 'area'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'sc-area-l', type: 'line', source: SRC, filter: ['==', ['get', 'kind'], 'area'], paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
    map.addLayer({ id: 'sc-line', type: 'line', source: SRC, filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': ['get', 'color'], 'line-width': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'sc-pt', type: 'circle', source: SRC, filter: ['==', ['get', 'kind'], 'pt'], paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'sc-lbl', type: 'symbol', source: SRC, filter: ['in', ['get', 'kind'], ['literal', ['pt', 'txt']]], layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#0a0e16', 'text-halo-width': 1.4 } });
    if (!map.getSource('routes')) {
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'routes-l', type: 'line', source: 'routes', paint: { 'line-color': '#ffb020', 'line-width': 2, 'line-opacity': 0.8, 'line-dasharray': [2, 2] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    }
  }
  function mirrorRoutes() {
    if (!map) return; const s = map.getSource('routes'); if (!s) return;
    const F = [];
    ((S.models3d && S.models3d()) || []).forEach(m => { const r = m.route; if (m.on !== false && m.mode !== '2d' && r && (r.pts || []).length >= 2) F.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.pts.map(p => [p[1], p[0]]) }, properties: {} }); });
    s.setData({ type: 'FeatureCollection', features: F });
  }
  function mirror() { if (!map || !on) return; const s = map.getSource(SRC); if (s) s.setData({ type: 'FeatureCollection', features: toFeatures() }); mirrorRoutes(); }
  // drape the satellite/image overlays onto the 3D terrain (image sources + raster layers)
  function mirrorOverlays() {
    if (!map) return;
    const ovs = (S.overlays && S.overlays()) || [], want = new Set();
    const before = map.getLayer('sc-area') ? 'sc-area' : undefined;
    ovs.forEach(o => {
      if (o.on === false || !o.url || !o.bounds) return;
      const id = 'ov-' + o.id, b = o.bounds;
      const coords = [[b[0][1], b[1][0]], [b[1][1], b[1][0]], [b[1][1], b[0][0]], [b[0][1], b[0][0]]];   // TL,TR,BR,BL
      want.add(id);
      const src = map.getSource(id);
      if (src) { try { src.updateImage({ url: o.url, coordinates: coords }); } catch (e) {} }
      else { try { map.addSource(id, { type: 'image', url: o.url, coordinates: coords }); map.addLayer({ id: id + '-l', type: 'raster', source: id, paint: { 'raster-opacity': o.opacity == null ? 1 : o.opacity, 'raster-fade-duration': 0 } }, before); } catch (e) {} }
      try { map.setPaintProperty(id + '-l', 'raster-opacity', o.opacity == null ? 1 : o.opacity); } catch (e) {}
    });
    // sweep by SOURCE so an orphaned ov-* source (add-layer-failed) is also cleaned
    try { Object.keys(map.getStyle().sources || {}).forEach(sid => { if (sid.indexOf('ov-') === 0 && !want.has(sid)) { try { if (map.getLayer(sid + '-l')) map.removeLayer(sid + '-l'); } catch (e) {} try { map.removeSource(sid); } catch (e) {} } }); } catch (e) {}
  }

  /* ---- draw in 3D: forward terrain clicks/drags to the 2D tools (full reuse) ----
     The Leaflet map is hidden behind, so we unproject the cursor to lng/lat and
     re-fire the same Leaflet events the drawing engine already listens for. The
     finished element is mirrored back into 3D. Navigation (pan/rotate/zoom) is
     active only with the Select tool; any drawing tool turns the drag into drawing. */
  const DRAG3 = ['arrow', 'curve', 'circle', 'ring', 'polygon', 'sketch', 'measure', 'frontline'];
  const CLICK3 = ['marker', 'text', 'asset', 'country'];
  const tool = () => (window.Draw && window.Draw.tool) || 'select';
  const toLL = ll => L.latLng(ll.lat, ll.lng);
  let drawing = false, selDrag = null;
  function bridgeDrawing() {
    map.on('mousedown', e => {
      if (!on) return; const t = tool();
      if (t === 'select') {   // select / move drawn elements in 3D (yield to a model under the cursor)
        if (window.Models3D && Models3D.nearestId && Models3D.nearestId(e.point, 60)) return;
        const el = window.Draw && Draw.pickAt(toLL(e.lngLat)); if (el) { e.preventDefault(); selDrag = { prev: e.lngLat }; }
        return;
      }
      if (DRAG3.includes(t)) { e.preventDefault(); drawing = true; L2.fire('mousedown', { latlng: toLL(e.lngLat) }); }
    });
    map.on('mousemove', e => { if (!on) return; if (selDrag) { const d = e.lngLat; window.Draw.moveSelected(d.lat - selDrag.prev.lat, d.lng - selDrag.prev.lng); selDrag.prev = d; mirror(); return; } if (drawing || tool() === 'tarrow') L2.fire('mousemove', { latlng: toLL(e.lngLat) }); });
    map.on('mouseup', e => { if (!on) return; if (selDrag) { window.Draw.commitSelected(); selDrag = null; setTimeout(mirror, 30); return; } if (drawing) { drawing = false; L2.fire('mouseup', { latlng: toLL(e.lngLat) }); setTimeout(mirror, 30); } });
    map.on('click', e => { if (!on) return; const t = tool(); if (CLICK3.includes(t) || t === 'tarrow') { L2.fire('click', { latlng: toLL(e.lngLat) }); setTimeout(mirror, 60); } });
    map.on('dblclick', e => { if (!on || tool() !== 'tarrow') return; e.preventDefault(); L2.fire('dblclick', { latlng: toLL(e.lngLat), originalEvent: e.originalEvent }); setTimeout(mirror, 30); });
  }

  /* ---- camera sync ---- */
  function syncTo3D(fly) { const c = L2.getCenter(), z = Math.max(1, L2.getZoom() - 1); const opt = { center: [c.lng, c.lat], zoom: z }; fly ? map.easeTo({ ...opt, duration: 800 }) : map.jumpTo(opt); }
  function syncFrom3D() { const c = map.getCenter(); L2.setView([c.lat, c.lng], Math.round(map.getZoom() + 1), { animate: false }); }

  function enter() {
    ensure(); on = true; document.body.classList.add('mode-3d'); cont.classList.add('on');
    const cur = S.state.mapStyle || 'satellite'; if (builtStyle !== cur) { try { map.setStyle(styleUrl(cur)); builtStyle = cur; } catch (e) {} }   // pick up a style changed since last 3D session (on enter only — avoids mid-session aborts)
    map.resize(); syncTo3D(false);
    if (map.isStyleLoaded()) { addSceneLayers(); mirror(); }
    btn.classList.add('is-on'); ctrls.hidden = false;
    if (window.Movable) Movable.reflow();   // place/orient the unified drag grip now it's visible
  }
  function exit() { if (!on) return; on = false; syncFrom3D(); document.body.classList.remove('mode-3d'); cont.classList.remove('on'); btn.classList.remove('is-on'); ctrls.hidden = true; }
  function toggle() { on ? exit() : enter(); }

  /* ---- on-screen controls (visible only in 3D) ---- */
  const btn = h('button', 'zoomctl__b view3d', '3D'); btn.title = 'Toggle 3D terrain view';
  btn.onclick = toggle;
  (function place() { const zc = document.querySelector('.zoomctl'); if (zc) zc.appendChild(btn); else { btn.classList.add('view3d--float'); document.body.appendChild(btn); } })();

  const ctrls = h('div', 'd3ctrl glass'); ctrls.hidden = true;
  const cb = (label, title, fn) => { const b = h('button', 'd3ctrl__b', label); b.title = title; b.onclick = fn; return b; };
  const btn3globe = cb(I.globe, 'Globe / flat view', () => S.setThreeD({ globe: !cfg3().globe }));
  ctrls.append(
    btn3globe,
    cb(I.plus, 'Pitch up', () => map.easeTo({ pitch: Math.min(80, map.getPitch() + 8), duration: 200 })),
    cb(I.minus, 'Pitch down', () => map.easeTo({ pitch: Math.max(0, map.getPitch() - 8), duration: 200 })),
    cb(I.rotL, 'Rotate left', () => map.easeTo({ bearing: map.getBearing() - 20, duration: 200 })),
    cb(I.rotR, 'Rotate right', () => map.easeTo({ bearing: map.getBearing() + 20, duration: 200 })),
    cb(I.terrainUp, 'More terrain height', () => { exaggeration = Math.min(8, exaggeration + 0.5); try { map.setTerrain({ source: 'dem', exaggeration }); } catch (e) {} }),
    cb(I.terrainDown, 'Less terrain height', () => { exaggeration = Math.max(0.3, exaggeration - 0.5); try { map.setTerrain({ source: 'dem', exaggeration }); } catch (e) {} }),
    cb(I.compass, 'Reset north & flatten pitch', () => map.easeTo({ bearing: 0, duration: 300 })),
    cb(I.close, 'Exit 3D', exit),
  );
  document.body.appendChild(ctrls);

  /* ---- react to store: keep 3D base in step with the 2D app ---- */
  S.on((st, evt) => {
    if (evt === 'threed') { exaggeration = cfg3().exaggeration; if (on && map) { try { map.setTerrain({ source: 'dem', exaggeration }); } catch (e) {} map.easeTo({ pitch: cfg3().pitch, duration: 300 }); applyLabels3D(); applyProjection(); applyPerf(); } return; }
    if (evt === 'light3d') { if (on && map) applyLight(); return; }
    if (evt === 'mapstyle' || evt === 'sync') { if (on && map) { const cur = S.state.mapStyle || 'satellite'; if (builtStyle !== cur) { try { map.setStyle(styleUrl(cur)); builtStyle = cur; } catch (e) {} } } if (evt === 'mapstyle') return; }
    if (!on || !map) return;
    if (evt === 'active') { const sc = S.activeScene(); if (sc && sc.view) map.easeTo({ center: [sc.view.lng, sc.view.lat], zoom: Math.max(1, sc.view.zoom - 1), duration: 900 }); setTimeout(mirror, 50); }
    if (evt === 'models3d') { mirrorRoutes(); return; }
    if (evt === 'overlays') { mirrorOverlays(); return; }
    if (['elements', 'reveal', 'scenes', 'active', 'sync', 'mode'].includes(evt)) mirror();
  });

  window.Map3D = { enter, exit, toggle, get on() { return on; }, get map() { return map; } };
})();
