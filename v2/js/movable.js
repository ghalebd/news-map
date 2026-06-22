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
  // position {x,y} is per-window LOCAL (S.layout); SIZE is SYNCED (config.panelScale) so resizing a
  // panel on the control reflects on the presenter.
  const sclOf = sel => (S.cfg().panelScale || {})[sel] || 1;
  const els = {}; const handles = {};
  let pending = null;
  let cfgOffset = 0;
  // The settings drawer opens from the RIGHT, so left/centre chrome (tool bar, deck, status, …) is
  // never covered by it — there is nothing to dodge. The old logic shoved this chrome RIGHT (toward
  // the drawer), which flung the vertical tool bar to mid-screen when settings opened. No shift.
  function shiftFor() { return 0; }

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

  function commit(sel, x, y, h) {
    if (sel === '.brand') { S.setBrand({ x: Math.round(x), y: Math.round(y + h / 2) }); }   // applyBrand re-centres via translateY(-50%)
    else { S.setLayout(sel, { x: Math.round(x), y: Math.round(y) }); }   // position only — scale is synced separately
  }

  function startDrag(el, sel, hd, e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const axis = meta[sel].axis, rect = el.getBoundingClientRect();
    const s = sclOf(sel);
    const shift = 0;
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
    const lay = S.layout() || {};
    for (const [sel] of PANELS) {
      if (sel === '.brand') continue;            // handled by applyBrand
      const el = els[sel]; if (!el) continue;
      const p = lay[sel];                         // LOCAL position {x,y}
      const s = sclOf(sel);                       // SYNCED size
      if (p && (p.x != null || p.y != null)) {
        // moved (absolute) — local position + synced scale. Clamp against the SCALED size
        // (top-left origin) so a shrunk panel isn't pushed up/left off its spot.
        const w = el.offsetWidth * s, hh = el.offsetHeight * s;
        const x = p.x != null ? Math.max(0, Math.min(p.x, window.innerWidth - w)) : 0;
        const y = p.y != null ? Math.max(0, Math.min(p.y, window.innerHeight - hh)) : 0;
        styleAt(el, x, y, s);
      } else if (s !== 1) {
        // scale ONLY (never moved) — keep the panel's CSS position, just scale around its centre.
        el.style.left = el.style.top = el.style.right = el.style.bottom = '';
        el.style.transformOrigin = 'center';
        el.style.transform = (meta[sel].axis === 'y' ? 'translateY(-50%) ' : '') + `scale(${s})`;
      } else clearStyle(el);
    }
    reflow();
  }

  PANELS.forEach(([sel]) => attach(sel));
  applyLayout();
  S.on((st, evt) => { if (evt === 'layout' || evt === 'config' || evt === 'sync') applyLayout(); else if (evt === 'mode') reflow(); });
  window.addEventListener('resize', applyLayout);
  setTimeout(reflow, 300);   // settle after fonts/layout

  window.Movable = {
    panels: PANELS.filter(([sel]) => sel !== '.brand').map(([sel, label]) => ({ sel, label, axis: meta[sel].axis })),
    scaleOf(sel) { return sclOf(sel); },
    posOf(sel) { return (S.layout() || {})[sel] || null; },
    setScale(sel, s) {
      const el = els[sel];
      const s0 = sclOf(sel);
      S.setPanelScale(sel, s);                 // SYNCED size → reflects on the presenter
      const cur = (S.layout() || {})[sel] || {};
      // if the panel was moved, nudge its LOCAL position so it grows/shrinks around its centre;
      // an un-moved panel stays CSS-centred and just scales (applyLayout's scale-only branch).
      if (cur.x != null && el) {
        const w = el.offsetWidth, hh = el.offsetHeight;
        S.setLayout(sel, { x: Math.round(cur.x - w * (s - s0) / 2), y: Math.round((cur.y || 0) - hh * (s - s0) / 2) });
      }
    },
    // snap a panel to a screen anchor — code is V+H: t/m/b  +  l/c/r
    snap(sel, anchor) {
      const el = els[sel]; if (!el) return;
      const s = sclOf(sel), m = 18;
      const w = el.offsetWidth * s, hh = el.offsetHeight * s, vw = window.innerWidth, vh = window.innerHeight;
      const v = anchor[0], hz = meta[sel].axis === 'y' ? 'l' : anchor[1];   // vertical-only bars keep their left
      let x = hz === 'l' ? m : hz === 'r' ? vw - w - m : (vw - w) / 2;
      let y = v === 't' ? m : v === 'b' ? vh - hh - m : (vh - hh) / 2;
      const cur = (S.layout() || {})[sel] || {};
      if (meta[sel].axis === 'y') x = (cur.x != null ? cur.x : el.getBoundingClientRect().left);
      S.setLayout(sel, { x: Math.round(x), y: Math.round(y) });   // position only — scale stays synced
    },
    center(sel) { this.snap(sel, 'mc'); },
    resetPanel(sel) { S.setLayout(sel, null); S.setPanelScale(sel, 1); },
    reflow,
    attach,                      // wire a lazily-built panel (e.g. HUD / timeline) into the system
    refresh: applyLayout,        // re-apply saved layout after a panel appears
    setCfgOffset(px) { cfgOffset = px || 0; applyLayout(); },
  };
})();
