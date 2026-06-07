/* ============================================================
   MOVABLE — every on-screen panel gets a small unified drag
   handle. Positions persist in config.layout (synced across
   windows). The .brand logo routes through config.brand so it
   stays consistent with the Logo card. Handles hide under
   body.ui-hidden (clean on-air output).
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  const PANELS = [
    ['.brand', 'Logo'],
    ['.status', 'Coordinates'],
    ['.modesw', 'Mode switch'],
    ['.deck', 'Scene deck'],
    ['.nownext', 'Now / Next'],
    ['.qtools', 'Tool bar'],
    ['.zoomctl', 'Zoom controls'],
    ['.locator', 'Locator'],
    ['.sceneins', 'Scene inspector'],
    ['.lthird', 'Lower third'],
    ['.bcast-banner', 'Banner'],
    ['.bcast-ticker', 'Ticker'],
  ];
  const els = {};   // sel -> element
  let pending = null;

  function place(el, x, y) { el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none'; }

  function commit(sel, x, y, h) {
    if (sel === '.brand') { S.setBrand({ x: Math.round(x), y: Math.round(y + h / 2) }); }   // applyBrand re-centres via translateY(-50%)
    else S.setLayout(sel, { x: Math.round(x), y: Math.round(y) });
  }

  function startDrag(el, sel, hd, e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
    hd.classList.add('is-drag'); document.body.classList.add('mv-dragging');
    function mv(ev) {
      let nx = ev.clientX - ox, ny = ev.clientY - oy;
      nx = Math.max(0, Math.min(nx, window.innerWidth - rect.width));
      ny = Math.max(0, Math.min(ny, window.innerHeight - rect.height));
      place(el, nx, ny); pending = { sel, x: nx, y: ny, h: rect.height };
    }
    function up() {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      hd.classList.remove('is-drag'); document.body.classList.remove('mv-dragging');
      if (pending) { commit(pending.sel, pending.x, pending.y, pending.h); pending = null; }
    }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  function attach(sel) {
    const el = document.querySelector(sel); if (!el || el.dataset.movable != null) return;
    els[sel] = el; el.dataset.movable = '';
    const hd = document.createElement('button'); hd.className = 'mvh'; hd.title = 'Drag to move'; hd.innerHTML = I.grip;
    hd.addEventListener('pointerdown', e => startDrag(el, sel, hd, e));
    el.appendChild(hd);
  }

  function applyLayout() {
    const lay = (S.cfg().layout) || {};
    for (const [sel] of PANELS) {
      if (sel === '.brand') continue;            // handled by applyBrand
      const el = els[sel]; if (!el) continue;
      const p = lay[sel];
      if (p) {
        const w = el.offsetWidth, h = el.offsetHeight;
        place(el, Math.max(0, Math.min(p.x, window.innerWidth - w)), Math.max(0, Math.min(p.y, window.innerHeight - h)));
      }
    }
  }

  PANELS.forEach(([sel]) => attach(sel));
  applyLayout();
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') applyLayout(); });
  window.addEventListener('resize', applyLayout);
})();
