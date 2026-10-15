/* =========================================================================
   PAST SESSIONS (BACKFILL)

   A Hunter can log a session they did on an earlier day: they pick the date
   in the logger and it goes through the normal save path, so XP, levels,
   stat training, PRs, the muscle map, the streak and raid damage all treat it
   exactly like a session logged live on that date.

   Every progression value is derived from the `workouts` collection, so a
   backfilled session is also what reconciliation would replay. Two light
   rules keep it honest:

     · the date must be today or in the past, at most BACKFILL_MAX_DAYS back
     · the same session cannot be logged twice for the same date

   Pure, so test/backfill.test.mjs exercises it without a browser.
   ========================================================================= */

import { shiftDay } from './streak.js';

export const BACKFILL_MAX_DAYS = 30;

/** Earliest date a session may be logged for, as 'YYYY-MM-DD'. */
export function earliestBackfillDate(today) {
  return shiftDay(today, -BACKFILL_MAX_DAYS);
}

/** Why a session cannot be logged for this date, or null if it can. */
export function backfillDateProblem(date, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'Pick the date you trained.';
  if (date > today) return 'That date has not happened yet. Pick today or an earlier day.';
  if (date < earliestBackfillDate(today)) {
    return `Past sessions can be logged up to ${BACKFILL_MAX_DAYS} days back.`;
  }
  return null;
}

/* A session's identity: its exercises and the numbers in each set, in order.
   Time of day and intensity chips are left out, so re-submitting the same
   session with a different time still reads as the same session. */
function sessionSignature(exercises) {
  return JSON.stringify((exercises || []).map(ex => [
    ex.name,
    (ex.sets || []).map(s => [Number(s.reps) || 0, Number(s.weight) || 0, Number(s.distKm) || 0]),
  ]));
}

/** True when `workouts` already holds this Hunter's identical session on `date`. */
export function isDuplicateSession(workouts, uid, date, exercises) {
  const sig = sessionSignature(exercises);
  return (workouts || []).some(w =>
    w && w.uid === uid && w.date === date && sessionSignature(w.exercises) === sig);
}

/** The later of two 'YYYY-MM-DD' dates; either may be missing. */
export function laterDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}
