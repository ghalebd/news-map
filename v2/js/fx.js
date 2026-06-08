/* ============================================================
   FX — ambient overlays (grid + drifting clouds). The sea/water
   lives in seafx.js (masked to the sea). Clouds use a SEAMLESS
   fractal-noise tile (stitchTiles → no cut squares) that drifts
   and whose size scales with the map zoom (connected to the map).
   ============================================================ */
(() => {
  const S = window.Store, map = window.GameMap.map;
  const mk = c => { const e = document.createElement('div'); e.className = c; document.body.appendChild(e); return e; };
  const grid = mk('fxgrid'), clouds = mk('fxclouds');
  const hexA = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(127,176,255,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

  function cloudTile() {
    const c = S.cfg().clouds || {}, soft = c.softness == null ? 55 : c.softness;
    const off = (0.12 + (100 - soft) / 100 * 0.5).toFixed(2);   // lower softness ⇒ more coverage
    const gain = (0.8 + soft / 100 * 0.9).toFixed(2);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='700' height='700'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='0.006' numOctaves='5' seed='11' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${gain} 0 0 0 -${off}'/></filter><rect width='700' height='700' filter='url(#c)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  function cloudSize() { const c = S.cfg().clouds || {}, zf = Math.pow(2, (map.getZoom() - 5) / 3); return Math.round(520 * ((c.size || 50) / 50) * zf); }

  function renderClouds() {
    const c = S.cfg().clouds || {};
    if (!c.on) { clouds.hidden = true; return; }
    clouds.hidden = false;
    clouds.style.backgroundImage = cloudTile();
    const bs = cloudSize(); clouds.style.backgroundSize = bs + 'px ' + bs + 'px';
    clouds.style.opacity = (c.amount == null ? 32 : c.amount) / 100;
    clouds.style.animationDuration = (c.speed || 70) + 's';
  }
  function render() {
    const g = S.cfg().grid || {}, w = (g.weight || 1), col = hexA(g.color, 1);
    if (g.on) {
      grid.hidden = false;
      grid.style.opacity = (g.opacity == null ? 16 : g.opacity) / 100;
      grid.style.backgroundImage = `linear-gradient(${col} ${w}px, transparent ${w}px), linear-gradient(90deg, ${col} ${w}px, transparent ${w}px)`;
      grid.style.backgroundSize = `${g.size || 60}px ${g.size || 60}px`;
    } else grid.hidden = true;
    renderClouds();
  }
  map.on('zoomend', () => { if (!(S.cfg().clouds || {}).on) return; const bs = cloudSize(); clouds.style.backgroundSize = bs + 'px ' + bs + 'px'; });
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') render(); });
  render();
})();
