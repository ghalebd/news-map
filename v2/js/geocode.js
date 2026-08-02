/* ============================================================
   GEOCODE — search a place by name and fly the map to it.
   Uses MapTiler geocoding; a small search button sits in the
   zoom cluster and opens a popup with live results. Flying uses
   a smooth flyTo. Available on both windows (per-window nav aid).
   ============================================================ */
(() => {
  const KEY = 'SIyj4p6cKZm7sBsge2Zn', map = window.GameMap.map, I = window.ICONS;
  const { h, esc } = window.U;   // js/util.js — place names come back from the MapTiler geocoder, so esc() must be the shared copy
  // fly the ACTIVE map: in 3D the flat map is hidden, so flying it does nothing visible — target the globe
  // instead (MapLibre center is [lng,lat] and its zoom runs ~1 below Leaflet's). On 3D exit the camera syncs back.
  const flyTo = (lat, lng, zoom) => {
    try { if (window.Follow && Follow.release) Follow.release(); } catch (e) {}   // a search is a deliberate move — outrank an active follow lock, or it snaps straight back
    if (window.Map3D && Map3D.on && Map3D.map) Map3D.map.flyTo({ center: [lng, lat], zoom: Math.max(1, zoom - 1), duration: 1600 });
    else map.flyTo([lat, lng], zoom, { duration: 1.6 });
  };

  const btn = h('button', 'zoomctl__b geo-btn', I.search); btn.title = 'Search a place';
  const pop = h('div', 'geo-pop glass'); pop.hidden = true;
  const input = h('input', 'geo-in'); input.type = 'search'; input.placeholder = 'Search a place…';
  const list = h('div', 'geo-list');
  pop.append(input, list); document.body.appendChild(pop);
  (function place() { const zc = document.querySelector('.zoomctl'); if (zc) zc.insertBefore(btn, zc.firstChild); else { btn.classList.add('geo-btn--float'); document.body.appendChild(btn); } })();

  const triggers = [btn];
  function anchorTo(el) {
    const r = el.getBoundingClientRect();
    if (r.left < window.innerWidth / 2) { pop.style.left = Math.round(r.left) + 'px'; pop.style.right = 'auto'; }
    else { pop.style.right = Math.round(window.innerWidth - r.right) + 'px'; pop.style.left = 'auto'; }
    // bottom-of-screen trigger → pin the popup's BOTTOM just above it so it grows upward
    // (never expands down over the bar as results load); otherwise pin its top
    if (r.top > window.innerHeight / 2) { pop.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px'; pop.style.top = 'auto'; }
    else { pop.style.top = Math.round(Math.min(r.top, window.innerHeight - 332)) + 'px'; pop.style.bottom = 'auto'; }
  }
  function zoomForBbox(b) { if (!b) return 11; const ext = Math.max(b[2] - b[0], b[3] - b[1]) || 0.1; return Math.max(3, Math.min(13, Math.round(Math.log2(360 / ext)))); }
  function parseCoords(q) { const m = q.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/); if (!m) return null; const lat = +m[1], lng = +m[2]; return (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ? [lat, lng] : null; }

  let t = null, lastTrigger = btn;
  async function search(q) {
    if (!q.trim()) { list.innerHTML = ''; return; }
    const co = parseCoords(q);
    if (co) { list.innerHTML = ''; const it = h('button', 'geo-item', `<b>Go to ${co[0]}, ${co[1]}</b><small>coordinates</small>`); it.onclick = () => { flyTo(co[0], co[1], 9); pop.hidden = true; }; list.appendChild(it); return; }
    list.innerHTML = '<div class="geo-empty">Searching…</div>';
    try {
      const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${KEY}&limit=6`);
      // an expired/rate-limited key returns a parseable error body, so without this the operator saw
      // "No results" and blamed their spelling — while the same key failure was blanking the base map
      if (!r.ok) { list.innerHTML = `<div class="geo-empty">Search unavailable (${r.status})</div>`; return; }
      const d = await r.json(); render(d.features || []);
    } catch (e) { list.innerHTML = '<div class="geo-empty">No results</div>'; }
  }
  function render(feats) {
    list.innerHTML = '';
    if (!feats.length) { list.innerHTML = '<div class="geo-empty">No results</div>'; return; }
    feats.forEach(f => {
      const it = h('button', 'geo-item', `<b>${esc(f.text || f.place_name)}</b><small>${esc(f.place_name || '')}</small>`);
      it.onclick = () => { const c = f.center; if (c) flyTo(c[1], c[0], zoomForBbox(f.bbox)); pop.hidden = true; };
      list.appendChild(it);
    });
  }
  function toggle(trigger) { lastTrigger = trigger; if (pop.hidden) { pop.hidden = false; anchorTo(trigger); input.focus(); } else pop.hidden = true; }
  btn.onclick = e => { e.stopPropagation(); toggle(btn); };
  const lens = document.querySelector('.status__find'); if (lens) { triggers.push(lens); lens.onclick = e => { e.stopPropagation(); toggle(lens); }; }
  input.oninput = () => { clearTimeout(t); t = setTimeout(() => search(input.value), 350); };
  input.onkeydown = e => { if (e.key === 'Enter') { clearTimeout(t); search(input.value); } else if (e.key === 'Escape') pop.hidden = true; };
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target) && !triggers.some(x => x.contains(e.target))) pop.hidden = true; });
  input.placeholder = 'Place name or  lat, lng';
})();
