/* ============================================================
   APP (Phase 1) — shell: map + two modes (Build / Presenter) +
   scene deck. No fixed toolbar / rail. Drawing arrives in P2.
   ============================================================ */
(() => {
  const I = window.ICONS, S = window.Store, M = window.GameMap;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  /* ---------- brand + status ---------- */
  document.body.appendChild(h('div', 'brand', `<img src="../live_assets/aljazeera_logo.png" alt="Al Jazeera" onerror="this.style.display='none'">`));
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
  const nnPrev = h('button', 'nownext__nav', I.navL); nnPrev.onclick = () => S.prevScene();
  const nnNext = h('button', 'nownext__nav nownext__nav--main', I.navR); nnNext.onclick = () => S.nextScene();
  const nnNow = h('div', 'nownext__now'), nnNext2 = h('div', 'nownext__next');
  nownext.append(nnPrev, h('div', 'nownext__body', ''), nnNext);
  nownext.children[1].append(h('div', 'nownext__lbl', 'NOW'), nnNow, h('div', 'nownext__lbl', 'NEXT'), nnNext2);
  document.body.appendChild(nownext);

  function renderNowNext() {
    const sc = S.scenes(); const i = S.sceneIndex(S.state.rundown.activeId);
    nnNow.textContent = sc[i] ? sc[i].title : '—';
    nnNext2.textContent = sc[i + 1] ? sc[i + 1].title : '— END —';
  }

  /* ---------- mode application ---------- */
  function applyMode() {
    document.body.classList.toggle('mode-build', S.state.mode === 'build');
    document.body.classList.toggle('mode-live', S.state.mode === 'live');
    modeSwitch.querySelectorAll('.modesw__btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === S.state.mode));
  }

  /* ---------- react to store ---------- */
  S.on((st, evt) => {
    if (evt === 'mode') applyMode();
    if (evt === 'scenes' || evt === 'active' || evt === 'elements') { renderDeck(); renderNowNext(); }
    if (evt === 'elements' || evt === 'active' || evt === 'scenes') window.Draw && window.Draw.render();
    if (evt === 'active') { const s = S.activeScene(); if (s) M.flyToView(s.view, s.transition); }
  });

  /* ---------- keyboard ---------- */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const D = window.Draw;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? S.redo() : S.undo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); S.redo(); return; }
    if (e.key === '/') { e.preventDefault(); D && D.toggleMenu(); return; }
    if (e.key === 'Escape') { D && D.setTool('select'); D && D.closeMenu(); return; }
    if (e.key.toLowerCase() === 'm' && S.state.mode === 'live') S.toggleMode();
    else if (e.key.toLowerCase() === 'm' && D && D.tool === 'select') S.toggleMode();
    if (S.state.mode === 'live') {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); S.nextScene(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); S.prevScene(); }
      if (/^[1-9]$/.test(e.key)) { const s = S.scenes()[+e.key - 1]; if (s) S.setActive(s.id); }
    }
  });

  /* ---------- boot ---------- */
  applyMode();
  S.addScene(M.currentView(), { title: 'Opening Scene' });
  window.Draw && window.Draw.render();

  window.__app = { map: M.map, store: S, draw: window.Draw };
  console.log('[news-map v3] ready');
})();
