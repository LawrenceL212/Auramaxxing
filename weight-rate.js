/* =========================================================================
   WEIGHT RATE — a weekly loss goal, and every weigh-in held up against it

   The Hunter picks an average to lose each week (say 0.5 kg). From the day
   they pick it, a line falls at that rate from their 7-day average on that
   day, and each weigh-in after it is judged by its own 7-day average against
   where the line is on that date: ahead, on pace or behind, by how much. The
   average loss per week since the goal started, and this week's average
   against last week's, say how the weeks are going as a whole.

   One reading is noise (water, salt, food), so nothing here judges a single
   scale number: it is always the 7-day average.

   Pure: takes plain `{ date, weight }` entries (kg) and the stored goal
   `{ kgPerWeek, since }` (users.weightRateGoal, kgPerWeek negative for a
   loss), returns plain data. Reads and writes nothing; nothing here feeds XP
   or progression. Tested by node test/weight-rate.test.mjs
   ========================================================================= */

import { shiftDay } from './streak.js';
import { daysBetween } from './hunt-view.js';
import { cleanWeights, averageAt, weeklyChange } from './weight-path.js';

/** The losses offered on the picker, kg a week. */
export const RATE_OPTIONS = [0.25, 0.5, 0.75, 1];
export const MAX_LOSS = 1.5;
export const MAX_GAIN = 1;
/** Within this many kg of the line counts as on pace: a day of water is bigger than that. */
export const ON_PACE_KG = 0.3;
/** Above this share of bodyweight a week, a cut starts costing muscle. */
export const SAFE_SHARE = 0.01;
export const SHOW_ENTRIES = 7;

const r1 = (n) => Math.round(n * 10) / 10 + 0;
const r2 = (n) => Math.round(n * 100) / 100;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));

/** A usable goal from the stored field, or null. */
export function parseRateGoal(g) {
  if (!g || !isDate(g.since)) return null;
  const k = Number(g.kgPerWeek);
  if (!Number.isFinite(k) || k === 0 || k < -MAX_LOSS || k > MAX_GAIN) return null;
  return { kgPerWeek: r2(k), since: g.since };
}

/** The field to store for a picked rate (kg a week, negative to lose), starting today. null when the rate is out of range. */
export function rateGoalField(kgPerWeek, today) {
  return parseRateGoal({ kgPerWeek, since: today });
}

/** The heaviest weekly loss that keeps muscle (1% of bodyweight), to 0.05 kg, or null with no weight. */
export function safeLoss(kg) {
  const v = Number(kg);
  return v > 0 ? Math.round(v * SAFE_SHARE * 20) / 20 : null;
}

/**
 * Where the line starts: the 7-day average on the day the goal was set, or,
 * with no weigh-in in the week before it, the first weigh-in after it.
 */
export function rateBase(weights, goal) {
  const list = cleanWeights(weights);
  if (!goal || !list.length) return null;
  const before = averageAt(list, goal.since);
  if (before !== null) return { date: goal.since, kg: r2(before) };
  const first = list.find(w => w.date > goal.since);
  return first ? { date: first.date, kg: first.weight } : null;
}

/** The weight the line expects on `date`. */
export function rateExpected(goal, base, date) {
  return r2(base.kg + goal.kgPerWeek * (daysBetween(base.date, date) / 7));
}

/** ahead · on · behind, from how far the 7-day average sits from the line in the goal's direction. */
function judge(goal, avg, expected) {
  const ahead = r1((avg - expected) * Math.sign(goal.kgPerWeek));
  return { ahead, status: ahead > ON_PACE_KG ? 'ahead' : ahead < -ON_PACE_KG ? 'behind' : 'on' };
}

/**
 * Everything the screen shows. null without a goal or a weigh-in on or after
 * the week before it started.
 *   current       7-day average at the latest weigh-in
 *   expected      where the line is on that date
 *   ahead         kg ahead of the line (positive) or behind it (negative)
 *   avgPerWeek    average change a week since the start (null until a week has passed)
 *   week          this week's average against last week's (weight-path.js weeklyChange)
 *   entries       the last weigh-ins since the start, newest first, each judged the same way
 */
export function rateTrack(weights, goalField, today) {
  const goal = parseRateGoal(goalField);
  const list = cleanWeights(weights).filter(w => w.date <= today);
  const base = goal && rateBase(list, goal);
  if (!base) return null;
  const last = list[list.length - 1];
  const current = r2(averageAt(list, last.date));
  const expected = rateExpected(goal, base, last.date);
  const days = daysBetween(base.date, last.date);
  const { ahead, status } = judge(goal, current, expected);
  const avgPerWeek = days >= 7 ? r2((current - base.kg) / (days / 7)) : null;
  const since = list.filter(w => w.date >= goal.since);
  const entries = since.slice(-SHOW_ENTRIES).reverse().map(w => {
    const avg = r2(averageAt(list, w.date));
    const exp = rateExpected(goal, base, w.date);
    return { date: w.date, weight: w.weight, avg: r1(avg), expected: r1(exp), ...judge(goal, avg, exp) };
  });
  return {
    kgPerWeek: goal.kgPerWeek, since: goal.since, base, latest: last.weight, latestDate: last.date,
    current: r1(current), expected: r1(expected), ahead, status, days, avgPerWeek,
    changed: r1(current - base.kg), week: weeklyChange(list, today), weighIns: since.length, entries,
    safe: safeLoss(current),
  };
}

/** Signed kg to one decimal with a real minus sign: "−0.5", "+0.2", "0.0". */
export function signed(n) {
  const v = r1(Number(n) || 0);
  return v === 0 ? '0.0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1);
}

/** Signed kg a week, to two decimals when it needs them: "−0.25", "−0.5". */
export function signedRate(n) {
  const v = r2(Number(n) || 0);
  const s = Math.abs(v).toFixed(2).replace(/0$/, '');
  return v === 0 ? '0.0' : (v > 0 ? '+' : '−') + s;
}

/** One plain sentence for the latest weigh-in against the line. */
export function rateLine(t) {
  if (!t) return '';
  const kg = (n) => Math.abs(n).toFixed(1) + ' kg';
  const verb = t.kgPerWeek < 0 ? 'lose' : 'gain';
  if (t.weighIns < 2) return `Line set: ${verb} ${Math.abs(t.kgPerWeek)} kg a week from ${t.base.kg.toFixed(1)} kg. Weigh in each day and each one is checked against it.`;
  if (t.status === 'on') return `On pace. Your 7-day average ${t.current.toFixed(1)} kg is right on the line (${t.expected.toFixed(1)} kg).`;
  if (t.status === 'ahead') return `Ahead of pace. Your 7-day average ${t.current.toFixed(1)} kg is ${kg(t.ahead)} past the line.`;
  return `Behind pace. Your 7-day average ${t.current.toFixed(1)} kg is ${kg(t.ahead)} short of the line (${t.expected.toFixed(1)} kg).`;
}

/** The average so far against the goal, as a sentence, or '' before a week has passed. */
export function averageLine(t) {
  if (!t || t.avgPerWeek === null) return '';
  const weeks = Math.floor(t.days / 7);
  const span = weeks === 1 ? '1 week' : `${weeks} weeks`;
  return `Averaging ${signedRate(t.avgPerWeek)} kg a week over ${span}, against a goal of ${signedRate(t.kgPerWeek)}.`;
}
