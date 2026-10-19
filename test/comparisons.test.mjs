/* Tests for hunter comparisons.  node test/comparisons.test.mjs */
import { liftEdges, statEdges, compareHunters, describeEdges, liftRival, rivalryMoments } from '../comparisons.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const mine = { 'Bench Press': { e1rm: 80 }, Squat: { e1rm: 100 }, Deadlift: { e1rm: 150 }, Curl: { e1rm: 30 } };
const theirs = { 'Bench Press': { e1rm: 100 }, Squat: { e1rm: 80 }, Deadlift: { e1rm: 151 }, Row: { e1rm: 70 } };

const lifts = liftEdges(mine, theirs);
check('only shared lifts are compared', lifts.map(l => l.exercise).sort(), ['Bench Press', 'Deadlift', 'Squat']);
check('biggest gap first', lifts[0].exercise, 'Bench Press');
check('they lead on bench', lifts.find(l => l.exercise === 'Bench Press').lead, 'them');
check('you lead on squat', lifts.find(l => l.exercise === 'Squat').lead, 'me');
check('within 3% is a tie', lifts.find(l => l.exercise === 'Deadlift').lead, 'tie');
check('a lift with no e1RM is skipped', liftEdges({ A: { e1rm: 0 } }, { A: { e1rm: 50 } }), []);

const defs = [{ id: 'strength', label: 'Strength' }, { id: 'endurance', label: 'Endurance' }, { id: 'focus', label: 'Focus' }];
const stats = statEdges({ strength: 'B', endurance: 'D' }, { strength: 'C', endurance: 'A' }, defs);
check('rank lead and steps', stats.map(s => [s.lead, s.steps]), [['me', 1], ['them', 3], ['tie', 0]]);

const cmp = compareHunters({ hunterLevel: 12, stats: { strength: 'B' } }, { displayName: 'Ben', hunterLevel: 9, stats: { strength: 'C' } },
  { myStreak: 4, theirStreak: 10, myWeek: 2, theirWeek: 2, myPRs: mine, theirPRs: theirs, statDefs: defs });
check('level lead', cmp.level.lead, 'me');
check('streak lead', cmp.streak.lead, 'them');
check('equal week is a tie', cmp.week.lead, 'tie');

const d = describeEdges(cmp, 2);
check('limit applies per side', [d.youLead.length <= 2, d.theyLead.length <= 2], [true, true]);
check('counts are the full totals', d.youLeadCount >= d.youLead.length, true);
check('they-lead sentence names the gap', d.theyLead.some(s => s.startsWith('Bench Press: 100 kg vs your 80 kg')), true);
check('ties are not listed', [...d.youLead, ...d.theyLead].some(s => s.startsWith('This week')), false);

check('lift rival: someone leads', liftRival('Bench Press', mine, [['Ben', theirs]]).lead, 'them');
check('lift rival: you lead', liftRival('Squat', mine, [['Ben', theirs]]).lead, 'me');
check('lift rival: nobody logged it', liftRival('Curl', mine, [['Ben', theirs]]), null);
check('lift rival: you have not logged it', liftRival('Row', mine, [['Ben', theirs]]).text, 'Ben has 70 kg e1RM');

// ── feed moments ─────────────────────────────────────────────────────────
const T = '2026-10-19', CUT = '2026-10-05';
const mePRs = { 'Bench Press': { e1rm: 80, date: '2026-10-18' }, Squat: { e1rm: 120, date: '2026-09-01' } };
const ben = { uid: 'b', name: 'Ben', prs: { 'Bench Press': { e1rm: 100, date: '2026-10-17' }, Squat: { e1rm: 90, date: '2026-10-10' } }, streak: 9, trainedToday: true };
const m = rivalryMoments({ uid: 'a', trainedToday: true, streak: 8 }, [ben], mePRs, T, CUT);
check('a recent PR ahead of yours is a moment', m.some(x => x.kind === 'ahead' && x.text.includes('Bench Press PR (100 kg) is ahead of yours (80 kg)')), true);
check('your older PR is not a moment', m.some(x => x.text.startsWith('Your Squat')), false);
check('training together is a moment', m.some(x => x.kind === 'together'), true);
check('two streaks of 7+ is a moment', m.find(x => x.kind === 'streaks').text, 'You and Ben are both on 8+ day streaks');
check('your recent PR that leads them', rivalryMoments({ uid: 'a' }, [{ uid: 'b', name: 'Ben', prs: { Squat: { e1rm: 90 } } }], { Squat: { e1rm: 120, date: '2026-10-18' } }, T, CUT)[0].text, 'Your Squat PR (120 kg) now leads Ben (90 kg)');
check('no moments with nobody else', rivalryMoments({ uid: 'a' }, [], mePRs, T, CUT), []);

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
