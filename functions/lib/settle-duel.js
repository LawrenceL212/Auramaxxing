'use strict';
/* Gate Duel settlement core — dependency-injected so it can be tested with a
 * fake Firestore (test/resolve-gate-duel.test.mjs). index.js is a thin wrapper
 * that supplies the real firebase-admin Firestore and turns DuelError into an
 * HttpsError.
 *
 * Rules this enforces (see functions/README.md, "Audit"):
 *   - caller must be one of the two combatants, or an admin
 *   - the duel must be 'active' with well-formed terms
 *   - the window must be over everywhere on Earth (UTC-12 end of endDate)
 *   - scores come from stored workouts only, never from the request
 *   - streaks come from the users' own docs, never from fields on the duel doc
 *   - one transaction reads the duel and both users, re-checks status, and
 *     writes duel + users + AP ledger; a second call returns the stored result
 *   - AP can never be taken below zero
 *   - non-duel weapons are never overwritten or wiped
 */
const { getDuelScore } = require('./scoring');
const { getDuelStreakTier, getDuelTrophyTier, DUEL_TROPHY_ITEMS } = require('./rewards');

class DuelError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

const DAY = 86400000;
const HOUR = 3600000;
const METRICS = ['best_e1rm', 'total_volume', 'best_hold', 'total_hold', 'best_pace',
  'total_distance', 'total_sets', 'best_reps'];
const MAX_DUEL_DAYS = 30;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayMs = (s) => (typeof s === 'string' && DAY_RE.test(s) ? Date.parse(s + 'T00:00:00Z') : NaN);
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);
/* The duel is over when endDate has finished in the LAST timezone on Earth
 * (UTC-12): endDate + 1 day + 12h in UTC. Before that a hunter somewhere may
 * still be training inside the window. */
const windowEndsAt = (endDate) => dayMs(endDate) + DAY + 12 * HOUR;
/* Earliest a workout can have been saved and still be "inside" a window that
 * starts on startDate: midnight in the first timezone on Earth (UTC+14). */
const windowOpensAt = (startDate) => dayMs(startDate) - 14 * HOUR;

function millisOf(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return null;
}

function validateTerms(d) {
  const bad = (m) => new DuelError('failed-precondition', 'This duel has invalid terms: ' + m);
  if (!d.challengerId || !d.defenderId || typeof d.challengerId !== 'string' || typeof d.defenderId !== 'string') throw bad('combatants');
  if (d.challengerId === d.defenderId) throw bad('a hunter cannot duel themselves');
  const s = dayMs(d.startDate), e = dayMs(d.endDate);
  if (isNaN(s) || isNaN(e)) throw bad('dates');
  if (e <= s) throw bad('endDate must be after startDate');
  if ((e - s) / DAY > MAX_DUEL_DAYS) throw bad('window too long');
  const sp = d.spec;
  if (!sp || typeof sp !== 'object') throw bad('spec');
  if (!METRICS.includes(sp.metric)) throw bad('metric');
  if (sp.exercise != null && typeof sp.exercise !== 'string') throw bad('exercise');
  for (const k of ['minRIR', 'minSessions', 'minWeightPct', 'durationDays']) {
    if (sp[k] != null && !(typeof sp[k] === 'number' && isFinite(sp[k]) && sp[k] >= 0 && sp[k] <= 1000)) throw bad(k);
  }
  if (d.targetCountryId != null || d.targetContinentKey != null) {
    if (!ID_RE.test(String(d.targetCountryId || '')) || !ID_RE.test(String(d.targetContinentKey || ''))) throw bad('territory target');
  }
}

const num0 = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
const intStreak = (v) => Math.floor(num0(v));

const trophyTierOfWeapon = (w) => {
  if (!w) return 0;
  for (const [key, it] of Object.entries(DUEL_TROPHY_ITEMS)) {
    if (w.name === it.name && w.slot === 'weapon') return Number(key.split('_').pop());
  }
  return 0;
};

const alreadyResolvedPayload = (d) => ({
  alreadyResolved: true,
  winnerId: d.winnerId, loserId: d.loserId,
  challengerScore: d.challengerScore, defenderScore: d.defenderScore,
  apWager: d.apWager,
  winnerStreak: d.winnerStreak, winnerTotalWins: d.winnerTotalWins,
  territoryResult: d.territoryResult || null,
});

async function bodyweightFor(db, uid, userData, warn) {
  try {
    const snap = await db.collection('bodyweight').where('uid', '==', uid).orderBy('date', 'desc').limit(1).get();
    if (!snap.empty) { const bw = Number(snap.docs[0].data().weight); if (bw) return bw; }
  } catch (e) { warn && warn('bodyweight lookup failed for ' + uid, e); }
  return Number(userData && userData.bodyweightKg) || null;
}

/**
 * @param {object} deps
 *   db, duelId, caller (uid), adminUids[], now (ms), serverTimestamp(), warn?
 */
async function settleDuel(deps) {
  const { db, duelId, caller, adminUids = [], now = Date.now(), serverTimestamp = () => null, warn } = deps;
  if (!caller) throw new DuelError('unauthenticated', 'Sign in to resolve a duel.');
  if (!duelId || typeof duelId !== 'string' || !ID_RE.test(duelId)) throw new DuelError('invalid-argument', 'duelId is required.');

  const duelRef = db.collection('duels').doc(duelId);
  const pre = await duelRef.get();
  if (!pre.exists) throw new DuelError('not-found', 'That duel does not exist.');
  const duel = pre.data();
  const isAdmin = adminUids.includes(caller);
  if (!isAdmin && caller !== duel.challengerId && caller !== duel.defenderId) {
    throw new DuelError('permission-denied', 'You are not in this duel.');
  }
  if (duel.status === 'complete') return alreadyResolvedPayload(duel);
  if (duel.status !== 'active') {
    throw new DuelError('failed-precondition', `A duel can only be settled once its terms are set (status is "${duel.status}").`);
  }
  validateTerms(duel);
  if (now < windowEndsAt(duel.endDate)) {
    throw new DuelError('failed-precondition', 'This duel has not ended yet.', { endsAt: new Date(windowEndsAt(duel.endDate)).toISOString() });
  }

  const { startDate, endDate, spec, challengerId, defenderId, targetCountryId, targetContinentKey } = duel;
  const today = dayStr(now);
  const plus7 = dayStr(now + 7 * DAY);

  // ── read-only inputs (scores never depend on the request) ──
  const [cSnap0, dSnap0, customSnap, wSnap] = await Promise.all([
    db.collection('users').doc(challengerId).get(),
    db.collection('users').doc(defenderId).get(),
    db.collection('customExercises').get(),
    db.collection('workouts').where('date', '>=', startDate).where('date', '<=', endDate).get(),
  ]);
  if (!cSnap0.exists || !dSnap0.exists) throw new DuelError('failed-precondition', 'A combatant no longer exists.');

  const customDefs = {};
  customSnap.forEach((doc) => {
    const c = doc.data();
    if (c && c.name) customDefs[c.name] = { timed: !!c.timed, timedUnit: c.timedUnit, intent: c.intent };
  });

  /* Only sessions saved inside the window count. createdAt is a server
   * timestamp, so a session cannot be back-dated into a finished duel and a
   * session cannot be pre-logged before the duel began. Legacy docs with no
   * createdAt are accepted as before. */
  const lo = windowOpensAt(startDate), hi = windowEndsAt(endDate);
  const duelWorkouts = wSnap.docs.map((d) => d.data()).filter((w) => {
    if (w.uid !== challengerId && w.uid !== defenderId) return false;
    const t = millisOf(w.createdAt);
    return t == null || (t >= lo && t <= hi);
  });

  const [cBw, dBw] = await Promise.all([
    bodyweightFor(db, challengerId, cSnap0.data(), warn),
    bodyweightFor(db, defenderId, dSnap0.data(), warn),
  ]);
  const challengerScore = getDuelScore(spec, duelWorkouts, challengerId, cBw, customDefs);
  const defenderScore = getDuelScore(spec, duelWorkouts, defenderId, dBw, customDefs);

  const challengerForfeited = challengerScore < 0;
  const defenderForfeited = defenderScore < 0;
  let winnerId, loserId;
  if (challengerForfeited && !defenderForfeited) { loserId = challengerId; winnerId = defenderId; }
  else if (defenderForfeited && !challengerForfeited) { loserId = defenderId; winnerId = challengerId; }
  else {
    winnerId = challengerScore >= defenderScore ? challengerId : defenderId;
    loserId = winnerId === challengerId ? defenderId : challengerId;
  }
  const challengerWon = winnerId === challengerId;
  const cRef = db.collection('users').doc(challengerId);
  const dRef = db.collection('users').doc(defenderId);

  return db.runTransaction(async (tx) => {
    const [fresh, cSnap, dSnap] = await Promise.all([tx.get(duelRef), tx.get(cRef), tx.get(dRef)]);
    if (!fresh.exists) throw new DuelError('not-found', 'That duel does not exist.');
    const f = fresh.data();
    if (f.status === 'complete') return alreadyResolvedPayload(f);
    if (f.status !== 'active') throw new DuelError('aborted', 'The duel changed while settling. Try again.');
    // scores were computed from the terms read above; refuse if they moved
    if (f.startDate !== startDate || f.endDate !== endDate || f.challengerId !== challengerId
        || f.defenderId !== defenderId || JSON.stringify(f.spec) !== JSON.stringify(spec)
        || f.targetCountryId !== targetCountryId) {
      throw new DuelError('aborted', 'The duel terms changed while settling. Try again.');
    }
    if (!cSnap.exists || !dSnap.exists) throw new DuelError('failed-precondition', 'A combatant no longer exists.');
    const cUser = cSnap.data() || {}, dUser = dSnap.data() || {};
    const winnerUser = challengerWon ? cUser : dUser;
    const loserUser = challengerWon ? dUser : cUser;

    // streak = the winner's own stored streak, not a field on the duel doc
    const winnerStreak = intStreak(winnerUser.duels && winnerUser.duels.streak) + 1;
    const winnerTier = getDuelStreakTier(winnerStreak);
    const apWager = winnerTier.apGain;
    const winnerTotalWins = intStreak(winnerUser.duels && winnerUser.duels.wins) + 1;
    const trophyTier = getDuelTrophyTier(winnerTotalWins);

    // AP: winner gains the wager; loser pays it but never below zero
    const winnerBal = num0(winnerUser.auraPoints), loserBal = num0(loserUser.auraPoints);
    const apLost = Math.min(apWager, loserBal);

    // territory (only when fought over a country)
    let territoryResult = null;
    if (targetCountryId && targetContinentKey) {
      const soldiersOf = (u) => num0(u.shadowArmy && u.shadowArmy.countries && u.shadowArmy.countries[targetCountryId]
        && u.shadowArmy.countries[targetCountryId].soldiers);
      const attackerSoldiers = soldiersOf(cUser), defenderSoldiers = soldiersOf(dUser);
      const defenderPower = defenderSoldiers * 1.2;
      const totalPower = attackerSoldiers + defenderPower;
      const powerRatio = totalPower > 0 ? attackerSoldiers / totalPower : 0.5;
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

    // ── writes (all reads are above) ──
    tx.update(duelRef, {
      status: 'complete', winnerId, loserId, challengerScore, defenderScore,
      apWager, apLost, winnerStreak, winnerTotalWins, territoryResult,
      resolvedAt: today, resolvedBy: 'cloud-function', resolvedByUid: caller,
    });

    const winnerPatch = {
      auraPoints: winnerBal + apWager,
      'duels.wins': winnerTotalWins,
      'duels.streak': winnerStreak,
      'duels.activeDuelId': null,
      'duels.trophyTier': (trophyTier && trophyTier.tier) || 0,
      'duels.duelTitle': winnerTier.title,
      'duels.xpBoostMult': winnerTier.xpMult,
      'duels.xpBoostUntil': plus7,
    };
    if (trophyTier) {
      const cur = winnerUser.inventory && winnerUser.inventory.weapon;
      const curTier = trophyTierOfWeapon(cur);
      if (!cur || (curTier > 0 && curTier <= trophyTier.tier)) {
        winnerPatch['inventory.weapon'] = Object.assign({}, DUEL_TROPHY_ITEMS['duel_trophy_' + trophyTier.tier],
          { condition: 100, earnedAt: today });
      }
    }
    const loserPatch = {
      auraPoints: loserBal - apLost,
      'duels.losses': intStreak(loserUser.duels && loserUser.duels.losses) + 1,
      'duels.streak': 0,
      'duels.activeDuelId': null,
      'duels.lastLossDate': today,
      'duels.defeatedBy': winnerId,
      'duels.defeatedByName': winnerUser.displayName || '?',
      'duels.defeatDomain': (spec && spec.domain) || null,
      'duels.defeatUntil': plus7,
      'duels.debuffPct': winnerTier.debuffPct,
      'duels.trophyTier': 0,
    };
    if (trophyTierOfWeapon(loserUser.inventory && loserUser.inventory.weapon) > 0) loserPatch['inventory.weapon'] = null;

    const patches = { [winnerId]: winnerPatch, [loserId]: loserPatch };
    if (territoryResult) {
      const t = territoryResult, base = `shadowArmy.countries.${targetCountryId}`;
      patches[challengerId][`${base}.soldiers`] = t.newAttackerSoldiers;
      patches[defenderId][`${base}.soldiers`] = t.newDefenderSoldiers;
      if (t.countryTransfers) {
        patches[challengerId][`${base}.ownerUid`] = challengerId;
        patches[challengerId][`${base}.ckey`] = targetContinentKey;
        patches[defenderId][`${base}.ownerUid`] = challengerId;
      }
    }
    tx.update(winnerId === challengerId ? cRef : dRef, patches[winnerId]);
    tx.update(winnerId === challengerId ? dRef : cRef, patches[loserId]);

    // AP ledger entries (same shape the app's logAp() writes)
    const ledger = (uid, amount, before, reason) => tx.set(db.collection('apEvents').doc(), {
      uid, amount, reason, balanceBefore: before, balanceAfter: before + amount,
      timestamp: serverTimestamp(), date: today,
    });
    ledger(winnerId, apWager, winnerBal, `Gate Duel won (streak ${winnerStreak}): +${apWager} AP`);
    if (apLost > 0) ledger(loserId, -apLost, loserBal, `Gate Duel lost: -${apLost} AP`);

    return {
      resolved: true, winnerId, loserId, challengerScore, defenderScore,
      apWager, apLost, duelTitle: winnerTier.title, trophyTier: (trophyTier && trophyTier.tier) || 0,
      winnerStreak, winnerTotalWins, territoryResult,
    };
  });
}

module.exports = { settleDuel, DuelError, validateTerms, windowEndsAt, windowOpensAt, trophyTierOfWeapon };
