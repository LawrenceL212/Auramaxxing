/* Tests for the plan score.  node test/plan-metrics.test.mjs */
import { BASE_EXERCISES } from '../exercises.js';
import { scorePlan, diffPlans, sessionMinutes } from '../plan-metrics.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}
const EX = BASE_EXERCISES, TODAY = '2026-10-26';
const e = (name, sets, reps) => ({ name, sets, reps });
const plan = (days, schedule = ['Mon', 'Wed', 'Fri']) => ({ name: 'T', scheduleMode: 'rotation', schedule, days, currentDayIndex: 0 });
const m = (r, id) => r.metrics.find(x => x.id === id);

const full = plan([{ name: 'A', exercises: [e('Bench Press', 4, 8), e('Barbell Row', 4, 8), e('Squat', 4, 8), e('Overhead Press', 3, 10), e('Romanian Deadlift', 3, 10), e('Barbell Curl', 3, 10), e('Triceps Pushdown', 3, 10), e('Standing Calf Raise', 3, 12), e('Cable Crunch', 3, 12)] }]);
const good = scorePlan({ program: full, exercises: EX, workouts: [], today: TODAY, goal: 'muscle' });
check('a balanced full-body plan scores well', good.score >= 70, true);
check('volume is in range for most groups', m(good, 'volume').status !== 'low', true);
check('no logs -> no overload or adherence row', [m(good, 'overload'), m(good, 'adherence')], [undefined, undefined]);

const pushOnly = plan([{ name: 'Push', exercises: [e('Bench Press', 4, 8), e('Overhead Press', 3, 8), e('Triceps Pushdown', 3, 10)] }]);
const bad = scorePlan({ program: pushOnly, exercises: EX, workouts: [], today: TODAY, goal: 'muscle' });
check('push-only scores lower', bad.score < good.score, true);
check('a plan with big groups under the minimum is capped below Solid', bad.score <= 69, true);
check('and the fix names the missing groups', /Back|Quads/.test(m(bad, 'volume').fix), true);
check('pull:push is flagged', m(bad, 'balance').status, 'low');

const noLegs = scorePlan({ program: pushOnly, exercises: EX, workouts: [], today: TODAY, goal: 'muscle', excluded: ['Quads', 'Hamstrings', 'Calves'] });
check('ruled-out legs are not marked down', m(noLegs, 'upperlower'), undefined);
check('and not named in the volume fix', /Quads|Hamstrings/.test(m(noLegs, 'volume').fix), false);

const long = plan([{ name: 'Long', exercises: Array.from({ length: 10 }, () => e('Bench Press', 8, 8)) }]);
check('a 4-hour day is flagged', m(scorePlan({ program: long, exercises: EX, workouts: [], today: TODAY }), 'session').status, 'low');
check('session minutes', sessionMinutes({ exercises: [e('Bench Press', 10, 8)] }), 30);

const strengthOff = plan([{ name: 'A', exercises: [e('Bench Press', 4, 15)] }]);
check('15 reps is off a strength goal', m(scorePlan({ program: strengthOff, exercises: EX, workouts: [], today: TODAY, goal: 'strength' }), 'goalfit').status, 'low');

const consecutive = plan([{ name: 'A', exercises: [e('Bench Press', 6, 8)] }, { name: 'B', exercises: [e('Incline Dumbbell Press', 6, 8)] }], ['Mon', 'Tue']);
check('chest on back-to-back days is flagged', m(scorePlan({ program: consecutive, exercises: EX, workouts: [], today: TODAY, goal: 'muscle' }), 'recovery').status !== 'good', true);

// history
const wo = (date, kg) => ({ date, exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weight: kg }] }] });
const rising = [wo('2026-08-31', 60), wo('2026-09-14', 65), wo('2026-09-28', 70), wo('2026-10-12', 75), wo('2026-10-20', 80)];
const rl = scorePlan({ program: full, exercises: EX, workouts: rising, today: TODAY, goal: 'muscle' });
check('rising bench counts as overload', m(rl, 'overload').status, 'good');
const flat = [wo('2026-08-31', 60), wo('2026-09-14', 60), wo('2026-09-28', 60), wo('2026-10-12', 60), wo('2026-10-20', 60)];
check('a flat bench is stalled', m(scorePlan({ program: full, exercises: EX, workouts: flat, today: TODAY, goal: 'muscle' }), 'overload').status, 'low');
check('adherence compares with the plan', m(rl, 'adherence').value.includes('of 3'), true);
check('score is 0-100', good.score >= 0 && good.score <= 100, true);

// diff
const d = diffPlans(plan([{ exercises: [e('Squat', 3, 8), e('Bench Press', 3, 8)] }]), plan([{ exercises: [e('Leg Press', 3, 10), e('Bench Press', 4, 8)] }]));
check('diff added', d.added, ['Leg Press 3×10']);
check('diff removed', d.removed, ['Squat']);
check('diff changed', d.changed, ['Bench Press 3×8 → 4×8']);

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
