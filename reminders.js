/* =========================================================================
   REMINDERS: which push reminder (if any) to send a Hunter right now

   Pure. Takes plain data, returns a decision, touches nothing. It is read by
   the Cloud Function `sendReminders` (functions/lib/reminders.mjs is a byte
   copy of this file, see test/reminders.test.mjs which fails if they drift)
   and tested by test/reminders.test.mjs.

   THE TWO REMINDERS
     planned   "A gate has opened" - sent once, in the first whole hour at or
               after the Hunter's usual logging time, if they have not trained.
               The usual time is learned from the last 6 weeks of workout
               times (median), or 17:00 until there are enough sessions, or the
               Hunter's own pushPrefs.usualTime when they have set one.
     evening   "Streak is at N" - sent at 20:00 local, only when a
               streak of 2+ days would break if today ends with no session.

   AND ONE THAT IS NOT ABOUT TRAINING (decideWeighIn)
     weighin   "Step on the scale" - sent at 08:00 local when the Hunter has not
               weighed in yet today (pushPrefs.weighin, on unless switched off).
               Rest days, trained days and the training cap do not apply: it is
               its own daily note. Not sent while a streak freeze is active, and
               not in an hour where a training reminder already goes out.

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

import { computeStreakFrom, dayState, shiftDay, weekdayOf } from './streak.js';

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
export const WEIGHIN_HOUR = 8;      // morning, before breakfast

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

/* ── COPY: the System speaks ───────────────────────────────────────────────
   Each reminder type has a pool of messages in the game's voice. Which one a
   Hunter gets is a pure function of (uid, type, calendar day), so it varies
   between Hunters and days but is reproducible, and never repeats on
   consecutive days (the index steps by a number coprime to the pool size).
   Facts come from data the sender already has: the plan day's name, its
   exercise count and rough length, and the streak. No guilt, no loss framing,
   no "!"; titles <= 40 and bodies <= 110 characters so iOS lock screens show
   them whole. */
export const COPY_MAX_TITLE = 40;
export const COPY_MAX_BODY = 110;

const hash = (str) => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const dayNumber = (date) => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);

/** Index into a pool of `n`: deterministic per (seed, date), different on consecutive days. */
export function pickIndex(n, seed, date) {
  if (n <= 1) return 0;
  const h = hash(seed);
  const offset = h % n;
  let step = 1 + ((h >>> 8) % (n - 1));
  while (gcd(step, n) !== 1) step = (step % (n - 1)) + 1;
  return (offset + dayNumber(date) * step) % n;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** "Push. 5 exercises, about 50 min." Skips whatever is unknown. */
function planFacts(c) {
  const bits = [];
  if (c.exercises > 0) bits.push(plural(c.exercises, 'exercise'));
  if (c.mins > 0) bits.push(`about ${c.mins} min`);
  const tail = bits.join(', ');
  if (c.dayName && tail) return `${c.dayName}. ${tail}.`;
  if (c.dayName) return `${c.dayName}.`;
  return tail ? `${tail[0].toUpperCase()}${tail.slice(1)}.` : '';
}
const runBit = (c) => (c.run >= 2 ? ` ${c.run} mornings in a row so far.` : '');
const streakBit = (c) => (c.streak >= 2 ? ` Your streak is at ${c.streak}.` : '');

const POOLS = {
  planned: [
    (c) => ({ title: '[SYSTEM] A gate has opened', body: planFacts(c) ? `Today: ${planFacts(c)}${streakBit(c)}` : `Your plan has a quest for today.${streakBit(c)}` }),
    (c) => ({ title: '[SYSTEM] Daily quest available', body: planFacts(c) ? `${planFacts(c)} The gate waits for you.${streakBit(c)}` : `Today's gate is ready when you are.${streakBit(c)}` }),
    (c) => ({ title: '[SYSTEM] You are cleared to enter', body: planFacts(c) ? `Today's dungeon: ${planFacts(c)}` : `A dungeon is open on your plan today.${streakBit(c)}` }),
    (c) => ({ title: '[SYSTEM] A new quest has arrived', body: planFacts(c) ? `${planFacts(c)} Ready when you are.${streakBit(c)}` : `Ready when you are.${streakBit(c)}` }),
    (c) => ({ title: '[SYSTEM] Arise, Hunter', body: planFacts(c) ? `Today's training: ${planFacts(c)}${streakBit(c)}` : `Today's training is ready.${streakBit(c)}` }),
    (c) => ({ title: '[SYSTEM] Gate detected nearby', body: planFacts(c) ? `${planFacts(c)} Quick 15 also counts.${streakBit(c)}` : `Quick 15 also counts as a clear.${streakBit(c)}` }),
  ],
  evening: [
    (c) => ({ title: '[SYSTEM] Streak status: active', body: `${plural(c.streak, 'day')} running. A short session today keeps it going. Quick 15 counts.` }),
    (c) => ({ title: '[SYSTEM] Your streak is at ' + c.streak, body: 'The evening gate is open. Even a Quick 15 adds to the run.' }),
    (c) => ({ title: '[SYSTEM] Evening gate available', body: `${plural(c.streak, 'day')} in a row so far. Fifteen minutes is enough to extend it.` }),
    (c) => ({ title: '[SYSTEM] A short clear is available', body: `Streak at ${c.streak}. Quick 15 is one tap away.` }),
    (c) => ({ title: '[SYSTEM] Streak update', body: `${plural(c.streak, 'day')} running, nicely done. Add one more with a short session tonight.` }),
  ],
  weighin: [
    (c) => ({ title: '[SYSTEM] Morning weigh-in', body: `Step on the scale before breakfast. 10 seconds.${runBit(c)}` }),
    (c) => ({ title: '[SYSTEM] Status check: bodyweight', body: `One reading a morning keeps your 7-day average honest.${runBit(c)}` }),
    (c) => ({ title: '[SYSTEM] Scale is ready', body: `Same time each day, ideally right after waking.${runBit(c)}` }),
    (c) => ({ title: '[SYSTEM] Daily measurement', body: `A quick weigh-in feeds your trend line.${runBit(c)}` }),
  ],
  test: [
    () => ({ title: '[SYSTEM] Test signal received', body: 'This is what a reminder looks like. Real ones come from the hourly sender.' }),
    () => ({ title: '[SYSTEM] Connection confirmed', body: 'This device can show System notices. Real reminders arrive on schedule.' }),
  ],
};

/** Copy for a reminder. ctx: { streak, dayName, exercises, mins, uid, date }. Plain statements, an easy next step, nothing about loss. */
export function reminderCopy(type, ctx = {}) {
  const pool = POOLS[type] || POOLS.planned;
  const c = { streak: 0, exercises: 0, mins: 0, ...ctx };
  const i = pickIndex(pool.length, `${c.uid || ''}|${type}`, c.date || '1970-01-01');
  const { title, body } = pool[i](c);
  return { title: clip(title, COPY_MAX_TITLE), body: clip(body.trim(), COPY_MAX_BODY) };
}
function clip(str, max) { return str.length <= max ? str : str.slice(0, max - 1).replace(/[\s.,;:]+$/, '') + '\u2026'; }

/** Today's plan day for the sender: { dayName, exercises, mins } or null. Fixed plans use the day assigned to that weekday, rotation plans the day the rotation is on. */
export function planDayFor(program, date) {
  const days = program && Array.isArray(program.days) ? program.days : [];
  if (!days.length) return null;
  let day = null;
  if (program.scheduleMode === 'fixed') {
    const wd = weekdayOf(date);
    day = days.filter(d => (d.assignedDays || []).includes(wd)).sort((a, b) => (b.exercises?.length ? 1 : 0) - (a.exercises?.length ? 1 : 0))[0] || null;
  } else {
    day = days[(Number(program.currentDayIndex) || 0) % days.length];
  }
  if (!day) return null;
  const exs = Array.isArray(day.exercises) ? day.exercises : [];
  const sets = exs.reduce((n, e) => n + (Number(e && e.sets) || 0), 0);
  return {
    dayName: String(day.name || day.tag || '').slice(0, 24).trim(),
    exercises: exs.length,
    mins: sets ? Math.max(5, Math.round(sets * 3 / 5) * 5) : 0,   // same estimate as hunt-view.js estimateMinutes
  };
}

/**
 * @param in.now        ms since epoch
 * @param in.prefs      pushPrefs { enabled, planned, evening, usualTime 'HH:MM'?, tz }
 * @param in.workouts   [{ date 'YYYY-MM-DD', time 'HH:MM'? }]  the Hunter's own sessions (recent is enough)
 * @param in.schedule   programme weekdays ['Mon', ...]; empty means no plan
 * @param in.freeze     users/{uid}.streakFreeze
 * @param in.backfill   users/{uid}.streakBackfill
 * @param in.program    users' programs/{uid} doc (days, scheduleMode, currentDayIndex) for the copy; optional
 * @param in.uid        seeds which message of the pool is used; optional
 * @param in.sentToday  reminders already sent today (default 0)
 * @returns { send:false, reason } | { send:true, type, title, body, tag }
 */
export function decideReminder({ now, prefs, workouts = [], schedule = [], freeze = null, backfill = [], sentToday = 0, program = null, uid = '' } = {}) {
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
  if (eveningDue) return { send: true, type: 'evening', tag: 'streak-' + t.date, ...reminderCopy('evening', { streak, uid, date: t.date }) };

  if (plannedOn && Array.isArray(schedule) && schedule.includes(weekdayOf(t.date))) {
    const override = toMin(prefs.usualTime);
    const usual = override !== null ? override : learnUsualMinutes(workouts, t.date);
    if (t.hour === plannedSlotHour(usual)) return { send: true, type: 'planned', tag: 'planned-' + t.date, ...reminderCopy('planned', { streak, uid, date: t.date, ...(planDayFor(program, t.date) || {}) }) };
  }
  return no('not-due');
}

/** Consecutive days weighed in, ending yesterday (today has not happened yet when this runs). */
export function weighRun(weightDates, today) {
  const set = new Set(weightDates || []);
  let n = 0;
  for (let d = shiftDay(today, -1); set.has(d); d = shiftDay(d, -1)) n++;
  return n;
}

/**
 * The morning weigh-in note.
 * @param in.now          ms since epoch
 * @param in.prefs        pushPrefs { enabled, weighin, tz }
 * @param in.weightDates  ['YYYY-MM-DD', ...] the Hunter's bodyweight dates
 * @param in.freeze       users/{uid}.streakFreeze
 * @param in.uid          seeds which message of the pool is used; optional
 * @returns { send:false, reason } | { send:true, type:'weighin', title, body, tag }
 */
export function decideWeighIn({ now, prefs, weightDates = [], freeze = null, uid = '' } = {}) {
  const no = (reason) => ({ send: false, reason });
  if (!prefs || !prefs.enabled) return no('disabled');
  if (prefs.weighin === false) return no('switched-off');
  if (!prefs.tz) return no('no-timezone');
  const t = localParts(now, prefs.tz);
  if (!t) return no('bad-timezone');
  if (t.hour !== WEIGHIN_HOUR) return no('not-due');
  if (freeze && freeze.active) return no('frozen');
  if ((weightDates || []).includes(t.date)) return no('weighed-today');
  return { send: true, type: 'weighin', tag: 'weighin-' + t.date, ...reminderCopy('weighin', { run: weighRun(weightDates, t.date), uid, date: t.date }) };
}
