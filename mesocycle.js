/* =========================================================================
   TRAINING BLOCK — five weeks that build, one week that recovers

   A block is 6 weeks from a start date. Weeks 1-5 accumulate work and each
   asks for fewer reps in reserve than the last (RIR 3, 2, 2, 1, 0), so the
   Hunter gets closer to failure as the block goes. Week 6 is the deload: half
   the sets, the same weights, stop with 4 or more in reserve. When it ends the
   next block starts by itself.

   Guidance only: it never edits the plan, the logged sets or any XP. The one
   stored value is the block's start date. Pure; tested by
   node test/mesocycle.test.mjs
   ========================================================================= */

import { daysBetween } from './hunt-view.js';

export const BLOCK_WEEKS = 6;
export const RIR_TARGETS = [3, 2, 2, 1, 0];
export const DELOAD_RIR = 4;

const GUIDE = [
  'Set your base loads: leave 3 reps in reserve on every set.',
  'Add a rep or a little weight. Leave 2 in reserve.',
  'Keep adding. Still 2 in reserve; this is the volume week.',
  'Push closer: stop with 1 rep in reserve.',
  'Last hard week: take the final set of each lift to failure (0 in reserve).',
  'Deload: half the sets, the same weights, stop with 4 or more in reserve. Recovery is the work this week.',
];

/** Where today sits in the block, or null with no block or a start date in the future. */
export function blockState(block, today) {
  if (!block || !block.start || !today) return null;
  const days = daysBetween(block.start, today);
  if (!(days >= 0)) return null;
  const weeksIn = Math.floor(days / 7);
  const week = (weeksIn % BLOCK_WEEKS) + 1;
  const deload = week === BLOCK_WEEKS;
  return {
    week, weeks: BLOCK_WEEKS, blockNo: Math.floor(weeksIn / BLOCK_WEEKS) + 1,
    phase: deload ? 'deload' : 'accumulate',
    targetRir: deload ? DELOAD_RIR : RIR_TARGETS[week - 1],
    daysLeftInWeek: 7 - (days % 7),
    guidance: GUIDE[week - 1],
    label: deload ? 'Deload week' : `Week ${week} of ${BLOCK_WEEKS}`,
    setsFactor: deload ? 0.5 : 1,
  };
}

/** The 6 week dots for the block card. */
export function blockWeeks(state) {
  if (!state) return [];
  return Array.from({ length: BLOCK_WEEKS }, (_, i) => ({ week: i + 1, deload: i + 1 === BLOCK_WEEKS, done: i + 1 < state.week, current: i + 1 === state.week }));
}
