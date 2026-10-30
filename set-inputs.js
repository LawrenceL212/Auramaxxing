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

   Load type: exercises that take a load (weight_reps, load_reps) also offer
   a load picker, Weight (kg), Bands, Bodyweight or No weight; bodyweight-load
   moves (pull-ups, dips, push-ups) split bands into Band resisted (adds load)
   and Band assisted (takes load off), since they train the move in opposite
   ways. Any choice but
   kg logs reps only, stored with weight 0 (as a bodyweight rep set always
   was) plus a `load` tag on the set, so every formula reads the same numbers
   it would for a set logged with no kg. Either band load also takes a
   strength (Light to Extra heavy), stored as `band` on the set.

   Bodyweight load: the set stores the bodyweight it moved as its weight, so
   volume, XP and PRs count it like any kg set. That is the exercise's
   bodyweight share (bwPercent) of the Hunter's weigh-in on the session's date
   (the latest one on or before it), whole bodyweight when the exercise has no
   share. With no weigh-in and no profile weight it stays 0, as before.

   Pure, so test/set-inputs.test.mjs exercises it without a browser.
   ========================================================================= */

export const SET_INPUT_KINDS = ['distance', 'cardio', 'duration', 'hold', 'load_reps', 'reps', 'weight_reps'];

/** Same test as isRunExercise() in index.html: these sets log km for run XP. */
export function isRunDef(def) {
  const d = def || {};
  return !!d.timed && (d.intent === 'endurance' || (d.intent === 'explosive' && d.timedUnit === 'mins'));
}

/** The input kind for an exercise definition (an EXERCISES_ALL entry), and
    optionally the load type picked for it: a load other than kg logs reps only. */
export function setInputKind(def, load) {
  const kind = baseSetInputKind(def);
  return hasLoadChoice(kind) && load && load !== 'kg' ? 'reps' : kind;
}

function baseSetInputKind(def) {
  const d = def || {};
  /* Second-timed endurance work counts as a run for XP, so it is stored like
     one, but has no distance to enter. */
  if (isRunDef(d)) return d.timedUnit === 'mins' ? 'distance' : 'cardio';
  if (d.timed) return d.timedUnit === 'mins' ? 'duration' : 'hold';
  if (d.equipment === 'Bodyweight') return d.bwPercent != null ? 'load_reps' : 'reps';
  return 'weight_reps';
}

/* ── Load type ── */
export const LOAD_TYPES = ['kg', 'bands', 'band_assist', 'bodyweight', 'none'];
const LOAD_LABELS = { kg: 'Weight (kg)', bands: 'Bands', band_assist: 'Band assisted', bodyweight: 'Bodyweight', none: 'No weight' };

export function loadLabel(load) { return LOAD_LABELS[load] || LOAD_LABELS.kg; }

/** True for either band load (resisted or assisted). */
export function isBandLoad(load) { return load === 'bands' || load === 'band_assist'; }

/** The picker's options for an exercise, as [value, label]. Bodyweight-load
    moves get Band resisted and Band assisted; weighted moves get Bands, which
    there always means added resistance. Empty when there is no picker. */
export function loadOptions(def) {
  const kind = baseSetInputKind(def);
  if (kind === 'load_reps') return LOAD_TYPES.map(l => [l, l === 'bands' ? 'Band resisted' : loadLabel(l)]);
  if (kind === 'weight_reps') return LOAD_TYPES.filter(l => l !== 'band_assist').map(l => [l, loadLabel(l)]);
  return [];
}

/** True when this kind has a kg input, so the load picker applies. */
export function hasLoadChoice(kind) { return kind === 'weight_reps' || kind === 'load_reps'; }

/** Whether the load picker shows for an exercise definition. */
export function offersLoadChoice(def) { return hasLoadChoice(baseSetInputKind(def)); }

/** The picker's starting value for an exercise with no history:
    No weight for mobility work, kg otherwise; null when there is no picker. */
export function defaultLoad(def) {
  if (!offersLoadChoice(def)) return null;
  return (def || {}).intent === 'mobility' ? 'none' : 'kg';
}

/** The load a stored set was logged with. Sets from before the picker have
    no tag and were logged in kg. */
export function setLoad(set) {
  const l = (set || {}).load;
  return LOAD_TYPES.includes(l) ? l : 'kg';
}

/** The load a past session of an exercise was logged with, or null when it
    says nothing: a set tagged with a load, else kg if any set carried weight. */
export function loggedLoad(sets) {
  const list = sets || [];
  const tagged = list.find(s => s && LOAD_TYPES.includes(s.load));
  if (tagged) return tagged.load;
  return list.some(s => Number(s && s.weight) > 0) ? 'kg' : null;
}

/* ── Band strength (only with load 'bands') ── */
export const BAND_LEVELS = ['light', 'medium', 'heavy', 'xheavy'];
const BAND_LABELS = { light: 'Light', medium: 'Medium', heavy: 'Heavy', xheavy: 'Extra heavy' };
export const DEFAULT_BAND = 'medium';

export function bandLabel(band) { return BAND_LABELS[band] || BAND_LABELS[DEFAULT_BAND]; }

/** The band strength of a stored set, or null when it was not logged with bands
    or no strength was recorded. */
export function setBand(set) {
  const s = set || {};
  return isBandLoad(setLoad(s)) && BAND_LEVELS.includes(s.band) ? s.band : null;
}

/** The band strength a past session was logged with, or null. */
export function loggedBand(sets) {
  const hit = (sets || []).map(setBand).find(Boolean);
  return hit || null;
}

/** How a set's load reads in history: "Heavy band", "Light band assist",
    "Bodyweight", "Bodyweight (46.4kg)", "60kg". */
export function loadText(set) {
  const s = set || {};
  const load = setLoad(s);
  if (load === 'kg') return s.weight ? s.weight + 'kg' : '—';
  if (load === 'bands') { const b = setBand(s); return b ? `${bandLabel(b)} band` : 'Bands'; }
  if (load === 'band_assist') { const b = setBand(s); return b ? `${bandLabel(b)} band assist` : 'Band assisted'; }
  if (load === 'bodyweight' && num(s.weight) > 0) return `Bodyweight (${s.weight}kg)`;
  return loadLabel(load);
}

/** The stored set with its load tag (and band strength for band loads). kg is the
    default and is not written, so weighted sets keep exactly the shape they
    always had. A Bodyweight set takes bwLoadKg (bodyweightLoadKg()) as its weight. */
export function withLoad(stored, load, band, bwLoadKg) {
  if (!stored || !load || load === 'kg' || !LOAD_TYPES.includes(load)) return stored;
  const out = { ...stored, weight: load === 'bodyweight' ? round1(num(bwLoadKg)) : 0, load };
  if (isBandLoad(load) && BAND_LEVELS.includes(band)) out.band = band;
  return out;
}

/* ── Bodyweight load ── */
const round1 = n => Math.round(n * 10) / 10;

/** The Hunter's bodyweight for a session date: the latest weigh-in on or before
    it, else the earliest one after (a session from before the first weigh-in),
    else fallbackKg (profile weight), else null. weights: [{date, weight}]. */
export function bodyweightOn(weights, date, fallbackKg) {
  const list = (weights || []).filter(w => w && w.date && num(w.weight) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const before = list.filter(w => !date || w.date <= date);
  const hit = before.length ? before[before.length - 1] : list[0];
  if (hit) return num(hit.weight);
  return num(fallbackKg) || null;
}

/** The kg a Bodyweight set stands for: the exercise's bodyweight share
    (bwPercent) of bwKg, or all of it when the exercise has none. 0 with no bwKg. */
export function bodyweightLoadKg(def, bwKg) {
  const bw = num(bwKg);
  if (!bw) return 0;
  const pct = Number((def || {}).bwPercent);
  return round1(bw * (Number.isFinite(pct) && pct > 0 ? pct : 1));
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
