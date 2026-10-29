/* Tests for the plan optimiser.  node test/optimiser.test.mjs */

import { BASE_EXERCISES } from '../exercises.js';
import {
  optimisePlan, applySuggestion, plannedVolume, plannedSessionsPerWeek, resolveGoal,
  exerciseHistory, targetReps, activeDismissals, groupCredit, assessGoals, liftTrend, e1rm,
} from '../optimiser.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const TODAY = '2026-10-17';
const EX = BASE_EXERCISES;
const day = (name, exercises, extra = {}) => ({ name, exercises, ...extra });
const plan = (days, schedule = ['Mon', 'Wed', 'Fri']) => ({ name: 'Test', schedule, scheduleMode: 'rotation', days, currentDayIndex: 0 });
const session = (date, name, sets) => ({ date, exercises: [{ name, sets }] });
const kgSets = (n, weight, reps, rir) => Array.from({ length: n }, () => ({ reps, weight, rir }));
const run = (ctx) => optimisePlan({ exercises: EX, today: TODAY, workouts: [], ...ctx });
const ids = (r) => r.suggestions.map(s => s.id);
const find = (r, prefix) => r.suggestions.find(s => s.id.startsWith(prefix));

// A balanced full-body plan, three times a week: nothing to fix for general.
const balanced = plan([
  day('Full A', [
    { name: 'Squat', sets: 3, reps: 8 },
    { name: 'Bench Press', sets: 3, reps: 8 },
    { name: 'Barbell Row', sets: 3, reps: 8 },
    { name: 'Overhead Press', sets: 3, reps: 8 },
    { name: 'Romanian Deadlift', sets: 3, reps: 8 },
  ]),
]);

// ── goal ─────────────────────────────────────────────────────────────────
check('picked goal is used', resolveGoal('muscle', []), { goal: 'muscle', inferred: false });
check('an e1RM goal implies strength', resolveGoal(undefined, [{ type: 'e1rm', exercise: 'Bench Press', target: 100 }]), { goal: 'strength', inferred: true });
check('nothing set -> general', resolveGoal(null, []), { goal: 'general', inferred: true });
check('unknown goal string -> inferred', resolveGoal('bulk', []).inferred, true);

// ── helpers ──────────────────────────────────────────────────────────────
check('targetReps reads reps', targetReps({ reps: 6 }), 6);
check('targetReps reads the low end of repRange', targetReps({ repRange: '8–12' }), 8);
check('targetReps defaults to 10', targetReps({}), 10);
check('rotation: 3 days a week over 1 day', plannedSessionsPerWeek(balanced), 3);
check('fixed: counts assigned days', plannedSessionsPerWeek({ scheduleMode: 'fixed', days: [day('A', [], { assignedDays: ['Mon', 'Thu'] }), day('B', [], { assignedDays: ['Sat'] })] }), 3);
check('a set counts once per group, at the top emphasis', groupCredit(EX['Incline Bench Press']).Chest, 1);
check('planned chest volume: 3 sets x 3 a week', plannedVolume(balanced, EX).volume.Chest, 9);

// ── a balanced plan has nothing to say ───────────────────────────────────
check('balanced plan, general goal: no suggestions', ids(run({ program: balanced, goal: 'general' })), []);
check('no plan: nothing', run({ program: null }).suggestions, []);

// ── rep range per goal ───────────────────────────────────────────────────
{
  const r = run({ program: balanced, goal: 'strength' });
  const s = find(r, 'reps:Squat');
  check('strength: 8-rep squat moves to 6', s && s.change, { op: 'reps', dayIndex: 0, exIndex: 0, name: 'Squat', from: 8, to: 6 });
}
{
  const p = plan([day('A', [{ name: 'Bench Press', sets: 3, reps: 3 }])]);
  const s = find(run({ program: p, goal: 'endurance' }), 'reps:Bench Press');
  check('endurance: 3-rep bench moves up to 12', s && s.change.to, 12);
}
{
  const p = plan([day('A', [{ name: 'Push Up', sets: 3, reps: 25 }])]);
  check('a bodyweight move is not forced into a strength rep range',
    find(run({ program: p, goal: 'strength' }), 'reps:Push Up'), undefined);
}

// ── stall and deload ─────────────────────────────────────────────────────
{
  const p = plan([day('A', [{ name: 'Bench Press', sets: 4, reps: 5 }])]);
  const workouts = [
    session('2026-09-20', 'Bench Press', kgSets(4, 80, 5, 1)),
    session('2026-09-27', 'Bench Press', kgSets(4, 80, 5, 0)),
    session('2026-10-04', 'Bench Press', kgSets(4, 80, 4, 0)),
    session('2026-10-11', 'Bench Press', kgSets(4, 80, 5, 1)),
  ];
  const s = find(run({ program: p, goal: 'strength', workouts }), 'deload:');
  check('stalled at RIR 0-1: cut a set', s && s.change, { op: 'sets', dayIndex: 0, exIndex: 0, name: 'Bench Press', from: 4, to: 3 });
  check('deload explains itself', !!(s && /No new best/.test(s.reason)), true);

  const easy = workouts.map(w => ({ ...w, exercises: [{ name: 'Bench Press', sets: kgSets(4, 80, 5, 3) }] }));
  check('stalled but sets left in reserve: no deload', find(run({ program: p, goal: 'strength', workouts: easy }), 'deload:'), undefined);

  const climbing = [...workouts.slice(0, 3), session('2026-10-11', 'Bench Press', kgSets(4, 82.5, 5, 1))];
  check('a new best in the last 3: no deload', find(run({ program: p, goal: 'strength', workouts: climbing }), 'deload:'), undefined);

  const short = workouts.slice(1);
  check('fewer than 4 sessions: too early to call a stall', find(run({ program: p, goal: 'strength', workouts: short }), 'deload:'), undefined);

  const old = workouts.map(w => ({ ...w, date: w.date.replace('2026-', '2025-') }));
  check('sessions outside the window do not count', find(run({ program: p, goal: 'strength', workouts: old }), 'deload:'), undefined);

  const s1 = find(run({ program: p, goal: 'strength', workouts }), 'deload:');
  const applied = applySuggestion(p, s1, TODAY);
  check('apply stamps the change date', applied.days[0].exercises[0].optimisedAt, TODAY);
  check('after a deload, no second deload on the same sessions', find(run({ program: applied, goal: 'strength', workouts }), 'deload:'), undefined);
  const later = [...workouts, ...['2026-10-20', '2026-10-27', '2026-11-03'].map(d => session(d, 'Bench Press', kgSets(3, 72.5, 5, 0)))];
  check('3 fresh stalled sessions after it: it can fire again',
    !!find(optimisePlan({ program: applied, exercises: EX, today: '2026-11-04', workouts: later, goal: 'strength' }), 'deload:'), true);

  const two = plan([day('A', [{ name: 'Bench Press', sets: 2, reps: 5 }])]);
  check('never cuts below 2 sets', find(run({ program: two, goal: 'strength', workouts }), 'deload:'), undefined);
}

// ── load types: bodyweight, bands, no weight ─────────────────────────────
{
  const p = plan([day('A', [{ name: 'Pull Up', sets: 3, reps: 6 }])]);
  const bw = (date, reps) => session(date, 'Pull Up', Array.from({ length: 3 }, () => ({ reps, weight: 0, rir: 2, load: 'bodyweight' })));
  const s = find(run({ program: p, goal: 'muscle', workouts: [bw('2026-10-08', 10), bw('2026-10-12', 11)] }), 'target:Pull Up');
  check('bodyweight pull-ups beating the target: raise it', s && s.change.to, 10);

  const capped = plan([day('A', [{ name: 'Pull Up', sets: 3, reps: 12 }])]);
  const r = run({ program: capped, goal: 'muscle', workouts: [bw('2026-10-08', 16), bw('2026-10-12', 16)] });
  check('past the goal range: a note to make it harder, no plan change', find(r, 'harder:Pull Up') && find(r, 'harder:Pull Up').change, null);

  const band = (date, b) => session(date, 'Pull Up', Array.from({ length: 3 }, () => ({ reps: 8, weight: 0, rir: 1, load: 'band_assist', band: b })));
  const lighter = [band('2026-09-20', 'heavy'), band('2026-09-27', 'heavy'), band('2026-10-04', 'heavy'), band('2026-10-11', 'medium')];
  const hist = exerciseHistory('Pull Up', EX['Pull Up'], lighter, TODAY);
  check('a lighter assist band scores as progress', hist[3].best > hist[2].best, true);
  check('moving to a lighter assist band is not a stall',
    find(run({ program: plan([day('A', [{ name: 'Pull Up', sets: 3, reps: 8 }])]), goal: 'muscle', workouts: lighter }), 'deload:'), undefined);

  const mixed = [
    session('2026-10-01', 'Bench Press', kgSets(3, 60, 8, 2)),
    session('2026-10-08', 'Bench Press', Array.from({ length: 3 }, () => ({ reps: 15, weight: 0, load: 'bands', band: 'heavy' }))),
  ];
  check('history compares only sessions on the latest load', exerciseHistory('Bench Press', EX['Bench Press'], mixed, TODAY).map(h => h.load), ['bands']);
}
{
  const p = plan([day('A', [{ name: 'Plank', sets: 3, reps: 30 }])]);
  const hold = (date, secs) => session(date, 'Plank', Array.from({ length: 3 }, () => ({ reps: secs, weight: 0, durationMins: secs / 60 })));
  const s = find(run({ program: p, goal: 'general', workouts: [hold('2026-10-08', 45), hold('2026-10-12', 50)] }), 'target:Plank');
  check('holds: target rises to the shortest recent hold', s && s.change.to, 45);
}

// ── volume ───────────────────────────────────────────────────────────────
{
  const p = plan([
    day('Upper', [{ name: 'Bench Press', sets: 3, reps: 10 }, { name: 'Barbell Row', sets: 3, reps: 10 }]),
    day('Lower', [{ name: 'Squat', sets: 3, reps: 10 }]),
  ], ['Mon', 'Thu']);
  const r = run({ program: p, goal: 'muscle' });
  const add = r.suggestions.filter(s => s.type === 'add');
  const up = r.suggestions.filter(s => s.type === 'volume');
  check('muscle goal on a thin plan: suggests more volume', up.length + add.length > 0, true);
  check('volume suggestions are capped at 3', up.length + add.length <= 3, true);
  check('never more than 6 suggestions', r.suggestions.length <= 6, true);
  const shoulder = r.suggestions.find(s => s.id.startsWith('add:Shoulders'));
  if (shoulder) check('an added exercise trains the missing group', groupCredit(EX[shoulder.change.exercise.name]).Shoulders >= 1, true);
}
{
  const p = plan([day('Legs', [{ name: 'Squat', sets: 3, reps: 8 }, { name: 'Romanian Deadlift', sets: 3, reps: 8 }])]);
  const r = run({ program: p, goal: 'strength' });
  const chest = r.suggestions.find(s => s.id.startsWith('add:Chest'));
  check('strength: a plan with no chest work gets a chest lift', !!chest, true);
  check('the added lift uses equipment the Hunter already uses or bodyweight',
    chest && ['Barbell', 'Bodyweight'].includes(EX[chest.change.exercise.name].equipment), true);
  check('added at the goal start reps', chest && chest.change.exercise.reps, 5);
}
{
  const p = plan([day('Chest', [
    { name: 'Bench Press', sets: 5, reps: 10 }, { name: 'Incline Bench Press', sets: 5, reps: 10 },
    { name: 'Dumbbell Fly', sets: 5, reps: 10 },
  ])], ['Mon', 'Wed', 'Fri']);
  const s = run({ program: p, goal: 'muscle' }).suggestions.find(x => x.id.startsWith('volume-down:Chest'));
  check('45 chest sets a week: cut one', s && s.change.to, 4);
}
{
  const p = plan([day('Run', [{ name: 'Running', sets: 1, reps: 30 }])]);
  check('endurance plan of runs: no muscle volume pushed', run({ program: p, goal: 'endurance' }).suggestions.filter(s => s.type === 'add' || s.type === 'volume'), []);
}

{
  // the body check-in's priorities: a focus group gets the growth dose under any goal
  const plain = run({ program: balanced, goal: 'general' }).suggestions.filter(s => s.id.includes(':Shoulders'));
  check('general goal, no focus: shoulders left alone', plain.length, 0);
  const r = run({ program: balanced, goal: 'general', physiqueFocus: ['Shoulders'] });
  const s = r.suggestions.find(x => x.id.startsWith('volume-up:Shoulders') || x.id.startsWith('add:Shoulders'));
  check('physique focus on shoulders: more shoulder sets', !!s, true);
  check('the reason names the body check-in', s && /body check-in/.test(s.reason), true);
  check('a focus suggestion ranks ahead of ordinary volume', s && s.priority, 3);
}

// ── personal goals ───────────────────────────────────────────────────────
{
  const p = plan([day('Legs', [{ name: 'Squat', sets: 3, reps: 5 }])]);
  const r = run({ program: p, personalGoals: [{ type: 'e1rm', exercise: 'Deadlift', target: 180, name: '180 pull' }] });
  check('an e1RM goal lift missing from the plan is suggested first', r.suggestions[0] && r.suggestions[0].id, 'goal-add:Deadlift');
  check('an e1RM goal sets the goal to strength', r.goal, 'strength');
}

// ── how you're doing on your goals ──────────────────────────────────────
{
  const benchGoal = [{ type: 'e1rm', exercise: 'Bench Press', target: 100, name: '100kg Bench' }];
  const p = plan([
    day('Push', [{ name: 'Overhead Press', sets: 3, reps: 5 }, { name: 'Bench Press', sets: 3, reps: 5 }]),
    day('Pull', [{ name: 'Barbell Row', sets: 3, reps: 5 }]),
  ], ['Mon', 'Thu']);
  const flat = ['2026-08-25', '2026-09-08', '2026-09-22', '2026-10-06'].map(d => session(d, 'Bench Press', kgSets(3, 80, 5, 2)));
  const climbing = ['2026-08-25', '2026-09-08', '2026-09-22', '2026-10-06'].map((d, k) => session(d, 'Bench Press', kgSets(3, 75 + k * 2.5, 5, 2)));

  check('e1rm matches epley1RM', [e1rm(80, 5), e1rm(100, 1), e1rm(0, 5)], [93.3, 100, 0]);
  check('lift trend reads kg per week', liftTrend('Bench Press', climbing, TODAY).rate > 0.9, true);
  check('flat lift: rate ~0', liftTrend('Bench Press', flat, TODAY).rate, 0);

  const ctx = { program: p, exercises: EX, today: TODAY, personalGoals: benchGoal, goal: 'strength' };
  const flatGoal = assessGoals({ ...ctx, workouts: flat })[0];
  check('flat for 8 weeks -> stalled', flatGoal.status, 'stalled');
  const upGoal = assessGoals({ ...ctx, workouts: climbing })[0];
  check('climbing -> on track with an estimate', [upGoal.status, /weeks to go/.test(upGoal.detail)], ['on_track', true]);
  check('target reached -> hit', assessGoals({ ...ctx, workouts: [session('2026-10-10', 'Bench Press', kgSets(1, 100, 1, 0))] })[0].status, 'hit');
  check('PR record counts toward the goal', assessGoals({ ...ctx, workouts: [], prs: { 'Bench Press': { e1rm: 101 } } })[0].status, 'hit');

  const r = run({ ...ctx, workouts: flat });
  check('stalled goal lift: first move it to the start of its day', r.suggestions[0].change, { op: 'move', dayIndex: 0, exIndex: 1, name: 'Bench Press', to: 0 });
  check('goal suggestions say which goal they serve', r.suggestions[0].goal, '100kg Bench');
  const moved = applySuggestion(p, r.suggestions[0], TODAY);
  check('apply: move puts it first', moved.days[0].exercises.map(e => e.name), ['Bench Press', 'Overhead Press']);
  const r2 = run({ ...ctx, program: moved, workouts: flat });
  check('then: train it a second day', r2.suggestions[0].change && r2.suggestions[0].change.op + ':' + r2.suggestions[0].change.dayIndex, 'add:1');
  const twice = applySuggestion(moved, r2.suggestions[0], TODAY);
  const r3 = run({ ...ctx, program: twice, workouts: flat });
  check('then: one more set', r3.suggestions[0].id, 'goal-set:Bench Press:4');

  check('on track: the goal lift is left alone', run({ ...ctx, workouts: climbing }).suggestions.filter(s => s.goal), []);

  const high = plan([day('Push', [{ name: 'Bench Press', sets: 3, reps: 10 }])]);
  const rh = run({ ...ctx, program: high, goal: 'muscle', workouts: climbing });
  check('goal lift trains heavy even on a muscle plan', rh.suggestions.find(s => s.id.startsWith('goal-reps:')).change.to, 6);
  check('no muscle-range rep suggestion fights it', rh.suggestions.some(s => s.id.startsWith('reps:Bench Press')), false);
}
{
  const p = plan([day('A', [{ name: 'Squat', sets: 3, reps: 8 }])]);
  const g = [{ type: 'sessions', exercise: 'Pull Up', target: 50, name: '50 pull-up days', createdAt: '2026-10-01' }];
  const r = run({ program: p, personalGoals: g });
  check('a sessions goal exercise missing from the plan gets added', r.suggestions[0].id, 'goal-add:Pull Up');
  check('goal status listed', r.goals[0].status, 'not_in_plan');
}
{
  const p = plan([day('A', [{ name: 'Squat', sets: 3, reps: 8 }])]);
  const d = [{ id: 'hm', title: 'Half marathon', metric: 'longest_run_km', target: 21, since: '2026-09-01', targetDate: '2026-11-01' }];
  const runs = [{ date: '2026-09-10', runSummary: { distKm: 5 }, exercises: [] }];
  const r = run({ program: p, directives: d, workouts: runs });
  check('a run directive implies endurance', r.goal, 'endurance');
  check('behind pace with no runs in the plan: add a run', r.suggestions[0].change && r.suggestions[0].change.exercise.name, 'Running');
}
{
  const d = [{ id: 'bw', title: 'Bulk to 80', metric: 'body_weight_kg', target: 80, startValue: 72 }];
  check('a weight-gain directive implies muscle', run({ program: balanced, directives: d, bodyweightKg: 73 }).goal, 'muscle');
}
{
  const dates = ['2026-09-01', '2026-10-03', '2026-10-10'];
  const sparse = dates.map(d => session(d, 'Squat', kgSets(3, 100, 8, 2)));
  const r = run({ program: balanced, goal: 'general', workouts: sparse, personalGoals: [{ type: 'streak', target: 30, name: '30-day streak' }] });
  check('a slipping consistency goal gets its own note', !!r.suggestions.find(x => x.id.startsWith('goal-consistency')), true);
  check('...instead of the generic one', !!r.suggestions.find(x => x.id.startsWith('schedule-adherence')), false);
}

// ── schedule notes ───────────────────────────────────────────────────────
{
  const r = run({ program: balanced, goal: 'general', weeklyGoal: 4 });
  const s = r.suggestions.find(x => x.id.startsWith('schedule-goal'));
  check('fewer planned sessions than the weekly goal: a note', s && s.change, null);

  const dates = ['2026-09-01', '2026-10-03', '2026-10-10'];
  const sparse = dates.map(d => session(d, 'Squat', kgSets(3, 100, 8, 2)));
  const r2 = run({ program: balanced, goal: 'general', workouts: sparse });
  check('training far less than planned: a note', !!r2.suggestions.find(x => x.id.startsWith('schedule-adherence')), true);
}

// ── dismissals ───────────────────────────────────────────────────────────
{
  const r = run({ program: balanced, goal: 'strength' });
  const first = r.suggestions[0].id;
  const r2 = run({ program: balanced, goal: 'strength', dismissed: [first] });
  check('a dismissed suggestion stays hidden', ids(r2).includes(first), false);
  check('dismissals expire after 28 days',
    activeDismissals({ a: '2026-10-01', b: '2026-09-01', c: 5 }, TODAY), ['a']);
}

// ── applying ─────────────────────────────────────────────────────────────
{
  const r = run({ program: balanced, goal: 'strength' });
  const s = find(r, 'reps:Squat');
  const next = applySuggestion(balanced, s);
  check('apply: rep target changed', next.days[0].exercises[0].reps, 6);
  check('apply: the original plan is untouched', balanced.days[0].exercises[0].reps, 8);
  check('apply: everything else is kept', next.days[0].exercises.slice(1), balanced.days[0].exercises.slice(1));

  const moved = JSON.parse(JSON.stringify(balanced));
  moved.days[0].exercises.reverse();
  check('apply: refuses when the exercise has moved', applySuggestion(moved, s), null);
  const edited = JSON.parse(JSON.stringify(balanced));
  edited.days[0].exercises[0].reps = 7;
  check('apply: refuses when the value was edited since', applySuggestion(edited, s), null);

  const ranged = plan([day('A', [{ name: 'Squat', sets: 3, repRange: '8-12' }])]);
  const rs = find(run({ program: ranged, goal: 'strength' }), 'reps:Squat');
  const rn = applySuggestion(ranged, rs);
  check('apply: a new target replaces the repRange', rn.days[0].exercises[0], { name: 'Squat', sets: 3, reps: 6 });

  const add = { change: { op: 'add', dayIndex: 0, exercise: { name: 'Lateral Raise', sets: 3, reps: 10 } } };
  check('apply: adds an exercise at the end of the day', applySuggestion(balanced, add).days[0].exercises.at(-1), { name: 'Lateral Raise', sets: 3, reps: 10 });
  check('apply: no duplicate add', applySuggestion(applySuggestion(balanced, add), add), null);
  check('apply: a note changes nothing', applySuggestion(balanced, { change: null }), null);
}

// ── determinism ──────────────────────────────────────────────────────────
{
  const ctx = { program: balanced, goal: 'muscle', weeklyGoal: 5 };
  check('same input, same suggestions', JSON.stringify(run(ctx)), JSON.stringify(run(ctx)));
}

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
