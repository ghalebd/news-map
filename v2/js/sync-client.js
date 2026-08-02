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
  // AUTOMATION WRITE-GUARD: a headless/automated browser must never publish into a room — a test
  // harness that forgets ?nosync would otherwise overwrite the operator's LIVE on-air config (this
  // has happened). Automated sessions may still READ/adopt, so tests still verify real rendering.
  // A test that genuinely needs to exercise publishing opts in explicitly with ?allowsync.
  const IS_ROBOT = !!(navigator.webdriver) && !/[?&]allowsync/.test(location.search);
  const IS_SENDER = window.APP_ROLE === 'control' && !IS_ROBOT;   // only the control writes; the presenter only reads
  if (IS_ROBOT) console.warn('[sync] automated session — publishing disabled (add ?allowsync to override)');
  let applyingRemote = false;
  const myTs = () => parseInt(localStorage.getItem(TSKEY) || '0', 10);

  // adopt a room snapshot if it is strictly NEWER than what this window last wrote/applied
  function adopt(j) {
    if (!j || j.type !== 'snapshot' || typeof j.data !== 'string') return false;
    if (!(j.ts > myTs())) return false;                                   // older/same → keep mine (protects fresh local work)
    if (j.data === localStorage.getItem(KEY)) { localStorage.setItem(TSKEY, String(j.ts)); return false; }
    // VALIDATE BEFORE PERSISTING. Previously the raw string was written to localStorage first and only
    // then parsed inside a silent try/catch — so a corrupt payload poisoned the operator's ONLY recovery
    // move (refresh), which then booted on defaults: blue map, no scenes, mid-show. Now a bad snapshot is
    // rejected outright and the window keeps the good state it already has.
    let parsed = null;
    try { parsed = JSON.parse(j.data); }
    catch (e) { console.error('[sync] rejected an unparseable room snapshot — keeping current state'); return false; }
    if (window.Store && Store.validateState) {
      const v = Store.validateState(parsed);
      if (!v.ok) { console.error('[sync] rejected a malformed room snapshot (' + v.reason + ') — keeping current state'); return false; }
    }
    applyingRemote = true;
    localStorage.setItem(KEY, j.data);
    localStorage.setItem(TSKEY, String(j.ts));
    if (IS_SENDER) { try { if (window.Store && Store.importState) Store.importState(parsed); } catch (e) { console.error('[sync] importState failed on an accepted snapshot', e); } }
    else window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: j.data }));
    applyingRemote = false;
    return true;
  }

  async function fetchRoom() {
    try { const r = await fetch(BASE, { cache: 'no-store' }); if (!r.ok) { badge('wait'); return null; } badge('live'); const t = await r.text(); return t ? JSON.parse(t) : null; }
    catch (e) { badge('wait'); return null; }
  }
  // Persistent, unmissable alarm on the OPERATOR console only — never on the presenter (which is on air).
  let pushFails = 0, alarmEl = null;
  function alarm(on, why) {
    if (!IS_SENDER) return;
    if (!on) { if (alarmEl) { alarmEl.remove(); alarmEl = null; } return; }
    if (alarmEl) return;
    alarmEl = document.createElement('div');
    alarmEl.className = 'sync-alarm';
    alarmEl.textContent = 'EDITS ARE NOT REACHING AIR — sync failing (' + why + ')';
    document.body.appendChild(alarmEl);
  }
  async function push(ts) {
    // PUBLISH THE LIVE STATE, not localStorage. persist() is debounced and localStorage is also the
    // landing pad for adopt(), so re-reading it here could publish a STALE (or just-adopted, foreign)
    // snapshot stamped with a FRESH timestamp — which the presenter then dutifully accepts as newest.
    // Measured: the control held 4723 bytes of edits while every push carried the older 4285-byte
    // state, so the operator's console showed the new work and air kept the old. exportState() returns
    // exactly the shape persist() saves, so the payload is identical in every other respect.
    let data = null;
    try { if (window.Store && Store.exportState) data = JSON.stringify(Store.exportState()); } catch (e) {}
    if (!data) data = localStorage.getItem(KEY);
    if (!data) return;
    ts = ts || Date.now(); localStorage.setItem(TSKEY, String(ts));
    // fetch only REJECTS on a network failure — a 429/500/403 resolves normally. Without the r.ok check
    // the dot stayed green while every edit was being refused, so the operator kept working and nothing
    // reached air. Cloudflare KV's free tier is 1000 writes/day and this pushes on every edit, so a
    // quota rejection mid-show is a realistic scenario, not a theoretical one.
    try {
      const r = await fetch(BASE, { method: 'POST', body: JSON.stringify({ type: 'snapshot', ts, data }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      pushFails = 0; badge('live'); alarm(false);
    } catch (e) {
      pushFails++; badge('wait');
      if (pushFails >= 3) alarm(true, (e && e.message) || 'network');   // a 9px dot is not enough when edits stop reaching air
    }
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
