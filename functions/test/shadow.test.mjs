/* Phase 1 shadow-mode tests. Pure — no Firebase, no network.
   Run: npm test   (node --test) */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { BASE_EXERCISES } from '../src/base-exercises.js';
import { createFormulas } from '../src/formulas.generated.js';
import {
  shadowLevelUp, shadowPR, shadowTrial, shadowRaid,
  compare, shadowRecord, idempotencyKey, orderedHistory, replayTotalXP,
  VERDICT, SHADOW_COLLECTION,
} from '../src/shadow.js';

const EX = { ...BASE_EXERCISES };
const F = createFormulas({ EXERCISES_ALL: EX });
const UID = 'test-uid';

/** A resistance session heavy enough to move the needle. */
const session = (id, date, sets = 5, weight = 100, reps = 5) => ({
  id, uid: UID, date,
  exercises: [{ name: 'Barbell Bench Press',
    sets: Array.from({ length: sets }, () => ({ reps, weight, rir: 1 })) }],
});

describe('extracted formulas behave as the client does', () => {
  test('level thresholds and AP table', () => {
    assert.equal(F.xpForLevel(1), 50);
    assert.equal(F.levelFromTotalXP(0), 1);
    assert.equal(F.apForLevel(1), 10);
    assert.equal(F.apForLevel(6), 15);
    assert.equal(F.apForLevel(31), 30);
    assert.equal(F.apForLevel(200), 70);
  });
  test('levelFromTotalXP is monotonic and bounded', () => {
    let prev = 1;
    for (const xp of [0, 50, 500, 5000, 50000, 5_000_000]) {
      const l = F.levelFromTotalXP(xp);
      assert.ok(l >= prev, `level must not decrease at ${xp}`);
      assert.ok(l <= 500, 'level is capped at 500');
      prev = l;
    }
  });
  test('a known exercise produces XP', () => {
    const { generalXP } = F.computeWorkoutXP(session('w', '2026-01-01').exercises);
    assert.ok(generalXP > 0, 'bench press session should yield XP');
  });
});

describe('A1 · level-up shadow', () => {
  test('ordinary workout with no level crossing awards nothing', () => {
    // Deep history, so one more small session cannot cross a level boundary.
    const history = Array.from({ length: 60 }, (_, i) =>
      session(`w${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, 5));
    const tiny = { id: 'tiny', uid: UID, date: '2026-02-01',
      exercises: [{ name: 'Barbell Bench Press', sets: [{ reps: 1, weight: 20, rir: 4 }] }] };
    const r = shadowLevelUp({ uid: UID, workoutId: 'tiny',
      workouts: [...history, tiny], exercisesAll: EX });
    assert.equal(r.eligible, false);
    assert.equal(r.amount, 0);
    assert.equal(r.detail.levelBefore, r.detail.levelAfter);
  });

  test('first workout crosses level 1 → 2 and awards that level only', () => {
    // Level 2 needs 50 XP and a 5x100kg bench set is worth ~1.7, so 30 sets is
    // the smallest round volume that provably crosses the boundary.
    const w = session('w1', '2026-01-01', 30, 100, 5);
    const r = shadowLevelUp({ uid: UID, workoutId: 'w1', workouts: [w], exercisesAll: EX });
    assert.equal(r.detail.levelBefore, 1);
    assert.ok(r.detail.levelAfter >= 2, 'a large first session should level up');
    const expected = r.detail.levels.reduce((a, l) => a + l.ap, 0);
    assert.equal(r.amount, expected);
    assert.ok(r.amount > 0);
  });

  test('AP equals the sum of apForLevel across every level crossed', () => {
    const w = session('big', '2026-01-01', 400, 140, 5);
    const r = shadowLevelUp({ uid: UID, workoutId: 'big', workouts: [w], exercisesAll: EX });
    let manual = 0;
    for (let l = r.detail.levelBefore + 1; l <= r.detail.levelAfter; l++) manual += F.apForLevel(l);
    assert.equal(r.amount, manual, 'multi-level crossings must sum every level');
  });

  test('recomputes from history, never from a client-supplied level', () => {
    const w = session('w1', '2026-01-01', 30);
    // A profile claiming level 99 must not influence the result.
    const r = shadowLevelUp({ uid: UID, workoutId: 'w1', workouts: [w], exercisesAll: EX,
      profile: { hunterLevel: 99, hunterXP: 999999, auraPoints: 999999 } });
    assert.equal(r.detail.levelBefore, 1, 'server ignores stored level and replays history');
  });

  test('other users’ workouts are excluded from the replay', () => {
    const mine = session('m1', '2026-01-01', 8);
    const theirs = { ...session('t1', '2026-01-01', 60), uid: 'someone-else' };
    const solo = shadowLevelUp({ uid: UID, workoutId: 'm1', workouts: [mine], exercisesAll: EX });
    const mixed = shadowLevelUp({ uid: UID, workoutId: 'm1', workouts: [mine, theirs], exercisesAll: EX });
    assert.deepEqual(mixed.detail, solo.detail);
  });

  test('unknown workout is reported, not thrown', () => {
    const r = shadowLevelUp({ uid: UID, workoutId: 'nope', workouts: [], exercisesAll: EX });
    assert.equal(r.eligible, false);
    assert.match(r.reason, /not found/i);
  });
});

describe('A2 · PR shadow', () => {
  test('computes e1RM with the client formula and awards the flat fallback', () => {
    const r = shadowPR({ uid: UID, workoutId: 'w1', exercise: 'Barbell Bench Press',
      sets: [{ reps: 5, weight: 100 }, { reps: 3, weight: 110 }],
      bodyweightKg: 80, gender: 'male', strengthTierResolver: null, exercisesAll: EX });
    assert.equal(r.eligible, true);
    assert.equal(r.detail.e1rm, Math.max(F.epley1RM(100, 5), F.epley1RM(110, 3)));
    assert.equal(r.amount, F.FLAT_PR_XP);
  });
  test('tiered award uses TIER_XP when a tier resolves', () => {
    const r = shadowPR({ uid: UID, workoutId: 'w1', exercise: 'Barbell Bench Press',
      sets: [{ reps: 1, weight: 200 }], bodyweightKg: 80, gender: 'male',
      strengthTierResolver: () => 'Elite', exercisesAll: EX });
    assert.equal(r.amount, F.TIER_XP.Elite);
  });
  test('sets with no load are not a PR', () => {
    const r = shadowPR({ uid: UID, workoutId: 'w1', exercise: 'Barbell Bench Press',
      sets: [{ reps: 10, weight: 0 }], bodyweightKg: 80, gender: 'male',
      strengthTierResolver: null, exercisesAll: EX });
    assert.equal(r.eligible, false);
    assert.equal(r.amount, 0);
  });
});

describe('A3 · class trial shadow', () => {
  const hist = (n) => Array.from({ length: n }, (_, i) =>
    session(`t${i}`, `2026-03-${String(i + 2).padStart(2, '0')}`));
  test('below the session threshold awards nothing', () => {
    const r = shadowTrial({ uid: UID, classKey: 'monarch', tierIndex: 0,
      trialStartDate: '2026-03-01', workouts: hist(4) });
    assert.equal(r.eligible, false);
    assert.equal(r.amount, 0);
  });
  test('at the threshold awards 200 + tierIndex*150', () => {
    const r0 = shadowTrial({ uid: UID, classKey: 'monarch', tierIndex: 0,
      trialStartDate: '2026-03-01', workouts: hist(5) });
    assert.equal(r0.amount, 200);
    const r2 = shadowTrial({ uid: UID, classKey: 'monarch', tierIndex: 2,
      trialStartDate: '2026-03-01', workouts: hist(9) });
    assert.equal(r2.amount, 500);
  });
  test('sessions before the trial window do not count', () => {
    const before = Array.from({ length: 10 }, (_, i) => session(`b${i}`, '2026-01-05'));
    const r = shadowTrial({ uid: UID, classKey: 'monarch', tierIndex: 0,
      trialStartDate: '2026-03-01', workouts: before });
    assert.equal(r.eligible, false);
  });
});

describe('A4 · raid reward shadow', () => {
  const base = { uid: UID, myDamage: 250, totalDamage: 1000, rewardPool: 400, cleared: true };
  test('share is proportional to contribution', () => {
    const r = shadowRaid({ ...base, serverWeekKey: 'wk1', alreadyClaimedWeek: null });
    assert.equal(r.amount, 100);
    assert.equal(r.eligible, true);
  });
  test('an unc leared raid awards nothing', () => {
    const r = shadowRaid({ ...base, cleared: false, serverWeekKey: 'wk1', alreadyClaimedWeek: null });
    assert.equal(r.amount, 0);
  });
  test('already claimed this week awards nothing', () => {
    const r = shadowRaid({ ...base, serverWeekKey: 'wk1', alreadyClaimedWeek: 'wk1' });
    assert.equal(r.eligible, false);
  });
  test('a client week key that disagrees with the server is rejected', () => {
    const r = shadowRaid({ ...base, weekKey: 'wk-forged', serverWeekKey: 'wk1',
      alreadyClaimedWeek: null });
    assert.equal(r.eligible, false);
    assert.match(r.reason, /week key/i);
    assert.match(r.idempotencyKey, /wk1$/, 'key must use the SERVER week');
  });
  test('a zero total does not divide by zero', () => {
    const r = shadowRaid({ ...base, totalDamage: 0, serverWeekKey: 'wk1', alreadyClaimedWeek: null });
    assert.ok(Number.isFinite(r.amount));
  });
});

describe('idempotency keys', () => {
  test('deterministic across repeated calls', () => {
    const a = idempotencyKey('level-up', { uid: UID, workoutId: 'w1' });
    const b = idempotencyKey('level-up', { uid: UID, workoutId: 'w1' });
    assert.equal(a, b);
  });
  test('a retry of the same event yields the same key', () => {
    const w = session('w1', '2026-01-01', 30);
    const first = shadowLevelUp({ uid: UID, workoutId: 'w1', workouts: [w], exercisesAll: EX });
    const retry = shadowLevelUp({ uid: UID, workoutId: 'w1', workouts: [w], exercisesAll: EX });
    assert.equal(first.idempotencyKey, retry.idempotencyKey);
    assert.equal(first.amount, retry.amount, 'retry must also be deterministic in amount');
  });
  test('distinct events never collide', () => {
    const keys = new Set([
      idempotencyKey('level-up', { uid: UID, workoutId: 'w1' }),
      idempotencyKey('level-up', { uid: UID, workoutId: 'w2' }),
      idempotencyKey('level-up', { uid: 'other', workoutId: 'w1' }),
      idempotencyKey('pr', { uid: UID, workoutId: 'w1', exercise: 'Squat' }),
      idempotencyKey('pr', { uid: UID, workoutId: 'w1', exercise: 'Bench' }),
      idempotencyKey('trial', { uid: UID, classKey: 'm', tierIndex: 0 }),
      idempotencyKey('trial', { uid: UID, classKey: 'm', tierIndex: 1 }),
      idempotencyKey('raid', { uid: UID, weekKey: 'wk1' }),
      idempotencyKey('raid', { uid: UID, weekKey: 'wk2' }),
    ]);
    assert.equal(keys.size, 9);
  });
  test('keys are safe as Firestore document ids', () => {
    const k = idempotencyKey('pr', { uid: 'u/1', workoutId: 'w 1', exercise: 'Bench/Press #2' });
    assert.ok(!k.includes('/'), 'no path separators');
    assert.ok(k.length < 1500);
  });
  test('unknown kinds are rejected rather than silently keyed', () => {
    assert.throws(() => idempotencyKey('mystery', {}), /unknown shadow event kind/);
  });
});

describe('comparison classifies rather than discards', () => {
  const award = { eligible: true, amount: 25 };
  test('exact agreement', () => {
    assert.equal(compare(award, { amount: 25 }).verdict, VERDICT.AGREE);
  });
  test('amount mismatch keeps the signed delta', () => {
    const c = compare(award, { amount: 10 });
    assert.equal(c.verdict, VERDICT.AMOUNT_MISMATCH);
    assert.equal(c.delta, 15);
  });
  test('client wrote nothing but server would award', () => {
    assert.equal(compare(award, null).verdict, VERDICT.CLIENT_MISSING);
  });
  test('client awarded but server found no eligibility', () => {
    const c = compare({ eligible: false, amount: 0 }, { amount: 40 });
    assert.equal(c.verdict, VERDICT.SERVER_MISSING);
    assert.equal(c.delta, -40);
  });
  test('both declined is agreement, not a mismatch', () => {
    assert.equal(compare({ eligible: false, amount: 0 }, null).verdict, VERDICT.AGREE);
  });
});

describe('the shadow record carries no authoritative value', () => {
  test('never contains a balance or gameplay field', () => {
    const s = shadowLevelUp({ uid: UID, workoutId: 'w1',
      workouts: [session('w1', '2026-01-01', 30)], exercisesAll: EX });
    const rec = shadowRecord(s, compare(s, null));
    assert.equal(rec.source, 'shadow');
    for (const forbidden of ['auraPoints', 'hunterXP', 'hunterLevel', 'stats',
                             'inventory', 'duels', 'balance']) {
      assert.ok(!(forbidden in rec), `${forbidden} must not appear in a shadow record`);
    }
    assert.equal(SHADOW_COLLECTION, 'apShadow', 'shadow writes must not target apEvents');
  });
});
