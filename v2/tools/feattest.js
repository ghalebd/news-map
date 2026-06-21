// Functional test for the new features: motion easing, follow-target camera, marker→lower-third.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = []; const rec = (n, ok, info) => { R.push({ ok: !!ok }); console.log((ok ? '✓' : '✗') + ' ' + n + (info && !ok ? '   << ' + info : '')); };

(async () => {
  const b = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 840 }); p.on('dialog', d => d.accept().catch(() => {}));
  const er = []; p.on('pageerror', e => er.push('' + e)); p.on('console', m => { if (m.type() === 'error' && !/CORS|ERR_|fetch|airplanes|opensky|aisstream|maptiler|tile|Failed to load/i.test(m.text())) er.push('CE ' + m.text()); });
  await p.goto('http://localhost:8000/v2/control.html?nosync', { waitUntil: 'domcontentloaded' }); await sleep(1200);
  await p.evaluate(() => { try { localStorage.clear(); indexedDB.deleteDatabase('newsmap.assets3d'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(2600);
  await p.evaluate(() => { Store.setMode('build'); if (!Store.scenes().length) Store.addScene({ lat: 31, lng: 47, zoom: 6 }); Store.clearElements(); });

  // ===== A) EASING (via timeline seek — deterministic) =====
  const ease = await p.evaluate(async () => {
    const S2 = ms => new Promise(r => setTimeout(r, ms));
    Store.setTimeline({ dur: 4, cam: [{ t: 0, lat: 0, lng: 0, zoom: 5 }, { t: 4, lat: 40, lng: 0, zoom: 5 }], models: {}, head: 0, playing: false });
    Store.setEasing('linear'); Timeline.seek(0); await S2(80); Timeline.seek(1); await S2(160); const lin = GameMap.map.getCenter().lat;
    Store.setEasing('inout'); Timeline.seek(0); await S2(80); Timeline.seek(1); await S2(160); const sm = GameMap.map.getCenter().lat;
    Store.setTimeline({ cam: [], models: {} }); Store.setEasing('inout');
    return { lin: +lin.toFixed(2), sm: +sm.toFixed(2) };
  });
  rec('easing · config toggles linear/inout', true);
  rec('easing · inout slower at 25% than linear (ease-in)', ease.lin > 8 && ease.sm < 5 && ease.sm < ease.lin - 3, JSON.stringify(ease));

  // ===== B) FOLLOW-TARGET CAMERA =====
  const follow = await p.evaluate(async () => {
    const it = (window.MODELS3D_CATALOG || [])[0];
    Store.addModel3d({ src: 'assets3d/' + it.file, name: 'F', lat: 10, lng: 10, scale: 3, mode: '2d', on: true });
    const id = Store.models3d().slice(-1)[0].id;
    GameMap.map.setView([0, 0], 5, { animate: false });
    Follow.set('model', id);
    const active = Follow.active();
    await new Promise(r => setTimeout(r, 1400));
    const c1 = GameMap.map.getCenter();              // should have eased toward [10,10]
    Store.updateModel3d(id, { lat: 25, lng: 30 });    // move the target
    await new Promise(r => setTimeout(r, 1800));
    const c2 = GameMap.map.getCenter();              // should now chase toward [25,30]
    Follow.stop();
    return { active, c1: { lat: +c1.lat.toFixed(2), lng: +c1.lng.toFixed(2) }, c2: { lat: +c2.lat.toFixed(2), lng: +c2.lng.toFixed(2) }, stopped: !Follow.active() };
  });
  rec('follow · activates on a model', follow.active === true);
  rec('follow · camera moves toward target', follow.c1.lat > 1 && follow.c1.lng > 1, JSON.stringify(follow.c1));
  rec('follow · camera chases the target when it moves', Math.abs(follow.c2.lat - 25) < Math.abs(follow.c1.lat - 25), JSON.stringify(follow));
  rec('follow · stop releases the camera', follow.stopped === true);

  // ===== C) MARKER → LOWER THIRD (real context-bar button) =====
  const lt = await p.evaluate(async () => {
    Store.clearElements();
    Store.addElement({ type: 'marker', ll: [31, 47], color: '#fff', label: 'BREAKING' });
    const el = Store.activeScene().elements.slice(-1)[0];
    Draw.setTool('select');
    const lyr = Object.values(GameMap.map._layers).find(l => l && l.__id === el.id);
    if (lyr && lyr.fire) lyr.fire('mousedown', { latlng: L.latLng(31, 47), originalEvent: { stopPropagation() {}, preventDefault() {} } });
    await new Promise(r => setTimeout(r, 120));
    const btn = [...document.querySelectorAll('.ctxbar__btn')].find(x => /Lower third/.test(x.title));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 60));
    const sc = Store.activeScene();
    return { hasBtn: !!btn, title: sc.lowerThird && sc.lowerThird.title };
  });
  rec('marker→LT · context button exists on a marker', lt.hasBtn);
  rec('marker→LT · sets the scene lower-third from the label', lt.title === 'BREAKING', JSON.stringify(lt));

  rec('no page errors', er.length === 0, er.slice(0, 3).join(' | '));
  console.log('\n=============================================');
  let pass = 0; R.forEach(r => { if (r.ok) pass++; });
  console.log('FEATURE TOTAL ' + R.length + ' · PASS ' + pass + ' · FAIL ' + (R.length - pass));
  await b.close();
})();
