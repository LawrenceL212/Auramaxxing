/* Tests for the plan editor insights.  node test/plan-insights.test.mjs */

import { BASE_EXERCISES } from '../exercises.js';
import {
  actualVolume, volumeStatus, volumeRows, liftSeries, lastSession, exerciseInsight, dayStats, suggestionsByDay,
} from '../plan-insights.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const TODAY = '2026-10-19';
const EX = BASE_EXERCISES;
const kg = (n, weight, reps) => Array.from({ length: n }, () => ({ reps, weight }));
const session = (date, name, sets) => ({ date, exercises: [{ name, sets }] });
const plan = (days, schedule = ['Mon', 'Wed', 'Fri']) => ({ name: 'T', schedule, scheduleMode: 'rotation', days, currentDayIndex: 0 });

// ── volume status ────────────────────────────────────────────────────────
check('no sets is not trained', volumeStatus('Chest', 0).key, 'none');
check('under the minimum is low', volumeStatus('Chest', 5).key, 'low');
check('between minimum and the target is building', volumeStatus('Chest', 10).key, 'ok');
check('at the target is in range', volumeStatus('Chest', 14).key, 'good');
check('past the maximum is high', volumeStatus('Chest', 30).key, 'high');

// ── actual volume ────────────────────────────────────────────────────────
const w = [
  session('2026-10-15', 'Bench Press', kg(4, 60, 8)),
  session('2026-10-08', 'Bench Press', kg(4, 60, 8)),
  session('2026-08-01', 'Bench Press', kg(10, 60, 8)),   // outside the 4 weeks
];
check('actual chest sets are averaged over 4 weeks and ignore older sessions', actualVolume(w, EX, TODAY).Chest > 0 && actualVolume(w, EX, TODAY).Chest < 3, true);
check('a future session is ignored', actualVolume([session('2026-11-01', 'Bench Press', kg(4, 60, 8))], EX, TODAY).Chest, 0);
check('sets with no reps are not counted', actualVolume([session('2026-10-15', 'Bench Press', [{ reps: 0, weight: 60 }])], EX, TODAY).Chest, 0);

// ── rows ─────────────────────────────────────────────────────────────────
const p = plan([{ name: 'Push', exercises: [{ name: 'Bench Press', sets: 4, reps: 8 }] }]);
const rows = volumeRows(p, EX, w, TODAY);
check('one row per muscle group', rows.length, 9);
check('planned chest sets come from the plan', rows.find(r => r.group === 'Chest').planned > 0, true);

// ── last session and insight ─────────────────────────────────────────────
check('no history is new', exerciseInsight('Bench Press', [], TODAY).status, 'new');
check('last session is the latest date', lastSession('Bench Press', w, TODAY).date, '2026-10-15');
check('last session reports the heaviest set', lastSession('Bench Press', [session('2026-10-15', 'Bench Press', [{ reps: 8, weight: 60 }, { reps: 5, weight: 70 }])], TODAY).weight, 70);
const two = [session('2026-10-01', 'Bench Press', kg(3, 60, 8)), session('2026-10-08', 'Bench Press', kg(3, 62, 8))];
check('two sessions are still building', exerciseInsight('Bench Press', two, TODAY).status, 'building');
const up = [60, 62, 64, 66].map((kgv, i) => session(`2026-10-0${i * 2 + 1}`, 'Bench Press', kg(3, kgv, 8)));
check('rising e1RM is progressing', exerciseInsight('Bench Press', up, TODAY).status, 'progressing');
const flat = [1, 3, 5, 7].map(d => session(`2026-10-0${d}`, 'Bench Press', kg(3, 60, 8)));
check('flat e1RM is stalled', exerciseInsight('Bench Press', flat, TODAY).status, 'stalled');
check('series is oldest first', liftSeries('Bench Press', up, TODAY).map(x => x.date), ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07']);

// ── day stats ────────────────────────────────────────────────────────────
const ds = dayStats({ exercises: [{ name: 'Bench Press', sets: 4, reps: 8 }, { name: 'Overhead Press', sets: 4, reps: 8 }] }, EX);
check('day sets add up', ds.sets, 8);
check('minutes round to 5', ds.minutes % 5, 0);
check('day groups lead with chest or shoulders', ['Chest', 'Shoulders'].includes(ds.groups[0]), true);
check('empty day has no sets', dayStats({ exercises: [] }, EX).sets, 0);

// ── suggestion grouping ──────────────────────────────────────────────────
const g = suggestionsByDay([{ change: { dayIndex: 1 } }, { change: null }, { change: { dayIndex: 1 } }, { change: { dayIndex: 0 } }]);
check('suggestions group by day', [Object.keys(g.byDay), g.byDay[1].length, g.plan.length], [['0', '1'], 2, 1]);

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
