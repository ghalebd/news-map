/* ============================================================
   SEAFX — realistic water caustics that render ONLY over the sea.
   A canvas pinned to the map container; the land (country polys)
   is cut out as a mask, so the effect never sits on land. Waves
   scale with the map zoom (connected to the map), drift slowly,
   and the wave size / colour / intensity / speed are configurable.
   Rebuilt on move-end (cheap), animated per-frame while still.
   ============================================================ */
(() => {
  const S = window.Store, map = window.GameMap.map;
  const cont = map.getContainer();
  const cv = document.createElement('canvas'); cv.className = 'seafx'; cont.appendChild(cv);
  const ctx = cv.getContext('2d');
  const mask = document.createElement('canvas'); const mctx = mask.getContext('2d');
  let tile = null, pat = null, off = 0, raf = null, paused = false, ready = false;

  const cfg = () => S.cfg().sea || {};
  const on = () => cfg().on && !document.body.classList.contains('mode-3d');
  const hexRGB = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0x3aa0ff; return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255 }; };

  /* seamless caustic tile — smaller waves = higher frequency */
  function makeTile() {
    const s = cfg(), wave = s.wave == null ? 36 : s.wave, bf = (0.02 + (100 - wave) / 100 * 0.09).toFixed(3);
    const c = hexRGB(s.color || '#3aa0ff');
    const mtx = `0 0 0 0 ${c.r} 0 0 0 0 ${c.g} 0 0 0 0 ${c.b} 0 0 0 2.4 -1.3`;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='${bf}' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix type='matrix' values='${mtx}'/></filter><rect width='256' height='256' filter='url(#c)'/></svg>`;
    const img = new Image(); img.onload = () => { tile = img; pat = null; ready = true; }; img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function bbox(c) { if (c._bb) return c._bb; let mnx = 180, mny = 90, mxx = -180, mxy = -90; const polys = c.g.type === 'Polygon' ? [c.g.coordinates] : c.g.coordinates; polys.forEach(p => p[0].forEach(([x, y]) => { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; })); return c._bb = [mnx, mny, mxx, mxy]; }

  function buildMask() {
    const sz = map.getSize(); cv.width = mask.width = sz.x; cv.height = mask.height = sz.y;
    mctx.clearRect(0, 0, sz.x, sz.y); mctx.fillStyle = '#fff'; mctx.fillRect(0, 0, sz.x, sz.y);
    mctx.globalCompositeOperation = 'destination-out'; mctx.fillStyle = '#000';
    const b = map.getBounds(), W = b.getWest() - 0.5, E = b.getEast() + 0.5, So = b.getSouth() - 0.5, N = b.getNorth() + 0.5;
    for (const c of (window.COUNTRIES || [])) {
      const bb = bbox(c); if (bb[2] < W || bb[0] > E || bb[3] < So || bb[1] > N) continue;
      const polys = c.g.type === 'Polygon' ? [c.g.coordinates] : c.g.coordinates;
      for (const poly of polys) {
        mctx.beginPath();
        for (const ring of poly) {
          let last = null, started = false;
          for (let i = 0; i < ring.length; i++) {
            const p = map.latLngToContainerPoint([ring[i][1], ring[i][0]]);
            if (last && Math.abs(p.x - last.x) < 1.5 && Math.abs(p.y - last.y) < 1.5 && i !== ring.length - 1) continue;
            if (!started) { mctx.moveTo(p.x, p.y); started = true; } else mctx.lineTo(p.x, p.y);
            last = p;
          }
          mctx.closePath();
        }
        mctx.fill('evenodd');
      }
    }
    mctx.globalCompositeOperation = 'source-over';
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!ready || !on() || paused) return;
    const s = cfg(), W = cv.width, H = cv.height;
    off += 0.18 * Math.max(0.2, 60 / (s.speed || 26));
    if (!pat) pat = ctx.createPattern(tile, 'repeat');
    const sc = Math.max(0.5, Math.min(2.6, map.getZoom() / 5));   // waves grow with zoom (connected to map)
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = (s.intensity == null ? 34 : s.intensity) / 100;
    const wrap = 256 * sc, m = new DOMMatrix(); m.translateSelf(off % wrap, (off * 0.6) % wrap); m.scaleSelf(sc, sc);
    try { pat.setTransform(m); } catch (e) {}
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over';
  }

  function show(v) { cv.style.opacity = v ? '1' : '0'; }
  function refresh() { if (!on()) { cv.style.display = 'none'; return; } cv.style.display = ''; buildMask(); show(true); }

  map.on('movestart zoomstart', () => show(false));
  map.on('moveend zoomend resize', () => { if (on()) { buildMask(); show(true); } });
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') { makeTile(); refresh(); } });
  makeTile(); refresh(); frame();
})();
