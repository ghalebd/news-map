/* Cloud verification (runs on GitHub Actions, not your laptop).
   Loads v2 in headless Chromium, checks for JS errors / overlapping chrome /
   off-screen panels at desktop + portrait, and saves screenshots as artifacts. */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve('ci-shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8000/v2/index.html';
const SIZES = [{ n: 'wide', w: 1440, h: 900 }, { n: 'narrow', w: 680, h: 1320 }];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  let failed = false;
  for (const sz of SIZES) {
    const page = await browser.newPage();
    await page.setViewport({ width: sz.w, height: sz.h });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));
    const res = await page.evaluate(() => {
      const named = [['toolbar', '.toolbar'], ['rail', '.rail'], ['status', '.status']];
      const list = named.map(([n, s]) => ({ n, r: document.querySelector(s)?.getBoundingClientRect() })).filter(x => x.r);
      document.querySelectorAll('.bar').forEach((e, i) => list.push({ n: 'bar' + i, r: e.getBoundingClientRect() }));
      let overlaps = [], off = [];
      for (let i = 0; i < list.length; i++) {
        const r = list[i].r;
        if (r.right < 2 || r.bottom < 2 || r.left > innerWidth - 2 || r.top > innerHeight - 2) off.push(list[i].n);
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].r, c = list[j].r;
          const ox = Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left));
          const oy = Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
          if (ox > 3 && oy > 3) overlaps.push(list[i].n + '<>' + list[j].n);
        }
      }
      return { overlaps, off };
    });
    await page.screenshot({ path: path.join(OUT, sz.n + '.png') });
    const ok = errs.length === 0 && res.overlaps.length === 0 && res.off.length === 0;
    failed = failed || !ok;
    console.log(`[${sz.n}] errors=${errs.length} overlaps=${res.overlaps.length} offscreen=${res.off.length} ${ok ? 'OK' : 'FAIL'}`);
    if (errs.length) console.log('  errors:', errs.slice(0, 3));
    if (res.overlaps.length) console.log('  overlaps:', res.overlaps);
    await page.close();
  }
  await browser.close();
  if (failed) { console.error('VERIFY FAILED'); process.exit(1); }
  console.log('VERIFY PASSED');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
