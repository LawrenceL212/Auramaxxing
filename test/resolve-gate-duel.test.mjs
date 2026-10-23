/* Tests for functions/lib/settle-duel.js with a fake Firestore.  Run: node test/resolve-gate-duel.test.mjs */
import { createRequire } from 'node:module';
const { settleDuel, DuelError } = createRequire(import.meta.url)('../functions/lib/settle-duel.js');

let pass = 0, fail = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };
const code = async (p) => { try { await p; return 'no error'; } catch (e) { return e instanceof DuelError ? e.code : 'other:' + e.message; } };

const NOW = Date.parse('2026-10-25T00:00:00Z');   // after 2026-10-22 window (ends 10-23 12:00Z)
const setPath = (o, path, v) => { const k = path.split('.'); let c = o; k.slice(0, -1).forEach((p) => { if (typeof c[p] !== 'object' || c[p] === null) c[p] = {}; c = c[p]; }); c[k.at(-1)] = v; };

function makeDb(seed) {
  const store = JSON.parse(JSON.stringify(seed.docs));
  const extra = { workouts: seed.workouts || [], bodyweight: [], customExercises: [] };
  let auto = 0, txRuns = 0;
  const ref = (col, id) => ({ col, id, async get() { const d = store[col + '/' + id]; return { exists: !!d, data: () => d && JSON.parse(JSON.stringify(d)) }; } });
  const db = {
    store, get txRuns() { return txRuns; },
    collection(col) {
      return {
        doc: (id = 'auto' + (++auto)) => ref(col, id),
        where(f, op, v) { const q = { fs: [[f, op, v]], where(f2, o2, v2) { q.fs.push([f2, o2, v2]); return q; },
          orderBy() { return q; }, limit() { return q; },
          async get() { const rows = (extra[col] || []).filter((r) => q.fs.every(([ff, o, vv]) => o === '==' ? r[ff] === vv : o === '>=' ? r[ff] >= vv : r[ff] <= vv));
            return { empty: !rows.length, docs: rows.map((r) => ({ data: () => r })), forEach(fn) { this.docs.forEach(fn); } }; } }; return q; },
        async get() { const rows = extra[col] || []; return { docs: rows.map((r) => ({ data: () => r })), forEach(fn) { this.docs.forEach(fn); } }; },
      };
    },
    async runTransaction(fn) {
      txRuns++; const writes = [];
      const tx = { get: (r) => r.get(), update: (r, p) => writes.push(['u', r, p]), set: (r, p) => writes.push(['s', r, p]) };
      const out = await fn(tx);
      for (const [k, r, p] of writes) {
        const key = r.col + '/' + r.id;
        if (k === 's') store[key] = p;
        else { if (!store[key]) throw new Error('update of missing doc ' + key); for (const [path, v] of Object.entries(p)) setPath(store[key], path, v); }
      }
      return out;
    },
  };
  return db;
}

const set = (reps, rir = 1, weight = 100) => ({ reps, weight, rir });
const wk = (uid, date, sets, createdAt) => ({ uid, date, createdAt, exercises: [{ name: 'Bench Press', sets }] });
const baseDuel = (o = {}) => ({ challengerId: 'A', defenderId: 'B', status: 'active', startDate: '2026-10-15', endDate: '2026-10-22',
  spec: { domain: 'strength', exercise: 'Bench Press', metric: 'total_sets', minRIR: 2, durationDays: 7, minSessions: 1, minWeightPct: 0 },
  challengerStreak: 999, defenderStreak: 999, ...o });
const seed = (duel, users = {}, workouts = []) => ({ docs: {
  'duels/d1': duel,
  'users/A': { displayName: 'Alice', auraPoints: 100, duels: { activeDuelId: 'd1', streak: 0, wins: 0 }, ...users.A },
  'users/B': { displayName: 'Bob', auraPoints: 100, duels: { activeDuelId: 'd1', streak: 0, wins: 0 }, ...users.B },
}, workouts });
const run = (db, over = {}) => settleDuel({ db, duelId: 'd1', caller: 'A', now: NOW, adminUids: ['ADMIN'], ...over });
const W = (uid, n, date = '2026-10-18') => wk(uid, date, Array.from({ length: n }, () => set(5)));

{ // happy path: challenger more sets
  const db = makeDb(seed(baseDuel(), {}, [W('A', 5), W('B', 2)]));
  const r = await run(db);
  check('winner is higher score', [r.resolved, r.winnerId, r.loserId, r.challengerScore, r.defenderScore], [true, 'A', 'B', 5, 2]);
  check('AP transferred from users docs streak (999 on duel ignored)', [r.apWager, db.store['users/A'].auraPoints, db.store['users/B'].auraPoints], [10, 110, 90]);
  check('duel complete, both pointers cleared', [db.store['duels/d1'].status, db.store['users/A'].duels.activeDuelId, db.store['users/B'].duels.activeDuelId], ['complete', null, null]);
  check('wins/losses/streak', [db.store['users/A'].duels.wins, db.store['users/A'].duels.streak, db.store['users/B'].duels.losses, db.store['users/B'].duels.streak], [1, 1, 1, 0]);
  check('ledger rows written', Object.keys(db.store).filter((k) => k.startsWith('apEvents/')).length, 2);
  const again = await run(db, { caller: 'B' });
  check('second call (other participant) is idempotent', [again.alreadyResolved, db.store['users/A'].auraPoints, db.store['users/B'].auraPoints], [true, 110, 90]);
}
{ const db = makeDb(seed(baseDuel(), {}, [W('A', 1)]));
  check('stranger refused', await code(run(db, { caller: 'Z' })), 'permission-denied');
  check('unauthenticated refused', await code(run(db, { caller: null })), 'unauthenticated');
  check('admin allowed', (await run(db, { caller: 'ADMIN' })).resolved, true); }
{ const db = makeDb(seed(baseDuel()));
  check('bad duelId', await code(run(db, { duelId: 'a/b' })), 'invalid-argument');
  check('missing duel', await code(run(db, { duelId: 'nope' })), 'not-found'); }
{ const db = makeDb(seed(baseDuel()));
  check('not ended in UTC-12 yet', await code(run(db, { now: Date.parse('2026-10-23T11:00:00Z') })), 'failed-precondition');
  check('ended after UTC-12 midnight', await code(run(db, { now: Date.parse('2026-10-23T12:00:00Z') })), 'no error'); }
{ for (const [n, d] of [['pending', { status: 'pending' }], ['self duel', { defenderId: 'A' }], ['bad metric', { spec: { ...baseDuel().spec, metric: 'x' } }],
    ['bad dates', { endDate: '2026-10-14' }], ['huge window', { endDate: '2027-10-22' }], ['dotted country id', { targetCountryId: 'a.b', targetContinentKey: 'EU' }]]) {
    check('refuses ' + n, await code(run(makeDb(seed(baseDuel(d))))), 'failed-precondition'); } }
{ // AP never negative
  const db = makeDb(seed(baseDuel(), { B: { auraPoints: 4 } }, [W('A', 3)]));
  const r = await run(db);
  check('loser AP floored at 0, winner still gains', [db.store['users/B'].auraPoints, db.store['users/A'].auraPoints, r.apLost], [0, 110, 4]); }
{ // forged workouts: back-dated after window, pre-logged before start, other users
  const late = W('B', 9); late.createdAt = Date.parse('2026-10-24T00:00:00Z');
  const early = W('B', 9); early.createdAt = Date.parse('2026-10-10T00:00:00Z');
  const ok = W('A', 1); ok.createdAt = { toMillis: () => Date.parse('2026-10-18T10:00:00Z') };
  const db = makeDb(seed(baseDuel(), {}, [late, early, ok, W('C', 50)]));
  const r = await run(db);
  check('late/early/third-party workouts ignored', [r.challengerScore, r.defenderScore], [1, 0]); }
{ // forfeit
  const db = makeDb(seed(baseDuel({ spec: { ...baseDuel().spec, minSessions: 2 } }), {}, [W('A', 3, '2026-10-17'), W('A', 3, '2026-10-18'), W('B', 9, '2026-10-18')]));
  const r = await run(db);
  check('opponent with too few sessions forfeits', [r.winnerId, r.defenderScore], ['A', -1]); }
{ // trophy handling
  const trophy1 = { slot: 'weapon', name: "Challenger's Mark", tier: 1 };
  const db = makeDb(seed(baseDuel(), { A: { duels: { wins: 4, streak: 0 }, inventory: { weapon: null } }, B: { inventory: { weapon: trophy1 } } }, [W('A', 3)]));
  const r = await run(db);
  check('5th win grants trophy, loser trophy removed', [r.trophyTier, db.store['users/A'].inventory.weapon.name, db.store['users/B'].inventory.weapon], [1, "Challenger's Mark", null]);
  const other = { slot: 'weapon', name: 'Boss Blade', tier: 3 };
  const db2 = makeDb(seed(baseDuel(), { A: { duels: { wins: 4 }, inventory: { weapon: other } }, B: { inventory: { weapon: other } } }, [W('A', 3)]));
  await run(db2);
  check('non-duel weapons untouched on both sides', [db2.store['users/A'].inventory.weapon.name, db2.store['users/B'].inventory.weapon.name], ['Boss Blade', 'Boss Blade']); }
{ // territory
  const db = makeDb(seed(baseDuel({ targetCountryId: 'GB', targetContinentKey: 'EU' }), { A: { shadowArmy: { countries: { GB: { soldiers: 10 } } } }, B: { shadowArmy: { countries: { GB: { soldiers: 20 } } } } }, [W('A', 3)]));
  const r = await run(db);
  check('territory transfers to winning challenger', [r.territoryResult.countryTransfers, db.store['users/B'].shadowArmy.countries.GB.ownerUid], [true, 'A']); }
{ // concurrent double settle
  const db = makeDb(seed(baseDuel(), {}, [W('A', 3)]));
  const [x, y] = await Promise.all([run(db), run(db, { caller: 'B' })]);
  check('concurrent calls pay AP once', [db.store['users/A'].auraPoints, db.store['users/B'].auraPoints], [110, 90]); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
