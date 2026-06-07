/* ============================================================
   MOVABLE — every on-screen panel carries an elegant in-panel
   drag grip (Notion/Linear-style 6-dot handle that fades in on
   hover). Positions + per-panel scale persist in config.layout
   (synced). The .brand logo routes through config.brand. The
   vertical tool bar is locked to vertical movement only.
   Handles vanish under body.ui-hidden (clean on-air output).
   window.Movable exposes panels/setScale/resetPanel for settings.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  // [selector, label, axis]   axis: 'both' | 'y' | 'x'
  const PANELS = [
    ['.brand', 'Logo', 'both'],
    ['.status', 'Coordinates', 'both'],
    ['.modesw', 'Mode switch', 'both'],
    ['.deck', 'Scene deck', 'both'],
    ['.nownext', 'Now / Next', 'both'],
    ['.qtools', 'Tool bar', 'y'],
    ['.zoomctl', 'Zoom controls', 'both'],
    ['.locator', 'Locator', 'both'],
    ['.sceneins', 'Scene inspector', 'both'],
    ['.lthird', 'Lower third', 'both'],
    ['.bcast-banner', 'Banner', 'both'],
    ['.bcast-ticker', 'Ticker', 'both'],
  ];
  const meta = {}; PANELS.forEach(([sel, label, axis]) => meta[sel] = { label, axis });
  const els = {}; const handles = {};
  let pending = null;

  /* the grab tabs live on <body> (fixed) so panel overflow can never clip them */
  function positionHandle(el, hd) {
    if (!el || !hd) return;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden || (r.width === 0 && r.height === 0)) { hd.style.display = 'none'; return; }
    hd.style.display = '';
    hd.style.left = Math.round(r.left + r.width / 2) + 'px';
    hd.style.top = Math.round(r.top + 6) + 'px';   // CSS lifts it up via translate(-50%,-100%)
  }
  function reflow() { for (const sel in handles) positionHandle(els[sel], handles[sel]); }

  function styleAt(el, x, y, s) {
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.transform = (s && s !== 1) ? `scale(${s})` : 'none';
    el.style.transformOrigin = 'top left';
  }
  function clearStyle(el) { el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.transform = el.style.transformOrigin = ''; }

  function commit(sel, x, y, h, s) {
    if (sel === '.brand') { S.setBrand({ x: Math.round(x), y: Math.round(y + h / 2) }); }   // applyBrand re-centres via translateY(-50%)
    else { const cur = (S.cfg().layout || {})[sel] || {}; S.setLayout(sel, { x: Math.round(x), y: Math.round(y), s: s != null ? s : cur.s }); }
  }

  function startDrag(el, sel, hd, e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const axis = meta[sel].axis, rect = el.getBoundingClientRect();
    const s = (S.cfg().layout && S.cfg().layout[sel] && S.cfg().layout[sel].s) || 1;
    const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
    hd.classList.add('is-drag'); document.body.classList.add('mv-dragging');
    function mv(ev) {
      let nx = axis === 'y' ? rect.left : ev.clientX - ox;
      let ny = axis === 'x' ? rect.top : ev.clientY - oy;
      nx = Math.max(0, Math.min(nx, window.innerWidth - rect.width));
      ny = Math.max(0, Math.min(ny, window.innerHeight - rect.height));
      styleAt(el, nx, ny, s); positionHandle(el, hd); pending = { sel, x: nx, y: ny, h: rect.height, s };
    }
    function up() {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      hd.classList.remove('is-drag'); document.body.classList.remove('mv-dragging');
      if (pending) { commit(pending.sel, pending.x, pending.y, pending.h, pending.s); pending = null; }
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  function attach(sel) {
    const el = document.querySelector(sel); if (!el || el.dataset.movable != null) return;
    els[sel] = el; el.dataset.movable = '';
    const hd = document.createElement('button'); hd.className = 'mvh'; hd.title = 'Drag to move' + (meta[sel].axis === 'y' ? ' (up / down)' : ''); hd.innerHTML = I.gripH;
    hd.addEventListener('pointerdown', e => startDrag(el, sel, hd, e));
    document.body.appendChild(hd); handles[sel] = hd;
    el.addEventListener('transitionend', () => positionHandle(el, hd));
  }

  function applyLayout() {
    const lay = S.cfg().layout || {};
    for (const [sel] of PANELS) {
      if (sel === '.brand') continue;            // handled by applyBrand
      const el = els[sel]; if (!el) continue;
      const p = lay[sel];
      if (p && (p.x != null || p.s)) {
        const w = el.offsetWidth, hh = el.offsetHeight;
        const x = p.x != null ? Math.max(0, Math.min(p.x, window.innerWidth - w)) : 0;
        const y = p.y != null ? Math.max(0, Math.min(p.y, window.innerHeight - hh)) : 0;
        styleAt(el, x, y, p.s || 1);
      } else clearStyle(el);
    }
    reflow();
  }

  PANELS.forEach(([sel]) => attach(sel));
  applyLayout();
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') applyLayout(); else if (evt === 'mode') reflow(); });
  window.addEventListener('resize', applyLayout);
  setTimeout(reflow, 300);   // settle after fonts/layout

  window.Movable = {
    panels: PANELS.filter(([sel]) => sel !== '.brand').map(([sel, label]) => ({ sel, label, axis: meta[sel].axis })),
    scaleOf(sel) { return ((S.cfg().layout || {})[sel] || {}).s || 1; },
    posOf(sel) { return (S.cfg().layout || {})[sel] || null; },
    setScale(sel, s) {
      const el = els[sel]; const cur = (S.cfg().layout || {})[sel] || {};
      let x = cur.x, y = cur.y;
      if (x == null && el) { const r = el.getBoundingClientRect(); x = Math.round(r.left); y = Math.round(r.top); }
      S.setLayout(sel, { x, y, s });
    },
    // snap a panel to a screen anchor — code is V+H: t/m/b  +  l/c/r
    snap(sel, anchor) {
      const el = els[sel]; if (!el) return;
      const cur = (S.cfg().layout || {})[sel] || {}; const s = cur.s || 1, m = 18;
      const w = el.offsetWidth * s, hh = el.offsetHeight * s, vw = window.innerWidth, vh = window.innerHeight;
      const v = anchor[0], hz = meta[sel].axis === 'y' ? 'l' : anchor[1];   // vertical-only bars keep their left
      let x = hz === 'l' ? m : hz === 'r' ? vw - w - m : (vw - w) / 2;
      let y = v === 't' ? m : v === 'b' ? vh - hh - m : (vh - hh) / 2;
      if (meta[sel].axis === 'y') x = (cur.x != null ? cur.x : el.getBoundingClientRect().left);
      S.setLayout(sel, { x: Math.round(x), y: Math.round(y), s });
    },
    center(sel) { this.snap(sel, 'mc'); },
    resetPanel(sel) { S.setLayout(sel, null); },
    reflow,
  };
})();
