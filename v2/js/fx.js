/* ============================================================
   FX — ambient broadcast overlays driven by config (synced):
   • grid   : aesthetic square grid (HUD)
   • sea    : organic water caustics (SVG fractal-noise, drifting)
   • clouds : soft drifting clouds (SVG fractal-noise)
   Full-screen, pointer-transparent, above the maps / below the UI,
   hidden under body.ui-hidden.
   ============================================================ */
(() => {
  const S = window.Store;
  const mk = c => { const e = document.createElement('div'); e.className = c; document.body.appendChild(e); return e; };
  const grid = mk('fxgrid'), sea = mk('fxsea'), clouds = mk('fxclouds');

  const hexA = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(127,176,255,${a})`; const n = parseInt(m[1], 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const svgURL = svg => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  // bluish water caustics tile (alpha from fractal noise)
  const SEA = svgURL(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='s'><feTurbulence type='fractalNoise' baseFrequency='0.016 0.03' numOctaves='2' seed='5'/><feColorMatrix type='matrix' values='0 0 0 0 0.30  0 0 0 0 0.68  0 0 0 0 0.96  0 0 0 1.3 -0.45'/></filter><rect width='320' height='320' filter='url(#s)'/></svg>`);
  // soft white clouds tile
  const CLOUD = svgURL(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='0.008' numOctaves='4' seed='11'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 -0.32'/></filter><rect width='600' height='600' filter='url(#c)'/></svg>`);
  sea.style.backgroundImage = SEA;
  clouds.style.backgroundImage = CLOUD;

  function render() {
    const g = S.cfg().grid || {}, w = (g.weight || 1), col = hexA(g.color, 1);
    if (g.on) {
      grid.hidden = false;
      grid.style.opacity = (g.opacity == null ? 16 : g.opacity) / 100;
      grid.style.backgroundImage = `linear-gradient(${col} ${w}px, transparent ${w}px), linear-gradient(90deg, ${col} ${w}px, transparent ${w}px)`;
      grid.style.backgroundSize = `${g.size || 60}px ${g.size || 60}px`;
    } else grid.hidden = true;

    const s = S.cfg().sea || {};
    if (s.on) { sea.hidden = false; sea.style.opacity = (s.intensity == null ? 30 : s.intensity) / 100; sea.style.animationDuration = (s.speed || 26) + 's'; }
    else sea.hidden = true;

    const c = S.cfg().clouds || {};
    if (c.on) { clouds.hidden = false; clouds.style.opacity = (c.amount == null ? 35 : c.amount) / 100; clouds.style.animationDuration = (c.speed || 60) + 's'; }
    else clouds.hidden = true;
  }
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') render(); });
  render();
})();
