/* Tests for the weekly weight goal.  Run:  node test/weight-rate.test.mjs
   No dependencies and no runner, like the other tests here. */

import { parseRateGoal, rateGoalField, safeLoss, rateBase, rateExpected, rateTrack, rateLine, averageLine, signed, signedRate, RATE_OPTIONS } from '../weight-rate.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`);
}

const START = '2026-10-01';
const day = (n) => shiftDay(START, n);
const series = (f, from, to) => { const out = []; for (let i = from; i <= to; i++) out.push({ date: day(i), weight: f(i) }); return out; };
const goal = { kgPerWeek: -0.5, since: START };

check('goal parses', parseRateGoal(goal)?.kgPerWeek === -0.5);
check('bad goals rejected', parseRateGoal(null) === null && parseRateGoal({ kgPerWeek: 0, since: START }) === null
  && parseRateGoal({ kgPerWeek: -3, since: START }) === null && parseRateGoal({ kgPerWeek: -0.5, since: 'x' }) === null
  && parseRateGoal({ kgPerWeek: 'abc', since: START }) === null);
check('field to store starts today', JSON.stringify(rateGoalField(-0.75, day(3))) === JSON.stringify({ kgPerWeek: -0.75, since: day(3) }));
check('options are losses a week', RATE_OPTIONS.includes(0.5) && RATE_OPTIONS.every(x => x > 0));
check('1% of bodyweight is the safe ceiling', safeLoss(84) === 0.85 && safeLoss(70) === 0.7 && safeLoss(0) === null);

// a week of 85 kg before the goal starts, so the line starts at 85
const flatBefore = series(() => 85, -6, 0);
check('base is the 7-day average on the start day', JSON.stringify(rateBase(flatBefore, goal)) === JSON.stringify({ date: START, kg: 85 }));
check('no weigh-in before: base is the first one after', JSON.stringify(rateBase([{ date: day(2), weight: 84 }], goal)) === JSON.stringify({ date: day(2), kg: 84 }));
check('line falls 0.5 a week', rateExpected(goal, { date: START, kg: 85 }, day(14)) === 84);

// exactly on the line: 85 then down 0.5 kg a week, every day
const onLine = [...flatBefore, ...series(i => 85 - 0.5 * i / 7, 1, 28)];
const t = rateTrack(onLine, goal, day(28));
check('no track without a goal', rateTrack(onLine, null, day(28)) === null);
check('tracks the latest weigh-in', t && t.latestDate === day(28) && t.days === 28);
check('on a straight line the 7-day avg lags, still on pace', t.status === 'on', JSON.stringify({ c: t.current, e: t.expected, a: t.ahead }));
check('average per week is close to the goal', t.avgPerWeek < -0.4 && t.avgPerWeek > -0.6, String(t.avgPerWeek));
check('each weigh-in judged, newest first, at most 7', t.entries.length === 7 && t.entries[0].date === day(28) && t.entries.every(e => e.status === 'on'));
check('this week vs last week', t.week && t.week.diff === -0.5, JSON.stringify(t.week));

// losing faster: 1 kg a week
const fast = [...flatBefore, ...series(i => 85 - i / 7, 1, 21)];
const tf = rateTrack(fast, goal, day(21));
check('faster than the goal is ahead', tf.status === 'ahead' && tf.ahead > 0.3, JSON.stringify(tf));
check('ahead sentence', /^Ahead of pace/.test(rateLine(tf)));

// stalled at 85
const flat = series(() => 85, -6, 21);
const ts = rateTrack(flat, goal, day(21));
check('stalled is behind by the line', ts.status === 'behind' && ts.ahead === -1.5, JSON.stringify({ a: ts.ahead }));
check('behind sentence names the line', /^Behind pace/.test(rateLine(ts)) && rateLine(ts).includes('83.5'));
check('average sentence', averageLine(ts) === 'Averaging 0.0 kg a week over 3 weeks, against a goal of −0.5.', averageLine(ts));

// a single heavy day is softened by the 7-day average
const spike = [...onLine.slice(0, -1), { date: day(28), weight: 81.8 }];
const tsp = rateTrack(spike, goal, day(28));
check('one heavy day barely moves the judgement', tsp.entries[0].weight === 81.8 && tsp.status === 'on' && Math.abs(tsp.ahead - t.ahead) <= 0.21, JSON.stringify([tsp.ahead, t.ahead, tsp.status]));

// first days: no average per week yet
const early = [...flatBefore, { date: day(1), weight: 84.9 }];
const te = rateTrack(early, goal, day(1));
check('no weekly average before a week', te.avgPerWeek === null && averageLine(te) === '');
check('first-day sentence explains the line', /^Line set: lose 0.5 kg a week from 85.0 kg/.test(rateLine({ ...te, weighIns: 1 })));

// a gain goal reads the other way
const gain = rateTrack(series(i => 70 + i / 7, -6, 21), { kgPerWeek: 0.25, since: START }, day(21));
check('gaining faster than a gain goal is ahead', gain.status === 'ahead');

// weigh-ins after today are ignored
check('future entries ignored', rateTrack([...onLine, { date: day(40), weight: 60 }], goal, day(28)).latestDate === day(28));

check('signed formats', signed(-0.46) === '−0.5' && signed(0.2) === '+0.2' && signed(0) === '0.0');
check('signed rate keeps quarter kilos', signedRate(-0.25) === '−0.25' && signedRate(-0.5) === '−0.5' && signedRate(1) === '+1.0');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
