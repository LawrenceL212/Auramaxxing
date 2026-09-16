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

/* ── THE LIVE DEADLINE ────────────────────────────────────────────────────
   "45 days left" is a fact. It is not a deadline, because it reads the same
   all day and so never moves while you are looking at it.

   The deadline is the END of the target day, not its start: a race is run on
   that date, so at 08:00 on race day you have not missed it. That also means
   the last day reads in hours rather than collapsing to a flat zero. */

export function deadlineMs(targetDate) {
  if (!targetDate) return null;
  const t = new Date(targetDate + 'T23:59:59.999');
  return Number.isNaN(t.getTime()) ? null : t.getTime();
}

/**
 * Time remaining, broken down for display.
 * @returns { days, hours, minutes, totalMs, past } or null with no target date
 */
export function countdown(targetDate, now = Date.now()) {
  const end = deadlineMs(targetDate);
  if (end === null) return null;
  const totalMs = end - (now instanceof Date ? now.getTime() : now);
  const abs = Math.abs(totalMs);
  return {
    totalMs,
    past: totalMs < 0,
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
  };
}

/**
 * How a countdown should read. Precision rises as the date closes in, because
 * "3 weeks" is the honest unit at three weeks and a uselessly vague one on the
 * final afternoon.
 */
export function formatCountdown(c) {
  if (!c) return '';
  if (c.past) return c.days === 0 ? 'today' : c.days + (c.days === 1 ? ' day past' : ' days past');
  if (c.days === 0) return c.hours > 0 ? c.hours + 'h ' + c.minutes + 'm left' : c.minutes + 'm left';
  if (c.days === 1) return '1 day ' + c.hours + 'h';
  if (c.days <= 30) return c.days + ' days ' + c.hours + 'h';
  return c.days + ' days';
}

/** Fraction of the run from `since` to the target date already elapsed (0–1). */
export function timeElapsedFraction(d, now = Date.now()) {
  const end = deadlineMs(d?.targetDate);
  if (end === null) return 0;
  const start = new Date((d.since || d.createdAt || '') + 'T00:00:00').getTime();
  if (Number.isNaN(start) || end <= start) return 0;
  const n = now instanceof Date ? now.getTime() : now;
  return Math.max(0, Math.min(1, (n - start) / (end - start)));
}

/* ── CALENDAR EXPORT ──────────────────────────────────────────────────────
   The app can only remind a Hunter who opens the app, which is exactly the
   Hunter who does not need reminding. The phone's own calendar reminds the one
   who has not opened it in a week, so the directive is exported there rather
   than the app pretending it can reach out on its own. */

/** RFC 5545 escaping for TEXT values. */
function icsText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
    .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets per RFC 5545, continuing with a leading space. */
function icsFold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) { parts.push(' ' + rest.slice(0, 74)); rest = rest.slice(74); }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

const icsDate = (d) => String(d).replace(/-/g, '');

function icsStamp(now) {
  const d = now instanceof Date ? now : new Date(now);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Day after `dateStr` — an all-day VEVENT's DTEND is exclusive. */
function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0')].join('');
}

/** Lead times for the alarms on each directive, in days before the date. */
export const ICS_ALARMS = [30, 7, 1];

/**
 * An .ics calendar for every directive that has a target date.
 *
 * The reason the Hunter wrote down travels into the event description, because
 * the point of the reminder is not the date — they know the date — it is being
 * shown again why they set it.
 *
 * @returns iCalendar text, or '' if nothing has a date to export.
 */
export function buildDirectivesICS(directives, now = Date.now()) {
  const dated = (directives || []).filter((d) => d && d.title && d.targetDate);
  if (!dated.length) return '';

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Auramaxxing//Directives//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  ];

  for (const d of dated) {
    /* Escaped individually, then joined on the literal two-character \n that
       RFC 5545 uses for a line break inside a TEXT value — a reason with a
       comma or semicolon in it would otherwise terminate the field early and
       corrupt the event. */
    const why = d.why ? 'Why you started: ' + icsText(d.why) : '';
    const targetLine = Number(d.target) > 0
      ? icsText('Target: ' + d.target + ' ' +
          (DIRECTIVE_METRICS[d.metric] || DIRECTIVE_METRICS.none).unit)
      : '';
    const desc = [why, targetLine, 'Set in Auramaxxing.'].filter(Boolean).join('\\n');

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + icsText(d.id || ('dir-' + icsDate(d.targetDate))) + '@auramaxxing');
    lines.push('DTSTAMP:' + icsStamp(now));
    lines.push('DTSTART;VALUE=DATE:' + icsDate(d.targetDate));
    lines.push('DTEND;VALUE=DATE:' + nextDay(d.targetDate));
    lines.push('SUMMARY:' + icsText('◈ ' + d.title));
    lines.push('DESCRIPTION:' + desc);
    lines.push('TRANSP:TRANSPARENT');
    for (const days of ICS_ALARMS) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY',
        'DESCRIPTION:' + icsText(days + ' days: ' + d.title + (d.why ? ' — ' + d.why : '')),
        'TRIGGER:-P' + days + 'D', 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/**
 * The DIRECTIVES block for the iOS home screen widget (widget/README.md).
 *
 * iOS home screen widgets are WidgetKit, which is native Swift only — a PWA
 * cannot publish one. The supported route is a host app that runs scripts, so
 * the app generates the config rather than making the Hunter keep the same
 * dates correct in two places by hand.
 *
 * @param ctx { workouts, today, bodyweightKg } — the same context directives
 *             are scored against, so the widget opens at the real numbers.
 */
export function buildWidgetConfig(directives, ctx) {
  const list = (directives || []).filter((d) => d && d.title && d.targetDate);
  const entries = list.map((d) => {
    const p = ctx ? directiveProgress(d, ctx) : null;
    const e = { title: d.title, date: d.targetDate };
    if (d.why) e.why = d.why;
    if (p && p.target > 0) {
      e.now = Number(p.current.toFixed(2));
      e.target = Number(p.target);
      if (p.unit) e.unit = p.unit;
    }
    return e;
  });
  const body = entries.length
    ? entries.map((e) => '  ' + JSON.stringify(e)).join(',\n')
    : '  // Set a directive with a target date in Auramaxxing first.';
  return 'const DIRECTIVES = [\n' + body + '\n];';
}
