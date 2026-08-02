/* ============================================================
   U — the ONE copy of the helpers that every module used to
   redeclare. Loads as the FIRST project script in both
   control.html and index.html (before js/icons.js), so it is
   available to every later module, deferred ones included
   (a non-defer script always runs before any defer script).

   WHY window.U AND NOT BARE TOP-LEVEL CONSTS — the trap this
   file exists to avoid: a top-level `const h = …` in a classic
   script lands in the global LEXICAL environment, so later
   scripts can see bare `h` but it is NOT window.h — and the
   instant any module keeps its own `const h` inside its IIFE
   that local SHADOWS the shared one, silently. You would get a
   half-migrated codebase with no error anywhere and no cleanup
   benefit. Exporting one plain object and having each module
   open its IIFE with

       const { h, esc } = window.U;

   is explicit, keeps every module's local names unchanged (so
   not one call site in the bodies had to be touched), and
   throws LOUDLY at LOAD time if the <script> order is ever
   broken — a boot failure, not a mid-broadcast surprise.

   WHY `esc` IS THE POINT OF THIS FILE: it is the XSS chokepoint
   for every string that arrives from the sync room, from an
   imported project file, or from the live AIS / flight feeds.
   It had nine copies, and three of them had already drifted and
   omitted the single-quote. One copy = one place to widen the
   escape set the next time it has to widen.

   WHAT DELIBERATELY DID *NOT* COME HERE:
   · draw.js `decimate`/`smoothPts` vs model-control.js
     `decimate`/`smoothPath` — same names, DIFFERENT algorithms
     (geographic metres vs screen-space index stride). Merging
     them would change stroke fidelity on a live tool.
   · draw.js `col()` (CSS-colour allowlist) and the three colour
     converters — single-use / three different call shapes.
   · `clamp` — the two copies take (v,lo,hi) in the same order
     but are not byte-identical and disagree when lo > hi.
   · the MapTiler `KEY` — config, not a helper; it belongs to
     whoever owns secrets handling, not to a util module.
   ============================================================ */
window.U = (() => {

  /* ---- DOM ---- had 12 byte-identical copies (app.js spelled the
     params `tag, cls` instead of `t, c`; parameter names are internal,
     so the behaviour was identical and every body still reads the same). */
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };

  /* ---- HTML escape ---- 9 copies. The SAFE 5-character set, taken verbatim
     from the js/draw.js reference copy. Do not narrow it: the single-quote is
     load-bearing because several sinks interpolate into single-quoted attributes. */
  const esc = s => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- distance label ---- draw.js called it fmtDist, map3d.js fmtD; the two
     bodies were identical. They label the SAME measure element on the 2D map and
     on the 3D globe, so a drift between them would show two different numbers for
     one measurement on air. Exported under BOTH names (fmtD is an alias, not a
     rename) so neither consumer's body needed editing. */
  const fmtDist = m => m > 1000 ? (m / 1000).toFixed(1) + ' KM' : Math.round(m) + ' M';

  /* ---- degrees→radians ---- declared 5 times, twice inside map3d.js alone under
     two names (D2R at the top, RAD 190 lines down). Same alias trick as fmtD. */
  const D2R = Math.PI / 180;

  /* ---- placed 3D models ---- 4 copies, all of the form `S.models3d()` where the
     module's `S` is a captured `window.Store`.
     WHY THE STORE IS LOOKED UP LATE HERE AND NOT CAPTURED: util.js is script #1 —
     js/store.js has not run yet, so `window.Store` is undefined at this file's own
     load time and capturing it would freeze in a permanent undefined. The lookup
     therefore happens per call. Every consumer bails out of its IIFE when !S, so
     the added null-guard is unreachable in practice and changes no behaviour. */
  const models = () => { const S = window.Store; return (S && S.models3d) ? S.models3d() : []; };

  /* ---- the active MapLibre map, or null when 3D is off ---- 2 copies, verbatim.
     Already a late window lookup in the originals, so nothing changed. */
  const gl = () => (window.Map3D && Map3D.on && Map3D.map) ? Map3D.map : null;

  /* ---- motion easing ---- duplicated between timeline.js (keyframe playback) and
     models-anim.js (route playback). THESE TWO MUST STAY IN LOCKSTEP: both drive the
     same model in the same shot, so any divergence desynchronises a model following
     its route from the camera keyframed against it. That is the whole reason they are
     centralised — this pair is the one real correctness win in this file besides esc.
     Same late-Store rule as models() above. */
  const easeMode = () => { const S = window.Store; return ((S && S.cfg && S.cfg().easing) || 'inout'); };
  function ease(t) { if (easeMode() !== 'inout') return t; t = Math.max(0, Math.min(1, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // fmtD / RAD are aliases of fmtDist / D2R — see above. Keeping both spellings is
  // what let this be a pure de-duplication with zero edits inside any module body.
  return { h, esc, fmtDist, fmtD: fmtDist, D2R, RAD: D2R, models, gl, easeMode, ease };
})();
