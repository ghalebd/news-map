/* ============================================================
   DAYNIGHT — real-time day/night shading (solar terminator).
   A canvas over the map shades the night hemisphere with a soft
   twilight gradient computed from the sun's position. Updates on
   map move/zoom and every minute. config.dayNight (synced):
   { on, opacity, live, offsetH }  (offsetH shifts the clock).
   ============================================================ */
(() => {
  const S = window.Store, map = window.GameMap.map;
  const cont = map.getContainer();
  const cv = document.createElement('canvas'); cv.className = 'dnfx'; cont.appendChild(cv);
  const ctx = cv.getContext('2d');
  let raf = null, timer = null;
  const cfg = () => S.cfg().dayNight || {};
  const on = () => cfg().on && !document.body.classList.contains('mode-3d');

  // solar elevation (deg) at lat/lng for a given Date (approx NOAA)
  function elevation(lat, lng, date) {
    const rad = Math.PI / 180;
    const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lambda = (L * rad) + 1.915 * rad * Math.sin(g) + 0.020 * rad * Math.sin(2 * g);
    const eps = 23.439 * rad;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const gmst = (280.46061837 + 360.98564736629 * n) % 360;
    const ha = ((gmst + lng) * rad) - ra;
    const phi = lat * rad;
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha)) / rad;
  }

  function draw() {
    const sz = map.getSize(); if (cv.width !== sz.x || cv.height !== sz.y) { cv.width = sz.x; cv.height = sz.y; }
    ctx.clearRect(0, 0, cv.width, cv.height);
    const c = cfg(), maxA = (c.opacity == null ? 60 : c.opacity) / 100;
    const date = new Date(Date.now() + (c.live === false ? 0 : 0) + (c.offsetH || 0) * 3600000);
    const step = 12;
    for (let x = 0; x < cv.width + step; x += step) {
      for (let y = 0; y < cv.height + step; y += step) {
        const ll = map.containerPointToLatLng([x, y]);
        const el = elevation(ll.lat, ll.lng, date);
        if (el >= 0) continue;                       // daylight
        const t = Math.min(1, -el / 12);             // 0 at terminator → 1 deep night (≤ -12°)
        ctx.fillStyle = `rgba(6,12,28,${(0.12 + t * 0.88) * maxA})`;
        ctx.fillRect(x - step, y - step, step + 1, step + 1);
      }
    }
  }
  function loop() { raf = requestAnimationFrame(loop); }   // (kept for parity; we redraw on events/timer)
  function refresh() { if (!on()) { cv.style.display = 'none'; return; } cv.style.display = ''; draw(); }

  map.on('move zoom moveend zoomend resize', () => { if (on()) draw(); });
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') refresh(); });
  clearInterval(timer); timer = setInterval(() => { if (on()) draw(); }, 60000);
  refresh();
})();
