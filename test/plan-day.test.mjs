/* Tests for choosing the plan day of a past session.  Run:  node test/plan-day.test.mjs */

import { weekStartOf, dayDoneInWeek, defaultPlanDay, planDayOptions, shouldAdvanceRotation } from '../plan-day.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

// 2026-10-22 is a Thursday. Week: Mon 10-19 .. Sun 10-25.
const today = '2026-10-22';
const ex = [{ name: 'Squat', sets: 3, reps: 5 }];
const fixed = {
  scheduleMode: 'fixed',
  days: [
    { name: 'Push', exercises: ex, assignedDays: ['Mon', 'Thu'] },
    { name: 'Pull', exercises: ex, assignedDays: ['Tue'] },
    { name: 'Legs', exercises: ex, assignedDays: ['Wed', 'Thu'] },
    { name: 'Rest day', exercises: [], assignedDays: ['Sat'] },
  ],
};
const rot = { scheduleMode: 'rotation', currentDayIndex: 1, days: [{ name: 'A', exercises: ex }, { name: 'B', exercises: ex }, { name: 'C', exercises: ex }] };

check('week starts Monday', weekStartOf('2026-10-22'), '2026-10-19');
check('Monday is its own week start', weekStartOf('2026-10-19'), '2026-10-19');
check('Sunday belongs to the week before', weekStartOf('2026-10-25'), '2026-10-19');

// fixed
check('fixed: Tuesday maps to Pull', defaultPlanDay({ program: fixed, date: '2026-10-20', today, workouts: [], uid: 'u' }), 1);
check('fixed: Friday has no day', defaultPlanDay({ program: fixed, date: '2026-10-23', today, workouts: [], uid: 'u' }), null);
check('fixed: Saturday maps to its only day', defaultPlanDay({ program: fixed, date: '2026-10-17', today, workouts: [], uid: 'u' }), 3);
check('fixed: Wed maps to Legs', defaultPlanDay({ program: fixed, date: '2026-10-21', today, workouts: [], uid: 'u' }), 2);
const done = [{ uid: 'u', date: '2026-10-19', programDayIndex: 0 }];
check('fixed: Thu picks Push when open', defaultPlanDay({ program: fixed, date: '2026-10-22', today, workouts: [], uid: 'u' }), 0);
check('fixed: skips a day already ticked that week', defaultPlanDay({ program: fixed, date: '2026-10-22', today, workouts: done, uid: 'u' }), 2);
check('fixed: all assigned days ticked gives extra', defaultPlanDay({ program: fixed, date: '2026-10-19', today, workouts: done, uid: 'u' }), null);
check('fixed: last week\'s tag does not count', dayDoneInWeek([{ uid: 'u', date: '2026-10-12', programDayIndex: 0 }], 'u', 0, '2026-10-19'), false);
check('fixed: another Hunter\'s tag does not count', dayDoneInWeek([{ uid: 'x', date: '2026-10-19', programDayIndex: 0 }], 'u', 0, '2026-10-19'), false);
check('fixed: string index still matches', dayDoneInWeek([{ uid: 'u', date: '2026-10-19', programDayIndex: '0' }], 'u', 0, '2026-10-19'), true);

// rotation
check('rotation: this week defaults to the waiting day', defaultPlanDay({ program: rot, date: '2026-10-20', today, workouts: [], uid: 'u' }), 1);
check('rotation: an older week defaults to extra', defaultPlanDay({ program: rot, date: '2026-10-10', today, workouts: [], uid: 'u' }), null);
check('rotation index wraps', defaultPlanDay({ program: { ...rot, currentDayIndex: 4 }, date: '2026-10-20', today, workouts: [], uid: 'u' }), 1);
check('no program gives extra', defaultPlanDay({ program: null, date: '2026-10-20', today, workouts: [], uid: 'u' }), null);
check('empty days gives extra', defaultPlanDay({ program: { days: [] }, date: '2026-10-20', today, workouts: [], uid: 'u' }), null);

// options
const opts = planDayOptions({ program: fixed, date: '2026-10-22', workouts: done, uid: 'u' });
check('options list every day', opts.map(o => o.name), ['Push', 'Pull', 'Legs', 'Rest day']);
check('options flag the ticked day', opts.map(o => o.done), [true, false, false, false]);
check('options carry assigned weekdays', opts[0].assignedDays, ['Mon', 'Thu']);
check('rotation options have no weekdays', planDayOptions({ program: rot, date: today, workouts: [], uid: 'u' })[0].assignedDays, []);
check('no program gives no options', planDayOptions({ program: null, date: today, workouts: [], uid: 'u' }), []);

// rotation advance
const adv = (o) => shouldAdvanceRotation({ program: rot, today, ...o });
check('live save advances (unchanged)', adv({ idx: 0, date: today, lastWorkoutDate: '2026-10-21' }), true);
check('past: waiting day, nothing newer, advances', adv({ idx: 1, date: '2026-10-21', lastWorkoutDate: '2026-10-20' }), true);
check('past: same date as last session still advances', adv({ idx: 1, date: '2026-10-21', lastWorkoutDate: '2026-10-21' }), true);
check('past: newer session exists, no advance', adv({ idx: 1, date: '2026-10-20', lastWorkoutDate: '2026-10-22' }), false);
check('past: not the waiting day, no advance', adv({ idx: 2, date: '2026-10-21', lastWorkoutDate: '2026-10-20' }), false);
check('past: extra session never advances', adv({ idx: null, date: '2026-10-21', lastWorkoutDate: null }), false);
check('past: no history yet advances when waiting', adv({ idx: 1, date: '2026-10-21', lastWorkoutDate: null }), true);
check('fixed mode never advances', shouldAdvanceRotation({ program: fixed, idx: 0, date: today, today, lastWorkoutDate: null }), false);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
