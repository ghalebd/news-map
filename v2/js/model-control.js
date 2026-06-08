/* ============================================================
   MODEL-CONTROL — a live HUD to drive a selected 3D GLB model
   (e.g. an aircraft) directly, with buttons + keyboard, on BOTH
   the 2D and 3D maps. Control-window only. It writes to the synced
   Store (updateModel3d), so the presenter mirrors every move.
     • Select: click a model's 2D marker, click near it in 3D, the
       "Control" button in Settings, or it auto-selects on upload.
     • Position: D-pad / arrow keys (step scales with zoom).
     • Attitude: heading (yaw), pitch (nose), roll (bank) — aircraft.
     • Size, Altitude, Drop-to-ground, Fly-to, Duplicate, Reset, Delete.
   ============================================================ */
(() => {
  if (window.APP_ROLE !== 'control') return;   // operator tool only
  const S = window.Store, I = window.ICONS, L2 = window.GameMap && window.GameMap.map;
  if (!S || !L2) return;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const models = () => (S.models3d ? S.models3d() : []);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let selId = null, visible = false, inited = false, prevIds = new Set(), pick3dBound = false;
  const sel = () => models().find(m => m.id === selId) || null;
  const gl = () => (window.Map3D && Map3D.on && Map3D.map) ? Map3D.map : null;

  /* ---- geometry: nudge distance tracks the current zoom ---- */
  function span() { const m = gl(); const b = m ? m.getBounds() : L2.getBounds(); return [b.getNorth() - b.getSouth(), b.getEast() - b.getWest()]; }
  function move(dy, dx) { const m = sel(); if (!m) return; const [hh, ww] = span(); S.updateModel3d(m.id, { lat: clamp(m.lat + dy * hh * 0.04, -85, 85), lng: m.lng + dx * ww * 0.04 }); }
  function rotate(d) { const m = sel(); if (!m) return; S.updateModel3d(m.id, { rotZ: ((Math.round(m.rotZ || 0) + d) % 360 + 360) % 360 }); }
  function pitch(d) { const m = sel(); if (!m) return; S.updateModel3d(m.id, { pitch: clamp(Math.round(m.pitch || 0) + d, -90, 90) }); }
  function roll(d) { const m = sel(); if (!m) return; S.updateModel3d(m.id, { roll: clamp(Math.round(m.roll || 0) + d, -90, 90) }); }
  function scaleBy(f) { const m = sel(); if (!m) return; S.updateModel3d(m.id, { scale: Math.round(clamp((m.scale || 1) * f, 0.1, 200) * 10) / 10 }); }
  function altBy(dir) { const m = sel(); if (!m) return; const step = Math.max(50, (m.scale || 1) * 100); S.updateModel3d(m.id, { alt: Math.round((m.alt || 0) + dir * step) }); }
  function dropGround() { const m = sel(); if (!m) return; S.updateModel3d(m.id, { alt: 0 }); }
  function resetAttitude() { const m = sel(); if (!m) return; S.updateModel3d(m.id, { rotZ: 0, pitch: 0, roll: 0 }); }
  function flyTo() { const m = sel(); if (!m) return; const g = gl(); if (g) g.flyTo({ center: [m.lng, m.lat], zoom: Math.max(g.getZoom(), 8), duration: 900 }); else window.GameMap.flyToView({ lat: m.lat, lng: m.lng, zoom: 9 }, { type: 'flyTo', duration: 1 }); }
  async function duplicate() { const m = sel(); if (!m) return; try { const id = S.uid('m3d'); if (!m.src) { const blob = await window.Assets3D.get(m.id); if (blob) await window.Assets3D.put(id, blob); } const [hh] = span(); const c = Object.assign({}, m, { id, name: (m.name || 'Model') + ' copy', lat: m.lat + hh * 0.06 }); S.addModel3d(c); select(id); } catch (e) {} }
  function del() { const m = sel(); if (!m) return; try { window.Assets3D && Assets3D.del(m.id); } catch (e) {} const rest = models().filter(x => x.id !== m.id); S.removeModel3d(m.id); const nxt = rest[0]; nxt ? select(nxt.id) : hide(); }
  function step(dir) { const a = models(); if (!a.length) return; let i = a.findIndex(m => m.id === selId); i = (i + dir + a.length) % a.length; select(a[i].id); }

  /* ---- selection ---- */
  function highlight() {
    models().forEach(m => { const mk = window.Models3D && Models3D.marker && Models3D.marker(m.id); const el = mk && mk.getElement && mk.getElement(); if (el) el.classList.toggle('m3d-sel', m.id === selId); });
  }
  function select(id) { selId = id; show(); highlight(); renderVals(); }
  function deselect() { selId = null; highlight(); hide(); }

  /* ---- 3D: click-to-select + drag-to-move (Select tool only) ---- */
  let dragId = null;
  function nearest(point, max) { const g = gl(); if (!g) return null; let best = null, bd = 1e9; models().forEach(m => { if (m.on === false || m.mode === '2d') return; const p = g.project([m.lng, m.lat]); const d = Math.hypot(p.x - point.x, p.y - point.y); if (d < bd) { bd = d; best = m; } }); return (best && bd < max) ? best : null; }
  function bindPick3d() {
    const g = gl(); if (!g || pick3dBound) return; pick3dBound = true;
    g.on('mousedown', e => {
      if (routeMode) return;
      const t = window.Draw && Draw.tool; if (t && t !== 'select') return;
      const m = nearest(e.point, 60); if (!m) return;
      select(m.id); dragId = m.id; e.preventDefault();   // grab the model (cancels map pan)
    });
    g.on('mousemove', e => { if (dragId) window.Models3D.setPose(dragId, { lat: e.lngLat.lat, lng: e.lngLat.lng }); });
    g.on('mouseup', e => { if (!dragId) return; const id = dragId; dragId = null; S.updateModel3d(id, { lat: e.lngLat.lat, lng: e.lngLat.lng }); window.Models3D.setPose(id, null); });
    g.on('click', e => {
      if (routeMode) { addRoutePoint([e.lngLat.lat, e.lngLat.lng]); return; }
      const t = window.Draw && Draw.tool; if (t && t !== 'select') return;
      const m = nearest(e.point, 64); if (m) select(m.id);
    });
  }

  /* ---- route drawing (click points on either map) ---- */
  let routeMode = null;   // { id, pts:[], line, dots:[] }
  function on2DClick(e) { if (routeMode) addRoutePoint([e.latlng.lat, e.latlng.lng]); }
  function onRouteKey(e) { if (!routeMode) return; if (e.key === 'Enter') { finishRoute(); e.preventDefault(); } else if (e.key === 'Escape') { cancelRoute(); e.preventDefault(); } }
  function drawRoute() { const m = sel(); if (!m) return; cancelRoute(); routeMode = { id: m.id, pts: [], line: null, dots: [] }; L2.on('click', on2DClick); document.addEventListener('keydown', onRouteKey); window.UI && UI.toast && UI.toast('Click path points · Enter to finish · Esc to cancel'); renderVals(); }
  function addRoutePoint(ll) {
    if (!routeMode) return; routeMode.pts.push(ll);
    if (!routeMode.line) routeMode.line = L.polyline(routeMode.pts, { color: '#ffb020', weight: 3, dashArray: '6 5' }).addTo(L2); else routeMode.line.setLatLngs(routeMode.pts);
    routeMode.dots.push(L.circleMarker(ll, { radius: 4, color: '#fff', weight: 1.5, fillColor: '#ffb020', fillOpacity: 1 }).addTo(L2));
  }
  function finishRoute() {
    if (!routeMode) return; const m = models().find(x => x.id === routeMode.id);
    if (m && routeMode.pts.length >= 2) { const r = m.route || {}; S.updateModel3d(routeMode.id, { lat: routeMode.pts[0][0], lng: routeMode.pts[0][1], route: { pts: routeMode.pts, dur: r.dur || 20, loop: !!r.loop, heading: r.heading !== false, play: false, t0: 0 } }); }
    endRouteMode();
  }
  function cancelRoute() { endRouteMode(); }
  function endRouteMode() { if (!routeMode) return; if (routeMode.line) L2.removeLayer(routeMode.line); routeMode.dots.forEach(d => L2.removeLayer(d)); L2.off('click', on2DClick); document.removeEventListener('keydown', onRouteKey); routeMode = null; renderVals(); }
  function togglePlay() { const m = sel(); if (!m) return; if (!(m.route && (m.route.pts || []).length >= 2)) { drawRoute(); return; } if (window.ModelsAnim) { ModelsAnim.playing(m.id) ? ModelsAnim.stop(m.id) : ModelsAnim.play(m.id); } renderVals(); }

  /* ---- HUD ---- */
  let hud, nameEl, picker, vHead, vPitch, vRoll, vSize, vAlt, wireBtn, routeB, playB;
  function toggleWire() { const m = sel(); if (!m) return; S.updateModel3d(m.id, { style: (m.style === 'wireframe') ? 'solid' : 'wireframe' }); }
  function build() {
    hud = h('div', 'mctl glass'); hud.hidden = true;
    const hd = h('div', 'mctl__hd');
    const grip = h('span', 'mctl__grip', I.move);
    nameEl = h('span', 'mctl__nm', 'Model');
    wireBtn = h('button', 'mctl__x', I.grid); wireBtn.title = 'Wireframe on/off'; wireBtn.onclick = toggleWire;
    const prev = h('button', 'mctl__x', I.navL); prev.title = 'Previous model'; prev.onclick = () => step(-1);
    const next = h('button', 'mctl__x', I.navR); next.title = 'Next model'; next.onclick = () => step(1);
    const cls = h('button', 'mctl__x', I.close); cls.title = 'Close (Esc)'; cls.onclick = deselect;
    hd.append(grip, nameEl, wireBtn, prev, next, cls); hud.appendChild(hd);

    picker = h('select', 'mctl__sel'); picker.onchange = () => select(picker.value); hud.appendChild(picker);

    const B = (html, title, fn, cls2) => { const b = h('button', 'mctl__b' + (cls2 ? ' ' + cls2 : ''), html); b.title = title; b.onclick = fn; return b; };

    // position D-pad
    const pad = h('div', 'mctl__pad');
    pad.append(
      h('span'), B(I.chevron, 'Move north (↑)', () => move(1, 0), 'mctl__b--up'), h('span'),
      B(I.chevron, 'Move west (←)', () => move(0, -1), 'mctl__b--left'),
      B(I.center, 'Drop to ground', dropGround, 'mctl__b--c'),
      B(I.chevron, 'Move east (→)', () => move(0, 1), 'mctl__b--right'),
      h('span'), B(I.chevron, 'Move south (↓)', () => move(-1, 0), 'mctl__b--down'), h('span'),
    );
    hud.appendChild(pad);

    const row = (label, minus, mT, plus, pT, valRef) => {
      const r = h('div', 'mctl__row'); const lab = h('span', 'mctl__lab', label);
      const bm = B(minus, mT, valRef.dec); const v = h('span', 'mctl__val', '0'); const bp = B(plus, pT, valRef.inc);
      r.append(lab, bm, v, bp); valRef.el = v; return r;
    };
    const rHead = { dec: () => rotate(-15), inc: () => rotate(15) };
    const rPitch = { dec: () => pitch(-5), inc: () => pitch(5) };
    const rRoll = { dec: () => roll(-5), inc: () => roll(5) };
    const rSize = { dec: () => scaleBy(0.85), inc: () => scaleBy(1.18) };
    const rAlt = { dec: () => altBy(-1), inc: () => altBy(1) };
    hud.append(
      row('Heading', I.rotL, 'Turn left ( [ )', I.rotR, 'Turn right ( ] )', rHead),
      row('Pitch', I.minus, 'Nose down', I.plus, 'Nose up', rPitch),
      row('Roll', I.minus, 'Bank left', I.plus, 'Bank right', rRoll),
      row('Size', I.minus, 'Smaller ( - )', I.plus, 'Larger ( + )', rSize),
      row('Altitude', I.minus, 'Lower (PgDn)', I.plus, 'Raise (PgUp)', rAlt),
    );
    vHead = rHead.el; vPitch = rPitch.el; vRoll = rRoll.el; vSize = rSize.el; vAlt = rAlt.el;

    const act = h('div', 'mctl__act mctl__act--6');
    routeB = B(I.sketch + '<span>Path</span>', 'Draw a movement path', drawRoute);
    playB = B(I.play + '<span>Play</span>', 'Play / stop movement', togglePlay);
    act.append(
      B(I.target + '<span>Fly</span>', 'Fly camera to model', flyTo),
      B(I.layers + '<span>Copy</span>', 'Duplicate model', duplicate),
      B(I.undo + '<span>Reset</span>', 'Reset heading/pitch/roll', resetAttitude),
      routeB, playB,
      B(I.close + '<span>Delete</span>', 'Delete model', del, 'mctl__b--danger'),
    );
    hud.appendChild(act);
    hud.appendChild(h('div', 'mctl__hint', 'Arrows move · [ ] turn · +/- size · PgUp/PgDn altitude · drag in 3D to move'));

    document.body.appendChild(hud);
    dragify(hd);
  }
  function dragify(handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('pointerdown', e => { if (e.target.closest('button,select')) return; on = true; const r = hud.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; hud.style.right = 'auto'; hud.style.bottom = 'auto'; hud.style.left = ox + 'px'; hud.style.top = oy + 'px'; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', e => { if (!on) return; hud.style.left = (ox + e.clientX - sx) + 'px'; hud.style.top = (oy + e.clientY - sy) + 'px'; });
    handle.addEventListener('pointerup', e => { on = false; try { handle.releasePointerCapture(e.pointerId); } catch (x) {} });
  }
  function show() { if (!hud) build(); hud.hidden = false; visible = true; }
  function hide() { if (hud) hud.hidden = true; visible = false; }
  function renderVals() {
    const m = sel(); if (!m || !hud) return;
    nameEl.textContent = m.name || 'Model';
    vHead.textContent = Math.round(m.rotZ || 0) + '°';
    vPitch.textContent = Math.round(m.pitch || 0) + '°';
    vRoll.textContent = Math.round(m.roll || 0) + '°';
    vSize.textContent = (Math.round((m.scale || 1) * 10) / 10) + ' km';
    vAlt.textContent = Math.round(m.alt || 0) + ' m';
    if (wireBtn) wireBtn.classList.toggle('on', m.style === 'wireframe');
    const playing = window.ModelsAnim && ModelsAnim.playing(m.id);
    if (playB) { playB.innerHTML = (playing ? I.close : I.play) + '<span>' + (playing ? 'Stop' : 'Play') + '</span>'; playB.classList.toggle('on', !!playing); }
    if (routeB) routeB.classList.toggle('on', !!(routeMode && routeMode.id === m.id));
    // rebuild the picker
    if (picker) { picker.innerHTML = ''; models().forEach(x => { const o = h('option', null, x.name || 'Model'); o.value = x.id; if (x.id === selId) o.selected = true; picker.appendChild(o); }); }
  }

  /* ---- keyboard ---- */
  window.addEventListener('keydown', e => {
    if (!visible || !sel() || routeMode) return;   // route mode owns Enter/Esc
    const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    let hit = true;
    switch (e.key) {
      case 'ArrowUp': move(1, 0); break;
      case 'ArrowDown': move(-1, 0); break;
      case 'ArrowLeft': move(0, -1); break;
      case 'ArrowRight': move(0, 1); break;
      case '[': rotate(-15); break;
      case ']': rotate(15); break;
      case '+': case '=': scaleBy(1.18); break;
      case '-': case '_': scaleBy(0.85); break;
      case 'PageUp': altBy(1); break;
      case 'PageDown': altBy(-1); break;
      case 'Escape': deselect(); break;
      default: hit = false;
    }
    if (hit) e.preventDefault();
  });

  /* ---- store reactions ---- */
  function onStore() {
    bindPick3d();
    const ids = new Set(models().map(m => m.id));
    if (inited) { for (const id of ids) if (!prevIds.has(id)) { select(id); break; } }   // dropped a model → control it now
    prevIds = ids; inited = true;
    if (selId && !ids.has(selId)) { selId = null; hide(); return; }
    if (visible) { renderVals(); highlight(); }
  }
  S.on((st, evt) => { if (evt === 'models3d' || evt === 'sync' || evt === 'threed') onStore(); });
  // keep trying to bind the 3D picker once the GL map exists
  setInterval(bindPick3d, 1500);
  onStore();

  window.ModelControl = { select, deselect, drawPath: (id) => { select(id); drawRoute(); }, toggle: () => { const m = sel(); if (visible) hide(); else if (m) show(); else if (models()[0]) select(models()[0].id); }, get selected() { return selId; } };
})();
