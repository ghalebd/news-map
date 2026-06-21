/* ============================================================
   PORT LOOKUP — resolve a free-text AIS destination to a port.
   AIS "Destination" is crew-typed (e.g. "NLRTM", "ROTTERDAM",
   "US NYC", "SGSIN", "JEBEL ALI"). We try UN/LOCODE first, then
   name matching against the bundled ports table (window.PORTS).
   Returns { name, lat, lng, unloc } or null.
   ============================================================ */
(() => {
  const P = window.PORTS || {};
  const byName = new Map();           // UPPERCASE name -> entry
  for (const code in P) { const e = P[code]; const k = (e.n || '').toUpperCase(); if (k && !byName.has(k)) byName.set(k, { name: e.n, lng: e.c[0], lat: e.c[1], unloc: code }); }

  const mk = code => { const e = P[code]; return e ? { name: e.n, lng: e.c[0], lat: e.c[1], unloc: code } : null; };
  const cache = new Map();

  function find(raw) {
    if (!raw) return null;
    if (cache.has(raw)) return cache.get(raw);
    const norm = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    let res = null;
    if (norm) {
      const tokens = norm.split(' ');
      const compact = norm.replace(/ /g, '');
      // 1) UN/LOCODE — a 5-char alpha token, or the first/last 5 of the compact string
      for (const t of tokens) { if (/^[A-Z]{5}$/.test(t) && P[t]) { res = mk(t); break; } }
      if (!res && /^[A-Z]{2}[A-Z0-9]{3}$/.test(compact.slice(0, 5)) && P[compact.slice(0, 5)]) res = mk(compact.slice(0, 5));
      if (!res && compact.length >= 5 && P[compact.slice(-5)]) res = mk(compact.slice(-5));
      // 2) exact full-name match
      if (!res && byName.has(norm)) res = byName.get(norm);
      // 3) longest token that is a known port name
      if (!res) { const cand = tokens.filter(t => t.length >= 4).sort((a, b) => b.length - a.length); for (const t of cand) { if (byName.has(t)) { res = byName.get(t); break; } } }
      // 4) loose contains (bounded) — name contains the destination phrase or vice-versa
      if (!res && norm.length >= 4) { for (const [k, v] of byName) { if (k === norm || k.startsWith(norm + ' ') || norm.startsWith(k + ' ') || (norm.length >= 6 && k.includes(norm))) { res = v; break; } } }
    }
    cache.set(raw, res);
    return res;
  }

  window.PortLookup = { find, size: byName.size };
})();
