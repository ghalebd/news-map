/* ============================================================
   PANEL SYSTEM v4 — JS controller
   Restructures existing panels into clean accordion cards.
   Compact · dynamic (one open at a time) · draggable
   ============================================================ */
(function() {
'use strict';
function ready(cb){ if(typeof map!=='undefined'&&map&&document.getElementById('rightPanelsStack')) cb(); else setTimeout(()=>ready(cb),250); }

ready(function() {
  setTimeout(buildPanelSystem, 700);

  function buildPanelSystem() {
    const stack = document.getElementById('rightPanelsStack');
    if (!stack || stack.dataset.v4built) return;

    // Define the three panels: selector, icon, title
    const defs = [
      { sel: '.layers-panel',        icon: 'mapstyle', title: 'Map Style',     gridLayers: true },
      { sel: '.labels-panel',        icon: 'labels',   title: 'Map Labels' },
      { sel: '.live-tracking-panel', icon: 'tracking', title: 'Live Tracking' }
    ];

    defs.forEach(function(def, idx) {
      const orig = stack.querySelector(def.sel);
      if (!orig) return;

      // Build new card
      const card = document.createElement('div');
      card.className = 'np-panel';
      card.dataset.panel = def.title;

      const head = document.createElement('div');
      head.className = 'np-head';
      head.innerHTML =
        '<span class="np-head-icon">' + (window.svgIcon ? window.svgIcon(def.icon, 18) : '') + '</span>' +
        '<span class="np-head-title">' + def.title + '</span>' +
        '<span class="np-head-chevron"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>';

      const body = document.createElement('div');
      body.className = 'np-body';

      // Move original panel's functional children into body
      // (skip legacy collapse buttons / titles / handles — CSS hides them anyway)
      Array.from(orig.childNodes).forEach(function(node) {
        if (node.nodeType === 1) {
          const cl = node.classList;
          if (cl && (cl.contains('panel-collapse-btn') || cl.contains('ltp-handle') ||
                     cl.contains('layers-title') || cl.contains('labels-title') ||
                     cl.contains('ltp-title'))) return;
        }
        body.appendChild(node);
      });

      // For Map Style: wrap layer buttons in a grid
      if (def.gridLayers) {
        const btns = Array.from(body.querySelectorAll('.layer-btn'));
        if (btns.length) {
          const wrap = document.createElement('div');
          wrap.className = 'layers-grid-wrap';
          btns[0].parentNode.insertBefore(wrap, btns[0]);
          btns.forEach(b => wrap.appendChild(b));
        }
      }

      card.appendChild(head);
      card.appendChild(body);

      // Replace original with card
      orig.parentNode.replaceChild(card, orig);

      // First panel open by default
      if (idx === 0) card.classList.add('np-open');

      // Header click = accordion toggle (open this, close others)
      head.addEventListener('click', function(e) {
        e.stopPropagation();
        const willOpen = !card.classList.contains('np-open');
        // Close all
        stack.querySelectorAll('.np-panel').forEach(p => p.classList.remove('np-open'));
        if (willOpen) card.classList.add('np-open');
      });
    });

    stack.dataset.v4built = '1';
    console.log('[Panel v4] Clean accordion system built');
  }
});
})();
