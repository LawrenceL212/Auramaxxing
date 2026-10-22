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

   Pure, so test/quick-quest.test.mjs runs it without a browser.
   ========================================================================= */

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
  return (circuit || []).map(e => ({ name: e.name, sets: e.sets, targetReps: e.reps, prefillSets: null }));
}
