/* ============================================================
   CFG-KIT — the settings console's widget kit + shared tables.
   Split out of config-panel.js (over the 500-line limit).
   Everything here is a PURE builder: it touches only its own
   arguments, the DOM and Math — no Store, no ICONS, no console
   state — so it can safely load before config-panel.js.
   Also owns the drag "interaction latch" (see below), because
   the rotary dial that needs it lives here.
   ============================================================ */
(() => {
  // own copy of the tiny DOM helper — this file loads BEFORE config-panel.js, so it cannot borrow its one
  const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };

  /* ---- interaction latch ----
     The rotary dial, the drag grips and the drawer resize handle are pointer-captured plain
     <div>s — they never become document.activeElement, so the console's "don't rebuild while
     the operator is typing" focus test never sees them. A remote sync that rebuilds the console
     mid-gesture deletes the captured node: the value freezes half-set and the tap handler can
     fire on an orphan. Gesture owners raise the latch; the console defers its rebuild until it
     drops back to zero. */
  let held = 0, idleFn = null, idleT = 0;
  // always hand the rebuild to a later task: the gesture's own handler is still running (and still
  // touching the node) when the latch drops, so rebuilding inline would recreate the very bug.
  const fireIdle = () => { if (!idleFn || idleT) return; idleT = setTimeout(() => { idleT = 0; if (!held) idleFn(); }, 0); };
  const hold = () => { held++; };
  const release = () => { if (held > 0 && --held === 0) fireIdle(); };
  // safety net: if anything removes the dragged node the gesture's own pointerup / dragend never
  // arrives, and a stuck latch would silently swallow EVERY later sync. Any gesture end that
  // reaches the document clears whatever is still held.
  const clearHolds = () => { if (held) { held = 0; fireIdle(); } };
  document.addEventListener('pointerup', clearHolds);
  document.addEventListener('pointercancel', clearHolds);
  document.addEventListener('dragend', clearHolds);

  const aspectOf = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res((im.naturalWidth / im.naturalHeight) || 1); im.onerror = rej; im.src = url; });
  // parse a single Google-style coordinate string "lat, lng" (also tolerates ° and N/S/E/W)
  const parseLatLng = s => { const m = String(s || '').match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?/); if (!m) return null; let lat = +m[1], lng = +m[3]; if (/[Ss]/.test(m[2] || '')) lat = -Math.abs(lat); if (/[Ww]/.test(m[4] || '')) lng = -Math.abs(lng); return (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ? [lat, lng] : null; };
  function readImage(file, max = 256) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const img = new Image(); img.onload = () => { let w = img.width, hh = img.height; const sc = Math.min(1, max / Math.max(w, hh)); w = Math.round(w * sc); hh = Math.round(hh * sc); const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; cv.getContext('2d').drawImage(img, 0, 0, w, hh); res(cv.toDataURL('image/png')); }; img.onerror = rej; img.src = fr.result; };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }

  const ACCENTS = ['#5b9dff', '#22d3ee', '#2dd4bf', '#34d399', '#d9b25f', '#ffb020', '#fb7185', '#8b7bff'];
  const DTOOLS = [['select', 'Select'], ['marker', 'Marker'], ['arrow', 'Arrow'], ['curve', 'Curve'], ['ring', 'Range'], ['circle', 'Circle'], ['polygon', 'Area'], ['sketch', 'Freehand'], ['text', 'Label'], ['measure', 'Measure'], ['frontline', 'Front line'], ['country', 'Country'], ['asset', 'Assets'], ['erase', 'Erase']];
  const VIS = [['deck', 'Scene deck'], ['modeSwitch', 'Mode switch'], ['qtools', 'Tool bar'], ['fab', 'Add launcher'], ['status', 'Coordinates'], ['brand', 'Logo'], ['nownext', 'Now / Next'], ['tracking', 'Live tracking'], ['sceneSettings', 'Scene settings'], ['attribution', 'Map credit']];
  const PERMS = [['canDraw', 'Can draw on map'], ['canNavigate', 'Can change scenes'], ['canEditScenes', 'Can edit scene list'], ['canChangeMapStyle', 'Can change map style'], ['canChangeStyle', 'Can change theme'], ['canTrack', 'Can toggle live tracking']];
  const TC = ['#46d8ff', '#7cf3ff', '#34d399', '#ffd54a', '#ff9f0a', '#fb7185', '#bf5af2', '#ffffff'];
  const DCOLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#36ff9e', '#38e6ff', '#0a84ff', '#bf5af2', '#ffffff'];

  function tog(on, fn) { const t = h('div', 'tog' + (on ? ' on' : '')); t.onclick = () => { const nv = !t.classList.contains('on'); t.classList.toggle('on', nv); fn(nv); }; return t; }
  function rowTog(label, on, fn) { const r = h('div', 'cfg-row'); r.appendChild(h('div', 'lab', label)); r.appendChild(tog(on, fn)); return r; }
  function rowWith(label, el) { const r = h('div', 'cfg-row'); r.appendChild(h('div', 'lab', label)); r.appendChild(el); return r; }
  /* DaVinci Resolve-style rotary dial — THE numeric control for the whole console.
     270° arc · vertical drag (Shift = fine ×10) · scroll wheel · click number to type */
  function slider(label, val, min, max, step, fn) {
    const st = step || 1, dec = st < 1 ? (st < 0.1 ? 2 : 1) : 0;
    const fmt = x => (+x).toFixed(dec);
    const R = 21, CX = 27, CY = 27, SWEEP = 270, A0 = 135;
    const pt = aDeg => { const a = aDeg * Math.PI / 180; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
    const [sx, sy] = pt(A0), [ex, ey] = pt(A0 + SWEEP);
    const ARC = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R} ${R} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
    const LEN = 2 * Math.PI * R * (SWEEP / 360);
    const wrap = h('div', 'dknob');
    wrap.innerHTML = `<div class="dknob__dial" title="Drag up/down · Shift = fine · scroll = step">
      <svg viewBox="0 0 54 54">
        <path class="dknob__trk" d="${ARC}"/>
        <path class="dknob__arc" d="${ARC}" stroke-dasharray="${LEN.toFixed(2)}"/>
        <circle class="dknob__dot" r="2.6"/>
      </svg>
      <button class="dknob__num" title="Click to type"></button>
    </div><div class="dknob__lab">${label}</div>`;
    const arc = wrap.querySelector('.dknob__arc'), dot = wrap.querySelector('.dknob__dot'),
      num = wrap.querySelector('.dknob__num'), dial = wrap.querySelector('.dknob__dial');
    let v = Math.max(min, Math.min(max, val));
    const paint = () => {
      const f = (v - min) / (max - min);
      arc.style.strokeDashoffset = (LEN * (1 - f)).toFixed(2);
      const [dx, dy] = pt(A0 + SWEEP * f); dot.setAttribute('cx', dx.toFixed(2)); dot.setAttribute('cy', dy.toFixed(2));
      num.textContent = fmt(v);
    };
    const setV = nv => { nv = Math.max(min, Math.min(max, Math.round(nv / st) * st)); if (nv === v) return; v = nv; paint(); fn(v); };
    paint();
    function openEdit() {
      const ed = h('input', 'dknob__edit'); ed.type = 'text'; ed.value = fmt(v);
      num.replaceWith(ed); ed.focus(); ed.select();
      const done = ok => { const nv = parseFloat(ed.value); ed.replaceWith(num); if (ok && !isNaN(nv)) setV(nv); else paint(); };
      ed.onkeydown = ev => { if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); };
      ed.onblur = () => done(true);
    }
    // The WHOLE dial face is draggable (vertical = value), not just the thin ring — much easier to
    // grab. A clean tap on the centred number (no drag) opens the type-in editor. touch-action:none
    // (CSS) stops the settings panel from stealing the vertical gesture on touch screens / trackpads.
    let drag = false, sy2 = 0, sv = 0, moved = false, onNum = false;
    // hold()/release() must stay balanced: a second finger landing mid-drag would otherwise raise the
    // latch twice and only one release would ever come back, freezing the console's sync for good.
    dial.addEventListener('pointerdown', e => { if (!drag) hold(); drag = true; moved = false; onNum = (e.target === num); sy2 = e.clientY; sv = v; try { dial.setPointerCapture(e.pointerId); } catch (err) {} dial.classList.add('is-drag'); e.preventDefault(); });
    dial.addEventListener('pointermove', e => { if (!drag) return; if (Math.abs(e.clientY - sy2) > 3) moved = true; const fine = e.shiftKey ? 10 : 1; setV(sv + ((sy2 - e.clientY) / (150 * fine)) * (max - min)); });
    const end = () => { if (!drag) return; drag = false; release(); dial.classList.remove('is-drag'); if (!moved && onNum) openEdit(); };
    dial.addEventListener('pointerup', end); dial.addEventListener('pointercancel', end);
    dial.addEventListener('wheel', e => { e.preventDefault(); setV(v + (e.deltaY < 0 ? st : -st) * (e.shiftKey ? 10 : 1)); }, { passive: false });
    return wrap;
  }
  /* knob() and slider() are the same Resolve dial — one visual language */
  function knob(label, val, min, max, step, fn) { return slider(label, val, min, max, step, fn); }
  function swatches(list, cur, fn) {
    const sw = h('div', 'cfg-sw');
    const mark = el => { sw.querySelectorAll('button').forEach(z => z.classList.remove('on')); el.classList.add('on'); };
    list.forEach(c => { const b = h('button'); b.style.background = c; b.title = c; if ((c || '').toLowerCase() === (cur || '').toLowerCase()) b.classList.add('on'); b.onclick = () => { mark(b); fn(c); }; sw.appendChild(b); });
    // custom colour chip — rainbow ring, embedded native picker, shows the picked colour
    const custom = h('button', 'cfg-sw__custom'); custom.title = 'Custom colour';
    const dot = h('i'); custom.appendChild(dot);
    const ci = h('input'); ci.type = 'color'; ci.value = /^#/.test(cur || '') ? cur : '#ffffff'; custom.appendChild(ci);
    if (cur && !list.some(c => (c || '').toLowerCase() === cur.toLowerCase())) { custom.classList.add('on'); dot.style.background = cur; }
    ci.oninput = () => { dot.style.background = ci.value; mark(custom); fn(ci.value); };
    sw.appendChild(custom);
    return sw;
  }
  const knobs = (...ks) => { const g = h('div', 'cfg-knobs'); ks.forEach(k => g.appendChild(k)); return g; };
  function field(label, el) { const f = h('div', 'cfg-field'); f.appendChild(h('div', 'lab', `<span>${label}</span>`)); if (el) f.appendChild(el); return f; }

  window.CfgKit = {
    h, aspectOf, parseLatLng, readImage,
    ACCENTS, DTOOLS, VIS, PERMS, TC, DCOLORS,
    tog, rowTog, rowWith, slider, knob, swatches, knobs, field,
    hold, release, busy: () => held > 0, onIdle: fn => { idleFn = fn; },
  };
})();
