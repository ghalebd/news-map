/* ============================================================
   MAP-STYLE — base-map switcher (both windows).
   Lists only the styles the operator enabled in config.mapStyles;
   the presenter sees it only when permissions.canChangeMapStyle.
   Switching syncs live across windows via Store.setMapStyle.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const isControl = window.APP_ROLE === 'control';

  const btn = h('button', 'mapstyle', `${I.layers}<span class="mapstyle__cur"></span>`); btn.title = 'Base map';
  const pop = h('div', 'mapstyle-pop'); pop.hidden = true;
  document.body.append(btn, pop);   // top-left (CSS); brand/gear sit on the right

  const styleName = () => { const m = S.cfg().mapStyles.find(x => x.id === S.state.mapStyle); return m ? m.name : S.state.mapStyle; };

  function applyPerm() { btn.hidden = !isControl && S.cfg().permissions.canChangeMapStyle === false; }
  function build() {
    pop.innerHTML = '';
    S.cfg().mapStyles.filter(m => m.on !== false).forEach(m => {
      const it = h('button', 'mapstyle-pop__i' + (m.id === S.state.mapStyle ? ' is-on' : ''), m.name);
      it.onclick = () => { S.setMapStyle(m.id); pop.hidden = true; };
      pop.appendChild(it);
    });
  }
  function refresh() { btn.querySelector('.mapstyle__cur').textContent = styleName(); applyPerm(); if (!pop.hidden) build(); }

  btn.onclick = e => { e.stopPropagation(); if (pop.hidden) { build(); pop.hidden = false; } else pop.hidden = true; };
  document.addEventListener('click', e => { if (!pop.contains(e.target) && !btn.contains(e.target)) pop.hidden = true; });
  S.on((st, evt) => { if (evt === 'mapstyle' || evt === 'config' || evt === 'sync') refresh(); });
  refresh();
})();
