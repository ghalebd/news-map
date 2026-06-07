/* ============================================================
   TRACKING — live overlays (independent of scenes):
     • Ships  via aisstream.io  (WebSocket, bbox-subscribed)
     • Flights via airplanes.live (+ OpenSky proxy fallback)
   Enabled state is shared (Store.state.tracking) so the control
   console and the presenter stay in lockstep. Each window runs
   its own connection. Governed by visibility.tracking +
   permissions.canTrack (control console is exempt).
   ============================================================ */
(() => {
  const S = window.Store, M = window.GameMap, I = window.ICONS;
  const map = M.map;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const isControl = window.APP_ROLE === 'control';
  const AIS_KEY = '3da0a878476db856ac5cf273d312875598270404';
  const RT_CAP = 80;      // max simultaneous route lines (visible ships)
  /* all tunables come from config.trackStyle (control panel) */
  const TS = () => Object.assign({ shipColor: '#46d8ff', flightColor: '#ffd54a', lineWeight: 1, lineOpacity: 0.4, vectorMins: 3, trailPoints: 60, maxShips: 300, showVectors: true, showHistory: true, showRoutes: true }, S.cfg().trackStyle || {});
  const rtFaint = () => { const w = TS().lineWeight; return { interactive: false, color: '#5fd8ff', weight: Math.max(.8, w), opacity: Math.min(.6, TS().lineOpacity * .8), dashArray: '3 7', lineCap: 'round' }; };
  const rtFocus = () => { const w = TS().lineWeight; return { interactive: false, color: '#8af0ff', weight: Math.max(1.6, w * 1.8), opacity: .85, dashArray: '7 6', lineCap: 'round' }; };
  const showTrails = () => S.state.tracking.trails !== false;   // master route/trail line visibility

  /* project a point distM metres along a heading (deg) from lat/lng */
  function project(lat, lng, headingDeg, distM) {
    const r = (headingDeg || 0) * Math.PI / 180;
    return [lat + (distM * Math.cos(r)) / 111320, lng + (distM * Math.sin(r)) / (111320 * Math.cos(lat * Math.PI / 180) || 1e-6)];
  }
  /* immediate course/speed vector — visible from the FIRST position, before any
     travelled history accumulates. obj keeps obj.vector on the given layer. */
  function drawVector(obj, layer, color, headingDeg, speedMs, secs) {
    if (!layer) return;
    const t = TS();
    if (t.showVectors && speedMs > 0.3) {
      const end = project(obj.lat, obj.lng, headingDeg, speedMs * secs);
      const st = { color, weight: Math.max(.8, t.lineWeight), opacity: Math.min(.7, t.lineOpacity), dashArray: '3 6', lineCap: 'round', interactive: false };
      if (!obj.vector) obj.vector = L.polyline([[obj.lat, obj.lng], end], st).addTo(layer);
      else { obj.vector.setLatLngs([[obj.lat, obj.lng], end]); obj.vector.setStyle(st); }
    } else if (obj.vector) { layer.removeLayer(obj.vector); obj.vector = null; }
  }

  /* -------------------- ships (AIS) -------------------- */
  const Ships = {
    on: false, socket: null, ships: new Map(), layer: null, focus: null,
    reconnectT: null, pruneT: null, resubT: null, STALE: 5 * 60 * 1000,
    set(v) { if (v === this.on) return; this.on = v; v ? this.start() : this.stop(); setCounts(); },
    start() {
      this.route = this.route || L.layerGroup();
      this.trails = this.trails || L.layerGroup();
      this.pins = this.pins || L.layerGroup();
      if (showTrails()) { this.route.addTo(map); this.trails.addTo(map); this.pins.addTo(map); }
      this.layer = this.layer || L.layerGroup(); this.layer.addTo(map);      // markers (top, always)
      this.connect();
      this.pruneT = setInterval(() => this.prune(), 30000);
    },
    showTrails(on) {
      [this.route, this.trails, this.pins].forEach(g => { if (!g) return; if (on) g.addTo(map); else map.removeLayer(g); });
    },
    stop() {
      clearTimeout(this.reconnectT); clearInterval(this.pruneT); clearTimeout(this.resubT);
      if (this.socket) { try { this.socket.close(); } catch (e) {} this.socket = null; }
      if (this.layer) map.removeLayer(this.layer);
      if (this.trails) { map.removeLayer(this.trails); this.trails.clearLayers(); }
      if (this.route) { map.removeLayer(this.route); this.route.clearLayers(); }
      if (this.pins) { map.removeLayer(this.pins); this.pins.clearLayers(); }
      this.ships.clear();
    },
    connect() {
      try { this.socket = new WebSocket('wss://stream.aisstream.io/v0/stream'); }
      catch (e) { setStatus('ships', 'err'); return; }
      setStatus('ships', 'wait');
      this.socket.binaryType = 'arraybuffer';
      this.socket.onopen = () => { this.subscribe(); setStatus('ships', 'live'); };
      this.socket.onmessage = ev => {
        try {
          let txt = typeof ev.data === 'string' ? ev.data : (ev.data instanceof ArrayBuffer ? new TextDecoder().decode(ev.data) : null);
          if (txt == null && ev.data && ev.data.text) { ev.data.text().then(t => { try { this.handle(JSON.parse(t)); } catch (e) {} }); return; }
          if (txt != null) this.handle(JSON.parse(txt));
        } catch (e) {}
      };
      this.socket.onerror = () => setStatus('ships', 'err');
      this.socket.onclose = () => { if (this.on) { setStatus('ships', 'wait'); clearTimeout(this.reconnectT); this.reconnectT = setTimeout(() => this.connect(), 3000); } };
    },
    subscribe() {
      if (!this.socket || this.socket.readyState !== 1) return;
      const b = map.getBounds();
      const sub = { APIKey: AIS_KEY, BoundingBoxes: [[[Math.max(-90, b.getSouth()), Math.max(-180, b.getWest())], [Math.min(90, b.getNorth()), Math.min(180, b.getEast())]]] };
      this.socket.send(JSON.stringify(sub));
    },
    onView() { if (!this.on || !this.socket || this.socket.readyState !== 1) return; clearTimeout(this.resubT); this.resubT = setTimeout(() => this.subscribe(), 600); },
    handle(msg) {
      const meta = msg.MetaData || {}; const mmsi = meta.MMSI; if (!mmsi) return;
      const pr = (msg.Message && (msg.Message.PositionReport || msg.Message.StandardClassBPositionReport || msg.Message.ExtendedClassBPositionReport || msg.Message.AidsToNavigationReport));
      if (pr && typeof pr.Latitude === 'number' && typeof pr.Longitude === 'number') {
        let rot = (pr.TrueHeading >= 0 && pr.TrueHeading < 360) ? pr.TrueHeading : pr.Cog;
        this.upsert(mmsi, { lat: pr.Latitude, lng: pr.Longitude, course: typeof rot === 'number' ? rot : 0, speed: pr.Sog, name: (meta.ShipName || '').trim() || ('MMSI ' + mmsi), t: Date.now() });
      }
      // static data: voyage destination + ETA
      const sd = msg.Message && msg.Message.ShipStaticData;
      if (sd) {
        const s = this.ships.get(mmsi); if (!s) return;
        const dest = (sd.Destination || '').replace(/[@_]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (dest) s.dest = dest; s.eta = sd.Eta;
        if (sd.Name) s.name = sd.Name.replace(/[@_]+/g, ' ').trim() || s.name;
        this.resolveDest(s);
        if (s.marker) s.marker.setTooltipContent(this.tipHtml(s));
        this.ensureRoute(s);
        if (this.focus === mmsi) this.applyFocus(mmsi);
      }
    },
    resolveDest(s) { if (s.dest && window.PortLookup) { const p = window.PortLookup.find(s.dest); if (p && (!s.destPort || s.destPort.unloc !== p.unloc)) { s.destPort = p; s._destChanged = true; } } },
    etaText(eta) { if (!eta || !eta.Month) return ''; const p = n => String(n).padStart(2, '0'); return `${p(eta.Day)}/${p(eta.Month)} ${p(eta.Hour)}:${p(eta.Minute)} UTC`; },
    tipHtml(s) {
      const sp = typeof s.speed === 'number' ? s.speed.toFixed(1) + ' kn' : '—';
      let h = `<b>${s.name}</b><br><span class="trk-sub">${sp}</span>`;
      if (s.dest) { const d = s.destPort ? s.destPort.name : s.dest; h += `<br><span class="trk-dest">→ ${d}</span>`; const e = this.etaText(s.eta); if (e) h += `<br><span class="trk-eta">ETA ${e}</span>`; }
      return h;
    },
    upsert(mmsi, info) {
      let s = this.ships.get(mmsi);
      if (!s && this.ships.size >= TS().maxShips) return;   // soft cap (control panel)
      if (!s) {
        s = { mmsi, trail: [[info.lat, info.lng]], ...info };
        s.marker = L.marker([s.lat, s.lng], { icon: icon('ship', s.course, this.focus === mmsi), zIndexOffset: 100, keyboard: false });
        s.marker.bindTooltip(this.tipHtml(s), { direction: 'top', offset: [0, -12], className: 'trk-tip', sticky: true });
        s.marker.on('click', () => S.setTrackFocus(this.focus === mmsi ? null : mmsi));
        if (this.layer) s.marker.addTo(this.layer);
        this.ships.set(mmsi, s); setCounts();
      } else { Object.assign(s, info); s.marker.setLatLng([s.lat, s.lng]); s.marker.setIcon(icon('ship', s.course, this.focus === mmsi)); s.marker.setTooltipContent(this.tipHtml(s)); }
      this.trail(s);
      this.ensureRoute(s);
    },
    /* auto-draw the sea-lane route for every ship with a known destination
       that is currently in view (throttled + capped for performance) */
    ensureRoute(s) {
      if (!this.on || !this.route || !window.searoute) return;
      const inView = map.getBounds().pad(0.25).contains([s.lat, s.lng]);
      if (!s.destPort || !inView || !TS().showRoutes) { if (s.routeLine) { this.route.removeLayer(s.routeLine); s.routeLine = null; } return; }
      const now = Date.now();
      const moved = !s._rp || Math.abs(s._rp[0] - s.lat) > 0.25 || Math.abs(s._rp[1] - s.lng) > 0.25;
      if (s.routeLine && !s._destChanged && !moved) return;
      if (s._rt && now - s._rt < 5000 && !s._destChanged) return;
      if (!s.routeLine && this.route.getLayers().length >= RT_CAP) { if (!this._cap) { console.log('[tracking] route cap ' + RT_CAP + ' reached — extra routes hidden'); this._cap = true; } return; }
      s._rt = now; s._rp = [s.lat, s.lng]; s._destChanged = false;
      let line = null; try { line = window.searoute([s.lng, s.lat], [s.destPort.lng, s.destPort.lat]); } catch (e) {}
      if (s.routeLine) { this.route.removeLayer(s.routeLine); s.routeLine = null; }
      const st = this.focus === s.mmsi ? rtFocus() : rtFaint();
      s.routeLine = line ? L.geoJSON(line, { interactive: false, style: st }) : L.polyline([[s.lat, s.lng], [s.destPort.lat, s.destPort.lng]], st);
      s.routeLine.addTo(this.route);
    },
    /* focus -> brighten that ship's route + show its destination pin/label */
    applyFocus(mmsi) {
      this.focus = mmsi;
      if (this.pins) this.pins.clearLayers();
      for (const [k, s] of this.ships) {
        if (s.marker) s.marker.setIcon(icon('ship', s.course, k === mmsi));
        if (s.routeLine && s.routeLine.setStyle) s.routeLine.setStyle(k === mmsi ? rtFocus() : rtFaint());
      }
      if (mmsi == null) return;
      const s = this.ships.get(mmsi); if (!s) return;
      this.resolveDest(s); s._destChanged = true; this.ensureRoute(s);
      if (s.routeLine && s.routeLine.setStyle) s.routeLine.setStyle(rtFocus());
      if (s.destPort && this.pins) {
        const lbl = `<span class="port-pin__lbl">${s.destPort.name}${this.etaText(s.eta) ? ' · ETA ' + this.etaText(s.eta) : ''}</span>`;
        L.marker([s.destPort.lat, s.destPort.lng], { interactive: false, icon: L.divIcon({ className: 'port-pin', html: `<i></i>${lbl}`, iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(this.pins);
      }
    },
    trail(s) {
      const t = TS();
      const last = s.trail[s.trail.length - 1];
      if (!last || Math.abs(last[0] - s.lat) > 1e-4 || Math.abs(last[1] - s.lng) > 1e-4) s.trail.push([s.lat, s.lng]);
      while (s.trail.length > t.trailPoints) s.trail.shift();
      if (!this.trails) return;
      drawVector(s, this.trails, t.shipColor, s.course, (typeof s.speed === 'number' ? s.speed : 0) * 0.5144, t.vectorMins * 60);
      if (!t.showHistory || s.trail.length < 2) { if (s.line) { this.trails.removeLayer(s.line); s.line = null; } if (s.head) { this.trails.removeLayer(s.head); s.head = null; } return; }
      const recent = s.trail.slice(-10), lw = t.lineWeight, lo = t.lineOpacity;
      const ls = { color: t.shipColor, weight: Math.max(.8, lw), opacity: Math.min(.5, lo * .9), lineCap: 'round', lineJoin: 'round', interactive: false };
      const hs = { color: '#bdeeff', weight: Math.max(1, lw * 1.6), opacity: Math.min(.85, lo * 1.8), lineCap: 'round', lineJoin: 'round', interactive: false };
      if (!s.line) s.line = L.polyline(s.trail, ls).addTo(this.trails); else { s.line.setLatLngs(s.trail); s.line.setStyle(ls); }
      if (!s.head) s.head = L.polyline(recent, hs).addTo(this.trails); else { s.head.setLatLngs(recent); s.head.setStyle(hs); }
    },
    prune() { const now = Date.now(); let n = 0; for (const [k, s] of this.ships) { if (now - s.t > this.STALE) { if (s.marker && this.layer) this.layer.removeLayer(s.marker); if (this.trails) { if (s.line) this.trails.removeLayer(s.line); if (s.head) this.trails.removeLayer(s.head); if (s.vector) this.trails.removeLayer(s.vector); } if (s.routeLine && this.route) this.route.removeLayer(s.routeLine); if (k === this.focus && this.pins) this.pins.clearLayers(); this.ships.delete(k); n++; } } if (n) setCounts(); },
  };

  /* -------------------- flights (airplanes.live) -------------------- */
  const Flights = {
    on: false, flights: new Map(), layer: null, ftrails: null, timer: null,
    set(v) { if (v === this.on) return; this.on = v; v ? this.start() : this.stop(); setCounts(); },
    start() {
      this.ftrails = this.ftrails || L.layerGroup(); if (showTrails()) this.ftrails.addTo(map);
      this.layer = this.layer || L.layerGroup(); this.layer.addTo(map);
      setStatus('flights', 'live'); this.fetch(); this.timer = setInterval(() => this.fetch(), 10000);
    },
    stop() { clearInterval(this.timer); if (this.layer) map.removeLayer(this.layer); if (this.ftrails) { map.removeLayer(this.ftrails); this.ftrails.clearLayers(); } this.flights.clear(); },
    showTrails(on) { if (!this.ftrails) return; if (on) this.ftrails.addTo(map); else map.removeLayer(this.ftrails); },
    trail(f) {
      f.trail = f.trail || [[f.lat, f.lng]];
      const last = f.trail[f.trail.length - 1];
      if (!last || Math.abs(last[0] - f.lat) > 1e-4 || Math.abs(last[1] - f.lng) > 1e-4) f.trail.push([f.lat, f.lng]);
      while (f.trail.length > TS().trailPoints) f.trail.shift();
      if (!this.ftrails) return;
      const t = TS();
      drawVector(f, this.ftrails, t.flightColor, f.heading, f.velocity || 0, t.vectorMins * 25);
      if (!t.showHistory || f.trail.length < 2) { if (f.line) { this.ftrails.removeLayer(f.line); f.line = null; } if (f.head) { this.ftrails.removeLayer(f.head); f.head = null; } return; }
      const recent = f.trail.slice(-10), lw = t.lineWeight, lo = t.lineOpacity;
      const ls = { color: t.flightColor, weight: Math.max(.8, lw), opacity: Math.min(.5, lo * .9), lineCap: 'round', lineJoin: 'round', interactive: false };
      const hs = { color: '#fff0b8', weight: Math.max(1, lw * 1.6), opacity: Math.min(.8, lo * 1.7), lineCap: 'round', lineJoin: 'round', interactive: false };
      if (!f.line) f.line = L.polyline(f.trail, ls).addTo(this.ftrails); else { f.line.setLatLngs(f.trail); f.line.setStyle(ls); }
      if (!f.head) f.head = L.polyline(recent, hs).addTo(this.ftrails); else { f.head.setLatLngs(recent); f.head.setStyle(hs); }
    },
    async fetch() {
      if (!this.on) return;
      const b = map.getBounds(), c = map.getCenter();
      const distNM = Math.min(Math.max(50, c.distanceTo(L.latLng(b.getNorth(), b.getEast())) / 1852), 1000);
      const sources = [
        { url: `https://api.airplanes.live/v2/point/${c.lat.toFixed(2)}/${c.lng.toFixed(2)}/${Math.round(distNM)}`, parse: d => (d.ac || d.aircraft || []).filter(a => a.lat != null && a.lon != null).map(a => ({ icao: a.hex, callsign: (a.flight || a.r || '').trim(), lat: a.lat, lng: a.lon, alt: a.alt_baro || 0, velocity: (a.gs || 0) * 0.5144, heading: a.track || a.true_heading || 0, type: a.t || '' })) },
        { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://opensky-network.org/api/states/all?lamin=${b.getSouth().toFixed(3)}&lomin=${b.getWest().toFixed(3)}&lamax=${b.getNorth().toFixed(3)}&lomax=${b.getEast().toFixed(3)}`)}`, parse: d => (d.states || []).filter(s => s[6] != null && s[5] != null && !s[8]).map(s => ({ icao: s[0], callsign: (s[1] || '').trim(), lat: s[6], lng: s[5], alt: (s[7] || 0) * 3.281, velocity: s[9] || 0, heading: s[10] || 0, type: '' })) },
      ];
      let ac = null;
      for (const src of sources) { try { const r = await fetch(src.url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) continue; ac = src.parse(await r.json()); break; } catch (e) {} }
      if (!ac) return;
      const seen = new Set(), bounds = map.getBounds();
      ac.forEach(a => { if (!bounds.contains([a.lat, a.lng])) return; seen.add(a.icao); this.upsert(a.icao, a); });
      this.flights.forEach((f, k) => { if (!seen.has(k)) { if (f.marker && this.layer) this.layer.removeLayer(f.marker); if (this.ftrails) { if (f.line) this.ftrails.removeLayer(f.line); if (f.head) this.ftrails.removeLayer(f.head); if (f.vector) this.ftrails.removeLayer(f.vector); } this.flights.delete(k); } });
      setCounts();
    },
    upsert(icao, info) {
      let f = this.flights.get(icao);
      const tip = `<b>${info.callsign || 'Unknown'}</b><br>${info.type || '?'} · ${Math.round(info.alt)}ft · ${Math.round(info.velocity * 1.94)}kt`;
      if (!f) {
        f = { icao, trail: [[info.lat, info.lng]], ...info };
        f.marker = L.marker([info.lat, info.lng], { icon: icon('plane', info.heading), zIndexOffset: 200, keyboard: false });
        f.marker.bindTooltip(tip, { direction: 'top', offset: [0, -12], className: 'trk-tip', sticky: true });
        if (this.layer) f.marker.addTo(this.layer);
        this.flights.set(icao, f);
      } else { Object.assign(f, info); f.marker.setLatLng([info.lat, info.lng]); f.marker.setIcon(icon('plane', info.heading)); f.marker.setTooltipContent(tip); }
      this.trail(f);
    },
  };

  /* serious technical top-down silhouettes (bow/nose up = heading 0; rotated by the wrapper) */
  const SHIP_SVG = '<svg viewBox="0 0 24 24">' +
    '<path d="M12 1.4C13.4 3 14.1 5.2 14.2 8L14.2 18.6C14.2 19.8 13.4 20.4 12 20.5C10.6 20.4 9.8 19.8 9.8 18.6L9.8 8C9.9 5.2 10.6 3 12 1.4Z" fill="#dde7f0" stroke="#0a121c" stroke-width="1" stroke-linejoin="round"/>' +
    '<rect x="10.5" y="6.2" width="3" height="1.7" rx=".3" fill="#8fa3b6"/><rect x="10.5" y="8.5" width="3" height="1.7" rx=".3" fill="#8fa3b6"/><rect x="10.5" y="10.8" width="3" height="1.7" rx=".3" fill="#8fa3b6"/>' +
    '<rect x="10.3" y="14.2" width="3.4" height="4" rx=".5" fill="#243140"/>' +
    '<line x1="12" y1="2.6" x2="12" y2="18.4" stroke="#0a121c" stroke-width=".4" opacity=".3"/></svg>';
  const PLANE_SVG = '<svg viewBox="0 0 24 24">' +
    '<path d="M12 1.8c.74 0 1.2.9 1.24 2.1l.13 5.3 8.53 4.9v1.95l-8.5-2.6.16 4.45 2.45 1.8v1.4L12 19.85l-3.96.95v-1.4l2.45-1.8.16-4.45-8.5 2.6V13.1l8.53-4.9.13-5.3C10.8 2.7 11.26 1.8 12 1.8Z" fill="#e7edf4" stroke="#0a121c" stroke-width=".85" stroke-linejoin="round"/>' +
    '<line x1="12" y1="3.4" x2="12" y2="18.2" stroke="#0a121c" stroke-width=".4" opacity=".28"/></svg>';
  function icon(kind, rot, focus) {
    return L.divIcon({ className: 'trk trk--' + kind + (focus ? ' is-focus' : ''), html: `<span class="trk__rot" style="transform:rotate(${rot || 0}deg)">${kind === 'ship' ? SHIP_SVG : PLANE_SVG}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
  }

  /* -------------------- control bar -------------------- */
  const bar = h('div', 'livetrack glass');
  const mk = (key, icn, label) => { const b = h('button', 'lt-btn', `${icn}<span>${label}</span><i class="lt-dot"></i>`); b.onclick = () => { const can = isControl || S.cfg().permissions.canTrack !== false; if (can) S.setTracking(key, !S.state.tracking[key]); }; return b; };
  const bShips = mk('ships', I.ship, 'Ships'), bFlights = mk('flights', I.plane, 'Flights');
  const bTrails = h('button', 'lt-btn', `${I.curve}<span>Trails</span>`); bTrails.title = 'Show / hide route & trail lines';
  bTrails.onclick = () => { const can = isControl || S.cfg().permissions.canTrack !== false; if (can) S.setTracking('trails', !showTrails()); };
  bar.append(bShips, bFlights, bTrails); document.body.appendChild(bar);

  function setStatus(kind, st) { const b = kind === 'ships' ? bShips : bFlights; const d = b.querySelector('.lt-dot'); if (d) d.dataset.st = st; }
  function setCounts() {
    bShips.classList.toggle('is-on', Ships.on); bFlights.classList.toggle('is-on', Flights.on);
    bShips.querySelector('span').textContent = Ships.on ? `Ships ${Ships.ships.size}` : 'Ships';
    bFlights.querySelector('span').textContent = Flights.on ? `Flights ${Flights.flights.size}` : 'Flights';
  }
  function applyGate() {
    // control window drives tracking from the side panel's "Live layers" card,
    // so the floating bar only shows on the presenter.
    bar.hidden = isControl || S.cfg().visibility.tracking === false;
    const can = isControl || S.cfg().permissions.canTrack !== false;
    bar.classList.toggle('is-locked', !can);
  }
  function sync() {
    bShips.classList.toggle('is-on', S.state.tracking.ships); bFlights.classList.toggle('is-on', S.state.tracking.flights);
    bTrails.classList.toggle('is-on', showTrails());
    Ships.set(S.state.tracking.ships); Flights.set(S.state.tracking.flights);
    if (Ships.on) Ships.showTrails(showTrails());
    if (Flights.on) Flights.showTrails(showTrails());
    applyGate();
    if (Ships.on && Ships.focus !== S.state.trackFocus) Ships.applyFocus(S.state.trackFocus);
  }

  function restyle() {
    if (Ships.on) { for (const [, s] of Ships.ships) { Ships.trail(s); Ships.ensureRoute(s); } Ships.applyFocus(Ships.focus); }
    if (Flights.on) { for (const [, f] of Flights.flights) Flights.trail(f); }
  }
  let reT = null; const restyleDebounced = () => { clearTimeout(reT); reT = setTimeout(restyle, 140); };
  S.on((st, evt) => {
    if (evt === 'tracking' || evt === 'sync' || evt === 'config') sync();
    if (evt === 'config' || evt === 'sync') restyleDebounced();
    if (evt === 'trackfocus' || evt === 'sync') { if (Ships.on) Ships.applyFocus(S.state.trackFocus); }
  });
  map.on('moveend', () => { if (Ships.on) { Ships.onView(); for (const [, s] of Ships.ships) Ships.ensureRoute(s); } if (Flights.on) Flights.fetch(); });
  sync();
  window.Tracking = { Ships, Flights };
})();
