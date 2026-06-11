// Realtime sync room: the dashboard broadcasts state changes,
// every connected presenter screen receives them instantly — across the world.
export class SyncRoom {
  constructor(state) { this.state = state; this.clients = new Set(); }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('sync room', { status: 200 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.clients.add(server);
    // replay last known full state to a newly joined screen
    const snap = await this.state.storage.get('snapshot');
    if (snap) { try { server.send(snap); } catch (e) {} }
    server.addEventListener('message', async ev => {
      const msg = ev.data;
      try { const j = JSON.parse(msg); if (j && j.type === 'snapshot') await this.state.storage.put('snapshot', msg); } catch (e) {}
      for (const c of this.clients) if (c !== server) { try { c.send(msg); } catch (e) { this.clients.delete(c); } }
    });
    const drop = () => this.clients.delete(server);
    server.addEventListener('close', drop); server.addEventListener('error', drop);
    return new Response(null, { status: 101, webSocket: client });
  }
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const room = u.searchParams.get('room') || 'default';
    const id = env.ROOM.idFromName(room);
    return env.ROOM.get(id).fetch(req);
  }
};
