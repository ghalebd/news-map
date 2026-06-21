/* ============================================================
   LOCATOR — small inset map (bottom-right) showing where the main
   view sits, with a rectangle of the main map's bounds. Toggle via
   config.locator (control panel). Loaded on both windows.
   ============================================================ */
(() => {
  const S = window.Store, M = window.GameMap;
  const KEY = 'tnFJbEP9ELhQqkA6rPY2';
  const box = document.createElement('div'); box.className = 'locator'; box.hidden = true; document.body.appendChild(box);
  let mini = null, rect = null;

  function build() {
    if (mini) return;
    mini = L.map(box, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, fadeAnimation: false });
    L.tileLayer(`https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.png?key=${KEY}`, { noWrap: true }).addTo(mini);
    rect = L.rectangle([[0, 0], [0, 0]], { color: '#ff453a', weight: 1.5, fillColor: '#ff453a', fillOpacity: 0.12 }).addTo(mini);
  }
  function sync() {
    if (box.hidden) return;
    const c = M.map.getCenter(), z = Math.max(1, M.map.getZoom() - 4);
    mini.setView(c, z, { animate: false });
    rect.setBounds(M.map.getBounds());
  }
  function apply() {
    const on = !!S.cfg().locator;
    if (on && box.hidden) { box.hidden = false; build(); setTimeout(() => { mini.invalidateSize(); sync(); }, 30); }
    else if (!on && !box.hidden) { box.hidden = true; }
    else if (on) sync();
  }
  M.map.on('move zoom moveend zoomend', () => { if (!box.hidden && mini) sync(); });
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync') apply(); });
  apply();
})();
