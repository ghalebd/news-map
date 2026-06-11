/* ============================================================
   GLOBAL SYNC BRIDGE — control ↔ presenter across the internet.
   Timestamped last-writer-wins: an incoming snapshot is applied
   ONLY if it is newer than what this window already has, so a
   stale cloud state can never overwrite fresh local work.
   Add ?nosync to the URL to detach this window from the room.
   ============================================================ */
(() => {
  if (/[?&]nosync/.test(location.search)) return;
  const KEY = 'newsmap.v3', TSKEY = 'newsmap.v3.syncts';
  const ROOM_WS = 'wss://newsmap-sync.dida-newsmap.workers.dev/?room=aljazeera-main';
  let ws = null, applyingRemote = false, retryT = null;
  const myTs = () => parseInt(localStorage.getItem(TSKEY) || '0', 10);

  function connect() {
    try { ws = new WebSocket(ROOM_WS); } catch (e) { retry(); return; }
    ws.onopen = () => { send(); badge('live'); };
    ws.onmessage = ev => {
      try {
        const j = JSON.parse(ev.data);
        if (!j || j.type !== 'snapshot' || typeof j.data !== 'string') return;
        if (!(j.ts > myTs())) return;                       // older or same → ignore (protects local work)
        if (j.data === localStorage.getItem(KEY)) { localStorage.setItem(TSKEY, String(j.ts)); return; }
        applyingRemote = true;
        localStorage.setItem(KEY, j.data);
        localStorage.setItem(TSKEY, String(j.ts));
        window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: j.data }));
        applyingRemote = false;
      } catch (e) { applyingRemote = false; }
    };
    ws.onclose = () => { badge('wait'); retry(); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  function retry() { clearTimeout(retryT); retryT = setTimeout(connect, 2500); }

  function send() {
    if (!ws || ws.readyState !== 1 || applyingRemote) return;
    const data = localStorage.getItem(KEY) || '';
    if (!data) return;
    const ts = Date.now();
    localStorage.setItem(TSKEY, String(ts));
    try { ws.send(JSON.stringify({ type: 'snapshot', ts, data })); } catch (e) {}
  }

  let t = null;
  if (window.Store && Store.on) Store.on(() => { if (applyingRemote) return; clearTimeout(t); t = setTimeout(send, 300); });

  function badge(st) {
    let el = document.getElementById('syncdot');
    if (!el) { el = document.createElement('div'); el.id = 'syncdot'; el.title = 'Global sync'; el.style.cssText = 'position:fixed;left:8px;bottom:8px;width:9px;height:9px;border-radius:50%;z-index:9999;box-shadow:0 0 6px rgba(0,0,0,.5);pointer-events:none;transition:background .3s'; document.body.appendChild(el); }
    el.style.background = st === 'live' ? '#34d399' : '#f59e0b';
  }
  connect();
})();
