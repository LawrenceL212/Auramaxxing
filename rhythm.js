/* =========================================================================
   CHECK-IN RHYTHM — the small thing daily, the bigger things less often

   A full body scan every day is how check-ins die. This splits measuring into
   three sizes by how fast the number really moves:

   - Weigh in    every day    ~10 seconds   (weight is noisy: the 7-day average counts)
   - Weekly tape every 7 days  ~3 minutes   (waist, shoulders, chest, arms: slow to change)
   - Full scan   every 28 days ~8 minutes   (calipers and thigh: slower still)

   It says which one is due now, always leading with the smallest ask, and gives
   an instant, honest reward after a weigh-in (what the average did, the week's
   dots, the run of days). A bigger check-in also counts as the smaller ones.
   Reads dates only; writes nothing and feeds no XP. Pure.
   Tested by node test/rhythm.test.mjs
   ========================================================================= */

import { shiftDay } from './streak.js';
import { daysBetween } from './hunt-view.js';
import { weeklyChange } from './weight-path.js';

export const TIERS = {
  weigh: { key: 'weigh', title: 'Weigh in', time: '10 sec', everyDays: 1, what: 'Just your weight' },
  tape:  { key: 'tape', title: 'Weekly tape', time: '3 min', everyDays: 7, what: 'Waist, shoulders, chest, arms' },
  full:  { key: 'full', title: 'Full scan', time: '8 min', everyDays: 28, what: 'Tape plus skin folds and thigh' },
};
const ORDER = ['weigh', 'tape', 'full'];
const uniq = (list) => [...new Set((list || []).filter(Boolean))];
const latest = (dates, today) => uniq(dates).filter(d => d <= today).sort().pop() || null;

/**
 * ctx { today, weightDates: every weigh-in and check-in date, tapeDates: every check-in date,
 *       fullDates: check-in dates that had skin folds }
 * @returns { tiers: [{key,title,time,what,last,daysSince,due,overdue}], primary, alsoDue, week: [{date,done}], weighCount, streak, nudge }
 */
export function rhythmState(ctx) {
  const today = ctx.today;
  // a bigger check-in is also a smaller one
  const full = uniq(ctx.fullDates);
  const tape = uniq([...(ctx.tapeDates || []), ...full]);
  const weigh = uniq([...(ctx.weightDates || []), ...tape]).filter(d => d <= today);
  const lists = { weigh, tape, full };
  const tiers = ORDER.map(k => {
    const t = TIERS[k];
    const last = latest(lists[k], today);
    const daysSince = last ? daysBetween(last, today) : null;
    const due = daysSince === null || daysSince >= t.everyDays;
    return { ...t, last, daysSince, due, overdue: daysSince === null ? null : Math.max(0, daysSince - t.everyDays) };
  });
  // lead with the smallest ask that is due
  const dueList = tiers.filter(t => t.due);
  const primary = dueList.length ? dueList[0] : null;
  const alsoDue = dueList.slice(1);

  const week = Array.from({ length: 7 }, (_, i) => { const d = shiftDay(today, i - 6); return { date: d, done: weigh.includes(d) }; });
  const weighCount = week.filter(d => d.done).length;
  // the run of days: counted back from today, or from yesterday while today is still open
  let streak = 0;
  for (let d = weigh.includes(today) ? today : shiftDay(today, -1); weigh.includes(d); d = shiftDay(d, -1)) streak++;

  const wt = tiers[0];
  let nudge;
  if (!wt.due) nudge = 'Weighed in today. Nothing else is needed.';
  else if (wt.daysSince === null) nudge = 'Start here: one weigh-in takes ten seconds.';
  else if (wt.daysSince === 1) nudge = 'Weigh in today and the run keeps going. One miss is nothing; two starts a gap.';
  else nudge = `${wt.daysSince} days since your last weigh-in. Just the scale today, nothing else.`;
  return { tiers, primary, alsoDue, week, weighCount, streak, nudge };
}

/**
 * What to say right after a weigh-in. Weight is noisy, so the line is about the
 * 7-day average, and a bad day is put in its place instead of cheered or feared.
 * weights: [{date, weight}] including the one just logged.
 */
export function weighInReward({ weights, today, kg, streak = 0, weighCount = 0 }) {
  const wk = weeklyChange(weights, today);
  const prev = (weights || []).filter(w => w.date < today).sort((a, b) => a.date.localeCompare(b.date)).pop();
  const dayDiff = prev ? Math.round((kg - Number(prev.weight)) * 10) / 10 : null;
  let headline = 'Logged';
  if (streak >= 7) headline = `${streak} days in a row`;
  else if (streak >= 3) headline = `${streak} in a row`;
  else if (weighCount >= 5) headline = 'A solid week';
  let line;
  if (!wk) line = 'The trend appears after a week of weigh-ins. Keep going.';
  else if (Math.abs(wk.diff) < 0.2) line = `Your 7-day average is steady at ${wk.thisAvg} kg. Steady is information too.`;
  else if (wk.diff < 0) line = `Your 7-day average is down ${Math.abs(wk.diff)} kg to ${wk.thisAvg}. That is the number that counts.`;
  else line = `Your 7-day average is up ${wk.diff} kg to ${wk.thisAvg}. One week is noise; judge it over a month.`;
  const noisy = dayDiff !== null && Math.abs(dayDiff) >= 0.8;
  const note = noisy ? `Today is ${dayDiff > 0 ? '+' : ''}${dayDiff} kg on yesterday. Water and food swing weight by that much; ignore it.` : '';
  return { headline, line, note, avg: wk ? wk.thisAvg : null, trend: wk ? wk.diff : null, dayDiff };
}
