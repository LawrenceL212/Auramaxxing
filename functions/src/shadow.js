/* ═══════════════════════════════════════════════════════════════════════════
   AP SHADOW COMPUTATION — pure, no Firebase, no I/O.

   Given the authoritative raw history and an event, decide what AP the server
   WOULD award. Phase 1 records that decision and nothing else: no balance is
   written, no gameplay value is touched.

   Everything here recomputes from the raw history. It never reads a
   client-supplied amount, level, balance or eligibility flag — that is the
   whole point of shadow mode, and the reason this module takes `workouts`
   rather than `profile.hunterXP`.

   Kept free of firebase-admin so it can be unit-tested directly under node and
   run against the browser's own formulas in the parity harness.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createFormulas } from './formulas.generated.js';

/** Shadow records are written here, NOT into apEvents. */
export const SHADOW_COLLECTION = 'apShadow';

export const VERDICT = {
  AGREE: 'agree',
  AMOUNT_MISMATCH: 'amount-mismatch',
  ELIGIBILITY_MISMATCH: 'eligibility-mismatch',
  CLIENT_MISSING: 'client-missing',      // server would award, client wrote nothing
  SERVER_MISSING: 'server-missing',      // client awarded, server would not
  DUPLICATE: 'duplicate',                // idempotency key already recorded
};

/* ── Idempotency ──────────────────────────────────────────────────────────
   Keys are derived only from stable identity, never from a timestamp, a
   computed amount or anything the caller passes in. A retry of the same real
   event therefore lands on the same key and is rejected as a duplicate, while
   a genuinely different event cannot collide.                              */

export function idempotencyKey(kind, parts) {
  const clean = (v) => String(v ?? '').replace(/[^A-Za-z0-9_.:-]/g, '_');
  switch (kind) {
    case 'level-up':
      // One award per user per workout: the workout is the event.
      return `lvl:${clean(parts.uid)}:${clean(parts.workoutId)}`;
    case 'pr':
      // One award per user per exercise per workout.
      return `pr:${clean(parts.uid)}:${clean(parts.workoutId)}:${clean(parts.exercise)}`;
    case 'trial':
      return `trial:${clean(parts.uid)}:${clean(parts.classKey)}:${clean(parts.tierIndex)}`;
    case 'raid':
      // The week key is the natural idempotency boundary and already exists in
      // the schema as lastRaidClaimWeek.
      return `raid:${clean(parts.uid)}:${clean(parts.weekKey)}`;
    default:
      throw new Error(`unknown shadow event kind: ${kind}`);
  }
}

/* ── Helpers over the authoritative history ───────────────────────────── */

/** Workouts belonging to a user, oldest first. Defensive about shape. */
export function orderedHistory(workouts, uid) {
  return (workouts || [])
    .filter((w) => w && w.uid === uid && Array.isArray(w.exercises))
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
                    String(a.id ?? '').localeCompare(String(b.id ?? '')));
}

/**
 * Replay total general XP from raw history.
 *
 * NOTE — a known and deliberate Phase 1 limitation. The client applies two
 * multipliers at award time that are NOT recoverable from stored data:
 *   · a duel XP boost / defeat debuff, which depends on where the duel windows
 *     sat on the day of the session, and
 *   · a streak-rank multiplier, which depends on the streak as it stood then.
 * Neither is persisted per workout, so a faithful replay is impossible without
 * a schema addition. The shadow computation therefore reports the UNMULTIPLIED
 * baseline and flags `multipliersUnavailable`, rather than guessing and
 * manufacturing agreement. Phase 2 must persist the applied multiplier on the
 * workout for this to become exact.
 */
export function replayTotalXP(history, formulas) {
  let total = 0;
  const perWorkout = [];
  for (const w of history) {
    const { generalXP } = formulas.computeWorkoutXP(w.exercises);
    const xp = Math.round(generalXP * 10) / 10;
    total = Math.round((total + xp) * 10) / 10;
    perWorkout.push({ id: w.id, date: w.date, generalXP: xp, cumulative: total });
  }
  return { totalXP: total, perWorkout };
}

/** AP owed for crossing from `fromLevel` to `toLevel`, using the client's table. */
export function apForLevelSpan(fromLevel, toLevel, formulas) {
  let ap = 0;
  const levels = [];
  for (let l = fromLevel + 1; l <= toLevel; l++) {
    const amount = formulas.apForLevel(l);
    ap += amount;
    levels.push({ level: l, ap: amount });
  }
  return { ap, levels };
}

/* ── A1 · level-up AP from a workout save ─────────────────────────────── */

export function shadowLevelUp({ uid, workoutId, workouts, exercisesAll }) {
  const formulas = createFormulas({ EXERCISES_ALL: exercisesAll });
  const history = orderedHistory(workouts, uid);
  const idx = history.findIndex((w) => w.id === workoutId);
  if (idx === -1) {
    return {
      kind: 'level-up', uid, workoutId, eligible: false, amount: 0,
      reason: 'workout not found in authoritative history',
      idempotencyKey: idempotencyKey('level-up', { uid, workoutId }),
    };
  }
  // Replay to just before this workout, then including it. The difference in
  // level is what the award is owed against.
  const before = replayTotalXP(history.slice(0, idx), formulas);
  const after = replayTotalXP(history.slice(0, idx + 1), formulas);
  const levelBefore = formulas.levelFromTotalXP(before.totalXP);
  const levelAfter = formulas.levelFromTotalXP(after.totalXP);
  const { ap, levels } = apForLevelSpan(levelBefore, levelAfter, formulas);

  return {
    kind: 'level-up', uid, workoutId,
    eligible: ap > 0,
    amount: ap,
    idempotencyKey: idempotencyKey('level-up', { uid, workoutId }),
    detail: {
      xpBefore: before.totalXP, xpAfter: after.totalXP,
      levelBefore, levelAfter, levels,
      historyLength: history.length,
      multipliersUnavailable: true,
    },
  };
}

/* ── A2 · PR award ────────────────────────────────────────────────────── */

/**
 * PR XP is awarded per newly-set personal record. The tier table and flat
 * fallback are the client's own constants; the e1RM is recomputed with the
 * client's epley1RM from the stored set, never taken from the client.
 */
export function shadowPR({ uid, workoutId, exercise, sets, bodyweightKg, gender,
                           strengthTierResolver, exercisesAll }) {
  const formulas = createFormulas({ EXERCISES_ALL: exercisesAll });
  const best = (sets || []).reduce((acc, s) => {
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    if (w <= 0 || r <= 0) return acc;
    const e = formulas.epley1RM(w, r);
    return e > acc ? e : acc;
  }, 0);

  // getStrengthTier depends on STRENGTH_STANDARDS, which is a large client
  // table injected by the caller rather than lifted, so the resolver is a
  // parameter. When it cannot classify, the client falls back to FLAT_PR_XP.
  const tier = best > 0 && strengthTierResolver
    ? strengthTierResolver(exercise, best, bodyweightKg, gender)
    : null;
  const amount = tier ? (formulas.TIER_XP[tier] ?? formulas.FLAT_PR_XP) : formulas.FLAT_PR_XP;

  return {
    kind: 'pr', uid, workoutId, exercise,
    eligible: best > 0,
    amount: best > 0 ? amount : 0,
    idempotencyKey: idempotencyKey('pr', { uid, workoutId, exercise }),
    detail: { e1rm: best, tier, bodyweightKg, gender },
  };
}

/* ── A3 · class trial completion ──────────────────────────────────────── */

/** Reward is 200 + tierIndex*150, gated on >= 5 sessions inside the window. */
export function shadowTrial({ uid, classKey, tierIndex, trialStartDate, workouts }) {
  const history = orderedHistory(workouts, uid)
    .filter((w) => String(w.date) >= String(trialStartDate));
  const sessions = history.length;
  const eligible = sessions >= 5;
  const amount = eligible ? 200 + Number(tierIndex) * 150 : 0;
  return {
    kind: 'trial', uid, classKey, tierIndex,
    eligible, amount,
    idempotencyKey: idempotencyKey('trial', { uid, classKey, tierIndex }),
    detail: { sessions, required: 5, trialStartDate },
  };
}

/* ── A4 · raid reward claim ───────────────────────────────────────────── */

/**
 * Share of the reward pool, proportional to the user's own damage. Both the
 * damage figures and the pool are recomputed by the caller from raid state; the
 * week key is validated here rather than accepted from the client.
 */
export function shadowRaid({ uid, weekKey, serverWeekKey, myDamage, totalDamage,
                             rewardPool, cleared, alreadyClaimedWeek }) {
  if (weekKey && serverWeekKey && weekKey !== serverWeekKey) {
    return {
      kind: 'raid', uid, eligible: false, amount: 0,
      reason: 'client week key does not match server week',
      idempotencyKey: idempotencyKey('raid', { uid, weekKey: serverWeekKey }),
      detail: { clientWeekKey: weekKey, serverWeekKey },
    };
  }
  const key = serverWeekKey || weekKey;
  const denom = totalDamage || 1;
  const eligible = !!cleared && alreadyClaimedWeek !== key;
  const amount = eligible ? Math.round((myDamage / denom) * rewardPool) : 0;
  return {
    kind: 'raid', uid,
    eligible, amount,
    idempotencyKey: idempotencyKey('raid', { uid, weekKey: key }),
    detail: { weekKey: key, myDamage, totalDamage: denom, rewardPool, cleared,
              alreadyClaimedWeek },
  };
}

/* ── Comparison ───────────────────────────────────────────────────────── */

/**
 * Compare the server's shadow decision against what the client actually did.
 * Mismatches are classified, never discarded — a mismatch is the finding.
 *
 * `clientObserved` is read from the existing apEvents ledger entry the client
 * writes alongside its AP mutation, or null when the client wrote nothing.
 */
export function compare(shadow, clientObserved) {
  const serverAwarded = !!shadow.eligible && shadow.amount > 0;
  const clientAwarded = !!clientObserved && Number(clientObserved.amount) > 0;

  if (!serverAwarded && !clientAwarded) {
    return { verdict: VERDICT.AGREE, delta: 0, note: 'both declined to award' };
  }
  if (serverAwarded && !clientAwarded) {
    return { verdict: VERDICT.CLIENT_MISSING, delta: shadow.amount,
             note: 'server would award, client recorded nothing' };
  }
  if (!serverAwarded && clientAwarded) {
    return { verdict: VERDICT.SERVER_MISSING, delta: -Number(clientObserved.amount),
             note: 'client awarded, server found no eligibility' };
  }
  const delta = shadow.amount - Number(clientObserved.amount);
  if (delta !== 0) {
    return { verdict: VERDICT.AMOUNT_MISMATCH, delta,
             note: `server ${shadow.amount} vs client ${clientObserved.amount}` };
  }
  return { verdict: VERDICT.AGREE, delta: 0, note: 'exact agreement' };
}

/** The document written to apShadow. Contains no authoritative value. */
export function shadowRecord(shadow, comparison, meta = {}) {
  return {
    source: 'shadow',
    schemaVersion: 1,
    uid: shadow.uid,
    kind: shadow.kind,
    idempotencyKey: shadow.idempotencyKey,
    computedAmount: shadow.amount,
    eligible: !!shadow.eligible,
    reason: shadow.reason ?? null,
    detail: shadow.detail ?? null,
    clientAmount: comparison?.clientAmount ?? null,
    verdict: comparison?.verdict ?? null,
    delta: comparison?.delta ?? null,
    note: comparison?.note ?? null,
    functionVersion: meta.functionVersion ?? null,
    // timestamp is applied by the writer with serverTimestamp()
  };
}
