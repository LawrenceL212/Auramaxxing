'use strict';
/* Server-side mirror of the client's duel scoring.
 *
 * Every function here is a deliberate line-for-line copy of the version in
 * index.html. The formulas are gameplay: if these two drift, a duel resolves
 * differently from the score the Hunters watched all week. Any change to
 * getDuelScore / getSetIntensity / e1rm in index.html MUST be mirrored here.
 *
 * index.html sources:
 *   getSetIntensity   ~10510
 *   e1rm              ~"function e1rm(weight, reps)"
 *   getDuelScore      ~22424
 */
const EXERCISE_SCALE = require('./exercise-scale');

/* Unrounded, matching the client's e1rm(). NOTE this is NOT epley1RM(), which
 * rounds to 1dp — getDuelScore uses the unrounded one. */
function e1rm(weight, reps) { return weight * (1 + reps / 30); }

function getSetIntensity(set, exDef) {
  const isTimed = !!(exDef && exDef.timed && exDef.timedUnit !== 'mins');
  const isRun = !!(exDef && exDef.timed && exDef.intent === 'endurance');
  if (set.rpe != null) return { type: 'rpe', value: set.rpe };
  if (set.rir != null && !isTimed && !isRun) return { type: 'rir', value: set.rir };
  if (set.rir != null) {
    if (isTimed || isRun) return { type: 'rpe', value: set.rir };
    return { type: 'rir', value: set.rir };
  }
  return { type: null, value: null };
}

/**
 * @param spec       duel.spec
 * @param workouts   every workout doc inside [startDate, endDate]
 * @param uid        whose score to compute
 * @param bodyweight THAT hunter's bodyweight in kg, or null
 * @param customDefs {name: {timed, timedUnit, intent}} from customExercises
 */
function getDuelScore(spec, workouts, uid, bodyweight, customDefs) {
  const qualifying = workouts.filter((w) => w.uid === uid);
  if (!qualifying.length) return 0;

  const exName = spec.exercise;
  const maxRIR = spec.minRIR != null ? spec.minRIR : 5;
  const minWPct = spec.minWeightPct || 0;
  const defOf = (n) => (customDefs && customDefs[n]) || EXERCISE_SCALE[n] || {};

  const allSets = [];
  qualifying.forEach((w) => {
    (w.exercises || []).forEach((ex) => {
      if (exName && exName !== 'Any Exercise (Total Sets)' && ex.name !== exName) return;
      const exDef = defOf(ex.name);
      const isTimedEx = !!(exDef.timed && exDef.timedUnit !== 'mins');
      const isRunEx = !!(exDef.timed && exDef.intent === 'endurance');
      (ex.sets || [])
        .filter((s) => {
          if (!s.reps || s.reps <= 0) return false;
          // Hold/skill/run: duration is the metric, no RIR gate
          if (isTimedEx || isRunEx) return true;
          const si = getSetIntensity(s, exDef);
          if (si.type !== 'rir' || si.value == null) return maxRIR >= 5;
          return si.value <= maxRIR;
        })
        .forEach((s) => allSets.push(Object.assign({}, s, { exName: ex.name, date: w.date })));
    });
  });

  const sessionDates = new Set(qualifying.map((w) => w.date));
  if (sessionDates.size < (spec.minSessions || 1)) return -1; // forfeit

  const bw = bodyweight || 70;

  switch (spec.metric) {
    case 'best_e1rm':
      return Math.max(0, ...allSets
        .filter((s) => s.weight && s.weight >= bw * (minWPct / 100))
        .map((s) => e1rm(s.weight, s.reps)));
    case 'total_volume':
      return allSets
        .filter((s) => !minWPct || (s.weight && s.weight >= bw * (minWPct / 100)))
        .reduce((t, s) => t + (s.reps * (s.weight || 1)), 0);
    case 'best_hold':
      return Math.max(0, ...allSets.map((s) => s.reps));
    case 'total_hold':
      return allSets.reduce((t, s) => t + s.reps, 0);
    case 'best_pace': {
      let bestPace = 9999;
      qualifying.forEach((w) => {
        if (!w.runSummary || !w.runSummary.pace) return;
        const pm = String(w.runSummary.pace).match(/(\d+):(\d{1,2})/);
        if (pm) {
          const secs = Number(pm[1]) * 60 + Number(pm[2]);
          if (secs < bestPace) bestPace = secs;
        }
      });
      return bestPace === 9999 ? 0 : 10000 - bestPace; // inverted: higher = faster
    }
    case 'total_distance':
      return qualifying.reduce((t, w) => t + ((w.runSummary && w.runSummary.distKm) || 0), 0);
    case 'total_sets':
      return allSets.length;
    case 'best_reps':
      return Math.max(0, ...allSets.map((s) => s.reps));
    default:
      return 0;
  }
}

module.exports = { getDuelScore, getSetIntensity, e1rm };
