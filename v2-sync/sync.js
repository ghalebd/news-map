// Realtime-ish state sync, Durable-Object-FREE. The dashboard POSTs its full snapshot to KV on each
// edit; every screen GET-polls the snapshot a few times a second... well, every few seconds, and adopts
// it if newer. No DO means no DO-duration limit (which had taken the old worker down on the free tier).
// CORS is open so the broadcast site (any origin) can fetch it. Snapshot is one KV key per room.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const room = (new URL(req.url).searchParams.get('room') || 'default').slice(0, 64);
    const key = 'snap:' + room;
    if (req.method === 'POST') {
      const body = await req.text();
      if (body && body.length < 2_000_000) { try { await env.SYNC_KV.put(key, body); } catch (e) {} }
      return new Response('ok', { headers: CORS });
    }
    if (req.method === 'GET') {
      let snap = '';
      try { snap = (await env.SYNC_KV.get(key)) || ''; } catch (e) {}
      return new Response(snap, { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    return new Response('sync up', { headers: CORS });
  },
};
