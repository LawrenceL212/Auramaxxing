/* =========================================================================
   PENALTY ZONE NOTICE — the words and numbers on it

   checkPenalty() in index.html decides and writes the penalty (5% of Aura
   Points, at least 5, for a missed scheduled day). This file only turns what
   that already did into the plain facts the notice shows: which day was
   missed, what it cost, what was left alone and what keeps the next one away.
   Pure and read-only, so test/penalty-view.test.mjs can check it. Presentation
   only: it changes no rule and no stored value.
   ========================================================================= */

import { weekdayOf, shiftDay } from './streak.js';
import { scheduledWeekdays } from './hunt-view.js';

const LONG = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

/** The plan day that was set for `weekday`, or null (fixed plans only). */
function plannedName(program, weekday) {
  const days = program && Array.isArray(program.days) ? program.days : [];
  const fixed = program && program.scheduleMode === 'fixed' && days.some(d => (d.assignedDays || []).length);
  if (!fixed) return null;
  const d = days.find(x => (x.assignedDays || []).includes(weekday));
  return d && d.name ? String(d.name) : null;
}

/** "Today" when today is a training day, else the next one's weekday name (null if none can be told). */
export function nextTrainingLabel(program, today) {
  const wds = scheduledWeekdays(program);
  if (!wds) return 'Today';
  if (wds.includes(weekdayOf(today))) return 'Today';
  for (let step = 1; step <= 7; step++) {
    const wd = weekdayOf(shiftDay(today, step));
    if (wds.includes(wd)) return step === 1 ? 'Tomorrow' : LONG[wd];
  }
  return null;
}

/**
 * Everything the notice prints.
 *   apLost, apBefore  what was docked and the balance before it
 *   missedDate        YYYY-MM-DD of the missed training day
 *   program           the plan (may be null), today  YYYY-MM-DD
 */
export function penaltyView({ apLost, apBefore, missedDate, program, today }) {
  const lost = Math.max(0, Math.round(Number(apLost) || 0));
  const before = Math.max(0, Math.round(Number(apBefore) || 0));
  const after = Math.max(0, before - lost);
  const wd = weekdayOf(missedDate);
  const planned = plannedName(program, wd);
  const missed = LONG[wd] || 'Yesterday';
  const next = nextTrainingLabel(program, today);
  const bigger = lost > Math.round(before * 0.05) || before < 100;
  return {
    eyebrow: 'System Alert',
    title: 'Penalty Zone',
    cause: planned ? `${missed}'s ${planned} Hunt went unfinished.` : `${missed} was a training day. No session was logged.`,
    cost: `−${lost} AP`,
    balance: `${before} → ${after} AP`,
    rule: bigger
      ? 'A missed training day costs 5% of your Aura Points, never less than 5.'
      : 'A missed training day costs 5% of your Aura Points.',
    untouched: 'Level, XP, stat ranks and PRs are untouched. Only Aura Points were docked.',
    clear: next === 'Today'
      ? 'Train today and the System finds nothing to dock tomorrow.'
      : next === 'Tomorrow'
        ? 'Tomorrow is your next training day. Train then and nothing more is docked.'
      : next
        ? `Your next training day is ${next}. Train then and nothing more is docked.`
        : 'Train on your next planned day and nothing more is docked.',
    lost, before, after,
  };
}
