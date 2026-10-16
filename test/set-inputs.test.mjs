/* Tests for per-exercise set inputs.  Run:  node test/set-inputs.test.mjs
   No dependencies and no runner: a plain script that exits non-zero on failure. */

import { BASE_EXERCISES } from '../exercises.js';
import {
  setInputKind, storedSet, storedSetSecs, partsToSecs, secsToParts, formatSetTime,
  setInputHeaders, SET_INPUT_KINDS,
} from '../set-inputs.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}
const kindOf = n => setInputKind(BASE_EXERCISES[n]);

// ── kinds across the catalogue ────────────────────────────────────────────
check('Bench Press: kg + reps', kindOf('Bench Press'), 'weight_reps');
check('Leg Press: kg + reps', kindOf('Leg Press'), 'weight_reps');
check('Calf Raise (machine): kg + reps', kindOf('Calf Raise'), 'weight_reps');
check('Pull Up: reps + bodyweight load', kindOf('Pull Up'), 'load_reps');
check('Push Up: reps + bodyweight load', kindOf('Push Up'), 'load_reps');
check('Crunch: reps only', kindOf('Crunch'), 'reps');
check('Burpee: reps only', kindOf('Burpee'), 'reps');
check('Sprinting: reps only', kindOf('Sprinting'), 'reps');
check('Running: time + km', kindOf('Running'), 'distance');
check('Treadmill Run: time + km', kindOf('Treadmill Run'), 'distance');
check('Cycling: time + km', kindOf('Cycling'), 'distance');
check('Hill Sprints: time + km', kindOf('Hill Sprints'), 'distance');
check('Football: time', kindOf('Football (Soccer)'), 'duration');
check('Yoga: time', kindOf('Yoga'), 'duration');
check('Boxing: time', kindOf('Boxing — Bag Work'), 'duration');
check('Freestyle Swimming: time', kindOf('Freestyle Swimming'), 'duration');
check('Plank: seconds', kindOf('Plank'), 'hold');
check('Front Lever: seconds', kindOf('Front Lever'), 'hold');
check('Dead Hang: seconds', kindOf('Dead Hang'), 'hold');
check('Mountain Climber: time, stored like a run', kindOf('Mountain Climber'), 'cardio');
check('Bear Crawl: time, stored like a run', kindOf('Bear Crawl'), 'cardio');
check('custom exercise with no fields: kg + reps', setInputKind({}), 'weight_reps');
check('custom timed minutes sport: time', setInputKind({ timed: true, timedUnit: 'mins', intent: 'sport' }), 'duration');
check('every exercise has a known kind',
  Object.values(BASE_EXERCISES).every(d => SET_INPUT_KINDS.includes(setInputKind(d))), true);
check('every kind has headers', SET_INPUT_KINDS.every(k => setInputHeaders(k)[0]), true);

// ── storage matches what the logger always wrote ──────────────────────────
// Reproduction of the save path before this change, given the old inputs.
function oldSave(def, { repsField = 0, secsField = null, distField = null, weightField = 0 }) {
  const isSecs = def.timed && def.timedUnit !== 'mins';
  const rawVal = Number(repsField) || 0;
  const hasSecs = secsField !== null;
  const mins = hasSecs ? rawVal : (isSecs ? 0 : rawVal);
  const secs = hasSecs ? (Number(secsField) || 0) : (isSecs ? rawVal : 0);
  const totalMins = (mins * 60 + secs) / 60;
  return {
    reps: hasSecs ? Math.max(1, Math.round(totalMins)) : isSecs ? Math.max(1, Math.round(secs)) : rawVal,
    weight: Number(weightField) || 0,
    ...(distField !== null ? { distKm: parseFloat(distField) || 0 } : {}),
    ...(hasSecs || isSecs ? { durationMins: Math.round(totalMins * 10) / 10 } : {}),
  };
}
const sameKeys = (a, b) => JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map(k => [k, b[k]]));

const run = BASE_EXERCISES['Running'];
check('run 42:30 + 8.25 km stores as before',
  sameKeys(storedSet('distance', { secs: partsToSecs({ m: 42, s: 30 }), km: 8.25 }),
           oldSave(run, { repsField: 42, secsField: 30, distField: '8.25' })), true);
check('run 1:05:09 stores 65 minutes', storedSet('distance', { secs: partsToSecs({ h: 1, m: 5, s: 9 }), km: 12 }),
  { reps: 65, weight: 0, distKm: 12, durationMins: 65.2 });
check('run with km only keeps the km', storedSet('distance', { secs: 0, km: 3 }), { reps: 1, weight: 0, distKm: 3, durationMins: 0 });
check('mountain climber 0:45 stores as the old run row did',
  sameKeys(storedSet('cardio', { secs: 45 }), oldSave(BASE_EXERCISES['Mountain Climber'], { repsField: 0, secsField: 45, distField: '' })), true);
check('empty run set is dropped', storedSet('distance', {}), null);

const plank = BASE_EXERCISES['Plank'];
check('plank 45s stores as before',
  sameKeys(storedSet('hold', { secs: 45 }), oldSave(plank, { repsField: 45 })), true);
check('empty hold is dropped (was saved as 1s)', storedSet('hold', { secs: 0 }), null);

const yoga = BASE_EXERCISES['Yoga'];
check('yoga 45 min stores as before',
  sameKeys(storedSet('duration', { secs: partsToSecs({ m: 45 }) }), oldSave(yoga, { repsField: 45 })), true);
check('football 1h 30m stores 90 minutes', storedSet('duration', { secs: partsToSecs({ h: 1, m: 30 }) }), { reps: 90, weight: 0 });

const bench = BASE_EXERCISES['Bench Press'];
check('bench 8 x 60 stores as before',
  sameKeys(storedSet('weight_reps', { reps: 8, weight: 60 }), oldSave(bench, { repsField: 8, weightField: 60 })), true);
check('pull up 10 @ 75kg load stores as before', storedSet('load_reps', { reps: 10, weight: 75 }), { reps: 10, weight: 75 });
check('crunch 20 stores no weight', storedSet('reps', { reps: 20, weight: 15 }), { reps: 20, weight: 0 });
check('no reps is dropped', storedSet('weight_reps', { reps: 0, weight: 60 }), null);

// ── time helpers ──────────────────────────────────────────────────────────
check('parts round-trip', secsToParts(partsToSecs({ h: 1, m: 2, s: 3 })), { h: 1, m: 2, s: 3 });
check('blank parts are zero', partsToSecs({ h: '', m: '5', s: undefined }), 300);
check('stored run back to seconds', storedSetSecs('distance', { reps: 65, durationMins: 65.2 }), 3912);
check('stored duration back to seconds', storedSetSecs('duration', { reps: 90 }), 5400);
check('stored hold back to seconds', storedSetSecs('hold', { reps: 45, durationMins: 0.8 }), 45);
check('run time format', formatSetTime('distance', 3909), '1:05:09');
check('short run time format', formatSetTime('distance', 2530), '42:10');
check('duration format', formatSetTime('duration', 5400), '1h 30m');
check('short duration format', formatSetTime('duration', 2700), '45m');
check('hold format', formatSetTime('hold', 45), '45s');
check('long hold format', formatSetTime('hold', 125), '2m 05s');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
