/* ============================================================
   UI RESTRUCTURE v6 — major reorganization per user spec
   - Remove top grey bar, merge its buttons into presenter bar
   - Float AJ logo alone in corner
   - Move undo/redo OUT of studio INTO bottom bar
   - Merge studio tools into a single button on left rail
   - Touch mode button for presenters
   ============================================================ */
(function() {
'use strict';
function ready(cb,n){ n=n||0; if(typeof map!=='undefined'&&map&&window.svgIcon) cb(); else if(n<200) setTimeout(()=>ready(cb,n+1),250); }

ready(function() {
  setTimeout(restructure, 1500);

  function restructure() {
    if (document.body.dataset.v6) return;
    document.body.dataset.v6 = '1';

    mergeTopBarIntoPresenter();
    moveUndoRedoToBottomBar();
    addTouchModeButton();
    console.log('[v6] UI restructured');
  }

  // ---- 1. Remove top bar, move its actions into presenter bar ----
  function mergeTopBarIntoPresenter() {
    const topBar = document.querySelector('.top-bar');
    const presenter = document.getElementById('presenterBar');
    if (!topBar || !presenter) return;

    // Buttons to relocate (compact icon form)
    const relocate = [
      { id: 'scenarioBtn', icon: 'clipboard', keepText: false },
      { id: 'saveBtn', icon: 'save', keepText: false },
      { id: 'loadBtn', icon: 'load', keepText: false },
      { id: 'hideUIBtn', icon: 'hideui', keepText: false },
      { id: 'presenterBtn', icon: 'play', keepText: true }
    ];

    // Build a new compact section in the presenter bar
    const sect = document.createElement('div');
    sect.className = 'pb-section pb-merged';

    relocate.forEach(function(r) {
      const btn = document.getElementById(r.id);
      if (!btn) return;
      // Convert to compact icon button
      btn.classList.add('pb-btn');
      btn.classList.remove('top-bar-btn');
      const label = r.keepText ? ' <span>'+btn.textContent.replace(/[^\p{L}\p{N} ]/gu,'').trim()+'</span>' : '';
      btn.innerHTML = window.svgIcon(r.icon, 16) + label;
      sect.appendChild(btn);
    });

    // Keep scenario menu working — move it to body (absolute)
    const scenarioMenu = document.getElementById('scenarioMenu');
    if (scenarioMenu) document.body.appendChild(scenarioMenu);

    presenter.appendChild(sect);

    // Remove the now-empty top bar entirely
    topBar.remove();
  }

  // ---- 2. Move Undo/Redo from studio panel to bottom bar ----
  function moveUndoRedoToBottomBar() {
    const bottom = document.getElementById('bottomStrip');
    const undoBtn = document.getElementById('v2UndoBtn');
    const redoBtn = document.getElementById('v2RedoBtn');
    if (!bottom) return;

    const sect = document.createElement('div');
    sect.className = 'bs-section bs-undo';

    if (undoBtn) {
      const u = document.createElement('button');
      u.className = 'pb-btn'; u.id = 'bsUndo'; u.title = 'Undo (Ctrl+Z)';
      u.innerHTML = window.svgIcon('undo', 16);
      u.onclick = function(){ if(window.undoLast) window.undoLast(); };
      sect.appendChild(u);
    }
    if (redoBtn) {
      const r = document.createElement('button');
      r.className = 'pb-btn'; r.id = 'bsRedo'; r.title = 'Redo (Ctrl+Y)';
      r.innerHTML = window.svgIcon('redo', 16);
      r.onclick = function(){ if(window.redoLast) window.redoLast(); };
      sect.appendChild(r);
    }
    bottom.insertBefore(sect, bottom.firstChild);

    // Remove the undo/redo row from studio panel
    if (undoBtn) { const row = undoBtn.closest('.v2-row, .v2-section'); if(row) row.remove(); else undoBtn.remove(); }
    if (redoBtn && redoBtn.parentNode) redoBtn.remove();
  }

  // ---- 3. Touch Mode button (presenter-friendly) ----
  function addTouchModeButton() {
    const bottom = document.getElementById('bottomStrip');
    if (!bottom || document.getElementById('touchModeToggle')) return;
    const btn = document.createElement('button');
    btn.className = 'pb-btn'; btn.id = 'touchModeToggle';
    btn.title = 'Touch mode (presenter)';
    btn.innerHTML = window.svgIcon('touch', 16);
    btn.onclick = function() {
      document.body.classList.toggle('touch-mode');
      btn.classList.toggle('is-on', document.body.classList.contains('touch-mode'));
      if (window.toggleTouchMode) window.toggleTouchMode();
    };
    bottom.appendChild(btn);
  }
});
})();
