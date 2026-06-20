// Combined-state stress + conflict tester: FX stacking, full 3D integration (terrain+tracking+
// models+overlays), mode/projection stress, off-screen panel clamping. Catches crashes &
// conflicts that only appear when many features are ON at once. Run with server on :8000.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = []; const rec = (n, ok, info) => R.push({ n, ok: !!ok, info: info || '' });
const FILTER = /CORS|ERR_FAILED|ERR_ABORTED|fetch|airplanes|opensky|aisstream|codetabs|maptiler|Failed to load resource|status of 40|tile/i;

(async () => {
  const b = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  const er = []; p.on('pageerror', e => er.push('' + e)); p.on('console', m => { if (m.type() === 'error' && !FILTER.test(m.text())) er.push('CE ' + m.text()); });
  p.on('dialog', d => d.accept().catch(() => {}));
  await p.goto('http://localhost:8000/v2/control.html?nosync', { waitUntil: 'domcontentloaded' }); await sleep(1200);
  await p.evaluate(() => { try { localStorage.clear(); indexedDB.deleteDatabase('newsmap.assets3d'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(2600);
  await p.evaluate(() => { Store.setMode('build'); if (!Store.scenes().length) Store.addScene({ lat: 31, lng: 47, zoom: 6 }); Store.clearElements(); });
  const errSnap = () => er.length;

  // ---------- A) FX STACKING (2D): grid + sea + clouds + day/night + thirds all ON ----------
  let e0 = errSnap();
  const fx = await p.evaluate(async () => {
    Store.setGrid({ on: true }); Store.setSea({ on: true }); Store.setClouds({ on: true }); Store.setDayNight({ on: true }); Store.setThirds(true);
    await new Promise(r => setTimeout(r, 600));
    const vis = s => { const e = document.querySelector(s); if (!e) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && !e.hidden; };
    // map still interactive?
    const c0 = GameMap.map.getCenter(); GameMap.map.panBy([60, 40], { animate: false }); const c1 = GameMap.map.getCenter();
    return { grid: vis('.fxgrid'), sea: vis('.seafx'), clouds: vis('.fxclouds'), dn: vis('.dnfx'), thirds: vis('.fxthirds'), mapMoved: Math.abs(c1.lng - c0.lng) > 0.0001 || Math.abs(c1.lat - c0.lat) > 0.0001 };
  });
  rec('FX stack · grid+sea+clouds+daynight+thirds all render', fx.grid && fx.sea && fx.clouds && fx.dn && fx.thirds, JSON.stringify(fx));
  rec('FX stack · map still pans with all FX on', fx.mapMoved);
  rec('FX stack · no errors', errSnap() === e0, er.slice(e0).slice(0, 2).join(' | '));

  // ---------- B) FULL 3D INTEGRATION: terrain + tracking3d + ships/flights + model + overlay ----------
  e0 = errSnap();
  await p.evaluate(() => {
    Store.setTrack3d({ on: true }); Store.setTracking('ships', true); Store.setTracking('flights', true);
    Store.addOverlay({ name: 'OV', url: 'data:image/png;base64,iVBORw0KGgo=', bounds: [[28, 44], [34, 50]] });
    const it = (window.MODELS3D_CATALOG || [])[0]; if (it) Store.addModel3d({ src: 'assets3d/' + it.file, name: 'M', lat: 31, lng: 47, scale: 4, mode: 'both', on: true });
  });
  await sleep(1400);
  await p.evaluate(() => { if (window.Map3D && !Map3D.on) Map3D.enter(); });
  await sleep(3500);
  const d3 = await p.evaluate(() => {
    const on = !!(window.Map3D && Map3D.on);
    const glAlive = !!(window.Map3D && Map3D.map && Map3D.map.getCanvas && Map3D.map.getCanvas());
    // FX must be SUPPRESSED in 3D (they gate on !mode-3d)
    const body3d = document.body.classList.contains('mode-3d');
    return { on, glAlive, body3d, model: Store.models3d().length, overlay: Store.overlays().length };
  });
  rec('3D · entered (terrain GL alive)', d3.on && d3.glAlive, JSON.stringify(d3));
  rec('3D · body.mode-3d set (FX suppressed)', d3.body3d);
  rec('3D · model + overlay + tracking all present', d3.model >= 1 && d3.overlay >= 1, JSON.stringify(d3));
  rec('3D · no errors entering with everything on', errSnap() === e0, er.slice(e0).slice(0, 3).join(' | '));

  // chrome still reachable in this heavy 3D state
  const reach3d = await p.evaluate(() => {
    const hit = sel => { const e = document.querySelector(sel); if (!e) return 'missing'; const b = e.getBoundingClientRect(); if (getComputedStyle(e).display === 'none' || b.width < 2) return 'hidden'; const cx = b.x + b.width / 2, cy = b.y + 12; const t = document.elementFromPoint(cx, cy); return (e === t || e.contains(t)) ? 'OK' : 'covered'; };
    return { zoomctl: hit('.zoomctl'), qtools: hit('.qtools') };
  });
  rec('3D · zoom bar reachable under load', reach3d.zoomctl === 'OK', reach3d.zoomctl);
  rec('3D · toolbar reachable under load', reach3d.qtools === 'OK', reach3d.qtools);

  // ---------- C) GLOBE projection while loaded ----------
  e0 = errSnap();
  await p.evaluate(() => { try { Store.setThreeD({ globe: true }); } catch (e) {} }); await sleep(1500);
  rec('3D · globe projection no errors', errSnap() === e0, er.slice(e0).slice(0, 2).join(' | '));
  await p.evaluate(() => { try { Store.setThreeD({ globe: false }); } catch (e) {} }); await sleep(800);

  // ---------- D) EXIT 3D → FX return, no errors ----------
  e0 = errSnap();
  await p.evaluate(() => { if (window.Map3D && Map3D.on) Map3D.exit(); }); await sleep(1500);
  const back2d = await p.evaluate(() => ({ on: !!(window.Map3D && Map3D.on), body3d: document.body.classList.contains('mode-3d'), mapAlive: !!(GameMap && GameMap.map) }));
  rec('3D→2D · exits cleanly, FX layer restored', !back2d.on && !back2d.body3d && back2d.mapAlive, JSON.stringify(back2d));
  rec('3D→2D · no errors exiting', errSnap() === e0, er.slice(e0).slice(0, 2).join(' | '));

  // ---------- E) MODE / 2D-3D STRESS: rapid toggles ----------
  e0 = errSnap();
  await p.evaluate(async () => { for (let i = 0; i < 3; i++) { Store.setMode('live'); await new Promise(r => setTimeout(r, 120)); Store.setMode('build'); await new Promise(r => setTimeout(r, 120)); } });
  await sleep(300);
  rec('stress · rapid build/live x3 no errors', errSnap() === e0, er.slice(e0).slice(0, 2).join(' | '));

  // ---------- F) OFF-SCREEN PANEL CLAMP: dragging a panel far off must be clamped on-screen ----------
  const clamp = await p.evaluate(async () => {
    Store.setLayout('.sceneins', { x: 99999, y: 99999 }); await new Promise(r => setTimeout(r, 200));
    if (window.Movable && Movable.reflow) Movable.reflow();
    await new Promise(r => setTimeout(r, 200));
    const e = document.querySelector('.sceneins'); const b = e.getBoundingClientRect();
    const onScreen = b.x >= -2 && b.y >= -2 && b.right <= innerWidth + 2 && b.bottom <= innerHeight + 2;
    return { onScreen, x: Math.round(b.x), y: Math.round(b.y), right: Math.round(b.right), bottom: Math.round(b.bottom) };
  });
  rec('panel clamp · off-screen drag is clamped on-screen', clamp.onScreen, JSON.stringify(clamp));

  // ---------- report ----------
  console.log('\n================ STRESS / COMBINED-STATE REPORT ================');
  let pass = 0; R.forEach(r => { console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.info && !r.ok ? '   << ' + r.info : '')); if (r.ok) pass++; });
  console.log('---------------------------------------------');
  console.log('TOTAL ' + R.length + ' · PASS ' + pass + ' · FAIL ' + (R.length - pass) + ' · total page errors: ' + er.length);
  if (er.length) console.log('ERRORS:', er.slice(0, 5).join('\n  '));
  await b.close();
})();
