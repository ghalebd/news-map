// AIS HUB: ONE upstream connection to aisstream (their per-key limit),
// fanned out to ALL screens (dashboard + presenters). Key stays server-side.
export class AisHub {
  constructor(state, env) {
    this.env = env; this.clients = new Map();   // ws -> bbox
    this.up = null; this.upReady = false; this.connecting = false;
  }
  boxes() {
    const all = [...this.clients.values()].filter(Boolean);
    return all.length ? all : [[[-90, -180], [90, 180]]];
  }
  resub() {
    if (this.up && this.upReady) {
      try { this.up.send(JSON.stringify({ APIKey: this.env.AIS_KEY, BoundingBoxes: this.boxes() })); } catch (e) {}
    }
  }
  async ensureUpstream() {
    if (this.up || this.connecting) return;
    this.connecting = true;
    try {
      const r = await fetch('https://stream.aisstream.io/v0/stream', { headers: { Upgrade: 'websocket' } });
      const up = r.webSocket;
      if (!up) { this.connecting = false; return; }
      up.accept(); this.up = up; this.upReady = true; this.connecting = false;
      this.resub();
      up.addEventListener('message', async ev => {
        let d = ev.data;
        if (d && typeof d !== 'string' && !(d instanceof ArrayBuffer)) {
          try { d = d.arrayBuffer ? await d.arrayBuffer() : String(d); } catch (e) { return; }   // Blob → ArrayBuffer (send() can't take Blob)
        }
        for (const [c] of this.clients) { try { c.send(d); } catch (e) { this.clients.delete(c); } }
      });
      const gone = () => { this.up = null; this.upReady = false; if (this.clients.size) setTimeout(() => this.ensureUpstream(), 2000); };
      up.addEventListener('close', gone); up.addEventListener('error', gone);
    } catch (e) { this.connecting = false; }
  }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('AIS hub up · clients=' + this.clients.size + ' · upstream=' + (this.upReady ? 'live' : 'down'), { status: 200 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.clients.set(server, null);
    this.ensureUpstream();
    server.addEventListener('message', ev => {
      try { const j = JSON.parse(ev.data); if (j && j.BoundingBoxes) { this.clients.set(server, j.BoundingBoxes[0]); this.resub(); } } catch (e) {}
    });
    const drop = () => { this.clients.delete(server); this.resub(); if (!this.clients.size && this.up) { try { this.up.close(); } catch (e) {} this.up = null; this.upReady = false; } };
    server.addEventListener('close', drop); server.addEventListener('error', drop);
    return new Response(null, { status: 101, webSocket: client });
  }
}
export default {
  async fetch(req, env) {
    const id = env.HUB.idFromName('main');
    return env.HUB.get(id).fetch(req);
  }
};
