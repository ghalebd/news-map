/* ============================================================
   CONFIG-APPLY — the Presenter side of the config contract.
   Reads the shared Store.config and enforces it on this window:
     • visibility  → hide/show chrome
     • permissions → filter tools, scene nav, scene editing
   The Control console (APP_ROLE='control') is the full operator
   surface and is exempt: it always shows everything.
   Loaded on both pages; runs after app.js + draw.js.
   ============================================================ */
(() => {
  const S = window.Store;
  const isControl = window.APP_ROLE === 'control';

  const VIS = {
    brand: '.brand', status: '.status', modeSwitch: '.modesw',
    deck: '.deck', nownext: '.nownext', fab: '.fab', qtools: '.qtools',
  };

  function applyVisibility() {
    if (isControl) return;                       // full console: show all
    const v = S.cfg().visibility;
    Object.entries(VIS).forEach(([k, sel]) => {
      const el = document.querySelector(sel);
      if (el) el.hidden = v[k] === false;
    });
  }

  function applyPermissions() {
    if (window.Draw && window.Draw.applyPerms) window.Draw.applyPerms();
    if (isControl) return;
    const p = S.cfg().permissions;
    document.querySelectorAll('.nownext__nav').forEach(b => { b.hidden = !p.canNavigate; });
    const add = document.querySelector('.deck__add'); if (add) add.hidden = !p.canEditScenes;
    document.querySelectorAll('.card-sc__ops').forEach(o => { o.hidden = !p.canEditScenes; });
  }

  function apply() { applyVisibility(); applyPermissions(); }

  // re-apply whenever config changes (local or remote) or the deck re-renders
  S.on((st, evt) => {
    if (evt === 'config' || evt === 'sync' || evt === 'scenes' ||
        evt === 'active' || evt === 'elements' || evt === 'mode') apply();
  });

  apply();
  window.ConfigApply = { apply };
})();
