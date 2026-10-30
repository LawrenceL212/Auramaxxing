/* Tests for the training block.  Run:  node test/mesocycle.test.mjs */
import { blockState, blockWeeks, BLOCK_WEEKS, RIR_TARGETS } from '../mesocycle.js';
import { shiftDay } from '../streak.js';

let pass = 0, fail = 0; const results = [];
function check(name, ok, detail = '') { ok ? pass++ : fail++; results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`); }
const start = '2026-09-01';
const at = (days) => blockState({ start }, shiftDay(start, days));

check('six weeks: five build, one deload', BLOCK_WEEKS === 6 && RIR_TARGETS.length === 5);
check('reps in reserve fall toward failure', RIR_TARGETS.every((r, i) => i === 0 || r <= RIR_TARGETS[i - 1]) && RIR_TARGETS[0] === 3 && RIR_TARGETS[4] === 0);
check('no block or a future start gives nothing', blockState(null, start) === null && blockState({}, start) === null && at(-1) === null);
check('day 0 is week 1 at RIR 3', at(0).week === 1 && at(0).targetRir === 3 && at(0).phase === 'accumulate');
check('day 6 is still week 1, 1 day left', at(6).week === 1 && at(6).daysLeftInWeek === 1);
check('day 7 is week 2 at RIR 2', at(7).week === 2 && at(7).targetRir === 2 && at(0).daysLeftInWeek === 7);
check('week 5 is RIR 0', at(28).week === 5 && at(28).targetRir === 0 && /failure/.test(at(28).guidance));
check('week 6 is the deload: half sets, RIR 4', at(35).week === 6 && at(35).phase === 'deload' && at(35).targetRir === 4 && at(35).setsFactor === 0.5 && at(35).label === 'Deload week');
check('the next block starts by itself', at(42).week === 1 && at(42).blockNo === 2 && at(41).week === 6 && at(41).blockNo === 1);
check('block number keeps counting', at(42 * 3 + 8).blockNo === 4 && at(42 * 3 + 8).week === 2);
check('every week has guidance, accumulate weeks mention reserve', Array.from({ length: 6 }, (_, i) => at(i * 7)).every(s => s.guidance.length > 20) && Array.from({ length: 5 }, (_, i) => at(i * 7)).every(s => /reserve|failure/.test(s.guidance)));
check('week dots: done before, current now, deload last', (() => { const w = blockWeeks(at(8)); return w.length === 6 && w[0].done && w[1].current && !w[2].done && w[5].deload; })());
check('no dots without a block', blockWeeks(null).length === 0);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
