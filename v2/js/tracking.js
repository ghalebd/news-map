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

  /* -------------------- ships (AIS) -------------------- */
  const Ships = {
    on: false, socket: null, ships: new Map(), layer: null,
    reconnectT: null, pruneT: null, resubT: null, STALE: 5 * 60 * 1000,
    set(v) { if (v === this.on) return; this.on = v; v ? this.start() : this.stop(); setCounts(); },
    start() {
      this.layer = this.layer || L.layerGroup(); this.layer.addTo(map);
      this.connect();
      this.pruneT = setInterval(() => this.prune(), 30000);
    },
    stop() {
      clearTimeout(this.reconnectT); clearInterval(this.pruneT); clearTimeout(this.resubT);
      if (this.socket) { try { this.socket.close(); } catch (e) {} this.socket = null; }
      if (this.layer) map.removeLayer(this.layer);
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
    },
    upsert(mmsi, info) {
      let s = this.ships.get(mmsi);
      if (!s) {
        s = { mmsi, ...info };
        s.marker = L.marker([s.lat, s.lng], { icon: icon('ship', s.course), zIndexOffset: 100, keyboard: false });
        s.marker.bindTooltip(`<b>${s.name}</b><br>${typeof s.speed === 'number' ? s.speed.toFixed(1) + ' kn' : '—'}`, { direction: 'top', offset: [0, -10], className: 'trk-tip', sticky: true });
        if (this.layer) s.marker.addTo(this.layer);
        this.ships.set(mmsi, s); setCounts();
      } else { Object.assign(s, info); s.marker.setLatLng([s.lat, s.lng]); s.marker.setIcon(icon('ship', s.course)); s.marker.setTooltipContent(`<b>${s.name}</b><br>${typeof s.speed === 'number' ? s.speed.toFixed(1) + ' kn' : '—'}`); }
    },
    prune() { const now = Date.now(); let n = 0; for (const [k, s] of this.ships) { if (now - s.t > this.STALE) { if (s.marker && this.layer) this.layer.removeLayer(s.marker); this.ships.delete(k); n++; } } if (n) setCounts(); },
  };

  /* -------------------- flights (airplanes.live) -------------------- */
  const Flights = {
    on: false, flights: new Map(), layer: null, timer: null,
    set(v) { if (v === this.on) return; this.on = v; v ? this.start() : this.stop(); setCounts(); },
    start() { this.layer = this.layer || L.layerGroup(); this.layer.addTo(map); setStatus('flights', 'live'); this.fetch(); this.timer = setInterval(() => this.fetch(), 10000); },
    stop() { clearInterval(this.timer); if (this.layer) map.removeLayer(this.layer); this.flights.clear(); },
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
      this.flights.forEach((f, k) => { if (!seen.has(k)) { if (f.marker && this.layer) this.layer.removeLayer(f.marker); this.flights.delete(k); } });
      setCounts();
    },
    upsert(icao, info) {
      let f = this.flights.get(icao);
      const tip = `<b>${info.callsign || 'Unknown'}</b><br>${info.type || '?'} · ${Math.round(info.alt)}ft · ${Math.round(info.velocity * 1.94)}kt`;
      if (!f) {
        f = { icao, ...info };
        f.marker = L.marker([info.lat, info.lng], { icon: icon('plane', info.heading), zIndexOffset: 200, keyboard: false });
        f.marker.bindTooltip(tip, { direction: 'top', offset: [0, -12], className: 'trk-tip', sticky: true });
        if (this.layer) f.marker.addTo(this.layer);
        this.flights.set(icao, f);
      } else { Object.assign(f, info); f.marker.setLatLng([info.lat, info.lng]); f.marker.setIcon(icon('plane', info.heading)); f.marker.setTooltipContent(tip); }
    },
  };

  function icon(kind, rot) {
    return L.divIcon({ className: 'trk trk--' + kind, html: `<span class="trk__rot" style="transform:rotate(${rot || 0}deg)">${kind === 'ship' ? I.ship : I.plane}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
  }

  /* -------------------- control bar -------------------- */
  const bar = h('div', 'livetrack glass');
  const mk = (key, icn, label) => { const b = h('button', 'lt-btn', `${icn}<span>${label}</span><i class="lt-dot"></i>`); b.onclick = () => { const can = isControl || S.cfg().permissions.canTrack !== false; if (can) S.setTracking(key, !S.state.tracking[key]); }; return b; };
  const bShips = mk('ships', I.ship, 'Ships'), bFlights = mk('flights', I.plane, 'Flights');
  bar.append(bShips, bFlights); document.body.appendChild(bar);

  function setStatus(kind, st) { const b = kind === 'ships' ? bShips : bFlights; const d = b.querySelector('.lt-dot'); if (d) d.dataset.st = st; }
  function setCounts() {
    bShips.classList.toggle('is-on', Ships.on); bFlights.classList.toggle('is-on', Flights.on);
    bShips.querySelector('span').textContent = Ships.on ? `Ships ${Ships.ships.size}` : 'Ships';
    bFlights.querySelector('span').textContent = Flights.on ? `Flights ${Flights.flights.size}` : 'Flights';
  }
  function applyGate() {
    bar.hidden = !isControl && S.cfg().visibility.tracking === false;
    const can = isControl || S.cfg().permissions.canTrack !== false;
    bar.classList.toggle('is-locked', !can);
  }
  function sync() { bShips.classList.toggle('is-on', S.state.tracking.ships); bFlights.classList.toggle('is-on', S.state.tracking.flights); Ships.set(S.state.tracking.ships); Flights.set(S.state.tracking.flights); applyGate(); }

  S.on((st, evt) => { if (evt === 'tracking' || evt === 'sync' || evt === 'config') sync(); });
  map.on('moveend', () => { if (Ships.on) Ships.onView(); if (Flights.on) Flights.fetch(); });
  sync();
  window.Tracking = { Ships, Flights };
})();
