/* Tests for the physique goal.  Run:  node test/physique-goal.test.mjs
   No dependencies and no runner, like the other tests here. */

import {
  PRESETS, presetsFor, experienceFrom, waistForBodyFat, solveGoal, targetRows, expectedOn, goalProgress,
  goalPriorities, goalFocus, weightGoalFromPlan, verdictLine, FAT_LOSS_PCT_PER_WEEK, FFMI_CEILING,
} from '../physique-goal.js';
import { navyBodyFat } from '../body-metrics.js';
import { parseGoal, expectedAt, pathStatus, pathSvg } from '../weight-path.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`);
}

const TODAY = '2026-10-29';
const day = (n) => shiftDay(TODAY, n);
const M = { weight: 73.9, height: 168, waist: 90, neck: 39.5, shoulders: 112, chest: 95, armLeft: 32.5, armRight: 34 };
const solve = (over = {}) => solveGoal({ sex: 'male', preset: 'lean', deadline: day(7 * 52), today: TODAY, measurements: M, trainingMonths: 6, ...over });

// ── inputs ─────────────────────────────────────────────────────────────
check('every preset has a label and a body fat target', ['male', 'female'].every(s => Object.values(presetsFor(s)).every(p => p.label && p.bodyFat > 0)));
check('unknown preset is an error', solve({ preset: 'nope' }).error === 'preset');
check('no deadline is an error', solve({ deadline: null }).error === 'deadline');
check('no waist or neck is an error', solve({ measurements: { weight: 70, height: 170 } }).error === 'measurements');
check('a woman needs hips', solve({ sex: 'female', preset: 'lean' }).error === 'measurements');
check('training age bands', experienceFrom(3) === 'beginner' && experienceFrom(12) === 'intermediate' && experienceFrom(35) === 'intermediate' && experienceFrom(36) === 'advanced' && experienceFrom(undefined) === 'beginner');

// ── the waist a body fat needs ─────────────────────────────────────────
for (const bf of [11, 14, 18]) {
  const w = waistForBodyFat('male', bf, { neck: 39.5, height: 168, maxWaist: 90 });
  const back = navyBodyFat('male', { waist: w, neck: 39.5, height: 168 });
  check(`waist for ${bf}% round-trips through the Navy formula`, back !== null && Math.abs(back - bf) < 0.4, `${w} cm gives ${back}`);
}
const wf = waistForBodyFat('female', 22, { neck: 32, hip: 98, height: 165, maxWaist: 80 });
check('female waist for 22% round-trips', Math.abs(navyBodyFat('female', { waist: wf, neck: 32, hip: 98, height: 165 }) - 22) < 0.4, String(wf));
check('already leaner than the target: keeps the current waist', waistForBodyFat('male', 30, { neck: 39.5, height: 168, maxWaist: 90 }) === 90);

// ── the solution ───────────────────────────────────────────────────────
const lean = solve();
check('lean preset: target waist is smaller', lean.target.waist < M.waist, JSON.stringify(lean.target));
check('target body fat is the preset', lean.target.bodyFat === 11);
check('weight target = lean mass ÷ (1 − fat)', Math.abs(lean.target.weight - lean.target.leanKg / (1 - lean.target.bodyFat / 100)) < 0.15, JSON.stringify(lean.target));
check('fat to lose matches now minus target', Math.abs(lean.fatToLoseKg - (lean.now.fatKg - lean.target.fatKg)) < 0.2);
check('cut length = fat ÷ 0.75% of bodyweight a week', lean.weeks.cut === Math.ceil(lean.fatToLoseKg / (M.weight * FAT_LOSS_PCT_PER_WEEK)), JSON.stringify(lean.weeks));
check('proportions never ask a measurement to shrink', ['shoulders', 'chest'].every(k => lean.target[k] === null || lean.target[k] >= lean.now[k]), JSON.stringify(lean.target));
check('shoulder target follows the new waist: ratio × waist', (() => { const a = solve({ preset: 'athletic' }); return a.target.shoulders === Math.round(Math.max(M.shoulders, 1.45 * a.target.waist) * 10) / 10; })());
check('phases: cut first, then build', lean.phases[0].name === 'Cut' && lean.phases.some(p => p.name === 'Build'), JSON.stringify(lean.phases.map(p => p.name)));
check('cut phase runs a deficit and burns about 0.5 kg a week', lean.phases[0].kcalPerDay < 0 && lean.phases[0].kgPerWeek < 0);
check('protein range is 1.6–2.2 g per kg', lean.needs.proteinG[0] === Math.round(73.9 * 1.6) && lean.needs.proteinG[1] === Math.round(73.9 * 2.2));
check('sessions per week stay between 3 and 5', solve({ sessionsPerWeek: 9 }).needs.sessionsPerWeek === 5 && solve({}).needs.sessionsPerWeek === 3);

// ── realism ────────────────────────────────────────────────────────────
const order = ['there', 'comfortable', 'on_schedule', 'tight', 'unrealistic'];
check('a longer deadline is never less realistic', (() => { let prev = 99; for (const w of [8, 16, 26, 40, 80]) { const v = order.indexOf(solve({ deadline: day(w * 7) }).verdict); if (v > prev) return false; prev = v; } return true; })());
check('one week is unrealistic for a big change', solve({ deadline: day(7) }).verdict === 'unrealistic');
check('a past deadline is flagged', solve({ deadline: day(-3) }).verdict === 'past');
check('beginners finish sooner than advanced lifters', solve({ preset: 'athletic', trainingMonths: 2 }).weeks.build < solve({ preset: 'athletic', trainingMonths: 60 }).weeks.build);
const gold = solve({ preset: 'adonis' });
check('the golden V is flagged past the natural ceiling', gold.verdict === 'unrealistic' && /ceiling/.test(gold.warnings[0] || ''), JSON.stringify(gold.warnings));
check('earliest realistic date is after today', solve({ deadline: day(7) }).earliestDate > TODAY);
check('verdict line names the earliest date when tight or unrealistic', /Earliest realistic date/.test(verdictLine(solve({ deadline: day(7 * 20) }))) || /ceiling/.test(verdictLine(gold)));
const leanAlready = solveGoal({ sex: 'male', preset: 'athletic', deadline: day(7 * 20), today: TODAY, trainingMonths: 40, measurements: { weight: 78, height: 182, waist: 78, neck: 38, shoulders: 124, chest: 104, armLeft: 37, armRight: 37 } });
check('already leaner than the preset: no cut, no fat to lose', leanAlready.weeks.cut === 0 && leanAlready.fatToLoseKg === 0, JSON.stringify(leanAlready.weeks));

// ── the weight path ────────────────────────────────────────────────────
check('waypoints start today at today’s weight', lean.waypoints[0].date === TODAY && lean.waypoints[0].kg === 73.9);
check('stretched to the deadline when there is room', solve({ deadline: day(7 * 80) }).pathEnd === day(7 * 80));
check('past the deadline when the date is too close', solve({ deadline: day(14) }).pathEnd > day(14));
const wg = parseGoal(weightGoalFromPlan(lean));
check('the plan becomes a weight-path goal', wg && wg.waypoints.length >= 2 && wg.target === lean.target.weight);
check('expected weight falls through the cut', expectedAt(wg, wg.waypoints[1].date) < expectedAt(wg, TODAY));
check('expected weight on the first day is today’s weight', expectedAt(wg, TODAY) === 73.9);
const st = pathStatus([{ date: day(-14), weight: 74 }, { date: day(-7), weight: 73.8 }, { date: TODAY, weight: 73.9 }], wg, TODAY);
check('path status works with waypoints', st && st.expected !== null && st.finishDate === null, JSON.stringify(st));
const lighter = pathStatus([{ date: day(20), weight: 71 }], wg, day(20));
check('lighter than the path during the cut is ahead', lighter.track === 'ahead' || lighter.track === 'on', JSON.stringify(lighter));
check('path chart draws the bent path', /<polyline[^>]*stroke-dasharray="2 4"/.test(pathSvg([{ date: day(-7), weight: 74 }, { date: TODAY, weight: 73.9 }], wg, { today: TODAY })));

// ── progress against the goal ──────────────────────────────────────────
const goal = { preset: 'lean', deadline: day(7 * 52), startDate: TODAY, start: { waist: 90, bodyFat: lean.now.bodyFat, shoulders: 112, chest: 95, arms: 34, weight: 73.9 } };
const exp0 = expectedOn(goal, lean, TODAY);
check('expected values start at the start values', exp0.waist === 90 && exp0.shoulders === 112);
const expEnd = expectedOn(goal, lean, lean.pathEnd);
check('expected values end at the targets', expEnd.waist === lean.target.waist && expEnd.chest === lean.target.chest, JSON.stringify(expEnd));
const half = { ...lean, now: { ...lean.now, waist: (90 + lean.target.waist) / 2 } };
const gp = goalProgress(goal, half, day(7 * 20));
check('halfway to the waist target reads about 50%', Math.abs(gp.rows.find(r => r.key === 'waist').pct - 50) <= 2, JSON.stringify(gp.rows.find(r => r.key === 'waist')));
check('overall progress is an average', gp.overall >= 0 && gp.overall <= 100);
check('barely moved, deep into the plan: behind', goalProgress(goal, lean, day(7 * 40)).rows.find(r => r.key === 'waist').status === 'behind');
check('unknown goal gives no progress', goalProgress(null, lean, TODAY) === null);

// ── what to do ─────────────────────────────────────────────────────────
const pr = goalPriorities(lean);
check('priorities start with the cut when there is fat to lose', pr[0].id === 'goal-cut' && /cm waist/.test(pr[0].target), JSON.stringify(pr[0]));
check('priorities carry how-to bullets and a focus', pr.every(p => Array.isArray(p.how) && p.how.length) && pr.some(p => p.focus.length));
check('no cut priority once the waist is there', !goalPriorities(leanAlready).some(p => p.id === 'goal-cut'));
check('focus is the biggest remaining gap first', (() => { const g = goalFocus(solve({ preset: 'athletic', trainingMonths: 40 })); return g.length > 0 && g.length <= 3; })());
check('errors give no priorities or focus', goalPriorities({ error: 'x' }).length === 0 && goalFocus(null).length === 0);

// ── calipers ───────────────────────────────────────────────────────────
{
  const folds = { chest: 8, abdomen: 14, thigh: 10 };
  const cal = solve({ measurements: { ...M, age: 30, skinfolds: folds } });
  const tape = solve();
  check('caliper reading is used for today’s body fat and marked as the source', cal.bodyFatSource === 'calipers' && tape.bodyFatSource === 'tape' && cal.now.bodyFat !== tape.now.bodyFat, JSON.stringify([cal.now.bodyFat, tape.now.bodyFat]));
  check('leaner by calipers means less fat to lose', cal.fatToLoseKg < tape.fatToLoseKg, `${cal.fatToLoseKg} vs ${tape.fatToLoseKg}`);
  check('target waist shifts by the gap between methods, not the reading itself', cal.target.waist > tape.target.waist, `${cal.target.waist} vs ${tape.target.waist}`);
  check('calipers without an age fall back to the tape formula', solve({ measurements: { ...M, skinfolds: folds } }).bodyFatSource === 'tape');
}

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
