/* Tests for past-session logging.  Run:  node test/backfill.test.mjs
   No dependencies and no runner: a plain script that exits non-zero on failure. */

import {
  backfillDateProblem, earliestBackfillDate, isDuplicateSession, laterDate, BACKFILL_MAX_DAYS,
} from '../backfill.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const today = '2026-10-15';

// ── dates ─────────────────────────────────────────────────────────────────
check('window is 30 days', BACKFILL_MAX_DAYS, 30);
check('earliest date crosses a month', earliestBackfillDate(today), '2026-09-15');
check('today is allowed', backfillDateProblem(today, today), null);
check('yesterday is allowed', backfillDateProblem('2026-10-14', today), null);
check('the oldest day is allowed', backfillDateProblem('2026-09-15', today), null);
check('one day too old is refused', typeof backfillDateProblem('2026-09-14', today), 'string');
check('tomorrow is refused', typeof backfillDateProblem('2026-10-16', today), 'string');
check('an empty date is refused', typeof backfillDateProblem('', today), 'string');
check('a malformed date is refused', typeof backfillDateProblem('15/10/2026', today), 'string');

// ── duplicates ────────────────────────────────────────────────────────────
const session = [{ name: 'Squat', sets: [{ reps: 5, weight: 100, rir: 2 }, { reps: 5, weight: 100, rir: 1 }] }];
const stored = [
  { uid: 'a', date: '2026-10-10', time: '07:00', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 100, rir: null }, { reps: 5, weight: 100, rir: 3 }] }] },
  { uid: 'b', date: '2026-10-11', exercises: session },
];
check('same session, same day, same Hunter', isDuplicateSession(stored, 'a', '2026-10-10', session), true);
check('same session on another day', isDuplicateSession(stored, 'a', '2026-10-09', session), false);
check('another Hunter\'s identical session', isDuplicateSession(stored, 'a', '2026-10-11', session), false);
check('different weight is a new session', isDuplicateSession(stored, 'a', '2026-10-10',
  [{ name: 'Squat', sets: [{ reps: 5, weight: 102.5 }, { reps: 5, weight: 100 }] }]), false);
check('an extra set is a new session', isDuplicateSession(stored, 'a', '2026-10-10',
  [{ name: 'Squat', sets: [{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }, { reps: 5, weight: 100 }] }]), false);
check('no workouts at all', isDuplicateSession(undefined, 'a', today, session), false);

// ── lastWorkoutDate never moves backwards ─────────────────────────────────
check('a past session keeps the later date', laterDate('2026-10-14', '2026-10-01'), '2026-10-14');
check('a newer session moves it forward', laterDate('2026-10-01', '2026-10-14'), '2026-10-14');
check('first ever session', laterDate(undefined, '2026-10-01'), '2026-10-01');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
