/* =========================================================================
   SET TIMER

   The logger's built-in clocks: a hold timer inside each hold set (planks,
   planches, levers, stretches) and the rest countdown between sets. When a
   set is done the rest for that exercise counts down on its own, and when it
   reaches zero the next set's hold timer starts after a short get-ready.

   Rest per exercise comes from the exercise itself (heavy lifts rest longer
   than isolation work, skill holds longer than stretches), nudged by the
   plan's goal. The Hunter's own ±15s adjustments are remembered per
   exercise on the device and win from then on.

   Presentation only. A finished hold writes its seconds into the same input
   the Hunter types into, so the stored set is exactly what it was before.

   Pure, so test/set-timer.test.mjs exercises it without a browser.
   ========================================================================= */

import { setInputKind } from './set-inputs.js';

export const REST_STEP = 15;
export const REST_MIN = 15;
export const REST_MAX = 600;
/** Seconds of "get ready" before an automatically started hold. */
export const HOLD_LEAD_IN = 3;

/** A rest length kept on the 15s grid and inside sane bounds. */
export function clampRest(secs) {
  const n = Math.round((Number(secs) || 0) / REST_STEP) * REST_STEP;
  return Math.min(REST_MAX, Math.max(REST_MIN, n));
}

/** The rest the exercise itself calls for, before any goal or saved choice. */
export function baseRestSecs(def) {
  const d = def || {};
  const kind = setInputKind(d);
  if (d.intent === 'mobility') return 30;
  if (kind === 'distance' || kind === 'duration') return 60;
  if (kind === 'cardio') return 45;
  if (kind === 'hold') return d.intent === 'skill' ? 120 : 60;
  if (d.intent === 'skill') return 120;
  if (d.intent === 'strength') return kind === 'weight_reps' ? 150 : 120;
  if (d.intent === 'hypertrophy') return 90;
  if (d.intent === 'endurance' || d.intent === 'plyometric' || d.intent === 'explosive') return 60;
  return 90;
}

/** Rest between sets of an exercise. A saved choice wins; otherwise the
    exercise's own rest, longer on a strength plan and shorter on an
    endurance plan. */
export function restSecsFor(def, { goal, saved } = {}) {
  const s = Number(saved);
  if (s > 0) return clampRest(s);
  let r = baseRestSecs(def);
  if (goal === 'strength' && (def || {}).intent !== 'mobility') r = Math.max(r, Math.round(r * 1.25));
  if (goal === 'endurance') r = Math.min(r, 60);
  return clampRest(r);
}

/** A rest length moved by delta seconds, kept in bounds. */
export function adjustRest(secs, delta) { return clampRest((Number(secs) || 0) + delta); }

/** m:ss for a clock face. Negative or missing reads 0:00. */
export function formatClock(secs) {
  const t = Math.max(0, Math.floor(Number(secs) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** The set that comes next, from the logger's exercises in order:
    rows = [{ sets: [bool complete, ...] }, ...]. The next open set of the
    same exercise first, then the first open set of any later exercise, then
    an open set earlier on. Null when every set is done. */
export function nextOpenSet(rows, fromRow = 0) {
  const list = rows || [];
  const firstOpen = r => (list[r] && list[r].sets || []).findIndex(done => !done);
  const order = [...list.keys()].slice(fromRow).concat([...list.keys()].slice(0, fromRow));
  for (const r of order) {
    const s = firstOpen(r);
    if (s >= 0) return { row: r, set: s };
  }
  return null;
}

/** Where a running hold stands against the last time's hold. */
export function holdProgress(elapsed, target) {
  const t = Number(target) || 0;
  const e = Math.max(0, Number(elapsed) || 0);
  if (!(t > 0)) return { pct: 0, beat: false, left: 0 };
  return { pct: Math.min(1, e / t), beat: e > t, left: Math.max(0, Math.ceil(t - e)) };
}

/** Whole seconds a hold ran, from start and stop times in ms. */
export function heldSecs(startMs, stopMs) {
  return Math.max(0, Math.round(((Number(stopMs) || 0) - (Number(startMs) || 0)) / 1000));
}
