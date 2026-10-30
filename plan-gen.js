/* =========================================================================
   GOAL TO PLAN

   The pure side of "tell the System your goal": the Hunter writes what they
   want in their own words and the plan comes back from Claude (through the
   generatePlan Cloud Function). Nothing here calls the network or saves
   anything.

     skinfold body fat   Jackson-Pollock 3-site from caliper readings
     feasibility         is the goal reachable in the time, at a safe pace
     historyDigest       what the Hunter has actually done, in a few lines
     catalogue           the exercises the plan may use
     validatePlan        turns the model's reply into a plan the app accepts:
                         only exercises that exist, sane sets and reps, and
                         nothing from a muscle group the Hunter ruled out

   The model proposes; this file decides what is allowed. A plan is only
   saved when the Hunter taps Accept, through the same programs/{uid} write
   as the plan editor. No XP, stat or progression value is read or written.

   Pure, so test/plan-gen.test.mjs exercises it without a browser.
   ========================================================================= */

import { MUSCLE_GROUPS, groupCredit, e1rm } from './optimiser.js';
import { isRunDef } from './set-inputs.js';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MAX_DAYS = 7;
export const MAX_EXERCISES_PER_DAY = 10;
export const MAX_GOAL_CHARS = 1200;

/* ── body fat from calipers ────────────────────────────────────────────── */

/** Jackson-Pollock 3-site skinfold, then Siri. Sites are mm, in the order
    chest, abdomen, thigh (male) or triceps, suprailiac, thigh (female).
    Returns a percentage or null when an input is missing or implausible. */
export function skinfoldBodyFat({ gender, age, sites }) {
  const mm = (sites || []).map(Number);
  if (mm.length !== 3 || mm.some(v => !(v > 0 && v < 80))) return null;
  const a = Number(age);
  if (!(a >= 14 && a <= 90)) return null;
  const sum = mm[0] + mm[1] + mm[2];
  const density = gender === 'female'
    ? 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * a
    : 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * a;
  const pct = 495 / density - 450;
  return pct > 2 && pct < 60 ? Math.round(pct * 10) / 10 : null;
}

/** Fat and lean mass in kg from weight and body fat percentage. */
export function bodyComposition(weightKg, bfPct) {
  const w = Number(weightKg), bf = Number(bfPct);
  if (!(w > 0) || !(bf > 0 && bf < 70)) return null;
  const fat = w * bf / 100;
  return { fatKg: Math.round(fat * 10) / 10, leanKg: Math.round((w - fat) * 10) / 10 };
}

/* ── is the goal realistic ─────────────────────────────────────────────── */

/* Weekly pace limits as a share of body weight. Fat loss above about 1% a
   week costs muscle; lean gain faster than about 0.25% a week is mostly fat. */
export const PACE = {
  lose_fat: { ok: 0.01, tight: 0.0125, label: 'fat loss' },
  gain_muscle: { ok: 0.0025, tight: 0.004, label: 'lean gain' },
};

/** goal: { kind: 'lose_fat', targetBfPct } | { kind: 'lose_fat', targetWeightKg }
         | { kind: 'gain_muscle', targetWeightKg }
    Returns the change needed, the weekly pace it implies and a verdict, or
    null when there is not enough to say. All of it is an estimate. */
export function feasibility({ weightKg, bfPct, goal, weeks }) {
  const w = Number(weightKg), wk = Number(weeks);
  if (!goal || !(w > 0) || !(wk > 0)) return null;
  const pace = PACE[goal.kind];
  if (!pace) return null;
  let deltaKg;
  if (goal.kind === 'lose_fat' && Number(goal.targetBfPct) > 0) {
    const comp = bodyComposition(w, bfPct);
    if (!comp) return null;
    const target = Number(goal.targetBfPct);
    if (target >= Number(bfPct)) return null;
    deltaKg = w - comp.leanKg / (1 - target / 100); // lean mass held constant
  } else if (Number(goal.targetWeightKg) > 0) {
    deltaKg = goal.kind === 'lose_fat' ? w - Number(goal.targetWeightKg) : Number(goal.targetWeightKg) - w;
  } else return null;
  if (!(deltaKg > 0)) return null;
  const perWeekKg = deltaKg / wk;
  const share = perWeekKg / w;
  const verdict = share <= pace.ok ? 'realistic' : share <= pace.tight ? 'tight' : 'unrealistic';
  const safeWeeks = Math.ceil(deltaKg / (w * pace.ok));
  const dailyKcal = Math.round(perWeekKg * 7700 / 7 / 10) * 10;
  return {
    kind: goal.kind, label: pace.label, deltaKg: Math.round(deltaKg * 10) / 10,
    weeks: wk, perWeekKg: Math.round(perWeekKg * 100) / 100, sharePerWeek: Math.round(share * 10000) / 10000,
    verdict, safeWeeks,
    // calories to take off (fat loss) or add (lean gain) each day, and protein
    dailyKcal: goal.kind === 'lose_fat' ? -dailyKcal : Math.min(dailyKcal, 500),
    proteinG: [Math.round(w * 1.6), Math.round(w * 2.2)],
  };
}

/** One line a Hunter can read. */
export function feasibilityText(f) {
  if (!f) return '';
  const kg = `${f.deltaKg} kg of ${f.label}`;
  if (f.verdict === 'realistic') return `${kg} in ${f.weeks} weeks is about ${f.perWeekKg} kg a week. That is a realistic pace.`;
  if (f.verdict === 'tight') return `${kg} in ${f.weeks} weeks is about ${f.perWeekKg} kg a week. Possible but tight; ${f.safeWeeks} weeks would be comfortable.`;
  return `${kg} in ${f.weeks} weeks is about ${f.perWeekKg} kg a week, faster than is sustainable. ${f.safeWeeks} weeks is a realistic time.`;
}

/* ── what the Hunter has done ──────────────────────────────────────────── */

function dayDiff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }

/** A short, factual summary the model can plan from. */
export function historyDigest({ workouts, exercises, today, weightKg, heightCm, gender, bfPct }) {
  const recent = (workouts || []).filter(w => w && w.date && dayDiff(w.date, today) >= 0 && dayDiff(w.date, today) <= 84);
  const last28 = recent.filter(w => dayDiff(w.date, today) <= 28);
  const best = {}, counts = {};
  const groupSets = {};
  Object.keys(MUSCLE_GROUPS).forEach(g => { groupSets[g] = 0; });
  for (const w of recent) {
    for (const ex of w.exercises || []) {
      counts[ex.name] = (counts[ex.name] || 0) + 1;
      const def = exercises[ex.name];
      for (const s of ex.sets || []) {
        const kg = Number(s.weight) || 0, reps = Number(s.reps) || 0;
        if (kg > 0 && reps > 0) best[ex.name] = Math.max(best[ex.name] || 0, e1rm(kg, reps));
      }
      if (def && dayDiff(w.date, today) <= 28 && !isRunDef(def)) {
        const n = (ex.sets || []).length;
        for (const [g, c] of Object.entries(groupCredit(def))) groupSets[g] += n * c;
      }
    }
  }
  const strongest = Object.entries(best).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, v]) => ({ name, e1rmKg: Math.round(v) }));
  const familiar = Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n]) => n);
  const weekly = {};
  Object.keys(groupSets).forEach(g => { weekly[g] = Math.round(groupSets[g] / 4 * 10) / 10; });
  return {
    weightKg: weightKg || null, heightCm: heightCm || null, gender: gender || null, bodyFatPct: bfPct || null,
    sessionsPerWeekLast4Weeks: Math.round(last28.length / 4 * 10) / 10,
    strongestLifts: strongest, familiarExercises: familiar, weeklySetsPerMuscleGroup: weekly,
    hasHistory: recent.length > 0,
  };
}

/* ── the exercises a plan may use ──────────────────────────────────────── */

/** name -> "Equipment; Groups", the list sent with the request. */
export function catalogue(exercises) {
  const out = {};
  for (const [name, def] of Object.entries(exercises || {})) {
    if (!def) continue;
    const groups = Object.keys(groupCredit(def));
    out[name] = `${def.equipment || 'Bodyweight'}${isRunDef(def) ? '; Cardio' : groups.length ? '; ' + groups.join(',') : ''}`;
  }
  return out;
}

/* ── what the Hunter ruled out ─────────────────────────────────────────── */

const WORDS = {
  legs: ['Quads', 'Hamstrings', 'Calves'], leg: ['Quads', 'Hamstrings', 'Calves'],
  quads: ['Quads'], hamstrings: ['Hamstrings'], glutes: ['Hamstrings'], calves: ['Calves'],
  chest: ['Chest'], back: ['Back'], shoulders: ['Shoulders'], arms: ['Biceps', 'Triceps'],
  biceps: ['Biceps'], triceps: ['Triceps'], abs: ['Core'], core: ['Core'],
};
const NEGATIONS = /(?:\bno\b|\bnot?\b|\bnever\b|\bskip\b|\bavoid\b|\bwithout\b|\bexclude\b|\bdon'?t (?:want|like) to (?:train|work)\b|\bdon'?t (?:train|work)\b|\bdo not (?:train|work)\b|\bdon'?t want\b)\s+(?:to\s+)?(?:train(?:ing)?\s+|work(?:ing)?(?:\s+out)?\s+|any\s+|the\s+|my\s+)*([a-z]+)/g;

/** Muscle groups the Hunter's own words rule out ("no legs", "skip back"). A
    backstop for the model's own list; the model reads the full sentence. */
export function excludedFromText(text) {
  const found = new Set();
  const t = String(text || '').toLowerCase();
  let m;
  NEGATIONS.lastIndex = 0;
  while ((m = NEGATIONS.exec(t))) (WORDS[m[1]] || []).forEach(g => found.add(g));
  return [...found];
}

/** True when an exercise trains a ruled-out group as a main target. */
export function hitsExcluded(def, groups) {
  if (!def || !groups.length) return false;
  const credit = groupCredit(def);
  return groups.some(g => (credit[g] || 0) >= 0.5);
}

/* ── the model's reply -> a plan the app accepts ───────────────────────── */

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/** raw: { name, days:[{name, exercises:[{name, sets, reps, why}]}], schedule?, summary, exclude? }
    Returns { program, dropped, notes, excluded } or { error }. Exercise names
    are matched case-insensitively against the catalogue; anything unknown, a
    duplicate in a day, or from a ruled-out group is dropped and counted. */
export function validatePlan(raw, exercises, { excludeGroups = [], excludeNames = [], goalText = '', maxDays = MAX_DAYS } = {}) {
  if (!raw || !Array.isArray(raw.days) || !raw.days.length) return { error: 'The plan came back empty.' };
  const lower = {};
  for (const n of Object.keys(exercises || {})) lower[n.toLowerCase()] = n;
  const rule = new Set([...excludeGroups, ...excludedFromText(goalText)].filter(g => MUSCLE_GROUPS[g]));
  const banned = new Set(excludeNames.map(n => String(n).toLowerCase()));
  const groups = [...rule];
  let dropped = 0;
  const whys = {};
  const days = [];
  for (const d of raw.days.slice(0, MAX_DAYS)) {
    const seen = new Set();
    const list = [];
    for (const e of (d && d.exercises) || []) {
      const name = lower[String(e && e.name || '').trim().toLowerCase()];
      if (!name || seen.has(name) || banned.has(name.toLowerCase()) || hitsExcluded(exercises[name], groups)) { dropped++; continue; }
      if (list.length >= MAX_EXERCISES_PER_DAY) { dropped++; continue; }
      seen.add(name);
      const def = exercises[name];
      list.push(isRunDef(def)
        ? { name, sets: clampInt(e.sets, 1, 3, 1), reps: clampInt(e.reps, 1, 60, 1) }
        : { name, sets: clampInt(e.sets, 1, 8, 3), reps: clampInt(e.reps, 1, 30, 10) });
      if (e.why) whys[`${days.length}:${name}`] = String(e.why).slice(0, 160);
    }
    if (list.length) days.push({ name: String(d.name || `Day ${days.length + 1}`).slice(0, 40), exercises: list });
  }
  if (!days.length) return { error: 'None of the exercises in that plan could be used.' };
  const n = Math.min(days.length, maxDays);
  const picked = Array.isArray(raw.schedule) ? raw.schedule.filter(s => WEEKDAYS.includes(s)) : [];
  const schedule = picked.length >= n ? [...new Set(picked)] : defaultSchedule(n);
  const program = {
    name: String(raw.name || 'My Plan').slice(0, 40),
    schedule, scheduleMode: 'rotation', days: days.slice(0, n), currentDayIndex: 0,
  };
  const notes = [];
  if (groups.length) {
    const legs = ['Quads', 'Hamstrings', 'Calves'];
    const named = legs.every(g => groups.includes(g)) ? ['legs', ...groups.filter(g => !legs.includes(g))] : groups;
    notes.push(`Left out as you asked: ${named.join(', ')}.`);
  }
  if (dropped) notes.push(`${dropped} suggested exercise${dropped === 1 ? ' was' : 's were'} removed (not in the game or ruled out).`);
  return { program, dropped, notes, excluded: groups, whys, summary: String(raw.summary || '').slice(0, 400) };
}

/** Evenly spread training days across the week. */
export function defaultSchedule(n) {
  const k = Math.max(1, Math.min(7, n));
  const picks = {
    1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
  }[k];
  return picks.map(i => WEEKDAYS[i]);
}

/** Muscle groups the plan trains, with weekly sets, for the preview. */
export function planGroups(program, exercises) {
  const per = program.scheduleMode === 'rotation' && program.days.length
    ? (program.schedule.length || program.days.length) / program.days.length : 1;
  const out = {};
  for (const d of program.days) for (const e of d.exercises) {
    const def = exercises[e.name];
    if (!def || isRunDef(def)) continue;
    for (const [g, c] of Object.entries(groupCredit(def))) out[g] = (out[g] || 0) + e.sets * c * per;
  }
  return Object.fromEntries(Object.entries(out).map(([g, v]) => [g, Math.round(v * 10) / 10]));
}
