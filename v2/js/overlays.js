/* ============================================================
   OVERLAYS — georeferenced satellite/image layers.
   Each overlay is an L.imageOverlay pinned to geographic bounds
   (so it tracks the map on pan/zoom/tilt). Layers stack in order,
   each with its own opacity and an optional before/after wipe.
   A single draggable vertical wipe line reveals wipe-enabled
   layers to its left (base map shows to its right).
   State lives in config.overlays + config.overlayWipe (synced).
   window.Overlays exposes helpers for the control panel.
   ============================================================ */
(() => {
  const S = window.Store, map = window.GameMap.map;
  const layers = new Map();   // id -> L.imageOverlay

  const list = () => (S.cfg().overlays) || [];
  const wipeFrac = () => { const f = S.cfg().overlayWipe; return f == null ? 0.5 : f; };
  const anyWipe = () => list().some(o => o.wipe && o.on !== false);

  /* ---- wipe handle (a draggable vertical line on the map) ---- */
  const handle = document.createElement('div');
  handle.className = 'ov-wipe';
  handle.innerHTML = '<div class="ov-wipe__line"></div><div class="ov-wipe__grip"><span></span><span></span></div>';
  handle.hidden = true;
  document.body.appendChild(handle);
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const rect = map.getContainer().getBoundingClientRect();
    handle.classList.add('is-drag');
    const mv = ev => S.setOverlayWipe((ev.clientX - rect.left) / rect.width);
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); handle.classList.remove('is-drag'); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });

  function placeHandle() {
    if (!anyWipe()) { handle.hidden = true; return; }
    const rect = map.getContainer().getBoundingClientRect();
    handle.hidden = false;
    handle.style.left = Math.round(rect.left + wipeFrac() * rect.width) + 'px';
    handle.style.top = Math.round(rect.top) + 'px';
    handle.style.height = Math.round(rect.height) + 'px';
  }

  function applyWipe() {
    const rect = map.getContainer().getBoundingClientRect();
    const lineX = rect.left + wipeFrac() * rect.width;
    list().forEach(o => {
      const lyr = layers.get(o.id); if (!lyr) return; const img = lyr.getElement(); if (!img) return;
      if (o.wipe && o.on !== false) {
        const r = img.getBoundingClientRect();
        const reveal = Math.max(0, Math.min(r.width, lineX - r.left));   // px of the image revealed from its left
        img.style.clipPath = `inset(0 ${Math.max(0, r.width - reveal)}px 0 0)`;
      } else img.style.clipPath = '';
    });
    placeHandle();
  }

  function render() {
    const seen = new Set();
    list().forEach((o, i) => {
      if (o.on === false || !o.url || !o.bounds) return;
      seen.add(o.id);
      let lyr = layers.get(o.id);
      if (!lyr) {
        lyr = L.imageOverlay(o.url, o.bounds, { opacity: o.opacity != null ? o.opacity : 1, interactive: false, className: 'ov-img', crossOrigin: 'anonymous' });
        lyr.addTo(map); layers.set(o.id, lyr);
        lyr.on('load', applyWipe);
      } else {
        lyr.setBounds(L.latLngBounds(o.bounds));
        lyr.setOpacity(o.opacity != null ? o.opacity : 1);
        if (lyr._url !== o.url) lyr.setUrl(o.url);
      }
      if (lyr.setZIndex) lyr.setZIndex(350 + i);
    });
    for (const [id, lyr] of layers) if (!seen.has(id)) { map.removeLayer(lyr); layers.delete(id); }
    applyWipe();
    renderEdit();
  }

  /* ---- on-map alignment: move + resize handles for the active overlay ---- */
  let editId = null;
  const editGrp = L.layerGroup();
  const handleIcon = (glyph, cls) => L.divIcon({ className: 'ov-handle ' + cls, html: glyph, iconSize: [28, 28], iconAnchor: [14, 14] });
  function renderEdit() {
    editGrp.clearLayers();
    const o = editId && list().find(x => x.id === editId);
    if (!o || o.on === false || !o.bounds) { if (map.hasLayer(editGrp)) map.removeLayer(editGrp); return; }
    if (!map.hasLayer(editGrp)) editGrp.addTo(map);
    const bb = L.latLngBounds(o.bounds);
    const rect = L.rectangle(bb, { color: '#5b9dff', weight: 1.5, dashArray: '6 5', fill: false, interactive: false });
    editGrp.addLayer(rect);
    const live = nb => { const lyr = layers.get(o.id); if (lyr) lyr.setBounds(nb); rect.setBounds(nb); applyWipe(); };
    let tmp = null;
    const mv = L.marker(bb.getCenter(), { icon: handleIcon('✛', 'ov-handle--move'), draggable: true, zIndexOffset: 1000 });
    mv.on('drag', e => { const c = e.latlng, b = o.bounds, hLat = (b[1][0] - b[0][0]) / 2, hLng = (b[1][1] - b[0][1]) / 2; tmp = [[c.lat - hLat, c.lng - hLng], [c.lat + hLat, c.lng + hLng]]; live(tmp); });
    mv.on('dragend', () => { if (tmp) S.updateOverlay(o.id, { bounds: tmp }); });
    editGrp.addLayer(mv);
    let tmp2 = null;
    const rz = L.marker(bb.getNorthEast(), { icon: handleIcon('⤢', 'ov-handle--size'), draggable: true, zIndexOffset: 1000 });
    rz.on('drag', e => { const p = e.latlng, s = o.bounds[0]; tmp2 = [[s[0], s[1]], [Math.max(s[0] + 0.0005, p.lat), Math.max(s[1] + 0.0005, p.lng)]]; live(tmp2); });
    rz.on('dragend', () => { if (tmp2) S.updateOverlay(o.id, { bounds: tmp2 }); });
    editGrp.addLayer(rz);
  }

  map.on('move zoom moveend zoomend viewreset', applyWipe);
  window.addEventListener('resize', applyWipe);
  S.on((st, evt) => { if (evt === 'overlays' || evt === 'config' || evt === 'sync') render(); });
  render();

  /* ---- geo helpers for the control panel ---- */
  window.Overlays = {
    // bounds covering the current map view (operator framed the shot, then snap)
    viewBounds() { const b = map.getBounds(); return [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]; },
    // bounds from a centre + width(km); height derived from the image aspect ratio
    boundsFromCenter(lat, lng, widthKm, aspect) {
      const hw = widthKm / 2, hh = (widthKm / (aspect || 1)) / 2;
      const dLat = hh / 111.32, dLng = hw / (111.32 * Math.cos(lat * Math.PI / 180) || 1);
      return [[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]];
    },
    // nudge an overlay's bounds (pan in deg) or scale it about its centre
    nudge(id, dLat, dLng) { const o = S.overlays().find(x => x.id === id); if (!o) return; o.bounds = o.bounds.map(p => [p[0] + dLat, p[1] + dLng]); S.updateOverlay(id, { bounds: o.bounds }); },
    scale(id, factor) { const o = S.overlays().find(x => x.id === id); if (!o) return; const b = o.bounds, cLat = (b[0][0] + b[1][0]) / 2, cLng = (b[0][1] + b[1][1]) / 2, hLat = (b[1][0] - b[0][0]) / 2 * factor, hLng = (b[1][1] - b[0][1]) / 2 * factor; S.updateOverlay(id, { bounds: [[cLat - hLat, cLng - hLng], [cLat + hLat, cLng + hLng]] }); },
    // toggle on-map move/resize handles for an overlay
    edit(id) { editId = (editId === id) ? null : id; renderEdit(); return editId === id; },
    get editing() { return editId; },
  };
})();
