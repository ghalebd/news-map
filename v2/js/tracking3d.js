/* ============================================================
   TRACKING3D — live ships & flights in the 3D map, rebuilt as a
   NATIVE MapLibre symbol layer (not three.js). Each target is a
   flat icon that ALWAYS faces the camera (billboard) and rotates
   to its true heading — like a flight-radar. This reads clearly
   from ANY camera angle (never goes flat/bent), is GPU-batched in
   a single layer (fast — no extra WebGL renderer), and sits on the
   live positions from window.Tracking, refreshed on a timer.
   config.track3d (synced): { on, shipKm, planeKm }.
   ============================================================ */
(() => {
  const S = window.Store;
  if (!S) return;
  const SRC = 'trk3d', LYR = 'trk3d-sym';
  const cfg = () => Object.assign({ on: true, shipKm: 5, planeKm: 4 }, S.cfg().track3d || {});
  const TS = () => S.cfg().trackStyle || {};
  let glmap = null, ready = false, lastColors = '';

  /* ---- crisp top-view icons drawn on a canvas (pointing UP = north at heading 0) ---- */
  function draw(kind, color) {
    const S2 = 64, cv = document.createElement('canvas'); cv.width = cv.height = S2 * 2;
    const x = cv.getContext('2d'); x.scale(2, 2);
    x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = 'rgba(3,10,20,.92)'; x.lineWidth = 3; x.fillStyle = color;
    const poly = pts => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); x.stroke(); };
    if (kind === 'plane') {
      poly([[32, 7], [37, 17], [37, 30], [60, 43], [60, 49], [37, 42], [37, 52], [46, 58], [46, 61], [32, 57], [18, 61], [18, 58], [27, 52], [27, 42], [4, 49], [4, 43], [27, 30], [27, 17]]); // swept airliner
    } else {
      poly([[32, 6], [43, 22], [43, 50], [38, 58], [26, 58], [21, 50], [21, 22]]); // ship hull, pointed bow up
      x.fillStyle = 'rgba(3,12,22,.85)'; x.fillRect(27, 30, 10, 16);               // bridge block (dark)
    }
    return x.getImageData(0, 0, cv.width, cv.height);
  }
  function ensureIcons(map) {
    const sc = TS().shipColor || '#36c8ff', fc = TS().flightColor || '#ffcf4d';
    ['trk-ship', 'trk-plane'].forEach((id, i) => {
      const img = draw(i ? 'plane' : 'ship', i ? fc : sc);
      try { if (map.hasImage(id)) map.removeImage(id); } catch (e) {}
      try { map.addImage(id, img, { pixelRatio: 2 }); } catch (e) {}
    });
    lastColors = sc + fc;
  }

  /* ---- live features from window.Tracking ---- */
  function fc() {
    const T = window.Tracking, c = cfg(), feats = [];
    if (c.on && T) {
      if (T.Ships && T.Ships.on && T.Ships.ships) for (const [, s] of T.Ships.ships) { if (s.lat == null) continue; feats.push(pt(s.lng, s.lat, 'ship', s.course != null ? s.course : (s.heading || 0))); }
      if (T.Flights && T.Flights.on && T.Flights.flights) for (const [, f] of T.Flights.flights) { if (f.lat == null) continue; feats.push(pt(f.lng, f.lat, 'plane', f.heading || 0)); }
    }
    return { type: 'FeatureCollection', features: feats };
  }
  const pt = (lng, lat, kind, hdg) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { kind, hdg: Math.round(hdg) || 0 } });

  // clearly visible by default (icon canvas is 64px → size 1.0 ≈ 64px on screen); km slider scales it
  const sizeExpr = () => { const c = cfg(); const sz = km => Math.max(0.7, Math.min(2.2, (km || 5) / 5 * 0.95)); return ['match', ['get', 'kind'], 'plane', sz(c.planeKm), sz(c.shipKm)]; };

  function attach3D(map) {
    glmap = map; ensureIcons(map);
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: fc() });
    if (!map.getLayer(LYR)) {
      map.addLayer({
        id: LYR, type: 'symbol', source: SRC,
        layout: {
          'icon-image': ['match', ['get', 'kind'], 'plane', 'trk-plane', 'trk-ship'],
          'icon-size': sizeExpr(),
          'icon-rotate': ['get', 'hdg'],
          'icon-rotation-alignment': 'map',   // heading is geographic (relative to map north)
          'icon-pitch-alignment': 'viewport', // ALWAYS face the camera — never lies flat on a tilt
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
        },
      });
    }
    ready = true; update();
  }

  function update() {
    if (!glmap || !ready) return;
    if ((TS().shipColor || '#36c8ff') + (TS().flightColor || '#ffcf4d') !== lastColors) ensureIcons(glmap);
    const src = glmap.getSource(SRC); if (src) src.setData(fc());
    try { glmap.setLayoutProperty(LYR, 'icon-size', sizeExpr()); } catch (e) {}
  }

  // refresh while in 3D (live positions update slowly) + on relevant store changes
  setInterval(() => { if (window.Map3D && Map3D.on) update(); }, 700);
  S.on((st, evt) => { if ((evt === 'tracking' || evt === 'config' || evt === 'sync' || evt === 'track3d') && window.Map3D && Map3D.on) update(); });

  window.Tracking3D = {
    attach3D, refresh: update,
    _counts() { try { return { ships: fc().features.filter(f => f.properties.kind === 'ship').length, planes: fc().features.filter(f => f.properties.kind === 'plane').length }; } catch (e) { return null; } },
  };
})();
