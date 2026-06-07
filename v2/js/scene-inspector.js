/* ============================================================
   SCENE INSPECTOR — build-mode editor for the active scene:
   title, sequential-reveal toggle, transition, lower-third.
   Shown in PREP mode only; in the presenter it also requires
   permissions.canEditScenes. Edits the shared scene -> sync live.
   ============================================================ */
(() => {
  const S = window.Store, I = window.ICONS;
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
  const isControl = window.APP_ROLE === 'control';

  const panel = h('div', 'sceneins glass'); panel.hidden = true; document.body.appendChild(panel);
  let builtFor = null;   // scene id currently rendered (avoid clobbering focused inputs)

  const canEdit = () => isControl || S.cfg().permissions.canEditScenes !== false;
  const field = (label, ...els) => { const f = h('div', 'sceneins__f'); f.appendChild(h('div', 'sceneins__lab', label)); els.forEach(e => f.appendChild(e)); return f; };

  function build(s) {
    panel.innerHTML = '';
    panel.appendChild(h('div', 'sceneins__hd', `${I.film}<span>SCENE SETTINGS</span>`));

    const t = h('input', 'sceneins__in'); t.value = s.title; t.placeholder = 'Scene title';
    t.oninput = () => S.renameScene(s.id, t.value);
    panel.appendChild(field('Title', t));

    const upd = h('button', 'sceneins__btn', `${I.target || ''}<span>Update view to current</span>`);
    upd.onclick = () => { S.setSceneView(s.id, window.GameMap.currentView()); window.UI && UI.toast('Scene view updated'); };
    panel.appendChild(upd);

    // reveal toggle (self-updating, no rebuild)
    const rev = h('div', 'tog' + (s.reveal ? ' on' : ''));
    rev.onclick = () => { rev.classList.toggle('on'); S.toggleSceneReveal(s.id); };
    const revRow = h('div', 'sceneins__row'); revRow.append(h('div', 'sceneins__rlab', `Sequential reveal <small>${s.elements.length} elements</small>`), rev);
    panel.appendChild(revRow);

    const sel = h('select', 'sceneins__sel');
    [['flyTo', 'Fly to'], ['cut', 'Cut'], ['ease', 'Ease']].forEach(([v, l]) => { const o = h('option', null, l); o.value = v; if (s.transition && s.transition.type === v) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => S.setTransition(s.id, { type: sel.value, duration: 1.2 });
    panel.appendChild(field('Transition', sel));

    const ltt = h('input', 'sceneins__in'); ltt.placeholder = 'Lower-third title'; ltt.value = (s.lowerThird && s.lowerThird.title) || '';
    const lts = h('input', 'sceneins__in'); lts.placeholder = 'Subtitle'; lts.value = (s.lowerThird && s.lowerThird.subtitle) || '';
    const save = () => { const title = ltt.value.trim(), subtitle = lts.value.trim(); S.setLowerThird(s.id, (title || subtitle) ? { title, subtitle } : null); };
    ltt.oninput = save; lts.oninput = save;
    panel.appendChild(field('Lower third', ltt, lts));
  }

  function render() {
    const s = S.activeScene();
    const show = S.state.mode === 'build' && s && canEdit();
    if (!show) { panel.hidden = true; builtFor = null; return; }
    panel.hidden = false;
    if (builtFor !== s.id) { builtFor = s.id; build(s); }   // rebuild only on scene change
  }

  S.on((st, evt) => {
    if (evt === 'mode' || evt === 'active' || evt === 'config' || evt === 'sync') render();
    if (evt === 'sync' && builtFor) { const s = S.activeScene(); const f = document.activeElement; if (s && s.id === builtFor && !(f && panel.contains(f))) build(s); }  // mirror remote edits unless typing
  });
  render();
})();
