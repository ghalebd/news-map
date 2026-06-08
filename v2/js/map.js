/* ============================================================
   MAP — Leaflet + MapTiler. Style swap in place, fly-to scenes.
   ============================================================ */
const GameMap = (() => {
  const KEY = 'tnFJbEP9ELhQqkA6rPY2';
  const tile = id => `https://api.maptiler.com/maps/${id}/{z}/{x}/{y}.png?key=${KEY}`;

  const STYLES = [
    { id: '019caada-7e48-7379-ba36-e8967f4fcc92', ar: 'إخبارية' },
    { id: 'satellite', ar: 'قمر صناعي' },
    { id: 'hybrid', ar: 'هجين' },
    { id: 'dataviz-dark', ar: 'داكن' },
    { id: 'streets-v2', ar: 'شوارع' },
    { id: 'topo-v2', ar: 'تضاريس' },
    { id: 'ocean', ar: 'بحري' },
  ];

  // minZoom 3 keeps a single world copy wider than typical broadcast viewports;
  // maxBounds + noWrap stop the map from repeating or panning into empty space.
  const WORLD = L.latLngBounds([[-85, -180], [85, 180]]);
  const map = L.map('map', {
    zoomControl: false, attributionControl: false, fadeAnimation: true,
    minZoom: 3, maxBounds: WORLD, maxBoundsViscosity: 0.4, worldCopyJump: false,
    // smooth feel: glide on release, gentle edge rubber-band, fine wheel zoom
    inertia: true, inertiaDeceleration: 2600, inertiaMaxSpeed: 2400, easeLinearity: 0.22,
    zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 120,
  }).setView([29.5, 45], 5);

  // PERMANENT LOW-RES BACKDROP: very coarse (maxNativeZoom 3) so a few big tiles
  // cover the whole region and stay loaded. It always sits behind the sharp
  // layer, so if anything is missing (still loading, network drop, far jump,
  // zoom-out) there is never a blank — a light version is always there.
  const underlay = L.tileLayer(tile('satellite'), {
    maxZoom: 20, maxNativeZoom: 3, tileSize: 256, keepBuffer: 4, noWrap: true, bounds: WORLD, crossOrigin: 'anonymous', className: 'tiles-underlay',
  }).addTo(map);

  // BASE: full detail. Defer tile loading until the zoom animation ends so the
  // zoom stays smooth; the underlay + scaled old tiles cover the gap meanwhile.
  const base = L.tileLayer(tile('satellite'), {
    maxZoom: 20, tileSize: 256, keepBuffer: 2, updateWhenZooming: false, noWrap: true, bounds: WORLD, crossOrigin: 'anonymous', className: 'tiles-base',
  }).addTo(map);

  L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution('© MapTiler © OpenStreetMap').addTo(map);

  const drawn = L.layerGroup().addTo(map);   // rendered elements of the active scene live here

  function setStyle(id) { base.options.maxNativeZoom = 20; underlay.options.maxNativeZoom = 3; base.setUrl(tile(id)); underlay.setUrl(tile(id)); }
  function currentView() { const c = map.getCenter(); return { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: +map.getZoom().toFixed(2) }; }
  function flyToView(view, t) {
    if (!view) return;
    const type = t && t.type, dur = (t && t.duration) || 1.4;
    if (type === 'cut') { map.setView([view.lat, view.lng], view.zoom, { animate: false }); return; }
    // 'ease' = gentle linear glide; default 'flyTo' = cinematic zoom-out-and-in arc
    map.flyTo([view.lat, view.lng], view.zoom, { duration: dur, easeLinearity: type === 'ease' ? 0.45 : 0.18 });
  }

  return { map, drawn, setStyle, currentView, flyToView, STYLES };
})();
window.GameMap = GameMap;
