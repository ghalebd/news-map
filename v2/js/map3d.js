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
  // js/util.js. This file used to declare Math.PI/180 TWICE under two names (D2R here, RAD ~190 lines
  // down next to haversine); both names are kept as aliases of the one constant so no body changed.
  // fmtD is likewise an alias of draw.js's fmtDist — the 2D map and the globe label the same measure
  // element, and a drift between the two formatters would put two different numbers on air.
  const { h, D2R, RAD, fmtD } = window.U;
  const KEY = 'SIyj4p6cKZm7sBsge2Zn';
  // "wireframe" in 3D = a near-black vector base with glowing contour lines draped on the
  // terrain (the lines follow the elevation, so mountains read as a topographic wireframe).
  const realStyle = id => (id === 'wireframe' ? 'dataviz-dark' : id);
  const styleUrl = id => `https://api.maptiler.com/maps/${realStyle(id)}/style.json?key=${KEY}`;
  if (typeof maplibregl === 'undefined') { console.warn('MapLibre not loaded'); return; }

  // MapLibre throws a benign internal error ('shaderPreludeCode') for ONE frame while a base style
  // swaps with custom three.js layers attached — the models/terrain render correctly either side of
  // it. Detaching the layers before setStyle removes most; swallow this exact transition artifact so
  // switching map styles in 3D doesn't spam the operator console. Scoped to this one string only.
  window.addEventListener('error', e => { if (e && typeof e.message === 'string' && e.message.indexOf('shaderPreludeCode') >= 0) { e.preventDefault(); e.stopImmediatePropagation && e.stopImmediatePropagation(); } }, true);

  const cont = h('div'); cont.id = 'map3d'; document.body.appendChild(cont);
  const cfg3 = () => (S.cfg().threeD) || { exaggeration: 2.6, pitch: 62 };
  let map = null, on = false, builtStyle = null, exaggeration = cfg3().exaggeration;   // clearly-3D default; tune in Settings or with ▲/▽
  let backT = null, backAt = 0;   // debounce state for the 3D→2D camera mirror (see ensure())

  /* ---- build the MapLibre map lazily on first use ---- */
  function ensure() {
    if (map) return;
    const c = L2.getCenter();
    // If WebGL is unavailable (GPU blocklist, driver reset, or too many live contexts — this app runs
    // MapLibre PLUS several three.js renderers and browsers cap around 8-16) the constructor throws
    // straight out of the 3D button's onclick. `map` then stays null and every later click re-throws,
    // so the button just does nothing, silently, forever. Fail loudly and recoverably instead.
    try {
      map = new maplibregl.Map({
        container: cont, style: styleUrl(S.state.mapStyle || 'satellite'),
        center: [c.lng, c.lat], zoom: Math.max(2.6, L2.getZoom() - 1), pitch: cfg3().pitch, bearing: 0,
        minZoom: 3, maxPitch: 75, attributionControl: false, antialias: true, dragRotate: true, renderWorldCopies: true,
      });
    } catch (err) {
      map = null;
      console.error('[map3d] could not create the 3D map', err);
      window.UI && UI.toast && UI.toast('3D unavailable on this machine (WebGL failed)');
      return;
    }
    // A GPU driver reset kills the canvas permanently otherwise — tell the operator instead of showing black.
    try {
      const cv = map.getCanvas();
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); console.error('[map3d] WebGL context lost'); window.UI && UI.toast && UI.toast('3D graphics context lost — leave and re-enter 3D'); }, false);
      cv.addEventListener('webglcontextrestored', () => { console.warn('[map3d] WebGL context restored'); try { map.resize(); } catch (e) {} }, false);
    } catch (e) {}
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© MapTiler © OpenStreetMap' }));
    window.__m3 = map; builtStyle = S.state.mapStyle || 'satellite';   // debug/inspection hook
    // Registering ANY 'error' listener replaces MapLibre's own console.error, so the previous no-op body
    // silently swallowed the entire error channel — a 403 on style.json, a dead terrain source or a 404
    // overlay all vanished, and the operator just got a black rectangle. Keep the benign abort filter,
    // surface everything else.
    map.on('error', e => {
      const err = e && e.error; if (err && (err.name === 'AbortError' || /abort/i.test(err.message || ''))) return;   // benign style-swap aborts
      // An overlay deleted (or its style swapped) while its image was still decoding reports a failure
      // against a source that no longer exists — a teardown race the operator can do nothing about.
      // Report only failures for sources that are still live, so the channel stays trustworthy.
      if (e && e.sourceId) { try { if (!map.getSource(e.sourceId)) return; } catch (x) { return; } }
      console.error('[map3d] MapLibre error' + (e && e.sourceId ? ' [source: ' + e.sourceId + ']' : '') + ':', (err && err.message) || err || e);
    });
    map.on('style.load', onStyle);
    map.on('move', () => { try { if (window.Draw && Draw.reposition) Draw.reposition(); } catch (e) {} });   // keep the selection context bar following the camera in 3D
    // re-seat 3D models on the terrain once elevation tiles load / after camera moves
    // (queryTerrainElevation returns 0 until tiles arrive). Loop-safe: only re-ground
    // once per movement/idle cycle, so update3D's repaint can't re-trigger us.
    let regroundPending = true;
    map.on('movestart', () => { regroundPending = true; if (window.markMapMotion) markMapMotion(true); });   // drop glass refraction while the globe moves (see app.css .map-moving)
    map.on('moveend', () => { if (window.markMapMotion) markMapMotion(false); });
    // Every live feed is bound to the LEAFLET camera (tracking.js: moveend → flight fetch, AIS bbox
    // subscribe), and 2D→3D was synced on enter but 3D→2D only on EXIT — so flying the globe to a new
    // region showed no ships/aircraft there and issued no new AIS subscription until the operator left 3D.
    // Mirror the camera back once the move settles. One-way: nothing drives the GL map off Leaflet events
    // (only enter/scene-cut do, explicitly), so this cannot feed back.
    map.on('moveend', () => {
      if (!on) return; clearTimeout(backT);
      // Follow drives the globe with setCenter EVERY FRAME, which re-arms a plain debounce forever and the
      // feeds would never update — force one through if the last mirror was more than 2s ago.
      if (Date.now() - backAt > 2000) return syncBack();
      backT = setTimeout(syncBack, 400);
    });
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
  const SRC = 'scene', SRC_IC = 'scene-ic';
  function ringFor(lat, lng, radiusM, n = 64) { const pts = []; const dLat = radiusM / 111320; for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; pts.push([lng + (dLat / Math.cos(lat * Math.PI / 180)) * Math.cos(a), lat + dLat * Math.sin(a)]); } return pts; }
  function haversine(a, b) { const dLat = (b[0] - a[0]) * RAD, dLng = (b[1] - a[1]) * RAD, la1 = a[0] * RAD, la2 = b[0] * RAD; const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2; return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); }
  // arrowhead triangle (lng/lat ring) at tip T pointing away from A. Sized as a fraction of the shaft so
  // it scales with the arrow — projection-agnostic (a plain polygon renders correctly in flat-3D + globe,
  // unlike a screen-space icon whose rotation-alignment differs per projection). aLL/tLL are [lng,lat].
  function headTri(aLL, tLL) {
    const lat0 = (aLL[1] + tLL[1]) / 2, cl = Math.cos(lat0 * RAD) || 1;
    const ax = aLL[0] * cl, ay = aLL[1], tx = tLL[0] * cl, ty = tLL[1];
    const dx = tx - ax, dy = ty - ay, len = Math.hypot(dx, dy); if (len < 1e-7) return null;
    const ux = dx / len, uy = dy / len, L = Math.min(len * 0.24, 2.2), W = L * 0.5;   // head length capped at ~2.2° so a very long shaft doesn't get an absurd head
    const bx = tx - ux * L, by = ty - uy * L, px = -uy, py = ux;
    return [[tLL[0], tLL[1]], [(bx + px * W) / cl, by + py * W], [(bx - px * W) / cl, by - py * W], [tLL[0], tLL[1]]];
  }
  // 2D draws 'curve' as a quadratic Bezier bowed 20% of the chord off the straight line (js/draw.js
  // curvePts). Mirroring it as a 2-point line sent the arrow straight through the very city the operator
  // bowed it around. Same maths, reimplemented here in [lng,lat] order; a/b are [lat,lng].
  function curvePts3(a, b) { const mLat = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.2, mLng = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.2, p = []; for (let t = 0; t <= 1.0001; t += 0.05) { const u = 1 - t; p.push([u * u * a[1] + 2 * u * t * mLng + t * t * b[1], u * u * a[0] + 2 * u * t * mLat + t * t * b[0]]); } return p; }
  // head anchor for a sampled path: DIRECTION from the last segment (the curve's end tangent, so the head
  // doesn't point off down the chord), DISTANCE from the full chord — headTri sizes the head off |a→t|, so
  // handing it the bare 1/20th segment would shrink a curved arrow's head to nothing.
  function tanAnchor(p) { const n = p.length, T = p[n - 1], P = p[n - 2], A = p[0]; const dx = T[0] - P[0], dy = T[1] - P[1], m = Math.hypot(dx, dy); if (!m) return A; const c = Math.hypot(T[0] - A[0], T[1] - A[1]); return [T[0] - dx / m * c, T[1] - dy / m * c]; }
  // frontline teeth (js/draw.js frontLine): 9 perpendicular ticks at 4.5% of the run length. The bearing is
  // taken in METRIC space (dLng scaled by cos(lat)) and re-projected per axis, so the ticks stay square to
  // the line away from the equator instead of skewing over.
  function frontTeeth(a, b) { const d = haversine(a, b) * 0.045, ang = Math.atan2(b[0] - a[0], (b[1] - a[1]) * (Math.cos((a[0] + b[0]) / 2 * RAD) || 1)) + Math.PI / 2, out = []; for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9, lat = a[0] + (b[0] - a[0]) * t, lng = a[1] + (b[1] - a[1]) * t, cl = Math.cos(lat * RAD) || 1; out.push([[lng, lat], [lng + Math.cos(ang) * d / (111000 * cl), lat + Math.sin(ang) * d / 111000]]); } return out; }
  function toFeatures() {
    const sc = S.activeScene(); if (!sc) return [];
    const live = S.state.mode === 'live';
    const n = live ? S.revealedCount(sc) : sc.elements.length;
    const F = []; const add = (geom, props) => F.push({ type: 'Feature', geometry: geom, properties: props });
    sc.elements.slice(0, n).forEach(el => {
     try {   // one malformed element (missing ll/a/b/pts from a partial sync or legacy record) must not crash the whole 3D scene
      const col = el.color || '#ff453a';
      switch (el.type) {
        case 'marker': if (el.icon && el.icon !== 'pin' && window.Draw && Draw.iconSVG && Draw.iconSVG(el.icon)) break; add({ type: 'Point', coordinates: [el.ll[1], el.ll[0]] }, { kind: 'pt', color: col, label: el.label || '' }); break;   // NATO symbol markers are drawn as real icons by mirrorIcons()
        case 'text': add({ type: 'Point', coordinates: [el.ll[1], el.ll[0]] }, { kind: 'txt', color: col, label: el.text || '' }); break;
        case 'asset': break;   // flags/images are drawn as real icons by mirrorIcons()
        case 'arrow': add({ type: 'LineString', coordinates: [[el.a[1], el.a[0]], [el.b[1], el.b[0]]] }, { kind: 'line', color: col }); break;
        case 'curve': add({ type: 'LineString', coordinates: curvePts3(el.a, el.b) }, { kind: 'line', color: col }); break;   // bowed in 2D → must be bowed on air
        case 'tarrow': case 'sketch': add({ type: 'LineString', coordinates: (el.pts || []).map(p => [p[1], p[0]]) }, { kind: 'line', color: col }); break;
        case 'frontline': add({ type: 'LineString', coordinates: [[el.a[1], el.a[0]], [el.b[1], el.b[0]]] }, { kind: 'line', color: col }); add({ type: 'MultiLineString', coordinates: frontTeeth(el.a, el.b) }, { kind: 'line', color: col }); break;   // a frontline READS as a frontline only with its teeth — without them 3D showed a plain line
        case 'measure': add({ type: 'LineString', coordinates: [[el.a[1], el.a[0]], [el.b[1], el.b[0]]] }, { kind: 'line', color: col }); break;
        case 'circle': case 'ring': add({ type: 'Polygon', coordinates: [ringFor(el.ll[0], el.ll[1], el.radius)] }, { kind: 'area', color: col }); break;
        case 'polygon': add({ type: 'Polygon', coordinates: [(el.pts || []).map(p => [p[1], p[0]])] }, { kind: 'area', color: col }); break;
        case 'country': if (el.geom) add(el.geom, { kind: 'area', color: col }); break;
      }
      // ---- 3D fidelity: arrowheads + distance labels the 2D map draws but the 3D scene was missing ----
      if (el.type === 'curve' && el.a && el.b) {
        const cp = curvePts3(el.a, el.b), tri = headTri(tanAnchor(cp), cp[cp.length - 1]); if (tri) add({ type: 'Polygon', coordinates: [tri] }, { kind: 'head', color: col });   // head follows the curve's END TANGENT, not the chord
      } else if ((el.type === 'arrow' || el.type === 'frontline') && el.a && el.b) {
        const tri = headTri([el.a[1], el.a[0]], [el.b[1], el.b[0]]); if (tri) add({ type: 'Polygon', coordinates: [tri] }, { kind: 'head', color: col });
      } else if (el.type === 'tarrow' && (el.pts || []).length >= 2) {
        const p = el.pts, tri = headTri([p[p.length - 2][1], p[p.length - 2][0]], [p[p.length - 1][1], p[p.length - 1][0]]); if (tri) add({ type: 'Polygon', coordinates: [tri] }, { kind: 'head', color: col });
      }
      if (el.type === 'ring' && el.ll) add({ type: 'Point', coordinates: [el.ll[1], el.ll[0]] }, { kind: 'txt', color: col, label: (el.radius / 1000).toFixed(0) + ' KM' });
      if (el.type === 'measure' && el.a && el.b) add({ type: 'Point', coordinates: [(el.a[1] + el.b[1]) / 2, (el.a[0] + el.b[0]) / 2] }, { kind: 'txt', color: col, label: fmtD(haversine(el.a, el.b)) });
     } catch (e) {}
    });
    return F;
  }
  function addSceneLayers() {
    if (map.getSource(SRC)) return;
    addedIcons.clear();   // a style swap wipes the sprite atlas → forget cached icon ids so they re-rasterise
    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'sc-area', type: 'fill', source: SRC, filter: ['==', ['get', 'kind'], 'area'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'sc-area-l', type: 'line', source: SRC, filter: ['==', ['get', 'kind'], 'area'], paint: { 'line-color': ['get', 'color'], 'line-width': 2 } });
    map.addLayer({ id: 'sc-line', type: 'line', source: SRC, filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': ['get', 'color'], 'line-width': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'sc-head', type: 'fill', source: SRC, filter: ['==', ['get', 'kind'], 'head'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.95 } });   // solid arrowhead triangles for arrow/curve/frontline/tarrow
    map.addLayer({ id: 'sc-pt', type: 'circle', source: SRC, filter: ['==', ['get', 'kind'], 'pt'], paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'sc-lbl', type: 'symbol', source: SRC, filter: ['in', ['get', 'kind'], ['literal', ['pt', 'txt']]], layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#0a0e16', 'text-halo-width': 1.4 } });
    // real NATO-symbol markers + flag/image assets in 3D (rasterised to map images by mirrorIcons)
    map.addSource(SRC_IC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'sc-icon', type: 'symbol', source: SRC_IC, layout: { 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 6, 0.85, 10, 1.1], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'text-field': ['get', 'label'], 'text-size': 12, 'text-offset': [0, 1.5], 'text-anchor': 'top' }, paint: { 'text-color': '#fff', 'text-halo-color': '#0a0e16', 'text-halo-width': 1.4 } });
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
  function mirror() { if (!map || !on) return; const s = map.getSource(SRC); if (s) s.setData({ type: 'FeatureCollection', features: toFeatures() }); mirrorRoutes(); mirrorIcons(); }

  /* ---- real marker icons (NATO symbols) + flag/image assets in 3D ----
     rasterise each distinct icon to a MapLibre sprite image ONCE (SVG coloured to the element's colour,
     or the asset image), then a symbol layer draws it. Async image loads are handled like the model globe
     icons: a re-entrancy token guards setData, and we re-run when a new image finishes so the feature picks
     it up. Skipped set of already-added image ids is reused; assets/icons are static so this is cheap. */
  const addedIcons = new Set();
  let icoTok = 0;
  function iconIdFor(el) {
    if (el.type === 'asset') { let h = 0; const s = String(el.src || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'ic-as:' + (h >>> 0); }
    return 'ic-mi:' + el.icon + ':' + (el.color || '#fff');
  }
  function rasterToMap(id, src, isSvg, color) {   // returns Promise<bool added>
    return new Promise(res => {
      if (!map || map.hasImage(id) || addedIcons.has(id)) { addedIcons.add(id); return res(false); }
      const SZ = 64;
      let url = src;
      if (isSvg) { const coloured = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" color="' + (color || '#fff') + '" width="' + SZ + '" height="' + SZ + '"'); url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(coloured); }   // xmlns is REQUIRED to load an inline SVG as an <img> (the MICONS omit it since they're used in innerHTML)
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { try { const cv = document.createElement('canvas'); cv.width = cv.height = SZ; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, SZ, SZ); if (map && !map.hasImage(id)) map.addImage(id, cx.getImageData(0, 0, SZ, SZ)); addedIcons.add(id); res(true); } catch (e) { res(false); } };
      im.onerror = () => res(false);
      im.src = url;
    });
  }
  async function mirrorIcons() {
    if (!map || !on) return; const s = map.getSource(SRC_IC); if (!s) return;
    const tok = ++icoTok;
    const sc = S.activeScene(); if (!sc) { s.setData({ type: 'FeatureCollection', features: [] }); return; }
    const live = S.state.mode === 'live', n = live ? S.revealedCount(sc) : sc.elements.length;
    const items = [], jobs = [];
    sc.elements.slice(0, n).forEach(el => {
      try {
        if (el.type === 'asset' && el.src && el.ll) { const id = iconIdFor(el); jobs.push(rasterToMap(id, el.src, false)); items.push({ id, ll: el.ll, label: el.name || '' }); }
        else if (el.type === 'marker' && el.icon && el.icon !== 'pin' && el.ll && window.Draw && Draw.iconSVG) { const svg = Draw.iconSVG(el.icon); if (svg) { const id = iconIdFor(el); jobs.push(rasterToMap(id, svg, true, el.color || '#fff')); items.push({ id, ll: el.ll, label: el.label || '' }); } }
      } catch (e) {}
    });
    if (jobs.length) await Promise.all(jobs);
    if (tok !== icoTok || !map) return;   // superseded while rasterising
    const feats = items.filter(it => map.hasImage(it.id)).map(it => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [it.ll[1], it.ll[0]] }, properties: { icon: it.id, label: it.label } }));
    try { s.setData({ type: 'FeatureCollection', features: feats }); } catch (e) {}
  }
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
  let drawing = false, selDrag = null, downPt = null;
  // ModelControl owns the pointer while a model route is being drawn. Its onFhDown preventDefault()s
  // pointerdown, which dodges MapLibre's 'mousedown' but NOT its 'click' — so every route stroke also
  // dropped a marker / label / country highlight through this bridge. Guard the whole bridge instead.
  // NOTE: js/model-control.js must expose `get routeMode()` on window.ModelControl for this to engage.
  const routing = () => !!(window.ModelControl && window.ModelControl.routeMode);
  // Draw.pickAt DESELECTS when nothing is within tolerance (js/draw.js), so running it on every select-tool
  // mousedown meant that merely STARTING to pan/rotate the globe wiped the operator's selection and its
  // context bar mid-shot. Probe first with pickAt's own rule (areas by point-in-polygon, everything else by
  // screen proximity) and only let a press through when it can actually grab something; a press that never
  // moves is a click and is resolved through pickAt on mouseup, so clicking empty terrain still deselects.
  // (The probe duplicates draw.js geometry — the clean fix is a non-destructive Draw.hitAt() there.)
  function pir3(p, r) { let x = p[0], y = p[1], ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
  function pip3(p, poly) { if (!pir3(p, poly[0])) return false; for (let i = 1; i < poly.length; i++) if (pir3(p, poly[i])) return false; return true; }
  function areaHit3(g, lng, lat) { if (!g) return false; if (g.type === 'Polygon') return pip3([lng, lat], g.coordinates); if (g.type === 'MultiPolygon') { for (const pl of g.coordinates) if (pip3([lng, lat], pl)) return true; } return false; }
  function pickable(pt, ll, tol) {
    const sc = S.activeScene(); if (!sc || !window.Draw) return false; const T = tol || 22;
    return (sc.elements || []).some(el => {
      try {
        if (el.type === 'country' || el.type === 'polygon') { const g = el.geom || (el.pts ? { type: 'Polygon', coordinates: [el.pts.map(p => [p[1], p[0]])] } : null); if (areaHit3(g, ll.lng, ll.lat)) return true; }
        const ps = []; if (el.ll) ps.push(el.ll); if (el.a) ps.push(el.a); if (el.b) ps.push(el.b); if (el.pts) el.pts.forEach(p => ps.push(p));
        return ps.some(p => { const q = map.project([p[1], p[0]]); return Math.hypot(q.x - pt.x, q.y - pt.y) < T; });
      } catch (e) { return false; }
    });
  }
  function bridgeDrawing() {
    map.on('mousedown', e => {
      if (!on || routing()) return; const t = tool();
      if (t === 'select') {   // select / move drawn elements in 3D (yield to a model under the cursor)
        if (window.Models3D && Models3D.nearestId && Models3D.nearestId(e.point, 60)) return;
        downPt = e.point;   // remember the press so mouseup can tell a click from a camera drag
        if (!pickable(e.point, e.lngLat)) return;   // empty terrain → let the camera drag; pickAt here would deselect
        const el = window.Draw && Draw.pickAt(toLL(e.lngLat)); if (el) { e.preventDefault(); downPt = null; selDrag = { prev: e.lngLat }; try { S.pushHistory(); } catch (er) {} }   // snapshot on grab → 3D element drag is undoable
        return;
      }
      if (DRAG3.includes(t)) { e.preventDefault(); drawing = true; L2.fire('mousedown', { latlng: toLL(e.lngLat) }); }
    });
    // safety: if the pointer is released OFF the GL canvas, MapLibre's 'mouseup' never fires and the
    // element/draw gesture would stay glued to the cursor. Finalize on the document instead.
    // Deliberately NOT routeMode-guarded: it creates nothing, and it is the only path that can un-stick a
    // gesture left in flight — blocking it could strand `drawing`/`selDrag` forever.
    window.addEventListener('mouseup', () => { if (!on) return; if (selDrag) { try { window.Draw.commitSelected(); } catch (e) {} selDrag = null; setTimeout(mirror, 30); } if (drawing) { drawing = false; setTimeout(mirror, 30); } downPt = null; });
    map.on('mousemove', e => { if (!on || routing()) return; if (selDrag) { const d = e.lngLat; window.Draw.moveSelected(d.lat - selDrag.prev.lat, d.lng - selDrag.prev.lng); selDrag.prev = d; mirror(); return; } if (drawing || tool() === 'tarrow') L2.fire('mousemove', { latlng: toLL(e.lngLat) }); });
    map.on('mouseup', e => { if (!on || routing()) return; if (selDrag) { window.Draw.commitSelected(); selDrag = null; downPt = null; setTimeout(mirror, 30); return; }
      if (drawing) { drawing = false; L2.fire('mouseup', { latlng: toLL(e.lngLat) }); setTimeout(mirror, 30); }
      else if (downPt && Math.hypot(e.point.x - downPt.x, e.point.y - downPt.y) < 4 && window.Draw) Draw.pickAt(toLL(e.lngLat));   // pressed and released on the spot = a real click → only NOW may pickAt deselect
      downPt = null; });
    map.on('click', e => { if (!on || routing()) return; const t = tool(); if (CLICK3.includes(t) || t === 'tarrow') { L2.fire('click', { latlng: toLL(e.lngLat) }); setTimeout(mirror, 60); } });
    map.on('dblclick', e => { if (!on || routing() || tool() !== 'tarrow') return; e.preventDefault(); L2.fire('dblclick', { latlng: toLL(e.lngLat), originalEvent: e.originalEvent }); setTimeout(mirror, 30); });
  }

  /* ---- camera sync ---- */
  function syncTo3D(fly) { const c = L2.getCenter(), z = Math.max(1, L2.getZoom() - 1); const opt = { center: [c.lng, c.lat], zoom: z }; fly ? map.easeTo({ ...opt, duration: 800 }) : map.jumpTo(opt); }
  function syncFrom3D() { const c = map.getCenter(); L2.setView([c.lat, c.lng], Math.round(map.getZoom() + 1), { animate: false }); }
  function syncBack() { if (!on || !map) return; backAt = Date.now(); try { syncFrom3D(); } catch (e) {} }   // guarded: the debounce can outlive exit()

  function enter() {
    ensure();
    if (!map) return;   // WebGL unavailable — ensure() already told the operator; stay in 2D rather than half-entering a broken 3D mode
    on = true; document.body.classList.add('mode-3d'); cont.classList.add('on');
    const cur = S.state.mapStyle || 'satellite'; if (builtStyle !== cur) { try { map.setStyle(styleUrl(cur)); builtStyle = cur; } catch (e) {} }   // pick up a style changed since last 3D session (on enter only — avoids mid-session aborts)
    map.resize(); syncTo3D(false);
    if (map.isStyleLoaded()) { addSceneLayers(); mirror(); }
    btn.classList.add('is-on'); ctrls.hidden = false;
    if (window.Movable) Movable.reflow();   // place/orient the unified drag grip now it's visible
    try { window.dispatchEvent(new Event('mode3d')); } catch (e) {}   // let mode-aware overlays (day/night) re-evaluate
  }
  function exit() { if (!on) return; on = false; clearTimeout(backT); syncFrom3D(); document.body.classList.remove('mode-3d'); cont.classList.remove('on'); btn.classList.remove('is-on'); ctrls.hidden = true; try { window.dispatchEvent(new Event('mode3d')); } catch (e) {} }
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
  // The PRESENTER never receives the granular 'active' event — a remote scene cut arrives only as 'sync'.
  // Track the active scene's signature so we can ease the 3D camera to the new scene on 'sync' too
  // (previously the presenter's 3D view stayed frozen on the old scene while the control cut scenes).
  let lastSceneSig = null;
  // sceneIndex(id) needs the id — called bare it findIndex'd against `undefined` and always returned -1,
  // collapsing the signature to bare coordinates. Two scenes framed identically (a duplicate, or two
  // scenes both left at the 29.5/45/z5 default) then looked identical and the 3D camera never re-eased.
  function sceneSig() { const sc = S.activeScene(); const v = sc && sc.view; return (sc ? sc.id : '-') + '|' + (v ? [v.lat, v.lng, v.zoom].join(',') : ''); }
  function easeToActiveScene() { const sc = S.activeScene(); if (on && map && sc && sc.view) map.easeTo({ center: [sc.view.lng, sc.view.lat], zoom: Math.max(1, sc.view.zoom - 1), duration: 900 }); }
  S.on((st, evt) => {
    if (evt === 'threed') { exaggeration = cfg3().exaggeration; if (on && map) { try { map.setTerrain({ source: 'dem', exaggeration }); } catch (e) {} map.easeTo({ pitch: cfg3().pitch, duration: 300 }); applyLabels3D(); applyProjection(); applyPerf(); } return; }
    if (evt === 'light3d') { if (on && map) applyLight(); return; }
    if (evt === 'mapstyle' || evt === 'sync') { if (on && map) { const cur = S.state.mapStyle || 'satellite'; if (builtStyle !== cur) {
      // Detach the custom three.js layers BEFORE the style swap — MapLibre throws internally
      // (shaderPreludeCode / signal) if it processes them mid-transition. onStyle re-adds them.
      ['models3d-gl', 'trk3d'].forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} });
      try { map.setStyle(styleUrl(cur)); builtStyle = cur; } catch (e) {} } } if (evt === 'mapstyle') return; }
    if (!on || !map) return;
    if (evt === 'active') { lastSceneSig = sceneSig(); easeToActiveScene(); setTimeout(mirror, 50); }
    // presenter path: a synced scene cut (or a scene view edit) changes the signature → follow it in 3D
    else if (evt === 'sync') { const sig = sceneSig(); if (sig !== lastSceneSig) { lastSceneSig = sig; easeToActiveScene(); } }
    if (evt === 'models3d') { mirrorRoutes(); return; }
    if (evt === 'overlays') { mirrorOverlays(); return; }
    if (['elements', 'reveal', 'scenes', 'active', 'sync', 'mode'].includes(evt)) mirror();
  });

  window.Map3D = { enter, exit, toggle, get on() { return on; }, get map() { return map; } };
})();
