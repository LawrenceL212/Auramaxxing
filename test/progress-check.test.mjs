/* Tests for the progress check.  Run:  node test/progress-check.test.mjs
   No dependencies and no runner, like the other tests here. */

import { progressCheck } from '../progress-check.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`);
}

const TODAY = '2026-10-29'; // a Thursday
const day = (n) => shiftDay(TODAY, n);
const base = { today: TODAY, streak: 0, weeklyGoal: 3, sessionDates: [], prDates: [], level: 12, rank: 'D', lastCheckinDate: day(-3) };
const get = (r, key) => r.wins.find(w => w.key === key);

const none = progressCheck({ ...base });
check('no sessions at all: restart, never praise', none.tone === 'restart' && none.headline === 'Time to restart' && none.next.action === 'train', JSON.stringify(none));
check('no date: nothing', progressCheck({}) === null && progressCheck(null) === null);

const lapsed = progressCheck({ ...base, sessionDates: [day(-20), day(-25)] });
check('20 days idle with no streak: restart', lapsed.tone === 'restart' && /20 days since your last session/.test(lapsed.line), lapsed.line);

const good = progressCheck({ ...base, streak: 9, sessionDates: [day(0), day(-1), day(-3), day(-8), day(-12), day(-16), day(-20), day(-24)], prDates: [day(-5), day(-9)], checkinProgress: { headline: 'Recomposing', better: 4, worse: 0, first: false } });
check('a real run is fire or strong', good.tone === 'fire' || good.tone === 'strong', good.tone);
check('streak shows as a win', get(good, 'streak').value === '9');
check('week goal hit is a win', get(good, 'week').kind === 'win' && get(good, 'week').value === '3/3' || get(good, 'week').value.endsWith('/3'));
check('PRs counted in 30 days', get(good, 'prs').value === '2');
check('body progress surfaces in the line', /body measurements moved/.test(good.line), good.line);

const month = progressCheck({ ...base, streak: 1, sessionDates: [day(0), day(-5), day(-10), day(-33), day(-40)] });
check('month compares with the 30 before', get(month, 'month').value === '3' && /\+1 on the 30 before/.test(get(month, 'month').sub), JSON.stringify(get(month, 'month')));

const behind = progressCheck({ ...base, streak: 2, sessionDates: [day(0)], physique: { label: 'Lean & defined', overall: 20, track: 'behind' } });
check('behind pace is flagged, not hidden', get(behind, 'physique').kind === 'warn' && /Behind/.test(get(behind, 'physique').sub));
check('physique replaces the weight-goal tile', !get(behind, 'weight'));
const wpOnly = progressCheck({ ...base, streak: 2, sessionDates: [day(0)], weightPath: { track: 'ahead', pct: 40 } });
check('weight path shows when there is no physique goal', get(wpOnly, 'weight').value === '40%');

check('next step: check-in when it is a week old', progressCheck({ ...base, streak: 3, sessionDates: [day(0), day(-1), day(-2)], lastCheckinDate: day(-9) }).next.action === 'checkin');
check('next step: first check-in when there is none', progressCheck({ ...base, streak: 3, sessionDates: [day(0), day(-1), day(-2)], lastCheckinDate: null }).next.action === 'checkin');
check('next step: sessions left this week', (() => { const r = progressCheck({ ...base, streak: 3, sessionDates: [day(0)], lastCheckinDate: day(-1) }); return r.next.action === 'train' && /2 more sessions/.test(r.next.text); })());
check('next step: train today when planned and not done', progressCheck({ ...base, streak: 3, sessionDates: [day(-1)], plannedToday: true, trainedToday: false }).next.action === 'train');
check('next step: set a goal when all is done and none is set', progressCheck({ ...base, streak: 5, sessionDates: [day(0), day(-1), day(-2)], lastCheckinDate: day(-1) }).next.action === 'goal');
check('next step: no goal nag when the coach already has goals', progressCheck({ ...base, coachGoals: true, streak: 5, sessionDates: [day(0), day(-1), day(-2)], lastCheckinDate: day(-1) }).next.action === null);
check('next step: nothing to push when everything is done', progressCheck({ ...base, streak: 5, sessionDates: [day(0), day(-1), day(-2)], lastCheckinDate: day(-1), physique: { label: 'X', overall: 50, track: 'on' } }).next.action === null);

check('future sessions are ignored', progressCheck({ ...base, sessionDates: [day(2), day(3)] }).tone === 'restart');
check('at most six wins', good.wins.length <= 6);
check('same day, same line', progressCheck({ ...base, streak: 4, sessionDates: [day(0)] }).line === progressCheck({ ...base, streak: 4, sessionDates: [day(0)] }).line);
check('every tone has copy', ['fire', 'strong', 'steady', 'restart'].every(t => progressCheck({ ...base, streak: t === 'fire' ? 9 : t === 'strong' ? 3 : 1, sessionDates: t === 'restart' ? [] : [day(0)], prDates: t === 'fire' ? [day(-1)] : [], checkinProgress: t === 'fire' ? { headline: 'x', better: 3, worse: 0, first: false } : null }).line.length > 10));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
