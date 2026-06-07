/* ============================================================
   THEME — apply the live style config to CSS variables + the
   SVG refraction filter. Shared by Control and Presenter.
   ============================================================ */
const Theme = (() => {
  const R = document.documentElement.style;
  const hexToRgb = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  function apply(s) {
    if (!s) return;
    if (s.accent) {
      const [r, g, b] = hexToRgb(s.accent);
      R.setProperty('--accent', s.accent);
      R.setProperty('--accent-soft', `rgba(${r},${g},${b},.16)`);
      R.setProperty('--accent-glow', `0 0 18px rgba(${r},${g},${b},.5)`);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      R.setProperty('--accent-ink', lum > 150 ? '#06122b' : '#ffffff');
    }
    if (s.glass != null) { const op = s.glass / 100; R.setProperty('--glass', `rgba(22,27,38,${op})`); R.setProperty('--glass-2', `rgba(32,38,52,${Math.max(0, op - 0.05).toFixed(3)})`); }
    if (s.blur != null) R.setProperty('--blur', s.blur + 'px');
    if (s.radius != null) { R.setProperty('--r', s.radius + 'px'); R.setProperty('--r-sm', Math.max(2, s.radius - 4) + 'px'); }
    if (s.distort != null) { const d = document.getElementById('glassDisp'); if (d) d.setAttribute('scale', s.distort); }
  }
  return { apply };
})();
window.Theme = Theme;
