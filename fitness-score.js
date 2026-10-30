/* =========================================================================
   FITNESS LEVEL — one score from strength, consistency and body

   Folds three things the app already knows into a single 0-100 number so a
   Hunter can see where they stand and which part is holding them back:

   - Strength (40): the best lifts' strength tiers against bodyweight, as the
     app's existing standards tables give them (passed in as tier names, so the
     tables stay in one place).
   - Consistency (30): sessions in the last 28 days against the weekly goal,
     plus the current streak.
   - Body (30): body fat against the healthy-athletic band, waist ÷ height and
     FFMI, from the latest check-in (body-metrics.js).

   A part with no data is left out and the rest are re-weighted, and the result
   says so. It is a guide to compare with yourself over time, not a medical or
   athletic rating. Pure: reads nothing, writes nothing, feeds no XP.
   Tested by node test/fitness-score.test.mjs
   ========================================================================= */

import { shiftDay } from './streak.js';

export const TIERS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const TIER_POINTS = [10, 30, 55, 80, 100];
const WEIGHTS = { strength: 40, consistency: 30, body: 30 };
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const r0 = (n) => Math.round(n);

/** Piecewise-linear score through [value, score] points, flat beyond the ends. */
function curve(points, v) {
  if (v <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (v <= x1) return y0 + (y1 - y0) * ((v - x0) / (x1 - x0));
  }
  return points[points.length - 1][1];
}

// Body fat: full marks across the athletic-to-fit band (ACE), falling away either side.
const BF_CURVE = {
  male:   [[3, 0], [8, 100], [18, 100], [25, 55], [35, 0]],
  female: [[8, 0], [14, 100], [25, 100], [32, 55], [42, 0]],
};
const WHTR_CURVE = [[0.42, 100], [0.5, 80], [0.6, 20], [0.7, 0]];
const FFMI_CURVE = {
  male:   [[16, 0], [19, 35], [22, 75], [25, 100]],
  female: [[12, 0], [15, 35], [18, 75], [21, 100]],
};

function strengthPart(lifts) {
  const tiers = (lifts || []).map(l => TIERS.indexOf(l && l.tier)).filter(i => i >= 0).sort((a, b) => b - a);
  if (!tiers.length) return null;
  const best = tiers.slice(0, 6);
  const score = r0(best.reduce((t, i) => t + TIER_POINTS[i], 0) / best.length);
  const top = (lifts || []).filter(l => TIERS.indexOf(l.tier) === tiers[0])[0];
  const low = (lifts || []).filter(l => TIERS.indexOf(l.tier) >= 0).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))[0];
  return { key: 'strength', label: 'Strength', score, detail: `Best: ${top.name} · ${top.tier}${best.length > 1 ? ` · ${best.length} lifts counted` : ''}`, lowest: low };
}

function consistencyPart(ctx) {
  const today = ctx.today;
  const goal = Math.max(1, Number(ctx.weeklyGoal) || 3);
  const dates = [...new Set((ctx.sessionDates || []).filter(d => d <= today))];
  const n28 = dates.filter(d => d >= shiftDay(today, -27)).length;
  const streak = Math.max(0, Number(ctx.streak) || 0);
  const adherence = Math.min(1, n28 / (goal * 4));
  const score = r0(adherence * 70 + Math.min(streak, 28) / 28 * 30);
  return { key: 'consistency', label: 'Consistency', score, detail: `${n28} sessions in 28 days (goal ${goal * 4})${streak ? ` · ${streak}-day streak` : ''}`, n28, goal4: goal * 4 };
}

function bodyPart(ctx) {
  const m = ctx.body;
  if (!m) return null;
  const sex = m.sex === 'female' ? 'female' : 'male';
  const bits = [];
  if (m.bodyFat != null) bits.push(['body fat', curve(BF_CURVE[sex], m.bodyFat), `${m.bodyFat}% fat`]);
  if (m.waistToHeight != null) bits.push(['waist', curve(WHTR_CURVE, m.waistToHeight), `waist ÷ height ${m.waistToHeight}`]);
  if (m.ffmi != null) bits.push(['muscle', curve(FFMI_CURVE[sex], m.ffmi), `FFMI ${m.ffmi}`]);
  if (!bits.length) return null;
  const score = r0(bits.reduce((t, b) => t + b[1], 0) / bits.length);
  return { key: 'body', label: 'Body', score, detail: bits.map(b => b[2]).join(' · '), weakest: bits.slice().sort((a, b) => a[1] - b[1])[0][0] };
}

const LABELS = [[25, 'Starting'], [45, 'Building'], [65, 'Solid'], [80, 'Strong'], [Infinity, 'Elite']];

/**
 * ctx { sex, today, lifts: [{name, tier}], sessionDates: [...], weeklyGoal, streak, body: bodyMetrics() | null }
 * @returns { score, label, parts:[{key,label,score,detail,weight}], missing:[key], next:{key,text} } or null
 */
export function fitnessScore(ctx) {
  if (!ctx || !ctx.today) return null;
  const parts = [strengthPart(ctx.lifts), consistencyPart(ctx), bodyPart(ctx)].filter(Boolean);
  const missing = ['strength', 'consistency', 'body'].filter(k => !parts.some(p => p.key === k));
  const total = parts.reduce((t, p) => t + WEIGHTS[p.key], 0);
  parts.forEach(p => { p.weight = r0(WEIGHTS[p.key] / total * 100); });
  const score = r0(parts.reduce((t, p) => t + p.score * WEIGHTS[p.key], 0) / total);
  const label = LABELS.find(([max]) => score < max)[1];

  // the single next step: the weakest part with something to do
  const byWeak = parts.slice().sort((a, b) => a.score - b.score);
  let next = { key: null, text: 'Hold the plan and keep logging.' };
  for (const p of byWeak) {
    if (p.score >= 80) break;
    if (p.key === 'consistency') { next = { key: 'consistency', text: p.n28 >= p.goal4 ? 'Keep the streak alive: a session every planned day.' : `Hit your weekly goal: ${p.goal4 - p.n28} more sessions over the last 28 days would max this out.` }; break; }
    if (p.key === 'strength') { next = { key: 'strength', text: p.lowest ? `Push ${p.lowest.name} (${p.lowest.tier}). Add a little weight or a rep each week.` : 'Log the main lifts with weight so strength can be rated.' }; break; }
    if (p.key === 'body') { next = { key: 'body', text: p.weakest === 'waist' ? 'Bring the waist down: it is the biggest lever on this part.' : p.weakest === 'muscle' ? 'Build muscle: heavy compound lifts and enough protein.' : 'Move body fat toward the athletic band.' }; break; }
  }
  if (missing.includes('strength') && next.key === null) next = { key: 'strength', text: 'Log the main lifts with weight so strength can be rated.' };
  if (missing.includes('body') && next.key === null) next = { key: 'body', text: 'Do a check-in so the body part can be scored.' };
  return { score, label, parts, missing, next };
}
