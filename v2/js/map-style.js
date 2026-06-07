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

  const qbar = document.querySelector('.qtools');
  const inBar = !!qbar;
  // In the vertical tool bar it's an icon-only button; otherwise the old top-right pill.
  const btn = inBar ? h('button', 'qtool', I.layers)
                    : h('button', 'mapstyle', `${I.layers}<span class="mapstyle__cur"></span>`);
  const pop = h('div', 'mapstyle-pop'); pop.hidden = true;
  if (inBar) { qbar.insertBefore(h('div', 'qtools__sep'), qbar.firstChild); qbar.insertBefore(btn, qbar.firstChild); document.body.append(pop); }
  else { document.body.append(btn, pop); if (isControl) { btn.style.right = '70px'; pop.style.right = '70px'; } }   // clear the settings gear

  const styleName = () => { const m = S.cfg().mapStyles.find(x => x.id === S.state.mapStyle); return m ? m.name : S.state.mapStyle; };

  // anchor the popup beside the bar button (it lives on the left edge)
  function place() { if (!inBar) return; const r = btn.getBoundingClientRect(); pop.style.left = (r.right + 8) + 'px'; pop.style.right = 'auto'; pop.style.top = Math.max(12, Math.min(r.top, window.innerHeight - pop.offsetHeight - 12)) + 'px'; }

  function applyPerm() { btn.hidden = !isControl && S.cfg().permissions.canChangeMapStyle === false; }
  function build() {
    pop.innerHTML = '';
    S.cfg().mapStyles.filter(m => m.on !== false).forEach(m => {
      const it = h('button', 'mapstyle-pop__i' + (m.id === S.state.mapStyle ? ' is-on' : ''), m.name);
      it.onclick = () => { S.setMapStyle(m.id); pop.hidden = true; };
      pop.appendChild(it);
    });
  }
  function refresh() { const cur = btn.querySelector('.mapstyle__cur'); if (cur) cur.textContent = styleName(); btn.title = 'Base map · ' + styleName(); applyPerm(); if (!pop.hidden) { build(); place(); } }

  btn.onclick = e => { e.stopPropagation(); if (pop.hidden) { build(); pop.hidden = false; place(); } else pop.hidden = true; };
  document.addEventListener('click', e => { if (!pop.contains(e.target) && !btn.contains(e.target)) pop.hidden = true; });
  S.on((st, evt) => { if (evt === 'mapstyle' || evt === 'config' || evt === 'sync') refresh(); });
  refresh();
})();
