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

## v2 REBUILD (`v2/`) — current active work + PERMANENT conventions

The active product is the **`v2/`** rebuild (modular, store-driven, two synced windows):
`v2/control.html` (operator console) + `v2/index.html` (presenter). They share one
state via `Store` (`js/store.js`, persisted to localStorage `newsmap.v3`, synced across
windows by the `storage` event). Base map = Leaflet (`js/map.js`); real 3D = MapLibre GL
(`js/map3d.js`). Modules: draw, tracking, overlays, movable, qbar, lbar, map-style,
locator, scene-inspector, config-apply, config-panel, app, theme, ui, icons.

### PERMANENT RULES (apply to ALL future work — قواعد ثابتة)
0. **القاعدة الأم — لا تنازلات، لا إهمال، لا تجاوز. كل ما يطلبه المستخدم يُنفَّذ بالكامل.**
   (ZERO compromises, ZERO neglect, ZERO skipping — EVERYTHING the user asks for is done in
   full.) Before ending any turn, re-read the user's message(s) and confirm EVERY distinct
   request was actually implemented and verified — not partially, not "close enough". If a
   request spans multiple messages, address all of them. If something genuinely can't be
   done, say so explicitly and propose an alternative — never silently drop it. When the user
   adds a new tool/panel it MUST be wired into the SAME universal mechanics as the old ones:
   left tool-bar button (with icon, reorderable/hideable via the qbar customiser) +
   `js/movable.js` PANELS (drag grip + Panel size & position: move/scale/snap/center/reset) +
   a settings section + a tiny `Help.dot` "?".
   **Any settings section can be added to the vertical bar** from the "Vertical tool bar"
   customiser (the "Add a settings panel to the bar" list in `tabLayout`, built from
   `sectionCatalog()` which enumerates every section). It toggles `config.qbar.pinned`;
   `renderBarButtons()` drops a `cfg:<slug>` button on the bar; clicking it opens that
   section as a POPUP flyout next to the bar (`popupSection()`), not the whole drawer.
   This is automatic for all current/future sections — never special-case it.
1. **Every new tool/feature gets a settings control automatically.** When you add any
   tool, mode, or feature, you MUST also add a matching control inside the Control Panel
   (`js/config-panel.js`): a `section(title, icon[, onReset])` card whose inputs read/write
   through `Store` setters (so it persists + syncs). Register the section function in the
   `GROUPS` array. No feature ships without its settings control.
2. **Every new on-screen panel follows the exact same panel conventions/style as the
   existing ones.** That means: liquid-glass styling (use `glass`/tokens, never ad-hoc
   colors); registered in `js/movable.js` `PANELS` so it is draggable (grip auto-placed on
   the shorter edge, orange dots) and scalable; it therefore appears automatically in the
   Settings ▸ Layout “Panel size & position” list (size + 9-anchor snap + centre); hidden
   under `body.ui-hidden`; correct z-index tier (tokens `--z-*`); and any popup it spawns
   from the left tool bar uses the shared `.lbar-pop` style via `window.LBar`.
3. **Settings drawer = vertical stack of CATEGORY BANDS** (`CATS` in `js/config-panel.js`:
   Look/Layout/Tools/Map/3D/Live/Broadcast/Assets/Project). All bands show at once in one
   scroll (see most things fast). Each band is collapsible (`newsmap.v3.cfgCatColl`) and the
   whole category is drag-reorderable via its band grip (`setupCatDnD`,
   `newsmap.v3.cfgCatOrder`). Sections inside a band fill columns top-to-bottom (chunked,
   stable) and stay individually drag-reorderable (`setupDnD`, `newsmap.v3.panelOrder`).
   A new `tabX` group goes into the right `CATS` entry. Search spans all bands then filters
   (empty bands hide).
4. **Before every commit run the smoke test** `tmp/v3smoke.js` (puppeteer): it must report
   `0 pageerrors / 0 codeErrors / 0 overlaps` for control+presenter × build+live. 3D tests
   need WebGL flags (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`).
   **For feature work also run the comprehensive auditor** `v2/tools/audit.js`
   (`NODE_PATH=$HOME/.npm-global/lib/node_modules node v2/tools/audit.js`, server on :8000):
   it drives the real app in headless WebGL Chrome and exercises every feature end-to-end —
   all draw tools, clear-all (incl. 3D objects), undo/redo, FX toggles, map controls, the full
   3D suite (terrain/globe/lighting/shadows/overlays/routes/tracking), timeline, model HUD &
   route playback, broadcast graphics, movable panels, pin→bar→popup, colour/permissions/
   locator/camera-path/animation/snapshots/scale-bar/compass/asset-cats/places/geocode/2D
   billboard, plus all scenes/storyboard (add/remove/move/rename/setActive/next/prev/reveal/
   advance/retreat/lower-third/transition), visibility/permissions/style tokens, map-style
   add/toggle/remove, custom assets, logo/brand, touch/tilt/thirds/lt-style, qbar hide/reorder,
   overlays add/update/wipe/dir/reorder/remove, 3D exaggeration/pitch/light params, day-night
   solar, camera-path record/replay, 2D live tracking (ships/flights/focus/style) + 3D track
   params, help "?" dots, theme — **and a full presenter-window (index.html) mirroring phase**
   (banner/ticker/spotlight/element/overlay reflect the shared Store, 0 presenter page errors).
   It currently runs **126 checks**. It must report `PASS == TOTAL` and `PAGE ERRORS: 0`.
   Map-tile abort/404 network noise is filtered out (not a real failure). The presenter page is
   opened with `domcontentloaded` (live-tracking sockets keep it from ever going network-idle).
   Add a check here whenever you add a feature — this is the systematic "no exceptions" review
   (مراجعة شاملة بلا استثناءات).
   **CRITICAL — also run the reachability scanner** `v2/tools/reach.js`
   (`NODE_PATH=$HOME/.npm-global/lib/node_modules node v2/tools/reach.js`). The feature audit
   calls `Store.setX()` and fires `.click()` programmatically — which SUCCEEDS even on elements
   that are `display:none`, zero-size, off-screen, or covered by another panel, i.e. that the
   user can NOT actually see or click. That blind spot is how "verified" features still reach the
   user broken. `reach.js` opens the real panels and does true hit-testing
   (`document.elementFromPoint` at each control's centre must return that control) across
   control+presenter × build/live/3D × every togglable panel. It must report `0 issues`
   everywhere (it filters scroll/closed-panel off-screen noise; real signals are `covered-by:*`
   and `zero-size`). When you add any visible control, add it to a reach.js scan. Rule of thumb:
   **a feature is not "working" until a real click at its on-screen position lands on it.**
5. Git: never push to `main`; work on branch `v2-rebuild`; commit messages end with the
   Co-Authored-By trailer.

## Known gotchas
- Many layout rules use `!important`. To move a panel via JS you must use `el.style.setProperty(prop, val, 'important')` or it won't budge.
- ID selectors beat class selectors: a media-query rule on `.right-panels-stack` loses to `#rightPanelsStack`. Match ID specificity.
- `index.html` has had **duplicate** `:root`, `.layers-panel`, `.toolbar`, `.layer-emoji` definitions from older sessions. Be careful which one wins (last in source / highest specificity).
- Doubled-class trick (`.tool-btn.tool-btn`) is used to out-specify compound legacy selectors like `.toolbar .tool-btn`.
