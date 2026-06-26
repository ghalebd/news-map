/* ============================================================
   FOLLOW CAMERA — lock the camera onto a moving target (a 3D/2D
   model along its route, or a live ship / flight) and keep it
   centred, smoothly, on BOTH the flat and 3D maps. Runs in every
   window and reads the synced config.follow = { on, kind, id, zoom }
   so the presenter follows in lockstep with the control console.
   ============================================================ */
(() => {
  const S = window.Store;
  if (!S) return;
  const cfg = () => (S.cfg && S.cfg().follow) || {};

  // resolve the target's current geographic position
  function targetPos() {
    const f = cfg(); if (!f.on || !f.id) return null;
    try {
      if (f.kind === 'model') return window.ModelsAnim && ModelsAnim.poseOf ? ModelsAnim.poseOf(f.id) : null;
      if (f.kind === 'ship') { const s = window.Tracking && Tracking.Ships && Tracking.Ships.ships.get(f.id); return s ? { lat: s.lat, lng: s.lng } : null; }
      if (f.kind === 'flight') { const a = window.Tracking && Tracking.Flights && Tracking.Flights.flights.get(f.id); return a ? { lat: a.lat, lng: a.lng } : null; }
    } catch (e) {}
    return null;
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  let raf = null;
  function tick() {
    raf = requestAnimationFrame(tick);
    const f = cfg(); if (!f.on) return;
    // CAMERA PRIORITY: a deliberately-playing timeline or camera-path owns the camera — yield to it
    // so the two don't fight over the centre every frame (the visible jitter the operator reported).
    const c = S.cfg(); if ((c.timeline && c.timeline.playing) || (c.campath && c.campath.playing)) return;
    const pos = targetPos(); if (!pos || pos.lat == null) return;
    const k = 0.14;   // smoothing — camera eases toward the target each frame
    try {
      if (window.Map3D && Map3D.on && Map3D.map) {
        const c = Map3D.map.getCenter();
        const lng = lerp(c.lng, pos.lng, k), lat = lerp(c.lat, pos.lat, k);
        Map3D.map.setCenter([lng, lat]);
        if (f.zoom != null && Math.abs(Map3D.map.getZoom() - f.zoom) > 0.05) Map3D.map.setZoom(lerp(Map3D.map.getZoom(), f.zoom, k));
      } else if (window.GameMap && GameMap.map) {
        const m = GameMap.map, c = m.getCenter();
        const lat = lerp(c.lat, pos.lat, k), lng = lerp(c.lng, pos.lng, k);
        m.panTo([lat, lng], { animate: false });
        if (f.zoom != null && Math.abs(m.getZoom() - f.zoom) > 0.05) m.setZoom(Math.round(lerp(m.getZoom(), f.zoom, k) * 100) / 100, { animate: false });
      }
    } catch (e) {}
  }
  tick();

  // public helpers for the HUD / settings
  window.Follow = {
    set(kind, id, opts) { const c = S.cfg(); if (c.timeline && c.timeline.playing) S.setTimeline({ playing: false }); if (c.campath && c.campath.playing) S.setCampath({ playing: false }); S.setFollow(Object.assign({ on: true, kind, id }, opts || {})); },
    stop() { S.setFollow({ on: false, id: null, kind: null }); },
    isFollowing(kind, id) { const f = cfg(); return !!(f.on && f.kind === kind && f.id === id); },
    active() { return !!cfg().on; },
    // live list of followable targets for the settings dropdown
    targets() {
      const out = [];
      (S.models3d ? S.models3d() : []).forEach(m => out.push({ kind: 'model', id: m.id, name: (m.name || 'Model') + ' (model)' }));
      try { if (window.Tracking && Tracking.Ships) for (const [id, s] of Tracking.Ships.ships) out.push({ kind: 'ship', id, name: (s.name || ('Ship ' + id)) + ' (ship)' }); } catch (e) {}
      try { if (window.Tracking && Tracking.Flights) for (const [id, a] of Tracking.Flights.flights) out.push({ kind: 'flight', id, name: (a.callsign || ('Flight ' + id)) + ' (flight)' }); } catch (e) {}
      return out;
    },
  };
})();
