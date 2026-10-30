/* Run:  node test/penalty-view.test.mjs */
import { penaltyView, nextTrainingLabel } from '../penalty-view.js';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}
const fixed = { scheduleMode: 'fixed', schedule: [], days: [{ name: 'Push', assignedDays: ['Mon', 'Thu'] }, { name: 'Pull', assignedDays: ['Tue', 'Fri'] }] };
const rot = { scheduleMode: 'rotation', schedule: ['Mon', 'Wed', 'Fri'], days: [{ name: 'A' }, { name: 'B' }] };
// 2026-10-20 is a Tuesday, 2026-10-21 a Wednesday
const v = penaltyView({ apLost: 25, apBefore: 500, missedDate: '2026-10-20', program: fixed, today: '2026-10-21' });
check('names the missed day and plan day', v.cause, "Tuesday's Pull Hunt went unfinished.");
check('cost and balance', [v.cost, v.balance, v.after], ['−25 AP', '500 → 475 AP', 475]);
check('next training day tomorrow', v.clear, 'Tomorrow is your next training day. Train then and nothing more is docked.');
check('later weekday', penaltyView({ apLost: 5, apBefore: 40, missedDate: '2026-10-20', program: fixed, today: '2026-10-22' }).clear, 'Train today and the System finds nothing to dock tomorrow.');
check('named weekday', penaltyView({ apLost: 5, apBefore: 40, missedDate: '2026-10-20', program: fixed, today: '2026-10-24' }).clear.startsWith('Your next training day is Monday'), true);
check('rotation has no plan day name', penaltyView({ apLost: 5, apBefore: 40, missedDate: '2026-10-20', program: rot, today: '2026-10-21' }).cause, 'Tuesday was a training day. No session was logged.');
check('today is training day', nextTrainingLabel(rot, '2026-10-21'), 'Today');
check('tomorrow', nextTrainingLabel(rot, '2026-10-22'), 'Tomorrow');
check('no plan means today', nextTrainingLabel(null, '2026-10-21'), 'Today');
check('minimum note when small balance', penaltyView({ apLost: 5, apBefore: 40, missedDate: '2026-10-20', program: null, today: '2026-10-21' }).rule.includes('never less than 5'), true);
check('never negative', penaltyView({ apLost: 50, apBefore: 20, missedDate: '2026-10-20', program: null, today: '2026-10-21' }).after, 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
