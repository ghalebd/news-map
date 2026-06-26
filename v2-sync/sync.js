// Realtime sync room: the dashboard broadcasts state changes, every connected presenter screen
// receives them instantly — across the world. Uses the WebSocket HIBERNATION API so the Durable
// Object sleeps while connections are idle and is evicted from memory between messages — otherwise a
// long-lived broadcast room keeps the DO active 24/7 and blows the free-tier duration budget (which
// made every request throw "Exceeded allowed duration"). The last full snapshot is persisted and
// replayed to any screen that joins later, so a new browser/device immediately gets the live state.
export class SyncRoom {
  constructor(state, env) { this.state = state; }
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('sync room', { status: 200 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);                       // hibernatable — no duration spent while idle
    try { const snap = await this.state.storage.get('snapshot'); if (snap) server.send(snap); } catch (e) {}
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, message) {
    const msg = typeof message === 'string' ? message : null;   // clients send JSON strings
    if (msg == null) return;
    try { const j = JSON.parse(msg); if (j && j.type === 'snapshot') await this.state.storage.put('snapshot', msg); } catch (e) {}
    for (const c of this.state.getWebSockets()) { if (c !== ws) { try { c.send(msg); } catch (e) {} } }
  }
  webSocketClose(ws) { try { ws.close(); } catch (e) {} }
  webSocketError(ws) { try { ws.close(); } catch (e) {} }
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const room = (u.searchParams.get('room') || 'default').slice(0, 64);
    const id = env.ROOM.idFromName(room);
    return env.ROOM.get(id).fetch(req);
  }
};
