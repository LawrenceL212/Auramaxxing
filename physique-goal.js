/* =========================================================================
   PHYSIQUE GOAL — pick a look and a deadline, get what it takes

   Instead of typing a goal weight, the Hunter picks the physique they want
   (a preset of target proportions) and a date. From the latest tape
   measurements this works out the body that look needs (target waist,
   shoulders, chest, arms, body fat and the weight that results), how long it
   takes at realistic rates for the Hunter's training age, whether the date
   is realistic, the phases (cut, then build), what to eat and train, and a
   weight path the rest of the app can follow. Re-solved at every check-in:
   the targets move as the body does (a smaller waist lowers the shoulder
   target), so the plan adjusts a little each week instead of being set once.

   PLANNING ASSUMPTIONS (rules of thumb, not guarantees; the screen says so)
   - Fat loss: 0.75% of bodyweight a week (0.5-1% is the usual range for
     keeping muscle; Helms et al. 2014).
   - Muscle gain per month as % of bodyweight, by training age (Alan Aragon's
     model): beginner 1-1.5, intermediate 0.5-1, advanced 0.25-0.5. Converted
     to % of existing muscle (muscle about 45% of bodyweight): 2.8 / 1.7 / 0.8.
     Half that while still losing fat.
   - A circumference moves less than its muscle does: only part of a
     shoulder or chest measurement is muscle (shoulders 50%, chest 50%,
     arms 90%), and muscle size goes with the square of the circumference.
   - Natural ceiling: fat-free mass index of 25 (Kouri 1995). Past it the
     goal is flagged unrealistic.

   Pure: takes plain measurements and dates, returns plain data. Reads and
   writes nothing. Presentation only; nothing here feeds XP or progression.
   Tested by node test/physique-goal.test.mjs
   ========================================================================= */

import { navyBodyFat, jacksonPollock3, jacksonPollock7, cleanMeasurements, ffmi, RANGES } from './body-metrics.js';
import { shiftDay } from './streak.js';
import { daysBetween } from './hunt-view.js';

export const FAT_LOSS_PCT_PER_WEEK = 0.0075;
export const KCAL_PER_KG = 7700;
export const FFMI_CEILING = 25;
const WEEKS_PER_MONTH = 4.345;
const CUT_PENALTY = 0.5;
const MUSCLE_PCT_PER_MONTH = { beginner: 0.028, intermediate: 0.017, advanced: 0.008 };
const SHARE = { shoulders: 0.5, chest: 0.5, arms: 0.9 };
const LEAN_SHARE = { shoulders: 0.10, chest: 0.15, arms: 0.10 };
const MIN_WEEKS = 4;

const r1 = (n) => Math.round(n * 10) / 10;

/** Target proportions per look. A missing key means "no target for that". */
export const PRESETS = {
  male: {
    lean: { label: 'Lean & defined', blurb: 'Low body fat, clear V', bodyFat: 11, vTaper: 1.4, chestWaist: 1.25 },
    athletic: { label: 'Athletic', blurb: 'Strong shoulders, trim waist', bodyFat: 14, vTaper: 1.45, chestWaist: 1.3, armChest: 0.34 },
    adonis: { label: 'Golden V', blurb: 'The 1.618 ideal. A long road', bodyFat: 12, vTaper: 1.618, chestWaist: 1.4, armChest: 0.36 },
  },
  female: {
    lean: { label: 'Lean & defined', blurb: 'Low body fat, toned', bodyFat: 18, vTaper: 1.3 },
    athletic: { label: 'Athletic', blurb: 'Strong shoulders, trim waist', bodyFat: 22, vTaper: 1.35 },
    hourglass: { label: 'Hourglass', blurb: 'Small waist against the hips', bodyFat: 24, waistHip: 0.7 },
  },
};
const sexOf = (s) => (s === 'female' ? 'female' : 'male');
export function presetsFor(sex) { return PRESETS[sexOf(sex)]; }
export const DEFAULT_PRESET = 'lean';

const CUSTOM_RANGES = {
  male:   { bodyFat: [6, 25], vTaper: [1.1, 1.75], chestWaist: [1.0, 1.5], armChest: [0.28, 0.4], waistHip: [0.6, 0.9] },
  female: { bodyFat: [12, 35], vTaper: [1.1, 1.5], chestWaist: [1.0, 1.4], armChest: [0.26, 0.38], waistHip: [0.6, 0.9] },
};
const GROUPS = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Biceps', 'Triceps', 'Core', 'Calves'];

/**
 * A look the Hunter asked the coach for ("bigger arms", a character, a photo): target proportions where
 * it asks for them, clamped to the same ranges the coach is held to, plus the muscle groups it wants
 * extra volume for. Null when it asks for nothing usable. Any proportion left out has no target.
 */
export function customLook(sex, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = CUSTOM_RANGES[sexOf(sex)];
  const out = { label: String(raw.label || 'Custom look').slice(0, 40), blurb: String(raw.blurb || '').slice(0, 100), custom: true };
  let any = false;
  for (const k of Object.keys(r)) {
    const v = Number(raw[k]);
    if (raw[k] == null || !Number.isFinite(v)) continue;
    out[k] = Math.min(r[k][1], Math.max(r[k][0], v));
    any = true;
  }
  out.focus = Array.isArray(raw.focus) ? raw.focus.filter(g => GROUPS.includes(g)).slice(0, 4) : [];
  return any ? out : null;
}

/** Training age from the months of logged training. */
export function experienceFrom(months) {
  const m = Number(months);
  return !(m >= 12) ? 'beginner' : m < 36 ? 'intermediate' : 'advanced';
}

/** Waist (cm) that gives `targetBf` by the Navy formula, neck/hip/height fixed. null when it cannot be found. */
export function waistForBodyFat(sex, targetBf, { neck, hip, height, maxWaist }) {
  let lo = (Number(neck) || 0) + 1, hi = Number(maxWaist);
  if (!(hi > lo)) return null;
  // the formula itself, without the 2-60% sanity clamp: the search passes through values below it
  const f = (w) => (sexOf(sex) === 'female'
    ? 495 / (1.29579 - 0.35004 * Math.log10(w + hip - neck) + 0.22100 * Math.log10(height)) - 450
    : 495 / (1.0324 - 0.19077 * Math.log10(w - neck) + 0.15456 * Math.log10(height)) - 450);
  if (sexOf(sex) === 'female' && !(hip > 0)) return null;
  if (targetBf >= f(hi)) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > targetBf) hi = mid; else lo = mid;
  }
  return r1((lo + hi) / 2);
}

function weeksToGrow(multiple, monthlyPct, cutWeeks) {
  if (multiple <= 1) return 0;
  const weekly = (1 + monthlyPct) ** (1 / WEEKS_PER_MONTH) - 1;
  let size = 1, w = 0;
  while (size < multiple && w < 520) {
    size *= 1 + weekly * (w < cutWeeks ? CUT_PENALTY : 1);
    w++;
  }
  return w;
}

/**
 * Work out a physique goal.
 *
 * @param ctx {
 *   sex, preset: key of PRESETS[sex], deadline: 'YYYY-MM-DD', today,
 *   measurements: { weight, height, waist, neck, hip?, shoulders?, chest?, armLeft?, armRight? },
 *   trainingMonths?: months of logged training, sessionsPerWeek?: the Hunter's weekly goal,
 * }
 * @returns { error } or the plan described in the file header.
 */
export function solveGoal(ctx) {
  const sex = sexOf(ctx && ctx.sex);
  const p = ctx && ctx.preset === 'custom' ? customLook(sex, ctx.custom) : (PRESETS[sex] || {})[ctx && ctx.preset];
  if (!p) return { error: 'preset', message: 'Pick a look.' };
  const today = ctx.today;
  if (!ctx.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(ctx.deadline)) return { error: 'deadline', message: 'Pick a deadline.' };
  const c = cleanMeasurements(ctx.measurements || {});
  if (!c.weight || !c.height || !c.waist || !c.neck) return { error: 'measurements', message: 'Needs weight, height, waist and neck from a check-in.' };
  if (sex === 'female' && !c.hip) return { error: 'measurements', message: 'Needs hips from a check-in.' };
  const navyNow = navyBodyFat(sex, c);
  if (navyNow === null) return { error: 'measurements', message: 'Body fat could not be worked out from these measurements.' };
  // calipers (Jackson-Pollock) win when all three folds and the age are in. The waist a body fat
  // needs still comes from the tape formula, shifted by how far the two methods differ today.
  const sk = ctx.measurements && ctx.measurements.skinfolds, age = ctx.measurements && ctx.measurements.age;
  const caliperNow = jacksonPollock7(sex, sk, age) ?? jacksonPollock3(sex, sk, age);
  const offsetNow = ctx.measurements && Number.isFinite(Number(ctx.measurements.tapeOffset)) && Math.abs(ctx.measurements.tapeOffset) <= 8 ? Number(ctx.measurements.tapeOffset) : null;
  const bfNow = caliperNow !== null ? caliperNow : offsetNow !== null ? Math.min(50, Math.max(3, navyNow + offsetNow)) : navyNow;
  const methodGap = navyNow - bfNow;

  const experience = experienceFrom(ctx.trainingMonths);
  const leanNow = c.weight * (1 - bfNow / 100);
  const fatNow = c.weight - leanNow;
  const usable = (k) => c[k] != null && c[k] >= RANGES[k][0];
  const arm = c.armLeft || c.armRight ? Math.max(c.armLeft || 0, c.armRight || 0) : null;

  // body fat first: it sets the waist
  const bfTarget = p.bodyFat != null ? Math.min(bfNow, p.bodyFat) : bfNow;
  let waistT = waistForBodyFat(sex, bfTarget + methodGap, { neck: c.neck, hip: c.hip, height: c.height, maxWaist: c.waist }) ?? c.waist;
  if (p.waistHip && c.hip) waistT = Math.min(waistT, r1(c.hip * p.waistHip));
  waistT = Math.min(waistT, c.waist);

  // proportions follow the new waist; never ask a measurement to shrink
  const target = { waist: waistT };
  if (p.vTaper && usable('shoulders')) target.shoulders = r1(Math.max(c.shoulders, p.vTaper * waistT));
  if (p.chestWaist && usable('chest')) target.chest = r1(Math.max(c.chest, p.chestWaist * waistT));
  if (p.armChest && arm) target.arms = r1(Math.max(arm, p.armChest * (target.chest ?? c.chest ?? 0)));

  // how much each region's muscle must grow
  const growth = {};
  let leanGain = 0;
  for (const k of ['shoulders', 'chest', 'arms']) {
    const now = k === 'arms' ? arm : c[k];
    if (target[k] == null || !now) continue;
    const s = (target[k] / now - 1) / SHARE[k];
    const g = (1 + s) ** 2 - 1;
    growth[k] = g;
    leanGain += leanNow * LEAN_SHARE[k] * g;
  }
  const leanT = leanNow + leanGain;
  const weightT = r1(leanT / (1 - bfTarget / 100));
  const fatT = weightT - leanT;
  const fatToLose = Math.max(0, fatNow - fatT);

  // time: cut at 0.75%/week, muscle at the training-age rate (halved while cutting)
  const cutWeeks = fatToLose > 0.05 ? Math.ceil(fatToLose / (c.weight * FAT_LOSS_PCT_PER_WEEK)) : 0;
  const monthly = MUSCLE_PCT_PER_MONTH[experience];
  const buildWeeks = Math.max(0, ...Object.values(growth).map(g => weeksToGrow(1 + g, monthly, cutWeeks)));
  const needed = Math.max(cutWeeks, buildWeeks, 0);
  const available = Math.floor(daysBetween(today, ctx.deadline) / 7);

  const warnings = [];
  const ffmiT = ffmi(leanT, c.height);
  if (ffmiT !== null && ffmiT > FFMI_CEILING) warnings.push(`This look needs a fat-free mass index of ${ffmiT}, past the natural ceiling of about ${FFMI_CEILING}.`);
  let verdict;
  if (ctx.deadline <= today) verdict = 'past';
  else if (warnings.length) verdict = 'unrealistic';
  else if (needed === 0) verdict = 'there';
  else if (needed <= available * 0.85) verdict = 'comfortable';
  else if (needed <= available) verdict = 'on_schedule';
  else if (needed <= available * 1.2) verdict = 'tight';
  else verdict = 'unrealistic';
  const earliestDate = shiftDay(today, Math.max(MIN_WEEKS, Math.ceil(needed * 1.1)) * 7);

  // phases and the weight path through them. With room to spare the work is
  // stretched gently to the deadline; when the date is too close it stays at a
  // realistic pace and runs past it (the path then ends on the earliest realistic date).
  const span = Math.max(1, daysBetween(today, ctx.deadline));
  const scale = needed > 0 ? Math.max(1, span / (needed * 7)) : 1;
  const totalDays = needed > 0 ? Math.round(needed * 7 * scale) : span;
  const pathEnd = shiftDay(today, totalDays);
  const cutDays = cutWeeks ? Math.round(cutWeeks * 7 * scale) : 0;
  const musclePart = leanGain * (cutWeeks && buildWeeks ? Math.min(1, (cutWeeks * CUT_PENALTY) / (cutWeeks * CUT_PENALTY + Math.max(0, buildWeeks - cutWeeks))) : 0);
  const weightAtCut = r1(c.weight - fatToLose + musclePart);
  const phases = [];
  const kcal = (kgPerWeek) => Math.round(Math.abs(kgPerWeek) * KCAL_PER_KG / 7 / 10) * 10;
  if (cutDays > 0) {
    const w = cutDays / 7;
    const rate = r1((weightAtCut - c.weight) / w);
    phases.push({ name: 'Cut', from: today, to: shiftDay(today, cutDays), weeks: Math.round(w), kgPerWeek: rate, kcalPerDay: -kcal(rate), note: 'Eat in a deficit, keep lifting heavy, protein high.' });
  }
  const afterCut = cutDays ? weightAtCut : c.weight;
  if (totalDays - cutDays > 0 && weightT - afterCut > 0.2) {
    const w = (totalDays - cutDays) / 7;
    const rate = r1((weightT - afterCut) / w);
    phases.push({ name: 'Build', from: shiftDay(today, cutDays), to: pathEnd, weeks: Math.round(w), kgPerWeek: rate, kcalPerDay: kcal(rate), note: 'Small surplus, progressive overload on the focus lifts.' });
  } else if (!phases.length) {
    phases.push({ name: 'Hold', from: today, to: ctx.deadline, weeks: Math.round(span / 7), kgPerWeek: 0, kcalPerDay: 0, note: 'Eat at maintenance and keep training.' });
  }
  const waypoints = [{ date: today, kg: r1(c.weight) }];
  if (cutDays > 0 && cutDays < totalDays) waypoints.push({ date: shiftDay(today, cutDays), kg: weightAtCut });
  waypoints.push({ date: pathEnd, kg: weightT });

  const focus = [];
  const rel = (k) => (growth[k] || 0);
  if (rel('shoulders') > 0.02 || rel('chest') > 0.02) { focus.push('Shoulders'); focus.push('Back'); }
  if (rel('chest') > 0.02) focus.push('Chest');
  if (rel('arms') > 0.02) { focus.push('Biceps'); focus.push('Triceps'); }

  return {
    sex, preset: ctx.preset, customFocus: p.focus || [], bodyFatSource: caliperNow !== null ? 'calipers' : offsetNow !== null ? 'tapeCal' : 'tape', label: p.label, blurb: p.blurb, today, deadline: ctx.deadline, experience,
    now: { weight: r1(c.weight), bodyFat: bfNow, leanKg: r1(leanNow), fatKg: r1(fatNow), waist: c.waist, shoulders: usable('shoulders') ? c.shoulders : null, chest: usable('chest') ? c.chest : null, arms: arm },
    target: { weight: weightT, bodyFat: r1(bfTarget), leanKg: r1(leanT), fatKg: r1(fatT), waist: target.waist, shoulders: target.shoulders ?? null, chest: target.chest ?? null, arms: target.arms ?? null },
    leanGainKg: r1(leanGain), fatToLoseKg: r1(fatToLose),
    weeks: { cut: cutWeeks, build: buildWeeks, needed, available },
    verdict, earliestDate, pathEnd, phases, waypoints, warnings,
    needs: {
      proteinG: [Math.round(c.weight * 1.6), Math.round(c.weight * 2.2)],
      sessionsPerWeek: Math.max(3, Math.min(5, Number(ctx.sessionsPerWeek) || 3)),
      focus: [...new Set([...(p.focus || []), ...focus])],
      ffmiTarget: ffmiT,
    },
  };
}

const METRICS = [['waist', 'Waist', 'cm', -1], ['shoulders', 'Shoulders', 'cm', 1], ['chest', 'Chest', 'cm', 1], ['arms', 'Arms', 'cm', 1], ['bodyFat', 'Body fat', '%', -1]];

/** Rows for the targets table: now, target, change. Only metrics that have both. */
export function targetRows(plan) {
  if (!plan || plan.error) return [];
  return METRICS.filter(([k]) => plan.now[k] != null && plan.target[k] != null)
    .map(([k, label, unit, dir]) => {
      const diff = r1(plan.target[k] - plan.now[k]);
      return { key: k, label, unit, now: plan.now[k], target: plan.target[k], diff, done: Math.abs(diff) < (k === 'bodyFat' ? 0.5 : 0.5) };
    });
}

/**
 * Where each measurement should be on `date`, from the start values stored
 * with the goal toward the current targets. Waist and body fat follow the
 * cut phase; the muscle measurements follow the whole stretch to the deadline.
 */
export function expectedOn(goal, plan, date) {
  if (!goal || !goal.start || !plan || plan.error) return null;
  const spanDays = Math.max(1, daysBetween(goal.startDate, plan.pathEnd || goal.deadline));
  const elapsed = Math.min(1, Math.max(0, daysBetween(goal.startDate, date) / spanDays));
  const cutFrac = plan.weeks.cut && plan.weeks.needed ? Math.min(1, elapsed / Math.max(0.05, plan.weeks.cut / plan.weeks.needed)) : 1;
  const at = (k, f) => (goal.start[k] != null && plan.target[k] != null ? r1(goal.start[k] + (plan.target[k] - goal.start[k]) * f) : null);
  return { waist: at('waist', cutFrac), bodyFat: at('bodyFat', cutFrac), shoulders: at('shoulders', elapsed), chest: at('chest', elapsed), arms: at('arms', elapsed) };
}

/**
 * Progress against the goal today: per metric the start, now, target, share
 * done and ahead/behind the expected value for today; and an overall share.
 */
export function goalProgress(goal, plan, today) {
  if (!goal || !goal.start || !plan || plan.error) return null;
  const exp = expectedOn(goal, plan, today) || {};
  const rows = [];
  for (const [k, label, unit, dir] of METRICS) {
    const s = goal.start[k], t = plan.target[k], n = plan.now[k];
    if (s == null || t == null || n == null) continue;
    const total = t - s;
    const pct = Math.abs(total) < 0.3 ? 100 : Math.round(Math.max(0, Math.min(100, ((n - s) / total) * 100)));
    const e = exp[k];
    const gap = e == null ? null : r1((n - e) * dir); // positive = ahead
    rows.push({ key: k, label, unit, start: s, now: n, target: t, expected: e, pct, status: gap === null ? 'unknown' : gap > 0.6 ? 'ahead' : gap < -0.6 ? 'behind' : 'on' });
  }
  const moving = rows.filter(r => Math.abs(r.target - r.start) >= 0.3);
  const overall = moving.length ? Math.round(moving.reduce((a, r) => a + r.pct, 0) / moving.length) : 100;
  const behind = rows.filter(r => r.status === 'behind').length, ahead = rows.filter(r => r.status === 'ahead').length;
  return { rows, overall, track: behind > ahead ? 'behind' : ahead > behind ? 'ahead' : 'on' };
}

/** Priorities in the shape physiquePriorities() returns, driven by the goal's remaining gaps. */
export function goalPriorities(plan) {
  if (!plan || plan.error) return [];
  const rows = targetRows(plan).filter(r => !r.done);
  const out = [];
  const w = rows.find(r => r.key === 'waist');
  if (w || plan.weeks.cut) {
    out.push({
      id: 'goal-cut', title: 'Cut to your target waist',
      target: w ? `${w.target} cm waist (${w.diff})` : `${plan.target.bodyFat}% body fat`,
      why: `${plan.fatToLoseKg} kg of fat to lose for ${plan.label}`,
      how: ['Eat 300–500 kcal under maintenance', `Protein ${plan.needs.proteinG[0]}–${plan.needs.proteinG[1]} g a day`, 'Keep lifting heavy so the loss is fat', 'About 0.75% of bodyweight a week'],
      more: null, focus: [], weight: plan.weeks.cut,
    });
  }
  const build = [['shoulders', 'Widen your shoulders', ['Shoulders', 'Back'], ['Lateral raises and overhead press', 'Pull-ups and rows', '12–20 hard sets a week']],
    ['chest', 'Build your chest', ['Chest', 'Back'], ['Presses, incline included', 'Rows or pull-downs', '10–20 sets a week each']],
    ['arms', 'Build your arms', ['Biceps', 'Triceps'], ['Direct curls and triceps work', '8–14 sets a week each']]];
  for (const [k, title, focus, how] of build) {
    const r = rows.find(x => x.key === k);
    if (!r) continue;
    out.push({ id: `goal-${k}`, title, target: `${r.target} cm ${k} (+${r.diff})`, why: `${r.now} → ${r.target} cm for ${plan.label}`, how, more: null, focus, weight: Math.abs(r.diff) / r.now });
  }
  return out;
}

/** Muscle groups the goal wants extra sets for, biggest remaining gap first. */
export function goalFocus(plan, max = 3) {
  const rows = goalPriorities(plan).filter(p => p.focus.length).sort((a, b) => b.weight - a.weight);
  const groups = [...((plan && plan.customFocus) || [])]; // a custom look names its own first
  for (const p of rows) for (const g of p.focus) if (!groups.includes(g)) groups.push(g);
  return groups.slice(0, max);
}

/** The goal as the weight-path.js goal shape (waypoints), or null. */
export function weightGoalFromPlan(plan) {
  if (!plan || plan.error || !plan.waypoints || plan.waypoints.length < 2) return null;
  const first = plan.waypoints[0], last = plan.waypoints[plan.waypoints.length - 1];
  return { target: last.kg, startKg: first.kg, startDate: first.date, targetDate: last.date, dir: Math.sign(last.kg - first.kg), waypoints: plan.waypoints };
}

/** One sentence for the verdict. */
export function verdictLine(plan) {
  if (!plan || plan.error) return plan ? plan.message : '';
  const { needed, available } = plan.weeks;
  const date = plan.earliestDate;
  switch (plan.verdict) {
    case 'there': return 'You are already at this look. Pick a higher one or hold.';
    case 'comfortable': return `Comfortable: about ${needed} weeks of work in ${available}.`;
    case 'on_schedule': return `On schedule: about ${needed} weeks of work in ${available}.`;
    case 'tight': return `Tight: about ${needed} weeks of work in ${available}. Earliest realistic date is ${date}.`;
    case 'unrealistic': return plan.warnings.length ? plan.warnings[0] : `Not realistic by then: it needs about ${needed} weeks and you have ${available}. Earliest realistic date is ${date}.`;
    case 'past': return 'That date has passed. Pick a new deadline.';
    default: return '';
  }
}
