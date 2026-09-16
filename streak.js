/* =========================================================================
   STREAK ENGINE

   A streak is a run of CONSECUTIVE QUALIFYING CALENDAR DAYS ending today.
   A day qualifies if any of these is true:

     workout   a workout was logged that date
     rest      the date falls on a weekday the programme does not schedule
     freeze    the date falls inside the user's streakFreeze window
     backfill  the date is before STREAK_RULES_START and falls inside a
               recorded historical backfill window (see below)

   Anything else breaks the run.

   TODAY IS IN PROGRESS. A day with no workout yet is not a break until it is
   over. The walk therefore starts at today when today already qualifies, and
   at yesterday when it does not — so a Hunter who has not trained yet at 14:00
   still sees their streak, and only loses it tomorrow if today ends with
   nothing.

   WHY THIS LIVES IN ITS OWN FILE
   index.html is a single 19k-line document with no test surface. The streak
   feeds STREAK_XP_MULT and therefore stored XP, so it is the last thing that
   should be untestable. This module is pure — it takes plain data and returns
   a number — so it can be exercised directly by test/streak.test.mjs and
   reused by the migration script without a browser.

   Imported by index.html alongside exercises.js and the chain modules.
   ========================================================================= */

/* The boundary between "grandfathered history" and the strict rules.
   Before it, recorded backfill windows are honoured. From it onward there is
   no automatic forgiveness: a missed day with no rest day and no freeze breaks
   the streak. */
export const STREAK_RULES_START = '2026-09-16';

/* Mon-first, matching WEEKDAYS and todayWeekday() in index.html. */
export const STREAK_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* Date helpers operate on 'YYYY-MM-DD' strings anchored at local noon, which
   keeps them clear of DST transitions and of the timezone shift todayStr()
   applies. They never construct a date from a bare ISO string, because that is
   parsed as UTC and lands on the wrong day west of Greenwich. */
export function shiftDay(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekdayOf(dateStr) {
  // getDay() is Sun-first; shift to the Mon-first table the app uses.
  return STREAK_WEEKDAYS[(new Date(dateStr + 'T12:00:00').getDay() + 6) % 7];
}

/**
 * Why a single date qualifies, or null if it does not.
 *
 * @param dateStr  'YYYY-MM-DD'
 * @param ctx      {
 *                   workoutDates: Set<string>,   // distinct dates trained
 *                   schedule:     string[],      // programme training weekdays
 *                   freeze:       {from,to,active}|null,
 *                   backfill:     [{from,to,...}],
 *                   rulesStart:   string         // optional override, for tests
 *                 }
 * @returns 'workout' | 'rest' | 'freeze' | 'backfill' | null
 */
export function dayState(dateStr, ctx) {
  if (!dateStr || !ctx) return null;

  // A workout always qualifies, and several on one date still qualify once —
  // the caller passes a Set of dates, not a list of documents.
  if (ctx.workoutDates && ctx.workoutDates.has(dateStr)) return 'workout';

  /* A session the Hunter entered but which could not be written — the save
     failed, or they were offline. It is held locally and retried, and until it
     lands it protects the streak so an app fault cannot cost someone their run.
     It is deliberately NOT in workoutDates, so it never counts toward session
     totals, XP, PRs or volume: it buys time, it does not award progress. */
  if (ctx.pendingDates && ctx.pendingDates.has(dateStr)) return 'pending';

  /* A schedule of seven days (or none) means every day is a training day, so
     there are no rest days to grant. Legacy programmes default to all seven,
     which is why this must be length-checked rather than assumed. */
  const sched = ctx.schedule;
  if (Array.isArray(sched) && sched.length > 0 && sched.length < 7) {
    if (!sched.includes(weekdayOf(dateStr))) return 'rest';
  }

  const f = ctx.freeze;
  if (f && f.from) {
    if (f.active && dateStr >= f.from) return 'freeze';
    if (f.to && dateStr >= f.from && dateStr <= f.to) return 'freeze';
  }

  /* Historical backfill only ever applies before the boundary. A window that
     overlaps it is honoured up to the boundary and no further, so a stale
     migration can never grant forgiveness under the new rules. */
  const rulesStart = ctx.rulesStart || STREAK_RULES_START;
  if (dateStr < rulesStart && Array.isArray(ctx.backfill)) {
    for (const w of ctx.backfill) {
      if (w && w.from && w.to && dateStr >= w.from && dateStr <= w.to) return 'backfill';
    }
  }
  return null;
}

/**
 * Consecutive qualifying days ending today.
 *
 * Future dates are never visited — the walk only ever moves backwards from
 * today — so a workout logged ahead of time cannot inflate the number.
 *
 * @param ctx    as above, plus `today` ('YYYY-MM-DD') which callers pass from
 *               the app's own todayStr() so the date convention stays in one
 *               place.
 */
export function computeStreakFrom(ctx) {
  if (!ctx || !ctx.workoutDates || ctx.workoutDates.size === 0) return 0;
  const today = ctx.today;
  if (!today) return 0;

  // Today is in progress: an unqualified today is not yet a break.
  let cursor = dayState(today, ctx) ? today : shiftDay(today, -1);

  let streak = 0;
  // Bound the walk so a corrupt date can never spin: ten years is far past any
  // real history, and the loop also stops the moment a day fails to qualify.
  for (let guard = 0; guard < 3660; guard++) {
    if (!dayState(cursor, ctx)) break;
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Same walk, but returns the reason for each day — used by the migration and
 *  by tests to explain a result rather than just assert a number. */
export function explainStreak(ctx) {
  const out = [];
  if (!ctx || !ctx.today) return out;
  let cursor = dayState(ctx.today, ctx) ? ctx.today : shiftDay(ctx.today, -1);
  for (let guard = 0; guard < 3660; guard++) {
    const state = dayState(cursor, ctx);
    if (!state) { out.push({ date: cursor, state: null }); break; }
    out.push({ date: cursor, state });
    cursor = shiftDay(cursor, -1);
  }
  return out;
}
