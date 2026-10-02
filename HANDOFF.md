# news-map v2 — OPERATING HANDOFF (read this first, every session)

You are working on a **live television broadcast map**. `v2/control.html` is the operator console;
`v2/index.html` is what goes to air. A mistake here is visible on television. This file is the whole
institutional memory of the project — a fresh session (human or agent, local or cloud) must read it
before touching anything. Everything below was measured, not assumed.

---

## 1. HARD RULES — never break these

1. **Never load `control.html` against the live sync room.** `control.html` is a sync *sender*: any edit
   it makes is POSTed within ~1.2s to the room, and every other window — including the operator's live
   broadcast — adopts it. The default room (no `?room=` param) **is** the live room. Every test, probe or
   experiment must use `?nosync` (fully detached) or `?room=__isolated_test__` (throwaway). The app also
   refuses to publish from an automated browser (`navigator.webdriver`) unless the URL carries
   `?allowsync` — that guard exists because this rule was once broken and it put garbage on air.
2. **Never deploy from an agent or unattended session.** Deploy is a deliberate human act (see §5).
   Open a pull request; a person reviews and publishes.
3. **Never commit secrets.** The repository is PUBLIC. No keys, tokens, room keys, worker secrets.
4. **Run the browser harnesses SEQUENTIALLY, never in parallel.** They all drive a MapTiler-backed map;
   concurrent runs push the key into HTTP 403 rate-limiting, which surfaces as spurious 3D failures.
5. **Files stay under 500 lines.** Comments explain WHY (the failure being prevented), not what.
6. **Measure before you claim.** A commit message once said a file was "under the 500-line limit"; it was
   842. Count, run, verify — then write it down. Lead reports with what is wrong or uncertain.
7. **Behaviour and visual design are not yours to change unasked.** Fix defects; do not restyle, rename,
   or "improve" the look. Design decisions belong to the owner.

## 2. Architecture — quick map

- Vanilla JS, **no bundler, no ES modules**: ~39 IIFE modules loaded as ordered `<script>` globals from
  `control.html` / `index.html`. Load order matters. Deferred scripts (`three.min.js`, `models3d-geo.js`,
  `models3d.js`, `models-anim.js`, `tracking3d.js`) run after all non-deferred ones.
- `js/util.js` loads FIRST and exports `window.U = { h, esc, ... }`; modules destructure
  `const { h, esc } = window.U;`. `esc()` is the XSS chokepoint for synced/imported/feed strings.
- Leaflet 1.9.4 = 2D map (`window.GameMap.map`). MapLibre GL v5 = 3D/globe (`window.Map3D.map`, built
  lazily on first enter). three.js r137 = 3D models via a MapLibre custom layer.
- State: `js/store.js` (`window.Store`), persisted in `localStorage['newsmap.v3']`. Panel layout is
  local-only (`newsmap.v3.layout.*`, never synced). `Store.validateState` / `sanitizeState` gate every
  untrusted payload (sync, project import, snapshot restore). `emit()` isolates each subscriber.
- Sync: `js/sync-client.js` POSTs `Store.exportState()` to a Cloudflare KV worker (`v2-sync/sync.js`) on
  every edit (1.2s debounce) and polls every 3s; newest timestamp wins. Mirroring latency is ~4.2s —
  tests must poll for the condition, not sleep a fixed time. The worker has an optional write guard
  (`ROOM_KEY` secret → POST needs `?k=`/`X-Room-Key` + allowed Origin; GET stays open). The operator's
  key lives only in `localStorage['newsmap.v3.roomkey']` — never in source.
- Hoisting hazard: `config-panel.js` and `models3d.js` were split into factories (`cfg-kit.js`,
  `cfg-tabs-a/b.js`, `models3d-geo.js`) that receive an explicit context object, because function
  hoisting does not cross files — a careless split boots fine and throws on the first click.
- Model headings: `rotZ` is a compass bearing rendered `+rotZ` in all three views (2D billboard,
  flat-3D, globe) since migration `_mig.headFrame`. `DEFAULT_CONFIG.modelFix` stays in the OLD frame on
  purpose (deepMerge folds it in before `migrate()` negates). Do not "fix" that.

## 3. Running and testing (local machine or cloud sandbox)

```bash
# serve the static site
(python3 -m http.server 8000 >/tmp/srv.log 2>&1 &) ; sleep 2

# puppeteer: the harnesses require('puppeteer-core') and launch Chrome at CHROME_PATH
#   local Mac: CHROME_PATH defaults to /Applications/Google Chrome.app/...
#   cloud/Linux: install a bundled Chromium and point to it
mkdir -p /tmp/pp && cd /tmp/pp && npm init -y >/dev/null && npm i puppeteer@23 puppeteer-core@23 --no-audit --no-fund
export NODE_PATH=/tmp/pp/node_modules
export CHROME_PATH="$(node -e "console.log(require('/tmp/pp/node_modules/puppeteer').executablePath())")"
cd - >/dev/null

# optional: room key for the two harnesses that publish into isolated rooms (only once the worker guard is live)
# export NM_ROOM_KEY=...   (never commit it)

# run SEQUENTIALLY, in this order
for t in audit tools-test integration feattest scenarios deep clickall; do node v2/tools/$t.js 2>&1 | tee /tmp/$t.log; done
```

`node --check` every file you touch. The harnesses print a summary line each; the pass criteria are in §4.

## 4. The harness suite (`v2/tools/`)

| Harness | Covers | Pass line |
|---|---|---|
| `audit.js` | 126 end-to-end checks, control + presenter | `TOTAL 126 · PASS ≥125 · FAIL ≤1` — the ONLY tolerated failure is `✗ timeline playback` (timing-flaky) |
| `tools-test.js` | real clicks + map gestures on every tool, conflict detection | `TOTAL 82 · PASS 82 · FAIL 0` |
| `integration.js` | everything ON at once, 3D + globe + FX stress | `TOTAL 14 · PASS 14 · FAIL 0` |
| `feattest.js` | easing, follow camera, marker→lower-third | `FEATURE TOTAL 9 · PASS 9` |
| `scenarios.js` | camera arbitration, follow yield, 2D↔3D round trip, hostile-state recovery, control→presenter journey | `SCENARIOS TOTAL 19 · PASS 19` |
| `deep.js` | two-window cloud sync (isolated room), 3D enter/exit leak ×6, save/load + snapshot | `DEEP TOTAL 9 · PASS 9` |
| `clickall.js` | EXECUTES every control's handler (~1146) — catches "boots fine, throws on click" | `CLICKALL: PASS` |

Known, harmless noise you will see and must not "fix" by hiding: one `MapLibre error … source image could
not be decoded` on a test overlay (pre-existing, surfaced when the error channel was un-silenced), and in
`scenarios` ~7 page errors that are the **deliberate hostile-input scenario** proving isolation works
(`subscriber threw … isolated`, `skipped a malformed element`). Also present until the owner republishes
it: the custom "News" MapTiler style `019caada-…` returns 404 (fallback to Satellite is intentional).

Other tools: `sync-test.js`, `reach.js`, `ui-audit.js`, `soak.js` (10-min), `stress.js`, `finalize.js`.

## 5. Versioning and deploy (HUMANS ONLY)

- Every JS/CSS change needs the cache-buster bumped: `?v=N` → `?v=N+1` in BOTH `control.html` and
  `index.html` (`perl -pi -e 's/\?v=71/?v=72/g' v2/control.html v2/index.html`). Current live: see
  `git show origin/main:v2/index.html | grep -oE '\?v=[0-9]+' | head -1`.
- GitHub Pages serves `main`. Publishing = mirroring `v2/` onto main **including deletions**:
  `git checkout main && git reset --hard origin/main && git rm -r v2 && git checkout <branch> -- v2/ && git add v2 && git commit && git push`.
  (`git checkout <branch> -- v2/` alone does NOT delete files removed on the branch.)
- Before publishing, tag the current live build as a restore point: `git tag -a live-vNN <main-sha>`.
  Existing restore points: `live-v68` … `live-v71`. Rollback = `git revert` on main, or redeploy a tag.
- A guarded `deploy.yml` + `verify.yml` exist in commit `80b4fa9` (held: the push token lacked the
  `workflow` scope). Once pushed, publishing moves to a manual Actions run that verifies first.

## 6. Protocol for a cloud / agent work session

1. `git fetch && git checkout v2-hardening2` (the integration branch). Read this file. Read
   `NIGHT_TASK.md` at the repo root if it exists — that is the task mailbox the owner fills; otherwise
   take the top unchecked item of §7.
2. Work on a fresh branch `night/YYYY-MM-DD-<slug>` from `v2-hardening2`. Keep the change minimal and
   reviewable; comment the WHY.
3. `node --check` every touched file, then run the FULL suite sequentially (§3). Do not stop at syntax.
   If a harness fails, decide honestly whether it is your change, a known-flaky, or MapTiler 403 noise
   (re-run once before believing a 3D failure).
4. Bump `?v=` if you changed any JS/CSS. Commit with a message that states what was measured.
5. Push the branch and open a pull request against `v2-hardening2` titled `night: <slug>`. The PR body
   MUST contain: what changed and why; the suite results table (every harness line verbatim); what you
   did NOT do and why; anything the owner must decide. Lead with the flaws.
6. **Stop conditions — open the PR anyway and say so:** a harness fails for a reason you cannot explain;
   the task needs a credential you do not have; the task requires a design/taste decision; the change
   would exceed the scope of the task. Never push to `main`. Never touch `v2-sync/` deployment, secrets,
   or anything outside the repo.
7. Leave no scratch files in the repo. Never commit `.claude-flow/`, `.wrangler/`, `ci-shots/`.

## 7. Backlog (ordered; take the top unchecked item unless `NIGHT_TASK.md` says otherwise)

- [ ] `v2/js/draw.js` is 517 lines (limit 500): extract the quick-add / palette UI or the gesture state
      machine into its own module with an explicit context object (see §2 hoisting hazard); prove with
      `clickall.js` identical before/after.
- [ ] Add `NM_CI=1` support to the harnesses: skip the two network-publishing checks (deep sync,
      scenarios S5) when the room key is absent, so a cloud run without secrets is still fully green.
- [ ] `sync-client.js`: once the worker guard is deployed, prefer the `X-Room-Key` header over `?k=`
      (the header needs the new worker's CORS; `?k=` was only for the rollout window).
- [ ] Unit tests (plain Node, no browser) for `Store.validateState` / `sanitizeState` and the worker
      (`v2-sync/sync.js` — pattern: `import worker from …; fake env.SYNC_KV = Map`).
- [ ] `tracking3d.js`: instanced ship/aircraft meshes are chirally mirrored (bearing is correct). Fix by
      mirroring the merged geometry + reversing winding in `mergeScene`; both models are bilaterally
      symmetric so this is invisible today — low priority, high care.
- [ ] Billboard LRU (`models3d.js`, cap 260) — add a tiny counter/debug readout so cache pressure is
      observable instead of inferred.

## 8. Owner-only items (an agent cannot do these — surface them, do not attempt them)

- Regenerate the GitHub token with the `workflow` scope, then push commit `80b4fa9` (CI + deploy
  workflows) and set repo secret `NM_ROOM_KEY`.
- Deploy the sync worker and set its secret: `cd v2-sync && npx wrangler login && npx wrangler deploy &&
  npx wrangler secret put ROOM_KEY`; then enter the same key once in the control window when prompted.
- Restrict the MapTiler key by domain (`ghalebd.github.io`, `localhost`) — it is public by nature; a
  browser key is protected by domain restriction, not secrecy. Consider a second key for test runs.
- Republish the custom "News" map style under the current MapTiler account (currently 404 → Satellite
  fallback).
- Decide repo visibility: private hides this history but costs free GitHub Pages; it does NOT protect
  the map key.

## 9. Lessons that cost something to learn

- A no-op `map.on('error', …)` listener REPLACES MapLibre's own logging — it silently swallowed the
  entire error channel for months.
- `fetch()` only rejects on network failure; a 429/500 resolves. Always check `r.ok`.
- Publishing `localStorage` instead of live state published STALE snapshots with FRESH timestamps —
  the console showed new work while air kept the old. Publish the in-memory state.
- `localStorage` was written BEFORE validating a synced payload → a corrupt snapshot poisoned refresh,
  the operator's only recovery. Validate first, persist second.
- In 3D, a follow loop calling `setCenter` every frame cancelled MapLibre's drag gesture before it was
  recognised (measured 0 `dragstart` events) — the globe could not be panned at all. Detect drags from
  raw pointer deltas, not `dragstart`.
- `el.click()` dispatches on off-screen elements; gating the click-everything harness on a non-zero
  rect silently skipped 1041 of 1067 controls.
- Workflow files cannot be pushed with a token lacking the `workflow` scope; split them into their own
  commit so everything else can still ship.
