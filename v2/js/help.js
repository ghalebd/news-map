/* ============================================================
   HELP — a tiny "?" button you can drop anywhere. Click it to
   show a small popover explaining that tool/section. One shared
   popover; text lives in HELP keyed by the section/feature name.
   API: Help.dot(key[, textOverride]) -> <button>; Help.has(key).
   ============================================================ */
(() => {
  const HELP = {
    // identity / layout
    'Theme': 'The presenter look. Accent colour sets the highlight colour; the knobs tune glass blur, distortion, corner radius, saturation, sheen, shadow, brightness and the slight 3D tilt. Touch mode enlarges every control for on-air touch screens.',
    'Logo': 'Upload the channel logo and set its size and on-screen position. Shown on the presenter output.',
    'Presenter visibility': 'Show or hide each presenter element (brand, status, deck, mode switch, add button, tool bar, now/next, live tracking) without deleting it.',
    'Vertical tool bar': 'Reorder, show or hide the buttons of the left vertical tool bar. Drag the handle to reorder; the eye toggles a button on the bar.',
    'Panel size & position': 'Resize each on-screen panel (50–170%) and snap it to any of the 9 screen anchors, or centre it. Per-panel.',
    // permissions / tools
    'Allowed tools': 'Choose which drawing tools the presenter operator is allowed to use. Greyed = disabled.',
    'Presenter permissions': 'Master switches for what the presenter window may do: draw, navigate, edit scenes, change map style/theme, control live tracking.',
    'Drawing defaults': 'The default colour and line weight applied to new drawings.',
    // map
    'Active map type': 'The base map currently on air. Pick from the enabled styles.',
    'Enabled styles': 'Tick which map styles appear in the quick style switcher. Add new MapTiler style IDs here.',
    'Places & locator': 'Save camera bookmarks (click to fly there) and toggle the small inset locator map.',
    // tracking
    'Live ships & flights': 'Turn live ship (AIS) and flight feeds on/off, and their motion trails.',
    'Tracking style': 'Colours, line weight, opacity, heading vectors, history length and route lines for the live ship/flight markers.',
    // broadcast
    'Breaking banner': 'A full-width breaking-news banner on the presenter — toggle and set its text.',
    'News ticker': 'The scrolling headline strip — toggle, text and scroll speed.',
    'Lower-third style': 'Pick the lower-third name/title template (News, Breaking, Glass, Box, Minimal, Bold).',
    'Auto-tour': 'Automatically advance through scenes on a timer — toggle and set seconds per scene.',
    'Camera path': 'Record a series of camera views and replay them as a smooth fly-through. Capture adds the current view; Play runs the path.',
    'Spotlight': 'Dim the map except a circular highlight around a point — set centre, radius, feather and dim amount.',
    'Animation': 'Reveal scene elements one-by-one on a timer for a build-up effect.',
    // assets
    'Categories': 'Manage the categories used to file your uploaded 2D image assets.',
    'Upload image': 'Upload a 2D image (icon/badge) into a category; it then appears in the presenter Image tool.',
    'Library': 'Your uploaded 2D image assets. Delete any you no longer need.',
    'Project': 'Save/Load the whole project file, export the current frame as PNG/PDF, hide the UI for a clean grab, or clear the scene.',
    'Snapshots': 'Save and restore named snapshots of the current setup.',
    // overlays
    'Satellite overlays': 'Pin an image (satellite/aerial) onto real coordinates. Place it at the current view or by pasting Google coordinates; then nudge/scale, set opacity, and enable a before/after wipe.',
    'Wipe direction & position': 'For wipe-enabled overlays: choose vertical/horizontal/radial reveal and drag the slider for the reveal amount.',
    // 3D + models
    '3D terrain': 'Real 3D terrain (MapLibre). Enter/exit 3D, set terrain height exaggeration and camera pitch, and keep place names lying on the terrain.',
    '3D lighting': 'A directional sun that shades the terrain relief and lights the 3D models from one angle. Sun direction and height control the shadows; intensity/ambient the brightness; terrain relief the shading strength. Lower sun = longer, more dramatic shadows.',
    '3D model library': 'Built-in, broadcast-optimised 3D military models. Filter by category and click one to drop it at the map centre — it then auto-selects in the control HUD. Sizes are sensible per type.',
    'Upload your own GLB': 'Add your own model. GLB is best (single file, compressed). Dropped at the current map centre.',
    'Placed models': 'Every model on the map. Per model: Control on the map (live HUD), fly to it, show/hide, delete, size, rotation, height, which maps it shows on, Solid/Wireframe style, exact coordinates, and a movement Path (draw it, set travel time, loop, auto-heading, play).',
    // FX
    'Grid · sea · clouds': 'Atmospheric overlays: a square grid, an animated sea (masked to water only), drifting clouds, rule-of-thirds guide and real-time day/night shading — each with its own controls and on/off.',
    // floating panels
    'Model control': 'Steer the selected model live. The D-pad / arrow keys move it; Heading/Pitch/Roll orient it (aircraft attitude); Size and Altitude resize/raise it; Drop sits it on the ground. Path draws a movement route, Play runs it. Drag the model directly in 3D to move it. Wireframe toggles the look.',
    'Timeline': 'Choreograph movement with keyframes. Scrub the playhead, set up the shot (move the camera, position models), then press + on a track to capture a keyframe. Play interpolates the camera and every model smoothly between keyframes — synced to the presenter. Set duration, loop, or clear all.',
  };

  let pop = null, curKey = null;
  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div'); pop.className = 'help-pop glass'; pop.hidden = true; document.body.appendChild(pop);
    document.addEventListener('click', e => { if (pop && !pop.hidden && !e.target.closest('.help-pop') && !e.target.closest('.help-dot')) hide(); }, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
    return pop;
  }
  function hide() { if (pop) pop.hidden = true; curKey = null; }
  function show(anchor, text) {
    ensurePop(); pop.textContent = text; pop.hidden = false;
    const pw = Math.min(300, window.innerWidth - 20); pop.style.maxWidth = pw + 'px';
    const r = anchor.getBoundingClientRect();
    let left = r.left, top = r.bottom + 8;
    if (left + pop.offsetWidth > window.innerWidth - 10) left = window.innerWidth - 10 - pop.offsetWidth;
    if (top + pop.offsetHeight > window.innerHeight - 10) top = r.top - pop.offsetHeight - 8;
    pop.style.left = Math.max(10, left) + 'px'; pop.style.top = Math.max(10, top) + 'px';
  }
  function dot(key, textOverride) {
    const b = document.createElement('button'); b.className = 'help-dot'; b.type = 'button'; b.textContent = '?'; b.title = 'What is this?'; b.setAttribute('aria-label', 'Help: ' + key);
    const text = textOverride || HELP[key] || 'No help for this yet.';
    b.onclick = e => { e.stopPropagation(); e.preventDefault(); if (pop && !pop.hidden && curKey === key) { hide(); return; } show(b, text); curKey = key; };
    return b;
  }
  window.Help = { dot, show, hide, has: k => !!HELP[k], HELP };
})();
