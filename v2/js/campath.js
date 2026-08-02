/* ============================================================
   CAMPATH — record / replay a camera path. The operator captures
   map views as keyframes; playback flies smoothly through them
   (looping optional). Frames + timing live in config.campath
   (synced), and a 'playing' flag drives deterministic local
   playback in every window, so the presenter and control mirror
   the same move. In 3D the MapLibre camera flies instead.
   ============================================================ */
(() => {
  const S = window.Store, map = window.GameMap.map;
  let running = false, idx = 0, timer = null;
  const cp = () => S.cfg().campath || { frames: [], legSec: 3, loop: false };

  function flyTo(f, dur) {
    if (window.Map3D && Map3D.on && Map3D.map) { Map3D.map.easeTo({ center: [f.lng, f.lat], zoom: Math.max(1, f.zoom - 1), duration: dur * 1000 }); }   // Map3D.map is the sanctioned accessor; window.__m3 is a debug hook
    else map.flyTo([f.lat, f.lng], f.zoom, { duration: dur, easeLinearity: 0.25 });
  }
  function step() {
    const c = cp(); if (!c.frames.length) { stop(true); return; }
    const leg = Math.max(1, c.legSec || 3);
    flyTo(c.frames[idx], leg);
    timer = setTimeout(() => {
      idx++;
      if (idx >= c.frames.length) { if (c.loop) { idx = 0; step(); } else stop(true); }
      else step();
    }, leg * 1000);
  }
  function start() {
    if (running) return; if (!cp().frames.length) return;
    // last deliberate camera action wins — release follow + timeline so they don't fight the path
    if (window.APP_ROLE === 'control') { const c = S.cfg(); if (c.follow && c.follow.on) S.setFollow({ on: false }); if (c.timeline && c.timeline.playing) S.setTimeline({ playing: false }); }
    running = true; idx = 0; step();
  }
  function stop(finished) {
    running = false; clearTimeout(timer); timer = null;
    // Clearing the timer only ended the SCHEDULING — the leg already handed to flyTo/easeTo kept coasting,
    // so pressing Stop (or the presenter adopting playing:false mid-leg) parked the on-air camera on an
    // arbitrary intermediate framing that was never a keyframe. Cancel the in-flight animation too.
    try { const g = (window.Map3D && Map3D.on && Map3D.map); (g || map).stop(); } catch (e) {}
    if (finished && window.APP_ROLE === 'control' && (S.cfg().campath || {}).playing) S.setCampath({ playing: false });
  }
  S.on((st, evt) => {
    if (evt !== 'config' && evt !== 'sync') return;
    const playing = cp().playing;
    if (playing && !running) start();
    else if (!playing && running) stop(false);
  });
})();
