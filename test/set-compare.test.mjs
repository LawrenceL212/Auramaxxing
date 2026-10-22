/* Tests for the "felt easier" row state.  Run:  node test/set-compare.test.mjs */
import { feltEasier, EASIER_LABEL } from '../set-compare.js';

let fail = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : ` got ${got} want ${want}`}`);
}
const prev = { prevReps: 8, prevWeight: 60, prevRir: 2 };
check('same reps+weight, higher RIR', feltEasier({ ...prev, reps: 8, weight: 60, rir: 3 }), true);
check('more reps, higher RIR', feltEasier({ ...prev, reps: 9, weight: 60, rir: 4 }), true);
check('more weight, higher RIR', feltEasier({ ...prev, reps: 8, weight: 62.5, rir: 3 }), true);
check('identical', feltEasier({ ...prev, reps: 8, weight: 60, rir: 2 }), false);
check('lower RIR (harder)', feltEasier({ ...prev, reps: 8, weight: 60, rir: 1 }), false);
check('fewer reps, higher RIR stays worse', feltEasier({ ...prev, reps: 7, weight: 60, rir: 4 }), false);
check('less weight, higher RIR stays worse', feltEasier({ ...prev, reps: 8, weight: 55, rir: 4 }), false);
check('no-kg both 0, higher RIR', feltEasier({ reps: 10, weight: 0, rir: 3, prevReps: 10, prevWeight: 0, prevRir: 1 }), true);
check('no previous', feltEasier({ reps: 8, weight: 60, rir: 3, prevReps: 0, prevWeight: 0, prevRir: 2 }), false);
check('previous RIR missing', feltEasier({ reps: 8, weight: 60, rir: 3, prevReps: 8, prevWeight: 60, prevRir: null }), false);
check('current RIR missing', feltEasier({ ...prev, reps: 8, weight: 60, rir: null }), false);
check('label', typeof EASIER_LABEL, 'string');
if (fail) { console.log(`${fail} failed`); process.exit(1); }
console.log('all passed');
