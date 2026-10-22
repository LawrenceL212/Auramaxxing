/* =========================================================================
   HUNT FX — the living gate behind the Hunt header (presentation only).

   Everything here is cosmetic: it reads no game state and writes nothing.

   Cost model (kept light for phones):
     - glow pulse, mist, motes, flash are CSS animations on opacity/transform only
       (compositor, no per-frame JS, no filters, no blur)
     - lightning is one small SVG whose path data is regenerated once per strike
       (a few times every few seconds) and faded with the Web Animations API
     - no requestAnimationFrame loop, no canvas
     - paused when the tab is hidden, when the Hunt screen is not showing, and
       disabled entirely under prefers-reduced-motion

   Pure geometry (testable): archPoint, boltPath, strikePlan.
   Runtime: huntFxHtml(), startHuntFx().
   Coordinates are the 390 x 540 box the backdrop is drawn in; the arch is
   centred at x=195 with its opening centre near y=204.
   ========================================================================= */

export const FX_BOX = { w: 390, h: 540 };
/* the glowing inner edge of the arch in that box: ellipse for the curved top, straight legs below; bolts leave from here and cross the stone */
export const ARCH = { cx: 195, cy: 204, rx: 107, ry: 109, legBottom: 300 };

const f1 = n => (Math.round(n * 10) / 10).toString();

/** A start point on the arch's glowing inner edge plus its outward direction. rng() -> [0,1). */
export function archPoint(rng = Math.random) {
  const { cx, cy, rx, ry, legBottom } = ARCH;
  if (rng() < 0.22) {
    // a straight leg
    const side = rng() < 0.5 ? -1 : 1;
    return { x: cx + side * rx, y: cy + rng() * (legBottom - cy), nx: side, ny: 0 };
  }
  const th = Math.PI * (1.04 + rng() * 0.92);          // upper half, y down => sin < 0
  const x = cx + rx * Math.cos(th), y = cy + ry * Math.sin(th);
  const gx = Math.cos(th) / rx, gy = Math.sin(th) / ry; // ellipse gradient = outward normal
  const m = Math.hypot(gx, gy) || 1;
  return { x, y, nx: gx / m, ny: gy / m };
}

/** Jagged polyline from (x,y) along angle `a` for `len`, as SVG path data. */
function jag(rng, x, y, a, len, segs, jit) {
  const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  const pts = [[x, y]];
  for (let i = 1; i <= segs; i++) {
    const t = (i - 0.6 + rng() * 0.6) / segs;           // uneven spacing
    const j = (rng() * 2 - 1) * jit * (1 - 0.35 * t);   // sideways kick, easing off at the tip
    pts.push([x + dx * len * Math.min(t, 1) + px * j, y + dy * len * Math.min(t, 1) + py * j]);
  }
  return pts;
}
const toD = pts => 'M' + pts.map(p => f1(p[0]) + ' ' + f1(p[1])).join('L');

/**
 * One bolt: a main jagged path leaving the arch edge, with 1-3 branches forking off it.
 * Returns { d, points } where d is a single path string (subpaths per branch).
 */
export function boltPath(rng = Math.random, start = archPoint(rng)) {
  const a0 = Math.atan2(start.ny, start.nx) + (rng() - 0.5) * 0.7;
  const len = 95 + rng() * 85;
  const segs = 7 + Math.floor(rng() * 4);
  const main = jag(rng, start.x, start.y, a0, len, segs, 15);
  const parts = [toD(main)];
  const nb = 1 + Math.floor(rng() * 3);
  for (let b = 0; b < nb; b++) {
    const i = 2 + Math.floor(rng() * (segs - 3));
    const [bx, by] = main[i];
    const sign = rng() < 0.5 ? -1 : 1;
    const ab = a0 + sign * (0.45 + rng() * 0.5);
    const bl = len * (0.22 + rng() * 0.22);
    parts.push(toD(jag(rng, bx, by, ab, bl, 4 + Math.floor(rng() * 2), 9)));
  }
  return { d: parts.join(''), points: main };
}

/** Bolts for one strike: 2-3 bolts, each from its own arch point, staggered by a few tens of ms. */
export function strikePlan(rng = Math.random) {
  const n = 2 + (rng() < 0.5 ? 1 : 0);
  const out = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    out.push({ d: boltPath(rng).d, delay: Math.round(t), dur: 380 + Math.round(rng() * 160) });
    t += 30 + rng() * 110;
  }
  return out;
}

/** Wait before the next strike cluster, ms. */
export function nextGap(rng = Math.random) { return 2200 + Math.round(rng() * 3300); }

/* ── markup ────────────────────────────────────────────────────────────── */
const MOTES = [
  { x: 118, y: 292, s: 3, d: 9, l: 0 }, { x: 160, y: 318, s: 2, d: 11, l: -4 }, { x: 205, y: 300, s: 3, d: 8, l: -2 },
  { x: 244, y: 322, s: 2, d: 12, l: -7 }, { x: 272, y: 286, s: 3, d: 10, l: -5 }, { x: 92, y: 330, s: 2, d: 13, l: -9 },
];

export function huntFxHtml() {
  const motes = MOTES.map(m => `<i class="hfx-mote" style="left:${m.x}px;top:${m.y}px;width:${m.s}px;height:${m.s}px;animation-duration:${m.d}s;animation-delay:${m.l}s"></i>`).join('');
  const bolts = [0, 1, 2].map(() => '<g class="hfx-bolt"><path class="hfx-bg"/><path class="hfx-bc"/></g>').join('');
  return `<div class="hunt-fx" id="hunt-fx" aria-hidden="true">
    <div class="hfx-glow"></div>
    <div class="hfx-mist m1"></div><div class="hfx-mist m2"></div>
    ${motes}
    <svg class="hfx-bolts" viewBox="0 0 ${FX_BOX.w} ${FX_BOX.h}" width="${FX_BOX.w}" height="${FX_BOX.h}" fill="none" stroke-linecap="round" stroke-linejoin="round">${bolts}</svg>
    <div class="hfx-flash"></div>
  </div>`;
}

/* ── runtime ───────────────────────────────────────────────────────────── */
let _timer = null, _started = false;

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/** The gate is only worth animating while it is on screen. */
function visible(host) {
  if (!host || document.hidden) return false;
  const view = host.closest('section.view');
  if (view && !view.classList.contains('active')) return false;
  const box = host.parentElement || host;   // the fx wrapper is display:contents, so ask its parent
  return box.getClientRects().length > 0;
}

/** One strike cluster right now (the scheduler calls this; exported for review and tests). */
export function strikeNow(host, rng = Math.random) { fire(host, rng); }

function fire(host, rng = Math.random) {
  const groups = host.querySelectorAll('.hfx-bolt');
  const plan = strikePlan(rng);
  plan.forEach((b, i) => {
    const g = groups[i]; if (!g) return;
    const paths = g.querySelectorAll('path');
    paths.forEach(p => p.setAttribute('d', b.d));
    if (!g.animate) return;
    g.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 0.25, offset: 0.2 }, { opacity: 1, offset: 0.32 }, { opacity: 0.45, offset: 0.55 }, { opacity: 0 }],
      { duration: b.dur, delay: b.delay, easing: 'linear', fill: 'backwards' });
  });
  const flash = host.querySelector('.hfx-flash');
  if (flash && flash.animate) flash.animate([{ opacity: 0 }, { opacity: 0.6, offset: 0.1 }, { opacity: 0.15, offset: 0.3 }, { opacity: 0.4, offset: 0.45 }, { opacity: 0 }], { duration: 460, easing: 'ease-out' });
}

function loop() {
  _timer = null;
  const host = document.getElementById('hunt-fx');
  if (host && !reduced() && visible(host)) {
    fire(host);
    if (Math.random() < 0.4) setTimeout(() => { const h = document.getElementById('hunt-fx'); if (h && visible(h) && !reduced()) fire(h); }, 180 + Math.random() * 160);
  }
  _timer = setTimeout(loop, nextGap());
}

/** Idempotent: starts the strike scheduler once; the markup can be re-rendered freely. */
export function startHuntFx() {
  if (_started || typeof document === 'undefined') return;
  _started = true;
  const sync = () => {
    const paused = document.hidden;
    document.documentElement.classList.toggle('hfx-paused', paused);
    if (paused) { if (_timer) { clearTimeout(_timer); _timer = null; } }
    else if (!_timer) _timer = setTimeout(loop, 1200);
  };
  document.addEventListener('visibilitychange', sync);
  sync();
}
