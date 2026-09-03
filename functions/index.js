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
const { getDuelScore } = require('./lib/scoring');
const { getDuelStreakTier, getDuelTrophyTier, DUEL_TROPHY_ITEMS } = require('./lib/rewards');

admin.initializeApp();
const db = admin.firestore();

const todayStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (n) => todayStr(new Date(Date.now() + n * 86400000));

/** Most recent bodyweight for a hunter: weight-widget entry, else profile. */
async function bodyweightFor(uid, userData) {
  try {
    const snap = await db.collection('bodyweight')
      .where('uid', '==', uid).orderBy('date', 'desc').limit(1).get();
    if (!snap.empty) {
      const bw = Number(snap.docs[0].data().weight);
      if (bw) return bw;
    }
  } catch (e) {
    functions.logger.warn('bodyweight lookup failed for ' + uid, e);
  }
  return Number(userData && userData.bodyweightKg) || null;
}

exports.resolveGateDuel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to resolve a duel.');
  }
  const duelId = data && data.duelId;
  if (!duelId || typeof duelId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'duelId is required.');
  }

  const caller = context.auth.uid;
  const duelRef = db.collection('duels').doc(duelId);
  const preSnap = await duelRef.get();
  if (!preSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'That duel does not exist.');
  }
  const duel = preSnap.data();

  // Only the two combatants may trigger settlement.
  if (caller !== duel.challengerId && caller !== duel.defenderId) {
    throw new functions.https.HttpsError('permission-denied', 'You are not in this duel.');
  }
  if (duel.status === 'complete') {
    // Settled by the other participant a moment ago — hand back enough for the
    // client to render the same result modal rather than showing nothing.
    return {
      alreadyResolved: true,
      winnerId: duel.winnerId, loserId: duel.loserId,
      challengerScore: duel.challengerScore, defenderScore: duel.defenderScore,
      apWager: duel.apWager,
      winnerStreak: duel.winnerStreak, winnerTotalWins: duel.winnerTotalWins,
      territoryResult: duel.territoryResult || null,
    };
  }
  if (duel.status !== 'active') {
    throw new functions.https.HttpsError('failed-precondition',
      `A duel can only be settled once its terms are set (status is "${duel.status}").`);
  }
  if (!duel.endDate || duel.endDate >= todayStr()) {
    throw new functions.https.HttpsError('failed-precondition', 'This duel has not ended yet.');
  }

  const { startDate, endDate, spec, challengerId, defenderId,
          challengerStreak = 0, defenderStreak = 0,
          targetCountryId, targetContinentKey } = duel;

  // ── gather inputs (outside the transaction; all read-only) ──
  const [cUserSnap, dUserSnap, customSnap] = await Promise.all([
    db.collection('users').doc(challengerId).get(),
    db.collection('users').doc(defenderId).get(),
    db.collection('customExercises').get(),
  ]);
  const cUser = cUserSnap.data() || {};
  const dUser = dUserSnap.data() || {};

  const customDefs = {};
  customSnap.forEach((doc) => {
    const c = doc.data();
    if (c && c.name) {
      customDefs[c.name] = { timed: !!c.timed, timedUnit: c.timedUnit, intent: c.intent };
    }
  });

  // Workouts inside the duel window, both hunters.
  const wSnap = await db.collection('workouts')
    .where('date', '>=', startDate).where('date', '<=', endDate).get();
  const duelWorkouts = wSnap.docs.map((d) => d.data())
    .filter((w) => w.uid === challengerId || w.uid === defenderId);

  const [cBw, dBw] = await Promise.all([
    bodyweightFor(challengerId, cUser),
    bodyweightFor(defenderId, dUser),
  ]);

  const challengerScore = getDuelScore(spec, duelWorkouts, challengerId, cBw, customDefs);
  const defenderScore = getDuelScore(spec, duelWorkouts, defenderId, dBw, customDefs);

  // ── winner selection — identical to index.html ──
  const challengerForfeited = challengerScore < 0;
  const defenderForfeited = defenderScore < 0;
  let winnerId, loserId;
  if (challengerForfeited && !defenderForfeited) { loserId = challengerId; winnerId = defenderId; }
  else if (defenderForfeited && !challengerForfeited) { loserId = defenderId; winnerId = challengerId; }
  else {
    // best_pace is already inverted by getDuelScore, so higher always wins
    winnerId = challengerScore >= defenderScore ? challengerId : defenderId;
    loserId = winnerId === challengerId ? defenderId : challengerId;
  }

  const challengerWon = winnerId === challengerId;
  const winnerStreak = (challengerWon ? challengerStreak : defenderStreak) + 1;
  const winnerTier = getDuelStreakTier(winnerStreak);
  const apWager = winnerTier.apGain;

  const winnerUser = winnerId === challengerId ? cUser : dUser;
  const loserUser = winnerId === challengerId ? dUser : cUser;
  const winnerTotalWins = ((winnerUser.duels && winnerUser.duels.wins) || 0) + 1;
  const trophyTier = getDuelTrophyTier(winnerTotalWins);

  // ── territory (only when the duel was fought over a country) ──
  let territoryResult = null;
  if (targetCountryId && targetContinentKey) {
    const path = (u) => (u.shadowArmy && u.shadowArmy.countries && u.shadowArmy.countries[targetCountryId]) || {};
    const attackerSoldiers = path(cUser).soldiers || 0;
    const defenderSoldiers = path(dUser).soldiers || 0;
    const defenderPower = defenderSoldiers * 1.2;   // home advantage
    const attackerPower = attackerSoldiers;
    const totalPower = attackerPower + defenderPower;
    const powerRatio = totalPower > 0 ? attackerPower / totalPower : 0.5;

    let attackerLosses, defenderLosses, countryTransfers;
    if (challengerWon) {
      attackerLosses = Math.floor(defenderSoldiers * (1 - powerRatio));
      defenderLosses = Math.floor(defenderSoldiers * powerRatio);
      countryTransfers = true;
    } else {
      attackerLosses = Math.floor(attackerSoldiers * 0.3);
      defenderLosses = Math.floor(defenderSoldiers * 0.1);
      countryTransfers = false;
    }
    territoryResult = {
      countryTransfers, targetCountryId, ckey: targetContinentKey,
      attackerSoldiers, defenderSoldiers, attackerLosses, defenderLosses,
      newAttackerSoldiers: Math.max(0, attackerSoldiers - attackerLosses),
      newDefenderSoldiers: Math.max(0, defenderSoldiers - defenderLosses),
      powerRatio: Math.round(powerRatio * 100),
    };
  }

  const inc = admin.firestore.FieldValue.increment;
  const winnerRef = db.collection('users').doc(winnerId);
  const loserRef = db.collection('users').doc(loserId);

  await db.runTransaction(async (tx) => {
    // Re-read INSIDE the transaction: both clients call this after endDate, and
    // without this guard the second call would transfer AP a second time.
    const fresh = await tx.get(duelRef);
    if (!fresh.exists) throw new functions.https.HttpsError('not-found', 'Duel vanished.');
    if (fresh.data().status !== 'active') {
      throw new functions.https.HttpsError('aborted', 'Already settled.');
    }

    tx.update(duelRef, {
      status: 'complete',
      winnerId, loserId,
      challengerScore, defenderScore,
      apWager,
      winnerStreak, winnerTotalWins,
      territoryResult,
      resolvedAt: todayStr(),
      resolvedBy: 'cloud-function',
    });

    const winnerPatch = {
      auraPoints: inc(apWager),
      'duels.wins': inc(1),
      'duels.streak': winnerStreak,
      'duels.activeDuelId': null,
      'duels.trophyTier': (trophyTier && trophyTier.tier) || 0,
      'duels.duelTitle': winnerTier.title,
      'duels.xpBoostMult': winnerTier.xpMult,
      'duels.xpBoostUntil': addDays(7),
    };
    if (trophyTier) {
      winnerPatch['inventory.weapon'] = Object.assign(
        {}, DUEL_TROPHY_ITEMS['duel_trophy_' + trophyTier.tier],
        { condition: 100, earnedAt: todayStr() });
    }
    tx.update(winnerRef, winnerPatch);

    tx.update(loserRef, {
      auraPoints: inc(-apWager),
      'duels.losses': inc(1),
      'duels.streak': 0,
      'duels.activeDuelId': null,
      'duels.lastLossDate': todayStr(),
      'duels.defeatedBy': winnerId,
      'duels.defeatedByName': (winnerUser.displayName) || '?',
      'duels.defeatDomain': (spec && spec.domain) || null,
      'duels.defeatUntil': addDays(7),
      'duels.debuffPct': winnerTier.debuffPct,
      'duels.trophyTier': 0,
      'inventory.weapon': null,
    });

    if (territoryResult) {
      const t = territoryResult;
      const cPatch = { [`shadowArmy.countries.${targetCountryId}.soldiers`]: t.newAttackerSoldiers };
      const dPatch = { [`shadowArmy.countries.${targetCountryId}.soldiers`]: t.newDefenderSoldiers };
      if (t.countryTransfers) {
        cPatch[`shadowArmy.countries.${targetCountryId}.ownerUid`] = challengerId;
        cPatch[`shadowArmy.countries.${targetCountryId}.ckey`] = targetContinentKey;
        dPatch[`shadowArmy.countries.${targetCountryId}.ownerUid`] = challengerId;
      }
      tx.update(db.collection('users').doc(challengerId), cPatch);
      tx.update(db.collection('users').doc(defenderId), dPatch);
    }
  });

  functions.logger.info('duel settled', { duelId, winnerId, loserId, challengerScore, defenderScore, apWager });

  return {
    resolved: true,
    winnerId, loserId,
    challengerScore, defenderScore,
    apWager,
    duelTitle: winnerTier.title,
    trophyTier: (trophyTier && trophyTier.tier) || 0,
    // the client rebuilds winnerTier/trophyTier from its own tables using these,
    // so the result modal can never disagree with what the app renders elsewhere
    winnerStreak, winnerTotalWins,
    territoryResult,
  };
});
