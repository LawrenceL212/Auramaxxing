/* Tests for the AP ledger fallback ordering.  node test/ap-ledger.test.mjs */

import { apEventMillis, newestApEvents, isMissingIndexError, LEDGER_LIMIT } from '../ap-ledger.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}
const fsTs = ms => ({ toMillis: () => ms });
const NOW = 2_000_000_000_000;

// ── apEventMillis ─────────────────────────────────────────────────────────
check('Firestore Timestamp uses toMillis', apEventMillis({ timestamp: fsTs(1234) }), 1234);
check('plain {seconds,nanoseconds} object', apEventMillis({ timestamp: { seconds: 2, nanoseconds: 5e6 } }), 2005);
check('pending server timestamp falls back to date',
  apEventMillis({ timestamp: null, date: '2026-10-01' }), Date.parse('2026-10-01T00:00:00'));
check('nothing usable sorts as now', apEventMillis({ timestamp: null }, NOW), NOW);

// ── newestApEvents ────────────────────────────────────────────────────────
const evs = [
  { id: 'a', timestamp: fsTs(100) },
  { id: 'b', timestamp: fsTs(300) },
  { id: 'c', timestamp: null },          // just written, pending
  { id: 'd', timestamp: fsTs(200) },
];
check('newest first, pending on top',
  newestApEvents(evs, 50, NOW).map(e => e.id), ['c', 'b', 'd', 'a']);
check('caps at max', newestApEvents(evs, 2, NOW).map(e => e.id), ['c', 'b']);
check('ties keep input order',
  newestApEvents([{ id: 'x', timestamp: fsTs(5) }, { id: 'y', timestamp: fsTs(5) }]).map(e => e.id), ['x', 'y']);
check('does not mutate input', evs.map(e => e.id), ['a', 'b', 'c', 'd']);
check('default limit is 50',
  newestApEvents(Array.from({ length: 80 }, (_, i) => ({ timestamp: fsTs(i) }))).length, LEDGER_LIMIT);
check('empty in, empty out', newestApEvents([]), []);

// ── isMissingIndexError ───────────────────────────────────────────────────
check('failed-precondition code', isMissingIndexError({ code: 'failed-precondition' }), true);
check('index message', isMissingIndexError({ message: 'The query requires an index. You can create it here' }), true);
check('permission-denied is not', isMissingIndexError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), false);
check('null is not', isMissingIndexError(null), false);

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
