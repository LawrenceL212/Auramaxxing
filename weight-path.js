/* =========================================================================
   WEIGHT PATH — a weight goal as a path, not just a number

   Borrowed from the weight-loss spreadsheet that worked for enzo: the goal
   draws a straight "where you should be today" line from the start weight
   and date to the goal weight and date, the real trend is held up against
   it, and the sheet's headline numbers fall out of that gap: ahead or behind
   in kg today, the date you will finish at your current pace against the date
   you chose, the share of the goal done, the lowest weight so far, and what
   pace you now need. It also compares this week's average to last week's, so
   a noisy scale still gives one honest weekly answer, and logging every few
   days is enough.

   Pure: takes plain `{ date, weight }` entries (kg) and a Bodyweight
   directive `{ target, startValue, since|createdAt, targetDate }`, returns
   plain data or an SVG string. Reads and writes nothing. Presentation only;
   nothing here feeds XP or progression. Tested by node test/weight-path.test.mjs
   ========================================================================= */

import { shiftDay } from './streak.js';
import { daysBetween } from './hunt-view.js';

export const MIN_KG = 20;
export const MAX_KG = 400;
export const KCAL_PER_KG = 7700;
const AVG_DAYS = 7;
const RATE_DAYS = 28;
const ON_PATH_KG = 0.5;

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** Valid entries only, one per date (the last wins), oldest first. */
export function cleanWeights(weights) {
  const byDate = new Map();
  for (const w of weights || []) {
    const kg = Number(w && w.weight);
    if (!w || !/^\d{4}-\d{2}-\d{2}$/.test(String(w.date)) || !(kg >= MIN_KG && kg <= MAX_KG)) continue;
    byDate.set(w.date, kg);
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, weight]) => ({ date, weight }));
}

/** Mean of the entries in the 7 days ending on `date`, or null. */
export function averageAt(list, date) {
  const from = shiftDay(date, -(AVG_DAYS - 1));
  const vals = list.filter(w => w.date >= from && w.date <= date).map(w => w.weight);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Entries with the 7-day average, oldest first. */
export function trendSeries(weights) {
  const list = cleanWeights(weights);
  return list.map(w => ({ date: w.date, weight: w.weight, avg: r2(averageAt(list, w.date)) }));
}

/**
 * kg per week from a least-squares line through the last 28 days. null until
 * there are 3 weigh-ins spread over a week: two days of water is not a trend.
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

/**
 * This week's average against last week's: the sheet's Saturday number
 * without needing a Saturday. Each side needs at least one entry.
 */
export function weeklyChange(weights, today) {
  const list = cleanWeights(weights).filter(w => w.date <= today);
  const thisAvg = averageAt(list, today);
  const lastAvg = averageAt(list, shiftDay(today, -AVG_DAYS));
  if (thisAvg === null || lastAvg === null) return null;
  return { thisAvg: r1(thisAvg), lastAvg: r1(lastAvg), diff: r1(thisAvg - lastAvg) };
}

/** A usable goal from a directive, or null: needs a target and a start. */
export function parseGoal(d) {
  if (!d) return null;
  // a goal that already carries a path (cut, then build) is passed through
  if (Array.isArray(d.waypoints) && d.waypoints.length >= 2) {
    const w = d.waypoints.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) && Number(x.kg) >= MIN_KG && Number(x.kg) <= MAX_KG)
      .map(x => ({ date: x.date, kg: Number(x.kg) })).sort((a, b) => a.date.localeCompare(b.date));
    if (w.length < 2) return null;
    const first = w[0], last = w[w.length - 1];
    return { target: last.kg, startKg: first.kg, startDate: first.date, targetDate: last.date, dir: Math.sign(last.kg - first.kg), waypoints: w };
  }
  const target = Number(d.target), startKg = Number(d.startValue);
  const startDate = d.since || d.createdAt || null;
  if (!(target >= MIN_KG && target <= MAX_KG) || !(startKg >= MIN_KG && startKg <= MAX_KG) || !startDate) return null;
  const targetDate = d.targetDate || null;
  return { target, startKg, startDate, targetDate, dir: Math.sign(target - startKg) };
}

/** The weight the straight line expects on `date` (clamped between start and goal), or null with no goal date. */
export function expectedAt(goal, date) {
  if (!goal || !goal.targetDate) return null;
  if (goal.waypoints) {
    const w = goal.waypoints;
    if (date <= w[0].date) return r1(w[0].kg);
    if (date >= w[w.length - 1].date) return r1(w[w.length - 1].kg);
    for (let i = 1; i < w.length; i++) {
      if (date <= w[i].date) {
        const span = Math.max(1, daysBetween(w[i - 1].date, w[i].date));
        return r1(w[i - 1].kg + (w[i].kg - w[i - 1].kg) * (daysBetween(w[i - 1].date, date) / span));
      }
    }
  }
  const span = daysBetween(goal.startDate, goal.targetDate);
  if (span <= 0) return goal.target;
  const t = Math.min(1, Math.max(0, daysBetween(goal.startDate, date) / span));
  return r1(goal.startKg + (goal.target - goal.startKg) * t);
}

/**
 * Where the Hunter stands on the path. Fields are null when they cannot be
 * worked out yet. aheadKg is positive when ahead of the line (lighter on a
 * cut, heavier on a gain) and negative when behind.
 */
export function pathStatus(weights, goal, today) {
  const list = cleanWeights(weights).filter(w => w.date <= today);
  if (!goal || !list.length) return null;
  const last = list[list.length - 1];
  const current = r1(averageAt(list, last.date));
  const span = goal.startKg - goal.target;
  const done = goal.waypoints
    ? today >= shiftDay(goal.targetDate, -7) && Math.abs(current - goal.target) <= 0.5
    : goal.dir < 0 ? current <= goal.target + 0.05 : goal.dir > 0 ? current >= goal.target - 0.05 : true;
  const pct = span === 0 || done ? 100 : Math.round(Math.max(0, Math.min(100, ((goal.startKg - current) / span) * 100)));
  const out = {
    target: goal.target, startKg: goal.startKg, current, latest: last.weight, latestDate: last.date,
    pct, remaining: r1(Math.abs(goal.target - current)), best: null, expected: null, aheadKg: null, track: 'unknown',
    rate: weeklyRate(list, today), neededPerWeek: null, daysLeft: null, finishDate: null, finishDays: null, kcalPerDay: null, done,
  };
  const lows = list.map(w => w.weight);
  out.best = r1(goal.dir > 0 ? Math.max(...lows) : Math.min(...lows));
  if (done) { out.track = 'reached'; return out; }
  if (goal.targetDate) {
    out.daysLeft = daysBetween(today, goal.targetDate);
    out.expected = expectedAt(goal, last.date);
    // ahead means lighter while the path is falling and heavier while it is rising
    const slope = goal.waypoints ? Math.sign(expectedAt(goal, shiftDay(last.date, 14)) - out.expected) || goal.dir : goal.dir;
    out.slope = slope;
    out.aheadKg = r1(slope < 0 ? out.expected - current : current - out.expected);
    out.track = out.aheadKg > ON_PATH_KG ? 'ahead' : out.aheadKg < -ON_PATH_KG ? 'behind' : 'on';
    if (goal.waypoints && out.daysLeft > 0) {
      out.neededPerWeek = r2((expectedAt(goal, shiftDay(last.date, 28)) - out.expected) / 4);
      out.kcalPerDay = Math.round(Math.abs(out.neededPerWeek) * KCAL_PER_KG / 7 / 10) * 10;
    } else if (out.daysLeft > 0) {
      out.neededPerWeek = r2((goal.target - current) / (out.daysLeft / 7));
      out.kcalPerDay = Math.round(Math.abs(out.neededPerWeek) * KCAL_PER_KG / 7 / 10) * 10;
    }
  }
  if (goal.waypoints) {
    // the path bends, so a straight finish projection would mislead: ahead/behind is the judge
  } else if (out.rate !== null && Math.abs(out.rate) >= 0.05 && Math.sign(out.rate) === goal.dir) {
    const weeks = Math.abs(goal.target - current) / Math.abs(out.rate);
    out.finishDays = Math.ceil(weeks * 7);
    out.finishDate = shiftDay(last.date, out.finishDays);
    if (goal.targetDate && out.track === 'unknown') out.track = out.finishDate <= goal.targetDate ? 'on' : 'behind';
  } else if (out.rate !== null && goal.targetDate) {
    out.track = out.track === 'unknown' ? 'behind' : out.track;
  }
  return out;
}

/** One plain sentence about the path for the screen. */
export function pathLine(p) {
  if (!p) return '';
  const kg = (n) => Math.abs(n).toFixed(1) + ' kg';
  if (p.track === 'reached') return `Goal reached: ${p.target} kg.`;
  const rel = p.aheadKg === null ? '' : p.aheadKg > ON_PATH_KG ? `${kg(p.aheadKg)} ahead of your path` : p.aheadKg < -ON_PATH_KG ? `${kg(p.aheadKg)} behind your path` : 'On your path';
  return rel || `${kg(p.remaining)} to go`;
}

/**
 * The path chart as an SVG string: dotted line for where you should be, solid
 * line for the 7-day average, dots for weigh-ins, a marker at the goal.
 * Colours come from CSS variables so the theme holds. '' with fewer than 2 entries.
 */
export function pathSvg(weights, goal, { today, width = 320, height = 130 } = {}) {
  const pts = trendSeries(weights).filter(p => !today || p.date <= today);
  if (pts.length < 2 || !goal) return '';
  const P = { t: 10, r: 10, b: 18, l: 34 };
  const gW = width - P.l - P.r, gH = height - P.t - P.b;
  const x0 = goal.startDate < pts[0].date ? goal.startDate : pts[0].date;
  const xEnd = goal.targetDate && goal.targetDate > pts[pts.length - 1].date ? goal.targetDate : pts[pts.length - 1].date;
  const spanDays = Math.max(1, daysBetween(x0, xEnd));
  const vals = pts.flatMap(p => [p.weight, p.avg]).concat([goal.target, goal.startKg], (goal.waypoints || []).map(w => w.kg));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const X = (d) => (P.l + (daysBetween(x0, d) / spanDays) * gW).toFixed(1);
  const Y = (v) => (P.t + gH - ((v - lo) / (hi - lo)) * gH).toFixed(1);
  const dots = pts.map(p => `<circle cx="${X(p.date)}" cy="${Y(p.weight)}" r="2.4" fill="var(--text-faint)" opacity=".7"/>`).join('');
  const line = pts.map(p => `${X(p.date)},${Y(p.avg)}`).join(' ');
  const last = pts[pts.length - 1];
  const glide = goal.waypoints
    ? `<polyline points="${goal.waypoints.map(w => `${X(w.date)},${Y(w.kg)}`).join(' ')}" fill="none" stroke="var(--legendary)" stroke-width="1.5" stroke-dasharray="2 4" stroke-linecap="round" stroke-linejoin="round"/>`
    : goal.targetDate
    ? `<line x1="${X(goal.startDate)}" y1="${Y(goal.startKg)}" x2="${X(goal.targetDate)}" y2="${Y(goal.target)}" stroke="var(--legendary)" stroke-width="1.5" stroke-dasharray="2 4" stroke-linecap="round"/>`
    : `<line x1="${P.l}" x2="${width - P.r}" y1="${Y(goal.target)}" y2="${Y(goal.target)}" stroke="var(--legendary)" stroke-width="1" stroke-dasharray="4 4" opacity=".8"/>`;
  const flag = goal.targetDate ? `<circle cx="${X(goal.targetDate)}" cy="${Y(goal.target)}" r="4" fill="none" stroke="var(--legendary)" stroke-width="1.5"/>` : '';
  const lbl = (v, y) => `<text x="${P.l - 6}" y="${y}" text-anchor="end" font-size="9" fill="var(--text-faint)" font-family="var(--font-mono)">${v.toFixed(0)}</text>`;
  const md = (d) => d.slice(5).replace('-', '/');
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Weight against your goal path. Dotted line is where you should be, solid line is your 7-day average." preserveAspectRatio="none">` +
    `<line x1="${P.l}" x2="${width - P.r}" y1="${P.t + gH}" y2="${P.t + gH}" stroke="rgba(91,168,255,.12)"/>` +
    lbl(hi, P.t + 3) + lbl(lo, P.t + gH + 3) + glide + flag + dots +
    `<polyline points="${line}" fill="none" stroke="var(--violet)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${X(last.date)}" cy="${Y(last.avg)}" r="4" fill="var(--violet)" stroke="var(--void)" stroke-width="1.5"/>` +
    `<text x="${P.l}" y="${height - 4}" font-size="9" fill="var(--text-faint)" font-family="var(--font-mono)">${md(x0)}</text>` +
    `<text x="${width - P.r}" y="${height - 4}" text-anchor="end" font-size="9" fill="var(--text-faint)" font-family="var(--font-mono)">${md(xEnd)}</text></svg>`;
}
