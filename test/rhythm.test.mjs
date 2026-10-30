/* Tests for the check-in rhythm.  Run:  node test/rhythm.test.mjs */
import { rhythmState, weighInReward, TIERS } from '../rhythm.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0; const results = [];
function check(name, ok, detail = '') { ok ? pass++ : fail++; results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`); }
const today = '2026-10-29';
const ago = (n) => shiftDay(today, -n);
const run = (days) => days.map(ago);
const state = (o) => rhythmState({ today, weightDates: [], tapeDates: [], fullDates: [], ...o });
const tier = (s, k) => s.tiers.find(t => t.key === k);

check('three sizes: daily, weekly, four-weekly', TIERS.weigh.everyDays === 1 && TIERS.tape.everyDays === 7 && TIERS.full.everyDays === 28);
const fresh = state({});
check('nothing logged: all due, smallest ask leads, others also due', fresh.primary.key === 'weigh' && fresh.alsoDue.map(t => t.key).join() === 'tape,full');
check('nothing logged: nudge says start with ten seconds', /ten seconds/.test(fresh.nudge));

const done = state({ weightDates: [today], tapeDates: [ago(2)], fullDates: [ago(10)] });
check('weighed today: weigh not due, tape and full not due, no primary', !tier(done, 'weigh').due && !tier(done, 'tape').due && !tier(done, 'full').due && done.primary === null);
check('weighed today: nudge says nothing else needed', /Nothing else/.test(done.nudge));

const tapeDue = state({ weightDates: [today], tapeDates: [ago(8)], fullDates: [ago(8)] });
check('weighed but tape is 8 days old: tape leads', tapeDue.primary.key === 'tape' && tier(tapeDue, 'tape').overdue === 1);
const fullDue = state({ weightDates: [today], tapeDates: [today], fullDates: [ago(30)] });
check('weighed and taped: the full scan leads at 30 days', fullDue.primary.key === 'full' && tier(fullDue, 'full').overdue === 2);
check('a full scan counts as a tape and a weigh-in', (() => { const s = state({ fullDates: [today] }); return !tier(s, 'weigh').due && !tier(s, 'tape').due && !tier(s, 'full').due; })());
check('a tape check-in counts as a weigh-in', !tier(state({ tapeDates: [today] }), 'weigh').due);
check('future dates are ignored', tier(state({ weightDates: [shiftDay(today, 2)] }), 'weigh').daysSince === null);
check('yesterday: the nudge keeps the run going without guilt', /One miss is nothing/.test(state({ weightDates: [ago(1)] }).nudge));
check('three days: the nudge asks for only the scale', /3 days since/.test(state({ weightDates: [ago(3)] }).nudge) && /Just the scale/.test(state({ weightDates: [ago(3)] }).nudge));

const wk = state({ weightDates: run([0, 1, 2, 4, 6]) });
check('week strip has 7 days ending today, with the done ones marked', wk.week.length === 7 && wk.week[6].date === today && wk.week[6].done && !wk.week[3].done && wk.weighCount === 5);
check('streak counts back from today', state({ weightDates: run([0, 1, 2, 4]) }).streak === 3);
check('streak counts from yesterday while today is open', state({ weightDates: run([1, 2, 3]) }).streak === 3);
check('a gap ends the streak', state({ weightDates: run([2, 3, 4]) }).streak === 0);

// reward
const series = (kgs) => kgs.map((w, i) => ({ date: ago(kgs.length - 1 - i), weight: w }));
const w14 = series([80, 80.2, 80, 79.9, 80.1, 80, 79.8, 79.6, 79.5, 79.6, 79.4, 79.3, 79.4, 79.2]);
const down = weighInReward({ weights: w14, today, kg: 79.2, streak: 8, weighCount: 7 });
check('reward: falling average is named and praised as the number that counts', /down/.test(down.line) && /counts/.test(down.line) && down.trend < 0);
check('reward: a long run is the headline', down.headline === '8 days in a row' && weighInReward({ weights: w14, today, kg: 79.2, streak: 4 }).headline === '4 in a row' && weighInReward({ weights: w14, today, kg: 79.2, streak: 1, weighCount: 5 }).headline === 'A solid week' && weighInReward({ weights: w14, today, kg: 79.2, streak: 1, weighCount: 1 }).headline === 'Logged');
const up = weighInReward({ weights: series([79, 79, 79, 79, 79, 79, 79, 80, 80, 80, 80, 80, 80, 80]), today, kg: 80 });
check('reward: a rising average is honest, not alarming', /up/.test(up.line) && /noise/.test(up.line));
const flat = weighInReward({ weights: series(Array(14).fill(80)), today, kg: 80 });
check('reward: a flat average says steady', /steady/i.test(flat.line));
check('reward: before a week of data the trend is promised, not faked', /after a week/.test(weighInReward({ weights: series([80, 80.1]), today, kg: 80.1 }).line));
const spike = weighInReward({ weights: series([80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 81.2]), today, kg: 81.2 });
check('reward: a big one-day swing is put in its place', /Water and food/.test(spike.note) && spike.dayDiff === 1.2);
check('reward: a small swing adds no note', weighInReward({ weights: w14, today, kg: 79.2 }).note === '');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
