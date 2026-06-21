/* ============================================================
   CHROME — optional map chrome: a scale bar (2D Leaflet + 3D
   MapLibre) and a compass that rotates with the 3D bearing (click
   to face north). Toggled via config.ui { scaleBar, compass }.
   ============================================================ */
(() => {
  const S = window.Store, M = window.GameMap, L2 = M && M.map;
  if (!S || !L2 || typeof L === 'undefined') return;
  let lscale = null, glscale = null, glscaleMap = null;

  const comp = document.createElement('button'); comp.className = 'compass glass'; comp.hidden = true; comp.title = 'North — click to face north (3D)';
  comp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,2.5 15.4,12 12,10 8.6,12"></polygon><polygon points="12,21.5 8.6,12 12,14 15.4,12" class="s"></polygon></svg><b>N</b>';
  document.body.appendChild(comp);
  comp.onclick = () => { if (window.Map3D && Map3D.on && Map3D.map) Map3D.map.easeTo({ bearing: 0, duration: 300 }); };
  const bearing = () => (window.Map3D && Map3D.on && Map3D.map) ? Map3D.map.getBearing() : 0;
  function spin() { const svg = comp.firstChild; if (svg) svg.style.transform = 'rotate(' + (-bearing()) + 'deg)'; }

  function apply() {
    const ui = S.cfg().ui || {};
    // 2D Leaflet scale
    if (ui.scaleBar) { if (!lscale) lscale = L.control.scale({ metric: true, imperial: false, position: 'bottomleft', maxWidth: 130 }); if (!lscale._map) lscale.addTo(L2); }
    else if (lscale && lscale._map) { try { L2.removeControl(lscale); } catch (e) {} }
    // 3D MapLibre scale (only once the GL map exists)
    const gm = (window.Map3D && Map3D.map) || null;
    if (ui.scaleBar && gm) { if (!glscale) { try { glscale = new maplibregl.ScaleControl({ maxWidth: 130, unit: 'metric' }); } catch (e) {} } if (glscale && glscaleMap !== gm) { try { gm.addControl(glscale, 'bottom-left'); glscaleMap = gm; } catch (e) {} } }
    else if (glscale && glscaleMap) { try { glscaleMap.removeControl(glscale); } catch (e) {} glscaleMap = null; }
    comp.hidden = !ui.compass; if (ui.compass) spin();
  }
  setInterval(() => { if (!comp.hidden) spin(); }, 200);
  setInterval(apply, 1500);   // pick up the GL map / 3D toggle
  S.on((st, evt) => { if (evt === 'config' || evt === 'sync' || evt === 'threed') apply(); });
  apply();
})();
