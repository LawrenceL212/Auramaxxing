/* Tests for goal-to-plan.  node test/plan-gen.test.mjs */
import { BASE_EXERCISES } from '../exercises.js';
import {
  skinfoldBodyFat, bodyComposition, feasibility, feasibilityText, historyDigest, catalogue,
  excludedFromText, validatePlan, defaultSchedule, planGroups,
} from '../plan-gen.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}
const EX = BASE_EXERCISES;

// ── calipers ─────────────────────────────────────────────────────────────
// Jackson-Pollock worked example: male 30, 10+15+12 mm lands in the low teens.
const bf = skinfoldBodyFat({ gender: 'male', age: 30, sites: [10, 15, 12] });
check('male 3-site is a plausible number', bf > 8 && bf < 14, true);
check('more skinfold, more body fat', skinfoldBodyFat({ gender: 'male', age: 30, sites: [20, 30, 25] }) > bf, true);
check('female formula differs', skinfoldBodyFat({ gender: 'female', age: 30, sites: [10, 15, 12] }) !== bf, true);
check('missing site -> null', skinfoldBodyFat({ gender: 'male', age: 30, sites: [10, 15] }), null);
check('absurd reading -> null', skinfoldBodyFat({ gender: 'male', age: 30, sites: [10, 15, 200] }), null);
check('bad age -> null', skinfoldBodyFat({ gender: 'male', age: 3, sites: [10, 15, 12] }), null);
check('composition', bodyComposition(80, 20), { fatKg: 16, leanKg: 64 });
check('composition rejects nonsense', bodyComposition(80, 0), null);

// ── feasibility ──────────────────────────────────────────────────────────
const f1 = feasibility({ weightKg: 80, bfPct: 20, goal: { kind: 'lose_fat', targetBfPct: 15 }, weeks: 14 });
check('20 -> 15% of 80 kg is about 4.7 kg (lean mass held)', f1.deltaKg, 4.7);
check('and that is realistic over 14 weeks', f1.verdict, 'realistic');
check('fat loss takes calories off', f1.dailyKcal < 0, true);
check('protein range from weight', f1.proteinG, [128, 176]);
check('too fast is called out', feasibility({ weightKg: 80, bfPct: 20, goal: { kind: 'lose_fat', targetBfPct: 12 }, weeks: 4 }).verdict, 'unrealistic');
check('the safe time is longer than the asked time', feasibility({ weightKg: 80, bfPct: 20, goal: { kind: 'lose_fat', targetBfPct: 12 }, weeks: 4 }).safeWeeks > 4, true);
check('target weight works without body fat', feasibility({ weightKg: 80, goal: { kind: 'lose_fat', targetWeightKg: 75 }, weeks: 10 }).verdict, 'realistic');
check('lean gain pace is stricter', feasibility({ weightKg: 70, goal: { kind: 'gain_muscle', targetWeightKg: 75 }, weeks: 8 }).verdict, 'unrealistic');
check('no weight -> null', feasibility({ goal: { kind: 'lose_fat', targetWeightKg: 75 }, weeks: 8 }), null);
check('target above current body fat -> null', feasibility({ weightKg: 80, bfPct: 10, goal: { kind: 'lose_fat', targetBfPct: 15 }, weeks: 8 }), null);
check('text mentions weeks', /14 weeks/.test(feasibilityText(f1)), true);

// ── history ──────────────────────────────────────────────────────────────
const wo = (date, name, sets) => ({ date, exercises: [{ name, sets }] });
const d = historyDigest({
  today: '2026-10-26', exercises: EX, weightKg: 78,
  workouts: [wo('2026-10-20', 'Bench Press', [{ reps: 5, weight: 80 }, { reps: 5, weight: 80 }]), wo('2026-10-13', 'Bench Press', [{ reps: 8, weight: 70 }]),
    wo('2026-10-01', 'Barbell Row', [{ reps: 8, weight: 60 }])],
});
check('strongest lift first', d.strongestLifts[0].name, 'Bench Press');
check('familiar needs two sessions', d.familiarExercises, ['Bench Press']);
check('chest volume counted', d.weeklySetsPerMuscleGroup.Chest > 0, true);
check('legs untrained', d.weeklySetsPerMuscleGroup.Quads, 0);
check('no history flagged', historyDigest({ today: '2026-10-26', exercises: EX, workouts: [] }).hasHistory, false);
check('catalogue lists equipment and groups', catalogue(EX)['Bench Press'].startsWith('Barbell; '), true);

// ── what the Hunter ruled out ────────────────────────────────────────────
check('"no legs"', excludedFromText('lean and defined, no legs'), ['Quads', 'Hamstrings', 'Calves']);
check("don't want to train legs", excludedFromText("I don't want to train legs"), ['Quads', 'Hamstrings', 'Calves']);
check('skip back', excludedFromText('please skip back work'), ['Back']);
check('no false hit on "no more than"', excludedFromText('no more than 3 days a week'), []);
check('nothing ruled out', excludedFromText('bigger chest and a half marathon'), []);

// ── validation ───────────────────────────────────────────────────────────
const good = {
  name: 'Lean', summary: 'x', days: [
    { name: 'Push', exercises: [{ name: 'bench press', sets: 4, reps: 8, why: 'strongest' }, { name: 'Made Up Lift', sets: 3, reps: 10 }, { name: 'Bench Press', sets: 3, reps: 8 }] },
    { name: 'Legs', exercises: [{ name: 'Squat', sets: 4, reps: 8 }, { name: 'Pull Up', sets: 3, reps: 8 }] },
  ],
};
const v = validatePlan(good, EX, { excludeGroups: [], goalText: '' });
check('names match case-insensitively', v.program.days[0].exercises[0].name, 'Bench Press');
check('unknown and duplicate dropped', v.dropped, 2);
check('plan is a rotation program', [v.program.scheduleMode, v.program.currentDayIndex, v.program.days.length], ['rotation', 0, 2]);
check('schedule fits the days', v.program.schedule.length >= 2, true);
const noLegs = validatePlan(good, EX, { goalText: 'no legs please' });
check('ruled-out legs never reach the plan', noLegs.program.days.some(dd => dd.exercises.some(e => e.name === 'Squat')), false);
check('and the plan says so', noLegs.notes.some(n => /legs/.test(n)), true);
check('the model can also name groups', validatePlan(good, EX, { excludeGroups: ['Back'] }).program.days[1].exercises.some(e => e.name === 'Pull Up'), false);
check('empty plan is an error', typeof validatePlan({ days: [] }, EX).error, 'string');
check('all-unknown plan is an error', typeof validatePlan({ days: [{ exercises: [{ name: 'Zzz' }] }] }, EX).error, 'string');
check('sets and reps are clamped', validatePlan({ days: [{ exercises: [{ name: 'Bench Press', sets: 99, reps: -4 }] }] }, EX).program.days[0].exercises[0], { name: 'Bench Press', sets: 8, reps: 1 });
check('never more than 7 days', validatePlan({ days: Array.from({ length: 12 }, (_, i) => ({ exercises: [{ name: 'Bench Press' }] })) }, EX).program.days.length, 7);
check('default schedule for 3', defaultSchedule(3), ['Mon', 'Wed', 'Fri']);
check('default schedule for 4', defaultSchedule(4), ['Mon', 'Tue', 'Thu', 'Fri']);
check('preview volume has chest', planGroups(v.program, EX).Chest > 0, true);

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
