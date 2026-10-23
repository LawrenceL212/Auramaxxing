/* =========================================================================
   REMINDERS: which push reminder (if any) to send a Hunter right now

   Pure. Takes plain data, returns a decision, touches nothing. It is read by
   the Cloud Function `sendReminders` (functions/lib/reminders.mjs is a byte
   copy of this file, see test/reminders.test.mjs which fails if they drift)
   and tested by test/reminders.test.mjs.

   THE TWO REMINDERS
     planned   "Today is on your plan" - sent once, in the first whole hour at or
               after the Hunter's usual logging time, if they have not trained.
               The usual time is learned from the last 6 weeks of workout
               times (median), or 17:00 until there are enough sessions, or the
               Hunter's own pushPrefs.usualTime when they have set one.
     evening   "Your streak is still alive" - sent at 20:00 local, only when a
               streak of 2+ days would break if today ends with no session.

   RULES THAT ALWAYS HOLD
     - never when the Hunter already trained today (their local date)
     - never during quiet hours, 22:00-07:00 in their own timezone
     - never more than MAX_PER_DAY (2) a day; where both reminders fall in the
       same hour only one is sent (the streak one, it is the more useful)
     - never on a rest day, never while a streak freeze is active
     - never without a stored timezone: a wrong-hour buzz is worse than none
     - no guilt, no "you will lose", no urgency theatre. Copy states the fact
       and what is easy to do, and every reminder can be switched off in
       Settings.

   STATELESS ON PURPOSE. The sender is read-only, so it cannot remember what it
   already sent. Instead each reminder has exactly one hour slot per day and the
   function runs hourly, so it fires once. (`sentToday` lets a caller that does
   track sends enforce the hard cap too.)
   ========================================================================= */

import { computeStreakFrom, dayState, shiftDay, weekdayOf } from './streak.mjs';

export const MAX_PER_DAY = 2;
export const QUIET_START = 22;      // 22:00 local, inclusive
export const QUIET_END = 7;         // 07:00 local, exclusive
export const EVENING_HOUR = 20;     // streak-at-risk slot
export const DEFAULT_USUAL_MIN = 17 * 60;
export const LEARN_WEEKS = 6;
export const LEARN_MIN_SESSIONS = 3;
export const MIN_STREAK_TO_WARN = 2;
export const PLANNED_SLOT_MIN = 8;  // clamp so the slot never lands in quiet hours
export const PLANNED_SLOT_MAX = 21;

export const isQuietHour = (h) => h >= QUIET_START || h < QUIET_END;

/** Local calendar date, hour and minute in an IANA timezone. null if the zone is invalid. */
export function localParts(nowMs, tz) {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const p = {};
    for (const part of fmt.formatToParts(new Date(nowMs))) p[part.type] = part.value;
    const hour = Number(p.hour) % 24;
    return { date: `${p.year}-${p.month}-${p.day}`, hour, minute: Number(p.minute) };
  } catch (_) { return null; }
}

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};

/** Usual logging time in minutes since midnight, from the last 6 weeks of sessions. */
export function learnUsualMinutes(workouts, today) {
  const since = shiftDay(today, -LEARN_WEEKS * 7);
  const mins = [];
  for (const w of workouts || []) {
    if (!w || !w.date || w.date < since || w.date > today) continue;
    const m = toMin(w.time);
    if (m !== null) mins.push(m);
  }
  if (mins.length < LEARN_MIN_SESSIONS) return DEFAULT_USUAL_MIN;
  mins.sort((a, b) => a - b);
  const mid = mins.length >> 1;
  return mins.length % 2 ? mins[mid] : Math.round((mins[mid - 1] + mins[mid]) / 2);
}

/** The hour the planned-day nudge goes out: first whole hour at or after the usual time. */
export function plannedSlotHour(usualMin) {
  return Math.min(PLANNED_SLOT_MAX, Math.max(PLANNED_SLOT_MIN, Math.ceil(usualMin / 60)));
}

/** Copy. Plain statements and an easy next step; nothing about loss or guilt. */
export function reminderCopy(type, { streak = 0 } = {}) {
  if (type === 'evening') {
    return {
      title: 'Your streak is still going',
      body: `${streak} days running. A short session today keeps it that way, and Quick 15 counts. Reminders can be turned off in Settings.`,
    };
  }
  return {
    title: 'Today is on your plan',
    body: 'Your gate is open whenever you are ready. Reminders can be turned off in Settings.',
  };
}

/**
 * @param in.now        ms since epoch
 * @param in.prefs      pushPrefs { enabled, planned, evening, usualTime 'HH:MM'?, tz }
 * @param in.workouts   [{ date 'YYYY-MM-DD', time 'HH:MM'? }]  the Hunter's own sessions (recent is enough)
 * @param in.schedule   programme weekdays ['Mon', ...]; empty means no plan
 * @param in.freeze     users/{uid}.streakFreeze
 * @param in.backfill   users/{uid}.streakBackfill
 * @param in.sentToday  reminders already sent today (default 0)
 * @returns { send:false, reason } | { send:true, type, title, body, tag }
 */
export function decideReminder({ now, prefs, workouts = [], schedule = [], freeze = null, backfill = [], sentToday = 0 } = {}) {
  const no = (reason) => ({ send: false, reason });
  if (!prefs || !prefs.enabled) return no('disabled');
  if (!prefs.tz) return no('no-timezone');
  const t = localParts(now, prefs.tz);
  if (!t) return no('bad-timezone');
  if (isQuietHour(t.hour)) return no('quiet-hours');
  if (sentToday >= MAX_PER_DAY) return no('daily-cap');

  const dates = new Set((workouts || []).filter(w => w && w.date).map(w => w.date));
  if (dates.has(t.date)) return no('trained-today');

  const ctx = { today: t.date, workoutDates: dates, schedule, freeze, backfill };
  const todayState = dayState(t.date, ctx);   // null | 'rest' | 'freeze' | 'backfill'
  if (todayState === 'rest') return no('rest-day');
  if (todayState === 'freeze') return no('frozen');

  const streak = computeStreakFrom(ctx);      // today is unqualified, so this is the run through yesterday
  const eveningOn = prefs.evening !== false;
  const plannedOn = prefs.planned !== false;

  const eveningDue = eveningOn && t.hour === EVENING_HOUR && streak >= MIN_STREAK_TO_WARN;
  if (eveningDue) return { send: true, type: 'evening', tag: 'streak-' + t.date, ...reminderCopy('evening', { streak }) };

  if (plannedOn && Array.isArray(schedule) && schedule.includes(weekdayOf(t.date))) {
    const override = toMin(prefs.usualTime);
    const usual = override !== null ? override : learnUsualMinutes(workouts, t.date);
    if (t.hour === plannedSlotHour(usual)) return { send: true, type: 'planned', tag: 'planned-' + t.date, ...reminderCopy('planned') };
  }
  return no('not-due');
}
