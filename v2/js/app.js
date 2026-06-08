/* ============================================================
   APP (Phase 1) — shell: map + two modes (Build / Presenter) +
   scene deck. No fixed toolbar / rail. Drawing arrives in P2.
   ============================================================ */
(() => {
  const I = window.ICONS, S = window.Store, M = window.GameMap;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

  /* ---------- brand + status ---------- */
  const brand = h('div', 'brand', `<img alt="logo" onerror="this.style.display='none'">`); document.body.appendChild(brand);
  // 3D camera tilt — Leaflet stays flat, we rake the whole map plane back and
  // blend the receding horizon into an atmospheric haze (no black void on top).
  const skyHaze = (() => { const s = document.createElement('div'); s.className = 'skyhaze'; document.body.appendChild(s); return s; })();
  function applyTilt() {
    const t = +S.cfg().tilt || 0; const el = M.map.getContainer();
    document.body.classList.toggle('is-tilted', t > 0);
    document.body.style.setProperty('--tilt', t);
    el.style.transformOrigin = '50% 100%';
    // deeper perspective + lift-and-scale so the foreground fills the frame and the horizon sits high
    el.style.transform = t > 0 ? `perspective(${1500 - t * 12}px) rotateX(${t}deg) scale(${1 + t / 38}) translateY(${-t * 0.25}%)` : '';
  }
  function applyBrand() {
    const img = brand.querySelector('img'); const br = S.cfg().brand || {};
    brand.style.left = (br.x == null ? 16 : br.x) + 'px'; brand.style.top = (br.y == null ? 30 : br.y) + 'px';
    if (br.logo) { img.src = br.logo; img.style.display = 'block'; img.style.height = (br.size || 38) + 'px'; } else { img.removeAttribute('src'); img.style.display = 'none'; }
  }
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
    lthird.className = 'lthird lt-' + (S.cfg().ltStyle || 'news');
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

  /* ---------- spotlight (dim everything except a circle) ---------- */
  const spot = h('div', 'spotlight'); spot.hidden = true; document.body.appendChild(spot);
  function renderSpotlight() {
    const s = (S.state.broadcast && S.state.broadcast.spotlight) || {};
    if (!s.on || s.lat == null || s.lng == null) { spot.hidden = true; return; }
    const pt = M.map.latLngToContainerPoint([s.lat, s.lng]);
    const mpp = 40075016.686 * Math.cos(s.lat * Math.PI / 180) / (256 * Math.pow(2, M.map.getZoom()));
    const rPx = Math.max(30, (s.radiusKm * 1000) / mpp);
    const feather = (s.feather == null ? 40 : s.feather) / 100;
    const inner = Math.max(0, rPx * (1 - feather));
    const dim = (s.dim == null ? 66 : s.dim) / 100;
    spot.style.background = `radial-gradient(circle at ${pt.x}px ${pt.y}px, rgba(4,7,12,0) ${inner}px, rgba(4,7,12,${dim}) ${rPx}px)`;
    spot.hidden = false;
  }
  M.map.on('move zoom moveend zoomend', renderSpotlight);

  /* ---------- auto-tour (control window drives; presenter follows via sync) ---------- */
  let tourT = null, tourSig = '';
  function applyTour() {
    const t = (S.state.broadcast && S.state.broadcast.tour) || {};
    const sig = (t.playing ? 1 : 0) + '|' + (t.sec || 8);
    if (sig === tourSig) return;   // only (re)start when tour fields actually change — not on every broadcast keystroke
    tourSig = sig;
    clearInterval(tourT); tourT = null;
    if (t.playing && window.APP_ROLE === 'control') tourT = setInterval(() => S.advance(), Math.max(2, t.sec || 8) * 1000);
  }

  /* ---------- animation: auto-build the active scene (reveal step-by-step) ---------- */
  let animT = null, animPlaying = false, animSig = '';
  function applyAnim() {
    const a = (S.state.broadcast && S.state.broadcast.anim) || {};
    const sig = (a.playing ? 1 : 0) + '|' + (a.ms || 700) + '|' + (a.loop ? 1 : 0);
    if (sig === animSig) return;   // ignore unrelated broadcast changes so the cadence isn't reset mid-play
    animSig = sig;
    if (a.playing && window.APP_ROLE === 'control') {
      if (!animPlaying) {   // fresh start: rewind the scene to reveal from zero
        animPlaying = true; const sc = S.activeScene(); if (!sc) { S.setAnim({ playing: false }); return; }
        if (!sc.reveal) S.toggleSceneReveal(sc.id); else { S.revealReset(sc.id); S.emit('reveal'); }
      }
      clearInterval(animT);
      animT = setInterval(() => {
        const s = S.activeScene(); if (!s) return;
        if (!S.revealNext()) { if (a.loop) { S.revealReset(s.id); S.emit('reveal'); } else { clearInterval(animT); animT = null; S.setAnim({ playing: false }); } }
      }, Math.max(150, a.ms || 700));
    } else { animPlaying = false; clearInterval(animT); animT = null; }
  }

  /* ---------- zoom / reset cluster + help ---------- */
  const zc = h('div', 'zoomctl glass');
  const zb = (icon, title, fn) => { const b = h('button', 'zoomctl__b', icon); b.title = title; b.onclick = fn; return b; };
  zc.append(
    zb(I.zoomIn || I.plus, 'Zoom in', () => M.map.zoomIn()),
    zb(I.zoomOut || I.minus, 'Zoom out', () => M.map.zoomOut()),
    zb(I.center || I.target, 'Reset to scene view', () => { const s = S.activeScene(); M.flyToView(s ? s.view : { lat: 29.5, lng: 45, zoom: 5 }, { type: 'flyTo', duration: 1 }); }),
    zb('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>', 'Help (?)', () => showHelp()),
  );
  document.body.appendChild(zc);
  function showHelp() {
    const back = h('div', 'modal-back'); const box = h('div', 'modal glass');
    box.innerHTML = `<div class="modal__t">Keyboard & tips</div><div class="help">
      <div><b>/</b> Add-element menu</div><div><b>M</b> Prep / Presenter</div><div><b>H</b> Hide / show UI</div>
      <div><b>← →</b> / Space — reveal &amp; next scene</div><div><b>1–9</b> Jump to scene</div><div><b>Esc</b> Deselect / Select tool</div>
      <div><b>⌘/Ctrl Z</b> Undo · <b>⇧Z / Y</b> Redo</div><div><b>?</b> This help</div>
      <div class="help__tip">Click a ship for its route · drag elements to move · the gear (top-left) opens the control panel.</div></div>`;
    const row = h('div', 'modal__row'); const ok = h('button', 'modal__btn modal__btn--ok', 'Got it'); row.appendChild(ok); box.appendChild(row);
    back.appendChild(box); document.body.appendChild(back); requestAnimationFrame(() => back.classList.add('in'));
    const close = () => back.remove(); ok.onclick = close; back.onclick = e => { if (e.target === back) close(); };
  }
  window.__help = showHelp;

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
    if (evt === 'config' || evt === 'sync') { window.Theme && window.Theme.apply(S.cfg().style); applyBrand(); applyTilt(); }
    if (evt === 'scenes' || evt === 'active' || evt === 'elements' || evt === 'reveal' || evt === 'sync') { renderDeck(); renderNowNext(); }
    if (evt === 'elements' || evt === 'active' || evt === 'scenes' || evt === 'reveal' || evt === 'sync') window.Draw && window.Draw.render();
    if (evt === 'scenes' || evt === 'active' || evt === 'mode' || evt === 'sync') renderLowerThird();
    if (evt === 'broadcast' || evt === 'sync') { renderBroadcast(); applyTour(); applyAnim(); renderSpotlight(); }
    if (evt === 'active') { const s = S.activeScene(); if (s) M.flyToView(s.view, s.transition); }
    if (evt === 'mapstyle' || evt === 'sync') M.setStyle(S.state.mapStyle);
  });

  /* ---------- keyboard ---------- */
  window.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    const D = window.Draw;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? S.redo() : S.undo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); S.redo(); return; }
    if (e.key === '?') { e.preventDefault(); window.__help && window.__help(); return; }
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
  applyTilt();
  renderBroadcast();
  applyTour();
  applyAnim();
  renderSpotlight();
  window.Theme && window.Theme.apply(S.cfg().style);
  M.setStyle(S.state.mapStyle);
  if (!S.scenes().length) S.addScene(M.currentView(), { title: 'Opening Scene' });
  else { renderDeck(); renderNowNext(); const a = S.activeScene(); if (a) M.flyToView(a.view, { type: 'cut' }); }
  window.Draw && window.Draw.render();

  window.__app = { map: M.map, store: S, draw: window.Draw, theme: window.Theme };
  console.log('[news-map v3] ready');
})();
