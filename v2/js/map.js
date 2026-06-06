/* ============================================================
   MAP — Leaflet + MapTiler. Style swap in place, fly-to scenes.
   ============================================================ */
const GameMap = (() => {
  const KEY = 'tnFJbEP9ELhQqkA6rPY2';
  const tile = id => `https://api.maptiler.com/maps/${id}/{z}/{x}/{y}.png?key=${KEY}`;

  const STYLES = [
    { id: 'satellite', ar: 'قمر صناعي' },
    { id: 'hybrid', ar: 'هجين' },
    { id: 'dataviz-dark', ar: 'داكن' },
    { id: 'streets-v2', ar: 'شوارع' },
    { id: 'topo-v2', ar: 'تضاريس' },
    { id: 'ocean', ar: 'بحري' },
  ];

  const map = L.map('map', { zoomControl: false, attributionControl: false, fadeAnimation: true }).setView([29.5, 45], 5);

  // UNDERLAY: coarse (maxNativeZoom 4) so it's few big tiles. A generous
  // keepBuffer + loading DURING zoom means the surrounding area is already
  // covered when you zoom OUT (no blank ring). Cheap because the tiles are coarse.
  const underlay = L.tileLayer(tile('satellite'), {
    maxZoom: 20, maxNativeZoom: 4, tileSize: 256, keepBuffer: 4, className: 'tiles-underlay',
  }).addTo(map);

  // BASE: full detail. Defer tile loading until the zoom animation ends so the
  // zoom stays smooth; the underlay + scaled old tiles cover the gap meanwhile.
  const base = L.tileLayer(tile('satellite'), {
    maxZoom: 20, tileSize: 256, keepBuffer: 2, updateWhenZooming: false, className: 'tiles-base',
  }).addTo(map);

  L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution('© MapTiler © OpenStreetMap').addTo(map);

  const drawn = L.layerGroup().addTo(map);   // rendered elements of the active scene live here

  function setStyle(id) { underlay.setUrl(tile(id)); base.setUrl(tile(id)); }
  function currentView() { const c = map.getCenter(); return { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: +map.getZoom().toFixed(2) }; }
  function flyToView(view, t) {
    if (!view) return;
    const dur = (t && t.duration) || 1.0;
    if (t && t.type === 'cut') map.setView([view.lat, view.lng], view.zoom);
    else map.flyTo([view.lat, view.lng], view.zoom, { duration: dur });
  }

  return { map, drawn, setStyle, currentView, flyToView, STYLES };
})();
window.GameMap = GameMap;
