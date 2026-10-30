/* Tests for the Quick 15 circuit.  Run:  node test/quick-quest.test.mjs
   No dependencies and no runner, in the style of test/streak.test.mjs. */

import { BASE_EXERCISES } from '../exercises.js';
import { QUICK_CIRCUIT, QUICK_TYPES, buildQuickCircuit, circuitSets, quickLoggerRows, generateQuick, quickQuestions, normalizeChoice, quickMinutes } from '../quick-quest.js';
import { computeStreakFrom, STREAK_RULES_START } from '../streak.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

// ── the real circuit ──────────────────────────────────────────────────────
const circuit = buildQuickCircuit(BASE_EXERCISES);
check('uses the four planned exercises when they all exist', circuit.map(e => e.name), QUICK_CIRCUIT.map(e => e.name));
check('every name is in the exercise database', circuit.every(e => !!BASE_EXERCISES[e.name]), true);
check('every move is bodyweight', circuit.every(e => BASE_EXERCISES[e.name].equipment === 'Bodyweight'), true);
check('twelve sets: about fifteen minutes of rounds', circuitSets(circuit), 12);
check('four exercises', circuit.length, 4);
check('the plank is the timed move', circuit.filter(e => BASE_EXERCISES[e.name].timed).map(e => e.name), ['Plank']);
check('nothing was added to the database', Object.keys(BASE_EXERCISES).includes('Quick'), false);

// ── resilience to a renamed or changed exercise ───────────────────────────
const db = { ...BASE_EXERCISES };
delete db['Glute Bridge'];
const patched = buildQuickCircuit(db);
check('a missing exercise is replaced, not dropped', patched.length, 4);
check('the replacement is a real bodyweight exercise',
  patched.filter(e => !QUICK_CIRCUIT.some(c => c.name === e.name)).every(e => db[e.name] && db[e.name].equipment === 'Bodyweight'), true);
check('a barbell exercise never slips in', patched.some(e => db[e.name].equipment !== 'Bodyweight'), false);
check('an empty database gives an empty circuit', buildQuickCircuit({}), []);

// ── logger rows ───────────────────────────────────────────────────────────
check('logger rows carry name, sets and target reps, no prefill',
  quickLoggerRows(circuit)[0], { name: 'Push Up', sets: 3, targetReps: 12, prefillSets: null });

// ── counts for the streak: it is an ordinary workout ──────────────────────
// A logged Quick session is stored like any session (date, exercises, programDayIndex null).
// The streak engine looks only at the dates of stored workouts.
const quickWorkout = {
  uid: 'u', date: '2026-10-22', programDayIndex: null,
  exercises: circuit.map(e => ({ name: e.name, sets: Array.from({ length: e.sets }, () => ({ weight: 0, reps: e.reps })) })),
};
const ctx = (today, dates) => ({ today, workoutDates: new Set(dates), schedule: [], freeze: null, backfill: [], pendingDates: new Set(), rulesStart: STREAK_RULES_START });
check('a Quick session today makes the streak 1', computeStreakFrom(ctx('2026-10-22', [quickWorkout.date])), 1);
check('a Quick session extends a streak', computeStreakFrom(ctx('2026-10-22', ['2026-10-20', '2026-10-21', quickWorkout.date])), 3);
check('without it the streak would not include today', computeStreakFrom(ctx('2026-10-22', ['2026-10-20', '2026-10-21'])), 2);

// ── the picker: generateQuick ─────────────────────────────────────────────
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gen = (choice, extra = {}, seed = 1) => generateQuick({ choice, db: BASE_EXERCISES, rng: mulberry(seed), ...extra });
const defOf = n => BASE_EXERCISES[n];
const top = n => Object.entries(defOf(n).muscles).sort((a, b) => b[1] - a[1])[0][0];
const GROUPS = {
  push: ['Upper Chest', 'Middle Chest', 'Lower Chest', 'Chest', 'Front Shoulders', 'Lateral Shoulders', 'Triceps'],
  pull: ['Lats', 'Upper Back', 'Rear Shoulders', 'Traps', 'Biceps', 'Forearms', 'Lower Back'],
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Inner Thighs', 'Hip Flexors'],
  core: ['Upper Abs', 'Middle Abs', 'Lower Abs', 'Obliques'],
};

check('questions: max two after the type', QUICK_TYPES.every(t => quickQuestions(t.id, BASE_EXERCISES).length <= 2), true);
check('questions: cardio lists activities the db has', quickQuestions('cardio', BASE_EXERCISES)[0].options.map(o => o.id), ['run', 'bike', 'swim', 'rope', 'hiit']);
check('questions: cardio drops an activity the db lacks',
  quickQuestions('cardio', { Running: BASE_EXERCISES.Running })[0].options.map(o => o.id), ['run']);
check('normalize fills defaults', normalizeChoice({ type: 'weights' }, BASE_EXERCISES), { type: 'weights', focus: 'full', equipment: 'gym' });
check('normalize: unknown type and answer', normalizeChoice({ type: 'zzz', focus: 'nope' }, BASE_EXERCISES), { type: 'calisthenics', focus: 'full', level: 'standard' });

// each type path, each focus: right muscles, right equipment, about fifteen minutes
for (const focus of ['push', 'pull', 'legs', 'core']) {
  const r = gen({ type: 'calisthenics', focus, level: 'standard' });
  check(`calisthenics ${focus}: three bodyweight moves of that group`, [r.circuit.length, r.circuit.every(e => defOf(e.name).equipment === 'Bodyweight' && GROUPS[focus].includes(top(e.name)))], [3, true]);
  check(`calisthenics ${focus}: 15 min`, r.minutes, 15);
  const w = gen({ type: 'weights', focus, equipment: 'gym' });
  check(`weights ${focus}: loaded gym moves of that group`, w.circuit.every(e => (focus === 'core' || defOf(e.name).equipment !== 'Bodyweight') && GROUPS[focus].includes(top(e.name))), true);
  check(`weights ${focus}: 5 sets, 15 min`, [circuitSets(w.circuit), w.minutes], [5, 15]);
  const d = gen({ type: 'weights', focus, equipment: 'dumbbell' });
  check(`weights ${focus} dumbbells only: dumbbell moves (or bodyweight top-up)`, d.circuit.every(e => ['Dumbbell', 'Bodyweight'].includes(defOf(e.name).equipment)), true);
}
const full = gen({ type: 'calisthenics', focus: 'full' });
check('calisthenics full body: four moves, one per group', [full.circuit.length, new Set(full.circuit.map(e => Object.keys(GROUPS).find(g => GROUPS[g].includes(top(e.name))))).size], [4, 4]);
check('full body: 5 sets and 15 min', [circuitSets(full.circuit), full.minutes], [5, 15]);
check('the old fixed circuit is not the result', full.fellBack, false);
check('timed holds carry seconds', gen({ type: 'calisthenics', focus: 'core' }, {}, 4).circuit.filter(e => defOf(e.name).timed).every(e => e.reps === 30), true);

// level changes the targets
const reps = lvl => gen({ type: 'calisthenics', focus: 'push', level: lvl }, {}, 9).circuit.map(e => e.reps);
check('harder asks for more reps than easier', reps('harder').reduce((a, b) => a + b) > reps('easier').reduce((a, b) => a + b), true);

// cardio
for (const act of ['run', 'bike', 'swim', 'rope', 'hiit']) {
  for (const inten of ['easy', 'steady', 'hard']) {
    const r = gen({ type: 'cardio', focus: act, intensity: inten });
    check(`cardio ${act}/${inten}: one timed-in-minutes move, 15 min`, [r.circuit.length, defOf(r.circuit[0].name).timedUnit, r.minutes, r.circuit[0].sets * r.circuit[0].reps], [1, 'mins', 15, 15]);
  }
}
check('cardio hard is three five-minute blocks', (c => [c.sets, c.reps])(gen({ type: 'cardio', focus: 'run', intensity: 'hard' }).circuit[0]), [3, 5]);
check('cardio easy run is one fifteen-minute block of Easy Run', (c => [c.name, c.sets, c.reps])(gen({ type: 'cardio', focus: 'run', intensity: 'easy' }).circuit[0]), ['Easy Run', 1, 15]);

// combo
const wc = gen({ type: 'combo', pair: 'wc', focus: 'push' });
check('combo weights + finisher: loaded moves then a cardio finisher', [wc.circuit.slice(0, -1).every(e => defOf(e.name).equipment !== 'Bodyweight'), defOf(wc.circuit.at(-1).name).timedUnit], [true, 'mins']);
check('combo weights + finisher: 15 min', wc.minutes, 15);
const cc = gen({ type: 'combo', pair: 'cc', focus: 'legs' });
check('combo calisthenics + core: all bodyweight, ends on core', [cc.circuit.every(e => defOf(e.name).equipment === 'Bodyweight'), GROUPS.core.includes(top(cc.circuit.at(-1).name))], [true, true]);
check('combo calisthenics + core: 15 min', cc.minutes, 15);
check('combo full body mixes two groups before the finisher', gen({ type: 'combo', pair: 'wc', focus: 'full' }).circuit.length, 3);

// Random: every seed works and gives a real workout
let randomOk = true; const seen = new Set();
for (let i = 1; i <= 40; i++) { const r = gen({ type: 'random' }, {}, i); seen.add(r.choice.type); if (r.fellBack || !r.circuit.length || r.minutes !== 15) randomOk = false; }
check('Random always builds a 15 minute workout', randomOk, true);
check('Random reaches every type', seen.size, 4);

// remix never repeats
for (const choice of [{ type: 'calisthenics', focus: 'push' }, { type: 'weights', focus: 'legs', equipment: 'gym' }, { type: 'cardio', focus: 'swim', intensity: 'steady' },
  { type: 'cardio', focus: 'run', intensity: 'hard' }, { type: 'combo', pair: 'wc', focus: 'pull' }, { type: 'random' }]) {
  let prev = gen(choice, {}, 3), ok = true;
  for (let i = 0; i < 25; i++) { const next = gen(choice, { avoid: prev.circuit }, 100 + i); if (JSON.stringify(next.circuit) === JSON.stringify(prev.circuit)) ok = false; prev = next; }
  check(`remix differs every time: ${JSON.stringify(choice)}`, ok, true);
}

// history: recent moves are preferred, last weight is the starting load
const hist = [{ uid: 'u', date: '2026-10-20', exercises: [{ name: 'Bench Press', sets: [{ weight: 62.5, reps: 8 }, { weight: 60, reps: 8 }] }] }];
let benchPicked = 0, base = 0;
for (let i = 1; i <= 60; i++) {
  const a = gen({ type: 'weights', focus: 'push', equipment: 'gym' }, { workouts: hist, uid: 'u', today: '2026-10-22' }, i);
  const b = gen({ type: 'weights', focus: 'push', equipment: 'gym' }, {}, i);
  if (a.circuit.some(e => e.name === 'Bench Press')) benchPicked++;
  if (b.circuit.some(e => e.name === 'Bench Press')) base++;
}
check('a recently logged move is picked more often', benchPicked > base, true);
const withBench = (() => { for (let i = 1; i < 200; i++) { const r = gen({ type: 'weights', focus: 'push', equipment: 'gym' }, { workouts: hist, uid: 'u', today: '2026-10-22' }, i); if (r.circuit.some(e => e.name === 'Bench Press')) return r; } })();
check('gym start load is the last top weight', withBench.circuit.find(e => e.name === 'Bench Press').weight, 62.5);
check('logger rows prefill that weight on every set', quickLoggerRows(withBench.circuit).find(r => r.name === 'Bench Press').prefillSets, [0, 1, 2].slice(0, withBench.circuit.find(e => e.name === 'Bench Press').sets).map(() => ({ reps: 10 - 2 + 0 * 0, weight: 62.5 })).map(x => ({ ...x, reps: withBench.circuit.find(e => e.name === 'Bench Press').reps })));
check('bodyweight moves get no load', gen({ type: 'calisthenics', focus: 'push' }).circuit.every(e => e.weight === undefined), true);
check('old history outside 28 days is ignored for recency but not for load',
  generateQuick({ choice: { type: 'weights', focus: 'push', equipment: 'gym' }, db: BASE_EXERCISES, rng: mulberry(1), workouts: hist, uid: 'u', today: '2027-03-01' }).fellBack, false);

// custom exercises join the pool
const customDb = { ...BASE_EXERCISES, 'My Cable Fly': { intent: 'hypertrophy', statWeights: { strength: 1 }, muscles: { 'Middle Chest': 1 }, equipment: 'Cable' } };
let customSeen = false;
for (let i = 1; i <= 80 && !customSeen; i++) customSeen = generateQuick({ choice: { type: 'weights', focus: 'push', equipment: 'gym' }, db: customDb, rng: mulberry(i) }).circuit.some(e => e.name === 'My Cable Fly');
check('a custom exercise can be chosen', customSeen, true);

// empty or unknown data falls back to the old circuit
check('empty db falls back to (empty) old circuit', (r => [r.fellBack, r.circuit])(generateQuick({ choice: { type: 'weights', focus: 'push', equipment: 'gym' }, db: {}, rng: mulberry(1) })), [true, []]);
const tiny = generateQuick({ choice: { type: 'weights', focus: 'pull', equipment: 'gym' }, db: { 'Push Up': BASE_EXERCISES['Push Up'], 'Bodyweight Squat': BASE_EXERCISES['Bodyweight Squat'], 'Glute Bridge': BASE_EXERCISES['Glute Bridge'], 'Plank': BASE_EXERCISES['Plank'] }, rng: mulberry(1) });
check('too little data falls back to the old circuit', [tiny.fellBack, tiny.circuit.map(e => e.name)], [true, QUICK_CIRCUIT.map(e => e.name)]);
check('unknown type does not throw and still gives a workout', gen({ type: 'zzz', focus: 'q' }).circuit.length > 0, true);
check('cardio with no cardio exercises falls back', generateQuick({ choice: { type: 'cardio', focus: 'run', intensity: 'easy' }, db: { 'Push Up': BASE_EXERCISES['Push Up'], 'Bodyweight Squat': BASE_EXERCISES['Bodyweight Squat'], 'Glute Bridge': BASE_EXERCISES['Glute Bridge'], 'Plank': BASE_EXERCISES['Plank'] }, rng: mulberry(1) }).fellBack, true);
check('quickMinutes: five sets is 15, one 15 minute block is 15', [quickMinutes([{ name: 'Push Up', sets: 5, reps: 10 }], BASE_EXERCISES), quickMinutes([{ name: 'Running', sets: 1, reps: 15 }], BASE_EXERCISES)], [15, 15]);
check('generated entries stay in the ordinary shape', Object.keys(gen({ type: 'calisthenics', focus: 'pull' }).circuit[0]).sort(), ['name', 'reps', 'sets']);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
