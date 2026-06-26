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
  // A control that ALREADY has saved work on this browser is the authoritative source of truth (it must
  // never be reset by the cloud). A FRESH control (nothing saved on this browser yet) instead ADOPTS the
  // room's current state once on connect — so opening the console on a new browser/device shows the live
  // broadcast style instead of a blank default — and only then becomes authoritative. The presenter
  // always mirrors. Any local edit immediately promotes a control to authoritative.
  let authoritative = IS_SENDER && !!localStorage.getItem(KEY);
  let ws = null, applyingRemote = false, retryT = null, adoptT = null;
  const startT = Date.now();
  const myTs = () => parseInt(localStorage.getItem(TSKEY) || '0', 10);

  function connect() {
    try { ws = new WebSocket(ROOM_WS); } catch (e) { retry(); return; }
    ws.onopen = () => {
      if (IS_SENDER && authoritative) send();
      else {
        // ANY window that isn't already the source of truth (a presenter, or a fresh control) asks the
        // room for the current state on connect — the cloud is a relay, not a store, so a late joiner
        // gets nothing until it requests it. A fresh control then ADOPTS the reply; a presenter mirrors it.
        try { ws.send(JSON.stringify({ type: 'request' })); } catch (e) {}
        if (IS_SENDER) { clearTimeout(adoptT); adoptT = setTimeout(() => { if (!authoritative) { authoritative = true; send(); } }, 3500); }   // empty room → promote + publish
      }
      badge('live');
    };
    ws.onmessage = ev => {
      let j; try { j = JSON.parse(ev.data); } catch (e) { return; }
      if (!j) return;
      if (j.type === 'request') { if (IS_SENDER && authoritative) send(); return; }   // a new window asked for the state — the source-of-truth control replies
      if (IS_SENDER && authoritative) return;   // the source-of-truth control is never overwritten by the cloud
      try {
        if (j.type !== 'snapshot' || typeof j.data !== 'string') return;
        if (!(j.ts > myTs())) return;                       // older or same → ignore (protects local work)
        if (j.data === localStorage.getItem(KEY)) { localStorage.setItem(TSKEY, String(j.ts)); if (IS_SENDER) authoritative = true; return; }
        applyingRemote = true;
        localStorage.setItem(KEY, j.data);
        localStorage.setItem(TSKEY, String(j.ts));
        if (IS_SENDER) {
          // fresh control adopting the room state: apply it straight into the Store (the control's own
          // storage-event listener is intentionally inert), then lock in as the source of truth.
          try { if (window.Store && Store.importState) Store.importState(JSON.parse(j.data)); } catch (e) {}
          authoritative = true; clearTimeout(adoptT);
        } else {
          window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: j.data }));
        }
        applyingRemote = false;
      } catch (e) { applyingRemote = false; }
    };
    ws.onclose = () => { badge('wait'); retry(); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  function retry() { clearTimeout(retryT); retryT = setTimeout(connect, 2500); }

  function send() {
    if (!ws || ws.readyState !== 1 || applyingRemote || (IS_SENDER && !authoritative)) return;
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
    // a genuine operator edit (after the initial load settles) takes control of the room; early init
    // emits in the first moment don't, so a fresh control can still adopt the live state first.
    if (Date.now() - startT > 1500) authoritative = true;
    // Claim a fresh timestamp SYNCHRONOUSLY on every local edit. Without this, TSKEY stayed
    // stale until the debounced send() ran 300ms later — leaving a window where an older cloud
    // snapshot satisfied `j.ts > myTs()` and overwrote freshly-added models/overlays/drawings.
    localStorage.setItem(TSKEY, String(Date.now()));
    clearTimeout(t); t = setTimeout(send, 300);
  });

  function badge(st) {
    let el = document.getElementById('syncdot');
    if (!el) { el = document.createElement('div'); el.id = 'syncdot'; el.className = 'syncdot'; el.title = 'Global sync'; }
    // Dock the status dot as the LAST item of the vertical tool bar (re-asserted each time so it
    // always sits at the very bottom, never above the buttons); fall back to a fixed bottom-left
    // pip only while the bar doesn't exist yet.
    const bar = document.querySelector('.qtools');
    if (bar) { bar.appendChild(el); el.classList.remove('syncdot--float'); }
    else if (!el.parentNode) { el.classList.add('syncdot--float'); document.body.appendChild(el); }
    el.classList.toggle('syncdot--live', st === 'live');
    el.classList.toggle('syncdot--wait', st !== 'live');
  }
  connect();
})();
