/* Tests for the streak engine.  Run:  node test/streak.test.mjs
   No dependencies and no runner — the project has no package manager, so this
   stays a plain script that exits non-zero on failure. */

import {
  computeStreakFrom, dayState, shiftDay, weekdayOf, STREAK_RULES_START,
} from '../streak.js';

let pass = 0, fail = 0;
const results = [];

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

/** Build a context. `days` are training dates; everything else optional. */
const ctx = (today, days, extra = {}) => ({
  today,
  workoutDates: new Set(days),
  schedule: extra.schedule ?? [],          // [] = every day is a training day
  freeze: extra.freeze ?? null,
  backfill: extra.backfill ?? [],
  pendingDates: new Set(extra.pending ?? []),
  rulesStart: extra.rulesStart ?? STREAK_RULES_START,
});

// ── date helpers ──────────────────────────────────────────────────────────
check('shiftDay back over a month boundary', shiftDay('2026-09-01', -1), '2026-08-31');
check('shiftDay forward', shiftDay('2026-08-31', 1), '2026-09-01');
check('weekdayOf is Mon-first', weekdayOf('2026-09-16'), 'Wed');

// ── 1. one workout day ────────────────────────────────────────────────────
check('1. single workout today -> 1',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-16'])), 1);

// ── 2. consecutive days ───────────────────────────────────────────────────
check('2. three consecutive days -> 3',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-14', '2026-09-15', '2026-09-16'])), 3);

// ── 3. workout -> rest day -> workout ─────────────────────────────────────
// 2026-09-14 Mon, 15 Tue, 16 Wed. Tue is the ONLY rest day here, so the run is
// Wed(workout) + Tue(rest) + Mon(workout) = 3, and Sun before it breaks it.
check('3. rest day bridges the run',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-14', '2026-09-16'],
    { schedule: ['Mon', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] })), 3);

// ── 4. workout -> freeze -> workout ───────────────────────────────────────
check('4. freeze bridges the run',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-14', '2026-09-16'],
    { freeze: { from: '2026-09-15', to: '2026-09-15', active: false } })), 3);

// ── 5. a missed past day breaks it ────────────────────────────────────────
check('5. missed day breaks the run',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-13', '2026-09-14', '2026-09-16'])), 1);

// ── 6. today not trained yet — streak survives ────────────────────────────
check('6. untrained today does not break it',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-14', '2026-09-15'])), 2);

// ── 7. that same day, seen from tomorrow, is a break ──────────────────────
check('7. tomorrow, an empty yesterday is a break',
  computeStreakFrom(ctx('2026-09-17', ['2026-09-14', '2026-09-15'])), 0);

// ── 8. several workouts on one date count once ────────────────────────────
// A Set is the contract: duplicate documents collapse before they reach here.
check('8. duplicates on one date count once',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-16', '2026-09-16', '2026-09-15'])), 2);

// ── 9. deleting a workout re-breaks the run ───────────────────────────────
const before = ctx('2026-09-16', ['2026-09-14', '2026-09-15', '2026-09-16']);
const after = ctx('2026-09-16', ['2026-09-14', '2026-09-16']);   // 15th deleted
check('9a. intact run', computeStreakFrom(before), 3);
check('9b. same run after deleting the middle day', computeStreakFrom(after), 1);

// ── 10. a backfilled freeze preserves history ─────────────────────────────
// Gap 09-11..09-13 would break it; a backfill window covers exactly that.
check('10a. gap breaks without backfill',
  computeStreakFrom(ctx('2026-09-15', ['2026-09-10', '2026-09-14', '2026-09-15'])), 2);
check('10b. backfill window bridges it',
  computeStreakFrom(ctx('2026-09-15', ['2026-09-10', '2026-09-14', '2026-09-15'],
    { backfill: [{ from: '2026-09-11', to: '2026-09-13' }] })), 6);

// ── 11. backfill is not a workout ─────────────────────────────────────────
// The engine only ever reads workoutDates for training; a backfilled day
// reports 'backfill', never 'workout', so statistics built from workouts are
// untouched by it.
check('11a. backfilled day is not reported as a workout',
  dayState('2026-09-12', ctx('2026-09-15', ['2026-09-10'],
    { backfill: [{ from: '2026-09-11', to: '2026-09-13' }] })), 'backfill');
check('11b. rest day is not reported as a workout',
  dayState('2026-09-13', ctx('2026-09-16', [], { schedule: ['Mon', 'Tue'] })), 'rest');

// ── 13. future dates cannot inflate the streak ────────────────────────────
check('13. a workout dated tomorrow is ignored',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-20', '2026-09-16'])), 1);
check('13b. only-future workouts give 0',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-20'])), 0);

// ── 14. a genuine break stays broken ──────────────────────────────────────
// A backfill window that does not cover the gap must not rescue it.
check('14. backfill elsewhere does not rescue a real break',
  computeStreakFrom(ctx('2026-09-15', ['2026-09-10', '2026-09-14', '2026-09-15'],
    { backfill: [{ from: '2026-08-01', to: '2026-08-05' }] })), 2);

// ── boundary: backfill never applies on or after STREAK_RULES_START ───────
check('boundary. backfill is ignored from the rules start onward',
  computeStreakFrom(ctx('2026-09-17', ['2026-09-15', '2026-09-17'],
    { backfill: [{ from: '2026-09-16', to: '2026-09-16' }] })), 1);
check('boundary. the same window before the start is honoured',
  computeStreakFrom(ctx('2026-09-17', ['2026-09-15', '2026-09-17'],
    { backfill: [{ from: '2026-09-16', to: '2026-09-16' }], rulesStart: '2026-09-20' })), 3);

// ── misc guards ───────────────────────────────────────────────────────────
check('no workouts at all -> 0', computeStreakFrom(ctx('2026-09-16', [])), 0);
check('seven-day schedule grants no rest days',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-14'],
    { schedule: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] })), 0);
// 09-11..09-16 frozen (6 days) plus the 09-10 workout = 7.
check('an active freeze runs forward from its start',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-10'],
    { freeze: { from: '2026-09-11', active: true } })), 7);

// ── 15. a pending (unsaved) workout protects the streak ───────────────────
check('15a. an unsaved workout bridges the run',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-14', '2026-09-16'],
    { pending: ['2026-09-15'] })), 3);
check('15b. a pending day reports as pending, never as a workout',
  dayState('2026-09-15', ctx('2026-09-16', [], { pending: ['2026-09-15'] })), 'pending');
check('15c. a real workout on the same date wins over the pending copy',
  dayState('2026-09-15', ctx('2026-09-16', ['2026-09-15'], { pending: ['2026-09-15'] })), 'workout');
check('15d. pending cannot rescue a different missing day',
  computeStreakFrom(ctx('2026-09-16', ['2026-09-12', '2026-09-16'],
    { pending: ['2026-09-15'] })), 2);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
