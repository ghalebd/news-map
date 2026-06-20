// Real tool exercise + conflict detection — drives the actual UI (real button clicks + real
// map gestures) and checks for tool/panel conflicts. Run: node tmp/tools-test.js (server :8000)
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = []; const rec = (n, ok, info) => R.push({ n, ok: !!ok, info: info || '' });

const TOOLS = [
  { label: 'Marker', g: 'click', type: 'marker' },
  { label: 'Label', g: 'click', type: 'text', stub: true },
  { label: 'Arrow', g: 'drag', type: 'arrow' },
  { label: 'Freehand arrow', g: 'free', type: 'tarrow' },
  { label: 'Curved arrow', g: 'drag', type: 'curve' },
  { label: 'Range ring', g: 'drag', type: 'ring' },
  { label: 'Circle', g: 'drag', type: 'circle' },
  { label: 'Area', g: 'drag', type: 'polygon' },
  { label: 'Freehand', g: 'free', type: 'sketch' },
  { label: 'Front line', g: 'drag', type: 'frontline' },
  { label: 'Highlight country', g: 'click', type: 'country', at: [33, 44] },
  { label: 'Measure', g: 'drag', type: 'measure' },
];

(async () => {
  const b = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
  p.on('dialog', d => d.accept().catch(() => {}));
  await p.goto('http://localhost:8000/v2/control.html?nosync', { waitUntil: 'domcontentloaded' }); await sleep(1200);
  await p.evaluate(() => { try { localStorage.clear(); indexedDB.deleteDatabase('newsmap.assets3d'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(2600);
  await p.evaluate(() => { Store.setMode('build'); if (!Store.scenes().length) Store.addScene({ lat: 31, lng: 47, zoom: 6 }); Store.setActive(Store.scenes()[0].id); Store.clearElements(); });

  // helper: open FAB menu (real click) and click a tool item by its label text
  async function pickFromFab(label) {
    await p.evaluate(() => { const qa = document.querySelector('.qa'); const vis = qa && getComputedStyle(qa).display !== 'none'; if (!vis) document.querySelector('.fab').click(); });
    await sleep(120);
    const items = await p.$$('.qa__tool');
    for (const it of items) { const t = (await (await it.getProperty('textContent')).jsonValue()).trim(); if (t === label) { await it.click(); return true; } }
    return false;
  }
  const state = () => p.evaluate(() => {
    const toolIds = ['select', 'arrow', 'tarrow', 'curve', 'marker', 'ring', 'circle', 'polygon', 'sketch', 'frontline', 'country', 'text', 'measure', 'asset', 'flags', 'erase'];
    const active = [...document.querySelectorAll('.qtool.is-on')].map(b => b.dataset.qid).filter(q => toolIds.includes(q));
    return { tool: window.Draw && Draw.tool, active, cursor: GameMap.map.getContainer().style.cursor, dragging: GameMap.map.dragging.enabled(), armHidden: (document.querySelector('.armchip') || {}).hidden };
  });
  const doGesture = (g, type, at, stub) => p.evaluate((g, type, at, stub) => {
    const m = GameMap.map, LL = a => L.latLng(a[0], a[1]);
    const before = Store.activeScene().elements.length;
    if (stub && window.UI) UI.input = () => Promise.resolve('Test label');
    const A = at || [31, 47], Bp = [A[0] + 1, A[1] + 1.5];
    if (g === 'click') m.fire('click', { latlng: LL(A) });
    else if (g === 'drag') { m.fire('mousedown', { latlng: LL(A) }); m.fire('mousemove', { latlng: LL(Bp) }); m.fire('mouseup', { latlng: LL(Bp) }); }
    else if (g === 'free') { m.fire('mousedown', { latlng: LL(A) }); m.fire('mousemove', { latlng: LL([A[0] + 0.5, A[1] + 0.7]) }); m.fire('mousemove', { latlng: LL(Bp) }); m.fire('mouseup', { latlng: LL(Bp) }); }
    return before;
  }, g, type, at, stub);
  const lastElem = () => p.evaluate(() => { const e = Store.activeScene().elements; const l = e[e.length - 1]; if (!l) return null; const m = GameMap.map; const layer = Object.values(m._layers).find(x => x && x.__id === l.id); return { type: l.type, count: e.length, rendered: !!layer }; });

  // ---------- PART A: exercise every tool through the real ADD menu ----------
  for (const t of TOOLS) {
    await p.evaluate(() => Store.clearElements());
    const picked = await pickFromFab(t.label);
    if (!picked) { rec('tool ' + t.label + ' — menu item', false, 'not found in ADD menu'); continue; }
    await sleep(80);
    const st = await state();
    rec('tool ' + t.label + ' · activates', st.tool === t.type, 'tool=' + st.tool);
    rec('tool ' + t.label + ' · single active (no conflict)', st.active.length === 1 && st.active[0] === t.type, 'active=[' + st.active.join(',') + ']');
    rec('tool ' + t.label + ' · crosshair cursor', st.cursor === 'crosshair');
    await doGesture(t.g, t.type, t.at, t.stub); await sleep(t.stub ? 160 : 60);
    const le = await lastElem();
    rec('tool ' + t.label + ' · creates ' + t.type, le && le.type === t.type, le ? 'type=' + le.type : 'none');
    rec('tool ' + t.label + ' · renders on map', le && le.rendered);
    const st2 = await state();
    rec('tool ' + t.label + ' · map drag restored', st2.dragging === true, 'dragging=' + st2.dragging);
  }

  // ---------- erase (special: removes on element mousedown) ----------
  await p.evaluate(() => { Store.clearElements(); Store.addElement({ type: 'marker', ll: [31, 47], color: '#fff' }); });
  await sleep(160);
  await pickFromFab('Erase'); await sleep(80);
  const eraseSt = await state();
  rec('tool Erase · activates', eraseSt.tool === 'erase', 'tool=' + eraseSt.tool);
  const erased = await p.evaluate(() => { const id = Store.activeScene().elements[0].id; const lyr = Object.values(GameMap.map._layers).find(l => l && l.__id === id); if (lyr && lyr.fire) lyr.fire('mousedown', { latlng: L.latLng(31, 47), originalEvent: { stopPropagation() {}, preventDefault() {} } }); GameMap.map.fire('click', { latlng: L.latLng(31, 47) }); return Store.activeScene().elements.length; });
  rec('tool Erase · removes element', erased === 0, 'remaining=' + erased);

  // ---------- asset + flags (palette path) ----------
  const assetDiag = await p.evaluate(async () => { const a = Store.addCustomAsset({ name: 'IMG', cat: 'air', url: 'data:image/png;base64,iVBORw0KGgo=' }); Draw.openPalette(); await new Promise(r => setTimeout(r, 140)); const items = document.querySelectorAll('.qa--assets:not(.qa--flags) .qa-asset__item'); const btn = items[0]; if (!btn) return { ok:false, why:'no item', n:items.length }; btn.click(); await new Promise(r => setTimeout(r, 30)); const toolAfter = Draw.tool; const before = Store.activeScene().elements.length; GameMap.map.fire('click', { latlng: L.latLng(30, 46) }); await new Promise(r => setTimeout(r, 60)); const el = Store.activeScene().elements.slice(-1)[0]; const ok = Store.activeScene().elements.length > before && el && el.type === 'asset'; Store.removeCustomAsset(a.id); return { ok, toolAfter, before, after: Store.activeScene().elements.length, lastType: el && el.type, items: items.length }; });
  rec('tool Image (palette) · places asset', assetDiag.ok === true, JSON.stringify(assetDiag));
  const flagOk = await p.evaluate(async () => { if (!(window.FLAGS && FLAGS.length)) return 'no FLAGS'; Draw.openFlags(); await new Promise(r => setTimeout(r, 60)); const btn = document.querySelector('.qa--flags .qa-asset__item'); if (!btn) return 'no flag'; btn.click(); const before = Store.activeScene().elements.length; GameMap.map.fire('click', { latlng: L.latLng(29, 45) }); await new Promise(r => setTimeout(r, 60)); return Store.activeScene().elements.length > before; });
  rec('tool Flag (palette) · places flag', flagOk === true, typeof flagOk === 'string' ? flagOk : '');

  // ---------- PART B: conflict detection ----------
  // 1) switching back to Select cleans up (cursor reset, armchip hidden, drag enabled)
  await p.evaluate(() => Draw.setTool('select')); await sleep(80);
  const sel = await state();
  rec('conflict · Select resets cursor', sel.cursor === '' || sel.cursor === 'auto', 'cursor=' + JSON.stringify(sel.cursor));
  rec('conflict · Select hides arm chip', sel.armHidden === true);
  rec('conflict · Select enables map drag', sel.dragging === true);

  // 2) panel overlap matrix — open all panels, check pairwise overlaps
  await p.evaluate(() => { Store.clearElements(); const it = (window.MODELS3D_CATALOG || [])[0]; if (it) Store.addModel3d({ src: 'assets3d/' + it.file, name: 'M', lat: 31, lng: 47, scale: 3, mode: 'both', on: true }); });
  await sleep(1200);
  await p.evaluate(() => { const q = id => { const el = document.querySelector('.qtool[data-qid=' + id + ']'); el && el.click(); }; q('timeline'); if (window.ModelControl) ModelControl.toggle(); q('mapstyle'); });
  await sleep(600);
  const overlaps = await p.evaluate(() => {
    const sels = ['.qtools', '.sceneins', '.zoomctl', '.deck', '.brand', '.modesw', '.status', '.tl', '.mctl', '.mapstyle-pop', '.cfg-toggle'];
    const vis = sels.map(s => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden) return null; const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return null; if (b.right <= 0 || b.bottom <= 0 || b.left >= innerWidth || b.top >= innerHeight) return null; return { s, b }; }).filter(Boolean);
    const out = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i].b, c = vis[j].b; const ox = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)); const oy = Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top)); const area = ox * oy;
      if (area > 80) out.push(vis[i].s + ' ∩ ' + vis[j].s + ' = ' + Math.round(ox) + 'x' + Math.round(oy) + 'px');
    }
    return out;
  });
  rec('conflict · no panel overlaps (all open)', overlaps.length === 0, overlaps.join(' | '));

  // 3) z-order sanity: flyout > bar, modal > flyout
  const z = await p.evaluate(() => { const v = n => parseInt(getcomputed(n)) || 0; function getcomputed() {} const cs = getComputedStyle(document.documentElement); const tok = n => parseInt(cs.getPropertyValue(n)); return { bar: tok('--z-bar'), flyout: tok('--z-flyout'), modal: tok('--z-modal') }; });
  rec('conflict · z-order tokens ordered', z.flyout > z.bar && z.modal > z.flyout, JSON.stringify(z));

  // 4) active-tool exclusivity stress: rapidly switch tools, never >1 active
  const excl = await p.evaluate(async () => { const ids = ['marker', 'arrow', 'ring', 'circle', 'select']; let maxActive = 0; for (const id of ids) { Draw.setTool(id); const n = document.querySelectorAll('.qtool.is-on').length; const toolN = [...document.querySelectorAll('.qtool.is-on')].filter(b => ['select', 'arrow', 'tarrow', 'curve', 'marker', 'ring', 'circle', 'polygon', 'sketch', 'frontline', 'country', 'text', 'measure', 'asset', 'flags', 'erase'].includes(b.dataset.qid)).length; maxActive = Math.max(maxActive, toolN); } return maxActive; });
  rec('conflict · only one tool active ever', excl === 1, 'maxActive=' + excl);

  // ---------- report ----------
  console.log('\n================ TOOLS + CONFLICTS REPORT ================');
  let pass = 0; R.forEach(r => { console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.info && !r.ok ? '   << ' + r.info : '')); if (r.ok) pass++; });
  console.log('---------------------------------------------');
  console.log('TOTAL ' + R.length + ' · PASS ' + pass + ' · FAIL ' + (R.length - pass));
  await b.close();
})();
