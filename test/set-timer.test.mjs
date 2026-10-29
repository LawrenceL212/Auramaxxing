/* Tests for the logger's hold timer and rest countdown rules.  Run:  node test/set-timer.test.mjs */
import { clampRest, baseRestSecs, restSecsFor, adjustRest, formatClock, nextOpenSet,
         holdProgress, heldSecs, REST_MIN, REST_MAX } from '../set-timer.js';
import { BASE_EXERCISES } from '../exercises.js';

let fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : ` got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
}
const ex = n => BASE_EXERCISES[n];

check('clamp rounds to 15s', clampRest(97), 90);
check('clamp floor', clampRest(0), REST_MIN);
check('clamp ceiling', clampRest(9999), REST_MAX);
check('adjust up', adjustRest(90, 15), 105);
check('adjust never below min', adjustRest(15, -15), REST_MIN);

check('planche hold rests long', baseRestSecs(ex('Tuck Planche')), 120);
check('mobility rests short', baseRestSecs({ intent: 'mobility', timed: true }), 30);
check('plain hold', baseRestSecs({ intent: 'defence', timed: true }), 60);
check('barbell strength', baseRestSecs({ intent: 'strength', equipment: 'Barbell' }), 150);
check('hypertrophy', baseRestSecs({ intent: 'hypertrophy', equipment: 'Dumbbell' }), 90);
check('unknown exercise', baseRestSecs(undefined), 90);

check('saved choice wins', restSecsFor(ex('Tuck Planche'), { goal: 'endurance', saved: 75 }), 75);
check('strength goal lengthens', restSecsFor({ intent: 'hypertrophy', equipment: 'Dumbbell' }, { goal: 'strength' }), 120);
check('endurance goal caps', restSecsFor({ intent: 'strength', equipment: 'Barbell' }, { goal: 'endurance' }), 60);
check('bad saved ignored', restSecsFor({ intent: 'hypertrophy' }, { saved: 'x' }), 90);
check('every base exercise gets a rest in bounds',
  Object.values(BASE_EXERCISES).every(d => { const r = restSecsFor(d); return r >= REST_MIN && r <= REST_MAX && r % 15 === 0; }), true);

check('clock', formatClock(95), '1:35');
check('clock zero', formatClock(-3), '0:00');

const rows = [{ sets: [true, false, false] }, { sets: [false] }];
check('next set same exercise', nextOpenSet(rows, 0), { row: 0, set: 1 });
check('next exercise when done', nextOpenSet([{ sets: [true] }, { sets: [true, false] }], 0), { row: 1, set: 1 });
check('wraps to earlier open set', nextOpenSet([{ sets: [false] }, { sets: [true] }], 1), { row: 0, set: 0 });
check('all done', nextOpenSet([{ sets: [true] }], 0), null);

check('hold under last', holdProgress(10, 20), { pct: 0.5, beat: false, left: 10 });
check('hold beat last', holdProgress(21, 20), { pct: 1, beat: true, left: 0 });
check('no last time', holdProgress(5, 0), { pct: 0, beat: false, left: 0 });
check('held seconds', heldSecs(1000, 31400), 30);
if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('all passed');
