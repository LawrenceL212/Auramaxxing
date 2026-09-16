/* Tests for re-entry detection and directives.  node test/goals.test.mjs */

import {
  detectReEntry, reEntryPlan, directiveProgress, formatMeasure, REENTRY_GAP_DAYS,
  countdown, formatCountdown, deadlineMs, timeElapsedFraction, buildDirectivesICS,
} from '../goals.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}
const re = (today, days, extra = {}) =>
  detectReEntry({ today, workoutDates: new Set(days), ...extra });

// ── re-entry detection ────────────────────────────────────────────────────
check('trained today -> no re-entry',
  re('2026-09-16', ['2026-09-16']).isReEntry, false);
check('one day off -> no re-entry',
  re('2026-09-16', ['2026-09-15']).isReEntry, false);
check('four days off -> still under the threshold',
  re('2026-09-16', ['2026-09-12']).isReEntry, false);
check('five days off -> re-entry',
  re('2026-09-16', ['2026-09-11']).isReEntry, true);
check('gap is measured from the LAST session',
  re('2026-09-16', ['2026-08-01', '2026-09-11']).gapDays, 5);
check('a long gap reports its length',
  re('2026-09-16', ['2026-08-16']).gapDays, 31);
check('no workouts at all -> no re-entry (nothing to return from)',
  re('2026-09-16', []).isReEntry, false);
check('a future-dated session cannot mask a gap',
  re('2026-09-16', ['2026-09-01', '2026-12-25']).isReEntry, true);

// acknowledgement is keyed to the session returned from, so one gap asks once
check('already acknowledged for this gap',
  re('2026-09-16', ['2026-09-10'], { acknowledgedFor: '2026-09-10' }).alreadyAcknowledged, true);
check('acknowledging an older gap does not silence a new one',
  re('2026-09-16', ['2026-09-10'], { acknowledgedFor: '2026-08-01' }).alreadyAcknowledged, false);
check('threshold is configurable',
  re('2026-09-16', ['2026-09-14'], { threshold: 2 }).isReEntry, true);

// ── the reduced first Hunt back ───────────────────────────────────────────
check('sets are halved and never fall below one',
  reEntryPlan([{ name: 'A', sets: 4 }, { name: 'B', sets: 3 }, { name: 'C', sets: 1 }])
    .map((e) => e.sets), [2, 2, 1]);
check('the full target is kept for display',
  reEntryPlan([{ name: 'A', sets: 4 }])[0]._fullSets, 4);
check('an empty plan is safe', reEntryPlan(null), []);

// ── directives ────────────────────────────────────────────────────────────
const W = [
  { date: '2026-08-10', runSummary: { distKm: 5 } },
  { date: '2026-09-01', runSummary: { distKm: 12.5 } },
  { date: '2026-09-10', runSummary: { distKm: 8 } },
  { date: '2026-09-10' },
];
const gctx = { workouts: W, today: '2026-09-16', bodyweightKg: 82 };

check('longest run picks the best single run',
  directiveProgress({ metric: 'longest_run_km', target: 21.1 }, gctx).current, 12.5);
check('and its percentage',
  Math.round(directiveProgress({ metric: 'longest_run_km', target: 21.1 }, gctx).pct), 59);
check('total distance sums every run',
  directiveProgress({ metric: 'total_distance_km', target: 100 }, gctx).current, 25.5);
check('training days counts distinct dates, not documents',
  directiveProgress({ metric: 'training_days', target: 10 }, gctx).current, 3);
check('`since` scopes a directive to work after it was set',
  directiveProgress({ metric: 'total_distance_km', target: 100, since: '2026-09-01' }, gctx).current, 20.5);
check('days left counts down to the target date',
  directiveProgress({ metric: 'none', targetDate: '2026-10-01' }, gctx).daysLeft, 15);
check('a passed date reads overdue',
  directiveProgress({ metric: 'none', targetDate: '2026-09-01' }, gctx).overdue, true);
check('progress is capped at 100',
  Math.round(directiveProgress({ metric: 'training_days', target: 2 }, gctx).pct), 100);
check('no target -> no percentage',
  directiveProgress({ metric: 'training_days' }, gctx).pct, 0);

// bodyweight can run downward, so it is measured from the starting point
check('a cut measures from where it started',
  Math.round(directiveProgress(
    { metric: 'body_weight_kg', target: 78, startValue: 86 }, gctx).pct), 50);
check('a cut that overshoots still caps at 100',
  Math.round(directiveProgress(
    { metric: 'body_weight_kg', target: 84, startValue: 86 }, { ...gctx, bodyweightKg: 80 }).pct), 100);

check('formatMeasure respects each metric\'s precision',
  [formatMeasure(12.456, 'longest_run_km'), formatMeasure(3.4, 'training_days')], ['12.46', '3']);

// ── the live deadline ─────────────────────────────────────────────────────
// The deadline is the END of the target day: on race morning it is not missed.
const NOON = (d) => new Date(d + 'T12:00:00').getTime();

check('a date with no time still resolves to a deadline',
  deadlineMs('2026-10-01') > NOON('2026-10-01'), true);
check('no target date -> no countdown', countdown(null), null);
check('mid-morning on the target day is not past',
  countdown('2026-10-01', new Date('2026-10-01T09:00:00')).past, false);
check('and reads in hours, not a flat zero',
  countdown('2026-10-01', new Date('2026-10-01T09:00:00')).days, 0);
check('the following morning IS past',
  countdown('2026-10-01', new Date('2026-10-02T09:00:00')).past, true);
check('days remaining counts whole days',
  countdown('2026-10-01', NOON('2026-09-16')).days, 15);
check('hours fill the rest of the day',
  countdown('2026-10-01', NOON('2026-09-16')).hours, 11);

// precision rises as the date closes in
check('far out, days alone',
  formatCountdown(countdown('2026-12-25', NOON('2026-09-16'))), '100 days');
check('inside a month, days and hours',
  formatCountdown(countdown('2026-10-01', NOON('2026-09-16'))), '15 days 11h');
check('the last full day',
  formatCountdown(countdown('2026-10-01', new Date('2026-09-30T13:00:00'))), '1 day 10h');
check('the final afternoon counts in hours',
  formatCountdown(countdown('2026-10-01', new Date('2026-10-01T18:30:00'))), '5h 29m left');
check('a missed date says how long ago',
  formatCountdown(countdown('2026-09-01', NOON('2026-09-16'))), '14 days past');

check('elapsed fraction runs from `since` to the deadline',
  Math.round(timeElapsedFraction(
    { since: '2026-09-01', targetDate: '2026-10-01' }, NOON('2026-09-16')) * 100), 50);
check('elapsed fraction is clamped, never negative',
  timeElapsedFraction({ since: '2026-09-01', targetDate: '2026-10-01' }, NOON('2026-08-01')), 0);
check('no target date -> nothing elapsed',
  timeElapsedFraction({ since: '2026-09-01' }, NOON('2026-09-16')), 0);

// ── calendar export ───────────────────────────────────────────────────────
const ICS = buildDirectivesICS([
  { id: 'd1', title: 'Run a half marathon', targetDate: '2026-11-01',
    metric: 'longest_run_km', target: 21.1, why: 'Because I said I would; keep, the promise' },
  { id: 'd2', title: 'No date, skipped', metric: 'none' },
], new Date('2026-09-16T12:00:00Z'));

check('only dated directives are exported',
  (ICS.match(/BEGIN:VEVENT/g) || []).length, 1);
check('an undated directive is left out', ICS.includes('No date'), false);
check('the event is all-day and DTEND is exclusive',
  [ICS.includes('DTSTART;VALUE=DATE:20261101'), ICS.includes('DTEND;VALUE=DATE:20261102')], [true, true]);
check('semicolons and commas in the reason are escaped, not left to break the field',
  ICS.includes('would\\; keep\\, the promise'), true);
check('the reason travels into the calendar',
  ICS.includes('Why you started:'), true);
check('one alarm per configured lead time',
  (ICS.match(/BEGIN:VALARM/g) || []).length, 3);
check('alarms use relative day triggers',
  [ICS.includes('TRIGGER:-P30D'), ICS.includes('TRIGGER:-P7D'), ICS.includes('TRIGGER:-P1D')],
  [true, true, true]);
check('CRLF line endings, as RFC 5545 requires',
  ICS.includes('\r\n') && !/[^\r]\n/.test(ICS), true);
check('no line exceeds the 75-character fold width',
  ICS.split('\r\n').every((l) => l.length <= 75), true);
check('the calendar is closed properly',
  ICS.trim().endsWith('END:VCALENDAR'), true);
check('nothing dated -> no file at all',
  buildDirectivesICS([{ title: 'x' }]), '');

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
