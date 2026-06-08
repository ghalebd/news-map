/* ============================================================
   TIMELINE — keyframe choreography for the camera and the 3D/2D
   models. Define each movement in detail: scrub a playhead, set up
   the shot (move camera / drag models), and capture a keyframe on a
   track. Playback interpolates everything between keyframes, on
   whichever map is active, synced to the presenter via the Store.
     config.timeline = { dur, head, playing, loop, t0,
                         cam:[{t,lat,lng,zoom,pitch,bearing}],
                         models:{ id:[{t,lat,lng,scale,rotZ,pitch,roll,alt}] } }
   Playback runs in both windows; the editor UI is control-only.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS, L2 = window.GameMap && window.GameMap.map;
  if (!S || !L2) return;
  const isCtrl = window.APP_ROLE === 'control';
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const TL = () => S.timeline();
  const models = () => (S.models3d ? S.models3d() : []);
  const gl = () => (window.Map3D && Map3D.on && Map3D.map) ? Map3D.map : null;

  /* ---- capture / apply camera (map-agnostic: zoom stored as Leaflet zoom) ---- */
  function curCam() { const g = gl(); if (g) { const c = g.getCenter(); return { lat: c.lat, lng: c.lng, zoom: g.getZoom() + 1, pitch: g.getPitch(), bearing: g.getBearing() }; } const c = L2.getCenter(); return { lat: c.lat, lng: c.lng, zoom: L2.getZoom(), pitch: 0, bearing: 0 }; }
  function applyCam(c) { if (!c) return; const g = gl(); if (g) g.jumpTo({ center: [c.lng, c.lat], zoom: Math.max(0, (c.zoom || 3) - 1), pitch: c.pitch || 0, bearing: c.bearing || 0 }); else L2.setView([c.lat, c.lng], Math.round(c.zoom || 5), { animate: false }); }
  const curPose = m => ({ lat: m.lat, lng: m.lng, scale: m.scale || 1, rotZ: m.rotZ || 0, pitch: m.pitch || 0, roll: m.roll || 0, alt: m.alt || 0 });

  /* ---- interpolation ---- */
  const angLerp = (a, b, f) => { const d = ((b - a + 540) % 360) - 180; return a + d * f; };
  function lerpKeys(keys, t, fields, ang) {
    if (!keys.length) return null;
    const ks = keys.slice().sort((a, b) => a.t - b.t);
    if (t <= ks[0].t) return ks[0]; if (t >= ks[ks.length - 1].t) return ks[ks.length - 1];
    let i = 0; while (i < ks.length - 1 && t > ks[i + 1].t) i++;
    const a = ks[i], b = ks[i + 1], f = (t - a.t) / ((b.t - a.t) || 1), o = {};
    fields.forEach(k => { o[k] = ang.indexOf(k) >= 0 ? angLerp(a[k] || 0, b[k] || 0, f) : ((a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * f); });
    return o;
  }
  const CAMF = ['lat', 'lng', 'zoom', 'pitch', 'bearing'], CAMA = ['bearing'];
  const POSEF = ['lat', 'lng', 'scale', 'rotZ', 'pitch', 'roll', 'alt'], POSEA = ['rotZ'];
  function applyAt(t) {
    const tl = TL();
    if (tl.cam && tl.cam.length) applyCam(lerpKeys(tl.cam, t, CAMF, CAMA));
    const pm = {}, mm = tl.models || {};
    for (const id in mm) { const ks = mm[id]; if (ks && ks.length) pm[id] = lerpKeys(ks, t, POSEF, POSEA); }
    if (Object.keys(pm).length && window.Models3D) window.Models3D.tick(pm);
  }

  /* ---- playback loop (both windows) ---- */
  let raf = null;
  function frame() {
    raf = requestAnimationFrame(frame);
    const tl = TL(); if (!tl.playing) return;
    let t = (Date.now() - (tl.t0 || Date.now())) / 1000;
    if (t >= tl.dur) { if (tl.loop) t = t % tl.dur; else { t = tl.dur; if (isCtrl) S.setTimeline({ playing: false, head: tl.dur }); } }
    applyAt(t);
    if (isCtrl && bar) renderHead(t);
  }
  frame();

  /* ---- transport ---- */
  function play() { const tl = TL(); const from = tl.head >= tl.dur ? 0 : (tl.head || 0); S.setTimeline({ playing: true, head: from, t0: Date.now() - from * 1000 }); }
  function pause() { const tl = TL(); const t = Math.min(tl.dur, (Date.now() - (tl.t0 || Date.now())) / 1000); S.setTimeline({ playing: false, head: t }); }
  function stop() { S.setTimeline({ playing: false, head: 0 }); applyAt(0); }
  function seek(t) { S.setTimeline({ playing: false, head: Math.max(0, Math.min(TL().dur, t)) }); }
  function clearAll() { if (window.Models3D) Models3D.clearPoses(); S.setTimeline({ cam: [], models: {}, head: 0, playing: false }); }

  /* ---- keyframe edits ---- */
  function addCamKey() { const tl = TL(); const cam = (tl.cam || []).filter(k => Math.abs(k.t - tl.head) > 0.05); cam.push(Object.assign({ t: +tl.head.toFixed(2) }, curCam())); S.setTimeline({ cam }); }
  function addModelKey(id) { const m = models().find(x => x.id === id); if (!m) return; const tl = TL(); const mm = Object.assign({}, tl.models); const ks = (mm[id] || []).filter(k => Math.abs(k.t - tl.head) > 0.05); ks.push(Object.assign({ t: +tl.head.toFixed(2) }, curPose(m))); mm[id] = ks; S.setTimeline({ models: mm }); }
  function delCamKey(idx) { const tl = TL(); const cam = (tl.cam || []).slice(); cam.splice(idx, 1); S.setTimeline({ cam }); }
  function delModelKey(id, idx) { const tl = TL(); const mm = Object.assign({}, tl.models); const ks = (mm[id] || []).slice(); ks.splice(idx, 1); if (ks.length) mm[id] = ks; else delete mm[id]; S.setTimeline({ models: mm }); }

  /* ===================== editor UI (control only) ===================== */
  let panel = null, bar = null, headEl = null, timeEl = null, durEl = null, open = false;
  function build() {
    panel = h('div', 'tl glass'); panel.hidden = true;
    const hd = h('div', 'tl__hd');
    const playB = h('button', 'tl__b', I.play); playB.title = 'Play / pause'; playB.onclick = () => TL().playing ? pause() : play();
    const stopB = h('button', 'tl__b', I.close); stopB.title = 'Stop (to start)'; stopB.onclick = stop;
    timeEl = h('span', 'tl__time', '0.0 / 15s');
    const dur = h('input', 'tl__dur'); dur.type = 'number'; dur.min = '1'; dur.step = '1'; dur.title = 'Duration (s)'; dur.onchange = () => S.setTimeline({ dur: Math.max(1, +dur.value || 15) }); durEl = dur;
    const loop = h('button', 'tl__b', I.redo || I.undo); loop.title = 'Loop'; loop.onclick = () => { S.setTimeline({ loop: !TL().loop }); loop.classList.toggle('on', TL().loop); };
    const clr = h('button', 'tl__b', I.erase); clr.title = 'Clear all keyframes'; clr.onclick = () => { if (confirm('Clear the whole timeline?')) clearAll(); };
    const cls = h('button', 'tl__b', I.chevron); cls.title = 'Hide timeline'; cls.style.marginLeft = 'auto'; cls.onclick = () => toggle(false);
    hd.append(playB, stopB, timeEl, dur, h('span', 'tl__lab', 's'), loop, clr, cls); panel.appendChild(hd);

    bar = h('div', 'tl__ruler'); headEl = h('div', 'tl__head'); bar.appendChild(headEl);
    bar.onclick = e => { const r = bar.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * TL().dur); };
    panel.appendChild(bar);
    tracks = h('div', 'tl__tracks'); panel.appendChild(tracks);
    document.body.appendChild(panel);
    renderUI();
  }
  let tracks = null;
  function trackRow(label, keys, onAdd, onDel) {
    const tl = TL();
    const row = h('div', 'tl__trk');
    const add = h('button', 'tl__key', I.plus); add.title = 'Add keyframe at playhead'; add.onclick = onAdd;
    const lab = h('span', 'tl__trklab', label);
    const lane = h('div', 'tl__lane');
    (keys || []).forEach((k, i) => { const tick = h('span', 'tl__tick'); tick.style.left = (k.t / Math.max(1, tl.dur) * 100) + '%'; tick.title = label + ' @ ' + k.t.toFixed(1) + 's'; tick.onclick = ev => { ev.stopPropagation(); seek(k.t); }; const x = h('span', 'tl__tickx', '×'); x.onclick = ev => { ev.stopPropagation(); onDel(i); }; tick.appendChild(x); lane.appendChild(tick); });
    row.append(add, lab, lane); return row;
  }
  function renderUI() {
    if (!panel) return;
    const tl = TL();
    if (durEl && document.activeElement !== durEl) durEl.value = tl.dur;
    renderHead(tl.playing ? undefined : tl.head);
    tracks.innerHTML = '';
    tracks.appendChild(trackRow('Camera', tl.cam, addCamKey, delCamKey));
    models().forEach(m => tracks.appendChild(trackRow(m.name || 'Model', (tl.models || {})[m.id] || [], () => addModelKey(m.id), i => delModelKey(m.id, i))));
  }
  function renderHead(t) {
    const tl = TL(); const cur = (t == null) ? tl.head : t;
    if (headEl) headEl.style.left = (Math.max(0, Math.min(tl.dur, cur)) / Math.max(1, tl.dur) * 100) + '%';
    if (timeEl) timeEl.textContent = (cur || 0).toFixed(1) + ' / ' + tl.dur + 's';
  }
  function toggle(v) { if (!panel) build(); open = (v == null) ? !open : v; panel.hidden = !open; if (open) renderUI(); }

  if (isCtrl) {
    // launcher chip
    const launch = h('button', 'tl-launch glass', I.film + '<span>Timeline</span>'); launch.title = 'Open the movement timeline'; launch.onclick = () => toggle();
    document.body.appendChild(launch);
  }

  // only re-apply when the playhead actually moved (seek/scrub) — NOT on every
  // unrelated cross-window 'sync', which would otherwise yank the camera/models.
  let lastApplied = -1;
  S.on((st, evt) => {
    if (evt === 'timeline' || evt === 'sync') {
      const tl = TL();
      if (!tl.playing && tl.head !== lastApplied) { lastApplied = tl.head; applyAt(tl.head || 0); }
      if (isCtrl && open) renderUI();
    }
    if (evt === 'models3d' && isCtrl && open) renderUI();   // model added/removed → refresh tracks
  });

  window.Timeline = { toggle, play, pause, stop, seek };
})();
