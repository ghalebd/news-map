/* ============================================================
   PANEL DOCK SYSTEM v6 — free-drag · collapse-to-nearest-edge ·
   global accordion (open one → others collapse) · vertical rail handle
   ------------------------------------------------------------
   modes:
     free       → drag in BOTH axes, keep dropped position (presenterBar, bottomStrip)
     vertical   → drag up/down only, snap to its side edge (v2Panel, rightPanelsStack)
     horizontal → drag left/right only, snap to its top/bottom edge (storyboardPanel)
   ============================================================ */
(function() {
'use strict';
function ready(cb,n){ n=n||0; if(typeof map!=='undefined'&&map) cb(); else if(n<200) setTimeout(()=>ready(cb,n+1),250); }

const GRIP_SVG = '<svg viewBox="0 0 24 24" width="12" height="14"><circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/></svg>';
// clean, simple "minimize" glyph (a minus) — clear and not ugly
const MIN_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="12" x2="18" y2="12"/></svg>';

ready(function() {
  setTimeout(initDock, 1300);
  const panels = [];

  function initDock() {
    register('presenterBar',     { mode: 'free',       edge: 'top',    icon: 'play', keepOpen: true });
    register('bottomStrip',      { mode: 'free',       edge: 'bottom', icon: 'home', keepOpen: true });
    register('storyboardPanel',  { mode: 'horizontal', edge: 'bottom', icon: 'next'   });
    register('v2Panel',          { mode: 'vertical',   edge: 'left',   icon: 'studio', isStudio: true });
    register('rightPanelsStack', { mode: 'vertical',   edge: 'right',  icon: 'layers', noCollapse: true });
    register('toolbar',          { mode: 'vertical',   edge: 'left',   icon: 'tools',  noCollapse: true, isToolbar: true });

    // Right-rail np-panels keep their own one-open-at-a-time accordion + square mode
    document.querySelectorAll('#rightPanelsStack .np-panel').forEach(function(p, i) {
      enableSquareCollapse(p, ['mapstyle','labels','tracking'][i] || 'mapstyle');
    });

    // Studio now lives as an icon in the left toolbar — wire it + start hidden
    const sbtn = document.getElementById('studioToggleBtn');
    if (sbtn) sbtn.addEventListener('click', function(e){ e.stopPropagation(); window.studioToggle(); });
    const studio = document.getElementById('v2Panel');
    if (studio) {
      // its top-right "−" now simply closes the studio (capture-phase beats the
      // legacy collapse-to-header handler)
      const vcb = studio.querySelector('.v2-collapse-btn');
      if (vcb) { vcb.title = 'Close'; vcb.addEventListener('click', function(e){ e.stopImmediatePropagation(); e.preventDefault(); window.studioToggle(); }, true); }
      setTimeout(function(){ collapsePanel(studio, 'studio'); }, 250);
    }
    // Opening the Assets palette or the Colors popup closes the other menus and
    // positions the flyout right next to its own toolbar button.
    const assetToolBtn = document.querySelector('.tool-btn[data-tool="asset"]');
    if (assetToolBtn) assetToolBtn.addEventListener('click', function(){ setTimeout(function(){ const a=document.getElementById('assetPalette'); if (a && a.classList.contains('show')) { window.closeOtherLeftMenus('assets'); window.placeNearButton(a, assetToolBtn); } }, 0); });
    const colorBtn = document.getElementById('colorPickerBtn');
    if (colorBtn) colorBtn.addEventListener('click', function(){ setTimeout(function(){ const c=document.getElementById('colorPopup'); if (c && c.classList.contains('show')) { window.closeOtherLeftMenus('color'); window.placeNearButton(c, colorBtn); } }, 0); });

    clearInterval(window.__dockOverlapTimer);
    window.__dockOverlapTimer = setInterval(preventOverlaps, 700);
    window.addEventListener('resize', onResize);
    console.log('[Dock v6] ' + panels.length + ' panels managed');
  }

  function register(id, opts) {
    const el = document.getElementById(id);
    if (!el || el.dataset.v5) return;
    el.dataset.v5 = '1';
    el.__dock = opts;
    panels.push(el);
    addControls(el, opts);
    setTimeout(function(){ snapToEdge(el); }, 100);
  }

  // ---- grip (always) + collapse button (unless noCollapse) ----
  function addControls(el, opts) {
    if (el.querySelector('.v5-grip')) return;
    const grip = document.createElement('div');
    grip.className = 'v5-grip';
    grip.innerHTML = GRIP_SVG;
    grip.title = 'Drag';
    el.insertBefore(grip, el.firstChild);

    // Studio is opened/closed from the left-toolbar icon, so it doesn't get the
    // (mispositioned) v5-collapse — its existing top-right "−" closes it instead.
    if (!opts.noCollapse && !opts.isStudio) {
      const collapse = document.createElement('button');
      collapse.className = 'v5-collapse';
      collapse.innerHTML = MIN_SVG;
      collapse.title = 'Collapse to icon';
      collapse.dataset.icon = opts.icon;
      el.appendChild(collapse);
      collapse.addEventListener('click', function(e){ e.stopPropagation(); collapsePanel(el, opts.icon); });
    }

    enableDrag(el, grip, opts);
    enableSquareDrag(el, opts);   // when collapsed: drag the icon, or tap to expand
  }

  // ---- collapsed square: drag it freely (snaps to nearest edge), tap to expand ----
  function enableSquareDrag(el, opts) {
    let dragging=false, moved=false, sx, sy, ox, oy;
    function move(e){
      if(!dragging) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(Math.abs(dx)>3||Math.abs(dy)>3) moved=true;
      el.style.setProperty('left', clamp(ox+dx, 4, window.innerWidth-46-4)+'px','important');
      el.style.setProperty('top',  clamp(oy+dy, 4, window.innerHeight-46-4)+'px','important');
      el.style.setProperty('right','auto','important');
      el.style.setProperty('bottom','auto','important');
    }
    function up(){
      if(!dragging) return; dragging=false;
      document.removeEventListener('pointermove',move);
      document.removeEventListener('pointerup',up);
      el.style.transition='all 0.2s cubic-bezier(0.4,0,0.2,1)';
      if (moved) snapSquareToEdge(el);            // dragged → stick to nearest edge
      else expandPanel(el, opts.icon);            // tapped → expand
    }
    el.addEventListener('pointerdown', function(e){
      if(!el.classList.contains('v5-square')) return;   // only when collapsed
      dragging=true; moved=false;
      const r=el.getBoundingClientRect();
      el.style.setProperty('position','fixed','important');
      el.style.setProperty('left',r.left+'px','important');
      el.style.setProperty('top',r.top+'px','important');
      sx=e.clientX; sy=e.clientY; ox=r.left; oy=r.top;
      el.style.transition='none';
      document.addEventListener('pointermove',move);
      document.addEventListener('pointerup',up);
      e.preventDefault(); e.stopPropagation();
    });
  }

  // a panel counts as collapsed if it's a square OR (studio) fully hidden
  function isCollapsed(el) { return el.classList.contains('v5-square') || !!el.__studioHidden; }

  // ---- collapse: studio fully hides (it lives in the left toolbar now);
  //      every other panel shrinks to a square that snaps to the nearest edge ----
  function collapsePanel(el, iconName) {
    if (isCollapsed(el)) return;
    if (el.__dock && el.__dock.isStudio) {
      el.__studioHidden = true;
      el.style.setProperty('display', 'none', 'important');
      setStudioBtnActive(false);
      return;
    }
    const r = el.getBoundingClientRect();
    el.__prevPos = { left: r.left, top: r.top };   // remember to restore on expand
    el.classList.add('v5-square');
    el.__squareIcon = document.createElement('div');
    el.__squareIcon.className = 'v5-square-icon';
    el.__squareIcon.innerHTML = window.svgIcon(iconName, 22);
    el.appendChild(el.__squareIcon);
    setTimeout(function(){ snapSquareToEdge(el); }, 30);
  }

  // ---- expand: global accordion (others collapse) then restore/show ----
  function expandPanel(el, iconName) {
    if (!isCollapsed(el)) return;
    collapseOthers(el);
    if (el.__dock && el.__dock.isStudio) {
      el.__studioHidden = false;
      el.style.removeProperty('display');
      setStudioBtnActive(true);
      setTimeout(function(){ snapToEdge(el); preventOverlaps(); }, 30);
      return;
    }
    el.classList.remove('v5-square');
    if (el.__squareIcon) { el.__squareIcon.remove(); el.__squareIcon = null; }
    setTimeout(function(){
      if (el.__prevPos) restorePos(el, el.__prevPos);
      else snapToEdge(el);
      preventOverlaps();
    }, 30);
  }

  function collapseOthers(except) {
    panels.forEach(function(p){
      if (p === except) return;
      if (p.__dock && (p.__dock.noCollapse || p.__dock.keepOpen)) return;  // top/bottom bars stay open
      if (!isCollapsed(p)) collapsePanel(p, p.__dock.icon);
    });
  }

  // reflect the studio panel's open/closed state on its left-toolbar button
  function setStudioBtnActive(on) {
    const btn = document.getElementById('studioToggleBtn');
    if (btn) btn.classList.toggle('active', !!on);
  }
  // The three left-toolbar menus (Studio / Assets / Colors) are mutually
  // exclusive: opening one closes the others (no clutter, same dynamic logic).
  window.closeOtherLeftMenus = function(except) {
    if (except !== 'studio') { const s = document.getElementById('v2Panel'); if (s && !isCollapsed(s)) collapsePanel(s, 'studio'); }
    if (except !== 'assets') { const a = document.getElementById('assetPalette'); if (a) a.classList.remove('show'); }
    if (except !== 'color')  { const c = document.getElementById('colorPopup');   if (c) c.classList.remove('show'); }
  };

  // Position a flyout menu right next to its toolbar button (fixed, so it is
  // never clipped by the toolbar's own scroll/overflow). Vertically aligned to
  // the button, clamped on-screen, opening upward if it would overflow.
  window.placeNearButton = function(menuEl, btnEl) {
    if (!menuEl || !btnEl) return;
    // Move the flyout to <body> so it escapes the toolbar's overflow + the
    // backdrop-filter containing block (which was clipping it invisibly).
    if (menuEl.parentElement !== document.body) document.body.appendChild(menuEl);
    const tb = document.getElementById('toolbar').getBoundingClientRect();
    const br = btnEl.getBoundingClientRect();
    menuEl.style.setProperty('position', 'fixed', 'important');
    menuEl.style.setProperty('left', (Math.round(tb.right) + 8) + 'px', 'important');
    menuEl.style.setProperty('right', 'auto', 'important');
    const h = menuEl.offsetHeight || 220;
    let top = Math.round(br.top);
    top = Math.max(64, Math.min(top, window.innerHeight - h - 10));
    menuEl.style.setProperty('top', top + 'px', 'important');
    menuEl.style.setProperty('bottom', 'auto', 'important');
    // unified open motion for all three menus
    menuEl.style.animation = 'none';
    void menuEl.offsetWidth;                 // force reflow so it replays each open
    menuEl.style.animation = 'lgPopIn 0.18s cubic-bezier(0.34,1.2,0.4,1)';
  };

  // global toggle used by the toolbar icon
  window.studioToggle = function() {
    const el = document.getElementById('v2Panel'); if (!el) return;
    if (isCollapsed(el)) {
      window.closeOtherLeftMenus('studio');
      expandPanel(el, el.__dock.icon);
      const btn = document.getElementById('studioToggleBtn');
      setTimeout(function(){ window.placeNearButton(el, btn); }, 60);
    } else collapsePanel(el, el.__dock.icon);
  };

  function enableSquareCollapse(panel, iconName) { panel.dataset.squareIcon = iconName; }

  // ---- drag (mode-aware) ----
  function enableDrag(el, grip, opts) {
    let dragging=false, sx, sy, ox, oy, moved=false;
    const m = 6;
    function move(e){
      if(!dragging) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(Math.abs(dx)>3||Math.abs(dy)>3) moved=true;
      if (opts.mode==='free') {
        el.style.setProperty('left', clamp(ox+dx, m, window.innerWidth-el.offsetWidth-m)+'px','important');
        el.style.setProperty('top',  clamp(oy+dy, m, window.innerHeight-el.offsetHeight-m)+'px','important');
        el.style.setProperty('right','auto','important');
        el.style.setProperty('bottom','auto','important');
        el.style.setProperty('transform','none','important');
      } else if (opts.mode==='vertical') {
        el.style.setProperty('top', clamp(oy+dy, 68, window.innerHeight-el.offsetHeight-m)+'px','important');
      } else { // horizontal
        el.style.setProperty('left', clamp(ox+dx, m, window.innerWidth-el.offsetWidth-m)+'px','important');
        el.style.setProperty('transform','none','important');
      }
    }
    function up(){
      if(!dragging) return; dragging=false;
      document.removeEventListener('pointermove',move);
      document.removeEventListener('pointerup',up);
      el.style.transition='all 0.2s cubic-bezier(0.4,0,0.2,1)';
      if (opts.mode==='free') { if (moved) el.__userPlaced = true; }
      else snapToEdge(el);
      preventOverlaps();
    }
    grip.addEventListener('pointerdown', function(e){
      dragging=true; moved=false;
      const r=el.getBoundingClientRect();
      el.style.setProperty('position','fixed','important');
      el.style.setProperty('left',r.left+'px','important');
      el.style.setProperty('top',r.top+'px','important');
      el.style.setProperty('right','auto','important');
      el.style.setProperty('bottom','auto','important');
      el.style.setProperty('transform','none','important');
      sx=e.clientX; sy=e.clientY; ox=r.left; oy=r.top;
      el.style.transition='none';
      document.addEventListener('pointermove',move);
      document.addEventListener('pointerup',up);
      e.preventDefault(); e.stopPropagation();
    });
  }

  function restorePos(el, pos) {
    const m=6;
    el.style.setProperty('position','fixed','important');
    el.style.setProperty('left', clamp(pos.left, m, window.innerWidth - el.offsetWidth - m)+'px','important');
    el.style.setProperty('top',  clamp(pos.top, m, window.innerHeight - el.offsetHeight - m)+'px','important');
    el.style.setProperty('right','auto','important');
    el.style.setProperty('bottom','auto','important');
    el.style.setProperty('transform','none','important');
  }

  // ---- collapsed square snaps to the NEAREST viewport edge ----
  function snapSquareToEdge(el) {
    const r = el.getBoundingClientRect();
    const vw=window.innerWidth, vh=window.innerHeight, m=10, S=46;
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const dl=cx, dr=vw-cx, dt=cy, db=vh-cy;
    const min=Math.min(dl,dr,dt,db);
    el.style.setProperty('position','fixed','important');
    el.style.setProperty('transform','none','important');
    if (min===dl)      { setSide(el,'left',  m); el.style.setProperty('top', clamp(r.top,68,vh-S-m)+'px','important'); el.style.setProperty('bottom','auto','important'); }
    else if (min===dr) { setSide(el,'right', m); el.style.setProperty('top', clamp(r.top,68,vh-S-m)+'px','important'); el.style.setProperty('bottom','auto','important'); }
    else if (min===dt) { el.style.setProperty('top','68px','important'); el.style.setProperty('bottom','auto','important'); el.style.setProperty('left', clamp(r.left,m,vw-S-m)+'px','important'); el.style.setProperty('right','auto','important'); }
    else               { el.style.setProperty('bottom',m+'px','important'); el.style.setProperty('top','auto','important'); el.style.setProperty('left', clamp(r.left,m,vw-S-m)+'px','important'); el.style.setProperty('right','auto','important'); }
  }
  function setSide(el, side, m){
    if (side==='left'){ el.style.setProperty('left',m+'px','important'); el.style.setProperty('right','auto','important'); }
    else { el.style.setProperty('right',m+'px','important'); el.style.setProperty('left','auto','important'); }
  }

  // ---- snap to the panel's home edge (used for non-free panels + initial layout) ----
  function snapToEdge(el) {
    const opts = el.__dock; if(!opts) return;
    if (el.classList.contains('v5-square')) { snapSquareToEdge(el); return; }
    const r = el.getBoundingClientRect();
    const vw=window.innerWidth, vh=window.innerHeight, m=10;
    el.style.setProperty('position','fixed','important');
    if (opts.isToolbar) {
      // toolbar: pinned to the left, only its vertical position moves
      el.style.setProperty('left', '4px','important');
      el.style.setProperty('right','auto','important');
      el.style.setProperty('top', clamp(r.top, 64, vh-r.height-m)+'px','important');
      return;
    }
    if (opts.edge==='left') {
      let leftPos = m;
      const tb = document.querySelector('.toolbar');
      if (tb) { const tr = tb.getBoundingClientRect(); if (tr.width>0) leftPos = Math.round(tr.right) + 8; }
      el.style.setProperty('left', leftPos+'px','important');
      el.style.setProperty('right','auto','important');
      el.style.setProperty('top', clamp(r.top,68,vh-r.height-m)+'px','important');
    } else if (opts.edge==='right') {
      el.style.setProperty('right', m+'px','important');
      el.style.setProperty('left','auto','important');
      el.style.setProperty('top', clamp(r.top,68,vh-r.height-m)+'px','important');
    } else if (opts.edge==='top') {
      el.style.setProperty('top', '68px','important');
      el.style.setProperty('left', clamp(r.left,m,vw-r.width-m)+'px','important');
      el.style.setProperty('transform','none','important');
    } else { // bottom
      el.style.setProperty('bottom', m+'px','important');
      el.style.setProperty('top','auto','important');
      el.style.setProperty('left', clamp(r.left,m,vw-r.width-m)+'px','important');
      el.style.setProperty('transform','none','important');
    }
  }

  function onResize() {
    panels.forEach(function(el){
      if (el.__studioHidden) return;                 // hidden studio: leave as-is
      if (el.classList.contains('v5-square')) { snapSquareToEdge(el); return; }
      if (el.__dock.mode==='free' && el.__userPlaced) {
        const r=el.getBoundingClientRect(); restorePos(el, {left:r.left, top:r.top});
      } else snapToEdge(el);
    });
  }

  // ---- keep non-user-placed panels from overlapping (free user-placed are exempt) ----
  function preventOverlaps() {
    for (let i=0;i<panels.length;i++){
      for (let j=i+1;j<panels.length;j++){
        const a=panels[i], b=panels[j];
        if (exempt(a) || exempt(b)) continue;
        const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
        const ox=Math.max(0,Math.min(ra.right,rb.right)-Math.max(ra.left,rb.left));
        const oy=Math.max(0,Math.min(ra.bottom,rb.bottom)-Math.max(ra.top,rb.top));
        if (ox>4 && oy>4) {
          const bo=b.__dock;
          if (bo && (bo.edge==='left'||bo.edge==='right')) {
            b.style.setProperty('top', Math.min(window.innerHeight-rb.height-10, ra.bottom+10)+'px','important');
          } else if (bo && bo.edge==='bottom') {
            b.style.setProperty('bottom', (window.innerHeight - ra.top + 10)+'px','important');
            b.style.setProperty('top','auto','important');
          } else if (bo && bo.edge==='top') {
            b.style.setProperty('top', (ra.bottom+10)+'px','important');
          } else {
            b.style.setProperty('left', Math.min(window.innerWidth-rb.width-10, ra.right+10)+'px','important');
          }
        }
      }
    }
  }
  // toolbar is a fixed anchor; free panels the user placed by hand are not auto-moved
  function exempt(el){
    if (el.__dock.isToolbar) return true;
    return el.classList.contains('v5-square') ? false : (el.__dock.mode==='free' && el.__userPlaced);
  }

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
});
})();
