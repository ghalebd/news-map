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

window.undoLast = function() {
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


// ============================================================
// 2. TEXT TOOL — type text, click on map, box auto-expands to text
// ============================================================
let textPlacementActive = false;

function makeTextMarker(latlng, text, opts) {
  opts = opts || {};
  const bg = opts.bg || 'rgba(15,18,30,0.85)';
  const color = opts.color || '#ffffff';
  const fontSize = opts.fontSize || 15;
  const html = '<div class="v2-text-box" style="' +
    'background:' + bg + ';color:' + color + ';font-size:' + fontSize + 'px;' +
    'padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);' +
    'font-weight:600;white-space:nowrap;font-family:Inter,system-ui,sans-serif;' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.5);pointer-events:auto;' +
    'letter-spacing:0.3px;display:inline-block;">' +
    escapeHtml(text) + '</div>';
  const icon = L.divIcon({ className: 'v2-text-marker', html: html, iconSize: null, iconAnchor: [0, 0] });
  const m = L.marker(latlng, { icon: icon, draggable: true }).addTo(map);
  m.options.featureType = 'text';
  m.options.textContent = text;
  m.options.textStyle = opts;
  m.on('click', function(ev) {
    L.DomEvent.stopPropagation(ev);
    if (currentTool === 'erase') { window.removeFeature(m); return; }
    editTextMarker(m);
  });
  features.push(m);
  history.push({ action: 'add', feature: m });
  return m;
}

function editTextMarker(m) {
  const cur = m.options.textContent || '';
  const next = prompt('Edit text:', cur);
  if (next === null) return;
  if (next.trim() === '') { window.removeFeature(m); return; }
  m.options.textContent = next;
  const el = m._icon && m._icon.querySelector('.v2-text-box');
  if (el) el.textContent = next;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}

// Wire text input box + activate placement
function activateTextTool() {
  const input = document.getElementById('v2TextInput');
  const txt = (input && input.value.trim()) || '';
  if (!txt) {
    if (input) { input.focus(); input.placeholder = 'Type text first…'; }
    return;
  }
  textPlacementActive = true;
  if (typeof setTool === 'function') setTool('pan');
  map.getContainer().style.cursor = 'crosshair';
  const btn = document.getElementById('v2TextPlaceBtn');
  if (btn) { btn.classList.add('is-on'); btn.textContent = '✓ Click map'; }
}

map.on('click', function(e) {
  if (!textPlacementActive) return;
  const input = document.getElementById('v2TextInput');
  const txt = (input && input.value.trim()) || '';
  if (txt) {
    const colorEl = document.getElementById('v2TextColor');
    makeTextMarker(e.latlng, txt, {
      color: colorEl ? colorEl.value : '#ffffff',
      fontSize: parseInt((document.getElementById('v2TextSize') || {}).value || '15', 10)
    });
  }
  textPlacementActive = false;
  map.getContainer().style.cursor = '';
  if (input) input.value = '';
  const btn = document.getElementById('v2TextPlaceBtn');
  if (btn) { btn.classList.remove('is-on'); btn.textContent = '+ Click on Map'; }
});

console.log('[v2] Text tool ready');


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
      '<div class="v2-label">TEXT LABEL</div>' +
      '<input id="v2TextInput" class="v2-input" type="text" placeholder="Type place / event name…" maxlength="60">' +
      '<div class="v2-row">' +
        '<input id="v2TextColor" type="color" value="#ffffff" class="v2-color" title="Text color">' +
        '<input id="v2TextSize" type="number" value="15" min="10" max="40" class="v2-num" title="Font size">' +
        '<button id="v2TextPlaceBtn" class="v2-btn v2-accent">+ Click on Map</button>' +
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
    '</div>';
  document.body.appendChild(panel);

  // Wire buttons
  document.getElementById('v2UndoBtn').onclick = window.undoLast;
  document.getElementById('v2RedoBtn').onclick = window.redoLast;
  document.getElementById('v2TextPlaceBtn').onclick = activateTextTool;
  document.getElementById('v2PathBtn').onclick = window.startMotionPath;
  document.getElementById('v2SpotBtn').onclick = function() { window.toggleSpotlight(this); };
  document.getElementById('v2LogoBtn').onclick = function() { window.toggleLogoBug(this); };
  document.getElementById('v2LogoCornerBtn').onclick = window.cycleLogoCorner;

  // Enter key in text input = place mode
  document.getElementById('v2TextInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); activateTextTool(); }
  });

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
