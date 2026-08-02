/* ============================================================
   MAP — Leaflet + MapTiler. Style swap in place, fly-to scenes.
   ============================================================ */
/* expected aborts from cancelled fetches (MapLibre style swap, AbortSignal.timeout
   in tracking) are benign — keep them out of the console */
window.addEventListener('unhandledrejection', e => { const r = e.reason; if (r && (r.name === 'AbortError' || /abort/i.test(r.message || ''))) e.preventDefault(); });
const GameMap = (() => {
  const KEY = 'SIyj4p6cKZm7sBsge2Zn';
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

  // TILE-FAILURE VISIBILITY. Both layers are served by the same MapTiler key, so an expired key or a
  // 429 kills the "permanent backdrop" in the same instant it was designed to cover for — the map just
  // becomes empty background with drawings floating on it, and nothing anywhere says why. Counts errors
  // in a short window and raises a persistent chip, so the operator can tell "no tiles" from "no data".
  let tileErrs = 0, tileT = null, tileChip = null;
  function tileAlarm(on) {
    if (window.APP_ROLE !== 'control') return;   // NEVER paint a warning on the presenter — that window is on air
    if (on && !tileChip) { tileChip = document.createElement('div'); tileChip.className = 'tile-alarm'; tileChip.textContent = 'MAP TILES FAILING — check the MapTiler key / connection'; document.body.appendChild(tileChip); }
    else if (!on && tileChip) { tileChip.remove(); tileChip = null; }
  }
  // A CUSTOM (uuid) MapTiler style belongs to one specific account — rotate the key and it 404s, which
  // is exactly what happens to the default "News" style. Rather than sit on a blank map on air, fall
  // back once to a style that is guaranteed to exist on any key. If the custom style is later published
  // under the current key it simply works again; nothing here overwrites the operator's saved choice.
  const isCustomStyle = id => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id || ''));
  let fellBack = false;
  function onTileError() {
    tileErrs++;
    clearTimeout(tileT); tileT = setTimeout(() => { tileErrs = 0; tileAlarm(false); }, 15000);   // quiet for 15s → recovered
    if (tileErrs >= 6) {
      if (!fellBack && isCustomStyle(window.Store && Store.state && Store.state.mapStyle)) {
        fellBack = true; tileErrs = 0;
        setStyle('satellite');
        window.UI && UI.toast && UI.toast('Custom map style unavailable on this key — switched to Satellite', 6000);
        return;
      }
      tileAlarm(true);   // a handful of misses is normal at the edge of a pan; a storm is not
    }
  }
  base.on('tileerror', onTileError); underlay.on('tileerror', onTileError);
  base.on('tileload', () => { if (tileErrs) { tileErrs = 0; tileAlarm(false); } });

  const drawn = L.layerGroup().addTo(map);   // rendered elements of the active scene live here

  // "wireframe" is a look, not a MapTiler map: render dark vector tiles + a glowing-line CSS
  // filter on the tile pane only (so drawings/markers stay normal).
  function setStyle(id) {
    const wf = id === 'wireframe';
    document.body.classList.toggle('map-wireframe', wf);
    const real = wf ? 'toner-v2' : id;
    base.options.maxNativeZoom = 20; underlay.options.maxNativeZoom = 3;
    base.setUrl(tile(real)); underlay.setUrl(tile(real));
  }
  function currentView() { const c = map.getCenter(); return { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: +map.getZoom().toFixed(2) }; }
  function flyToView(view, t) {
    if (!view) return;
    // Every caller of this is a DELIBERATE operator move (scene cut, reset-to-scene, saved place,
    // fly-to-model), so it outranks an active follow lock — otherwise the follow rAF loop aborts the
    // flyTo on its next frame and snaps back to the tracked target. Timeline/campath drive the camera
    // through their own paths and are NOT affected here (follow already yields to them).
    try { if (window.Follow && Follow.release) Follow.release(); } catch (e) {}
    const type = t && t.type, dur = (t && t.duration) || 1.4;
    if (type === 'cut') { map.setView([view.lat, view.lng], view.zoom, { animate: false }); return; }
    // 'ease' = gentle linear glide; default 'flyTo' = cinematic zoom-out-and-in arc
    map.flyTo([view.lat, view.lng], view.zoom, { duration: dur, easeLinearity: type === 'ease' ? 0.45 : 0.18 });
  }

  // GPU relief: flag body.map-moving while the map pans/zooms so the glass surfaces drop their
  // per-frame SVG refraction (see app.css .map-moving) and snap it back ~160ms after it settles.
  // Shared with the 3D (MapLibre) map, which calls window.markMapMotion on its own move events.
  let _moT = null;
  window.markMapMotion = moving => {
    clearTimeout(_moT);
    if (moving) document.body.classList.add('map-moving');
    else _moT = setTimeout(() => document.body.classList.remove('map-moving'), 160);
  };
  map.on('movestart zoomstart', () => window.markMapMotion(true));
  map.on('moveend zoomend', () => window.markMapMotion(false));

  return { map, drawn, setStyle, currentView, flyToView, STYLES };
})();
window.GameMap = GameMap;
