/* ============================================================
   GLOBAL SYNC BRIDGE — control ↔ presenter across the internet.
   HTTP polling against a KV-backed worker (no WebSocket / Durable
   Object, which had hit the free-tier limit and taken sync down).
   The control console is the source of truth and POSTs its full
   snapshot on every edit; every other screen GET-polls and applies
   it if newer. A FRESH control (nothing saved on this browser yet)
   ADOPTS the room's live state once on first poll, so opening the
   link on a new browser/device shows the live style instead of the
   blue default. Add ?nosync to detach this window from the room.
   ============================================================ */
(() => {
  if (/[?&]nosync/.test(location.search)) return;
  const KEY = 'newsmap.v3', TSKEY = 'newsmap.v3.syncts', TOUCHED = 'newsmap.v3.touched';
  const ROOM = (new URLSearchParams(location.search).get('room') || 'aljazeera-main').slice(0, 64);
  const BASE = 'https://newsmap-sync.dida-newsmap.workers.dev/?room=' + encodeURIComponent(ROOM);
  const IS_SENDER = window.APP_ROLE === 'control';
  // A control is the authoritative source of truth ONLY if it's been used on this browser — i.e. the
  // operator has edited here (TOUCHED flag) OR the look is already customised. A FRESH control (default
  // style, never touched) is NOT authoritative: it adopts the live room state on first poll. NB: don't
  // use "localStorage KEY exists" — the Store auto-persists its default, which would wrongly look configured.
  let authoritative = IS_SENDER && (!!localStorage.getItem(TOUCHED) || (window.Store && !Store.isDefaultStyle()));
  let applyingRemote = false;
  const startT = Date.now();
  const myTs = () => parseInt(localStorage.getItem(TSKEY) || '0', 10);

  function applySnapshot(j) {
    if (!j || j.type !== 'snapshot' || typeof j.data !== 'string') return;
    if (IS_SENDER && authoritative) return;                    // source-of-truth control ignores incoming
    if (!(j.ts > myTs())) return;                              // older/same → keep local (protects fresh edits)
    if (j.data === localStorage.getItem(KEY)) { localStorage.setItem(TSKEY, String(j.ts)); if (IS_SENDER) authoritative = true; return; }
    applyingRemote = true;
    localStorage.setItem(KEY, j.data);
    localStorage.setItem(TSKEY, String(j.ts));
    if (IS_SENDER) {
      // fresh control adopting the live room state: apply straight into the Store (its own storage-event
      // listener is intentionally inert), then lock in as the source of truth.
      try { if (window.Store && Store.importState) Store.importState(JSON.parse(j.data)); } catch (e) {}
      authoritative = true;
    } else {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: j.data }));
    }
    applyingRemote = false;
  }

  async function poll() {
    if (document.hidden) return;   // backgrounded tab → skip (saves the room's request quota)
    try {
      const r = await fetch(BASE, { cache: 'no-store' });
      if (!r.ok) { badge('wait'); return; }
      badge('live');
      const txt = await r.text();
      if (txt) applySnapshot(JSON.parse(txt));
    } catch (e) { badge('wait'); }
  }

  async function push() {
    if (!authoritative || applyingRemote) return;
    const data = localStorage.getItem(KEY); if (!data) return;
    const ts = Date.now(); localStorage.setItem(TSKEY, String(ts));
    try { await fetch(BASE, { method: 'POST', body: JSON.stringify({ type: 'snapshot', ts, data }) }); badge('live'); } catch (e) { badge('wait'); }
  }

  // control: publish on every local edit (coalesced — keeps KV writes low); a genuine edit after the
  // initial load settles also promotes a fresh control to the source of truth.
  let pt = null;
  if (IS_SENDER && window.Store && Store.on) Store.on((st, evt) => {
    if (applyingRemote || evt === 'layout') return;   // layout is per-window local — never sync it
    if (Date.now() - startT > 1500) { authoritative = true; try { localStorage.setItem(TOUCHED, '1'); } catch (e) {} }   // a genuine edit → this browser is now configured (source of truth)
    localStorage.setItem(TSKEY, String(Date.now()));
    clearTimeout(pt); pt = setTimeout(push, 1500);
  });

  // an existing (authoritative) control publishes its state right away so the room is up to date;
  // a fresh control with an empty room promotes itself after a grace period so its edits still publish.
  if (IS_SENDER && authoritative) setTimeout(push, 600);
  else if (IS_SENDER) setTimeout(() => { if (!authoritative) { authoritative = true; push(); } }, 6000);

  poll();
  setInterval(poll, 3000);

  function badge(st) {
    let el = document.getElementById('syncdot');
    if (!el) { el = document.createElement('div'); el.id = 'syncdot'; el.className = 'syncdot'; el.title = 'Global sync'; }
    const bar = document.querySelector('.qtools');
    if (bar) { bar.appendChild(el); el.classList.remove('syncdot--float'); }
    else if (!el.parentNode) { el.classList.add('syncdot--float'); document.body.appendChild(el); }
    el.classList.toggle('syncdot--live', st === 'live');
    el.classList.toggle('syncdot--wait', st !== 'live');
  }
})();
