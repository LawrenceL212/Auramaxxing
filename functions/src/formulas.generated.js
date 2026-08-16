/* ─────────────────────────────────────────────────────────────────────────
   GENERATED FILE — DO NOT EDIT BY HAND.

   Produced by functions/tools/extract-formulas.mjs from index.html.
   Every body below is a byte-for-byte copy of the client's own implementation.
   The server does not reimplement progression maths; it runs the same code the
   client runs, which is what makes shadow-mode agreement meaningful.

   Regenerate:  node tools/extract-formulas.mjs
   Check drift: node tools/extract-formulas.mjs --check

   Extracted:   TIER_XP, FLAT_PR_XP, STAT_BONUS_XP, HUNTER_RANK_TIERS, isRunExercise, resistanceIntensityMult, timedIntensityMult, intensityMult, repsMult, getSetIntensity, computeWorkoutXP, xpForLevel, levelFromTotalXP, apForLevel, epley1RM
   Injected:    EXERCISES_ALL
   ───────────────────────────────────────────────────────────────────────── */

/**
 * @param {{ EXERCISES_ALL: Record<string, any> }} deps
 *        EXERCISES_ALL must be BASE_EXERCISES merged with the user's
 *        customExercises, exactly as rebuildExercisesAll() assembles it.
 */
export function createFormulas(deps) {
  const { EXERCISES_ALL } = deps;

  const TIER_XP = { Beginner: 5, Novice: 15, Intermediate: 40, Advanced: 100, Elite: 250 };

  const FLAT_PR_XP = 10; // for exercises without world standards

  const STAT_BONUS_XP = { Elite: 3, Advanced: 2, Intermediate: 1, Novice: 0, Beginner: 0 };

  const HUNTER_RANK_TIERS = [
    { min: 60, rank: 'S', color: 'var(--violet)' }, { min: 30, rank: 'A', color: 'var(--brass)' },
    { min: 14, rank: 'B', color: 'var(--maintaining)' }, { min: 7, rank: 'C', color: 'var(--growing)' },
    { min: 3, rank: 'D', color: 'var(--text-dim)' }, { min: 0, rank: 'E', color: 'var(--text-faint)' },
  ];

  function isRunExercise(name) {
    const def = EXERCISES_ALL[name] || {};
    return !!def.timed && (def.intent === 'endurance' || (def.intent === 'explosive' && def.timedUnit === 'mins'));
  }

  function resistanceIntensityMult(rir) {
    if (rir === null || rir === undefined) return 1.0;
    if (rir <= 0)  return 1.3;
    if (rir <= 1)  return 1.2;
    if (rir <= 3)  return 1.0;
    if (rir <= 5)  return 0.85;
    return 0.7;
  }

  function timedIntensityMult(rpe) {
    if (rpe === null || rpe === undefined) return 1.0;
    if (rpe >= 10) return 1.3;
    if (rpe >= 9)  return 1.2;
    if (rpe >= 8)  return 1.1;
    if (rpe >= 7)  return 1.0;
    if (rpe >= 6)  return 0.85;
    return 0.7;
  }

  function intensityMult(rir) {
    return resistanceIntensityMult(rir);
  }

  function repsMult(reps) {
    return Math.log(Math.max(1, reps) + 1) / Math.log(13);
  }

  function getSetIntensity(set, exDef) {
    const isTimed = !!(exDef?.timed && exDef?.timedUnit !== 'mins');
    const isRun   = !!(exDef?.timed && exDef?.intent === 'endurance');

    // ── New schema: explicit rpe field present ──
    if (set.rpe != null) {
      return { type: 'rpe', value: set.rpe, source: 'explicit-rpe', legacy: false };
    }
    // ── New schema: explicit rir field, exercise is resistance ──
    if (set.rir != null && !isTimed && !isRun) {
      return { type: 'rir', value: set.rir, source: 'explicit-rir', legacy: false };
    }

    // ── Legacy schema: only rir field exists ──
    if (set.rir != null) {
      if (isTimed || isRun) {
        // Historical timed/run workout stored RPE in rir field
        return { type: 'rpe', value: set.rir, source: 'legacy', legacy: true };
      }
      // Historical resistance workout stored RIR in rir field
      return { type: 'rir', value: set.rir, source: 'legacy', legacy: true };
    }

    // ── No intensity data ──
    return { type: null, value: null, source: 'none', legacy: false };
  }

  function computeWorkoutXP(exercises) {
    let generalXP = 0;
    const trainingXP = { strength:0, focus:0, defence:0, agility:0, endurance:0, flexibility:0 };
    // Baseline bleed — every session gives a tiny amount to all stats
    Object.keys(trainingXP).forEach(s => trainingXP[s] += 0.5);

    for (const ex of exercises) {
      const exDef = EXERCISES_ALL[ex.name] || {};
      const weights = exDef.statWeights || null;
      const tier = exDef.skillTier || 1.0;
      const isRun = isRunExercise(ex.name);

      // Derive statWeights from intent when no explicit weights defined
      // This ensures custom exercises with intent set still contribute to training caps
      const INTENT_WEIGHTS = {
        strength:    { strength: 1.0 },
        hypertrophy: { strength: 0.8, defence: 0.2 },
        skill:       { focus: 1.0 },
        explosive:   { agility: 0.8, strength: 0.2 },
        endurance:   { endurance: 0.8, agility: 0.2 },
        mobility:    { flexibility: 1.0 },
        defence:     { defence: 1.0 },
        balance:     { focus: 0.6, defence: 0.4 },
        isometric:   { strength: 0.5, focus: 0.5 },
      };
      const effectiveWeights = weights || (exDef.intent ? INTENT_WEIGHTS[exDef.intent] : null);

      if (isRun) {
        // ── RUN XP: distKm × 2.797 × intensityMult(rir) ──
        // Each km of running is worth a scaled set-equivalent.
        // C=2.797 calibrated so 8.25km Tempo Run = 30 XP.
        const RUN_C = 2.797;
        // Prefer distKm from sets (workout logger) or runSummary passed via ex._runSummary
        let distKm = null;
        for (const s of (ex.sets || [])) {
          if (s.distKm && s.distKm > 0) { distKm = s.distKm; break; }
        }
        if (!distKm && ex._runSummary?.distKm > 0) distKm = ex._runSummary.distKm;
        // Fallback: reps stored as distKm×10 (run modal pattern) — reps/10
        if (!distKm) {
          const reps = Number(ex.sets?.[0]?.reps) || 0;
          if (reps > 0) distKm = reps / 10;
        }

        if (distKm && distKm > 0) {
          // Run XP: objective intensity from run type + pace.
          // Run type is objective (player selects before the run).
          // Pace is objective (distance ÷ duration).
          // No subjective RPE input involved.
          const runTypeName = ex.name;
          const runDurMins  = ex.sets?.[0]?.durationMins ?? (distKm && distKm > 0 ? distKm * 7 : null);
          const paceMinKm   = (runDurMins && distKm > 0) ? runDurMins / distKm : null;
          const runIntensity = (() => {
            // Type-based floor — preserves intended effort category
            if (runTypeName === 'Hill Sprints' || runTypeName === 'Interval Running' || runTypeName === 'Race') return 1.3;
            if (runTypeName === 'Tempo Run') return 1.3;
            if (runTypeName === 'Long Run')  return 1.0;
            if (runTypeName === 'Easy Run')  return 0.85;
            // Pace-based fallback for other/unlabelled runs
            if (paceMinKm !== null) {
              if (paceMinKm < 5.0) return 1.3;
              if (paceMinKm < 6.0) return 1.0;
              if (paceMinKm < 7.0) return 1.0;
              return 0.85;
            }
            return 1.0; // no type or pace info — neutral
          })();
          const runXP = distKm * RUN_C * runIntensity;
          generalXP += runXP;
          // Run training XP: endurance-primary, agility-secondary
          trainingXP.endurance += runXP * 0.8;
          trainingXP.agility   += runXP * 0.2;
        }
        continue; // skip the set-based loop below for runs
      }

      for (const set of (ex.sets || [])) {
        // For timed exercises use durationMins→seconds for XP calc (accurate duration)
        // For strength use reps directly
        const isTimed = !!exDef.timed;
        const isSecs  = isTimed && exDef.timedUnit !== 'mins';
        const reps = isTimed && set.durationMins != null
          ? Math.round(set.durationMins * 60)   // convert stored minutes → seconds
          : Number(set.reps) || 0;
        if (reps <= 0) continue;
        // Semantic intensity: use getSetIntensity to determine RIR vs RPE correctly
        const si = getSetIntensity(set, exDef);
        let im;
        if (si.type === 'rpe') {
          // Timed/skill exercise: use RPE-based multiplier directly
          im = timedIntensityMult(si.value);
        } else if (si.type === 'rir') {
          // Resistance exercise: use RIR-based multiplier
          im = resistanceIntensityMult(si.value);
        } else {
          im = 1.0; // no intensity data
        }
        // Cap timed hold duration at 60s for XP — beyond that is endurance, not extra skill
        const xpReps = isTimed ? Math.min(reps, 60) : reps;
        const rm = repsMult(xpReps);
        const setXP = Math.max(0.5, 2 * rm * im * tier);

        generalXP += setXP;

        if (effectiveWeights) {
          for (const [stat, w] of Object.entries(effectiveWeights)) {
            if (trainingXP[stat] !== undefined) {
              trainingXP[stat] += setXP * w;
            }
          }
        }
      }
    }

    return { generalXP: Math.round(generalXP * 10) / 10, trainingXP };
  }

  function xpForLevel(level) {
    return Math.round(50 * Math.pow(level, 1.25));
  }

  function levelFromTotalXP(totalXP) {
    let level = 1, cumulative = 0;
    while (true) {
      const needed = xpForLevel(level);
      if (cumulative + needed > totalXP) return level;
      cumulative += needed;
      level++;
      if (level > 500) return 500; // safety
    }
  }

  function apForLevel(level) {
    if (level <= 5)   return 10;
    if (level <= 15)  return 15;
    if (level <= 30)  return 22;
    if (level <= 50)  return 30;
    if (level <= 75)  return 40;
    if (level <= 100) return 55;
    return 70;
  }

  function epley1RM(weight, reps) {
    if (reps <= 0 || weight <= 0) return 0;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
  }

  return { TIER_XP, FLAT_PR_XP, STAT_BONUS_XP, HUNTER_RANK_TIERS, isRunExercise, resistanceIntensityMult, timedIntensityMult, intensityMult, repsMult, getSetIntensity, computeWorkoutXP, xpForLevel, levelFromTotalXP, apForLevel, epley1RM };
}
