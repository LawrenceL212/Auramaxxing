/* Tests for the weigh-in sheet and on-track view.  Run:  node test/weigh-in.test.mjs
   No dependencies and no runner, in the style of test/streak.test.mjs. */

import {
  cleanWeights, startWeight, stepWeight, parseWeight, trendSeries, weeklyRate,
  weightStats, signedKg, goalPace, paceLine, trendSvg,
} from '../weigh-in.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const today = '2026-10-26'; // a Monday
// A steady cut: 80.0 kg 35 days ago, down 0.1 kg every day logged, every other day.
const cut = [];
for (let i = 35; i >= 0; i -= 1) if (i % 2 === 0) cut.push({ date: shiftDay(today, -i), weight: Math.round((80 - (35 - i) * 0.1) * 10) / 10 });

// ── cleaning and the start value ─────────────────────────────────────────
check('drops junk and keeps the last entry per date',
  cleanWeights([{ date: '2026-10-01', weight: 80 }, { date: '2026-10-01', weight: 79.5 }, { date: '2026-10-02', weight: 'x' }, { date: '2026-10-03', weight: 5 }, null]),
  [{ date: '2026-10-01', weight: 79.5 }]);
check('sorts oldest first', cleanWeights([{ date: '2026-10-05', weight: 80 }, { date: '2026-10-01', weight: 81 }]).map(w => w.date), ['2026-10-01', '2026-10-05']);
check('start is today when logged today', startWeight([{ date: '2026-10-20', weight: 80 }, { date: today, weight: 79.4 }], today, 75), 79.4);
check('start is the last weigh-in', startWeight([{ date: '2026-10-20', weight: 80 }], today, 75), 80);
check('start falls back to the profile', startWeight([], today, 72.25), 72.3);
check('start defaults to 70', startWeight([], today, null), 70);

// ── steppers and typing ──────────────────────────────────────────────────
check('step +0.1 has no float drift', stepWeight(78.2, 0.1), 78.3);
check('step -0.5', stepWeight(78.2, -0.5), 77.7);
check('step clamps at the floor', stepWeight(20.2, -0.5), 20);
check('step from nothing starts at 70', stepWeight('', 0.1), 70.1);
check('parse accepts a comma', parseWeight('78,4'), 78.4);
check('parse rounds to 0.1', parseWeight('78.46'), 78.5);
check('parse rejects nonsense', [parseWeight(''), parseWeight('abc'), parseWeight('7'), parseWeight('900')], [null, null, null, null]);

// ── trend and rate ───────────────────────────────────────────────────────
const s = trendSeries([{ date: '2026-10-01', weight: 80 }, { date: '2026-10-03', weight: 79 }, { date: '2026-10-10', weight: 78 }]);
check('7-day average includes the week before', s.map(p => p.avg), [80, 79.5, 78]);
check('rate is null with too few weigh-ins', weeklyRate(cut.slice(-2), today), null);
check('rate is null when all within a week', weeklyRate([{ date: '2026-10-24', weight: 80 }, { date: '2026-10-25', weight: 79 }, { date: '2026-10-26', weight: 78 }], today), null);
check('rate of a steady 0.1 kg/day cut is -0.7 kg/week', weeklyRate(cut, today), -0.7);

// ── the stats block ──────────────────────────────────────────────────────
const st = weightStats(cut, today);
check('latest', [st.latest, st.latestDate, st.loggedToday], [76.5, today, true]);
check('vs last weigh-in', st.vsLast, -0.2);
check('7-day average', st.avg7, 76.8);
check('30-day change compares averages', st.change30, -2.9);
check('weigh-ins this week (Mon start)', st.thisWeek, 1);
check('empty stats', weightStats([], today).latest, null);
check('future entries are ignored', weightStats([{ date: '2026-11-01', weight: 70 }], today).count, 0);

// ── signed kg ────────────────────────────────────────────────────────────
check('signed', [signedKg(0.42), signedKg(-1.26), signedKg(0), signedKg(null)], ['+0.4', '−1.3', '0.0', '—']);

// ── goal pace ────────────────────────────────────────────────────────────
const on = goalPace(st, { target: 75, startValue: 80 }, today);
check('on track with no date', [on.status, on.weeksLeft, on.pct], ['on', 3, 64]);
check('on track line', paceLine(on), 'On track · about 3 weeks to 75 kg.');
const behind = goalPace(st, { target: 70, startValue: 80, targetDate: shiftDay(today, 28) }, today);
check('behind when the date comes first', [behind.status, behind.neededPerWeek], ['behind', -1.7]);
check('behind line', paceLine(behind), 'Behind pace · needs 1.7 kg a week to make the date.');
check('off when gaining toward a cut', goalPace(weightStats(cut.map(w => ({ ...w, weight: 160 - w.weight })), today), { target: 75, startValue: 80 }, today).status, 'off');
check('reached', goalPace(st, { target: 77, startValue: 80 }, today).status, 'reached');
check('a bulk counts upward', goalPace(weightStats(cut.map(w => ({ ...w, weight: 150 - w.weight })), today), { target: 76, startValue: 70 }, today).status, 'on');
check('unknown pace without enough weigh-ins', goalPace(weightStats([{ date: today, weight: 78 }], today), { target: 75, startValue: 80 }, today).status, 'unknown');
check('unknown line', paceLine(goalPace(weightStats([{ date: today, weight: 78 }], today), { target: 75, startValue: 80 }, today)), '3.0 kg to go · log a few more weigh-ins to see your pace.');
check('no goal, no pace', goalPace(st, null, today), null);

// ── chart ────────────────────────────────────────────────────────────────
const svg = trendSvg(cut, { today, goal: 75 });
check('chart draws an average line and a goal line', [svg.startsWith('<svg'), svg.includes('<polyline'), svg.includes('goal 75')], [true, true, true]);
check('chart skips a far goal', trendSvg(cut, { today, goal: 60 }).includes('goal 60'), false);
check('chart is empty with one point', trendSvg([{ date: today, weight: 80 }], { today }), '');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
