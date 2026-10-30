/* =========================================================================
   QUICK QUEST — a fixed bodyweight circuit of about 15 minutes

   The Quick button on the Hunt screen opens the normal logger pre-filled with
   this circuit. It is NOT a new kind of workout: the Hunter logs it through the
   ordinary save path, so XP, streak, PRs, dungeons and the raid all treat it as
   the normal workout it is. The workout is stored with `programDayIndex: null`
   (an extra session) and no new field: the existing schema has nowhere to mark
   it, so it is simply a workout.

   Names come from the exercise database (exercises.js) and are checked against
   it: a name that is missing, or no longer bodyweight, is skipped and replaced
   from the other bodyweight exercises, so a renamed exercise cannot break the
   button. Nothing is added to exercises.js.

   Since the picker: the Quick button opens one sheet where the Hunter picks a
   type (Weights / Calisthenics / Cardio / Combo), a focus and, where it
   matters, equipment, or taps Random. generateQuick() builds about 15 minutes
   from the exercise database (built-in plus the Hunter's custom exercises),
   preferring what they logged lately and, for weighted moves, starting from
   their last weight. The result is the same {name, sets, reps} shape as the
   fixed circuit, so the logger and the save path are unchanged.

   Pure, so test/quick-quest.test.mjs runs it without a browser.
   ========================================================================= */

import { estimateMinutes, lastSet, daysBetween } from './hunt-view.js';

export const QUICK_MINUTES = 15;
export const QUICK_TITLE = 'QUICK 15';

/** The circuit, in order: push, legs, hinge, core. Sets are rounds; `reps` is the target
 *  (seconds for a timed move such as Plank). Twelve sets at about a minute and a quarter each. */
export const QUICK_CIRCUIT = [
  { name: 'Push Up',          sets: 3, reps: 12 },
  { name: 'Bodyweight Squat', sets: 3, reps: 15 },
  { name: 'Glute Bridge',     sets: 3, reps: 15 },
  { name: 'Plank',            sets: 3, reps: 30 },
];

function isBodyweight(def) {
  return !!def && String(def.equipment || '').toLowerCase() === 'bodyweight';
}

/**
 * The circuit for a given exercise database: QUICK_CIRCUIT entries that exist
 * and are bodyweight, topped up with other plain bodyweight exercises (not
 * timed, no skill tier) when one is missing. Always returns up to four entries.
 */
export function buildQuickCircuit(db, circuit = QUICK_CIRCUIT) {
  const out = [];
  for (const c of circuit) {
    if (isBodyweight(db && db[c.name])) out.push({ ...c });
  }
  if (out.length < circuit.length) {
    const used = new Set(out.map(e => e.name));
    const spare = Object.keys(db || {}).filter(n =>
      !used.has(n) && isBodyweight(db[n]) && !db[n].timed && !db[n].skillTier && db[n].intent === 'strength').sort();
    for (const n of spare) {
      if (out.length >= circuit.length) break;
      out.push({ name: n, sets: 3, reps: 12 });
    }
  }
  return out;
}

/** Total sets in a circuit. */
export function circuitSets(circuit) {
  return (circuit || []).reduce((n, e) => n + (Number(e.sets) || 0), 0);
}

/**
 * What the logger shows before anything is filled in: the same shape the
 * programme path hands it (name, sets, target reps, no prefilled sets).
 */
export function quickLoggerRows(circuit) {
  return (circuit || []).map(e => ({ name: e.name, sets: e.sets, targetReps: e.reps,
    prefillSets: e.weight > 0 ? Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: e.weight })) : null }));
}

/* ── the picker: choices ─────────────────────────────────────────────────── */
/* Step 1 is the type (or Random, which builds at once). Each type then asks at most
   two single-tap questions, so the whole flow is three taps or fewer. */

export const QUICK_TYPES = [
  { id: 'cardio',       label: 'Cardio',       sub: 'Run, bike, swim' },
  { id: 'calisthenics', label: 'Calisthenics', sub: 'Bodyweight' },
  { id: 'weights',      label: 'Weights',      sub: 'Dumbbells, gym' },
  { id: 'combo',        label: 'Combo',        sub: 'Two styles in one' },
];
const FOCUS_LABEL = { push: 'Upper push', pull: 'Pull', legs: 'Legs', core: 'Core', full: 'Full body',
  run: 'Run', bike: 'Bike', swim: 'Swim', rope: 'Jump rope', hiit: 'HIIT' };
const STRENGTH_FOCI = ['push', 'pull', 'legs', 'core', 'full'];
const COMBO_FOCI = ['push', 'pull', 'legs', 'full'];
/** Cardio activity -> exercise-database names, by intensity. A missing name is skipped. */
const CARDIO = {
  run:  { easy: ['Easy Run'], steady: ['Running', 'Tempo Run'], hard: ['Interval Running', 'Hill Sprints'] },
  bike: { easy: ['Stationary Bike'], steady: ['Cycling', 'Stationary Bike'], hard: ['Cycling Intervals'] },
  swim: { easy: ['Freestyle Swimming'], steady: ['Freestyle Swimming'], hard: ['HIIT Swimming', 'Freestyle Swimming'] },
  rope: { easy: ['Jump Rope'], steady: ['Jump Rope'], hard: ['Jump Rope'] },
  hiit: { easy: ['Interval Running', 'Cycling Intervals'], steady: ['Interval Running', 'Hill Sprints', 'Cycling Intervals'], hard: ['Hill Sprints', 'Interval Running'] },
};
const FINISHERS = ['Jump Rope', 'Stair Climb', 'Stationary Bike', 'Running'];
const INTENSITY = [{ id: 'easy', label: 'Easy' }, { id: 'steady', label: 'Steady' }, { id: 'hard', label: 'Hard intervals' }];
const LEVEL = [{ id: 'easier', label: 'Easier' }, { id: 'standard', label: 'Standard' }, { id: 'harder', label: 'Harder' }];
const PAIR = [{ id: 'wc', label: 'Weights + cardio finisher' }, { id: 'cc', label: 'Calisthenics + core' }];

const hasMinsUnit = d => !!d && !!d.timed && d.timedUnit === 'mins';
const cardioAll = (db, act) => [...new Set(Object.values(CARDIO[act] || {}).flat())].filter(n => hasMinsUnit(db && db[n]));
const cardioNames = (db, act, intensity) => {
  const own = ((CARDIO[act] || {})[intensity] || []).filter(n => hasMinsUnit(db && db[n]));
  return own.length ? own : cardioAll(db, act);
};
const opts = (ids) => ids.map(id => ({ id, label: FOCUS_LABEL[id] }));

/**
 * The questions after the type, in order: [{ key, title, options: [{id, label}] }].
 * Cardio offers only activities the database has. At most two, so with the type it is three steps.
 */
export function quickQuestions(type, db) {
  if (type === 'cardio') return [
    { key: 'focus', title: 'Which activity?', options: opts(Object.keys(CARDIO).filter(k => cardioAll(db, k).length)) },
    { key: 'intensity', title: 'How hard?', options: INTENSITY }];
  if (type === 'calisthenics') return [
    { key: 'focus', title: 'What to train?', options: opts(STRENGTH_FOCI) },
    { key: 'level', title: 'Which level?', options: LEVEL }];
  if (type === 'weights') return [
    { key: 'focus', title: 'What to train?', options: opts(STRENGTH_FOCI) },
    { key: 'equipment', title: 'What equipment?', options: [{ id: 'dumbbell', label: 'Dumbbells only' }, { id: 'gym', label: 'Full gym' }] }];
  if (type === 'combo') return [
    { key: 'pair', title: 'What to pair?', options: PAIR },
    { key: 'focus', title: 'What to train?', options: opts(COMBO_FOCI) }];
  return [];
}

const DEFAULTS = { focus: 'full', level: 'standard', intensity: 'steady', equipment: 'gym', pair: 'wc' };

/** A choice made valid: unknown or missing answers fall back to a sensible default. */
export function normalizeChoice(choice, db) {
  const c = choice || {};
  const type = QUICK_TYPES.some(t => t.id === c.type) ? c.type : 'calisthenics';
  const out = { type };
  for (const q of quickQuestions(type, db)) {
    const ok = q.options.some(o => o.id === c[q.key]);
    out[q.key] = ok ? c[q.key] : (q.options.some(o => o.id === DEFAULTS[q.key]) ? DEFAULTS[q.key] : (q.options[0] ? q.options[0].id : ''));
  }
  return out;
}

/* ── exercise classification ─────────────────────────────────────────────── */

const GROUP_OF = {
  'Upper Chest': 'push', 'Middle Chest': 'push', 'Lower Chest': 'push', 'Chest': 'push',
  'Front Shoulders': 'push', 'Lateral Shoulders': 'push', 'Triceps': 'push',
  'Lats': 'pull', 'Upper Back': 'pull', 'Rear Shoulders': 'pull', 'Traps': 'pull', 'Biceps': 'pull', 'Forearms': 'pull', 'Lower Back': 'pull',
  'Quads': 'legs', 'Hamstrings': 'legs', 'Glutes': 'legs', 'Calves': 'legs', 'Inner Thighs': 'legs', 'Hip Flexors': 'legs',
  'Upper Abs': 'core', 'Middle Abs': 'core', 'Lower Abs': 'core', 'Obliques': 'core',
};
const OK_INTENT = new Set(['strength', 'hypertrophy', 'isometric', 'endurance']);

function primaryMuscle(def) {
  let best = '', bv = -1;
  for (const [m, v] of Object.entries((def && def.muscles) || {})) if (Number(v) > bv) { best = m; bv = Number(v); }
  return best;
}
const groupOfDef = def => GROUP_OF[primaryMuscle(def)] || '';

const EQUIP = {
  none:     ['bodyweight'],
  dumbbell: ['dumbbell'],
  gym:      ['barbell', 'dumbbell', 'machine', 'cable'],
};

function recencyMap(workouts, uid, today) {
  const m = {};
  for (const w of workouts || []) {
    if (!w || (uid && w.uid !== uid) || !Array.isArray(w.exercises)) continue;
    if (today && w.date && daysBetween(w.date, today) > 28) continue;
    for (const e of w.exercises) if (e && e.name) m[e.name] = (m[e.name] || 0) + 1;
  }
  return m;
}

/** Weighted random pick: recently logged moves count more. */
function pickWeighted(items, weightOf, rng) {
  const ws = items.map(i => Math.max(0.01, weightOf(i)));
  let r = rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function candidates(db, group, equipKeys, { skipNames = [] } = {}) {
  const eq = new Set(equipKeys);
  return Object.keys(db || {}).filter(n => {
    const d = db[n];
    if (!d || skipNames.includes(n) || d.skillTier || !OK_INTENT.has(d.intent) || hasMinsUnit(d)) return false;
    if (!eq.has(String(d.equipment || '').toLowerCase())) return false;
    return groupOfDef(d) === group;
  }).sort();
}

function repsFor(def, mode, level) {
  const k = level === 'harder' ? 1.25 : level === 'easier' ? 0.75 : 1;
  if (def.timed) return level === 'harder' ? 45 : level === 'easier' ? 20 : 30;
  if (mode === 'cal') return Math.max(5, Math.round(repsBase(def) * k));
  return repsBase(def, mode);
}
function repsBase(def, mode) {
  if (mode === 'weights') return String(def.equipment).toLowerCase() === 'barbell' ? 8 : 10;
  if (groupOfDef(def) === 'core') return 15;
  return Number(def.bwPercent) >= 0.9 ? 8 : 12;
}

/** Calisthenics level: harder leans to moves that load more of the body, easier to lighter ones. */
function levelBias(ctx, def) {
  if (ctx.level !== 'harder' && ctx.level !== 'easier') return 1;
  const bw = Number(def.bwPercent) || 0.7;
  return ctx.level === 'harder' ? 0.4 + bw * 1.5 : 2 - bw * 1.2;
}

/** Picks `count` distinct exercises from a group, preferring different primary muscles. */
function pickGroup(ctx, group, count, mode, equipKeys, taken) {
  let pool = candidates(ctx.db, group, equipKeys, { skipNames: taken });
  if (pool.length < count && mode === 'weights') pool = candidates(ctx.db, group, [...equipKeys, 'bodyweight'], { skipNames: taken });
  const out = [], muscles = new Set();
  while (out.length < count && pool.length) {
    const fresh = pool.filter(n => !muscles.has(primaryMuscle(ctx.db[n])));
    const from = fresh.length ? fresh : pool;
    const n = pickWeighted(from, x => (1 + 3 * (ctx.recent[x] || 0)) * levelBias(ctx, ctx.db[x]), ctx.rng);
    out.push(n); muscles.add(primaryMuscle(ctx.db[n])); pool = pool.filter(x => x !== n);
  }
  return out;
}

function entry(ctx, name, sets, mode) {
  const def = ctx.db[name];
  const e = { name, sets, reps: repsFor(def, mode, ctx.level) };
  if (String(def.equipment).toLowerCase() !== 'bodyweight' && !def.timed) {
    const last = lastSet(ctx.workouts, ctx.uid, name);
    if (last && last.weight > 0) e.weight = last.weight;
  }
  return e;
}

function strengthBlock(ctx, focus, mode, equipKey, plan) {
  const equipKeys = EQUIP[equipKey] || EQUIP.none;
  const groups = focus === 'full' ? ['push', 'pull', 'legs', 'core'] : [focus];
  const out = [];
  groups.forEach((g, gi) => {
    const want = focus === 'full' ? 1 : plan.length;
    const names = pickGroup(ctx, g, want, mode, equipKeys, out.map(e => e.name));
    names.forEach((n, i) => out.push(entry(ctx, n, focus === 'full' ? (gi === 0 ? 2 : 1) : plan[i], mode)));
  });
  return out;
}

function cardioBlock(ctx, focus, intensity, alt) {
  const names = cardioNames(ctx.db, focus, intensity);
  if (!names.length) return [];
  const name = pickWeighted(names, n => 1 + 3 * (ctx.recent[n] || 0), ctx.rng);
  /* hard intervals are three five-minute blocks; the rest one fifteen-minute block. Remix can flip it. */
  const blocks = (intensity === 'hard') !== !!alt;
  return [{ name, sets: blocks ? 3 : 1, reps: blocks ? 5 : 15 }];
}

/** Minutes for a circuit: about three per set, or the stated minutes for a move timed in minutes. */
export function quickMinutes(circuit, db) {
  let timed = 0; const rest = [];
  for (const e of circuit || []) {
    if (hasMinsUnit(db && db[e.name])) timed += (Number(e.sets) || 0) * (Number(e.reps) || 0);
    else rest.push(e);
  }
  const total = timed + (rest.length ? Math.round(rest.reduce((n, e) => n + (Number(e.sets) || 0), 0) * 3) : 0);
  return total ? Math.max(5, Math.round(total / 5) * 5) : 0;
}

const keyOf = c => c.map(e => `${e.name}x${e.sets}x${e.reps}`).sort().join('|');

function once(ctx, ch, alt) {
  const { type, focus } = ch;
  ctx.level = type === 'calisthenics' ? ch.level : 'standard';
  if (type === 'cardio') return cardioBlock(ctx, focus, ch.intensity, alt);
  if (type === 'calisthenics') return strengthBlock(ctx, focus, 'cal', 'none', [2, 2, 1]);
  if (type === 'weights') return strengthBlock(ctx, focus, 'weights', ch.equipment, [2, 2, 1]);
  /* combo: weights + a cardio finisher (gym), or calisthenics + core (no equipment) */
  const gym = ch.pair === 'wc';
  const keys = EQUIP[gym ? 'gym' : 'none'];
  const mode = gym ? 'weights' : 'cal';
  const out = [];
  if (focus !== 'full') pickGroup(ctx, focus, 2, mode, keys, []).forEach((n, i) => out.push(entry(ctx, n, gym ? 2 : (i ? 1 : 2), mode)));
  else ['push', 'pull', 'legs'].sort(() => ctx.rng() - 0.5).slice(0, 2).forEach(g =>
    pickGroup(ctx, g, 1, mode, keys, out.map(e => e.name)).forEach(n => out.push(entry(ctx, n, gym ? 2 : (out.length ? 1 : 2), mode))));
  if (gym) {
    const fin = FINISHERS.filter(n => hasMinsUnit(ctx.db[n]));
    if (fin.length) out.push({ name: pickWeighted(fin, n => 1 + 3 * (ctx.recent[n] || 0), ctx.rng), sets: 1, reps: 3 });
  } else {
    pickGroup(ctx, 'core', 1, 'cal', keys, out.map(e => e.name)).forEach(n => out.push(entry(ctx, n, 2, 'cal')));
  }
  return out;
}

/**
 * Builds a Quick workout of about 15 minutes.
 *   choice   { type, focus, equipment } or { type: 'random' }
 *   db       exercise database (built-in plus custom)
 *   workouts the Hunter's logged sessions, with uid and today, for recency and last weights
 *   rng      () => [0,1); injectable so tests are deterministic
 *   avoid    the previous circuit (or its key): the result is never identical to it when the
 *            data allows any other choice
 * Returns { circuit, minutes, choice, label, fellBack }. With too little data for the choice it
 * falls back to the fixed bodyweight circuit (fellBack true).
 */
export function generateQuick({ choice, db, workouts = [], uid, today, rng = Math.random, avoid } = {}) {
  const ctx = { db: db || {}, workouts, uid, rng, recent: recencyMap(workouts, uid, today) };
  const avoidKey = Array.isArray(avoid) ? keyOf(avoid) : (avoid || '');
  const random = !!(choice && choice.type === 'random');
  let result = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    let ch;
    if (random) {
      const type = QUICK_TYPES[Math.floor(rng() * QUICK_TYPES.length)].id;
      const pick = { type };
      for (const q of quickQuestions(type, ctx.db)) if (q.options.length) pick[q.key] = q.options[Math.floor(rng() * q.options.length)].id;
      ch = normalizeChoice(pick, ctx.db);
    } else ch = normalizeChoice(choice || QUICK_DEFAULT, ctx.db);
    const circuit = once(ctx, ch, attempt >= 12);
    const enough = ch.type === 'cardio' ? circuit.length >= 1 : circuit.length >= 2;
    if (!enough) {
      if (!random || attempt === 29) { result = { circuit: [], choice: ch }; break; }
      continue;
    }
    result = { circuit, choice: ch };
    if (!avoidKey || keyOf(circuit) !== avoidKey) break;
  }
  if (!result || !result.circuit.length) {
    const circuit = buildQuickCircuit(ctx.db);
    return { circuit, minutes: quickMinutes(circuit, ctx.db), choice: normalizeChoice(random ? null : choice, ctx.db), label: 'Bodyweight circuit', fellBack: true };
  }
  const ch = result.choice;
  const typeLabel = QUICK_TYPES.find(t => t.id === ch.type).label;
  const label = [random ? 'Random' : null, typeLabel, FOCUS_LABEL[ch.focus]].filter(Boolean).join(' · ');
  return { circuit: result.circuit, minutes: quickMinutes(result.circuit, ctx.db), choice: ch, label, fellBack: false };
}
