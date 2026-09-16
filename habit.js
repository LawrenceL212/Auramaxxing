/* =========================================================================
   HABIT ENGINE — "NEVER MISS TWICE"

   The streak engine answers "is the run alive?", which is a pass/fail question
   and so can only ever deliver bad news once. This one answers a different and
   more useful question: how established is the habit, and how good is this
   Hunter at coming back?

   THE RULE
   Missing once is not the failure. Missing twice is. That is not a motivational
   slogan bolted onto the maths — it IS the maths here: one missed opportunity
   costs nothing at all, and every consecutive one after it compounds a penalty.

   It is also what the evidence says. Lally et al. (2010), the study behind the
   widely-quoted "66 days", found that automaticity follows an asymptotic curve
   and — the part that never gets quoted — that "missing one opportunity did not
   materially affect the habit formation process." A model that punishes a
   single miss is not being strict, it is being wrong.

   WHAT THE CURVE IS
   Strength rises with repetitions toward an asymptote, not with calendar time.
   Sixty-six taken opportunities puts a Hunter at ~95%. Missed opportunities
   beyond the first decay the accumulated total, so a lapse costs progress
   rather than resetting it — you come back to a dented curve, never to zero.

   RETURN SPEED FEEDS THE CURVE
   A Hunter with a record of returning on the very next opportunity has proven
   the habit survives interruption, and the decay is softened for them in
   proportion to that record. The relief is computed from returns made BEFORE
   the lapse being scored, never from the whole history, so the curve at any
   point only uses what was known by then and does not read the future.

   Pure functions over plain data (test/habit.test.mjs).
   ========================================================================= */

import { shiftDay, weekdayOf } from './streak.js';

/** Lally et al. (2010): median days to automaticity. Range was 18–254, so this
 *  is a landmark, not a promise — the app should say so wherever it shows it. */
export const HABIT_TARGET_DAYS = 66;

/** Opportunities missed in a row before any penalty applies. This is the rule. */
export const MISS_GRACE = 1;

/** Retained fraction of accumulated progress per missed opportunity past grace. */
export const MISS_DECAY = 0.90;

/** A perfect return record cuts that decay by at most this much. */
export const RESILIENCE_RELIEF = 0.5;

/** Strength is 95% of the asymptote at HABIT_TARGET_DAYS repetitions. */
const TAU = HABIT_TARGET_DAYS / Math.log(20);

/** Repetitions -> habit strength, 0–100. */
export function strengthFromReps(reps) {
  return 100 * (1 - Math.exp(-Math.max(0, reps) / TAU));
}

/** How many more clean repetitions to reach automaticity. */
export function repsToTarget(reps) {
  return Math.max(0, Math.ceil(HABIT_TARGET_DAYS - reps));
}

/**
 * Every day the programme asked for training, from the first session to today.
 *
 * A rest day is not an opportunity, so resting as programmed can never read as
 * a miss — the same treatment the streak engine gives it.
 */
export function opportunityDates(ctx) {
  const dates = [...(ctx.workoutDates || [])].filter((d) => d <= ctx.today).sort();
  if (!dates.length) return [];
  const sched = ctx.schedule;
  const everyDay = !sched || !sched.length || sched.length >= 7;
  const out = [];
  for (let d = dates[0]; d <= ctx.today; d = shiftDay(d, 1)) {
    if (everyDay || sched.includes(weekdayOf(d))) out.push(d);
    // A session logged on an unscheduled day still counts as one taken.
    else if (ctx.workoutDates.has(d)) out.push(d);
  }
  return out;
}

/**
 * The whole picture: the curve, the return record, and where the rule stands.
 *
 * @param ctx {
 *   workoutDates: Set<string>,
 *   today: 'YYYY-MM-DD',
 *   schedule?: string[],        // training weekdays, Mon-first
 * }
 */
export function analyseHabit(ctx) {
  const empty = {
    curve: [], reps: 0, strength: 0, peakStrength: 0,
    returns: [], returnRate: 0, medianMissed: 0, cleanReturns: 0,
    currentMissRun: 0, ruleStatus: 'unstarted', longestCleanRun: 0,
    repsToTarget: HABIT_TARGET_DAYS, taken: 0, missed: 0, opportunities: 0,
  };
  if (!ctx || !ctx.today || !ctx.workoutDates || !ctx.workoutDates.size) return empty;

  const days = opportunityDates(ctx);
  if (!days.length) return empty;

  let reps = 0, missRun = 0, cleanRun = 0, longestCleanRun = 0, peak = 0;
  let taken = 0, missed = 0;
  const returns = [];
  const curve = [];

  for (const date of days) {
    const trained = ctx.workoutDates.has(date);

    /* Today is still in progress: an untrained today is not yet a miss, and
       must not dent the curve while the Hunter still has hours to train. */
    const pending = !trained && date === ctx.today;

    if (trained) {
      if (missRun > 0) {
        returns.push({ returnedOn: date, missed: missRun, heldRule: missRun <= MISS_GRACE });
      }
      reps += 1;
      taken += 1;
      missRun = 0;
      cleanRun += 1;
      longestCleanRun = Math.max(longestCleanRun, cleanRun);
    } else if (!pending) {
      missRun += 1;
      missed += 1;
      if (missRun > MISS_GRACE) {
        /* Relief is earned from returns already made, so the curve at this
           point uses only what was known by this point. */
        const prior = returns.length
          ? returns.filter((r) => r.heldRule).length / returns.length
          : 0;
        const retained = MISS_DECAY + (1 - MISS_DECAY) * (RESILIENCE_RELIEF * prior);
        reps *= retained;
        cleanRun = 0;
      }
    }

    const strength = strengthFromReps(reps);
    peak = Math.max(peak, strength);
    curve.push({ date, reps, strength, trained, pending, missRun });
  }

  const held = returns.filter((r) => r.heldRule).length;
  const missedCounts = returns.map((r) => r.missed).sort((a, b) => a - b);
  const medianMissed = missedCounts.length
    ? missedCounts[Math.floor(missedCounts.length / 2)] : 0;

  return {
    curve,
    reps,
    strength: strengthFromReps(reps),
    peakStrength: peak,
    returns,
    cleanReturns: held,
    returnRate: returns.length ? held / returns.length : 0,
    medianMissed,
    currentMissRun: missRun,
    ruleStatus: missRun === 0 ? 'held' : missRun <= MISS_GRACE ? 'at-risk' : 'broken',
    longestCleanRun,
    repsToTarget: repsToTarget(reps),
    taken,
    missed,
    opportunities: days.length,
  };
}

/**
 * The curve reduced to at most `max` points for drawing.
 *
 * Takes every nth point but always keeps the first and last, so the line still
 * starts where training started and ends where the Hunter actually is — a
 * downsample that drops the final point would show a stale figure.
 */
export function sampleCurve(curve, max = 90) {
  if (!curve || curve.length <= max) return curve || [];
  const step = (curve.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(curve[Math.round(i * step)]);
  out[out.length - 1] = curve[curve.length - 1];
  return out;
}

/** A plain sentence about the return record — the headline of this whole idea. */
export function describeReturns(a) {
  if (!a || !a.returns.length) {
    return a && a.taken
      ? 'No lapse to come back from yet.'
      : 'Train once to start the curve.';
  }
  const n = a.returns.length;
  const pct = Math.round(a.returnRate * 100);
  return `Back next session on ${a.cleanReturns} of ${n} lapse${n === 1 ? '' : 's'} · ${pct}%`;
}
