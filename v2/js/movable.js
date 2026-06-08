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
    ['.d3ctrl', '3D controls', 'both'],
    ['.mctl', 'Model control', 'both'],   // built lazily — attached when first shown
    ['.tl', 'Timeline', 'both'],
  ];
  const meta = {}; PANELS.forEach(([sel, label, axis]) => meta[sel] = { label, axis });
  const els = {}; const handles = {};
  let pending = null;
  let cfgOffset = 0;   // how far the open settings panel pushes left-side chrome right
  const SHIFTED = ['.qtools', '.modesw', '.deck', '.nownext', '.status'];   // left-side chrome the settings panel pushes
  // how much THIS panel is currently pushed right by the open settings panel
  function shiftFor(sel) {
    if (!cfgOffset) return 0;
    const p = (S.cfg().layout || {})[sel];
    if (p && p.x != null) return p.x < cfgOffset ? cfgOffset : 0;
    return SHIFTED.includes(sel) ? cfgOffset : 0;
  }

  /* the dot-grip sits on the panel's SHORTER edge: top for portrait panels,
     left for landscape panels — re-evaluated whenever layout might change */
  function orient(el, hd) {
    if (!el || !hd) return;
    const w = el.offsetWidth, hh = el.offsetHeight; if (!w && !hh) return;
    const want = w > hh * 1.15 ? 'side' : 'top';
    if (el.dataset.grip !== want) { el.dataset.grip = want; hd.innerHTML = want === 'side' ? I.grip : I.gripH; }
  }
  function reflow() { for (const sel in handles) orient(els[sel], handles[sel]); }

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
    const shift = shiftFor(sel);   // temporary open-shift to keep out of saved coords
    const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
    hd.classList.add('is-drag'); document.body.classList.add('mv-dragging');
    function mv(ev) {
      const rawX = axis === 'y' ? rect.left : ev.clientX - ox;   // where it sits on screen
      const rawY = axis === 'x' ? rect.top : ev.clientY - oy;
      let nx = Math.max(0, Math.min(rawX - shift, window.innerWidth - rect.width));   // natural (un-shifted) position to save
      let ny = Math.max(0, Math.min(rawY, window.innerHeight - rect.height));
      styleAt(el, Math.min(nx + shift, window.innerWidth - rect.width), ny, s);       // but follow the cursor on screen
      pending = { sel, x: nx, y: ny, h: rect.height, s };
    }
    function up() {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      hd.classList.remove('is-drag'); document.body.classList.remove('mv-dragging');
      if (pending) { commit(pending.sel, pending.x, pending.y, pending.h, pending.s); pending = null; }
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  function attach(sel) {
    if (sel === '.brand') return;   // the logo is placed from its own Logo card (X / Y / size)
    const el = document.querySelector(sel); if (!el || el.dataset.movable != null) return;
    els[sel] = el; el.dataset.movable = '';
    const hd = document.createElement('div'); hd.className = 'mvh'; hd.title = 'Drag to move' + (meta[sel].axis === 'y' ? ' (up / down)' : ''); hd.innerHTML = I.gripH;
    hd.addEventListener('pointerdown', e => startDrag(el, sel, hd, e));
    el.insertBefore(hd, el.firstChild); handles[sel] = hd;
    // some panels rebuild via innerHTML='' (scene inspector etc.) — keep the grip alive
    try { new MutationObserver(() => { if (hd.parentElement !== el) { el.insertBefore(hd, el.firstChild); orient(el, hd); } }).observe(el, { childList: true }); } catch (e) {}
  }

  function applyLayout() {
    const lay = S.cfg().layout || {};
    for (const [sel] of PANELS) {
      if (sel === '.brand') continue;            // handled by applyBrand
      const el = els[sel]; if (!el) continue;
      const p = lay[sel];
      if (p && (p.x != null || p.s)) {
        const w = el.offsetWidth, hh = el.offsetHeight;
        let x = p.x != null ? Math.max(0, Math.min(p.x, window.innerWidth - w)) : 0;
        const y = p.y != null ? Math.max(0, Math.min(p.y, window.innerHeight - hh)) : 0;
        // moved panels carry an inline transform (which overrides the CSS open-shift),
        // so we push them clear of the settings panel here instead (display only)
        x = Math.min(x + shiftFor(sel), window.innerWidth - w);
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
      const s0 = cur.s || 1;
      let x = cur.x, y = cur.y;
      if (x == null && el) { const r = el.getBoundingClientRect(); x = Math.round(r.left - shiftFor(sel)); y = Math.round(r.top); }
      // grow/shrink around the panel's centre (top-left origin → compensate x/y)
      if (el) { const w = el.offsetWidth, hh = el.offsetHeight; x = Math.round(x - w * (s - s0) / 2); y = Math.round(y - hh * (s - s0) / 2); }
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
    attach,                      // wire a lazily-built panel (e.g. HUD / timeline) into the system
    refresh: applyLayout,        // re-apply saved layout after a panel appears
    setCfgOffset(px) { cfgOffset = px || 0; applyLayout(); },
  };
})();
