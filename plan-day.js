/* =========================================================================
   PLAN DAY FOR A PAST SESSION

   A session logged for an earlier date should count as the planned day it
   was, not as an extra. The logger offers the programme's days next to the
   date; the pick is stored in the existing `programDayIndex` field and
   nothing else.

   Rotation is the delicate part. A live save moves the rotation on
   (`currentDayIndex`) and stamps the day's `lastDate`. A past session must
   not drag that state around, so it only moves the rotation when it is
   unmistakably the next step: the day picked is the one the rotation is
   waiting on, and the session is no older than the latest session already
   logged. Otherwise it is just tagged to its day.

   Pure, so test/plan-day.test.mjs exercises it without a browser.
   ========================================================================= */

import { shiftDay, weekdayOf, STREAK_WEEKDAYS } from './streak.js';

/** Monday of the week containing `date`, as 'YYYY-MM-DD'. */
export function weekStartOf(date) {
  return shiftDay(date, -STREAK_WEEKDAYS.indexOf(weekdayOf(date)));
}

/** True when this Hunter already has a session tagged to day `idx` in the week of `date`. */
export function dayDoneInWeek(workouts, uid, idx, date) {
  const start = weekStartOf(date);
  const end = shiftDay(start, 6);
  return (workouts || []).some(w =>
    w && w.uid === uid && w.date >= start && w.date <= end &&
    w.programDayIndex !== null && w.programDayIndex !== undefined &&
    Number(w.programDayIndex) === idx);
}

function hasDays(program) {
  return !!(program && Array.isArray(program.days) && program.days.length);
}

/**
 * The plan day a session on `date` most likely was, or null for "extra".
 *   fixed:    the day assigned to that weekday that is not already ticked
 *             that week (days with exercises first)
 *   rotation: the day the rotation is waiting on, but only for dates in the
 *             current week; older dates have no knowable position
 */
export function defaultPlanDay({ program, date, today, workouts, uid }) {
  if (!hasDays(program) || !date) return null;
  const days = program.days;
  if (program.scheduleMode === 'fixed') {
    const wd = weekdayOf(date);
    const cands = days
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => (d.assignedDays || []).includes(wd))
      .sort((a, b) => (b.d.exercises?.length ? 1 : 0) - (a.d.exercises?.length ? 1 : 0));
    const open = cands.find(({ i }) => !dayDoneInWeek(workouts, uid, i, date));
    return open ? open.i : null;
  }
  if (!today || weekStartOf(date) !== weekStartOf(today)) return null;
  return (Number(program.currentDayIndex) || 0) % days.length;
}

/** Options for the selector: index, name, assigned weekdays, and whether it is ticked that week. */
export function planDayOptions({ program, date, workouts, uid }) {
  if (!hasDays(program)) return [];
  const fixed = program.scheduleMode === 'fixed';
  return program.days.map((d, index) => ({
    index,
    name: d.name || `Day ${index + 1}`,
    assignedDays: fixed ? (d.assignedDays || []) : [],
    done: fixed ? dayDoneInWeek(workouts, uid, index, date) : false,
  }));
}

/**
 * Should saving a session on `date` for day `idx` advance the rotation?
 * Live (today) saves keep their existing behaviour: rotation mode advances.
 * Past saves advance only when the day is the one the rotation is waiting on
 * and nothing newer has been logged.
 */
export function shouldAdvanceRotation({ program, idx, date, today, lastWorkoutDate }) {
  if (!hasDays(program) || program.scheduleMode === 'fixed') return false;
  if (idx === null || idx === undefined) return false;
  if (date >= today) return true;
  const waiting = (Number(program.currentDayIndex) || 0) % program.days.length;
  return idx === waiting && date >= (lastWorkoutDate || '');
}

/**
 * Which plan day a session with no plan day (an extra, such as Quick 15) may
 * tick on the quest cards. Only a day that is up today can be ticked by it:
 * the rotation's current day, or a fixed day assigned to today's weekday.
 * Among those, the day sharing the most exercises wins, and a day sharing none
 * is never picked. Returns the day index, or null.
 * (It used to pick the best match over every day, and a tie of zero went to
 * day 1, so an extra could tick tomorrow's quest.)
 */
export function dayCreditedToExtra({ program, exerciseNames, todayWeekdayName }) {
  if (!hasDays(program)) return null;
  const names = new Set(exerciseNames || []);
  const days = program.days;
  const fixed = program.scheduleMode === 'fixed';
  const rotationIdx = (Number(program.currentDayIndex) || 0) % days.length;
  let best = null, bestOverlap = 0;
  days.forEach((d, i) => {
    const up = fixed ? (d.assignedDays || []).includes(todayWeekdayName) : i === rotationIdx;
    if (!up) return;
    const overlap = (d.exercises || []).filter(e => names.has(e.name)).length;
    if (overlap > bestOverlap) { best = i; bestOverlap = overlap; }
  });
  return best;
}

/**
 * True when workout `w` is tagged to plan day `idx`. An extra session (Quick 15,
 * a free log) stores programDayIndex null, and Number(null) is 0, so a bare
 * Number() comparison made every extra count as day 0 of a fixed plan.
 */
export function isTaggedToDay(w, idx) {
  if (!w || w.programDayIndex === null || w.programDayIndex === undefined || w.programDayIndex === '') return false;
  return Number(w.programDayIndex) === Number(idx);
}
