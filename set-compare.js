/* Row-colour comparison of a logged resistance set against the same set last time.
   Presentation only: nothing here feeds a stored value.

   A set that matches or beats last time's reps and weight but is logged with a
   HIGHER RIR felt easier, which is progress, not a penalty. The score formula
   (reps x weight x (6 - RIR)) alone would call it worse, so the logger asks this
   first.  Pure, so `node test/set-compare.test.mjs` tests it. */

/** True when reps and weight are at least last time's and RIR is higher (felt
    easier). Weight 0 = no kg, equal to 0. Identical or harder sets are false. */
export function feltEasier({ reps, weight, rir, prevReps, prevWeight, prevRir }) {
  if (![reps, weight, rir, prevReps, prevWeight, prevRir].every(Number.isFinite)) return false;
  if (!(prevReps > 0)) return false;
  return reps >= prevReps && weight >= prevWeight && rir > prevRir;
}

export const EASIER_LABEL = 'Stronger: felt easier';
