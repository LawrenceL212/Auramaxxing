/* =========================================================================
   RE-ENTRY AND DIRECTIVES

   Two things that exist because starting is not the hard part.

   RE-ENTRY
   A Hunter who stops does not usually stop because the training got harder.
   Something ordinary interrupts them — a holiday, an illness, a week of work —
   and then coming back means opening an app that shows a dead streak, a stale
   programme and a wall of evidence that they failed. The cost of returning is
   made higher than the cost of staying away.

   Re-entry detects the gap and re-evaluates instead of judging: the week's
   target drops to a single session and the first Hunt back is cut down, so the
   cheapest action in the app is the one that gets the Hunter training again.
   It fires once per gap and never scolds.

   DIRECTIVES
   A weekly session count is a chore. "Half marathon" and "before I see her
   again" are reasons. A directive is a named thing worth reaching, optionally
   with a date and a measure drawn from the training record — so progress
   toward it is evidence rather than a feeling.

   Pure functions over plain data, so both can be tested without a browser
   (test/goals.test.mjs).
   ========================================================================= */

/** A gap of this many days or more triggers re-entry. Short enough to catch a
 *  wobble before it becomes a month, long enough that an ordinary rest week
 *  does not trip it. */
export const REENTRY_GAP_DAYS = 5;

/** The first Hunt back is cut to this fraction of its programmed sets. */
export const REENTRY_SET_FRACTION = 0.5;

function daysBetweenStr(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

/**
 * Has this Hunter been away long enough to need a way back in?
 *
 * @param ctx {
 *   workoutDates: Set<string>,
 *   today: 'YYYY-MM-DD',
 *   threshold?: number,
 *   acknowledgedFor?: string|null   // last date this was dismissed for
 * }
 * @returns { isReEntry, gapDays, lastDate, alreadyAcknowledged }
 */
export function detectReEntry(ctx) {
  const none = { isReEntry: false, gapDays: 0, lastDate: null, alreadyAcknowledged: false };
  if (!ctx || !ctx.today || !ctx.workoutDates || ctx.workoutDates.size === 0) return none;

  // Only dates at or before today — a session logged ahead must not mask a gap.
  const past = [...ctx.workoutDates].filter((d) => d <= ctx.today).sort();
  if (!past.length) return none;

  const lastDate = past[past.length - 1];
  const gapDays = daysBetweenStr(lastDate, ctx.today);
  const threshold = ctx.threshold ?? REENTRY_GAP_DAYS;
  if (gapDays < threshold) return { ...none, gapDays, lastDate };

  /* Acknowledgement is stored against the session the Hunter came back FROM,
     not against a calendar date. That way one gap prompts once however many
     times the app is opened, and a later, separate gap prompts again. */
  return {
    isReEntry: true,
    gapDays,
    lastDate,
    alreadyAcknowledged: ctx.acknowledgedFor === lastDate,
  };
}

/** The reduced first Hunt back: same exercises, fewer sets, never below one. */
export function reEntryPlan(exercises, fraction = REENTRY_SET_FRACTION) {
  if (!Array.isArray(exercises)) return [];
  return exercises.map((ex) => ({
    ...ex,
    sets: Math.max(1, Math.round((Number(ex.sets) || 1) * fraction)),
    _fullSets: Number(ex.sets) || 1,
  }));
}

/* ── DIRECTIVES ─────────────────────────────────────────────────────────── */

/** What a directive can measure, and how it reads out of the training record. */
export const DIRECTIVE_METRICS = {
  longest_run_km: { label: 'Longest run', unit: 'km', decimals: 2 },
  total_distance_km: { label: 'Distance covered', unit: 'km', decimals: 1 },
  training_days: { label: 'Days trained', unit: 'days', decimals: 0 },
  body_weight_kg: { label: 'Bodyweight', unit: 'kg', decimals: 1 },
  none: { label: 'Progress', unit: '', decimals: 0 },
};

/**
 * Where a Hunter stands against one directive.
 *
 * `since` scopes the measure to work done after the directive was set, so a
 * goal created today does not open already half-complete on the back of old
 * training.
 *
 * @param d    { id, title, metric, target, targetDate, since }
 * @param ctx  { workouts: [...], workoutDates: Set, today, bodyweightKg }
 */
export function directiveProgress(d, ctx) {
  const out = {
    id: d?.id, title: d?.title || 'Directive',
    metric: d?.metric || 'none',
    target: Number(d?.target) || 0,
    current: 0, pct: 0, daysLeft: null, overdue: false,
    unit: (DIRECTIVE_METRICS[d?.metric] || DIRECTIVE_METRICS.none).unit,
  };
  if (!d || !ctx) return out;

  if (d.targetDate && ctx.today) {
    out.daysLeft = daysBetweenStr(ctx.today, d.targetDate);
    out.overdue = out.daysLeft < 0;
  }

  const since = d.since || '0000-01-01';
  const inScope = (ctx.workouts || []).filter((w) => w && w.date && w.date >= since && w.date <= ctx.today);

  switch (d.metric) {
    case 'longest_run_km':
      out.current = inScope.reduce((m, w) => Math.max(m, Number(w?.runSummary?.distKm) || 0), 0);
      break;
    case 'total_distance_km':
      out.current = inScope.reduce((t, w) => t + (Number(w?.runSummary?.distKm) || 0), 0);
      break;
    case 'training_days':
      out.current = new Set(inScope.map((w) => w.date)).size;
      break;
    case 'body_weight_kg':
      out.current = Number(ctx.bodyweightKg) || 0;
      break;
    default:
      out.current = 0;
  }

  if (out.target > 0) {
    /* A bodyweight goal can run downward, so progress is measured from where
       the Hunter started rather than from zero — otherwise cutting weight
       would read as losing ground. */
    if (d.metric === 'body_weight_kg' && Number(d.startValue) > 0) {
      const span = Number(d.startValue) - out.target;
      out.pct = span === 0 ? 100
        : Math.max(0, Math.min(100, ((Number(d.startValue) - out.current) / span) * 100));
    } else {
      out.pct = Math.max(0, Math.min(100, (out.current / out.target) * 100));
    }
  }
  return out;
}

/** Round a measure for display without pretending to precision it lacks. */
export function formatMeasure(value, metric) {
  const m = DIRECTIVE_METRICS[metric] || DIRECTIVE_METRICS.none;
  const n = Number(value) || 0;
  return m.decimals ? n.toFixed(m.decimals) : String(Math.round(n));
}
