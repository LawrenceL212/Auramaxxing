/* =========================================================================
   SESSION FEEDBACK — four quick ratings that tune weekly volume

   After a session the Hunter taps four ratings (about ten seconds):
     pump        1 little     2 good        3 great
     soreness    1 none       2 manageable  3 heavy
     workload    1 easy       2 right       3 too hard
     performance 1 missed     2 hit it      3 beat it

   Each session's ratings are classified add / hold / reduce. A muscle group
   only gets a volume change when its last two sessions point the same way, so
   one odd day moves nothing. The change is one set, and it reaches the Hunter
   as an ordinary plan-optimiser suggestion they tap to apply.

     little pump, little soreness, easy         -> add a set
     good pump, manageable soreness              -> hold
     heavy soreness and poor recovery            -> take a set away

   Pure: reads plain values, writes nothing, feeds no XP.
   Tested by node test/session-feedback.test.mjs
   ========================================================================= */

import { shiftDay } from './streak.js';
import { daysBetween } from './hunt-view.js';

export const QUESTIONS = [
  { key: 'pump', title: 'Pump', ask: 'How much of a pump did you get?', options: ['Little', 'Good', 'Great'] },
  { key: 'soreness', title: 'Soreness', ask: 'How sore are you now?', options: ['None', 'Manageable', 'Heavy'] },
  { key: 'workload', title: 'Workload', ask: 'How hard was the volume?', options: ['Easy', 'Right', 'Too hard'] },
  { key: 'performance', title: 'Performance', ask: 'Did you complete the work?', options: ['Missed', 'Hit it', 'Beat it'] },
];
/** Sessions of a group that must agree, and how far back they count. */
export const SESSIONS_NEEDED = 2;
export const WINDOW_DAYS = 28;

const valid = (f) => f && QUESTIONS.every(q => [1, 2, 3].includes(Number(f[q.key])));

/** 'add' | 'hold' | 'reduce' for one session's four ratings, or null if they are incomplete. */
export function classify(f) {
  if (!valid(f)) return null;
  const { pump, soreness, workload, performance } = f;
  const low = (pump === 1 ? 1 : 0) + (soreness === 1 ? 1 : 0) + (workload === 1 ? 1 : 0);
  if ((soreness === 3 && (performance === 1 || workload === 3)) || (workload === 3 && performance === 1)) return 'reduce';
  if (low >= 2 && soreness < 3 && workload < 3 && performance >= 2) return 'add';
  return 'hold';
}

const WHY = {
  add: (g) => `Your last two ${g.toLowerCase()} sessions gave little pump and soreness and felt easy.`,
  reduce: (g) => `Your last two ${g.toLowerCase()} sessions left you very sore or struggling to finish the work.`,
};

/**
 * entries: [{ date, groups: [muscle group names the session trained], pump, soreness, workload, performance }]
 * @returns { nudges: { Group: 1 | -1 }, why: { Group: text } }
 */
export function volumeNudges({ entries, today }) {
  const recent = (entries || []).filter(e => e && e.date && e.date <= today && daysBetween(e.date, today) <= WINDOW_DAYS && classify(e))
    .sort((a, b) => b.date.localeCompare(a.date));
  const groups = [...new Set(recent.flatMap(e => e.groups || []))];
  const nudges = {}, why = {};
  for (const g of groups) {
    const last = recent.filter(e => (e.groups || []).includes(g)).slice(0, SESSIONS_NEEDED);
    if (last.length < SESSIONS_NEEDED) continue;
    const kinds = last.map(classify);
    if (kinds.every(k => k === 'add')) { nudges[g] = 1; why[g] = WHY.add(g); }
    else if (kinds.every(k => k === 'reduce')) { nudges[g] = -1; why[g] = WHY.reduce(g); }
  }
  return { nudges, why };
}

/**
 * The date of the latest session within two days that has no feedback yet, or null.
 * workoutDates: the Hunter's session dates; feedbackDates: dates already rated.
 */
export function pendingFeedback({ workoutDates, feedbackDates, today }) {
  const have = new Set(feedbackDates || []);
  const d = [...new Set(workoutDates || [])].filter(x => x <= today && daysBetween(x, today) <= 2).sort().pop();
  return d && !have.has(d) ? d : null;
}

/** Feedback dates old enough to prune, so the stored map stays small. */
export function staleFeedbackDates(map, today, keepDays = 60) {
  return Object.keys(map || {}).filter(d => d < shiftDay(today, -keepDays));
}
