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
  // Room is overridable via ?room=NAME — lets you run an isolated broadcast (and lets automated
  // tests use a throwaway room so they never write into the live 'aljazeera-main' state).
  const ROOM = (new URLSearchParams(location.search).get('room') || 'aljazeera-main').slice(0, 64);
  const ROOM_WS = 'wss://newsmap-sync.dida-newsmap.workers.dev/?room=' + encodeURIComponent(ROOM);
  // The control console is the single source of truth; the presenter window is a pure mirror
  // (receive-only). A mirror must NEVER push its possibly-stale state back, or it can clobber
  // the operator's fresh edits.
  const IS_SENDER = window.APP_ROLE === 'control';
  let ws = null, applyingRemote = false, retryT = null;
  const myTs = () => parseInt(localStorage.getItem(TSKEY) || '0', 10);

  function connect() {
    try { ws = new WebSocket(ROOM_WS); } catch (e) { retry(); return; }
    ws.onopen = () => { if (IS_SENDER) send(); badge('live'); };
    ws.onmessage = ev => {
      // The control console is the SINGLE SOURCE OF TRUTH and must never be overwritten by the
      // cloud — otherwise a stale/default snapshot (e.g. left by a fresh window) keeps resetting the
      // operator's carefully-set style. Only the presenter (a pure mirror) applies incoming state.
      if (IS_SENDER) return;
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
    // Only the control reaches here (the presenter never sends). As the source of truth it asserts
    // a FRESH timestamp so it always wins last-writer-wins on the presenter and corrects any stale
    // cloud snapshot — the control can no longer be reset, because it ignores incoming (see onmessage).
    const ts = Date.now();
    localStorage.setItem(TSKEY, String(ts));
    try { ws.send(JSON.stringify({ type: 'snapshot', ts, data })); } catch (e) {}
  }

  let t = null;
  if (IS_SENDER && window.Store && Store.on) Store.on((st, evt) => {
    if (applyingRemote) return;
    if (evt === 'layout') return;   // panel positions are per-window local — never sync them
    // Claim a fresh timestamp SYNCHRONOUSLY on every local edit. Without this, TSKEY stayed
    // stale until the debounced send() ran 300ms later — leaving a window where an older cloud
    // snapshot satisfied `j.ts > myTs()` and overwrote freshly-added models/overlays/drawings.
    localStorage.setItem(TSKEY, String(Date.now()));
    clearTimeout(t); t = setTimeout(send, 300);
  });

  function badge(st) {
    let el = document.getElementById('syncdot');
    if (!el) { el = document.createElement('div'); el.id = 'syncdot'; el.className = 'syncdot'; el.title = 'Global sync'; }
    // Dock the status dot at the bottom of the vertical tool bar; fall back to a fixed bottom-left
    // pip only while the bar doesn't exist yet.
    const bar = document.querySelector('.qtools');
    if (bar) { if (el.parentNode !== bar) bar.appendChild(el); el.classList.remove('syncdot--float'); }
    else if (!el.parentNode) { el.classList.add('syncdot--float'); document.body.appendChild(el); }
    el.style.background = st === 'live' ? '#34d399' : '#f59e0b';
  }
  connect();
})();
