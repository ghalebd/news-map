// ============================================================
// NEWS MAP v2.0 FEATURES MODULE
// Undo/Redo · Text tool · Motion path (auto-bearing) ·
// Spotlight mode · Logo bug placement
// ============================================================
(function() {
'use strict';

function whenReady(cb) {
  if (typeof map !== 'undefined' && map && typeof features !== 'undefined') cb();
  else setTimeout(() => whenReady(cb), 300);
}

whenReady(function() {

// ============================================================
// 1. UNDO / REDO (full stack)
// ============================================================
const redoStack = [];

// Wrap removeFeature so deletions become undoable
const _origRemoveFeature = window.removeFeature || removeFeature;
window.removeFeature = function(f) {
  // record geometry for restore
  history.push({ action: 'remove', feature: f, layer: f });
  _origRemoveFeature(f);
};

window.__v2Undo = function() {
  const last = history.pop();
  if (!last) return;
  if (last.action === 'add') {
    map.removeLayer(last.feature);
    const i = features.indexOf(last.feature);
    if (i > -1) features.splice(i, 1);
    redoStack.push({ action: 'add', feature: last.feature });
  } else if (last.action === 'remove') {
    last.feature.addTo(map);
    features.push(last.feature);
    redoStack.push({ action: 'remove', feature: last.feature });
  }
  updateUndoRedoButtons();
};
window.undoLast = window.__v2Undo;

window.redoLast = function() {
  const item = redoStack.pop();
  if (!item) return;
  if (item.action === 'add') {
    item.feature.addTo(map);
    features.push(item.feature);
    history.push({ action: 'add', feature: item.feature });
  } else if (item.action === 'remove') {
    map.removeLayer(item.feature);
    const i = features.indexOf(item.feature);
    if (i > -1) features.splice(i, 1);
    history.push({ action: 'remove', feature: item.feature });
  }
  updateUndoRedoButtons();
};

// Clear redo whenever a NEW feature is added (any history.push of 'add' not from redo)
const _origPush = history.push.bind(history);
history.push = function(item) {
  if (item && item.action === 'add' && !item.__fromRedo) {
    redoStack.length = 0;
  }
  return _origPush(item);
};

function updateUndoRedoButtons() {
  const u = document.getElementById('v2UndoBtn');
  const r = document.getElementById('v2RedoBtn');
  if (u) u.style.opacity = history.length ? '1' : '0.4';
  if (r) r.style.opacity = redoStack.length ? '1' : '0.4';
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault(); window.undoLast();
  } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault(); window.redoLast();
  }
});

console.log('[v2] Undo/Redo ready');


// (Text tool removed — using existing native textlabel tool instead)


// ============================================================
// 3. MOTION PATH with AUTO-BEARING
// Draw a path; the chosen asset is placed along it, auto-rotated
// to face the direction of travel, and animates along the path.
// ============================================================
let pathMode = false;
let pathPoints = [];
let pathPreview = null;

function bearingDeg(from, to) {
  // Screen-space bearing using container points (so icon visually faces travel)
  const p1 = map.latLngToContainerPoint(from);
  const p2 = map.latLngToContainerPoint(to);
  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
  // Asset icons point "up" by default → offset by 90°
  return ang + 90;
}

window.startMotionPath = function() {
  if (!selectedAssetType) {
    alert('Select an asset first (from the asset palette), then draw its path.');
    return;
  }
  pathMode = true;
  pathPoints = [];
  if (typeof setTool === 'function') setTool('pan');
  map.getContainer().style.cursor = 'crosshair';
  const btn = document.getElementById('v2PathBtn');
  if (btn) { btn.classList.add('is-on'); btn.textContent = '✓ Click points · dbl=finish'; }
};

map.on('click', function(e) {
  if (!pathMode) return;
  pathPoints.push(e.latlng);
  if (pathPreview) map.removeLayer(pathPreview);
  pathPreview = L.polyline(pathPoints, {
    color: currentColor || '#00b8d4', weight: 3, dashArray: '8 6', opacity: 0.9
  }).addTo(map);
});

map.on('dblclick', function(e) {
  if (!pathMode) return;
  L.DomEvent.stop(e);
  finishMotionPath();
});

function finishMotionPath() {
  pathMode = false;
  map.getContainer().style.cursor = '';
  const btn = document.getElementById('v2PathBtn');
  if (btn) { btn.classList.remove('is-on'); btn.textContent = '✈ Draw Motion Path'; }

  if (pathPoints.length < 2) {
    if (pathPreview) { map.removeLayer(pathPreview); pathPreview = null; }
    pathPoints = [];
    return;
  }

  // Keep the path line as a feature
  const pathLine = L.polyline(pathPoints, {
    color: currentColor || '#00b8d4', weight: 2.5, opacity: 0.7
  }).addTo(map);
  pathLine.options.featureType = 'motionpath';
  pathLine.on('click', function() { if (currentTool === 'erase') window.removeFeature(pathLine); });
  features.push(pathLine);
  history.push({ action: 'add', feature: pathLine });

  if (pathPreview) { map.removeLayer(pathPreview); pathPreview = null; }

  // Place the asset at start, facing first segment
  const startBearing = bearingDeg(pathPoints[0], pathPoints[1]);
  const assetType = selectedAssetType;
  const m = L.marker(pathPoints[0], {
    icon: createAssetIcon(assetType, startBearing), draggable: false
  }).addTo(map);
  m.options.featureType = 'asset';
  m.options.assetType = assetType;
  m.options.assetRotation = startBearing;
  m.on('click', function(ev) {
    L.DomEvent.stopPropagation(ev);
    if (currentTool === 'erase') window.removeFeature(m);
  });
  features.push(m);
  history.push({ action: 'add', feature: m });

  animateAlongPath(m, pathPoints);
  pathPoints = [];
}

function animateAlongPath(marker, pts) {
  // Build cumulative distances for constant-speed travel
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = map.distance(pts[i], pts[i + 1]);
    segs.push({ from: pts[i], to: pts[i + 1], dist: d, acc: total });
    total += d;
  }
  if (total === 0) return;

  const speed = 0.06; // fraction of path per second baseline
  const duration = Math.max(3000, total / 800 * 1000); // ms, scales with length
  let startT = null;

  function frame(ts) {
    if (!startT) startT = ts;
    const elapsed = ts - startT;
    let prog = Math.min(1, elapsed / duration);
    const target = prog * total;

    // Find current segment
    let seg = segs[segs.length - 1];
    for (let i = 0; i < segs.length; i++) {
      if (target <= segs[i].acc + segs[i].dist) { seg = segs[i]; break; }
    }
    const segProg = seg.dist ? (target - seg.acc) / seg.dist : 1;
    const lat = seg.from.lat + (seg.to.lat - seg.from.lat) * segProg;
    const lng = seg.from.lng + (seg.to.lng - seg.from.lng) * segProg;
    marker.setLatLng([lat, lng]);

    // Auto-bearing: face direction of current segment
    const b = bearingDeg(seg.from, seg.to);
    marker.options.assetRotation = b;
    if (marker._icon) {
      const w = marker._icon.querySelector('.asset-wrapper');
      if (w) w.style.transform = 'rotate(' + b + 'deg)';
    }

    if (prog < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

console.log('[v2] Motion path ready');


// ============================================================
// 4. SPOTLIGHT MODE — dim everything except a circle that
// follows the cursor; click to lock/unlock position
// ============================================================
let spotlightOn = false;
let spotlightLocked = false;
let spotlightEl = null;
let spotlightPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let spotlightRadius = 180;

function ensureSpotlightEl() {
  if (spotlightEl) return;
  spotlightEl = document.createElement('div');
  spotlightEl.id = 'v2Spotlight';
  spotlightEl.style.cssText =
    'position:fixed;inset:0;z-index:1200;pointer-events:none;display:none;' +
    'transition:background 0.05s;';
  document.body.appendChild(spotlightEl);
}

function updateSpotlight() {
  if (!spotlightEl) return;
  const r = spotlightRadius;
  spotlightEl.style.background =
    'radial-gradient(circle ' + r + 'px at ' + spotlightPos.x + 'px ' + spotlightPos.y + 'px,' +
    ' rgba(0,0,0,0) 0%, rgba(0,0,0,0) ' + (r - 30) + 'px,' +
    ' rgba(0,0,0,0.72) ' + (r + 10) + 'px, rgba(0,0,0,0.82) 100%)';
}

window.toggleSpotlight = function(btn) {
  ensureSpotlightEl();
  spotlightOn = !spotlightOn;
  spotlightEl.style.display = spotlightOn ? 'block' : 'none';
  if (btn) btn.classList.toggle('is-on', spotlightOn);
  if (spotlightOn) updateSpotlight();
};

document.addEventListener('mousemove', function(e) {
  if (!spotlightOn || spotlightLocked) return;
  spotlightPos = { x: e.clientX, y: e.clientY };
  updateSpotlight();
});

// Wheel adjusts radius when spotlight active and Alt held
document.addEventListener('wheel', function(e) {
  if (!spotlightOn || !e.altKey) return;
  e.preventDefault();
  spotlightRadius = Math.max(60, Math.min(500, spotlightRadius - e.deltaY * 0.3));
  updateSpotlight();
}, { passive: false });

console.log('[v2] Spotlight ready');


// ============================================================
// 5. LOGO BUG PLACEMENT — corner logo overlay
// ============================================================
let logoBugEl = null;
const logoCorners = ['top-left','top-right','bottom-left','bottom-right'];
let logoCornerIdx = 1;

window.toggleLogoBug = function(btn) {
  if (!logoBugEl) {
    logoBugEl = document.createElement('img');
    logoBugEl.id = 'v2LogoBug';
    logoBugEl.src = 'live_assets/aljazeera_logo.png';
    logoBugEl.style.cssText =
      'position:fixed;z-index:1300;height:42px;width:auto;opacity:0.92;' +
      'pointer-events:none;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6));display:none;';
    document.body.appendChild(logoBugEl);
    positionLogoBug();
  }
  const showing = logoBugEl.style.display !== 'none';
  logoBugEl.style.display = showing ? 'none' : 'block';
  if (btn) btn.classList.toggle('is-on', !showing);
};

window.cycleLogoCorner = function() {
  logoCornerIdx = (logoCornerIdx + 1) % logoCorners.length;
  positionLogoBug();
};

function positionLogoBug() {
  if (!logoBugEl) return;
  const corner = logoCorners[logoCornerIdx];
  logoBugEl.style.top = logoBugEl.style.bottom = logoBugEl.style.left = logoBugEl.style.right = 'auto';
  const pad = '16px';
  if (corner === 'top-left') { logoBugEl.style.top = '60px'; logoBugEl.style.left = pad; }
  else if (corner === 'top-right') { logoBugEl.style.top = '60px'; logoBugEl.style.right = pad; }
  else if (corner === 'bottom-left') { logoBugEl.style.bottom = pad; logoBugEl.style.left = pad; }
  else { logoBugEl.style.bottom = '70px'; logoBugEl.style.right = pad; }
}

console.log('[v2] Logo bug ready');


// ============================================================
// Build the v2 control panel (floating, draggable)
// ============================================================
function buildV2Panel() {
  const panel = document.createElement('div');
  panel.id = 'v2Panel';
  panel.innerHTML =
    '<div class="v2-head">⚙ Studio Tools v2</div>' +
    '<div class="v2-section">' +
      '<div class="v2-row">' +
        '<button id="v2UndoBtn" class="v2-btn" title="Undo (Ctrl+Z)">↶ Undo</button>' +
        '<button id="v2RedoBtn" class="v2-btn" title="Redo (Ctrl+Y)">↷ Redo</button>' +
      '</div>' +
    '</div>' +
    
    '<div class="v2-section">' +
      '<div class="v2-label">MOTION PATH</div>' +
      '<button id="v2PathBtn" class="v2-btn v2-wide">✈ Draw Motion Path</button>' +
      '<div class="v2-hint">Select an asset, then draw. Auto-rotates to face travel.</div>' +
    '</div>' +
    '<div class="v2-section">' +
      '<div class="v2-row">' +
        '<button id="v2SpotBtn" class="v2-btn" title="Spotlight (Alt+wheel = size)">◉ Spotlight</button>' +
        '<button id="v2LogoBtn" class="v2-btn" title="Toggle logo">▣ Logo</button>' +
        '<button id="v2LogoCornerBtn" class="v2-btn v2-small" title="Move logo corner">⟳</button>' +
      '</div>' +
    '</div>' +
    '<div class="v2-section">' +
      '<div class="v2-label">RANGE RING</div>' +
      '<button id="v2RingBtn" class="v2-btn v2-wide" title="Click map, enter radius in km">⊕ Draw Range Ring</button>' +
      '<div class="v2-hint">Click on map, then enter radius in km.</div>' +
    '</div>' +
    '<div class="v2-section">' +
      '<div class="v2-label">SESSION</div>' +
      '<div class="v2-row">' +
        '<button id="v2AutoSaveBtn" class="v2-btn" title="Auto-save to browser every 10s">⟳ Auto-save</button>' +
        '<button id="v2RestoreBtn" class="v2-btn" title="Restore last auto-save">↺ Restore</button>' +
      '</div>' +
    '</div>' +
    '<div class="v2-section">' +
      '<div class="v2-label">PRESETS</div>' +
      '<button id="v2SavePresetBtn" class="v2-btn v2-wide" title="Save current map as a preset">★ Save Preset</button>' +
      '<div id="v2PresetList" class="v2-preset-list"></div>' +
    '</div>';
  document.body.appendChild(panel);

  // Wire buttons
  document.getElementById('v2UndoBtn').onclick = window.undoLast;
  document.getElementById('v2RedoBtn').onclick = window.redoLast;
  document.getElementById('v2PathBtn').onclick = window.startMotionPath;
  document.getElementById('v2SpotBtn').onclick = function() { window.toggleSpotlight(this); };
  document.getElementById('v2LogoBtn').onclick = function() { window.toggleLogoBug(this); };
  document.getElementById('v2LogoCornerBtn').onclick = window.cycleLogoCorner;
  document.getElementById('v2RingBtn').onclick = function() { window.startRangeRing(this); };
  document.getElementById('v2AutoSaveBtn').onclick = function() { window.toggleAutoSave(this); };
  document.getElementById('v2RestoreBtn').onclick = window.restoreAutoSave;
  document.getElementById('v2SavePresetBtn').onclick = window.savePreset;
  if (window.__refreshPresetList) setTimeout(window.__refreshPresetList, 500);

  updateUndoRedoButtons();
  makeDraggable(panel, panel.querySelector('.v2-head'));

  // Prevent map interaction when using panel
  if (typeof L !== 'undefined' && L.DomEvent) {
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
  }
}

function makeDraggable(el, handle) {
  let dragging = false, ox = 0, oy = 0;
  handle.style.cursor = 'move';
  handle.addEventListener('pointerdown', function(e) {
    dragging = true;
    const r = el.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', function(e) {
    if (!dragging) return;
    el.style.left = (e.clientX - ox) + 'px';
    el.style.top = (e.clientY - oy) + 'px';
    el.style.right = 'auto';
  });
  handle.addEventListener('pointerup', function(e) {
    dragging = false;
    try { handle.releasePointerCapture(e.pointerId); } catch(err) {}
  });
}

buildV2Panel();
console.log('[v2] All features loaded ✓');

}); // whenReady
})();


// ============================================================
// v2.1 — ZOOM-AWARE ASSET SIZING + UI CLEANUP
// ============================================================
(function() {
'use strict';
function ready(cb){ if(typeof map!=='undefined'&&map) cb(); else setTimeout(()=>ready(cb),300); }
ready(function(){

  // ---- Zoom-aware sizing: assets scale with map zoom ----
  // At reference zoom they're 1.0; smaller when zoomed out, bigger when zoomed in (clamped)
  const REF_ZOOM = 6;
  function updateAssetScale() {
    const z = map.getZoom();
    // scale grows ~12% per zoom level, clamped 0.45–1.8
    let scale = Math.pow(1.12, z - REF_ZOOM);
    scale = Math.max(0.45, Math.min(1.8, scale));
    document.documentElement.style.setProperty('--zoom-scale', scale.toFixed(3));
  }
  map.on('zoom zoomend', updateAssetScale);
  updateAssetScale();
  console.log('[v2.1] Zoom-aware asset sizing ready');

  // ---- Map background already dark (#0a0e1a) so loading tiles blend in ----
  // Force leaflet tile container to inherit dark bg (no white flash)
  const style = document.createElement('style');
  style.textContent = '.leaflet-tile-container { background: #0a0e1a; } ' +
    '.leaflet-tile { will-change: transform; }';
  document.head.appendChild(style);
  console.log('[v2.1] Tile loading blend ready');

});
})();


// ============================================================
// v2.2 — RANGE RINGS · ROTATION SNAP · AUTO-SAVE · PRESETS
// ============================================================
(function() {
'use strict';
function ready(cb){ if(typeof map!=='undefined'&&map&&typeof features!=='undefined') cb(); else setTimeout(()=>ready(cb),300); }
ready(function(){

  // ========================================================
  // A. RANGE RINGS — circle with a specified radius in km
  // ========================================================
  let ringMode = false;
  window.startRangeRing = function(btn) {
    ringMode = !ringMode;
    if (btn) btn.classList.toggle('is-on', ringMode);
    map.getContainer().style.cursor = ringMode ? 'crosshair' : '';
    if (typeof setTool === 'function' && ringMode) setTool('pan');
  };

  map.on('click', function(e) {
    if (!ringMode) return;
    const kmStr = prompt('Ring radius in kilometers (e.g. 50, 100, 300):', '100');
    if (kmStr === null) return;
    const km = parseFloat(kmStr);
    if (isNaN(km) || km <= 0) return;
    const color = (window.currentColor) || '#00b8d4';
    const ring = L.circle(e.latlng, {
      radius: km * 1000,
      color: color, weight: 2.5, fillColor: color, fillOpacity: 0.08,
      dashArray: '6 6'
    }).addTo(map);
    ring.options.featureType = 'rangering';
    // Label showing the radius
    const lbl = L.marker(e.latlng, {
      icon: L.divIcon({
        className: 'range-ring-label',
        html: '<div style="background:rgba(15,18,30,0.9);color:'+color+';padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;font-family:Inter,sans-serif;white-space:nowrap;border:1px solid '+color+';">⊕ '+km+' km</div>',
        iconAnchor: [0, 0]
      }),
      interactive: false
    }).addTo(map);
    ring._label = lbl;
    ring.on('click', function(){ if (window.currentTool === 'erase') { map.removeLayer(lbl); window.removeFeature(ring); } });
    features.push(ring); history.push({ action: 'add', feature: ring });
    features.push(lbl); history.push({ action: 'add', feature: lbl });
  });
  console.log('[v2.2] Range rings ready');

  // ========================================================
  // B. ROTATION SNAP — snap asset rotation to 15/30/45/90
  //    Hold Shift while using slider to free-rotate
  // ========================================================
  const rotSlider = document.getElementById('assetRotSlider');
  if (rotSlider) {
    let snapEnabled = true;
    // Add a snap toggle near the slider
    rotSlider.addEventListener('input', function(e) {
      if (!snapEnabled || e.shiftKey) return;
      let v = parseInt(rotSlider.value, 10);
      const snapped = Math.round(v / 15) * 15;  // snap to 15° increments
      if (snapped !== v) {
        rotSlider.value = snapped;
        const valEl = document.getElementById('assetRotValue');
        if (valEl) valEl.textContent = snapped + '°';
        // Trigger rotation update
        rotSlider.dispatchEvent(new Event('input', { bubbles: false, __snapped: true }));
      }
    }, true);  // capture phase to snap before the main handler
    console.log('[v2.2] Rotation snap (15°) ready — hold Shift for free rotate');
  }

  // ========================================================
  // C. AUTO-SAVE to localStorage (optional, toggleable)
  // ========================================================
  const AUTOSAVE_KEY = 'newsmap_autosave_v1';
  const AUTOSAVE_ENABLED_KEY = 'newsmap_autosave_enabled';
  let autoSaveEnabled = localStorage.getItem(AUTOSAVE_ENABLED_KEY) === 'true';

  function doAutoSave() {
    if (!autoSaveEnabled) return;
    try {
      if (typeof serializeState === 'function') {
        const state = serializeState();
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
      }
    } catch(e) { console.warn('autosave failed', e); }
  }
  // Auto-save every 10 seconds when enabled
  setInterval(doAutoSave, 10000);
  // Also save on feature changes
  map.on('moveend', doAutoSave);

  window.toggleAutoSave = function(btn) {
    autoSaveEnabled = !autoSaveEnabled;
    localStorage.setItem(AUTOSAVE_ENABLED_KEY, autoSaveEnabled ? 'true' : 'false');
    if (btn) btn.classList.toggle('is-on', autoSaveEnabled);
    if (autoSaveEnabled) { doAutoSave(); }
  };

  window.restoreAutoSave = function() {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) { alert('No auto-saved map found.'); return; }
      if (typeof loadState === 'function') {
        loadState(JSON.parse(saved));
      }
    } catch(e) { alert('Restore failed: ' + e.message); }
  };
  console.log('[v2.2] Auto-save ready (enabled: ' + autoSaveEnabled + ')');

  // ========================================================
  // D. PRESETS — save/load named scenarios in localStorage
  // ========================================================
  const PRESETS_KEY = 'newsmap_presets_v1';
  function getPresets() {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}'); }
    catch(e) { return {}; }
  }
  function savePresets(p) { localStorage.setItem(PRESETS_KEY, JSON.stringify(p)); }

  window.savePreset = function() {
    const name = prompt('Save current map as preset — enter a name:');
    if (!name) return;
    if (typeof serializeState !== 'function') { alert('Cannot serialize.'); return; }
    const presets = getPresets();
    const state = serializeState();
    if (window.storyboard && window.storyboard.steps && window.storyboard.steps.length) {
      state.storyboard = { currentStep: window.storyboard.current, steps: window.storyboard.steps };
    }
    presets[name] = { saved: Date.now(), state: state };
    savePresets(presets);
    refreshPresetList();
    alert('✓ Preset "' + name + '" saved');
  };

  window.loadPreset = function(name) {
    const presets = getPresets();
    if (!presets[name]) return;
    if (typeof loadState === 'function') loadState(presets[name].state);
  };

  window.deletePreset = function(name) {
    const presets = getPresets();
    delete presets[name];
    savePresets(presets);
    refreshPresetList();
  };

  function refreshPresetList() {
    const list = document.getElementById('v2PresetList');
    if (!list) return;
    const presets = getPresets();
    const names = Object.keys(presets);
    if (names.length === 0) {
      list.innerHTML = '<div class="v2-hint">No presets saved yet.</div>';
      return;
    }
    list.innerHTML = names.map(function(n) {
      return '<div class="v2-preset-item">' +
        '<span class="v2-preset-name" onclick="window.loadPreset(\'' + n.replace(/'/g,"\\'") + '\')">' + n + '</span>' +
        '<button class="v2-preset-del" onclick="window.deletePreset(\'' + n.replace(/'/g,"\\'") + '\')">✕</button>' +
        '</div>';
    }).join('');
  }
  window.__refreshPresetList = refreshPresetList;
  console.log('[v2.2] Presets ready');

});
})();
