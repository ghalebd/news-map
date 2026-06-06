# News Map — Al Jazeera Broadcast Interactive Map

Live, on-air interactive map for broadcast. Leaflet 1.9.4 + MapTiler.

**Live:** https://ghalebd.github.io/news-map/

## Quick start (Claude Code)
```bash
cd ~/news-map-deploy
claude          # start Claude Code here; it reads CLAUDE.md automatically
```

## Develop
- Edit modular sources in `src/` (CSS/JS).
- Run `./build.sh` to inject them into `index.html`.
- Test headless at 1440×900 and 680×1320 (see CLAUDE.md → Verification).
- `git add -A && git commit -m "msg" && git push` → GitHub Pages deploys in ~50s.

## Layout
- `index.html` — deployed app (inline CSS/JS + injected `src/` modules).
- `v2-features.js` — separate feature script.
- `src/` — clean source modules (injected into index.html by `build.sh`).
- `assets/`, `live_assets/`, `lib/` — icons, live-tracking art, vendored libs.

See **CLAUDE.md** for full architecture, rules, pending features, and gotchas.
