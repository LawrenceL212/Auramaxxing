/* =========================================================================
   SET INPUTS PER EXERCISE TYPE

   Which inputs the workout logger shows for a set, and how what the Hunter
   types becomes the stored set. The kind comes from fields every exercise
   already carries (timed, timedUnit, intent, equipment, bwPercent), so base
   and custom exercises both resolve without a per-exercise table.

     distance    runs, rides, rope, stairs   time (h:mm:ss) + km
     cardio      mountain climbers, crawls   time (m:ss), stored like a run
     duration    sports, boxing, yoga        time (h:mm)
     hold        planks, levers, stretches   seconds
     load_reps   bodyweight with bwPercent   reps + load kg (bodyweight share)
     reps        other bodyweight moves      reps
     weight_reps barbell, dumbbell, cable    reps + kg

   Presentation only. storedSet() writes exactly the fields the logger always
   wrote for each kind (reps as minutes for distance and duration, seconds for
   holds, durationMins for distance and holds only), so XP, PRs, dungeon, army
   and reconciliation read the same numbers as before.

   Pure, so test/set-inputs.test.mjs exercises it without a browser.
   ========================================================================= */

export const SET_INPUT_KINDS = ['distance', 'cardio', 'duration', 'hold', 'load_reps', 'reps', 'weight_reps'];

/** Same test as isRunExercise() in index.html: these sets log km for run XP. */
export function isRunDef(def) {
  const d = def || {};
  return !!d.timed && (d.intent === 'endurance' || (d.intent === 'explosive' && d.timedUnit === 'mins'));
}

/** The input kind for an exercise definition (an EXERCISES_ALL entry). */
export function setInputKind(def) {
  const d = def || {};
  /* Second-timed endurance work counts as a run for XP, so it is stored like
     one, but has no distance to enter. */
  if (isRunDef(d)) return d.timedUnit === 'mins' ? 'distance' : 'cardio';
  if (d.timed) return d.timedUnit === 'mins' ? 'duration' : 'hold';
  if (d.equipment === 'Bodyweight') return d.bwPercent != null ? 'load_reps' : 'reps';
  return 'weight_reps';
}

/** True when the kind is entered as a time rather than a rep count. */
export function isTimeKind(kind) {
  return kind === 'distance' || kind === 'cardio' || kind === 'duration' || kind === 'hold';
}

/* Column headers for the set table: [first, second]; second is null when the
   first input spans both columns. */
export function setInputHeaders(kind) {
  switch (kind) {
    case 'distance': return ['Time', 'km'];
    case 'cardio':
    case 'duration': return ['Time', null];
    case 'hold':     return ['Secs', null];
    case 'load_reps':return ['Reps', 'Load (kg)'];
    case 'reps':     return ['Reps', null];
    default:         return ['Reps', 'Weight (kg)'];
  }
}

const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/* Total seconds from h/m/s parts. Blank parts count as zero. */
export function partsToSecs({ h, m, s } = {}) {
  return num(h) * 3600 + num(m) * 60 + num(s);
}

/* h/m/s parts from seconds, for prefilling the time fields. */
export function secsToParts(totalSecs) {
  const t = Math.max(0, Math.round(Number(totalSecs) || 0));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}

/* What the Hunter entered, as raw numbers:
     { secs, reps, weight, km }
   secs is the set's time in seconds (time kinds), reps the rep count (rep kinds).
   Returns the stored set fields without intensity, or null for an empty set. */
export function storedSet(kind, entered) {
  const e = entered || {};
  const secs = num(e.secs);
  switch (kind) {
    case 'cardio':
    case 'distance': {
      const km = kind === 'distance' ? num(e.km) : 0;
      if (!secs && !km) return null;
      const totalMins = secs / 60;
      return {
        reps: Math.max(1, Math.round(totalMins)),
        weight: 0,
        distKm: km,
        durationMins: Math.round(totalMins * 10) / 10,
      };
    }
    case 'duration': {
      // stored in whole minutes, as the minutes field always was
      const mins = Math.round(secs / 60);
      return mins > 0 ? { reps: mins, weight: 0 } : null;
    }
    case 'hold': {
      if (!secs) return null;
      return {
        reps: Math.max(1, Math.round(secs)),
        weight: 0,
        durationMins: Math.round((secs / 60) * 10) / 10,
      };
    }
    case 'reps': {
      const reps = num(e.reps);
      return reps > 0 ? { reps, weight: 0 } : null;
    }
    default: {
      const reps = num(e.reps);
      return reps > 0 ? { reps, weight: num(e.weight) } : null;
    }
  }
}

/* Seconds a stored set represents, for prefilling and display. Prefers the
   exact durationMins; otherwise reps is minutes (distance, duration) or
   seconds (hold). */
export function storedSetSecs(kind, set) {
  const s = set || {};
  if (kind === 'hold') return num(s.reps) || Math.round(num(s.durationMins) * 60);
  if (s.durationMins != null && Number(s.durationMins) > 0) return Math.round(Number(s.durationMins) * 60);
  return num(s.reps) * 60;
}

/* A time for display: "1:05:09" / "42:10" for distance, "1h 30m" / "45m" for
   duration, "45s" / "2m 05s" for holds. */
export function formatSetTime(kind, totalSecs) {
  const { h, m, s } = secsToParts(totalSecs);
  const pad = n => String(n).padStart(2, '0');
  if (kind === 'duration') {
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (kind === 'hold') {
    if (!h && !m) return `${s}s`;
    return `${h * 60 + m}m ${pad(s)}s`;
  }
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`; // distance, cardio
}
