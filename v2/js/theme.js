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
    if (s.sat != null) R.setProperty('--glass-sat', s.sat);
    if (s.brightness != null) R.setProperty('--glass-bright', (s.brightness / 100));
    if (s.sheen != null) R.setProperty('--sheen', `inset 0 1px 0 rgba(255,255,255,${(s.sheen / 100).toFixed(3)})`);
    if (s.shadow != null) { const k = s.shadow; R.setProperty('--shadow', `0 ${Math.round(10 * k)}px ${Math.round(34 * k)}px rgba(0,0,0,${Math.min(0.7, 0.42 * k).toFixed(2)})`); }
  }
  return { apply };
})();
window.Theme = Theme;
