/* ============================================================
   GLOBAL SYNC — last-edit-wins across browsers/devices, over a
   KV-backed worker (HTTP polling; no WebSocket / Durable Object,
   which had hit the free-tier limit and taken sync down).
   Every window polls the room; whichever window edited MOST
   RECENTLY wins everywhere (timestamps, so a stale window can
   never clobber fresh work). A window joining later adopts the
   live state, so opening the link on any new browser/device shows
   the current broadcast — not the blue default. The control posts
   on every edit; the presenter is read-only. ?nosync detaches.
   ============================================================ */
(() => {
  if (/[?&]nosync/.test(location.search)) return;
  const KEY = 'newsmap.v3', TSKEY = 'newsmap.v3.syncts';
  const ROOM = (new URLSearchParams(location.search).get('room') || 'aljazeera-main').slice(0, 64);
  const BASE = 'https://newsmap-sync.dida-newsmap.workers.dev/?room=' + encodeURIComponent(ROOM);
  const IS_SENDER = window.APP_ROLE === 'control';   // only the control writes; the presenter only reads
  let applyingRemote = false;
  const myTs = () => parseInt(localStorage.getItem(TSKEY) || '0', 10);

  // adopt a room snapshot if it is strictly NEWER than what this window last wrote/applied
  function adopt(j) {
    if (!j || j.type !== 'snapshot' || typeof j.data !== 'string') return false;
    if (!(j.ts > myTs())) return false;                                   // older/same → keep mine (protects fresh local work)
    if (j.data === localStorage.getItem(KEY)) { localStorage.setItem(TSKEY, String(j.ts)); return false; }
    applyingRemote = true;
    localStorage.setItem(KEY, j.data);
    localStorage.setItem(TSKEY, String(j.ts));
    if (IS_SENDER) { try { if (window.Store && Store.importState) Store.importState(JSON.parse(j.data)); } catch (e) {} }
    else window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: j.data }));
    applyingRemote = false;
    return true;
  }

  async function fetchRoom() {
    try { const r = await fetch(BASE, { cache: 'no-store' }); if (!r.ok) { badge('wait'); return null; } badge('live'); const t = await r.text(); return t ? JSON.parse(t) : null; }
    catch (e) { badge('wait'); return null; }
  }
  async function push(ts) {
    const data = localStorage.getItem(KEY); if (!data) return;
    ts = ts || Date.now(); localStorage.setItem(TSKEY, String(ts));
    try { await fetch(BASE, { method: 'POST', body: JSON.stringify({ type: 'snapshot', ts, data }) }); badge('live'); } catch (e) { badge('wait'); }
  }

  async function poll() { if (document.hidden) return; const j = await fetchRoom(); if (j) adopt(j); }

  // initial sync: adopt the room if it's newer; otherwise (control only) seed the room with our state so
  // other screens mirror it. A brand-new window has ts 0 → it always adopts the live room first.
  (async () => {
    const j = await fetchRoom();
    if (j && adopt(j)) return;
    if (IS_SENDER && localStorage.getItem(KEY)) push(myTs() || Date.now());
  })();

  // control publishes on every local edit with a fresh timestamp → that edit wins everywhere
  let pt = null;
  if (IS_SENDER && window.Store && Store.on) Store.on((st, evt) => {
    if (applyingRemote || evt === 'layout') return;   // layout is per-window local — never sync it
    localStorage.setItem(TSKEY, String(Date.now()));
    clearTimeout(pt); pt = setTimeout(() => push(), 1200);   // coalesce rapid edits → fewer KV writes
  });

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
