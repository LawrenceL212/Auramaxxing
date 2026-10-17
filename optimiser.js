/* =========================================================================
   PLAN OPTIMISER

   Reads the Hunter's plan next to what they actually logged and suggests
   changes to the plan itself: sets, rep targets, and exercises. Each
   suggestion carries a one-line reason and is only applied when the Hunter
   accepts it, so the plan never changes on its own.

   The logger already moves the bar weight session to session
   (progressiveOverloadSuggestion in index.html). This works one level up,
   on the plan those sessions are built from:

     deload        an exercise has not beaten its best in 3 sessions and
                   the sets are being ground out (RIR 0-1): cut a set
     reps          the plan's rep target sits outside the range for the
                   goal (strength 3-6, muscle 6-12, endurance 12-20)
     target        a bodyweight, band or no-weight move (or a hold) beats
                   its target by a margin two sessions running, and the
                   logger cannot add kg to it: raise the target
     volume        weekly planned sets per muscle group against the
                   goal's landmarks: add a set, add an exercise for a
                   group nothing trains, or cut a set past the maximum
     your goals    each personal goal and directive is checked against
                   how the Hunter is doing on it, and drives the plan:
                   a lift goal that is stalling gets trained heavier,
                   first in the session, and twice a week; a goal
                   exercise missing from the plan is added; a run
                   directive behind its pace adds running; consistency
                   goals that are slipping get a plan that fits the week
     schedule      plan sessions per week against the weekly goal, and
                   against how often the Hunter actually trains (notes
                   only, never applied)

   Deterministic and on the device: the same plan and history always give
   the same suggestions. Nothing here touches XP, stats or stored workouts;
   accepting a suggestion edits the plan exactly as the plan editor would.

   Pure, so test/optimiser.test.mjs exercises it without a browser.
   ========================================================================= */

import { setInputKind, setLoad, setBand, BAND_LEVELS, isRunDef } from './set-inputs.js';
import { directiveProgress, timeElapsedFraction } from './goals.js';

export const GOALS = ['strength', 'muscle', 'endurance', 'general'];

export const GOAL_LABELS = {
  strength: 'Strength', muscle: 'Muscle', endurance: 'Endurance', general: 'General',
};

/** Rep target range per goal, and the target an added exercise starts at. */
export const GOAL_REPS = {
  strength:  { min: 3, max: 6, start: 5 },
  muscle:    { min: 6, max: 12, start: 10 },
  endurance: { min: 12, max: 20, start: 15 },
  general:   { min: 5, max: 15, start: 8 },
};

/* Muscle groups the volume check works on, built from the 22 regions on the
   map. A set counts once per group, at the highest emphasis it puts on any
   region in that group. Landmarks are weekly hard sets: mev (minimum that
   grows anything), mav (where most growth happens), mrv (most that can be
   recovered from). */
export const MUSCLE_GROUPS = {
  Chest:      { regions: ['Upper Chest', 'Middle Chest', 'Lower Chest'], mev: 8, mav: 12, mrv: 22, major: true },
  Back:       { regions: ['Upper Back', 'Lats', 'Traps'], mev: 8, mav: 14, mrv: 25, major: true },
  Shoulders:  { regions: ['Front Shoulders', 'Lateral Shoulders', 'Rear Shoulders'], mev: 6, mav: 12, mrv: 22, major: true },
  Quads:      { regions: ['Quads'], mev: 8, mav: 14, mrv: 20, major: true },
  Hamstrings: { regions: ['Hamstrings', 'Glutes'], mev: 6, mav: 12, mrv: 20, major: true },
  Biceps:     { regions: ['Biceps'], mev: 4, mav: 10, mrv: 20, major: false },
  Triceps:    { regions: ['Triceps'], mev: 4, mav: 10, mrv: 18, major: false },
  Core:       { regions: ['Upper Abs', 'Middle Abs', 'Lower Abs', 'Obliques'], mev: 4, mav: 10, mrv: 20, major: false },
  Calves:     { regions: ['Calves'], mev: 4, mav: 10, mrv: 16, major: false },
};
const UPPER_GROUPS = new Set(['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps']);
const LOWER_GROUPS = new Set(['Quads', 'Hamstrings', 'Calves']);

/** Sessions of an exercise in this window are what the history rules read. */
export const HISTORY_DAYS = 42;
/** Most sets the optimiser will take one exercise to, and fewest it leaves. */
export const MAX_SETS = 5;
export const MIN_SETS = 2;
/** Most suggestions shown at once, so the list stays something to act on. */
export const MAX_SUGGESTIONS = 6;
const MAX_VOLUME_SUGGESTIONS = 3;
/** Intents worth adding to fill a volume gap (not skills, sports, mobility). */
const FILL_INTENTS = new Set(['strength', 'hypertrophy', 'defence', 'isometric']);

/* ── small helpers ─────────────────────────────────────────────────────── */

function dayDiff(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
function shiftDate(date, n) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function avg(list) { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null; }
function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** The plan's rep target for an exercise: reps, else the low end of repRange. */
export function targetReps(ex) {
  if (ex && Number(ex.reps) > 0) return Number(ex.reps);
  const m = ex && ex.repRange ? String(ex.repRange).match(/(\d+)/) : null;
  return m ? parseInt(m[1], 10) : 10;
}

function workingSets(entry) {
  return ((entry && entry.sets) || []).filter(s => s && Number(s.reps) > 0);
}

/** Effort on a resistance set as reps in reserve, or null when not logged. */
function setRir(set) {
  if (set.rpe != null) return null; // rpe belongs to timed work
  return set.rir != null ? Number(set.rir) : null;
}

/** One number per set that grows when the Hunter does more: estimated 1RM
    for kg sets, band strength then reps for bands, reps otherwise. Only
    compared between sessions logged with the same load. */
function setScore(set, kind, load) {
  const reps = Number(set.reps) || 0;
  if (kind === 'weight_reps' || kind === 'load_reps') {
    if (load === 'kg') {
      const kg = Number(set.weight) || 0;
      return kg > 0 ? kg * (1 + reps / 30) : reps;
    }
    if (load === 'bands' || load === 'band_assist') {
      const i = Math.max(0, BAND_LEVELS.indexOf(setBand(set) || 'medium'));
      // a heavier resisting band is harder; a heavier assisting band is easier
      const level = load === 'bands' ? i : BAND_LEVELS.length - 1 - i;
      return level * 1000 + reps;
    }
  }
  return reps;
}

/**
 * The Hunter's logged sessions of one exercise, oldest first, within the
 * history window and logged with the same load as the latest session.
 */
export function exerciseHistory(name, def, workouts, today, days = HISTORY_DAYS) {
  const since = shiftDate(today, -days);
  const sessions = [];
  for (const w of workouts || []) {
    if (!w || !w.date || w.date < since || w.date > today) continue;
    for (const e of w.exercises || []) {
      if (!e || e.name !== name) continue;
      const sets = workingSets(e);
      if (!sets.length) continue;
      const load = setLoad(sets[0]);
      sessions.push({ date: w.date, sets, load });
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  if (!sessions.length) return [];
  const latestLoad = sessions[sessions.length - 1].load;
  const kind0 = setInputKind(def);
  return sessions
    .filter(s => s.load === latestLoad)
    .map(s => {
      const kind = setInputKind(def, s.load);
      const rirs = s.sets.map(setRir).filter(r => r != null);
      return {
        date: s.date,
        load: s.load,
        kind,
        baseKind: kind0,
        best: Math.max(...s.sets.map(set => setScore(set, kind0, s.load))),
        minReps: Math.min(...s.sets.map(set => Number(set.reps) || 0)),
        avgRir: avg(rirs),
      };
    });
}

/** True when the logger cannot add kg to this exercise as last logged, so
    progress has to come from the plan's target instead. */
function noKgProgress(h) {
  return h.kind === 'reps' || h.kind === 'hold';
}

/** How often each plan day runs in a week. */
export function dayFrequencies(program) {
  const days = (program && program.days) || [];
  if (!days.length) return [];
  if (program.scheduleMode === 'fixed') {
    return days.map(d => ((d.assignedDays || []).length));
  }
  const perWeek = ((program.schedule || []).length) || 7;
  return days.map(() => perWeek / days.length);
}

/** Planned sessions per week. */
export function plannedSessionsPerWeek(program) {
  return Math.round(dayFrequencies(program).reduce((a, b) => a + b, 0) * 10) / 10;
}

/** How much one set of an exercise counts toward each muscle group. */
export function groupCredit(def) {
  const muscles = (def && def.muscles) || {};
  const out = {};
  for (const [group, g] of Object.entries(MUSCLE_GROUPS)) {
    const c = Math.max(0, ...g.regions.map(r => Math.min(1, Number(muscles[r]) || 0)));
    if (c > 0) out[group] = c;
  }
  return out;
}

/** Weekly planned sets per muscle group, and which plan exercise feeds each. */
export function plannedVolume(program, exercises) {
  const freq = dayFrequencies(program);
  const volume = {};
  const contributors = {};
  Object.keys(MUSCLE_GROUPS).forEach(g => { volume[g] = 0; contributors[g] = []; });
  ((program && program.days) || []).forEach((day, di) => {
    (day.exercises || []).forEach((ex, ei) => {
      const def = exercises[ex.name];
      if (!def || isRunDef(def)) return;
      const sets = Number(ex.sets) || 0;
      for (const [group, c] of Object.entries(groupCredit(def))) {
        const weekly = sets * c * freq[di];
        volume[group] += weekly;
        contributors[group].push({ dayIndex: di, exIndex: ei, name: ex.name, credit: c, weekly, sets });
      }
    });
  });
  Object.keys(volume).forEach(g => { volume[g] = Math.round(volume[g] * 10) / 10; });
  return { volume, contributors };
}

/** The volume a goal aims each group at, or null when the goal does not ask
    for that group (endurance plans are not pushed toward muscle volume). */
function volumeTarget(goal, group) {
  const g = MUSCLE_GROUPS[group];
  if (goal === 'muscle') return g.mav;
  if (goal === 'endurance') return null;
  return g.major ? g.mev : null; // strength and general: the big groups, at the minimum
}

/** The goal the optimiser works to: the one picked, else strength when the
    Hunter has set an e1RM goal, else general. */
export function resolveGoal(goal, personalGoals, directives, bodyweightKg) {
  if (GOALS.includes(goal)) return { goal, inferred: false };
  const hasLiftGoal = (personalGoals || []).some(g => g && g.type === 'e1rm' && g.exercise);
  if (hasLiftGoal) return { goal: 'strength', inferred: true };
  const ds = directives || [];
  if (ds.some(d => d && (d.metric === 'longest_run_km' || d.metric === 'total_distance_km'))) {
    return { goal: 'endurance', inferred: true };
  }
  const bw = ds.find(d => d && d.metric === 'body_weight_kg' && Number(d.target) > 0);
  const from = bw && (Number(bodyweightKg) || Number(bw.startValue));
  if (bw && from && Number(bw.target) > from) return { goal: 'muscle', inferred: true };
  return { goal: 'general', inferred: true };
}

/* ── the rules ─────────────────────────────────────────────────────────── */

function exerciseRules(ctx) {
  const { program, exercises, workouts, today, goal } = ctx;
  const range = GOAL_REPS[goal];
  const out = [];
  const seen = new Set();
  (program.days || []).forEach((day, di) => {
    (day.exercises || []).forEach((ex, ei) => {
      const def = exercises[ex.name];
      if (!def || isRunDef(def) || seen.has(ex.name)) return;
      seen.add(ex.name);
      const sets = Number(ex.sets) || 3;
      const target = targetReps(ex);
      const hist = exerciseHistory(ex.name, def, workouts, today);
      const at = { dayIndex: di, exIndex: ei, name: ex.name };
      /* Sessions logged since the optimiser last changed this exercise. The
         history rules wait for fresh sessions, so an applied change is
         judged on how training goes after it, not on the sessions that
         prompted it. */
      const changedAt = typeof ex.optimisedAt === 'string' ? ex.optimisedAt : null;
      const fresh = changedAt ? hist.filter(h => h.date > changedAt).length : hist.length;

      // 1. Stalled and grinding: cut a set so recovery can catch up.
      if (hist.length >= 4 && fresh >= 3) {
        const last3 = hist.slice(-3);
        const before = hist.slice(0, -3);
        const bestBefore = Math.max(...before.map(h => h.best));
        const bestRecent = Math.max(...last3.map(h => h.best));
        const rirs = last3.map(h => h.avgRir).filter(r => r != null);
        const grinding = rirs.length >= 2 && avg(rirs) <= 1;
        if (bestRecent <= bestBefore && grinding && sets > MIN_SETS) {
          const to = sets - 1;
          out.push({
            id: `deload:${ex.name}:${to}`,
            type: 'deload',
            title: `${ex.name}: ${sets} → ${to} sets`,
            reason: `No new best in your last 3 sessions, and you're finishing sets with ${avg(rirs) < 0.5 ? 'nothing' : '0–1 reps'} left in reserve. Drop a set and take about 10% off for a week, then build back up.`,
            change: { op: 'sets', ...at, from: sets, to },
            priority: 1,
          });
          return;
        }
      }

      const kind = hist.length ? hist[hist.length - 1].kind : setInputKind(def);
      const timed = kind === 'hold' || kind === 'duration' || kind === 'cardio' || kind === 'distance';

      // 2. Rep target outside the goal's range (kg-loaded lifts only: a
      //    bodyweight move cannot drop to 5 reps without adding weight).
      if (!timed && kind === 'weight_reps' && !(ctx.goalLifts && ctx.goalLifts.has(ex.name)) &&
          (target < range.min || target > range.max)) {
        const to = clamp(target, range.min, range.max);
        out.push({
          id: `reps:${ex.name}:${to}`,
          type: 'reps',
          title: `${ex.name}: ${target} → ${to} reps`,
          reason: `${GOAL_LABELS[goal]} work sits at ${range.min}–${range.max} reps. ${target < range.min ? 'Lighten the bar a little' : 'Add weight'} so ${to} reps is hard.`,
          change: { op: 'reps', ...at, from: target, to },
          priority: 2,
        });
        return;
      }

      // 3. Target too easy on a move the logger cannot add kg to.
      if (hist.length >= 2 && fresh >= 2 && noKgProgress(hist[hist.length - 1])) {
        const last2 = hist.slice(-2);
        const isHold = kind === 'hold';
        const margin = isHold ? Math.max(10, Math.round(target * 0.25)) : 3;
        const easy = last2.every(h => h.minReps >= target + margin && (h.avgRir == null || h.avgRir >= 2));
        if (easy) {
          const done = Math.min(...last2.map(h => h.minReps));
          const cap = isHold ? Infinity : (goal === 'endurance' ? 30 : range.max);
          if (!isHold && target >= cap) {
            if (goal === 'strength' || goal === 'muscle') {
              out.push({
                id: `harder:${ex.name}`,
                type: 'note',
                title: `${ex.name}: make it harder`,
                reason: `You're doing ${done}+ reps a set, past the ${range.min}–${range.max} range for ${GOAL_LABELS[goal].toLowerCase()}. Add weight, use a heavier band, or move to a harder variation.`,
                change: null,
                priority: 3,
              });
            }
            return;
          }
          const to = isHold ? done : Math.min(cap, done);
          if (to > target) {
            out.push({
              id: `target:${ex.name}:${to}`,
              type: 'target',
              title: `${ex.name}: target ${target} → ${to}${isHold ? 's' : ' reps'}`,
              reason: `Your last 2 sessions beat the ${target}${isHold ? 's' : '-rep'} target on every set. Raise it so the plan keeps pace with you.`,
              change: { op: 'reps', ...at, from: target, to },
              priority: 3,
            });
          }
        }
      }
    });
  });
  return out;
}

function pickFillExercise(group, ctx, taken) {
  const { exercises, program, workouts, goal } = ctx;
  const g = MUSCLE_GROUPS[group];
  const used = new Map(); // name -> times logged
  for (const w of workouts || []) for (const e of w.exercises || []) {
    if (e && e.name) used.set(e.name, (used.get(e.name) || 0) + 1);
  }
  const equipment = new Set();
  const planNames = new Set();
  (program.days || []).forEach(d => (d.exercises || []).forEach(e => {
    planNames.add(e.name);
    if (exercises[e.name]) equipment.add(exercises[e.name].equipment);
  }));
  for (const name of used.keys()) if (exercises[name]) equipment.add(exercises[name].equipment);
  equipment.add('Bodyweight');
  const anyEquipment = equipment.size <= 1;
  const wantIntent = goal === 'muscle' ? 'hypertrophy' : 'strength';

  const candidates = Object.entries(exercises).filter(([name, def]) => {
    if (!def || planNames.has(name) || taken.has(name)) return false;
    if (def.timed || isRunDef(def) || !FILL_INTENTS.has(def.intent)) return false;
    if (!anyEquipment && !equipment.has(def.equipment)) return false;
    const muscles = def.muscles || {};
    const primary = Object.entries(muscles).sort((a, b) => b[1] - a[1])[0];
    return primary && g.regions.includes(primary[0]) && primary[1] >= 1;
  });
  candidates.sort(([an, ad], [bn, bd]) =>
    (used.get(bn) || 0) - (used.get(an) || 0) ||
    (bd.intent === wantIntent) - (ad.intent === wantIntent) ||
    an.localeCompare(bn));
  return candidates.length ? candidates[0][0] : null;
}

/** The plan day an added exercise fits best: one that already trains the
    same half of the body, else the day with the fewest exercises. */
function pickDay(group, ctx) {
  const { program, exercises } = ctx;
  const days = program.days || [];
  const half = UPPER_GROUPS.has(group) ? UPPER_GROUPS : LOWER_GROUPS.has(group) ? LOWER_GROUPS : null;
  let best = -1, bestScore = -Infinity;
  days.forEach((d, di) => {
    const n = (d.exercises || []).length;
    let overlap = 0;
    if (half) (d.exercises || []).forEach(e => {
      const credit = groupCredit(exercises[e.name]);
      if (Object.keys(credit).some(k => half.has(k))) overlap++;
    });
    const score = overlap * 10 - n;
    if (score > bestScore) { bestScore = score; best = di; }
  });
  return best;
}

function volumeRules(ctx, touched) {
  const { program, exercises, goal } = ctx;
  if (!(program.days || []).length) return [];
  const { volume, contributors } = plannedVolume(program, exercises);
  const out = [];
  const taken = new Set();
  const range = GOAL_REPS[goal];

  const gaps = [];
  for (const [group, g] of Object.entries(MUSCLE_GROUPS)) {
    const v = volume[group];
    if (v > g.mrv) gaps.push({ group, kind: 'over', size: v - g.mrv });
    const target = volumeTarget(goal, group);
    if (target != null && v < target) gaps.push({ group, kind: 'under', size: target - v, target });
  }
  gaps.sort((a, b) => b.size - a.size || a.group.localeCompare(b.group));

  for (const gap of gaps) {
    if (out.length >= MAX_VOLUME_SUGGESTIONS) break;
    const { group } = gap;
    const v = volume[group];
    const list = contributors[group]
      .filter(c => !touched.has(c.name))
      .sort((a, b) => b.credit - a.credit || b.weekly - a.weekly);

    if (gap.kind === 'over') {
      const c = list.find(x => x.sets > MIN_SETS);
      if (!c) continue;
      touched.add(c.name);
      out.push({
        id: `volume-down:${group}:${c.name}:${c.sets - 1}`,
        type: 'volume',
        title: `${c.name}: ${c.sets} → ${c.sets - 1} sets`,
        reason: `${group} gets about ${Math.round(v)} sets a week, past the ${MUSCLE_GROUPS[group].mrv} most people can recover from. One fewer set here keeps the work you can actually grow from.`,
        change: { op: 'sets', dayIndex: c.dayIndex, exIndex: c.exIndex, name: c.name, from: c.sets, to: c.sets - 1 },
        priority: 2,
      });
      continue;
    }

    const c = list.find(x => x.credit >= 0.5 && x.sets < MAX_SETS);
    if (c) {
      touched.add(c.name);
      out.push({
        id: `volume-up:${group}:${c.name}:${c.sets + 1}`,
        type: 'volume',
        title: `${c.name}: ${c.sets} → ${c.sets + 1} sets`,
        reason: `${group} gets about ${Math.round(v)} sets a week; ${GOAL_LABELS[goal].toLowerCase()} training wants at least ${gap.target}. ${c.name} trains it most directly.`,
        change: { op: 'sets', dayIndex: c.dayIndex, exIndex: c.exIndex, name: c.name, from: c.sets, to: c.sets + 1 },
        priority: 4,
      });
      continue;
    }
    if (contributors[group].length) continue; // trained, just already at the set cap
    const name = pickFillExercise(group, ctx, taken);
    const di = pickDay(group, ctx);
    if (!name || di < 0) continue;
    taken.add(name);
    const dayName = program.days[di].name || `Day ${di + 1}`;
    out.push({
      id: `add:${group}:${name}`,
      type: 'add',
      title: `Add ${name} to ${dayName}`,
      reason: `Nothing in your plan trains ${group.toLowerCase()}${v ? ' directly' : ''}. 3 sets of ${range.start} on ${dayName} starts covering it.`,
      change: { op: 'add', dayIndex: di, exercise: { name, sets: 3, reps: range.start } },
      priority: 4,
    });
  }
  return out;
}

/* ── YOUR GOALS ─────────────────────────────────────────────────────────
   Each personal goal (profile.personalGoals) and directive (profile.directives)
   is checked against the training record, and how the Hunter is doing on it
   decides what the plan should change. */

/** Same estimate as epley1RM() in index.html. */
export function e1rm(weight, reps) {
  const w = Number(weight) || 0, r = Number(reps) || 0;
  if (r <= 0 || w <= 0) return 0;
  if (r === 1) return w;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

/** Below this gain per week a lift is counted as stalled toward its goal. */
export const STALL_KG_PER_WEEK = 0.25;
/** The window the lift trend is read over. */
export const TREND_DAYS = 56;

/**
 * Where a lift stands: best estimated 1RM ever, and the trend of each
 * session's best over the last 8 weeks (kg per week, least squares).
 */
export function liftTrend(name, workouts, today, prBest = 0) {
  const since = shiftDate(today, -TREND_DAYS);
  let best = Number(prBest) || 0;
  const points = [];
  for (const w of workouts || []) {
    if (!w || !w.date || w.date > today) continue;
    for (const e of w.exercises || []) {
      if (!e || e.name !== name) continue;
      const top = Math.max(0, ...workingSets(e)
        .filter(st => setLoad(st) === 'kg')
        .map(st => e1rm(st.weight, st.reps)));
      if (!top) continue;
      best = Math.max(best, top);
      if (w.date >= since) points.push({ x: dayDiff(since, w.date) / 7, y: top });
    }
  }
  let rate = null;
  if (points.length >= 3) {
    const mx = avg(points.map(p => p.x)), my = avg(points.map(p => p.y));
    const sxx = points.reduce((t, p) => t + (p.x - mx) ** 2, 0);
    rate = sxx ? points.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / sxx : 0;
    rate = Math.round(rate * 100) / 100;
  }
  return { best, sessions: points.length, rate };
}

function planDaysWith(program, name) {
  const out = [];
  (program.days || []).forEach((d, di) => (d.exercises || []).forEach((e, ei) => {
    if (e.name === name) out.push({ dayIndex: di, exIndex: ei, ex: e });
  }));
  return out;
}

function weeklyFrequency(program, name) {
  const freq = dayFrequencies(program);
  return planDaysWith(program, name).reduce((t, h) => t + (freq[h.dayIndex] || 0), 0);
}

/** Workout dates per week over the last 4 weeks, or null with under 4 weeks of history. */
function recentPerWeek(workouts, today) {
  const dates = [...new Set((workouts || []).map(w => w && w.date).filter(Boolean))].sort();
  if (!dates.length || dayDiff(dates[0], today) < 28) return null;
  const since = shiftDate(today, -28);
  const recent = dates.filter(d => d > since && d <= today).length;
  return { recent, perWeek: Math.round((recent / 4) * 10) / 10 };
}

/**
 * How the Hunter is doing on each goal.
 * @returns [{ key, name, kind, status: 'hit'|'on_track'|'behind'|'stalled'|'not_started'|'not_in_plan'|'tracking',
 *            detail, exercise? }]
 */
export function assessGoals(ctx) {
  const { program, workouts, today, prs } = ctx;
  const out = [];
  for (const g of ctx.personalGoals || []) {
    if (!g || !g.type) continue;
    const name = g.name || g.exercise || 'Goal';
    if (g.type === 'e1rm' && g.exercise) {
      const t = liftTrend(g.exercise, workouts, today, prs && prs[g.exercise] && prs[g.exercise].e1rm);
      const target = Number(g.target) || 0;
      const inPlan = planDaysWith(program, g.exercise).length > 0;
      let status, detail;
      if (target && t.best >= target) {
        status = 'hit'; detail = `${t.best}kg e1RM, target ${target}kg reached`;
      } else if (!inPlan) {
        status = 'not_in_plan'; detail = `${t.best ? t.best + 'kg' : 'No'} e1RM so far, not in your plan`;
      } else if (t.rate == null) {
        status = 'not_started'; detail = t.best ? `${t.best}kg e1RM; log 3 sessions to read a trend` : 'No kg sessions logged yet';
      } else if (t.rate < STALL_KG_PER_WEEK) {
        status = 'stalled'; detail = `${t.best}kg of ${target}kg, no gain over your last ${t.sessions} sessions`;
      } else {
        const weeks = Math.ceil((target - t.best) / t.rate);
        status = 'on_track'; detail = `${t.best}kg of ${target}kg, +${t.rate}kg a week, about ${weeks} week${weeks === 1 ? '' : 's'} to go`;
      }
      out.push({ key: `e1rm:${g.exercise}`, name, kind: 'lift', status, detail, exercise: g.exercise, target, trend: t });
    } else if (g.type === 'sessions' && g.exercise) {
      const count = (workouts || []).filter(w => w && w.date >= (g.createdAt || '0000') &&
        (w.exercises || []).some(e => e && e.name === g.exercise && workingSets(e).length)).length;
      const target = Number(g.target) || 0;
      const inPlan = planDaysWith(program, g.exercise).length > 0;
      out.push({
        key: `sessions:${g.exercise}`, name, kind: 'sessions', exercise: g.exercise,
        status: target && count >= target ? 'hit' : inPlan ? 'tracking' : 'not_in_plan',
        detail: `${count} of ${target} sessions${inPlan ? '' : ', not in your plan'}`,
      });
    } else if (g.type === 'streak' || g.type === 'workouts') {
      const pace = recentPerWeek(workouts, today);
      const planned = plannedSessionsPerWeek(program);
      const behind = pace && planned >= 2 && pace.perWeek <= planned * 0.6;
      out.push({
        key: `${g.type}:${g.target}`, name, kind: 'consistency',
        status: behind ? 'behind' : 'tracking',
        detail: pace ? `${pace.perWeek} sessions a week lately, plan asks ${planned}` : 'Consistency goal',
      });
    }
  }
  for (const d of ctx.directives || []) {
    if (!d || !d.title || !d.metric || d.metric === 'none') continue;
    const p = directiveProgress(d, {
      workouts, workoutDates: new Set((workouts || []).map(w => w && w.date).filter(Boolean)),
      today, bodyweightKg: ctx.bodyweightKg,
    });
    const elapsed = d.targetDate ? timeElapsedFraction(d, new Date(today + 'T12:00:00')) : 0;
    const kind = d.metric === 'body_weight_kg' ? 'bodyweight'
      : d.metric === 'training_days' ? 'consistency' : 'run';
    let status = 'tracking';
    if (p.target && p.pct >= 100) status = 'hit';
    else if (d.targetDate && elapsed - p.pct / 100 > 0.15) status = 'behind';
    else if (d.targetDate) status = 'on_track';
    const unit = p.unit ? ` ${p.unit}` : '';
    const fmt = v => Math.round(v * 10) / 10;
    out.push({
      key: `directive:${d.id || d.title}`, name: d.title, kind, metric: d.metric, status,
      detail: `${fmt(p.current)}${unit} of ${fmt(p.target)}${unit}` +
        (d.targetDate ? `, ${Math.round(p.pct)}% done with ${Math.round(elapsed * 100)}% of the time gone` : ''),
    });
  }
  return out;
}

/** Plan suggestions that follow from how the Hunter is doing on each goal. */
function goalRules(ctx, assessed, busy) {
  const { program, exercises } = ctx;
  const out = [];
  const freq = dayFrequencies(program);
  const planNames = new Set();
  (program.days || []).forEach(d => (d.exercises || []).forEach(e => planNames.add(e.name)));

  const addTo = (name, preferNot) => {
    const credit = groupCredit(exercises[name]);
    const group = Object.entries(credit).sort((a, b) => b[1] - a[1])[0];
    let di = group ? pickDay(group[0], ctx) : 0;
    if (preferNot && preferNot.has(di)) {
      // fewest exercises among days that do not already have it
      const free = (program.days || []).map((d, i) => ({ i, n: (d.exercises || []).length }))
        .filter(x => !preferNot.has(x.i)).sort((a, b) => a.n - b.n || a.i - b.i);
      di = free.length ? free[0].i : -1;
    }
    return di;
  };

  for (const a of assessed) {
    const tag = a.name;
    if ((a.kind === 'lift' || a.kind === 'sessions') && a.status === 'not_in_plan' && exercises[a.exercise] && !planNames.has(a.exercise)) {
      const di = addTo(a.exercise);
      if (di < 0) continue;
      planNames.add(a.exercise);
      const reps = a.kind === 'lift' ? GOAL_REPS.strength.start : GOAL_REPS[ctx.goal].start;
      const dayName = program.days[di].name || `Day ${di + 1}`;
      out.push({
        id: `goal-add:${a.exercise}`, type: 'add', goal: tag,
        title: `Add ${a.exercise} to ${dayName}`,
        reason: a.kind === 'lift'
          ? `Your goal "${tag}" is a ${a.target}kg ${a.exercise}, but it isn't in your plan. 3 sets of 5 trains it toward that.`
          : `Your goal "${tag}" counts ${a.exercise} sessions, but it isn't in your plan, so it only grows when you add it by hand.`,
        change: { op: 'add', dayIndex: di, exercise: { name: a.exercise, sets: 3, reps } },
        priority: 0,
      });
      continue;
    }

    if (a.kind === 'lift' && a.status !== 'hit' && a.status !== 'not_in_plan' && !busy.has(a.exercise)) {
      const hits = planDaysWith(program, a.exercise);
      const def = exercises[a.exercise];
      const h = hits[0];
      const target = targetReps(h.ex);
      // Train a goal lift heavy, whatever the plan's overall goal.
      if (setInputKind(def) === 'weight_reps' && (target < GOAL_REPS.strength.min || target > GOAL_REPS.strength.max)) {
        const to = clamp(target, GOAL_REPS.strength.min, GOAL_REPS.strength.max);
        busy.add(a.exercise);
        out.push({
          id: `goal-reps:${a.exercise}:${to}`, type: 'reps', goal: tag,
          title: `${a.exercise}: ${target} → ${to} reps`,
          reason: `Your goal "${tag}" is a max-strength target. Sets of ${GOAL_REPS.strength.min}–${GOAL_REPS.strength.max} move a 1RM fastest; add weight so ${to} is hard.`,
          change: { op: 'reps', dayIndex: h.dayIndex, exIndex: h.exIndex, name: a.exercise, from: target, to },
          priority: 1,
        });
        continue;
      }
      if (a.status !== 'stalled') continue;
      // Stalled: first in the session, then twice a week, then one more set.
      if (h.exIndex > 0) {
        busy.add(a.exercise);
        const dayName = program.days[h.dayIndex].name || `Day ${h.dayIndex + 1}`;
        out.push({
          id: `goal-first:${a.exercise}:${h.dayIndex}`, type: 'move', goal: tag,
          title: `Move ${a.exercise} to the start of ${dayName}`,
          reason: `"${tag}" has stopped climbing (${a.detail.split(',')[0]}). Lift it first, while you're fresh, so those sets get your best effort.`,
          change: { op: 'move', dayIndex: h.dayIndex, exIndex: h.exIndex, name: a.exercise, to: 0 },
          priority: 1,
        });
        continue;
      }
      if (weeklyFrequency(program, a.exercise) < 2 && (program.days || []).length > 1) {
        const di = addTo(a.exercise, new Set(hits.map(x => x.dayIndex)));
        if (di >= 0 && freq[di] > 0) {
          busy.add(a.exercise);
          const dayName = program.days[di].name || `Day ${di + 1}`;
          out.push({
            id: `goal-twice:${a.exercise}:${di}`, type: 'add', goal: tag,
            title: `Add ${a.exercise} to ${dayName} too`,
            reason: `"${tag}" has stopped climbing on one session a week. A second, lighter-volume day (3×${Math.min(5, target)}) gives the lift more practice.`,
            change: { op: 'add', dayIndex: di, exercise: { name: a.exercise, sets: 3, reps: Math.min(5, target) } },
            priority: 1,
          });
          continue;
        }
      }
      const sets = Number(h.ex.sets) || 3;
      if (sets < MAX_SETS) {
        busy.add(a.exercise);
        out.push({
          id: `goal-set:${a.exercise}:${sets + 1}`, type: 'volume', goal: tag,
          title: `${a.exercise}: ${sets} → ${sets + 1} sets`,
          reason: `"${tag}" has stopped climbing without grinding sets. One more set gives the lift more work to adapt to.`,
          change: { op: 'sets', dayIndex: h.dayIndex, exIndex: h.exIndex, name: a.exercise, from: sets, to: sets + 1 },
          priority: 1,
        });
      }
      continue;
    }

    if (a.kind === 'run' && a.status === 'behind') {
      const runInPlan = [...planNames].some(n => exercises[n] && isRunDef(exercises[n]));
      if (!runInPlan && exercises.Running) {
        const di = (program.days || []).map((d, i) => ({ i, n: (d.exercises || []).length }))
          .sort((x, y) => x.n - y.n || x.i - y.i)[0].i;
        const dayName = program.days[di].name || `Day ${di + 1}`;
        planNames.add('Running');
        out.push({
          id: `goal-run:${a.key}`, type: 'add', goal: tag,
          title: `Add a 30 min run to ${dayName}`,
          reason: `"${tag}" is behind pace (${a.detail}), and there's no running in your plan.`,
          change: { op: 'add', dayIndex: di, exercise: { name: 'Running', sets: 1, reps: 30 } },
          priority: 1,
        });
      } else {
        out.push({
          id: `goal-run-note:${a.key}:${today10(ctx)}`, type: 'note', goal: tag,
          title: `"${tag}" is behind pace`,
          reason: `${a.detail}. Your plan already has runs, so lengthen them a little each week to close the gap.`,
          change: null, priority: 2,
        });
      }
      continue;
    }

    if (a.kind === 'consistency' && a.status === 'behind') {
      out.push({
        id: `goal-consistency:${a.key}`, type: 'note', goal: tag,
        title: `"${tag}" needs a plan you can keep`,
        reason: `${a.detail}. Pick the days you can actually make in Edit plan; fewer, fuller sessions keep the goal moving.`,
        change: null, priority: 2,
      });
    }
  }
  return out;
}
function today10(ctx) { return String(ctx.today).slice(0, 7); }

function scheduleRules(ctx) {
  const { program, workouts, today, weeklyGoal } = ctx;
  const out = [];
  const planned = plannedSessionsPerWeek(program);
  if (weeklyGoal && planned > 0 && planned < weeklyGoal) {
    out.push({
      id: `schedule-goal:${planned}:${weeklyGoal}`,
      type: 'note',
      title: `Plan has ${plural(planned, 'session')} a week, goal is ${weeklyGoal}`,
      reason: `Add a training day in Edit plan, or lower the weekly goal in Settings, so finishing the plan meets your goal.`,
      change: null,
      priority: 5,
    });
  }
  const dates = [...new Set((workouts || []).map(w => w && w.date).filter(Boolean))].sort();
  if (dates.length && dayDiff(dates[0], today) >= 28 && planned >= 3) {
    const since = shiftDate(today, -28);
    const recent = dates.filter(d => d > since && d <= today).length;
    const perWeek = Math.round((recent / 4) * 10) / 10;
    if (perWeek > 0 && perWeek <= planned * 0.6 && !ctx.consistencyNoted) {
      out.push({
        id: `schedule-adherence:${planned}:${Math.round(perWeek)}`,
        type: 'note',
        title: `You train about ${perWeek} times a week, plan asks ${planned}`,
        reason: `Over the last 4 weeks you've hit ${recent} sessions. A plan with fewer, fuller days that fits your week will move you further than one you skip.`,
        change: null,
        priority: 5,
      });
    }
  }
  return out;
}

/**
 * Suggested changes for a plan.
 *
 * @param ctx {
 *   program:       { days:[{name, exercises:[{name, sets, reps, repRange?}], assignedDays?}],
 *                    schedule:[...], scheduleMode },
 *   exercises:     EXERCISES_ALL (name -> definition),
 *   workouts:      the Hunter's own workouts,
 *   today:         'YYYY-MM-DD',
 *   goal?:         one of GOALS; inferred when missing,
 *   personalGoals?: profile.personalGoals,
 *   weeklyGoal?:   profile.weeklyGoal,
 *   dismissed?:    ids to leave out,
 * }
 * @returns { goal, inferred, suggestions:[{id, type, title, reason, change, priority}] }
 */
export function optimisePlan(ctx) {
  const empty = { goal: 'general', inferred: true, goals: [], suggestions: [] };
  if (!ctx || !ctx.program || !(ctx.program.days || []).length || !ctx.today) return empty;
  const { goal, inferred } = resolveGoal(ctx.goal, ctx.personalGoals, ctx.directives, ctx.bodyweightKg);
  const full = {
    ...ctx, goal,
    exercises: ctx.exercises || {},
    workouts: ctx.workouts || [],
  };
  const goals = assessGoals(full);
  full.goalLifts = new Set(goals.filter(a => a.kind === 'lift').map(a => a.exercise));
  const perExercise = exerciseRules(full);
  const touched = new Set(perExercise.filter(s => s.change).map(s => s.change.name));
  const fromGoals = goalRules(full, goals, touched);
  fromGoals.forEach(s => { if (s.change && s.change.name) touched.add(s.change.name); if (s.change && s.change.exercise) touched.add(s.change.exercise.name); });
  full.consistencyNoted = fromGoals.some(s => s.id.startsWith('goal-consistency:'));
  const all = [
    ...fromGoals,
    ...perExercise,
    ...volumeRules(full, touched),
    ...scheduleRules(full),
  ];
  const dismissed = new Set(ctx.dismissed || []);
  const suggestions = all
    .filter(s => !dismissed.has(s.id))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.priority - b.s.priority || a.i - b.i)
    .map(({ s }) => s)
    .slice(0, MAX_SUGGESTIONS);
  return { goal, inferred, goals, suggestions };
}

/**
 * The plan with one suggestion applied, as a new object, or null when the
 * plan has changed since the suggestion was made (the exercise moved or its
 * value is no longer what the suggestion started from). With `today`, the
 * changed exercise is stamped `optimisedAt` so the history rules wait for
 * sessions logged after the change.
 */
export function applySuggestion(program, suggestion, today) {
  const c = suggestion && suggestion.change;
  if (!program || !c) return null;
  const next = JSON.parse(JSON.stringify(program));
  const day = (next.days || [])[c.dayIndex];
  if (!day) return null;
  day.exercises = day.exercises || [];
  if (c.op === 'add') {
    if (day.exercises.some(e => e.name === c.exercise.name)) return null;
    day.exercises.push({ ...c.exercise });
    return next;
  }
  const ex = day.exercises[c.exIndex];
  if (!ex || ex.name !== c.name) return null;
  if (c.op === 'sets') {
    if ((Number(ex.sets) || 3) !== c.from) return null;
    ex.sets = c.to;
    if (today) ex.optimisedAt = today;
    return next;
  }
  if (c.op === 'move') {
    const [moved] = day.exercises.splice(c.exIndex, 1);
    day.exercises.splice(c.to, 0, moved);
    return next;
  }
  if (c.op === 'reps') {
    if (targetReps(ex) !== c.from) return null;
    ex.reps = c.to;
    delete ex.repRange; // the new target replaces the range it was read from
    if (today) ex.optimisedAt = today;
    return next;
  }
  return null;
}

/* Dismissed suggestions come back after this many days, in case the reason
   for dismissing them has passed. */
export const DISMISS_DAYS = 28;

/** Ids still dismissed today, from a { id: 'YYYY-MM-DD' } record. */
export function activeDismissals(record, today) {
  return Object.entries(record || {})
    .filter(([, date]) => typeof date === 'string' && dayDiff(date, today) < DISMISS_DAYS)
    .map(([id]) => id);
}
