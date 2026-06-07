/* ============================================================
   LBAR — one consistent behaviour for every popup that springs
   from the left vertical tool bar. Anchors the popup beside the
   bar button; CSS class .lbar-pop gives the shared glass look and
   sizes the menu to its longest item (width: max-content).
   ============================================================ */
(() => {
  function anchor(btn, pop) {
    const r = btn.getBoundingClientRect();
    pop.style.left = Math.round(r.right + 8) + 'px';
    pop.style.right = 'auto'; pop.style.bottom = 'auto';
    const ph = pop.offsetHeight || 0;
    pop.style.top = Math.round(Math.max(12, Math.min(r.top, window.innerHeight - ph - 12))) + 'px';
  }
  function toggle(btn, pop, build) {
    if (pop.hidden) { if (build) build(); pop.hidden = false; anchor(btn, pop); }
    else pop.hidden = true;
  }
  window.LBar = { anchor, toggle };
})();
