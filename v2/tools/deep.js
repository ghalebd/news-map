// Deep integration pass: (1) real two-window cloud sync in an ISOLATED room (separate storage),
// (2) 3D enter/exit memory-leak cycling, (3) save/load + snapshot round-trips.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = []; const rec = (n, ok, info) => { R.push({ n, ok: !!ok, info: info || '' }); console.log((ok ? '✓' : '✗') + ' ' + n + (info && !ok ? '   << ' + info : '')); };
const ROOM = 'autotest-deep-7x'; // isolated throwaway room — never the live aljazeera-main

async function freshPage(b, url) {
  let ctx = b; try { ctx = await (b.createBrowserContext ? b.createBrowserContext() : b.createIncognitoBrowserContext()); } catch (e) { ctx = b; }
  const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 840 }); p.on('dialog', d => d.accept().catch(() => {}));
  await p.goto(url, { waitUntil: 'domcontentloaded' }); await sleep(2600);
  return { p, ctx, isolated: ctx !== b };
}

(async () => {
  const b = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });

  // ===== 1) TWO-WINDOW CLOUD SYNC (isolated room) =====
  console.log('\n--- 1) two-window cloud sync (room=' + ROOM + ') ---');
  const A = await freshPage(b, 'http://localhost:8000/v2/control.html?room=' + ROOM);
  const B = await freshPage(b, 'http://localhost:8000/v2/index.html?room=' + ROOM);
  console.log('isolated storage:', A.isolated && B.isolated);
  await A.p.evaluate(() => { if (!Store.scenes().length) Store.addScene({ lat: 31, lng: 47, zoom: 6 }); Store.clearElements(); if (Store.clearModels3d) Store.clearModels3d(); (Store.overlays() || []).slice().forEach(o => Store.removeOverlay(o.id)); });
  await sleep(1500);
  // control adds content
  await A.p.evaluate(() => {
    Store.addElement({ type: 'marker', ll: [31, 47], color: '#36ff9e' });
    Store.addOverlay({ name: 'SYNCOV', url: 'data:image/png;base64,iVBORw0KGgo=', bounds: [[28, 44], [34, 50]] });
    const it = (window.MODELS3D_CATALOG || [])[0]; if (it) Store.addModel3d({ src: 'assets3d/' + it.file, name: 'SYNCM', lat: 31, lng: 47, scale: 3, mode: '2d', on: true });
  });
  await sleep(3000);
  const bMirror = await B.p.evaluate(() => ({ el: Store.activeScene() ? Store.activeScene().elements.length : 0, ov: Store.overlays().length, m: Store.models3d().length, hasSyncOv: Store.overlays().some(o => o.name === 'SYNCOV') }));
  rec('sync · presenter mirrors control edits', bMirror.el >= 1 && bMirror.ov >= 1 && bMirror.m >= 1 && bMirror.hasSyncOv, JSON.stringify(bMirror));
  // CRITICAL regression: control's edits must SURVIVE (not be wiped back by the mirror)
  const aSurvive = await A.p.evaluate(() => ({ el: Store.activeScene().elements.length, ov: Store.overlays().length, m: Store.models3d().length }));
  rec('sync · control edits survive (no wipe-back)', aSurvive.el >= 1 && aSurvive.ov >= 1 && aSurvive.m >= 1, JSON.stringify(aSurvive));
  // control clears → presenter clears
  await A.p.evaluate(() => { Store.clearElements(); if (Store.clearModels3d) Store.clearModels3d(); (Store.overlays() || []).slice().forEach(o => Store.removeOverlay(o.id)); });
  await sleep(3000);
  const bClear = await B.p.evaluate(() => ({ el: Store.activeScene().elements.length, ov: Store.overlays().length, m: Store.models3d().length }));
  rec('sync · presenter reflects clear', bClear.el === 0 && bClear.ov === 0 && bClear.m === 0, JSON.stringify(bClear));
  try { if (A.isolated) await A.ctx.close(); else await A.p.close(); if (B.isolated) await B.ctx.close(); else await B.p.close(); } catch (e) {}

  // ===== 2) 3D ENTER/EXIT MEMORY-LEAK CYCLING =====
  console.log('\n--- 2) 3D enter/exit leak (x6) ---');
  const C = await freshPage(b, 'http://localhost:8000/v2/control.html?nosync');
  await C.p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await C.p.reload({ waitUntil: 'domcontentloaded' }); await sleep(2600);
  await C.p.evaluate(() => { if (!Store.scenes().length) Store.addScene({ lat: 31, lng: 47, zoom: 6 }); const it = (window.MODELS3D_CATALOG || [])[0]; if (it) Store.addModel3d({ src: 'assets3d/' + it.file, name: 'M', lat: 31, lng: 47, scale: 3, mode: 'both', on: true }); });
  await sleep(800);
  const cdp = await C.p.target().createCDPSession();
  const heap = async () => { try { await cdp.send('HeapProfiler.collectGarbage'); } catch (e) {} const m = await C.p.metrics(); return Math.round(m.JSHeapUsedSize / 1048576); };
  await C.p.evaluate(() => Map3D.enter()); await sleep(3500); await C.p.evaluate(() => Map3D.exit()); await sleep(1200);
  const h0 = await heap();
  for (let i = 0; i < 6; i++) { await C.p.evaluate(() => Map3D.enter()); await sleep(2500); await C.p.evaluate(() => Map3D.exit()); await sleep(1000); }
  const h1 = await heap();
  const errs = await C.p.evaluate(() => 0);
  rec('3D leak · heap stable after 6 enter/exit cycles', (h1 - h0) < 40, 'heap ' + h0 + 'MB -> ' + h1 + 'MB (Δ' + (h1 - h0) + ')');
  const aliveAfter = await C.p.evaluate(() => ({ mapAlive: !!(GameMap && GameMap.map), on: !!(window.Map3D && Map3D.on) }));
  rec('3D leak · map healthy after cycling', aliveAfter.mapAlive && !aliveAfter.on, JSON.stringify(aliveAfter));

  // ===== 3) SAVE / LOAD + SNAPSHOT ROUND-TRIP =====
  console.log('\n--- 3) save/load + snapshot ---');
  await C.p.evaluate(() => { Store.clearElements(); if (Store.clearModels3d) Store.clearModels3d(); (Store.overlays() || []).slice().forEach(o => Store.removeOverlay(o.id)); });
  const sl = await C.p.evaluate(async () => {
    Store.addElement({ type: 'marker', ll: [31, 47], color: '#fff' });
    Store.addElement({ type: 'arrow', a: [30, 46], b: [32, 49], color: '#f00' });
    Store.addOverlay({ name: 'PROJ', url: 'data:,', bounds: [[28, 44], [34, 50]] });
    const it = (window.MODELS3D_CATALOG || [])[0]; if (it) Store.addModel3d({ src: 'assets3d/' + it.file, name: 'PM', lat: 31, lng: 47, scale: 3, mode: '2d', on: true });
    Store.renameScene(Store.scenes()[0].id, 'SavedScene');
    const saved = JSON.parse(JSON.stringify(Store.exportState()));
    const before = { el: Store.activeScene().elements.length, ov: Store.overlays().length, m: Store.models3d().length, title: Store.scenes()[0].title };
    // wipe everything
    Store.resetConfig(); Store.clearElements(); if (Store.clearModels3d) Store.clearModels3d();
    const wiped = { el: Store.activeScene().elements.length, ov: Store.overlays().length, m: Store.models3d().length };
    // load back
    Store.importState(saved);
    const after = { el: Store.activeScene().elements.length, ov: Store.overlays().length, m: Store.models3d().length, title: Store.scenes()[0].title };
    return { before, wiped, after };
  });
  rec('save/load · export captured state', sl.before.el >= 2 && sl.before.ov >= 1 && sl.before.m >= 1);
  rec('save/load · reset wiped state', sl.wiped.el === 0 && sl.wiped.ov === 0 && sl.wiped.m === 0, JSON.stringify(sl.wiped));
  rec('save/load · import restored everything', sl.after.el === sl.before.el && sl.after.ov === sl.before.ov && sl.after.m === sl.before.m && sl.after.title === 'SavedScene', JSON.stringify(sl.after));
  const snap = await C.p.evaluate(async () => {
    if (!(window.UI && UI.saveSnapshot)) return { skip: true };
    const n0 = (UI.snaps() || []).length; UI.saveSnapshot('T1');
    Store.clearElements();
    const cleared = Store.activeScene().elements.length;
    const s = UI.snaps()[0]; UI.restoreSnapshot(s.id);
    return { added: (UI.snaps() || []).length === n0 + 1, cleared, restored: Store.activeScene().elements.length };
  });
  rec('snapshot · save + restore round-trip', snap.skip || (snap.added && snap.cleared === 0 && snap.restored >= 1), JSON.stringify(snap));

  try { if (C.isolated) await C.ctx.close(); else await C.p.close(); } catch (e) {}
  console.log('\n=============================================');
  let pass = 0; R.forEach(r => { if (r.ok) pass++; });
  console.log('DEEP TOTAL ' + R.length + ' · PASS ' + pass + ' · FAIL ' + (R.length - pass));
  await b.close();
})();
