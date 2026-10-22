/* Tests for the Quick 15 circuit.  Run:  node test/quick-quest.test.mjs
   No dependencies and no runner, in the style of test/streak.test.mjs. */

import { BASE_EXERCISES } from '../exercises.js';
import { QUICK_CIRCUIT, buildQuickCircuit, circuitSets, quickLoggerRows } from '../quick-quest.js';
import { computeStreakFrom, STREAK_RULES_START } from '../streak.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

// ── the real circuit ──────────────────────────────────────────────────────
const circuit = buildQuickCircuit(BASE_EXERCISES);
check('uses the four planned exercises when they all exist', circuit.map(e => e.name), QUICK_CIRCUIT.map(e => e.name));
check('every name is in the exercise database', circuit.every(e => !!BASE_EXERCISES[e.name]), true);
check('every move is bodyweight', circuit.every(e => BASE_EXERCISES[e.name].equipment === 'Bodyweight'), true);
check('twelve sets: about fifteen minutes of rounds', circuitSets(circuit), 12);
check('four exercises', circuit.length, 4);
check('the plank is the timed move', circuit.filter(e => BASE_EXERCISES[e.name].timed).map(e => e.name), ['Plank']);
check('nothing was added to the database', Object.keys(BASE_EXERCISES).includes('Quick'), false);

// ── resilience to a renamed or changed exercise ───────────────────────────
const db = { ...BASE_EXERCISES };
delete db['Glute Bridge'];
const patched = buildQuickCircuit(db);
check('a missing exercise is replaced, not dropped', patched.length, 4);
check('the replacement is a real bodyweight exercise',
  patched.filter(e => !QUICK_CIRCUIT.some(c => c.name === e.name)).every(e => db[e.name] && db[e.name].equipment === 'Bodyweight'), true);
check('a barbell exercise never slips in', patched.some(e => db[e.name].equipment !== 'Bodyweight'), false);
check('an empty database gives an empty circuit', buildQuickCircuit({}), []);

// ── logger rows ───────────────────────────────────────────────────────────
check('logger rows carry name, sets and target reps, no prefill',
  quickLoggerRows(circuit)[0], { name: 'Push Up', sets: 3, targetReps: 12, prefillSets: null });

// ── counts for the streak: it is an ordinary workout ──────────────────────
// A logged Quick session is stored like any session (date, exercises, programDayIndex null).
// The streak engine looks only at the dates of stored workouts.
const quickWorkout = {
  uid: 'u', date: '2026-10-22', programDayIndex: null,
  exercises: circuit.map(e => ({ name: e.name, sets: Array.from({ length: e.sets }, () => ({ weight: 0, reps: e.reps })) })),
};
const ctx = (today, dates) => ({ today, workoutDates: new Set(dates), schedule: [], freeze: null, backfill: [], pendingDates: new Set(), rulesStart: STREAK_RULES_START });
check('a Quick session today makes the streak 1', computeStreakFrom(ctx('2026-10-22', [quickWorkout.date])), 1);
check('a Quick session extends a streak', computeStreakFrom(ctx('2026-10-22', ['2026-10-20', '2026-10-21', quickWorkout.date])), 3);
check('without it the streak would not include today', computeStreakFrom(ctx('2026-10-22', ['2026-10-20', '2026-10-21'])), 2);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
