/* =========================================================================
   WEIGH-IN — the small pure pieces

   The one-tap weigh-in sheet (start value, steppers) and the "am I on track"
   view: the 7-day average that hides day-to-day water swings, the weekly
   rate, the change over 30 days, weigh-ins this week, and the pace toward a
   Bodyweight directive. Nothing here reads or writes stored state: every
   function takes plain `{ date, weight }` entries and returns plain data or an
   SVG string, so index.html stays presentation only and
   test/weigh-in.test.mjs can exercise it without a browser.
   ========================================================================= */

import { shiftDay } from './streak.js';
import { weekStartOf } from './plan-day.js';
import { daysBetween } from './hunt-view.js';

export const MIN_KG = 20;
export const MAX_KG = 400;
export const STEPS = [-0.5, -0.1, 0.1, 0.5];
export const AVG_DAYS = 7;
export const RATE_DAYS = 28;

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** Valid entries only, one per date (the last one wins), oldest first. */
export function cleanWeights(weights) {
  const byDate = new Map();
  for (const w of weights || []) {
    const kg = Number(w && w.weight);
    if (!w || typeof w.date !== 'string' || !(kg >= MIN_KG && kg <= MAX_KG)) continue;
    byDate.set(w.date, kg);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, weight]) => ({ date, weight }));
}

/** Where the sheet's big number starts: today's entry, else the last one, else the profile, else 70. */
export function startWeight(weights, today, profileKg) {
  const list = cleanWeights(weights);
  const t = list.find(w => w.date === today);
  if (t) return t.weight;
  if (list.length) return list[list.length - 1].weight;
  const p = Number(profileKg);
  return p >= MIN_KG && p <= MAX_KG ? r1(p) : 70;
}

/** One stepper tap, kept to 0.1 kg and inside the valid range. */
export function stepWeight(value, delta) {
  const v = Number(value);
  const base = Number.isFinite(v) && v > 0 ? v : 70;
  return Math.min(MAX_KG, Math.max(MIN_KG, r1(base + delta)));
}

/** A typed value as kg to 0.1, or null when it is not a believable weight. */
export function parseWeight(text) {
  const v = Number(String(text ?? '').replace(',', '.').trim());
  return Number.isFinite(v) && v >= MIN_KG && v <= MAX_KG ? r1(v) : null;
}

/** Mean of the entries in the 7 days ending on `date`, or null when there are none. */
export function averageAt(list, date) {
  const from = shiftDay(date, -(AVG_DAYS - 1));
  const vals = list.filter(w => w.date >= from && w.date <= date).map(w => w.weight);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Each entry with its 7-day average, for the trend line. */
export function trendSeries(weights) {
  const list = cleanWeights(weights);
  return list.map(w => ({ date: w.date, weight: w.weight, avg: r2(averageAt(list, w.date)) }));
}

/**
 * kg per week from a least-squares line through the last 28 days of entries.
 * null until there are 3 weigh-ins spread over at least a week: a slope from
 * two days of water weight would only mislead.
 */
export function weeklyRate(weights, today) {
  const list = cleanWeights(weights);
  const from = shiftDay(today, -(RATE_DAYS - 1));
  const pts = list.filter(w => w.date >= from && w.date <= today).map(w => [daysBetween(from, w.date), w.weight]);
  if (pts.length < 3 || pts[pts.length - 1][0] - pts[0][0] < 7) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den ? r2((num / den) * 7) : null;
}

/** Everything the on-track view shows, from the entries and today's date. */
export function weightStats(weights, today) {
  const list = cleanWeights(weights).filter(w => w.date <= today);
  const out = {
    count: list.length, latest: null, latestDate: null, previous: null, vsLast: null,
    avg7: null, change30: null, ratePerWeek: null, thisWeek: 0, loggedToday: false,
  };
  if (!list.length) return out;
  const last = list[list.length - 1];
  out.latest = last.weight;
  out.latestDate = last.date;
  out.loggedToday = last.date === today;
  if (list.length > 1) {
    out.previous = list[list.length - 2];
    out.vsLast = r1(last.weight - out.previous.weight);
  }
  out.avg7 = r1(averageAt(list, last.date));
  // 30-day change compares averages, not two single noisy days.
  const back = list.filter(w => w.date <= shiftDay(last.date, -30));
  if (back.length) out.change30 = r1(averageAt(list, last.date) - averageAt(list, back[back.length - 1].date));
  out.ratePerWeek = weeklyRate(list, today);
  const wk = weekStartOf(today);
  out.thisWeek = list.filter(w => w.date >= wk).length;
  return out;
}

/** Signed kg for display: "+0.4", "−1.2", "0.0". */
export function signedKg(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = r1(Number(n));
  if (v === 0) return '0.0';
  return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1);
}

/**
 * Pace toward a Bodyweight directive `{ target, startValue, targetDate }`.
 * status: reached · on (moving and in time) · behind (moving, too slowly for the
 * date) · off (flat or going the other way) · unknown (not enough weigh-ins yet).
 */
export function goalPace(stats, goal, today) {
  const target = Number(goal && goal.target);
  if (!(target > 0) || !stats || stats.latest === null) return null;
  const current = stats.avg7 ?? stats.latest;
  const start = Number(goal.startValue) > 0 ? Number(goal.startValue) : current;
  const dir = Math.sign(target - start) || Math.sign(target - current);
  const remaining = r1(target - current);
  const span = start - target;
  const pct = span === 0 ? 100 : Math.round(Math.max(0, Math.min(100, ((start - current) / span) * 100)));
  const out = { target, start: r1(start), current: r1(current), remaining, pct, status: 'unknown', weeksLeft: null, neededPerWeek: null, daysToDate: null };
  if (goal.targetDate && today) out.daysToDate = daysBetween(today, goal.targetDate);
  if (dir === 0 || (dir < 0 ? current <= target + 0.05 : current >= target - 0.05)) { out.status = 'reached'; out.pct = 100; return out; }
  if (out.daysToDate !== null && out.daysToDate > 0) out.neededPerWeek = r2(remaining / (out.daysToDate / 7));
  const rate = stats.ratePerWeek;
  if (rate === null || rate === undefined) return out;
  if (Math.abs(rate) < 0.05 || Math.sign(rate) !== dir) { out.status = 'off'; return out; }
  out.weeksLeft = Math.ceil(Math.abs(remaining) / Math.abs(rate));
  out.status = out.daysToDate !== null && out.daysToDate >= 0 && out.weeksLeft * 7 > out.daysToDate ? 'behind' : 'on';
  return out;
}

/** One plain sentence for the pace, for the sheet and the Codex card. */
export function paceLine(p) {
  if (!p) return '';
  const kg = (n) => Math.abs(n).toFixed(1) + ' kg';
  const wk = (n) => n === 1 ? '1 week' : `${n} weeks`;
  switch (p.status) {
    case 'reached': return `Goal reached: ${p.target} kg.`;
    case 'on': return `On track · about ${wk(p.weeksLeft)} to ${p.target} kg.`;
    case 'behind': return `Behind pace · needs ${kg(p.neededPerWeek)} a week to make the date.`;
    case 'off': return p.neededPerWeek !== null
      ? `Not moving toward ${p.target} kg yet · ${kg(p.neededPerWeek)} a week makes the date.`
      : `Not moving toward ${p.target} kg yet.`;
    default: return `${kg(p.remaining)} to go · log a few more weigh-ins to see your pace.`;
  }
}

/**
 * The trend chart as an SVG string: faint dots for each weigh-in, a solid line
 * for the 7-day average, a dashed line for the goal when it is near the data.
 * `days` limits the window; colours come from CSS variables so the theme holds.
 */
export function trendSvg(weights, { today, days = 30, goal = null, width = 320, height = 120 } = {}) {
  const all = trendSeries(weights);
  const from = today ? shiftDay(today, -(days - 1)) : null;
  const pts = from ? all.filter(p => p.date >= from && p.date <= today) : all;
  if (pts.length < 2) return '';
  const P = { t: 10, r: 10, b: 18, l: 34 };
  const gW = width - P.l - P.r, gH = height - P.t - P.b;
  const vals = pts.flatMap(p => [p.weight, p.avg]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const g = Number(goal) > 0 ? Number(goal) : null;
  const showGoal = g !== null && g >= lo - 3 && g <= hi + 3;
  if (showGoal) { lo = Math.min(lo, g); hi = Math.max(hi, g); }
  if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
  const x0 = from || pts[0].date;
  const spanDays = Math.max(1, daysBetween(x0, today || pts[pts.length - 1].date));
  const X = (d) => (P.l + (daysBetween(x0, d) / spanDays) * gW).toFixed(1);
  const Y = (v) => (P.t + gH - ((v - lo) / (hi - lo)) * gH).toFixed(1);
  const dots = pts.map(p => `<circle cx="${X(p.date)}" cy="${Y(p.weight)}" r="2.6" fill="var(--text-faint)" opacity=".7"/>`).join('');
  const line = pts.map(p => `${X(p.date)},${Y(p.avg)}`).join(' ');
  const last = pts[pts.length - 1];
  const goalLine = showGoal
    ? `<line x1="${P.l}" x2="${width - P.r}" y1="${Y(g)}" y2="${Y(g)}" stroke="var(--legendary)" stroke-width="1" stroke-dasharray="4 4" opacity=".8"/>` +
      `<text x="${width - P.r}" y="${(Number(Y(g)) - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--legendary)" font-family="var(--font-mono)">goal ${g}</text>`
    : '';
  const lbl = (v, y) => `<text x="${P.l - 6}" y="${y}" text-anchor="end" font-size="9" fill="var(--text-faint)" font-family="var(--font-mono)">${v.toFixed(1)}</text>`;
  const firstLbl = x0.slice(5).replace('-', '/'), lastLbl = (today || last.date).slice(5).replace('-', '/');
  return `<svg class="wt-trend" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Weight over the last ${days} days. Dots are weigh-ins, the line is the 7-day average." preserveAspectRatio="none">` +
    `<line x1="${P.l}" x2="${width - P.r}" y1="${P.t}" y2="${P.t}" stroke="rgba(91,168,255,.08)"/>` +
    `<line x1="${P.l}" x2="${width - P.r}" y1="${P.t + gH}" y2="${P.t + gH}" stroke="rgba(91,168,255,.12)"/>` +
    lbl(hi, P.t + 3) + lbl(lo, P.t + gH + 3) + goalLine + dots +
    `<polyline points="${line}" fill="none" stroke="var(--violet)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${X(last.date)}" cy="${Y(last.avg)}" r="4" fill="var(--violet)" stroke="var(--void)" stroke-width="1.5"/>` +
    `<text x="${P.l}" y="${height - 4}" font-size="9" fill="var(--text-faint)" font-family="var(--font-mono)">${firstLbl}</text>` +
    `<text x="${width - P.r}" y="${height - 4}" text-anchor="end" font-size="9" fill="var(--text-faint)" font-family="var(--font-mono)">${lastLbl}</text>` +
    `</svg>`;
}
