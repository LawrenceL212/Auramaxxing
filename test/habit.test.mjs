/* Tests for the habit engine.  node test/habit.test.mjs */

import {
  analyseHabit, strengthFromReps, repsToTarget, opportunityDates, sampleCurve,
  describeReturns, HABIT_TARGET_DAYS, MISS_GRACE,
} from '../habit.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

/** Dates counting back from `today`, given a pattern of 1 (trained) / 0 (missed). */
function fromPattern(pattern, today = '2026-09-16') {
  const dates = [];
  const n = pattern.length;
  for (let i = 0; i < n; i++) {
    if (pattern[i] === 1) dates.push(shiftDay(today, -(n - 1 - i)));
  }
  return new Set(dates);
}
const A = (pattern, extra = {}) =>
  analyseHabit({ today: '2026-09-16', workoutDates: fromPattern(pattern), ...extra });

// ── the strength curve ────────────────────────────────────────────────────
check('no repetitions, no strength', Math.round(strengthFromReps(0)), 0);
check('the target lands at 95% of the asymptote',
  Math.round(strengthFromReps(HABIT_TARGET_DAYS)), 95);
// An asymptote is not a finish line. (Past ~600 reps the float saturates at
// exactly 100, which is a limit of doubles, not of the model.)
check('strength never reaches 100',
  strengthFromReps(500) < 100, true);
check('early repetitions are worth more than late ones',
  (strengthFromReps(10) - strengthFromReps(5)) > (strengthFromReps(60) - strengthFromReps(55)), true);
check('reps remaining counts down to the target', repsToTarget(16), 50);
check('and never goes negative', repsToTarget(200), 0);

// ── THE RULE: missing once is free, missing twice is not ──────────────────
const perfect = A([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
const missedOne = A([1, 1, 1, 1, 0, 1, 1, 1, 1, 1]);
const missedTwo = A([1, 1, 1, 1, 0, 0, 1, 1, 1, 1]);

check('a single miss costs nothing at all',
  missedOne.reps, 9);
check('missing twice does cost something',
  missedTwo.reps < 8, true);
/* The decay hits what had been BANKED when the second miss happened — four
   sessions — not the ten the Hunter eventually reaches. A lapse costs you the
   progress you had at the time, and sessions logged afterwards are added on
   top at full value rather than being retrospectively discounted. */
check('the penalty applies to progress banked at the time, not the final total',
  Math.round(missedTwo.reps * 1000) / 1000, Math.round((4 * 0.9 + 4) * 1000) / 1000);
check('a perfect run banks every session', perfect.reps, 10);
check('one miss still beats two', missedOne.strength > missedTwo.strength, true);

// a lapse dents the curve, it does not reset it
const longLapse = A([1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
check('coming back from a long lapse lands above zero',
  longLapse.reps > 2, true);
check('but well below where it was',
  longLapse.reps < 5, true);

// ── rule status ───────────────────────────────────────────────────────────
/* The last slot in a pattern IS today, and an untrained today is pending
   rather than missed — so a trailing 0 costs nothing and the misses being
   tested for have to sit before it. */
check('trained today -> the rule is held', A([1, 1, 1]).ruleStatus, 'held');
check('missed yesterday only -> at risk, not broken',
  A([1, 1, 1, 0, 0]).ruleStatus, 'at-risk');
check('missed the two days before today -> broken',
  A([1, 1, 1, 0, 0, 0]).ruleStatus, 'broken');
check('the current miss run excludes a still-pending today',
  A([1, 1, 0, 0, 0]).currentMissRun, 2);

// today is still in progress: not training YET is not a miss
const todayPending = analyseHabit({
  today: '2026-09-16',
  workoutDates: new Set(['2026-09-14', '2026-09-15']),
});
check('an untrained today is not counted as a miss',
  todayPending.currentMissRun, 0);
check('and the rule still reads as held',
  todayPending.ruleStatus, 'held');
check('today is marked pending on the curve',
  todayPending.curve[todayPending.curve.length - 1].pending, true);

// ── return speed ──────────────────────────────────────────────────────────
const twoLapses = A([1, 1, 0, 1, 1, 0, 0, 1, 1]);
check('every lapse is recorded', twoLapses.returns.length, 2);
check('a one-day lapse held the rule', twoLapses.returns[0].heldRule, true);
check('a two-day lapse broke it', twoLapses.returns[1].heldRule, false);
check('the return rate is the fraction that held', twoLapses.returnRate, 0.5);
check('clean returns are counted', twoLapses.cleanReturns, 1);
check('the median lapse length is reported', twoLapses.medianMissed, 2);

check('a run with no lapse has no returns', perfect.returns.length, 0);
check('and a return rate of zero, not a fake 100%', perfect.returnRate, 0);

// ── proven resilience softens the decay ───────────────────────────────────
// Same number of sessions and the same final lapse; the only difference is
// whether the Hunter has a record of coming back fast beforehand.
const noRecord = A([1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1]);
const goodRecord = A([1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 1]);
check('a proven fast returner keeps more of the curve through a lapse',
  goodRecord.returns.filter((r) => r.heldRule).length >= 3, true);
check('relief only uses lapses already survived, never the whole history',
  noRecord.returns[0].heldRule, false);

// the relief is bounded — it can never make missing free
const heavyRecord = A([1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1]);
check('even a perfect record still loses ground on a long lapse',
  heavyRecord.curve[heavyRecord.curve.length - 2].reps <
  heavyRecord.curve[heavyRecord.curve.length - 6].reps, true);

// ── scheduled rest is not a miss ──────────────────────────────────────────
// Mon/Wed/Fri programme: 2026-09-14 is a Monday.
const mwf = {
  today: '2026-09-18',           // Friday
  schedule: ['Mon', 'Wed', 'Fri'],
  workoutDates: new Set(['2026-09-14', '2026-09-16', '2026-09-18']),
};
const sched = analyseHabit(mwf);
check('only scheduled days are opportunities', sched.opportunities, 3);
check('resting as programmed is never a miss', sched.missed, 0);
check('and the rule holds', sched.ruleStatus, 'held');
check('three scheduled sessions, three repetitions', sched.reps, 3);

check('a session on an unscheduled day still counts',
  analyseHabit({ today: '2026-09-18', schedule: ['Mon', 'Wed', 'Fri'],
    workoutDates: new Set(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-18']) }).taken, 4);

check('an empty schedule means every day is an opportunity',
  opportunityDates({ today: '2026-09-16', schedule: [],
    workoutDates: new Set(['2026-09-14']) }).length, 3);
check('a seven-day schedule is the same as no schedule',
  opportunityDates({ today: '2026-09-16',
    schedule: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    workoutDates: new Set(['2026-09-14']) }).length, 3);

// ── empty and edge cases ──────────────────────────────────────────────────
const none = analyseHabit({ today: '2026-09-16', workoutDates: new Set() });
check('no training at all is safe', [none.reps, none.ruleStatus], [0, 'unstarted']);
check('and reports the full distance to the target',
  none.repsToTarget, HABIT_TARGET_DAYS);
check('a null context does not throw', analyseHabit(null).reps, 0);
check('future-dated sessions are ignored',
  analyseHabit({ today: '2026-09-16',
    workoutDates: new Set(['2026-09-16', '2026-12-25']) }).opportunities, 1);
check('one session gives one repetition', A([1]).reps, 1);

// ── curve shape and sampling ──────────────────────────────────────────────
check('the curve has a point per opportunity',
  perfect.curve.length, perfect.opportunities);
check('the curve rises monotonically through a clean run',
  perfect.curve.every((p, i, arr) => i === 0 || p.strength >= arr[i - 1].strength), true);
check('a curve under the cap is returned untouched',
  sampleCurve(perfect.curve, 90).length, perfect.curve.length);

const long = Array.from({ length: 400 }, (_, i) => ({ date: 'd' + i, strength: i }));
const s = sampleCurve(long, 90);
check('a long curve is downsampled to the cap', s.length, 90);
check('sampling keeps the first point', s[0].date, 'd0');
check('sampling keeps the LAST point, so the figure is never stale',
  s[s.length - 1].date, 'd399');

// ── the sentence ──────────────────────────────────────────────────────────
check('the return record reads as plain English',
  describeReturns(twoLapses), 'Back next session on 1 of 2 lapses · 50%');
check('no lapse yet says so',
  describeReturns(perfect), 'No lapse to come back from yet.');
check('no training at all invites a first session',
  describeReturns(none), 'Train once to start the curve.');
check('singular lapse is not pluralised',
  describeReturns(A([1, 1, 0, 1, 1])), 'Back next session on 1 of 1 lapse · 100%');

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
