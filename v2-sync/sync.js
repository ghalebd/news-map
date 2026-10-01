// Realtime-ish state sync, Durable-Object-FREE. The control POSTs its full snapshot to KV on each edit;
// every screen GET-polls it every few seconds and adopts it if newer. No DO means no DO-duration limit
// (which had taken the old worker down on the free tier). One KV key per room.
//
// WRITE GUARD (optional, activates only when the ROOM_KEY secret exists):
//   wrangler secret put ROOM_KEY
// Until then this worker behaves exactly as before — deploying it is a no-op for the live broadcast.
// Once the secret is set, every POST must carry the key (X-Room-Key header, or ?k= for clients that
// cannot preflight) and, if it comes from a browser, an allowed Origin. READS STAY OPEN: the presenter
// never needs the key, and a read-only observer is a far smaller risk than an anonymous writer who can
// put anything on air (which, before this guard, anyone with the URL could do).
//
// CORS is reflected only for allowed origins; a browser on any other site cannot read or write the room.
// curl ignores CORS — that is what the key is for. Override the list with an ALLOWED_ORIGINS var
// (comma-separated) if the site ever moves to a custom domain.
const DEFAULT_ORIGINS = ['https://ghalebd.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];

function allowedOrigins(env) {
  const v = env && env.ALLOWED_ORIGINS;
  return v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_ORIGINS;
}
function cors(req, env) {
  const list = allowedOrigins(env);
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': list.includes(o) ? o : list[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Room-Key',
    'Access-Control-Max-Age': '86400',
  };
}
// constant-time compare: a plain === leaks the key length and matching prefix through timing
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export default {
  async fetch(req, env) {
    const C = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { headers: C });
    const url = new URL(req.url);
    const room = (url.searchParams.get('room') || 'default').slice(0, 64);
    const key = 'snap:' + room;

    if (req.method === 'POST') {
      if (env.ROOM_KEY) {
        const origin = req.headers.get('Origin');
        if (origin && !allowedOrigins(env).includes(origin)) return new Response('forbidden origin', { status: 403, headers: C });
        const k = req.headers.get('X-Room-Key') || url.searchParams.get('k') || '';
        if (!safeEq(k, env.ROOM_KEY)) return new Response('room key required', { status: 401, headers: C });
      }
      const body = await req.text();
      if (body && body.length < 2_000_000) { try { await env.SYNC_KV.put(key, body); } catch (e) {} }
      return new Response('ok', { headers: C });
    }
    if (req.method === 'GET') {
      let snap = '';
      try { snap = (await env.SYNC_KV.get(key)) || ''; } catch (e) {}
      return new Response(snap, { headers: { ...C, 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    return new Response('sync up', { headers: C });
  },
};
