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
     goal lift     a personal e1RM goal whose exercise is not in the plan
     schedule      plan sessions per week against the weekly goal, and
                   against how often the Hunter actually trains (notes
                   only, never applied)

   Deterministic and on the device: the same plan and history always give
   the same suggestions. Nothing here touches XP, stats or stored workouts;
   accepting a suggestion edits the plan exactly as the plan editor would.

   Pure, so test/optimiser.test.mjs exercises it without a browser.
   ========================================================================= */

import { setInputKind, setLoad, setBand, BAND_LEVELS, isRunDef } from './set-inputs.js';

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
export function resolveGoal(goal, personalGoals) {
  if (GOALS.includes(goal)) return { goal, inferred: false };
  const hasLiftGoal = (personalGoals || []).some(g => g && g.type === 'e1rm' && g.exercise);
  return { goal: hasLiftGoal ? 'strength' : 'general', inferred: true };
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
      if (!timed && kind === 'weight_reps' && (target < range.min || target > range.max)) {
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

function goalLiftRules(ctx) {
  const { program, exercises, personalGoals } = ctx;
  const inPlan = new Set();
  (program.days || []).forEach(d => (d.exercises || []).forEach(e => inPlan.add(e.name)));
  const out = [];
  for (const g of personalGoals || []) {
    if (!g || g.type !== 'e1rm' || !g.exercise || inPlan.has(g.exercise) || !exercises[g.exercise]) continue;
    const credit = groupCredit(exercises[g.exercise]);
    const group = Object.entries(credit).sort((a, b) => b[1] - a[1])[0];
    const di = group ? pickDay(group[0], ctx) : 0;
    if (di < 0) continue;
    inPlan.add(g.exercise);
    const dayName = program.days[di].name || `Day ${di + 1}`;
    out.push({
      id: `goal-lift:${g.exercise}`,
      type: 'add',
      title: `Add ${g.exercise} to ${dayName}`,
      reason: `Your goal "${g.name || g.exercise}" is a ${g.target}kg ${g.exercise}, but it isn't in your plan. 3 sets of 5 trains it toward that.`,
      change: { op: 'add', dayIndex: di, exercise: { name: g.exercise, sets: 3, reps: GOAL_REPS.strength.start } },
      priority: 1,
    });
  }
  return out;
}

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
    if (perWeek > 0 && perWeek <= planned * 0.6) {
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
  const empty = { goal: 'general', inferred: true, suggestions: [] };
  if (!ctx || !ctx.program || !(ctx.program.days || []).length || !ctx.today) return empty;
  const { goal, inferred } = resolveGoal(ctx.goal, ctx.personalGoals);
  const full = {
    ...ctx, goal,
    exercises: ctx.exercises || {},
    workouts: ctx.workouts || [],
  };
  const perExercise = exerciseRules(full);
  const touched = new Set(perExercise.filter(s => s.change).map(s => s.change.name));
  const all = [
    ...goalLiftRules(full),
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
  return { goal, inferred, suggestions };
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
