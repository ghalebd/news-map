/* ============================================================
   GEOCODE — search a place by name and fly the map to it.
   Uses MapTiler geocoding; a small search button sits in the
   zoom cluster and opens a popup with live results. Flying uses
   a smooth flyTo. Available on both windows (per-window nav aid).
   ============================================================ */
(() => {
  const KEY = 'tnFJbEP9ELhQqkA6rPY2', map = window.GameMap.map, I = window.ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  const btn = h('button', 'zoomctl__b geo-btn', I.search); btn.title = 'Search a place';
  const pop = h('div', 'geo-pop glass'); pop.hidden = true;
  const input = h('input', 'geo-in'); input.type = 'search'; input.placeholder = 'Search a place…';
  const list = h('div', 'geo-list');
  pop.append(input, list); document.body.appendChild(pop);
  (function place() { const zc = document.querySelector('.zoomctl'); if (zc) zc.insertBefore(btn, zc.firstChild); else { btn.classList.add('geo-btn--float'); document.body.appendChild(btn); } })();

  function anchor() { const r = btn.getBoundingClientRect(); pop.style.right = Math.round(window.innerWidth - r.left + 8) + 'px'; pop.style.top = Math.round(Math.max(12, Math.min(r.top, window.innerHeight - 320))) + 'px'; }
  function zoomForBbox(b) { if (!b) return 11; const ext = Math.max(b[2] - b[0], b[3] - b[1]) || 0.1; return Math.max(3, Math.min(13, Math.round(Math.log2(360 / ext)))); }

  let t = null;
  async function search(q) {
    if (!q.trim()) { list.innerHTML = ''; return; }
    list.innerHTML = '<div class="geo-empty">Searching…</div>';
    try {
      const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${KEY}&limit=6`);
      const d = await r.json(); render(d.features || []);
    } catch (e) { list.innerHTML = '<div class="geo-empty">No results</div>'; }
  }
  function render(feats) {
    list.innerHTML = '';
    if (!feats.length) { list.innerHTML = '<div class="geo-empty">No results</div>'; return; }
    feats.forEach(f => {
      const it = h('button', 'geo-item', `<b>${esc(f.text || f.place_name)}</b><small>${esc(f.place_name || '')}</small>`);
      it.onclick = () => { const c = f.center; if (c) map.flyTo([c[1], c[0]], zoomForBbox(f.bbox), { duration: 1.6 }); pop.hidden = true; };
      list.appendChild(it);
    });
  }
  btn.onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; if (!pop.hidden) { anchor(); input.focus(); } };
  input.oninput = () => { clearTimeout(t); t = setTimeout(() => search(input.value), 350); };
  input.onkeydown = e => { if (e.key === 'Enter') { clearTimeout(t); search(input.value); } else if (e.key === 'Escape') pop.hidden = true; };
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) pop.hidden = true; });
})();
