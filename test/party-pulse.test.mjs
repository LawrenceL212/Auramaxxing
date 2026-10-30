/* Tests for the party pulse.  node test/party-pulse.test.mjs */
import { partyPulse, pulseSummary, agoLabel } from '../party-pulse.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const TODAY = '2026-10-19', WEEK = '2026-10-19';
const users = [{ uid: 'a', displayName: 'Ana' }, { uid: 'b', displayName: 'Ben' }, { uid: 'c', displayName: 'Cy' }];
const w = (uid, date) => ({ uid, date, exercises: [] });
const rows = partyPulse(users, [w('b', '2026-10-19'), w('b', '2026-10-15'), w('c', '2026-10-10'), w('a', '2026-10-30')], TODAY, 'a', WEEK);

check('signed-in hunter is first', rows[0].uid, 'a');
check('then the most recent trainer', rows.map(r => r.uid), ['a', 'b', 'c']);
check('trained today is detected', rows.find(r => r.uid === 'b').trainedToday, true);
check('a future session is ignored', rows[0].lastDate, null);
check('days since last session', rows.find(r => r.uid === 'c').daysAgo, 9);
check('week sessions count from the week start', rows.find(r => r.uid === 'b').weekSessions, 1);

check('summary when nobody trained', pulseSummary(rows.map(r => ({ ...r, trainedToday: false }))), 'Nobody has trained yet today. Be the first.');
check('summary when you are next', pulseSummary(rows), 'Ben has trained today. You\'re next.');
check('summary when everyone trained', pulseSummary(rows.map(r => ({ ...r, trainedToday: true }))), 'The whole party has trained today.');
check('summary when you trained and some did', pulseSummary(rows.map(r => (r.uid === 'a' || r.uid === 'b' ? { ...r, trainedToday: true } : r))), '2 of 3 hunters have trained today.');
check('summary for a party of one', pulseSummary([{ trainedToday: false }]), 'You have not trained today.');
check('empty party has no summary', pulseSummary([]), '');

check('ago: today', agoLabel(0), 'today');
check('ago: yesterday', agoLabel(1), 'yesterday');
check('ago: days', agoLabel(5), '5d ago');
check('ago: weeks', agoLabel(21), '3w ago');
check('ago: never', agoLabel(null), 'no sessions yet');

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
