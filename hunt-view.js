/* =========================================================================
   HUNT SCREEN — the small pure pieces

   The week strip, the muscle chips, the time estimate, the last-time set, the
   "up next" day and the "last weighed" count on the Hunt screen. Nothing here
   reads or writes stored state: every function takes what it needs and returns
   plain data, so the rendering code in index.html stays presentation only and
   test/hunt-view.test.mjs can exercise it without a browser.
   ========================================================================= */

import { shiftDay, weekdayOf, STREAK_WEEKDAYS } from './streak.js';
import { weekStartOf } from './plan-day.js';

/**
 * The weekdays the plan trains on, or null when every day is a training day.
 * Fixed mode trusts the days' own `assignedDays` (the plan-level schedule can
 * be stale or empty); rotation uses the plan's schedule. This mirrors the
 * isScheduledToday rule the Hunt card already uses.
 */
export function scheduledWeekdays(program) {
  if (!program) return null;
  const days = Array.isArray(program.days) ? program.days : [];
  const fixed = program.scheduleMode === 'fixed' && days.some(d => (d.assignedDays || []).length);
  if (fixed) {
    const set = new Set(days.flatMap(d => d.assignedDays || []));
    return STREAK_WEEKDAYS.filter(w => set.has(w));
  }
  const sched = Array.isArray(program.schedule) ? program.schedule : [];
  if (!sched.length || sched.length >= 7) return null;
  return STREAK_WEEKDAYS.filter(w => sched.includes(w));
}

/**
 * Seven entries, Monday to Sunday, for the week containing `today`.
 *   state  'done'      trained that day
 *          'rest'      not a training day in the plan
 *          'pending'   a training day, today, not yet trained
 *          'missed'    a past training day with no session
 *          'upcoming'  a future training day
 *   isToday    marks today's circle whatever its state
 *   scheduled  whether the plan trains on that weekday
 */
export function weekStrip({ today, program, workoutDates }) {
  const dates = workoutDates instanceof Set ? workoutDates : new Set(workoutDates || []);
  const sched = scheduledWeekdays(program);
  const start = weekStartOf(today);
  return STREAK_WEEKDAYS.map((weekday, i) => {
    const date = shiftDay(start, i);
    const isToday = date === today;
    let state;
    if (date <= today && dates.has(date)) state = 'done';
    else if (sched && !sched.includes(weekday)) state = 'rest';
    else if (isToday) state = 'pending';
    else if (date < today) state = 'missed';
    else state = 'upcoming';
    return { date, weekday, letter: weekday[0], state, isToday, scheduled: !sched || sched.includes(weekday) };
  });
}

/** Trained days against training days this week. */
export function weekProgress(strip) {
  const planned = strip.filter(d => d.scheduled).length;
  const trained = strip.filter(d => d.state === 'done').length;
  return { trained, planned: Math.max(planned, trained) };
}

/** Whole days from `from` to `to` ('YYYY-MM-DD'). */
export function daysBetween(from, to) {
  const t = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(to) - t(from)) / 86400000);
}

/** Newest date among any number of lists of `{ date }` entries; null if none. */
export function latestDate(...lists) {
  let best = null;
  for (const list of lists) for (const e of list || []) {
    if (e && typeof e.date === 'string' && (best === null || e.date > best)) best = e.date;
  }
  return best;
}

/** "Today", "1 day ago", "19 days ago", or "Never" when there is no date. */
export function agoLabel(date, today) {
  if (!date) return 'Never';
  const d = daysBetween(date, today);
  if (d <= 0) return 'Today';
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

/** A rough session length: about three minutes a set, to the nearest five. 0 when no sets. */
export function estimateMinutes(exercises) {
  const sets = totalSets(exercises);
  if (!sets) return 0;
  return Math.max(5, Math.round(sets * 3 / 5) * 5);
}

/** Sets planned across a day's exercises. */
export function totalSets(exercises) {
  return (exercises || []).reduce((n, e) => n + (Number(e && e.sets) || 0), 0);
}

const MUSCLE_GROUP = [
  [/chest$/i, 'Chest'], [/shoulders$/i, 'Shoulders'], [/abs$/i, 'Abs'],
];
function muscleGroup(name) {
  for (const [re, label] of MUSCLE_GROUP) if (re.test(name)) return label;
  return name;
}

/**
 * The muscle groups a day works most, by sets x emphasis, using the exercise
 * database's own `muscles` map (0-1). Upper/Middle/Lower chest, the three
 * shoulder heads and the three ab regions read as one chip each.
 */
export function topMuscles(exercises, db, n = 3) {
  const score = new Map();
  for (const ex of exercises || []) {
    const sets = Number(ex && ex.sets) || 1;
    const muscles = (db && db[ex.name] && db[ex.name].muscles) || {};
    for (const [m, w] of Object.entries(muscles)) {
      const g = muscleGroup(m);
      score.set(g, (score.get(g) || 0) + sets * (Number(w) || 0));
    }
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(e => e[0]);
}

/** Stroke maths for a progress ring of radius r: circumference and filled length. */
export function ringArc(done, total, r) {
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return { circ, dash: circ * frac, frac };
}

/**
 * The top set of the most recent session (before `before`, if given) that
 * included `name`: heaviest weight, then most reps. null with no history.
 */
export function lastSet(workouts, uid, name, before) {
  let best = null;
  for (const w of workouts || []) {
    if (!w || w.uid !== uid || !Array.isArray(w.exercises)) continue;
    if (before && !(w.date < before)) continue;
    if (best && !(w.date > best.date)) continue;
    const ex = w.exercises.find(e => e && e.name === name);
    const sets = ex && (ex.sets || []).filter(s => Number(s.reps) > 0);
    if (!sets || !sets.length) continue;
    const top = sets.reduce((a, s) =>
      (Number(s.weight) || 0) > (Number(a.weight) || 0) ||
      ((Number(s.weight) || 0) === (Number(a.weight) || 0) && Number(s.reps) > Number(a.reps)) ? s : a);
    best = { date: w.date, weight: Number(top.weight) || 0, reps: Number(top.reps) || 0 };
  }
  return best;
}

/**
 * "60kg × 8 × 4": the top set of last time and the planned number of sets.
 * No kg on the set reads "BW × 10 × 3" for a bodyweight move and "10 × 3" otherwise;
 * timed moves read "45s × 3" ("20m" for minutes). "" with no history.
 */
export function lastTimeLabel(set, { timed = false, timedUnit = 'secs', bodyweight = false } = {}, sets) {
  if (!set) return '';
  const tail = sets ? ` × ${sets}` : '';
  if (timed) return `${set.reps}${timedUnit === 'mins' ? 'm' : 's'}${tail}`;
  if (set.weight > 0) return `${Math.round(set.weight * 100) / 100}kg × ${set.reps}${tail}`;
  return `${bodyweight ? 'BW × ' : ''}${set.reps}${tail}`;
}

/**
 * The next planned day after today's, for the "up next" row, or null.
 *   fixed:    the next weekday (after today, wrapping) that has a plan day
 *   rotation: the day the rotation reaches next: the current one once today is
 *             trained (a save has already moved it on), otherwise the one after
 * Returns { index, when } where `when` is 'Tomorrow', a weekday ('Fri'), or
 * 'Day 2' for rotation.
 */
export function upNext({ program, today, trainedToday }) {
  const days = program && Array.isArray(program.days) ? program.days : [];
  if (days.length < 2) return null;
  const fixed = program.scheduleMode === 'fixed' && days.some(d => (d.assignedDays || []).length);
  if (fixed) {
    for (let step = 1; step <= 7; step++) {
      const date = shiftDay(today, step);
      const wd = weekdayOf(date);
      const index = days.findIndex(d => (d.assignedDays || []).includes(wd));
      if (index >= 0) return { index, when: step === 1 ? 'Tomorrow' : wd };
    }
    return null;
  }
  const cur = (Number(program.currentDayIndex) || 0) % days.length;
  const index = trainedToday ? cur : (cur + 1) % days.length;
  return { index, when: `Day ${index + 1}` };
}

/** "3H 12M LEFT" style countdown to the end of the day; secs <= 0 reads "0M LEFT". */
export function leftLabel(secs) {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}H ${String(m).padStart(2, '0')}M LEFT` : `${m}M LEFT`;
}
