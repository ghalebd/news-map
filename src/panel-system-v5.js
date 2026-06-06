/* ============================================================
   ICON REPLACER + PANEL SYSTEM v5
   1. Replace all emoji with pro SVG icons
   2. Collapsed panel = small icon-only square
   3. Auto edge-snap + constrained drag along edges
   4. No panel-in-panel (collision prevention)
   ============================================================ */
(function() {
'use strict';
function ready(cb){ if(typeof map!=='undefined'&&map&&window.svgIcon) cb(); else setTimeout(()=>ready(cb),250); }

ready(function() {
  setTimeout(function(){
    replaceEmojiIcons();
    console.log('[v5] Pro icons applied');
  }, 1100);

  function setIcon(el, name, size) {
    if (!el) return;
    const ic = window.svgIcon(name, size || 18);
    if (ic) el.innerHTML = ic;
  }

  function replaceEmojiIcons() {
    // --- Map style layer icons ---
    const layerMap = {
      'newsv2':'news','marine_dark':'marine','satellite':'satellite','terrain':'terrain',
      'topographic':'topo','basic_dark':'dark','toner':'toner','streets_dark':'streets',
      'hybrid':'hybrid','dataviz_dark':'dataviz','positron_dark':'positron',
      'bright_dark':'bright','satellite_hd':'satellite'
    };
    document.querySelectorAll('.layer-btn').forEach(function(btn){
      const layer = btn.dataset.layer;
      const iconName = layerMap[layer];
      if (!iconName) return;
      let iconEl = btn.querySelector('.layer-icon, .layer-emoji');
      if (iconEl) setIcon(iconEl, iconName, 18);
    });

    // --- Label toggles ---
    const labelMap = { 'countries':'globe','capitals':'star','cities':'pin' };
    document.querySelectorAll('.label-toggle').forEach(function(btn){
      const k = btn.dataset.labels;
      const iconEl = btn.querySelector('.toggle-icon');
      if (iconEl && labelMap[k]) setIcon(iconEl, labelMap[k], 16);
    });

    // --- Live tracking buttons ---
    const ships = document.getElementById('shipsToggleBtn');
    const flights = document.getElementById('flightsToggleBtn');
    if (ships) { const i=ships.querySelector('.ltp-icon'); if(i) setIcon(i,'ship',16); }
    if (flights) { const i=flights.querySelector('.ltp-icon'); if(i) setIcon(i,'plane',16); }

    // --- Top bar buttons (emoji prefix → icon) ---
    replaceBtnEmoji('saveBtn', 'save', 'Save');
    replaceBtnEmoji('loadBtn', 'load', 'Load');
    replaceBtnEmoji('undoBtn', 'undo', '');
    replaceBtnEmoji('clearAllBtn', 'trash', '');
    replaceBtnEmoji('hideUIBtn', 'hideui', 'Hide UI');
    replaceBtnEmoji('presenterBtn', 'play', 'Presenter');

    // --- Studio panel buttons (text-based, prepend icon) ---
    studioBtnIcon('v2UndoBtn','undo'); studioBtnIcon('v2RedoBtn','redo');
    studioBtnIcon('v2PathBtn','motionpath'); studioBtnIcon('v2SpotBtn','spotlight');
    studioBtnIcon('v2LogoBtn','logo'); studioBtnIcon('v2RingBtn','rangering');
    studioBtnIcon('v2AutoSaveBtn','autosave'); studioBtnIcon('v2RestoreBtn','restore');
    studioBtnIcon('v2SavePresetBtn','preset');

    // --- Presenter bar prev/next/play (data-pb) ---
    document.querySelectorAll('[data-pb]').forEach(function(btn){
      const k=btn.dataset.pb;
      const m={'prev':'prev','next':'next','play':'play','pause':'play','zoom-in':'zoomin','zoom-out':'zoomout','home':'home'};
      if(m[k]&&!btn.querySelector('svg')) btn.innerHTML=window.svgIcon(m[k],16);
    });
    // --- Presenter dock prev/next (data-pt) ---
    document.querySelectorAll('[data-pt]').forEach(function(btn){
      const k=btn.dataset.pt;
      if(k==='prev'){btn.innerHTML=window.svgIcon('prev',14)+' <span>Prev</span>';btn.style.gap='5px';}
      else if(k==='next'){btn.innerHTML='<span>Next</span> '+window.svgIcon('next',14);btn.style.gap='5px';}
    });
    // --- Play buttons (text "▶ Play") ---
    ['animPlay'].forEach(function(id){
      const b=document.getElementById(id);
      if(b&&!b.querySelector('svg')){const t=b.textContent.replace(/^[^\w]+/,'').trim();b.innerHTML=window.svgIcon('play',14)+' <span>'+t+'</span>';b.style.gap='5px';}
    });
    // --- Delete buttons (🗑 Delete) ---
    ['deleteMarker','assetDelete'].forEach(function(id){
      const b=document.getElementById(id);
      if(b&&!b.querySelector('svg')){const t=b.textContent.replace(/^[^\w]+/,'').trim();b.innerHTML=window.svgIcon('trash',14)+' <span>'+t+'</span>';b.style.gap='5px';}
    });

    // --- Remaining visible emoji ---
    document.querySelectorAll('.pt-btn').forEach(function(b){
      const t=b.textContent.trim();
      if(t.indexOf('\u{1F441}')>=0||/👁/.test(b.innerHTML)){b.innerHTML=window.svgIcon('eye',14)+' <span>'+t.replace(/[^\w ]/g,'').trim()+'</span>';b.style.gap='5px';}
    });
    // touch mode button (✋)
    document.querySelectorAll('button,div').forEach(function(b){
      if(b.children.length===0){
        if(b.textContent.trim()==='\u270B'){b.innerHTML=window.svgIcon('touch',16);}
      }
    });
    // Scenario (📋), storyboard title (🎬), storyboard prev/next
    document.querySelectorAll('.top-bar-btn').forEach(function(b){
      if(/📋/.test(b.innerHTML)){b.innerHTML=window.svgIcon('clipboard',15)+' <span>'+b.textContent.replace(/[^\w ]/g,'').trim()+'</span>';b.style.gap='6px';}
    });
    const stTitle=document.querySelector('.storyboard-title');
    if(stTitle&&/🎬/.test(stTitle.innerHTML)){stTitle.innerHTML=window.svgIcon('film',15)+' <span>'+stTitle.textContent.replace(/[^\w ]/g,'').trim()+'</span>';stTitle.style.display='inline-flex';stTitle.style.alignItems='center';stTitle.style.gap='6px';}
    document.querySelectorAll('.storyboard-btn').forEach(function(b){
      const t=b.textContent.trim();
      if(/◀/.test(t)){b.innerHTML=window.svgIcon('prev',13)+' <span>Prev</span>';b.style.gap='4px';}
      else if(/▶/.test(t)){b.innerHTML='<span>Next</span> '+window.svgIcon('next',13);b.style.gap='4px';}
    });
  }

  function replaceBtnEmoji(id, iconName, label) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.innerHTML = window.svgIcon(iconName, 16) + (label ? ' <span>'+label+'</span>' : '');
    btn.style.gap = '6px';
  }

  function studioBtnIcon(id, iconName) {
    const btn = document.getElementById(id);
    if (!btn) return;
    // Strip leading emoji/symbol, keep text
    let txt = btn.textContent.trim().replace(/^[^\w(]+\s*/, '');
    btn.innerHTML = window.svgIcon(iconName, 15) + ' <span>' + txt + '</span>';
    btn.style.gap = '6px';
  }
});
})();
