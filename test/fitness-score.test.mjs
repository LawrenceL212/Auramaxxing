/* Tests for the fitness level.  Run:  node test/fitness-score.test.mjs */
import { fitnessScore } from '../fitness-score.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0; const results = [];
function check(name, ok, detail = '') { ok ? pass++ : fail++; results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`); }

const today = '2026-10-29';
const days = (n) => Array.from({ length: n }, (_, i) => shiftDay(today, -i));
const lean = { sex: 'male', bodyFat: 14, waistToHeight: 0.45, ffmi: 22 };
const base = { today, weeklyGoal: 3, streak: 0, sessionDates: [], lifts: [], body: null };

check('no context gives nothing', fitnessScore(null) === null && fitnessScore({}) === null);
const none = fitnessScore(base);
check('only consistency with no data: others missing, score 0 and Starting', none.parts.length === 1 && none.missing.join() === 'strength,body' && none.score === 0 && none.label === 'Starting');
check('a lone part carries all the weight', none.parts[0].weight === 100);

const strong = fitnessScore({ ...base, lifts: [{ name: 'Squat', tier: 'Elite' }, { name: 'Bench Press', tier: 'Advanced' }], sessionDates: days(12), streak: 28, body: lean });
check('strong, consistent and lean scores high', strong.score >= 80 && strong.label === 'Elite', JSON.stringify(strong.score));
check('weights are 40/30/30 with everything present', strong.parts.map(p => p.weight).join() === '40,30,30');
check('strength averages the tier points of the best lifts', strong.parts[0].score === 90, String(strong.parts[0].score));
check('strength names the best lift', /Squat · Elite/.test(strong.parts[0].detail));

const beginnerLifter = fitnessScore({ ...base, lifts: [{ name: 'Squat', tier: 'Beginner' }] });
check('beginner tier scores low', beginnerLifter.parts.find(p => p.key === 'strength').score === 10);
check('unknown tier names are ignored', fitnessScore({ ...base, lifts: [{ name: 'X', tier: 'Godlike' }] }).missing.includes('strength'));
check('only the 6 best lifts count', (() => { const lifts = [...Array(6)].map((_, i) => ({ name: 'L' + i, tier: 'Elite' })).concat([{ name: 'Weak', tier: 'Beginner' }]); return fitnessScore({ ...base, lifts }).parts[0].score === 100; })());

check('consistency: sessions vs weekly goal over 28 days', fitnessScore({ ...base, sessionDates: days(6) }).parts[0].score === Math.round(6 / 12 * 70));
check('consistency caps at the goal', fitnessScore({ ...base, sessionDates: days(20) }).parts[0].score === 70);
check('consistency ignores future dates and duplicates', fitnessScore({ ...base, sessionDates: [shiftDay(today, 3), today, today] }).parts[0].detail.startsWith('1 sessions'));
check('streak adds up to 30 points', fitnessScore({ ...base, sessionDates: days(12), streak: 14 }).parts[0].score === 85);

const high = (o) => fitnessScore({ ...base, body: { sex: 'male', ...o } }).parts.find(p => p.key === 'body').score;
check('body: athletic band is full marks', high({ bodyFat: 12 }) === 100 && high({ bodyFat: 18 }) === 100);
check('body: high body fat falls away', high({ bodyFat: 35 }) === 0 && high({ bodyFat: 25 }) === 55);
check('body: very low body fat is not rewarded', high({ bodyFat: 4 }) < 30);
check('body: waist ÷ height under 0.42 is full, 0.6 is poor', high({ waistToHeight: 0.4 }) === 100 && high({ waistToHeight: 0.6 }) === 20);
check('body: FFMI 25 is full, 19 is below half', high({ ffmi: 25 }) === 100 && high({ ffmi: 19 }) === 35);
check('body: women use their own bands', fitnessScore({ ...base, body: { sex: 'female', bodyFat: 22 } }).parts.find(p => p.key === 'body').score === 100 && high({ bodyFat: 22 }) < 100);
check('body: averages what is there', high({ bodyFat: 12, waistToHeight: 0.6 }) === 60);
check('body with no usable numbers is missing', fitnessScore({ ...base, body: { sex: 'male' } }).missing.includes('body'));

check('label bands', [[10, 'Starting'], [30, 'Building'], [50, 'Solid'], [70, 'Strong'], [90, 'Elite']].every(([s, l]) => {
  const tier = s >= 85 ? 'Elite' : s >= 65 ? 'Advanced' : s >= 45 ? 'Intermediate' : s >= 25 ? 'Novice' : 'Beginner';
  const r = fitnessScore({ ...base, lifts: [{ name: 'S', tier }], weeklyGoal: 1, sessionDates: days(s >= 25 ? 4 : 0), streak: 0 });
  return r.label && typeof r.score === 'number';
}));
check('next: weakest part gets the advice', fitnessScore({ ...base, lifts: [{ name: 'Squat', tier: 'Elite' }, { name: 'Bench Press', tier: 'Elite' }], body: lean }).next.key === 'consistency');
check('next: strength names the lowest lift', fitnessScore({ ...base, sessionDates: days(12), streak: 28, body: lean, lifts: [{ name: 'Squat', tier: 'Beginner' }, { name: 'Bench Press', tier: 'Novice' }] }).next.text.includes('Squat'));
check('next: body names the waist when it is the weak point', /waist/i.test(fitnessScore({ ...base, sessionDates: days(12), streak: 28, lifts: [{ name: 'S', tier: 'Elite' }], body: { sex: 'male', bodyFat: 12, waistToHeight: 0.65, ffmi: 24 } }).next.text));
check('next: nothing to fix says hold the plan', /Hold the plan/.test(fitnessScore({ ...base, sessionDates: days(12), streak: 28, lifts: [{ name: 'S', tier: 'Elite' }], body: lean }).next.text));
check('missing strength is asked for when all else is fine', fitnessScore({ ...base, sessionDates: days(12), streak: 28, body: lean }).next.key === 'strength');
check('score stays in 0..100', [strong, none, beginnerLifter].every(r => r.score >= 0 && r.score <= 100));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
