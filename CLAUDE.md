# CLAUDE.md — News Map (Al Jazeera Broadcast Interactive Map)

> Read this fully before any work. It is the single source of truth for this project.

## What this is
An interactive broadcast news map used **live on air at Al Jazeera** (Doha). Built on **Leaflet 1.9.4 + MapTiler**. Presenters use it to annotate live maps: place military/asset icons, draw arrows/ranges, highlight countries, track live ships & aircraft, run storyboards, etc.

**Live URL:** https://ghalebd.github.io/news-map/ (GitHub Pages)
**Repo:** ghalebd/news-map
**Owner:** Dida — broadcast designer/developer. Communicates in Arabic (MSA or Gulf dialect — **never Egyptian dialect**). Often working under live-broadcast time pressure.

## Architecture
- **`index.html`** — the deployed app. It is large (~345KB) and contains most CSS/JS **inline**. This is the file GitHub Pages serves.
- **`v2-features.js`** — separate script, loaded by index.html. Undo/redo, motion path, spotlight, logo bug, range rings, presets, auto-save, zoom-aware asset sizing, draggable Studio panel.
- **`src/`** — clean copies of the modular source files that are injected (inline) into index.html:
  - `pro-icons.js` — `window.NEWSMAP_ICONS` + `window.svgIcon(name,size)`. Inline SVG icon library (replaces all emoji). **No external icon deps** (AJ network blocks many CDNs).
  - `panel-system-v4.css` / `.js` — right-rail accordion "np-panel" cards (Map Style / Map Labels / Live Tracking). One open at a time.
  - `panel-system-v5.js` — replaces emoji with pro SVG icons across the UI; collapsed-square panels.
  - `universal-panels.js` — Dock system v5: collapsed icon-squares, edge-snap, constrained drag (side panels move vertically; top/bottom bars move horizontally), collision prevention (no panel-in-panel).
  - `ui-restructure-v6.js` — removes the old top grey bar, floats the AJ logo, merges top buttons into the presenter bar, moves undo/redo into the bottom bar, adds a touch-mode button.
  - `liquid-glass.css` — global "liquid glass" design system (blur 40px, unified button styles, accent #00d4ee).
  - `news-map.master.html` — working master copy of index.html.

### How inline injection works
Source files in `src/` are injected into `index.html` between markers like:
`<style id="liquid-glass-system">…</style>`, `<style id="panel-system-v4">…</style>`,
`<script id="pro-icons-js">…</script>`, `<script id="panel-system-v4-js">…</script>`,
`<script id="panel-system-v5-js">…</script>`, `<script id="universal-panels-js">…</script>`,
`<script id="ui-restructure-v6-js">…</script>`.
**Script load order matters:** pro-icons → panel-system-v4 → panel-system-v5 → universal-panels → ui-restructure-v6. `v2-features.js` is a separate `<script src>`.

To re-inject after editing a `src/` file, replace the matching `<style id>`/`<script id>` block in index.html with the new file contents (keep the id wrapper). A helper script `build.sh` does this (see below).

## Deploy workflow
```bash
cd ~/news-map-deploy
# (after editing src/ files, run the build to re-inject into index.html)
./build.sh
git add -A && git commit -m "msg" && git push
# wait ~50s for GitHub Pages, then hard-refresh the live URL with a ?cb=timestamp
```
GitHub Pages build status:
`curl -H "Authorization: token $GH_TOKEN" https://api.github.com/repos/ghalebd/news-map/pages/builds/latest`

## Credentials (local only — already in this machine)
- Git remote already has a token embedded in `git remote -v` (origin). Pushing works without extra auth.
- MapTiler key: `tnFJbEP9ELhQqkA6rPY2`
- aisstream.io (live ships WebSocket): `3da0a878476db856ac5cf273d312875598270404`
- Higgsfield live-asset CDN: `d8j0ntlcm91z4.cloudfront.net` (this Mac CAN curl it; Adobe MCP / sandboxes cannot).

## Verification (headless browser)
Puppeteer-core is at `~/.npm-global/lib/node_modules/puppeteer-core`; Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; use `headless:'new'`.
Always test at **both** 1440×900 (wide) and **680×1320 (narrow/portrait)** — the broadcast display can be portrait. Check for: panel overlaps, off-screen panels, console errors, and that icons render (SVG width > 5px).

Example checks that must stay green:
- No panel overlaps at wide AND narrow.
- No off-screen panels.
- 0 console errors.
- All `.pb-btn svg` centered in their button.
- Buttons share uniform heights within a group.

## Hard rules (from the owner)
1. **Never** restart/kill RunPod or ComfyUI without explicit approval (separate project, but same owner).
2. Don't hand work back — execute directly via terminal; only ask about genuine creative/decision choices.
3. No Egyptian Arabic. MSA or Gulf only.
4. Data integrity for any data work: fetch ALL data, never drop/sample silently (لا تنازلات عن البيانات).
5. **Do NOT regenerate the 3D asset library this session** — it's paused by owner decision (perspective + transparency + speed issues to revisit later with a faster, more accurate method).
6. UI must be: compact, dynamic, no clutter, no overlaps, unified buttons, professional ("liquid glass").

## Current UI state (v6, all verified working)
- Top grey bar removed; AJ logo floats alone top-left.
- Presenter bar (top): zoom/step/play + merged Scenarios/Save/Load/HideUI/Presenter. Single-row, horizontal-scroll, draggable along top, **can move to screen center** (presenter may need it).
- Bottom bar: undo/redo + touch-mode toggle.
- Left: main toolbar (tools) + Studio panel (v2Panel) snapped to left edge, clears the toolbar, drags vertically, collapses to a 46px icon square.
- Right rail: accordion cards (Map Style / Labels / Live Tracking); collapsed = 46px glass icon chips (no grey box behind).
- All emoji replaced by pro SVG icons except ✕ (close) and 📍 (coordinate readout).

## Pending / agreed features (NOT yet done — work in this order)
1. **Live ships & aircraft**: make faster, fix icon SIZE (they use asset CSS / zoom scaling), full polish. Ships = aisstream WebSocket (`window` ship system). Aircraft = `window.liveFlights` (airplanes.live primary, OpenSky fallback, 10s refresh — consider 5s).
2. **Free Middle East / Strait of Hormuz data source** (e.g. NASA FIRMS thermal/fires, GDELT geolocated events, OpenSky). Pick free, no-/low-auth sources.
3. **Bezier curved arrows.**
4. **Sequential reveal** (elements appear one-by-one on click).
5. Satellite overlay toggle · time-of-day shading · color tinting for assets · asset groups (multi-select) · custom PNG upload · auto-zoom-to-event (search + fly) · bookmarks · grid/rule-of-thirds overlay · PNG/PDF/video export.
6. **(Paused)** Photorealistic top-down 3D asset library — do not resume without owner go-ahead.

## Existing tools/features (do NOT duplicate)
Tools: pan, asset, animate, sketch, arrow, circle, polygon, country, marker, erase, measure (Ruler, key R), textlabel (auto-expanding box, the native one — do not re-add a second text tool). Save/Load via JSON (Ctrl+S). Storyboard. Presenter mode. Scenario presets. Live tracking (ships/flights). Country highlight.

## Known gotchas
- Many layout rules use `!important`. To move a panel via JS you must use `el.style.setProperty(prop, val, 'important')` or it won't budge.
- ID selectors beat class selectors: a media-query rule on `.right-panels-stack` loses to `#rightPanelsStack`. Match ID specificity.
- `index.html` has had **duplicate** `:root`, `.layers-panel`, `.toolbar`, `.layer-emoji` definitions from older sessions. Be careful which one wins (last in source / highest specificity).
- Doubled-class trick (`.tool-btn.tool-btn`) is used to out-specify compound legacy selectors like `.toolbar .tool-btn`.
