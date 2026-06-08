/* ============================================================
   MODELS-ANIM — drives model movement along a drawn route, on
   BOTH maps. Each model may carry:
     m.route = { pts:[[lat,lng]…], dur:sec, loop:bool, heading:bool, play:bool, t0:ms }
   When play is true, every window computes the same position from
   the shared t0 (synced via the Store) and feeds it to Models3D as
   a transient pose — no per-frame Store writes. On finish (non-loop)
   the control window writes the final position once and clears play.
   ============================================================ */
(() => {
  const S = window.Store;
  if (!S || !window.Models3D) return;
  const models = () => (S.models3d ? S.models3d() : []);
  const isCtrl = window.APP_ROLE === 'control';

  // equirectangular helpers (small distances — fine for interpolation/bearing)
  const cosMid = (a, b) => Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
  function segLen(a, b) { const dx = (b[1] - a[1]) * cosMid(a, b), dy = b[0] - a[0]; return Math.hypot(dx, dy); }
  function bearing(a, b) { const dLng = (b[1] - a[1]) * cosMid(a, b), dLat = b[0] - a[0]; return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360; }
  function alongPath(pts, t, auto) {
    const segs = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) { const d = segLen(pts[i], pts[i + 1]); segs.push(d); total += d; }
    if (total === 0) return { lat: pts[0][0], lng: pts[0][1] };
    let target = t * total, acc = 0, i = 0;
    while (i < segs.length && acc + segs[i] < target) { acc += segs[i]; i++; }
    if (i >= segs.length) i = segs.length - 1;
    const f = segs[i] ? (target - acc) / segs[i] : 0;
    const a = pts[i], b = pts[i + 1];
    const pose = { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f };
    if (auto) pose.rotZ = bearing(a, b);
    return pose;
  }

  let prevActive = new Set(), raf = null;
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = Date.now(), pm = {}, active = new Set();
    let any = false;
    models().forEach(m => {
      const r = m.route;
      if (!(r && r.play && r.pts && r.pts.length >= 2)) return;
      any = true;
      const dur = Math.max(0.5, r.dur || 10);
      let p = ((now - (r.t0 || now)) / 1000) / dur, done = false;
      if (r.loop) { p = p - Math.floor(p); } else { if (p >= 1) { p = 1; done = true; } if (p < 0) p = 0; }
      const pose = alongPath(r.pts, p, r.heading !== false);
      pm[m.id] = pose; active.add(m.id);
      if (done && isCtrl) {   // finalize once, only from the control window
        S.updateModel3d(m.id, { lat: +pose.lat.toFixed(6), lng: +pose.lng.toFixed(6), rotZ: Math.round(pose.rotZ || m.rotZ || 0), route: Object.assign({}, r, { play: false, t0: 0 }) });
      }
    });
    // clear poses for models that just stopped
    prevActive.forEach(id => { if (!active.has(id)) pm[id] = null; });
    prevActive = active;
    if (Object.keys(pm).length) window.Models3D.tick(pm);
  }
  frame();

  // expose start/stop helpers (used by the HUD / settings)
  window.ModelsAnim = {
    play(id) { const m = models().find(x => x.id === id); if (!m || !m.route || !(m.route.pts || []).length) return; S.updateModel3d(id, { route: Object.assign({}, m.route, { play: true, t0: Date.now() }) }); },
    stop(id) { const m = models().find(x => x.id === id); if (!m || !m.route) return; S.updateModel3d(id, { route: Object.assign({}, m.route, { play: false, t0: 0 }) }); },
    playing(id) { const m = models().find(x => x.id === id); return !!(m && m.route && m.route.play); },
  };
})();
