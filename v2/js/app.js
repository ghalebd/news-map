/* ============================================================
   APP (Phase 1) — shell: map + two modes (Build / Presenter) +
   scene deck. No fixed toolbar / rail. Drawing arrives in P2.
   ============================================================ */
(() => {
  const I = window.ICONS, S = window.Store, M = window.GameMap;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  /* ---------- brand + status ---------- */
  const brand = h('div', 'brand', `<img alt="Al Jazeera" onerror="this.style.display='none'">`); document.body.appendChild(brand);
  function applyBrand() { const img = brand.querySelector('img'); const logo = S.cfg().brand && S.cfg().brand.logo; img.src = logo || '../live_assets/aljazeera_logo.png'; img.style.display = ''; }
  const status = h('div', 'status'); document.body.appendChild(status);
  function renderStatus() { const v = M.currentView(); status.innerHTML = `<span class="status__dot"></span><span>${v.lat.toFixed(2)} , ${v.lng.toFixed(2)}</span> · <b>Z${v.zoom.toFixed(1)}</b>`; }
  M.map.on('move zoom', renderStatus); renderStatus();

  /* ---------- mode switch (top centre) ---------- */
  const modeSwitch = h('div', 'modesw');
  const mkMode = (id, label) => { const b = h('button', 'modesw__btn', label); b.dataset.mode = id; b.onclick = () => S.setMode(id); return b; };
  modeSwitch.append(mkMode('build', 'PREP'), mkMode('live', 'PRESENTER'));
  document.body.appendChild(modeSwitch);

  /* ---------- scene deck (BUILD) ---------- */
  const deck = h('div', 'deck');
  const deckScroll = h('div', 'deck__scroll');
  const addCard = h('button', 'deck__add', `${I.film}<span>+ SCENE</span>`);
  addCard.title = 'Capture current map view as a scene';
  addCard.onclick = () => S.addScene(M.currentView());
  deck.append(deckScroll, addCard);
  document.body.appendChild(deck);

  function renderDeck() {
    deckScroll.innerHTML = '';
    S.scenes().forEach((sc, i) => {
      const active = sc.id === S.state.rundown.activeId;
      const card = h('div', 'card-sc' + (active ? ' is-active' : ''));
      card.append(
        h('div', 'card-sc__no', String(i + 1)),
        h('div', 'card-sc__title', sc.title),
        h('div', 'card-sc__meta', `Z${sc.view.zoom.toFixed(1)} · ${sc.elements.length} elem`),
      );
      const ops = h('div', 'card-sc__ops');
      const op = (icon, title, fn) => { const b = h('button', 'card-sc__op', icon); b.title = title; b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
      ops.append(
        op(I.navL, 'Move left', () => S.moveScene(sc.id, -1)),
        op(I.navR, 'Move right', () => S.moveScene(sc.id, +1)),
        op(I.close, 'Delete', () => S.removeScene(sc.id)),
      );
      card.appendChild(ops);
      card.onclick = () => S.setActive(sc.id);
      deckScroll.appendChild(card);
    });
  }

  /* ---------- NOW / NEXT (LIVE) ---------- */
  const nownext = h('div', 'nownext');
  const nnPrev = h('button', 'nownext__nav', I.navL); nnPrev.onclick = () => S.retreat();
  const nnNext = h('button', 'nownext__nav nownext__nav--main', I.navR); nnNext.onclick = () => S.advance();
  const nnNow = h('div', 'nownext__now'), nnNext2 = h('div', 'nownext__next');
  nownext.append(nnPrev, h('div', 'nownext__body', ''), nnNext);
  nownext.children[1].append(h('div', 'nownext__lbl', 'NOW'), nnNow, h('div', 'nownext__lbl', 'NEXT'), nnNext2);
  document.body.appendChild(nownext);

  function renderNowNext() {
    const sc = S.scenes(); const i = S.sceneIndex(S.state.rundown.activeId);
    const cur = sc[i];
    nnNow.textContent = cur ? cur.title : '—';
    if (cur && cur.reveal) { const done = S.revealedCount(cur), tot = cur.elements.length; nnNext2.textContent = done < tot ? `Reveal ${done}/${tot} — next: ${sc[i + 1] ? sc[i + 1].title : 'END'}` : (sc[i + 1] ? sc[i + 1].title : '— END —'); }
    else nnNext2.textContent = sc[i + 1] ? sc[i + 1].title : '— END —';
  }

  /* ---------- lower third (LIVE) ---------- */
  const lthird = h('div', 'lthird'); lthird.hidden = true; document.body.appendChild(lthird);
  function renderLowerThird() {
    const s = S.activeScene(); const lt = s && s.lowerThird;
    const on = S.state.mode === 'live' && lt && (lt.title || lt.subtitle);
    if (!on) { lthird.hidden = true; return; }
    lthird.innerHTML = `<div class="lthird__bar"></div><div class="lthird__tx"><div class="lthird__t">${esc(lt.title)}</div>${lt.subtitle ? `<div class="lthird__s">${esc(lt.subtitle)}</div>` : ''}</div>`;
    lthird.hidden = false;
  }

  /* ---------- broadcast graphics: breaking banner + news ticker ---------- */
  const banner = h('div', 'bcast-banner'); banner.hidden = true; document.body.appendChild(banner);
  const ticker = h('div', 'bcast-ticker'); ticker.hidden = true; document.body.appendChild(ticker);
  function renderBroadcast() {
    const bc = S.state.broadcast || {};
    const bn = bc.banner || {}, tk = bc.ticker || {};
    banner.hidden = !bn.on;
    if (bn.on) banner.innerHTML = `<span class="bcast-banner__tag">${esc((bn.tag || 'BREAKING'))}</span><span class="bcast-banner__tx">${esc(bn.text || '')}</span>`;
    ticker.hidden = !tk.on;
    if (tk.on) { const speed = Math.max(15, tk.speed || 60); ticker.innerHTML = `<span class="bcast-ticker__tag">LIVE</span><div class="bcast-ticker__win"><div class="bcast-ticker__run" style="animation-duration:${Math.max(6, 1200 / speed * 6)}s">${esc(tk.text || '')}&nbsp;&nbsp;•&nbsp;&nbsp;${esc(tk.text || '')}</div></div>`; }
    document.body.classList.toggle('has-ticker', !!tk.on);
    document.body.classList.toggle('has-banner', !!bn.on);
  }

  /* ---------- auto-tour (control window drives; presenter follows via sync) ---------- */
  let tourT = null;
  function applyTour() {
    const t = (S.state.broadcast && S.state.broadcast.tour) || {};
    clearInterval(tourT); tourT = null;
    if (t.playing && window.APP_ROLE === 'control') tourT = setInterval(() => S.advance(), Math.max(2, t.sec || 8) * 1000);
  }

  /* ---------- mode application ---------- */
  function applyMode() {
    document.body.classList.toggle('mode-build', S.state.mode === 'build');
    document.body.classList.toggle('mode-live', S.state.mode === 'live');
    modeSwitch.querySelectorAll('.modesw__btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === S.state.mode));
    renderLowerThird(); window.Draw && window.Draw.render();
  }

  /* ---------- react to store ---------- */
  S.on((st, evt) => {
    if (evt === 'mode') applyMode();
    if (evt === 'config' || evt === 'sync') { window.Theme && window.Theme.apply(S.cfg().style); applyBrand(); }
    if (evt === 'scenes' || evt === 'active' || evt === 'elements' || evt === 'reveal' || evt === 'sync') { renderDeck(); renderNowNext(); }
    if (evt === 'elements' || evt === 'active' || evt === 'scenes' || evt === 'reveal' || evt === 'sync') window.Draw && window.Draw.render();
    if (evt === 'scenes' || evt === 'active' || evt === 'mode' || evt === 'sync') renderLowerThird();
    if (evt === 'broadcast' || evt === 'sync') { renderBroadcast(); applyTour(); }
    if (evt === 'active') { const s = S.activeScene(); if (s) M.flyToView(s.view, s.transition); }
    if (evt === 'mapstyle' || evt === 'sync') M.setStyle(S.state.mapStyle);
  });

  /* ---------- keyboard ---------- */
  window.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    const D = window.Draw;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? S.redo() : S.undo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); S.redo(); return; }
    if (e.key === '/') { e.preventDefault(); D && D.toggleMenu(); return; }
    if (e.key === 'Escape') { D && D.setTool('select'); D && D.closeMenu(); return; }
    if (e.key.toLowerCase() === 'h' && window.UI) { UI.hideUI(); return; }
    if (e.key.toLowerCase() === 'm' && S.state.mode === 'live') S.toggleMode();
    else if (e.key.toLowerCase() === 'm' && D && D.tool === 'select') S.toggleMode();
    if (S.state.mode === 'live') {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); S.advance(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); S.retreat(); }
      if (/^[1-9]$/.test(e.key)) { const s = S.scenes()[+e.key - 1]; if (s) S.setActive(s.id); }
    }
  });

  /* ---------- boot ---------- */
  applyMode();
  applyBrand();
  renderBroadcast();
  applyTour();
  window.Theme && window.Theme.apply(S.cfg().style);
  M.setStyle(S.state.mapStyle);
  if (!S.scenes().length) S.addScene(M.currentView(), { title: 'Opening Scene' });
  else { renderDeck(); renderNowNext(); const a = S.activeScene(); if (a) M.flyToView(a.view, { type: 'cut' }); }
  window.Draw && window.Draw.render();

  window.__app = { map: M.map, store: S, draw: window.Draw, theme: window.Theme };
  console.log('[news-map v3] ready');
})();
