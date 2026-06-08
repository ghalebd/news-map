/* ============================================================
   FX — ambient overlays (grid + drifting clouds + rule-of-thirds).
   The sea/water lives in seafx.js. Grid and clouds are ANCHORED TO
   THE MAP: they pan and zoom with it (a geographic graticule, and a
   cloud field pinned to the ground) instead of floating in screen
   space. Clouds drift via JS so the anchor and the drift compose.
   ============================================================ */
(() => {
  const S = window.Store, map = window.GameMap.map;
  const mk = c => { const e = document.createElement('div'); e.className = c; document.body.appendChild(e); return e; };
  const grid = mk('fxgrid'), clouds = mk('fxclouds'), thirds = mk('fxthirds');
  const hexA = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(127,176,255,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

  /* ---- clouds: a large seamless noise field pinned to the ground ---- */
  function cloudTile() {
    const c = S.cfg().clouds || {}, soft = c.softness == null ? 55 : c.softness;
    const off = (0.12 + (100 - soft) / 100 * 0.5).toFixed(2);
    const gain = (0.8 + soft / 100 * 0.9).toFixed(2);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='0.0035' numOctaves='6' seed='11' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${gain} 0 0 0 -${off}'/></filter><rect width='1024' height='1024' filter='url(#c)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  // cloud cells scale with zoom so the field reads as fixed-size cloud cover
  function cloudSize() { const c = S.cfg().clouds || {}; return Math.round(900 * ((c.size || 50) / 50) * Math.pow(2, (map.getZoom() - 5) / 2.3)); }
  let drift = 0;
  function anchorClouds() {
    const c = S.cfg().clouds || {}; if (!c.on) return;
    const o = map.latLngToContainerPoint([0, 0]), bs = cloudSize();
    clouds.style.backgroundSize = bs + 'px ' + bs + 'px';
    clouds.style.backgroundPosition = `${o.x + drift}px ${o.y + drift * 0.35}px`;   // ground anchor + slow drift
  }

  /* ---- grid: a real ground graticule — cells are a fixed geographic size, so
     they grow when you zoom in and pan with the map (anchored to [0,0]) ---- */
  function anchorGrid() {
    const g = S.cfg().grid || {}; if (!g.on) return;
    const sizePx = (g.size || 60) * Math.pow(2, map.getZoom() - 6);   // fixed on-ground cell → scales with zoom
    const o = map.latLngToContainerPoint([0, 0]);
    grid.style.backgroundSize = `${sizePx}px ${sizePx}px`;
    grid.style.backgroundPosition = `${o.x}px ${o.y}px`;
  }

  function render() {
    const g = S.cfg().grid || {}, w = (g.weight || 1), col = hexA(g.color, 1);
    if (g.on) {
      grid.hidden = false;
      grid.style.opacity = (g.opacity == null ? 16 : g.opacity) / 100;
      grid.style.backgroundImage = `linear-gradient(${col} ${w}px, transparent ${w}px), linear-gradient(90deg, ${col} ${w}px, transparent ${w}px)`;
      anchorGrid();
    } else grid.hidden = true;
    thirds.hidden = !S.cfg().thirds;
    const c = S.cfg().clouds || {};
    if (c.on) { clouds.hidden = false; clouds.style.backgroundImage = cloudTile(); clouds.style.opacity = (c.amount == null ? 32 : c.amount) / 100; anchorClouds(); } else clouds.hidden = true;
  }

  // anchor continuously so grid/clouds track the map (cheap style updates)
  map.on('move zoom moveend zoomend resize', () => { anchorGrid(); anchorClouds(); });
  // slow drift, only while clouds are on
  setInterval(() => { const c = S.cfg().clouds || {}; if (!c.on || document.body.classList.contains('mode-3d')) return; drift += 30 / Math.max(8, c.speed || 70); anchorClouds(); }, 90);
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') render(); });
  render();
})();
