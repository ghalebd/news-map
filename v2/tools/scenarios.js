/* scenarios.js — REAL broadcast journeys + the conflict cases the other harnesses miss.
   Targets: camera arbitration (who wins when two owners move the camera), follow-release on
   manual input, 2D<->3D round-trip fidelity, hostile/corrupt state recovery, control->presenter
   mirroring. Run with the static server on :8000.

   SAFETY: every page uses ?nosync, EXCEPT the mirror scenario which uses ?allowsync with a
   throwaway room. The default room is the operator's LIVE broadcast — never touch it. */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:8000/v2';
const ROOM = 'autotest-scenarios-9k';   // isolated throwaway room — never the live aljazeera-main
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0; const fails = [];
const rec = (name, ok, detail) => {
  ok ? pass++ : (fail++, fails.push(name + (detail ? ' — ' + detail : '')));
  console.log((ok ? '✓ ' : '✗ ') + name + (ok || !detail ? '' : '   << ' + detail));
};

const pageErrors = [];
async function open(browser, url) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 860 });
  p.on('dialog', d => d.accept().catch(() => {}));
  p.on('pageerror', e => pageErrors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/AbortError|abort|Failed to load resource/i.test(m.text())) pageErrors.push('CE ' + m.text()); });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.Store && window.GameMap, { timeout: 30000 });
  await sleep(2200);
  return p;
}

// seed a deterministic working scene
const seed = p => p.evaluate(() => {
  Store.scenes().slice().forEach(s => Store.removeScene(s.id));
  const s = Store.addScene({ lat: 29.5, lng: 45, zoom: 6 });
  Store.setActive(s.id);
  return s.id;
});

/* Sample the camera centre over time. A single owner => the path length is close to the net
   displacement (a smooth glide). Two owners fighting => the camera keeps reversing, so the
   path length greatly exceeds the net displacement. That ratio is the tug-of-war signal. */
async function cameraTrack(p, ms = 2400, step = 100) {
  const samples = [];
  for (let t = 0; t < ms; t += step) {
    samples.push(await p.evaluate(() => {
      const use3d = !!(window.Map3D && Map3D.on && Map3D.map);
      const c = use3d ? Map3D.map.getCenter() : GameMap.map.getCenter();
      return { lat: c.lat, lng: c.lng };
    }));
    await sleep(step);
  }
  let path = 0;
  for (let i = 1; i < samples.length; i++) {
    path += Math.hypot(samples[i].lat - samples[i - 1].lat, samples[i].lng - samples[i - 1].lng);
  }
  const a = samples[0], z = samples[samples.length - 1];
  const net = Math.hypot(z.lat - a.lat, z.lng - a.lng);
  // reversals: how often the direction of travel flips (a fight oscillates)
  let flips = 0;
  for (let i = 2; i < samples.length; i++) {
    const d1 = samples[i - 1].lng - samples[i - 2].lng, d2 = samples[i].lng - samples[i - 1].lng;
    if (d1 * d2 < -1e-12) flips++;
  }
  return { path, net, flips, ratio: net > 1e-9 ? path / net : (path > 1e-6 ? Infinity : 1), end: z };
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--window-size=1440,860'] });

  /* ============ S1 · camera arbitration: follow vs the other camera owners ============ */
  console.log('\n--- S1 · camera arbitration ---');
  {
    const p = await open(browser, `${BASE}/control.html?nosync`);
    await seed(p);
    // a model on a route gives Follow a real moving target
    await p.evaluate(() => {
      if (Store.clearModels3d) Store.clearModels3d();
      const it = (window.MODELS3D_CATALOG || [])[0];
      const m = Store.addModel3d({ src: it ? 'assets3d/' + it.file : 'x.glb', name: 'TGT',
        lat: 29.5, lng: 45, scale: 4, mode: '2d', on: true });
      Store.updateModel3d(m.id, { route: [[29.5, 45], [31.5, 49]], routeDur: 40 });
      if (window.ModelsAnim && ModelsAnim.play) ModelsAnim.play(m.id);
      window.__mid = m.id;
    });
    await sleep(600);

    // baseline: follow alone should be smooth (few reversals)
    await p.evaluate(() => window.Follow && Follow.set('model', window.__mid, { zoom: 7 }));
    await sleep(700);
    const solo = await cameraTrack(p);
    rec('S1 · follow alone tracks smoothly', solo.flips <= 4, `flips=${solo.flips} ratio=${solo.ratio.toFixed(1)}`);

    // follow + timeline playback at once — one must yield, not fight
    await p.evaluate(() => {
      Store.setTimeline({ dur: 12, cam: [
        { t: 0, view: { lat: 20, lng: 30, zoom: 5 } },
        { t: 12, view: { lat: 24, lng: 34, zoom: 5 } } ], playing: true });
    });
    await sleep(700);
    const vsTl = await cameraTrack(p);
    rec('S1 · follow + timeline do not fight', vsTl.flips <= 5, `flips=${vsTl.flips} ratio=${vsTl.ratio.toFixed(1)}`);
    await p.evaluate(() => Store.setTimeline({ playing: false }));

    // follow + camera-path playback at once
    await p.evaluate(() => {
      if (window.Follow) Follow.set('model', window.__mid, { zoom: 7 });
      Store.setCampath({ frames: [
        { view: { lat: 15, lng: 25, zoom: 5 } },
        { view: { lat: 19, lng: 29, zoom: 5 } } ], playing: true, sec: 8 });
    });
    await sleep(700);
    const vsCp = await cameraTrack(p);
    rec('S1 · follow + campath do not fight', vsCp.flips <= 5, `flips=${vsCp.flips} ratio=${vsCp.ratio.toFixed(1)}`);
    await p.evaluate(() => Store.setCampath({ playing: false }));

    // a scene cut while following must land on the scene view and stay there
    await p.evaluate(() => {
      if (window.Follow) Follow.set('model', window.__mid, { zoom: 7 });
      const s2 = Store.addScene({ lat: 10, lng: 20, zoom: 5 });
      Store.setActive(s2.id); window.__s2 = s2.id;
    });
    await sleep(2600);
    const afterCut = await p.evaluate(() => {
      const c = GameMap.map.getCenter();
      return { lat: c.lat, lng: c.lng, following: !!(window.Follow && Follow.active()) };
    });
    const landed = Math.hypot(afterCut.lat - 10, afterCut.lng - 20) < 3;
    rec('S1 · scene cut wins over an active follow', landed,
      `centre=${afterCut.lat.toFixed(2)},${afterCut.lng.toFixed(2)} following=${afterCut.following}`);

    await p.evaluate(() => window.Follow && Follow.stop());
    await p.close();
  }

  /* ============ S2 · manual input releases the follow lock (2D and 3D) ============ */
  console.log('\n--- S2 · follow yields to the operator ---');
  {
    const p = await open(browser, `${BASE}/control.html?nosync`);
    await seed(p);
    await p.evaluate(() => {
      if (Store.clearModels3d) Store.clearModels3d();
      const m = Store.addModel3d({ src: 'x.glb', name: 'T2', lat: 29.5, lng: 45, scale: 4, mode: '2d', on: true });
      Store.updateModel3d(m.id, { route: [[29.5, 45], [31, 48]], routeDur: 60 });
      if (window.ModelsAnim && ModelsAnim.play) ModelsAnim.play(m.id);
      window.__mid = m.id;
      Follow.set('model', m.id, { zoom: 7 });
    });
    await sleep(900);
    rec('S2 · follow engaged', await p.evaluate(() => !!Follow.active()));

    // a REAL pointer drag on the 2D map (not a programmatic setView)
    const box = await p.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.move(box.x, box.y); await p.mouse.down();
    for (let i = 1; i <= 8; i++) { await p.mouse.move(box.x - i * 14, box.y + i * 7); await sleep(28); }
    await p.mouse.up(); await sleep(700);
    rec('S2 · manual 2D pan releases follow', await p.evaluate(() => !Follow.active()));

    // same in 3D
    const has3d = await p.evaluate(async () => {
      if (!window.Map3D) return false;
      Follow.set('model', window.__mid, { zoom: 7 });
      Map3D.enter(); return true;
    });
    if (has3d) {
      await sleep(3800);
      const eng = await p.evaluate(() => ({ following: !!Follow.active(), on: !!Map3D.on }));
      if (eng.on && eng.following) {
        await p.mouse.move(box.x, box.y); await p.mouse.down();
        for (let i = 1; i <= 8; i++) { await p.mouse.move(box.x - i * 14, box.y + i * 6); await sleep(28); }
        await p.mouse.up(); await sleep(800);
        rec('S2 · manual 3D pan releases follow', await p.evaluate(() => !Follow.active()));
      } else {
        rec('S2 · manual 3D pan releases follow', false, `precondition failed on=${eng.on} following=${eng.following}`);
      }
      await p.evaluate(() => { try { Map3D.exit(); } catch (e) {} });
      await sleep(900);
    }
    await p.close();
  }

  /* ============ S3 · 2D <-> 3D round trip keeps content and camera ============ */
  console.log('\n--- S3 · 2D<->3D round trip ---');
  {
    const p = await open(browser, `${BASE}/control.html?nosync`);
    await seed(p);
    await p.evaluate(() => {
      Store.clearElements();
      Store.addElement({ type: 'marker', ll: [29.5, 45], color: '#36ff9e', label: 'A' });
      Store.addElement({ type: 'arrow', lls: [[29, 44], [30, 46]], color: '#ff4d4d' });
      Store.addElement({ type: 'text', ll: [29.8, 45.4], text: 'ROUND TRIP', color: '#ffffff' });
      GameMap.map.setView([29.5, 45], 6, { animate: false });
    });
    await sleep(900);
    const before = await p.evaluate(() => ({ n: Store.activeScene().elements.length, c: GameMap.map.getCenter(), z: GameMap.map.getZoom() }));

    const entered = await p.evaluate(() => { if (!window.Map3D) return false; Map3D.enter(); return true; });
    await sleep(4200);
    const in3d = await p.evaluate(() => ({
      on: !!(window.Map3D && Map3D.on),
      canvas: !!document.querySelector('.maplibregl-canvas'),
      c: (window.Map3D && Map3D.map) ? Map3D.map.getCenter() : null,
    }));
    rec('S3 · 3D enters and renders', !entered || (in3d.on && in3d.canvas), JSON.stringify({ on: in3d.on, canvas: in3d.canvas }));
    if (in3d.c) {
      const drift = Math.hypot(in3d.c.lat - before.c.lat, in3d.c.lng - before.c.lng);
      rec('S3 · 3D adopts the 2D camera position', drift < 1.5, `drift=${drift.toFixed(3)}`);
    }

    await p.evaluate(() => { try { Map3D.exit(); } catch (e) {} });
    await sleep(1600);
    const after = await p.evaluate(() => ({ n: Store.activeScene().elements.length, c: GameMap.map.getCenter(), z: GameMap.map.getZoom(), on: !!(window.Map3D && Map3D.on) }));
    rec('S3 · exits 3D cleanly', !after.on);
    rec('S3 · drawn content survives the round trip', after.n === before.n, `${before.n} -> ${after.n}`);
    rec('S3 · 2D camera is sane after return',
      Math.abs(after.c.lat) <= 90 && Math.abs(after.c.lng) <= 180 && after.z >= 1 && after.z <= 20,
      JSON.stringify({ lat: +after.c.lat.toFixed(2), lng: +after.c.lng.toFixed(2), z: after.z }));
    await p.close();
  }

  /* ============ S4 · hostile / corrupt state must not break the boot ============ */
  console.log('\n--- S4 · corrupt-state recovery ---');
  {
    // garbage localStorage
    const p = await open(browser, `${BASE}/control.html?nosync`);
    await p.evaluate(() => { localStorage.setItem('newsmap.v3', '{not valid json%%%'); });
    await p.reload({ waitUntil: 'domcontentloaded' });
    let booted = false;
    try { await p.waitForFunction(() => window.Store && window.GameMap, { timeout: 15000 }); booted = true; } catch (e) {}
    await sleep(1800);
    rec('S4 · boots after corrupt localStorage', booted && await p.evaluate(() => !!document.getElementById('map')));

    // structurally valid but semantically hostile values
    await p.evaluate(() => {
      localStorage.setItem('newsmap.v3', JSON.stringify({
        rundown: { title: 'X', activeId: 'ghost-id-that-does-not-exist', scenes: [
          { id: 'sc1', title: 'Bad', view: { lat: 999, lng: -4000, zoom: NaN }, elements: [
            { type: 'marker', ll: [null, undefined], color: 123 },
            { type: 'arrow', lls: null },
            { type: 'text' },
          ] } ] },
        config: { mapStyles: null, assetCats: 'not-an-array', places: [{ name: 'P' }] },
        broadcast: { banner: { on: true, text: null }, ticker: { on: true, speed: 0 } },
        color: 12345, mapStyle: { not: 'a string' }, reveal: 'nope', tracking: null,
      }));
    });
    await p.reload({ waitUntil: 'domcontentloaded' });
    let booted2 = false;
    try { await p.waitForFunction(() => window.Store && window.GameMap, { timeout: 15000 }); booted2 = true; } catch (e) {}
    await sleep(2400);
    const alive = booted2 && await p.evaluate(() => {
      const c = GameMap.map.getCenter();
      return !!document.getElementById('map') && isFinite(c.lat) && isFinite(c.lng) && isFinite(GameMap.map.getZoom());
    });
    rec('S4 · survives hostile config with a finite camera', alive);

    // out-of-range coordinates fed through the live API
    const okApi = await p.evaluate(() => {
      try {
        Store.scenes().slice().forEach(s => Store.removeScene(s.id));
        const s = Store.addScene({ lat: 200, lng: 900, zoom: 999 });
        Store.setActive(s.id);
        Store.addElement({ type: 'marker', ll: [1e9, -1e9], color: '#fff' });
        const c = GameMap.map.getCenter();
        return isFinite(c.lat) && isFinite(c.lng);
      } catch (e) { return 'threw: ' + e.message; }
    });
    rec('S4 · out-of-range coordinates do not break the map', okApi === true, String(okApi));
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await p.close();
  }

  /* ============ S5 · full broadcast journey, control -> presenter ============ */
  console.log('\n--- S5 · control -> presenter broadcast journey ---');
  {
    const ctl = await open(browser, `${BASE}/control.html?allowsync&room=${ROOM}`);
    const pre = await open(browser, `${BASE}/index.html?room=${ROOM}`);
    await ctl.evaluate(() => {
      Store.scenes().slice().forEach(s => Store.removeScene(s.id));
      const s = Store.addScene({ lat: 33.3, lng: 44.4, zoom: 7 });
      Store.setActive(s.id);
      Store.addElement({ type: 'marker', ll: [33.3, 44.4], color: '#ff3b3b', label: 'BAGHDAD' });
      Store.setLowerThird(s.id, { title: 'LIVE REPORT', subtitle: 'from the capital' });
      Store.setBanner({ on: true, text: 'BREAKING NEWS', tag: 'BREAKING' });
      Store.setTicker({ on: true, text: 'developing story', speed: 60 });
      Store.setMode('live');
    });
    await sleep(4200);
    const mirrored = await pre.evaluate(() => {
      const s = Store.activeScene();
      return {
        el: s ? s.elements.length : 0,
        lt: !!(s && s.lowerThird && s.lowerThird.title),
        banner: !!(Store.state.broadcast.banner || {}).on,
        ticker: !!(Store.state.broadcast.ticker || {}).on,
        bannerVisible: !!document.querySelector('.bcast-banner:not([hidden])'),
      };
    });
    rec('S5 · presenter mirrors elements', mirrored.el >= 1, JSON.stringify(mirrored));
    rec('S5 · presenter mirrors the lower third', mirrored.lt);
    rec('S5 · presenter mirrors banner + ticker', mirrored.banner && mirrored.ticker);
    rec('S5 · banner actually renders on the presenter', mirrored.bannerVisible);

    // clean the throwaway room up after ourselves
    await ctl.evaluate(() => {
      Store.setBanner({ on: false, text: 'BREAKING NEWS' });
      Store.setTicker({ on: false, text: '' });
      Store.clearElements();
    });
    await sleep(2200);
    await ctl.close(); await pre.close();
  }

  await browser.close();

  console.log('\n---------------------------------------------');
  console.log(`SCENARIOS  TOTAL ${pass + fail} · PASS ${pass} · FAIL ${fail}`);
  if (fails.length) console.log('FAILED:\n  - ' + fails.join('\n  - '));
  const noisy = pageErrors.filter(e => !/shaderPreludeCode/.test(e));
  console.log('PAGE ERRORS: ' + noisy.length);
  noisy.slice(0, 10).forEach(e => console.log('  ' + e.slice(0, 160)));
})();
