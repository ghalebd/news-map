// Final pass: the three hard-to-automate flows — PNG/PDF export, real GLB file upload,
// and touch-screen drawing. Run with server on :8000.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GLB = '/Users/dida/news-map-deploy/v2/assets3d/missile-agm-65.glb';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = []; const rec = (n, ok, info) => { R.push({ n, ok: !!ok }); console.log((ok ? '✓' : '✗') + ' ' + n + (info && !ok ? '   << ' + info : '')); };

(async () => {
  const b = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 840 }); p.on('dialog', d => d.accept().catch(() => {}));
  const er = []; p.on('pageerror', e => er.push('' + e));
  await p.goto('http://localhost:8000/v2/control.html?nosync', { waitUntil: 'domcontentloaded' }); await sleep(1200);
  await p.evaluate(() => { try { localStorage.clear(); indexedDB.deleteDatabase('newsmap.assets3d'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(2600);
  await p.evaluate(() => { Store.setMode('build'); if (!Store.scenes().length) Store.addScene({ lat: 31, lng: 47, zoom: 6 }); Store.clearElements(); Store.addElement({ type: 'marker', ll: [31, 47], color: '#36ff9e' }); });

  // ===== 1) PNG EXPORT =====
  rec('export · html2canvas library loaded', await p.evaluate(() => !!window.html2canvas));
  const png = await p.evaluate(async () => {
    let captured = null; const _co = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { captured = blob; return _co(blob); };
    let dl = null; const _click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) dl = this.download; };
    UI.exportPNG();
    for (let i = 0; i < 300 && !captured; i++) await new Promise(r => setTimeout(r, 100));
    HTMLAnchorElement.prototype.click = _click; URL.createObjectURL = _co;
    return { type: captured && captured.type, size: captured && captured.size, download: dl };
  });
  rec('export PNG · produces a non-trivial PNG blob', png.type === 'image/png' && png.size > 2000, JSON.stringify(png));
  rec('export PNG · download filename is .png', /\.png$/.test(png.download || ''), png.download);

  // ===== 2) PDF EXPORT =====
  const pdf = await p.evaluate(async () => {
    let html = ''; const _open = window.open;
    window.open = () => ({ document: { write: s => { html += s; }, close() {} }, focus() {}, print() {} });
    UI.exportPDF();
    for (let i = 0; i < 60 && !/<img/.test(html); i++) await new Promise(r => setTimeout(r, 100));
    window.open = _open;
    const m = html.match(/src="(data:image\/png;base64,[^"]+)"/);
    return { hasImg: /<img/.test(html), dataLen: m ? m[1].length : 0 };
  });
  rec('export PDF · opens print window with embedded image', pdf.hasImg && pdf.dataLen > 3000, JSON.stringify(pdf));

  // ===== 3) REAL GLB FILE UPLOAD =====
  // open the settings drawer so the "Upload your own GLB" file input is rendered
  await p.evaluate(() => { const g = document.querySelector('.cfg-toggle'); g && g.click(); }); await sleep(700);
  const before = await p.evaluate(() => Store.models3d().length);
  const input = await p.$('input[accept*="glb"]');
  rec('GLB upload · file input exists', !!input);
  if (input) {
    await input.uploadFile(GLB);
    await sleep(1500);
    const after = await p.evaluate(async () => {
      const ms = Store.models3d(); const m = ms[ms.length - 1];
      let blobOk = false; try { const blob = m && !m.src && window.Assets3D && await Assets3D.get(m.id); blobOk = !!(blob && (blob.size || blob.byteLength)); } catch (e) {}
      return { count: ms.length, name: m && m.name, noSrc: m ? !m.src : false, blobOk };
    });
    rec('GLB upload · model added from file', after.count === before + 1 && after.noSrc, JSON.stringify(after));
    rec('GLB upload · binary stored in IndexedDB (Assets3D)', after.blobOk, JSON.stringify(after));
  }
  await p.evaluate(() => { const g = document.querySelector('.cfg-toggle'); g && g.click(); }); await sleep(300);

  // ===== 4) TOUCH-SCREEN MODE + TOUCH DRAWING =====
  const touchClass = await p.evaluate(async () => { Store.setTouch(true); await new Promise(r => setTimeout(r, 200)); return document.body.classList.contains('touch'); });
  rec('touch · body.touch class applied', touchClass);
  const touchDraw = await p.evaluate(async () => {
    Draw.setTool('arrow');
    const cont = GameMap.map.getContainer(); const r = cont.getBoundingClientRect();
    const mk = (type, x, y) => { const t = new Touch({ identifier: 1, target: cont, clientX: x, clientY: y, pageX: x, pageY: y }); cont.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
    const before = Store.activeScene().elements.length;
    mk('touchstart', r.left + 200, r.top + 200); mk('touchmove', r.left + 320, r.top + 300); mk('touchend', r.left + 320, r.top + 300);
    await new Promise(res => setTimeout(res, 80));
    const el = Store.activeScene().elements.slice(-1)[0];
    Draw.setTool('select'); Store.setTouch(false);
    return { added: Store.activeScene().elements.length > before, type: el && el.type };
  });
  rec('touch · one-finger drag draws an arrow', touchDraw.added && touchDraw.type === 'arrow', JSON.stringify(touchDraw));

  rec('no page errors during finalize', er.length === 0, er.slice(0, 3).join(' | '));
  console.log('\n=============================================');
  let pass = 0; R.forEach(r => { if (r.ok) pass++; });
  console.log('FINALIZE TOTAL ' + R.length + ' · PASS ' + pass + ' · FAIL ' + (R.length - pass));
  await b.close();
})();
