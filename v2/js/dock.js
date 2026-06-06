/* ============================================================
   DOCK — one clean manager for every floating panel.
   Responsibilities: drag (free / axis-locked), collapse-to-edge,
   accordion (open one → siblings close), flyout-near-button,
   viewport clamping. No globals leak except `Dock`.
   ============================================================ */
const Dock = (() => {
  const MARGIN = 8, TOPBAR = 64, SQUARE = 44;
  const panels = [];                 // {el, o} registry
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const vw = () => window.innerWidth, vh = () => window.innerHeight;

  function register(el, opts = {}) {
    const o = Object.assign({ mode: 'free', home: 'left', accordion: null, keepOpen: false, trigger: null }, opts);
    el.__dock = o; panels.push({ el, o });
    if (o.gripSel) { const g = el.querySelector(o.gripSel); if (g) enableDrag(el, g, o); }
    if (o.closeSel) { const c = el.querySelector(o.closeSel); if (c) c.addEventListener('click', e => { e.stopPropagation(); close(el); }); }
    enableSquareDrag(el, o);
    if (o.startClosed) hide(el);
    else snap(el);
    return el;
  }

  /* ---- visibility ---- */
  const isHidden = el => el.hasAttribute('hidden') || el.classList.contains('is-square') && el.__hiddenSquare;
  const isOpen = el => !el.hasAttribute('hidden') && !el.classList.contains('is-square');

  function open(el) {
    const o = el.__dock;
    closeSiblings(el);
    el.classList.remove('is-square');
    el.__square && (el.__square.remove(), el.__square = null);
    if (el.__w != null) { el.style.width = el.__w; el.style.height = el.__h; el.__w = null; }
    el.removeAttribute('hidden');
    el.classList.add('flyout');
    requestAnimationFrame(() => o.trigger ? placeNear(el, o.trigger) : snap(el));
    if (o.trigger) o.trigger.classList.add('is-active');
    el.dispatchEvent(new CustomEvent('dock:open'));
  }
  function hide(el) {              // fully hidden (toolbar-controlled menus)
    el.setAttribute('hidden', '');
    el.classList.remove('is-square', 'flyout');
    el.__square && (el.__square.remove(), el.__square = null);
    el.__dock.trigger && el.__dock.trigger.classList.remove('is-active');
    el.dispatchEvent(new CustomEvent('dock:close'));
  }
  function collapse(el) {          // shrink to an edge square
    if (el.classList.contains('is-square')) return;
    const r = el.getBoundingClientRect(); el.__prev = { left: r.left, top: r.top };
    el.__w = el.style.width; el.__h = el.style.height; el.style.width = el.style.height = SQUARE + 'px';
    el.classList.add('is-square'); el.classList.remove('flyout');
    const ic = el.__dock.icon;
    if (ic) { const s = document.createElement('div'); s.className = 'dock-square__icon'; s.innerHTML = ic; el.__square = s; el.appendChild(s); }
    el.__dock.trigger && el.__dock.trigger.classList.remove('is-active');
    requestAnimationFrame(() => snapSquare(el));
  }
  function close(el) { el.__dock.menu ? hide(el) : collapse(el); }
  function toggle(el) { (isOpen(el) ? close : open)(el); }

  function closeSiblings(except) {
    const grp = except.__dock.accordion; if (!grp) return;
    panels.forEach(({ el, o }) => { if (el !== except && o.accordion === grp && !o.keepOpen && isOpen(el)) close(el); });
  }

  /* ---- positioning ---- */
  function snap(el) {
    const o = el.__dock; if (el.classList.contains('is-square')) return snapSquare(el);
    const r = el.getBoundingClientRect(); el.style.position = 'fixed';
    if (o.home === 'left')  { setX(el, 'left', o.x ?? MARGIN); el.style.top = clamp(r.top, TOPBAR, vh() - r.height - MARGIN) + 'px'; el.style.bottom = 'auto'; }
    else if (o.home === 'right') { setX(el, 'right', MARGIN); el.style.top = clamp(r.top, TOPBAR, vh() - r.height - MARGIN) + 'px'; el.style.bottom = 'auto'; }
    else if (o.home === 'top')   { el.style.top = TOPBAR + 'px'; el.style.bottom = 'auto'; el.style.left = clamp(r.left, MARGIN, vw() - r.width - MARGIN) + 'px'; el.style.right = 'auto'; }
    else { el.style.bottom = MARGIN + 'px'; el.style.top = 'auto'; el.style.left = clamp(r.left, MARGIN, vw() - r.width - MARGIN) + 'px'; el.style.right = 'auto'; }
  }
  function snapSquare(el) {
    const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d = { left: cx, right: vw() - cx, top: cy, bottom: vh() - cy };
    const near = Object.keys(d).reduce((a, b) => d[a] < d[b] ? a : b);
    el.style.position = 'fixed';
    if (near === 'left' || near === 'right') { setX(el, near, MARGIN); el.style.top = clamp(r.top, TOPBAR, vh() - SQUARE - MARGIN) + 'px'; el.style.bottom = 'auto'; }
    else { el.style[near] = MARGIN + 'px'; el.style[near === 'top' ? 'bottom' : 'top'] = 'auto'; el.style.left = clamp(r.left, MARGIN, vw() - SQUARE - MARGIN) + 'px'; el.style.right = 'auto'; }
  }
  function placeNear(el, btn) {
    if (el.parentElement !== document.body) document.body.appendChild(el);   // escape any clip / containing block
    const b = btn.getBoundingClientRect(); el.style.position = 'fixed';
    el.style.left = Math.round(b.right + MARGIN) + 'px'; el.style.right = 'auto';
    const h = el.offsetHeight || 240;
    el.style.top = clamp(Math.round(b.top), TOPBAR, vh() - h - MARGIN) + 'px'; el.style.bottom = 'auto';
  }
  function setX(el, side, v) { el.style[side] = v + 'px'; el.style[side === 'left' ? 'right' : 'left'] = 'auto'; }

  /* ---- drag ---- */
  function enableDrag(el, handle, o) {
    let sx, sy, ox, oy, on = false;
    const move = e => {
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (o.mode !== 'y') el.style.left = clamp(ox + dx, MARGIN, vw() - el.offsetWidth - MARGIN) + 'px';
      if (o.mode !== 'x') el.style.top = clamp(oy + dy, o.mode === 'y' ? TOPBAR : MARGIN, vh() - el.offsetHeight - MARGIN) + 'px';
      el.style.right = el.style.bottom = 'auto';
    };
    const up = () => { on = false; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); el.__placed = true; if (o.mode === 'x' || o.mode === 'y') snap(el); };
    handle.addEventListener('pointerdown', e => {
      on = true; const r = el.getBoundingClientRect();
      el.style.position = 'fixed'; el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; el.style.right = el.style.bottom = 'auto'; el.classList.remove('flyout');
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      e.preventDefault(); e.stopPropagation();
    });
  }
  function enableSquareDrag(el, o) {     // when collapsed: drag the icon, tap to re-open
    let sx, sy, ox, oy, moved = false, on = false;
    const move = e => { const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      el.style.left = clamp(ox + dx, MARGIN, vw() - SQUARE - MARGIN) + 'px'; el.style.top = clamp(oy + dy, MARGIN, vh() - SQUARE - MARGIN) + 'px'; el.style.right = el.style.bottom = 'auto'; };
    const up = () => { on = false; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); moved ? snapSquare(el) : open(el); };
    el.addEventListener('pointerdown', e => { if (!el.classList.contains('is-square')) return; on = true; moved = false;
      const r = el.getBoundingClientRect(); el.style.position = 'fixed'; el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); e.preventDefault(); e.stopPropagation(); });
  }

  window.addEventListener('resize', () => panels.forEach(({ el }) => { if (!isOpen(el) && !el.classList.contains('is-square')) return; el.classList.contains('is-square') ? snapSquare(el) : (el.__placed ? clampInto(el) : snap(el)); }));
  function clampInto(el) { const r = el.getBoundingClientRect(); el.style.left = clamp(r.left, MARGIN, vw() - el.offsetWidth - MARGIN) + 'px'; el.style.top = clamp(r.top, TOPBAR, vh() - el.offsetHeight - MARGIN) + 'px'; }

  return { register, open, close, toggle, collapse, hide, snap, placeNear, isOpen, panels };
})();
window.Dock = Dock;
