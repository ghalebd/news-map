/* ============================================================
   FX — ambient broadcast overlays driven by config (synced):
   • grid : an aesthetic square grid (HUD) over the map
   • sea  : a subtle animated water-shimmer wash
   Both are full-screen, pointer-transparent, sit above the maps
   but below the UI, and hide under body.ui-hidden.
   ============================================================ */
(() => {
  const S = window.Store;
  const grid = document.createElement('div'); grid.className = 'fxgrid'; document.body.appendChild(grid);
  const sea = document.createElement('div'); sea.className = 'fxsea'; document.body.appendChild(sea);

  const hexA = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(127,176,255,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

  function render() {
    const g = S.cfg().grid || {}, w = (g.weight || 1), col = hexA(g.color, 1);
    if (g.on) {
      grid.hidden = false;
      grid.style.opacity = (g.opacity == null ? 16 : g.opacity) / 100;
      grid.style.backgroundImage = `linear-gradient(${col} ${w}px, transparent ${w}px), linear-gradient(90deg, ${col} ${w}px, transparent ${w}px)`;
      grid.style.backgroundSize = `${g.size || 60}px ${g.size || 60}px`;
    } else grid.hidden = true;

    const s = S.cfg().sea || {};
    if (s.on) {
      sea.hidden = false;
      sea.style.opacity = (s.intensity == null ? 35 : s.intensity) / 100;
      sea.style.animationDuration = (s.speed || 9) + 's';
    } else sea.hidden = true;
  }
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') render(); });
  render();
})();
