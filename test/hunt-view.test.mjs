/* Tests for the Hunt screen helpers.  Run:  node test/hunt-view.test.mjs
   No dependencies and no runner, in the style of test/streak.test.mjs. */

import {
  scheduledWeekdays, weekStrip, weekProgress, daysBetween, latestDate,
  agoLabel, estimateMinutes, totalSets, topMuscles, ringArc,
  lastSet, lastTimeLabel, upNext, leftLabel,
} from '../hunt-view.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const fixed = {
  scheduleMode: 'fixed', schedule: [],
  days: [{ name: 'Push', assignedDays: ['Mon', 'Thu'] }, { name: 'Pull', assignedDays: ['Tue', 'Fri'] }],
};
const rotation = { scheduleMode: 'rotation', schedule: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], days: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], currentDayIndex: 1 };

// ── scheduledWeekdays ─────────────────────────────────────────────────────
check('fixed mode uses the days, not the stale schedule', scheduledWeekdays(fixed), ['Mon', 'Tue', 'Thu', 'Fri']);
check('rotation uses the plan schedule', scheduledWeekdays(rotation), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
check('all seven days means no rest days', scheduledWeekdays({ schedule: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], days: [] }), null);
check('empty schedule means no rest days', scheduledWeekdays({ schedule: [], days: [] }), null);
check('no plan means no rest days', scheduledWeekdays(null), null);
check('fixed mode with no assigned days falls back to the schedule',
  scheduledWeekdays({ scheduleMode: 'fixed', schedule: ['Mon'], days: [{ assignedDays: [] }] }), ['Mon']);

// ── weekStrip ─────────────────────────────────────────────────────────────
// 2026-10-22 is a Thursday; its week runs 2026-10-19 (Mon) to 2026-10-25 (Sun).
const strip = weekStrip({ today: '2026-10-22', program: fixed, workoutDates: ['2026-10-19', '2026-10-20'] });
check('seven days Monday first', strip.map(d => d.date), [
  '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
check('letters M T W T F S S', strip.map(d => d.letter).join(''), 'MTWTFSS');
check('fixed week states', strip.map(d => d.state), ['done', 'done', 'rest', 'pending', 'upcoming', 'rest', 'rest']);
check('only today is flagged', strip.map(d => d.isToday), [false, false, false, true, false, false, false]);

const trainedToday = weekStrip({ today: '2026-10-22', program: fixed, workoutDates: new Set(['2026-10-22']) });
check('trained today is done and still today', [trainedToday[3].state, trainedToday[3].isToday], ['done', true]);
check('a skipped past training day is missed', trainedToday[0].state, 'missed');

const restToday = weekStrip({ today: '2026-10-21', program: fixed, workoutDates: [] });
check('today on a rest day is rest and today', [restToday[2].state, restToday[2].isToday], ['rest', true]);

const rot = weekStrip({ today: '2026-10-24', program: rotation, workoutDates: [] });
check('rotation weekend is rest', [rot[5].state, rot[6].state], ['rest', 'rest']);

check('a session on a rest day still shows as done',
  weekStrip({ today: '2026-10-23', program: fixed, workoutDates: ['2026-10-21'] })[2].state, 'done');
check('a future date is never done',
  weekStrip({ today: '2026-10-20', program: fixed, workoutDates: ['2026-10-23'] })[4].state, 'upcoming');
check('week boundary: Sunday belongs to the Monday before',
  weekStrip({ today: '2026-10-25', program: null, workoutDates: [] })[0].date, '2026-10-19');
check('no plan: every untrained future day is upcoming',
  weekStrip({ today: '2026-10-19', program: null, workoutDates: [] }).map(d => d.state),
  ['pending', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);

check('weekProgress counts trained against training days', weekProgress(strip), { trained: 2, planned: 4 });
check('weekProgress counts a rest-day session as trained',
  weekProgress(weekStrip({ today: '2026-10-23', program: fixed, workoutDates: ['2026-10-21'] })), { trained: 1, planned: 4 });

// ── days ago ──────────────────────────────────────────────────────────────
check('daysBetween across a month end', daysBetween('2026-09-30', '2026-10-02'), 2);
check('daysBetween across a DST change', daysBetween('2026-10-24', '2026-10-26'), 2);
check('latestDate picks the newest across lists', latestDate([{ date: '2026-10-01' }], [{ date: '2026-10-03' }, { date: '2026-09-30' }]), '2026-10-03');
check('latestDate with nothing', latestDate([], undefined), null);
check('agoLabel never', agoLabel(null, '2026-10-22'), 'Never');
check('agoLabel today', agoLabel('2026-10-22', '2026-10-22'), 'Today');
check('agoLabel one day', agoLabel('2026-10-21', '2026-10-22'), '1 day ago');
check('agoLabel many days', agoLabel('2026-10-03', '2026-10-22'), '19 days ago');

// ── estimate, muscles, ring ───────────────────────────────────────────────
check('estimate: 12 sets is about 35 min', estimateMinutes([{ sets: 4 }, { sets: 4 }, { sets: 4 }]), 35);
check('estimate: nothing planned is 0', estimateMinutes([]), 0);
check('estimate: never below 5', estimateMinutes([{ sets: 1 }]), 5);
check('totalSets sums', totalSets([{ sets: 4 }, { sets: 3 }, {}]), 7);

const db = {
  'Bench Press': { muscles: { 'Middle Chest': 1, Triceps: 0.6, 'Front Shoulders': 0.3 } },
  'Overhead Press': { muscles: { 'Front Shoulders': 1, 'Lateral Shoulders': 0.4, Triceps: 0.4 } },
  'Incline Press': { muscles: { 'Upper Chest': 1 } },
};
check('top muscles merge chest and shoulder regions',
  topMuscles([{ name: 'Bench Press', sets: 4 }, { name: 'Incline Press', sets: 3 }, { name: 'Overhead Press', sets: 3 }], db),
  ['Chest', 'Shoulders', 'Triceps']);
check('top muscles ignores unknown exercises', topMuscles([{ name: 'Mystery', sets: 3 }], db), []);
check('top muscles respects n', topMuscles([{ name: 'Bench Press', sets: 3 }], db, 1), ['Chest']);

check('ring: half done', Math.round(ringArc(2, 4, 10).frac * 100), 50);
check('ring: nothing planned', ringArc(0, 0, 10).dash, 0);
check('ring: over-done is clamped', ringArc(9, 4, 10).frac, 1);

// ── last time ─────────────────────────────────────────────────────────────
const W = [
  { uid: 'u', date: '2026-10-01', exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8 }, { weight: 62.5, reps: 5 }] }] },
  { uid: 'u', date: '2026-10-08', exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 10 }, { weight: 0, reps: 0 }] }] },
  { uid: 'other', date: '2026-10-15', exercises: [{ name: 'Bench Press', sets: [{ weight: 99, reps: 1 }] }] },
  { uid: 'u', date: '2026-10-10', exercises: [{ name: 'Dips', sets: [{ weight: 0, reps: 10 }] }] },
];
check('lastSet: newest session of mine, heaviest then most reps', lastSet(W, 'u', 'Bench Press'), { date: '2026-10-08', weight: 60, reps: 10 });
check('lastSet: ignores other Hunters', lastSet(W, 'other', 'Dips'), null);
check('lastSet: before a date', lastSet(W, 'u', 'Bench Press', '2026-10-08'), { date: '2026-10-01', weight: 62.5, reps: 5 });
check('lastSet: none', lastSet(W, 'u', 'Squat'), null);
check('label: kg x reps', lastTimeLabel({ weight: 60, reps: 8 }), '60kg×8');
check('label: no kg reads reps, not bodyweight', lastTimeLabel({ weight: 0, reps: 10 }), '10 reps');
check('label: timed secs', lastTimeLabel({ weight: 0, reps: 45 }, { timed: true }), '45s');
check('label: timed mins', lastTimeLabel({ weight: 0, reps: 20 }, { timed: true, timedUnit: 'mins' }), '20m');
check('label: no history', lastTimeLabel(null), '');

// ── up next ───────────────────────────────────────────────────────────────
check('fixed: Thursday looks to Friday', upNext({ program: fixed, today: '2026-10-22', trainedToday: false }), { index: 1, when: 'Tomorrow' });
check('fixed: Friday looks to Monday', upNext({ program: fixed, today: '2026-10-23', trainedToday: true }), { index: 0, when: 'Mon' });
check('rotation: untrained today looks one on', upNext({ program: rotation, today: '2026-10-22', trainedToday: false }), { index: 2, when: 'Day 3' });
check('rotation: trained today, rotation already moved on', upNext({ program: rotation, today: '2026-10-22', trainedToday: true }), { index: 1, when: 'Day 2' });
check('a one-day plan has nothing next', upNext({ program: { days: [{}] }, today: '2026-10-22', trainedToday: false }), null);
check('no plan has nothing next', upNext({ program: null, today: '2026-10-22', trainedToday: false }), null);

// ── countdown ─────────────────────────────────────────────────────────────
check('left: hours and minutes', leftLabel(3 * 3600 + 12 * 60 + 5), '3H 12M LEFT');
check('left: under an hour', leftLabel(25 * 60), '25M LEFT');
check('left: never negative', leftLabel(-5), '0M LEFT');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
