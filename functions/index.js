'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   resolveGateDuel — trusted settlement for Gate Duels
   ═══════════════════════════════════════════════════════════════════════════

   WHY THIS EXISTS

   Duel settlement writes to BOTH participants' users/{uid} documents: AP
   transfer, win/loss, streak, XP boost, defeat debuff, trophy weapon, and
   shadow-army territory. That is a cross-user write. No Firestore rule can
   authorise it without letting any signed-in Hunter write any other Hunter's
   document, so the client-side version only ever worked for the hardcoded
   admin uid — every normal duel silently failed to settle.

   This function runs with Admin privileges, so `duels` and `users` can stay
   locked down and settlement still completes.

   SAFETY (all enforced in lib/settle-duel.js, tested in
   test/resolve-gate-duel.test.mjs)

   · Only a combatant (or the admin) may call it, and only once the window has
     closed in every timezone (UTC-12 end of endDate).
   · The outcome is computed here from the stored workouts. Nothing numeric
     comes from the request; streaks come from the users' own docs.
   · One transaction reads the duel and both users, re-checks status, and
     writes everything; a repeat call returns the stored result.
   · AP can never go below zero; a non-trophy weapon is never overwritten.

   WHAT IT GUARANTEES OVER THE CLIENT VERSION

   · Atomic. One transaction covers the duel doc and both user docs, so a duel
     can no longer half-settle (the client issued several independent writes).
   · Idempotent. Both participants' clients call this when they next open the
     app after endDate. The transaction re-reads status inside the transaction
     and aborts unless it is still 'active', so AP is transferred exactly once.
     The old client path had no such guard and could double-pay.
   · Deterministic. Scores are computed from the stored workouts, not from
     whichever client happened to trigger it.

   FORMULAS ARE UNCHANGED. Winner selection, AP wager, streak tier, trophy
   tier and territory maths are copied from index.html. See lib/scoring.js and
   lib/rewards.js, which carry mirror-me warnings.

   ONE DELIBERATE BEHAVIOUR CHANGE — documented, not accidental:
   the client called latestBodyweightKg(), which returns *the signed-in user's*
   bodyweight, and used it for BOTH hunters when applying spec.minWeightPct.
   On a server there is no "signed-in user", and worse, replicating it would
   make the result depend on who triggered settlement — the same duel could
   resolve differently. Each hunter's own bodyweight is used instead. This only
   affects duels where minWeightPct > 0; when it is 0 (the default) the gate is
   inert and behaviour is identical.
   ═══════════════════════════════════════════════════════════════════════════ */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { settleDuel, DuelError } = require('./lib/settle-duel');

admin.initializeApp();

/* Hourly push reminders. Read-only except pruning dead device tokens. See PUSH-SETUP.md. */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { runReminders } = require('./send-reminders');
exports.sendReminders = onSchedule({ schedule: '0 * * * *', timeZone: 'Etc/UTC', region: 'us-central1', timeoutSeconds: 300, memory: '256MiB' }, async () => {
  const { FieldValue, FieldPath } = require('firebase-admin/firestore');
  const stats = await runReminders({
    db: admin.firestore(), messaging: admin.messaging(),
    deleteField: () => FieldValue.delete(), fieldPath: (...p) => new FieldPath(...p),
  });
  console.log('sendReminders', JSON.stringify(stats));
});
const db = admin.firestore();

// Same uid index.html treats as admin (may settle any duel).
const ADMIN_UIDS = ['eUtGPwQBcCSO0x3xS3ZGYFGXNIT2'];

exports.resolveGateDuel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to resolve a duel.');
  }
  try {
    const result = await settleDuel({
      db,
      duelId: data && data.duelId,
      caller: context.auth.uid,
      adminUids: ADMIN_UIDS,
      now: Date.now(),
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      warn: (m, e) => functions.logger.warn(m, e),
    });
    if (result.resolved) {
      functions.logger.info('duel settled', {
        duelId: data.duelId, winnerId: result.winnerId, loserId: result.loserId,
        challengerScore: result.challengerScore, defenderScore: result.defenderScore, apWager: result.apWager,
      });
    }
    return result;
  } catch (e) {
    if (e instanceof DuelError) throw new functions.https.HttpsError(e.code, e.message, e.details);
    functions.logger.error('resolveGateDuel failed', e);
    throw new functions.https.HttpsError('internal', 'Could not settle the duel.');
  }
});

/* Goal to plan: Claude writes a proposal; the app checks and previews it. The key is
   a Firebase secret (firebase functions:secrets:set ANTHROPIC_API_KEY). Not saved anywhere. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { generatePlan: runGeneratePlan, askTrainer: runAskTrainer, makeThrottle } = require('./lib/generate-plan');
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const planThrottle = makeThrottle(10);
exports.generatePlan = onCall({ region: 'us-central1', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '256MiB', maxInstances: 5 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to build a plan.');
  if (!planThrottle(request.auth.uid)) throw new HttpsError('resource-exhausted', 'That is enough plans for one hour. Try again later.');
  try {
    return await runGeneratePlan({ data: request.data, apiKey: ANTHROPIC_API_KEY.value(), fetchImpl: fetch });
  } catch (e) {
    if (e && e.code) throw new HttpsError(e.code, e.message);
    functions.logger.error('generatePlan failed', e);
    throw new HttpsError('internal', 'Could not build a plan.');
  }
});

/* Ask your trainer: a question answered from the Hunter's own data. Read-only; the reply is text and an optional
   one-sentence plan change that the Hunter has to tap and then accept. */
const askThrottle = makeThrottle(40);
exports.askTrainer = onCall({ region: 'us-central1', secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to ask the trainer.');
  if (!askThrottle(request.auth.uid)) throw new HttpsError('resource-exhausted', 'That is enough questions for one hour. Try again later.');
  try {
    return await runAskTrainer({ data: request.data, apiKey: ANTHROPIC_API_KEY.value(), fetchImpl: fetch });
  } catch (e) {
    if (e && e.code) throw new HttpsError(e.code, e.message);
    functions.logger.error('askTrainer failed', e);
    throw new HttpsError('internal', 'Could not reach the trainer.');
  }
});
