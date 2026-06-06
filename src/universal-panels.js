/* ============================================================
   PANEL DOCK SYSTEM v5 — collapsed squares · edge-snap ·
   constrained drag · NO panel-in-panel (collision avoidance)
   ============================================================ */
(function() {
'use strict';
function ready(cb){ if(typeof map!=='undefined'&&map) cb(); else setTimeout(()=>ready(cb),250); }

ready(function() {
  setTimeout(initDock, 1300);

  // Registry of all managed floating panels
  const panels = [];

  function initDock() {
    // Horizontal bars (top/bottom) — drag left/right along their edge
    register('presenterBar', { edge: 'top', icon: 'play' });
    register('storyboardPanel', { edge: 'bottom', icon: 'next' });
    register('bottomStrip', { edge: 'bottom', icon: 'home', allowCenter: true });
    // Side panels (left/right) — drag up/down along their edge
    register('v2Panel', { edge: 'left', icon: 'studio', isStudio: true });

    // The right rail np-panels already collapse via accordion; give them square mode too
    document.querySelectorAll('#rightPanelsStack .np-panel').forEach(function(p, i) {
      enableSquareCollapse(p, ['mapstyle','labels','tracking'][i] || 'mapstyle');
    });

    // Continuous collision check
    setInterval(preventOverlaps, 600);
    window.addEventListener('resize', function(){ panels.forEach(snapToEdge); });
    console.log('[Dock v5] ' + panels.length + ' panels managed');
  }

  function register(id, opts) {
    const el = document.getElementById(id);
    if (!el || el.dataset.v5) return;
    el.dataset.v5 = '1';
    el.__dock = opts;
    panels.push(el);
    addControls(el, opts);
    // initial snap to its edge
    setTimeout(function(){ snapToEdge(el); }, 100);
  }

  // Add grip + collapse-to-square button
  function addControls(el, opts) {
    if (el.querySelector('.v5-grip')) return;
    const grip = document.createElement('div');
    grip.className = 'v5-grip';
    grip.innerHTML = window.svgIcon ? window.svgIcon('home',12).replace('home','') : '⋮⋮';
    grip.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="14"><circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/></svg>';
    grip.title = 'Drag along edge';

    const collapse = document.createElement('button');
    collapse.className = 'v5-collapse';
    collapse.innerHTML = window.svgIcon ? window.svgIcon('close', 13) : '−';
    collapse.title = 'Collapse to icon';
    collapse.dataset.icon = opts.icon;

    el.insertBefore(grip, el.firstChild);
    el.appendChild(collapse);

    collapse.addEventListener('click', function(e){
      e.stopPropagation();
      toggleSquare(el, opts.icon);
    });

    // Expand when clicking the collapsed square
    el.addEventListener('click', function(e){
      if (el.classList.contains('v5-square')) {
        e.stopPropagation();
        toggleSquare(el, opts.icon);
      }
    });

    enableEdgeDrag(el, grip, opts);
  }

  function toggleSquare(el, iconName) {
    const sq = el.classList.toggle('v5-square');
    if (sq) {
      el.dataset.prevHTML = '1';
      el.__squareIcon = document.createElement('div');
      el.__squareIcon.className = 'v5-square-icon';
      el.__squareIcon.innerHTML = window.svgIcon(iconName, 22);
      el.appendChild(el.__squareIcon);
    } else {
      if (el.__squareIcon) { el.__squareIcon.remove(); el.__squareIcon = null; }
    }
    setTimeout(function(){ snapToEdge(el); preventOverlaps(); }, 50);
  }

  function enableSquareCollapse(panel, iconName) {
    // np-panels: clicking header already toggles open; add square when all closed handled by CSS
    panel.dataset.squareIcon = iconName;
  }

  // Constrained drag: side panels move vertically, bars move horizontally
  function enableEdgeDrag(el, grip, opts) {
    let dragging=false, sx, sy, ox, oy, moved=false;
    function move(e){
      if(!dragging)return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(Math.abs(dx)>3||Math.abs(dy)>3)moved=true;
      if (opts.edge==='left' || opts.edge==='right') {
        // vertical movement only
        el.style.setProperty('top', clamp(oy+dy, 8, window.innerHeight-el.offsetHeight-8)+'px','important');
      } else {
        // horizontal movement only
        el.style.setProperty('left', clamp(ox+dx, 8, window.innerWidth-el.offsetWidth-8)+'px','important');
        el.style.setProperty('transform','none','important');
      }
    }
    function up(){
      if(!dragging)return; dragging=false;
      document.removeEventListener('pointermove',move);
      document.removeEventListener('pointerup',up);
      el.style.transition='all 0.2s cubic-bezier(0.4,0,0.2,1)';
      snapToEdge(el); preventOverlaps();
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

  // Snap to the nearest relevant edge
  function snapToEdge(el) {
    const opts = el.__dock; if(!opts) return;
    const r = el.getBoundingClientRect();
    const vw=window.innerWidth, vh=window.innerHeight, m=10;
    el.style.setProperty('position','fixed','important');
    if (opts.edge==='left') {
      // Clear the main toolbar if present
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
      el.style.setProperty('top', 68+'px','important');
      el.style.setProperty('left', clamp(r.left,m,vw-r.width-m)+'px','important');
      el.style.setProperty('transform','none','important');
    } else { // bottom
      el.style.setProperty('bottom', m+'px','important');
      el.style.setProperty('top','auto','important');
      el.style.setProperty('left', clamp(r.left,m,vw-r.width-m)+'px','important');
      el.style.setProperty('transform','none','important');
      // allowCenter bars keep their dragged horizontal position (incl. screen center)
    }
  }

  // Prevent any panel overlapping another — nudge apart
  function preventOverlaps() {
    for (let i=0;i<panels.length;i++){
      for (let j=i+1;j<panels.length;j++){
        const a=panels[i], b=panels[j];
        const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
        const ox=Math.max(0,Math.min(ra.right,rb.right)-Math.max(ra.left,rb.left));
        const oy=Math.max(0,Math.min(ra.bottom,rb.bottom)-Math.max(ra.top,rb.top));
        if (ox>4 && oy>4) {
          const bo=b.__dock;
          if (bo && (bo.edge==='left'||bo.edge==='right')) {
            b.style.setProperty('top', Math.min(window.innerHeight-rb.height-10, ra.bottom+10)+'px','important');
          } else if (bo && bo.edge==='bottom') {
            // stack this bottom bar ABOVE the other bottom bar
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

  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
});
})();
