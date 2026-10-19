/* =========================================================================
   PLAN INSIGHTS

   What the plan editor shows next to each workout and exercise, read from
   the plan and the sessions the Hunter has logged: weekly sets per muscle
   group (planned against what actually got trained), the last time and
   the trend of each exercise, and rough session length.

   Reads only. Nothing here changes a plan, XP, stats or stored workouts;
   the volume landmarks and the lift trend come from optimiser.js so the
   editor and the optimiser always agree.

   Pure, so test/plan-insights.test.mjs exercises it without a browser.
   ========================================================================= */

import { MUSCLE_GROUPS, groupCredit, plannedVolume, liftTrend, e1rm, STALL_KG_PER_WEEK } from './optimiser.js';
import { isRunDef, setLoad } from './set-inputs.js';

export { plannedVolume };

/** Minutes one working set takes including rest, for the session estimate. */
export const MINUTES_PER_SET = 2.5;
/** Weeks of logged sessions the "actually trained" volume averages over. */
export const ACTUAL_WEEKS = 4;

function shift(date, n) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function round1(v) { return Math.round(v * 10) / 10; }
function working(entry) { return ((entry && entry.sets) || []).filter(s => s && Number(s.reps) > 0); }

/** Average weekly hard sets per muscle group over the last few weeks. */
export function actualVolume(workouts, exercises, today, weeks = ACTUAL_WEEKS) {
  const since = shift(today, -weeks * 7);
  const out = {};
  Object.keys(MUSCLE_GROUPS).forEach(g => { out[g] = 0; });
  for (const w of workouts || []) {
    if (!w || !w.date || w.date <= since || w.date > today) continue;
    for (const e of w.exercises || []) {
      const def = exercises && exercises[e && e.name];
      if (!def || isRunDef(def)) continue;
      const n = working(e).length;
      if (!n) continue;
      for (const [group, c] of Object.entries(groupCredit(def))) out[group] += n * c;
    }
  }
  Object.keys(out).forEach(g => { out[g] = round1(out[g] / weeks); });
  return out;
}

/** Where a weekly set count sits against a group's landmarks. */
export function volumeStatus(group, sets) {
  const g = MUSCLE_GROUPS[group];
  if (!g) return { key: 'none', label: '' };
  if (!(sets > 0)) return { key: 'none', label: 'Not trained' };
  if (sets < g.mev) return { key: 'low', label: 'Below minimum' };
  if (sets > g.mrv) return { key: 'high', label: 'Past maximum' };
  if (sets < g.mav) return { key: 'ok', label: 'Building' };
  return { key: 'good', label: 'In range' };
}

/** One row per muscle group: planned, actually trained, landmarks, status. */
export function volumeRows(program, exercises, workouts, today) {
  const planned = plannedVolume(program, exercises || {}).volume;
  const actual = actualVolume(workouts, exercises, today);
  return Object.entries(MUSCLE_GROUPS).map(([group, g]) => ({
    group, planned: planned[group] || 0, actual: actual[group] || 0,
    mev: g.mev, mav: g.mav, mrv: g.mrv, status: volumeStatus(group, planned[group] || 0),
  }));
}

/** Estimated e1RM per logged session of a lift, oldest first. */
export function liftSeries(name, workouts, today, days = 56) {
  const since = shift(today, -days);
  const points = [];
  for (const w of workouts || []) {
    if (!w || !w.date || w.date < since || w.date > today) continue;
    for (const e of w.exercises || []) {
      if (!e || e.name !== name) continue;
      const top = Math.max(0, ...working(e).filter(s => setLoad(s) === 'kg').map(s => e1rm(s.weight, s.reps)));
      if (top) points.push({ date: w.date, value: top });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** The most recent logged session of an exercise: date and its heaviest set. */
export function lastSession(name, workouts, today) {
  let best = null;
  for (const w of workouts || []) {
    if (!w || !w.date || w.date > today) continue;
    for (const e of w.exercises || []) {
      if (!e || e.name !== name) continue;
      const sets = working(e);
      if (!sets.length) continue;
      if (!best || w.date > best.date) {
        const top = sets.reduce((a, s) => ((Number(s.weight) || 0) > (Number(a.weight) || 0) ? s : a), sets[0]);
        best = { date: w.date, sets: sets.length, weight: Number(top.weight) || 0, reps: Number(top.reps) || 0, load: setLoad(top) };
      }
    }
  }
  return best;
}

/**
 * Where an exercise stands: never logged, still building a history, moving
 * up, or stalled. Only kg lifts have a trend; other loads are "tracking".
 */
export function exerciseInsight(name, workouts, today, prBest = 0) {
  const last = lastSession(name, workouts, today);
  if (!last) return { status: 'new', last: null, best: 0, rate: null, series: [] };
  const trend = liftTrend(name, workouts, today, prBest);
  const series = liftSeries(name, workouts, today);
  let status = 'tracking';
  if (last.load === 'kg') {
    if (trend.rate == null) status = 'building';
    else status = trend.rate >= STALL_KG_PER_WEEK ? 'progressing' : 'stalled';
  }
  return { status, last, best: trend.best, rate: trend.rate, series };
}

/** Working sets, rough minutes, and the groups a workout day trains most. */
export function dayStats(day, exercises) {
  let sets = 0;
  const tally = {};
  for (const ex of (day && day.exercises) || []) {
    const def = exercises && exercises[ex.name];
    if (!def || isRunDef(def)) continue;
    const n = Number(ex.sets) || 0;
    sets += n;
    for (const [group, c] of Object.entries(groupCredit(def))) tally[group] = (tally[group] || 0) + n * c;
  }
  const groups = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  return { sets, minutes: Math.round(sets * MINUTES_PER_SET / 5) * 5, groups };
}

/** Optimiser suggestions grouped by the workout day they change; goal notes
    and anything that changes nothing go under "plan". */
export function suggestionsByDay(suggestions) {
  const byDay = {}, plan = [];
  (suggestions || []).forEach((s, i) => {
    const di = s && s.change ? s.change.dayIndex : null;
    if (di == null) plan.push({ s, i });
    else (byDay[di] = byDay[di] || []).push({ s, i });
  });
  return { byDay, plan };
}
