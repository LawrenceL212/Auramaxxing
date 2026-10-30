/* Tests for the weight path.  Run:  node test/weight-path.test.mjs
   No dependencies and no runner, like the other tests here. */

import { cleanWeights, averageAt, weeklyRate, weeklyChange, parseGoal, expectedAt, pathStatus, pathLine, pathSvg, KCAL_PER_KG } from '../weight-path.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`);
}

const START = '2026-09-01';
const day = (n) => shiftDay(START, n);
// a cut from 80 kg on 2026-09-01 to 74 kg on 2026-11-30 (90 days)
const goal = parseGoal({ target: 74, startValue: 80, since: START, targetDate: day(90) });
const series = (f, from = 0, to = 28, every = 1) => { const out = []; for (let i = from; i <= to; i += every) out.push({ date: day(i), weight: f(i) }); return out; };

check('goal parses from a directive', goal && goal.dir === -1 && goal.startKg === 80 && goal.targetDate === day(90));
check('no target or start: no goal', parseGoal({ target: 0, startValue: 80, since: START }) === null && parseGoal({ target: 74, startValue: 0, since: START }) === null && parseGoal(null) === null);
check('createdAt stands in for since', parseGoal({ target: 74, startValue: 80, createdAt: START }).startDate === START);

check('path starts at the start weight', expectedAt(goal, START) === 80);
check('path halfway is halfway', expectedAt(goal, day(45)) === 77);
check('path ends at the goal and stays there', expectedAt(goal, day(90)) === 74 && expectedAt(goal, day(200)) === 74);
check('path before the start is the start', expectedAt(goal, shiftDay(START, -5)) === 80);
check('no goal date: no path', expectedAt(parseGoal({ target: 74, startValue: 80, since: START }), day(10)) === null);

check('bad entries dropped, one per date', cleanWeights([{ date: 'x', weight: 70 }, { date: day(1), weight: 5 }, { date: day(2), weight: 70 }, { date: day(2), weight: 71 }]).length === 1);

// on the line: 80 - 6/90 per day
const onLine = series(i => Math.round((80 - i * 6 / 90) * 10) / 10, 0, 28, 3);
const on = pathStatus(onLine, goal, day(28));
check('on the line reads as on path', on.track === 'on' && Math.abs(on.aheadKg) <= 0.5, JSON.stringify(on));
check('on-line pace finishes near the goal date', on.finishDate && Math.abs(Date.parse(on.finishDate) - Date.parse(goal.targetDate)) <= 8 * 864e5, on.finishDate);

const slow = pathStatus(series(i => 80 - i * 0.02, 0, 28, 2), goal, day(28));
check('slow loss is behind the path', slow.track === 'behind' && slow.aheadKg < -0.5, JSON.stringify(slow));
check('behind: needs a faster pace than the line', slow.neededPerWeek < slow.rate, `${slow.neededPerWeek} vs ${slow.rate}`);
check('behind: projected finish is after the goal date', slow.finishDate > goal.targetDate, slow.finishDate);

const fast = pathStatus(series(i => 80 - i * 0.12, 0, 28, 2), goal, day(28));
check('fast loss is ahead of the path', fast.track === 'ahead' && fast.aheadKg > 0.5, JSON.stringify(fast));

check('needed pace is negative on a cut', slow.neededPerWeek < 0);
check('kcal/day matches 7700 kcal per kg', Math.abs(slow.kcalPerDay - Math.abs(slow.neededPerWeek) * KCAL_PER_KG / 7) <= 10, String(slow.kcalPerDay));
check('percent of goal from the start', on.pct === Math.round((80 - on.current) / 6 * 100));
check('best is the lowest weight on a cut', fast.best === Math.round(Math.min(...series(i => 80 - i * 0.12, 0, 28, 2).map(w => w.weight)) * 10) / 10);

check('reached when at or below the goal', pathStatus([{ date: day(60), weight: 73.8 }, { date: day(61), weight: 73.9 }], goal, day(61)).track === 'reached');
check('one entry: status without a rate or finish date', (() => { const s = pathStatus([{ date: day(3), weight: 79.5 }], goal, day(3)); return s.rate === null && s.finishDate === null && s.track !== 'unknown'; })());
check('no entries: no status', pathStatus([], goal, day(3)) === null);
check('future entries are ignored', pathStatus([{ date: day(1), weight: 79.9 }, { date: day(50), weight: 70 }], goal, day(2)).latest === 79.9);

// a gain
const gain = parseGoal({ target: 85, startValue: 80, since: START, targetDate: day(100) });
const g = pathStatus(series(i => 80 + i * 0.05, 0, 28, 2), gain, day(28));
check('a gain: ahead means heavier than the line', g.track === 'behind' || g.track === 'on' || g.track === 'ahead');
check('a gain: needed pace is positive', g.neededPerWeek > 0);
check('a gain: best is the highest weight', g.best === Math.round(Math.max(...series(i => 80 + i * 0.05, 0, 28, 2).map(w => w.weight)) * 10) / 10);

// rate and weekly change
check('rate needs 3 entries over a week', weeklyRate([{ date: day(1), weight: 80 }, { date: day(2), weight: 79 }], day(3)) === null);
check('rate is kg per week', Math.abs(weeklyRate(series(i => 80 - i * 0.1, 0, 21, 1), day(21)) + 0.7) < 0.05);
const wc = weeklyChange([...series(() => 80, 0, 6), ...series(() => 79, 7, 13)], day(13));
check('weekly change compares 7-day averages', wc && wc.thisAvg === 79 && wc.lastAvg === 80 && wc.diff === -1, JSON.stringify(wc));
check('weekly change needs both weeks', weeklyChange(series(() => 80, 0, 6), day(6)) === null);
check('one weigh-in a week is enough', weeklyChange([{ date: day(0), weight: 80 }, { date: day(7), weight: 79.4 }], day(7)).diff === -0.6);

check('path line names the gap', /behind your path/.test(pathLine(slow)) && /ahead of your path/.test(pathLine(fast)) && /On your path/.test(pathLine(on)));
check('path line for a reached goal', /reached/.test(pathLine({ track: 'reached', target: 74 })));
const svg = pathSvg(onLine, goal, { today: day(28) });
check('chart draws path, average and goal marker', /<svg/.test(svg) && /stroke-dasharray="2 4"/.test(svg) && /<polyline/.test(svg) && /fill="none" stroke="var\(--legendary\)"/.test(svg));
check('chart needs two entries', pathSvg([{ date: day(1), weight: 80 }], goal, { today: day(1) }) === '');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
