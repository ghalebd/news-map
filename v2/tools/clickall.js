/* clickall.js — the anti-refactor-regression harness.
   A bad module split BOOTS PERFECTLY and only throws when the operator clicks the one control whose handler
   referenced a function that no longer resolves across the new file boundary. Boot success proves nothing.
   So: open every settings section and CLICK EVERY CONTROL, attributing any error to the exact control.

   SAFETY: ?nosync (never the live broadcast room). Dialogs are DISMISSED, not accepted, so destructive
   confirmations (reset settings, clear screen) never actually fire. Genuinely destructive or navigating
   controls are skipped by label. */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = process.env.NM_BASE || 'http://localhost:8000/v2';   // NM_BASE lets this run against a worktree copy on another port (baseline comparisons)

const SKIP = /reset|clear|delete|remove|erase|logout|sign out|choose image|choose glb|upload|save project|load project|export|pdf|png|fullscreen/i;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--window-size=1600,900'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1600, height: 900 });

  let bucket = [];
  p.on('pageerror', e => bucket.push('PAGEERROR ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/AbortError|abort|Failed to load resource|ERR_|maptiler|airplanes|aisstream|404/i.test(t)) return;
    bucket.push('CONSOLE ' + t);
  });
  p.on('dialog', d => d.dismiss().catch(() => {}));   // never CONFIRM anything destructive

  await p.goto(`${BASE}/control.html?nosync`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.Store && window.GameMap, { timeout: 30000 });
  await sleep(2600);

  // a scene + a model so the model/timeline tabs have real content to build against
  await p.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    if (!Store.scenes().length) { const s = Store.addScene({ lat: 29.5, lng: 45, zoom: 6 }); Store.setActive(s.id); }
    Store.addElement({ type: 'marker', ll: [29.5, 45], color: '#36ff9e', label: 'M' });
    const it = (window.MODELS3D_CATALOG || [])[0];
    if (it && Store.addModel3d) Store.addModel3d({ src: 'assets3d/' + it.file, name: 'CLICKALL', lat: 29.5, lng: 45, scale: 3, mode: '2d', on: true });
  });
  await sleep(900);

  const failures = [];
  let clicked = 0;
  const skipReasons = { byName: 0, noSize: 0, disabled: 0, gone: 0 };

  // Expand every collapsible settings section. Sections are re-created by renderTab() after almost every
  // click, and a collapsed body gives its children a zero-size rect, so this has to be re-run continually
  // or the sweep silently skips the vast majority of the console (measured: 26 of 568 without it).
  const expandAll = () => p.evaluate(() => {
    document.querySelectorAll('.cfg-sec').forEach(s => { if (!s.classList.contains('open')) { const h = s.querySelector('.cfg-sec__hd'); if (h) h.click(); } });
  });

  async function sweep(label, openFn, selector) {
    if (openFn) { await p.evaluate(openFn); await sleep(700); }
    await expandAll(); await sleep(500);

    const n = await p.evaluate(sel => document.querySelectorAll(sel).length, selector);
    for (let i = 0; i < n; i++) {
      if (i % 25 === 0) { await expandAll(); await sleep(120); }   // renderTab() collapses them again as it rebuilds
      bucket = [];
      const info = await p.evaluate((sel, idx, skipSrc) => {
        const skip = new RegExp(skipSrc, 'i');
        const el = document.querySelectorAll(sel)[idx];
        if (!el) return { why: 'gone' };
        const name = (el.title || el.textContent || el.getAttribute('aria-label') || el.className || el.tagName).trim().slice(0, 60);
        if (el.type === 'file' || el.disabled) return { name, why: 'disabled' };
        if (skip.test(name)) return { name, why: 'byName' };
        // NO visibility check on purpose: the point of this harness is to EXECUTE every handler, and
        // el.click() dispatches regardless of whether the element is on screen. Requiring a non-zero rect
        // skipped 1041 of 1067 controls (the drawer sits off-canvas until opened) and tested almost nothing.
        try { el.click(); } catch (e) { return { name, threw: String(e) }; }
        return { name, clicked: true };
      }, selector, i, SKIP.source);
      if (info && info.why) { skipReasons[info.why]++; continue; }
      if (!info) continue;
      clicked++;
      await sleep(60);
      if (info.threw) failures.push(`${label} :: "${info.name}" -> click threw ${info.threw}`);
      bucket.forEach(e => failures.push(`${label} :: "${info.name}" -> ${e.slice(0, 180)}`));
      // a popup/flyout opened by one control can swallow the next; close transient layers
      await p.evaluate(() => { document.querySelectorAll('.lbar-pop:not([hidden]), .geo-pop:not([hidden]), .qa:not([hidden])').forEach(x => x.hidden = true); });
    }
  }

  // 1) the whole operator chrome (tool bar, zoom cluster, deck, mode switch)
  await sweep('chrome', null, 'body > button, .qtools button, .zoomctl button, .modesw button, .deck button, .nownext button');

  // 2) the settings console — the refactor's blast radius
  await sweep('settings', () => { const t = document.querySelector('.cfg-toggle'); if (t) t.click(); },
    '.cfg-drawer button, .cfg-drawer select, .cfg-drawer .cfg-tool, .cfg-drawer .cfg-chip2, .cfg-drawer .cfg-seg__b');

  // 3) same again in 3D, where a second set of code paths runs
  bucket = [];
  await p.evaluate(() => { try { window.Map3D && Map3D.enter(); } catch (e) {} });
  await sleep(4000);
  await sweep('settings/3D', null, '.cfg-drawer button, .cfg-drawer select, .cfg-drawer .cfg-seg__b');
  await p.evaluate(() => { try { Map3D.exit(); } catch (e) {} });
  await sleep(1200);

  // still alive afterwards?
  const alive = await p.evaluate(() => {
    try {
      const c = GameMap.map.getCenter();
      return !!document.getElementById('map') && isFinite(c.lat) && isFinite(c.lng) && !!Store.activeScene();
    } catch (e) { return 'threw: ' + e.message; }
  });

  await browser.close();

  console.log('\n---------------------------------------------');
  console.log(`CLICKALL  controls clicked ${clicked} · failures ${failures.length}`);
  console.log('skipped: ' + JSON.stringify(skipReasons));
  console.log('app still healthy afterwards: ' + alive);
  if (failures.length) {
    const seen = new Set();
    failures.filter(f => !seen.has(f) && seen.add(f)).slice(0, 40).forEach(f => console.log('  ✗ ' + f));
  }
  console.log(failures.length === 0 && alive === true ? 'CLICKALL: PASS' : 'CLICKALL: FAIL');
})();
