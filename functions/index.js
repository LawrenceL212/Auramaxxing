/* ═══════════════════════════════════════════════════════════════════════════
   AURAMAXXING TRUSTED BACKEND — PHASE 1, SHADOW MODE

   The server observes. It does not decide anything the user sees.

   This deployment writes to exactly one collection: `apShadow`. It never
   touches auraPoints, hunterXP, hunterLevel, stats, inventory or duels, and
   there is no code path here that could — the only writer helper is
   writeShadow(), and it is hard-wired to SHADOW_COLLECTION.

   The client remains authoritative for AP throughout Phase 1.
   ═══════════════════════════════════════════════════════════════════════════ */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import {
  SHADOW_COLLECTION, VERDICT, shadowLevelUp, shadowPR, shadowTrial, shadowRaid,
  compare, shadowRecord, idempotencyKey,
} from './src/shadow.js';

initializeApp();
const db = getFirestore();

// Low traffic, user-initiated. Small instances, tight concurrency cap so a
// runaway loop cannot scale into a bill.
setGlobalOptions({ region: 'us-central1', maxInstances: 10, memory: '256MiB' });

const FUNCTION_VERSION = 'phase1-shadow.1';

/* ── The only writer in this deployment ───────────────────────────────── */

/**
 * Idempotent by construction: the shadow document ID *is* the idempotency key,
 * so a retry collides on create() and is recorded as a duplicate rather than
 * inserted twice. No transaction needed — Firestore create() is atomic.
 */
async function writeShadow(shadow, comparison) {
  const ref = db.collection(SHADOW_COLLECTION).doc(shadow.idempotencyKey);
  const record = shadowRecord(shadow, comparison, { functionVersion: FUNCTION_VERSION });
  try {
    await ref.create({ ...record, timestamp: FieldValue.serverTimestamp() });
    return { written: true, duplicate: false, id: ref.id };
  } catch (err) {
    if (err && err.code === 6 /* ALREADY_EXISTS */) {
      // Count the retry without mutating the original observation.
      await ref.set({
        retryCount: FieldValue.increment(1),
        lastRetryAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { written: false, duplicate: true, id: ref.id };
    }
    throw err;
  }
}

/* ── Reading the authoritative history ────────────────────────────────── */

async function loadHistory(uid) {
  const snap = await db.collection('workouts').where('uid', '==', uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * EXERCISES_ALL as the client assembles it: BASE_EXERCISES merged with the
 * user's own customExercises. BASE_EXERCISES is shipped alongside the functions
 * so the server is not parsing the client HTML at runtime.
 */
async function loadExercisesAll(uid) {
  const { BASE_EXERCISES } = await import('./src/base-exercises.js');
  const all = { ...BASE_EXERCISES };
  const snap = await db.collection('customExercises').where('uid', '==', uid).get();
  for (const d of snap.docs) {
    const ex = d.data();
    if (ex && ex.name) all[ex.name] = ex;
  }
  return all;
}

/**
 * What the client actually recorded for this event, read from the existing
 * apEvents ledger. Returns null when the client wrote nothing, which is itself
 * a finding rather than an error.
 */
async function loadClientObservation(uid, kind, since) {
  let q = db.collection('apEvents').where('uid', '==', uid);
  if (since) q = q.where('timestamp', '>=', since);
  const snap = await q.get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const match = {
    'level-up': (r) => /level-up/i.test(r.reason || ''),
    pr: (r) => /^pr xp/i.test(r.reason || ''),
    trial: (r) => /trial/i.test(r.reason || ''),
    raid: (r) => /raid/i.test(r.reason || ''),
  }[kind];
  const hit = rows.filter(match || (() => false))
    .sort((a, b) => (b.timestamp?.toMillis?.() ?? 0) - (a.timestamp?.toMillis?.() ?? 0))[0];
  return hit || null;
}

async function observeAndRecord(shadow, uid, kind, since) {
  const clientObserved = await loadClientObservation(uid, kind, since);
  const comparison = compare(shadow, clientObserved);
  comparison.clientAmount = clientObserved ? Number(clientObserved.amount) : null;
  const result = await writeShadow(shadow, comparison);
  return {
    shadow: { kind: shadow.kind, amount: shadow.amount, eligible: shadow.eligible },
    comparison, ...result,
  };
}

/* ── A1 · workout save → level-up AP ──────────────────────────────────────
   Triggered rather than called, so it observes real saves without the client
   needing to know the server exists.                                       */

export const shadowOnWorkoutCreate = onDocumentCreated('workouts/{workoutId}', async (event) => {
  const data = event.data?.data();
  const uid = data?.uid;
  if (!uid) return;
  const workoutId = event.params.workoutId;
  try {
    const [workouts, exercisesAll] = await Promise.all([
      loadHistory(uid), loadExercisesAll(uid),
    ]);
    const shadow = shadowLevelUp({ uid, workoutId, workouts, exercisesAll });
    // The client writes its ledger entry moments after the workout doc, so look
    // back a little rather than requiring the two to be simultaneous.
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const out = await observeAndRecord(shadow, uid, 'level-up', since);
    console.log('[shadow:level-up]', JSON.stringify({ uid, workoutId, ...out }));
  } catch (err) {
    // A shadow failure must never affect the user's save.
    console.error('[shadow:level-up] failed', workoutId, err);
  }
});

/* ── Callables ────────────────────────────────────────────────────────────
   Authenticated caller only, and the uid is taken from the verified token -
   never from the payload.                                                  */

function callerUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required.');
  return uid;
}

export const shadowPrAward = onCall(async (request) => {
  const uid = callerUid(request);
  const { workoutId, exercise } = request.data || {};
  if (!workoutId || !exercise) {
    throw new HttpsError('invalid-argument', 'workoutId and exercise are required.');
  }
  const [workouts, exercisesAll] = await Promise.all([
    loadHistory(uid), loadExercisesAll(uid),
  ]);
  const workout = workouts.find((w) => w.id === workoutId);
  if (!workout) throw new HttpsError('not-found', 'Workout not found for this user.');
  const ex = (workout.exercises || []).find((e) => e.name === exercise);
  if (!ex) throw new HttpsError('not-found', 'Exercise not present in that workout.');

  const bwSnap = await db.collection('bodyweight').where('uid', '==', uid).get();
  const bw = bwSnap.docs.map((d) => d.data())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const userSnap = await db.collection('users').doc(uid).get();

  const shadow = shadowPR({
    uid, workoutId, exercise, sets: ex.sets,
    bodyweightKg: bw?.kg ?? null,
    gender: userSnap.data()?.bodyType === 'female' ? 'female' : 'male',
    strengthTierResolver: null,   // Phase 1: falls back to FLAT_PR_XP, reported as such
    exercisesAll,
  });
  return observeAndRecord(shadow, uid, 'pr', new Date(Date.now() - 10 * 60 * 1000));
});

export const shadowTrialAward = onCall(async (request) => {
  const uid = callerUid(request);
  const { classKey, tierIndex, trialStartDate } = request.data || {};
  if (!classKey || tierIndex == null || !trialStartDate) {
    throw new HttpsError('invalid-argument', 'classKey, tierIndex and trialStartDate are required.');
  }
  const workouts = await loadHistory(uid);
  const shadow = shadowTrial({ uid, classKey, tierIndex, trialStartDate, workouts });
  return observeAndRecord(shadow, uid, 'trial', new Date(Date.now() - 10 * 60 * 1000));
});

export const shadowRaidClaim = onCall(async (request) => {
  const uid = callerUid(request);
  const { weekKey, myDamage, totalDamage, rewardPool, cleared } = request.data || {};
  const userSnap = await db.collection('users').doc(uid).get();
  const shadow = shadowRaid({
    uid, weekKey,
    serverWeekKey: serverWeekKeyNow(),
    myDamage: Number(myDamage) || 0,
    totalDamage: Number(totalDamage) || 0,
    rewardPool: Number(rewardPool) || 0,
    cleared: !!cleared,
    alreadyClaimedWeek: userSnap.data()?.lastRaidClaimWeek ?? null,
  });
  return observeAndRecord(shadow, uid, 'raid', new Date(Date.now() - 10 * 60 * 1000));
});

/** Week key computed on the server clock, mirroring the client's format. */
function serverWeekKeyNow() {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;               // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  const iso = d.toISOString().slice(0, 10);
  return `aura_raid_cleared_${iso}`;
}

/* ── Reporting ────────────────────────────────────────────────────────────
   Reads the shadow collection and returns the agreement summary. Read-only.  */

export const shadowReport = onCall(async (request) => {
  callerUid(request);
  const snap = await db.collection(SHADOW_COLLECTION).get();
  const rows = snap.docs.map((d) => d.data());
  const byVerdict = {};
  for (const v of Object.values(VERDICT)) byVerdict[v] = 0;
  let retries = 0;
  for (const r of rows) {
    if (r.verdict) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
    retries += r.retryCount || 0;
  }
  const decided = rows.filter((r) => r.verdict).length;
  return {
    total: rows.length,
    decided,
    agreementPct: decided ? +((byVerdict[VERDICT.AGREE] / decided) * 100).toFixed(2) : null,
    byVerdict,
    duplicateRetries: retries,
    functionVersion: FUNCTION_VERSION,
  };
});

export { idempotencyKey };
