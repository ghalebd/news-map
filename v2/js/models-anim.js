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
  // position at normalised path param u∈[0,1] (loop wraps so the seam is continuous)
  function posAt(pts, segs, total, u, loop) {
    if (total === 0) return [pts[0][0], pts[0][1]];
    u = loop ? (u - Math.floor(u)) : Math.max(0, Math.min(1, u));
    let target = u * total, acc = 0, i = 0;
    while (i < segs.length && acc + segs[i] < target) { acc += segs[i]; i++; }
    if (i >= segs.length) i = segs.length - 1;
    const f = segs[i] ? (target - acc) / segs[i] : 0;
    const a = pts[i], b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  function alongPath(pts, t, auto, loop) {
    const segs = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) { const d = segLen(pts[i], pts[i + 1]); segs.push(d); total += d; }
    if (total === 0) return { lat: pts[0][0], lng: pts[0][1], rotZ: 0 };
    const here = posAt(pts, segs, total, t, loop);
    const pose = { lat: here[0], lng: here[1] };
    if (auto) {
      // Heading = the AVERAGE direction of travel over a window of the path centred on t, not the single
      // tiny current segment. Dense/jittery freehand points used to make the model wobble wildly
      // ("تسرح وتمرح", ±40°/frame) — each micro-segment pointed a different way. We sample the window and
      // sum UNIT step-vectors (robust to segment length + noise) → one stable direction of travel.
      // Deterministic (function of t only) → control and presenter stay in lockstep. +180: catalog GLB
      // noses sit on -Y, so a raw bearing would fly the model tail-first.
      // The window is biased AHEAD of t (look where you're going, only a little behind for stability):
      // it anticipates turns so the model banks smoothly into them instead of snapping at the corner,
      // and a forward window of all-forward steps doesn't cancel the way a centred one does across a
      // reversal (which used to make the heading flip 180° in a single frame mid-route).
      const SPAN = 0.18, N = 9, t0 = t - SPAN * 0.25; let sx = 0, sy = 0;
      let prev = posAt(pts, segs, total, t0, loop);
      for (let k = 1; k <= N; k++) {
        const cur = posAt(pts, segs, total, t0 + SPAN * k / N, loop);
        const dLng = (cur[1] - prev[1]) * cosMid(prev, cur), dLat = cur[0] - prev[0];
        const len = Math.hypot(dLng, dLat); if (len > 1e-9) { sx += dLng / len; sy += dLat / len; }
        prev = cur;
      }
      const head = (Math.hypot(sx, sy) < 0.5) ? bearing(here, posAt(pts, segs, total, t + SPAN, loop)) : (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360;
      pose.rotZ = (head + 180) % 360;
    }
    return pose;
  }

  // motion easing (shared with the timeline): smooth ease-in/out or linear
  const easeMode = () => ((S.cfg && S.cfg().easing) || 'inout');
  function ease(t) { if (easeMode() !== 'inout') return t; t = Math.max(0, Math.min(1, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  const lastPoses = {};   // id -> current animated pose (for the follow camera)
  let prevActive = new Set(), raf = null, idleFrames = 0;
  function frame() {
    const now = Date.now(), pm = {}, active = new Set();
    let any = false;
    // while the timeline is playing keyframes for a model, IT owns that model's pose — the route
    // animation steps aside so the two don't both write Models3D.tick and flicker.
    const tl = S.timeline ? S.timeline() : null;
    const tlOwns = id => !!(tl && tl.playing && tl.models && tl.models[id] && tl.models[id].length);
    models().forEach(m => {
      const r = m.route;
      if (!(r && r.play && r.pts && r.pts.length >= 2)) return;
      if (tlOwns(m.id)) return;
      any = true;
      const dur = Math.max(0.5, r.dur || 10);
      let p = ((now - (r.t0 || now)) / 1000) / dur, done = false;
      if (r.loop) { p = p - Math.floor(p); } else { if (p >= 1) { p = 1; done = true; } if (p < 0) p = 0; }
      const pose = alongPath(r.pts, ease(p), r.heading !== false, r.loop);
      pm[m.id] = pose; lastPoses[m.id] = pose; active.add(m.id);
      if (done && isCtrl) {   // finalize once, only from the control window
        S.updateModel3d(m.id, { lat: +pose.lat.toFixed(6), lng: +pose.lng.toFixed(6), rotZ: Math.round(pose.rotZ || m.rotZ || 0), route: Object.assign({}, r, { play: false, t0: 0 }) });
      }
    });
    // clear poses for models that just stopped
    prevActive.forEach(id => { if (!active.has(id)) { pm[id] = null; delete lastPoses[id]; } });
    prevActive = active;
    if (Object.keys(pm).length) window.Models3D.tick(pm);
    // self-gating: keep running while anything moves; coast ~0.5s after the last motion (to flush the
    // final pose + clear stopped models), then stop the loop — no idle 60fps when nothing is animating.
    idleFrames = any ? 0 : idleFrames + 1;
    if (idleFrames < 30) raf = requestAnimationFrame(frame); else raf = null;
  }
  function kick() { if (raf == null) { idleFrames = 0; raf = requestAnimationFrame(frame); } }
  // start the loop when a route begins (here or synced from control); it self-stops when idle
  S.on((st, evt) => { if ((evt === 'models3d' || evt === 'sync') && models().some(m => m.route && m.route.play)) kick(); });
  if (models().some(m => m.route && m.route.play)) kick();

  // expose start/stop helpers (used by the HUD / settings)
  window.ModelsAnim = {
    play(id) { const m = models().find(x => x.id === id); if (!m || !m.route || !(m.route.pts || []).length) return; S.updateModel3d(id, { route: Object.assign({}, m.route, { play: true, t0: Date.now() }) }); },
    stop(id) { const m = models().find(x => x.id === id); if (!m || !m.route) return; S.updateModel3d(id, { route: Object.assign({}, m.route, { play: false, t0: 0 }) }); },
    playing(id) { const m = models().find(x => x.id === id); return !!(m && m.route && m.route.play); },
    // current position of a model — live animated pose if moving, else its static placement (used by the follow camera)
    poseOf(id) { const m = models().find(x => x.id === id); if (!m) return null; return lastPoses[id] || { lat: m.lat, lng: m.lng, rotZ: m.rotZ || 0 }; },
  };
})();
