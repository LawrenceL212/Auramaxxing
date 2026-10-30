/* =========================================================================
   PLAN SCORE

   How good a training plan is, from the measures a personal trainer reads
   off a client's programme. Every number is computed from the plan and the
   logged sessions; the AI never writes them.

     volume        weekly hard sets per muscle group against the landmarks
                   (minimum that grows anything, productive range, maximum
                   that can be recovered from)
     frequency     sessions a week that train each big muscle group
     balance       pull to push sets, and upper to lower sets
     session       planned minutes per session
     goal fit      share of sets in the rep range for the goal
     recovery      gap between hard sessions on the same muscle group
     overload      lifts in the plan whose estimated 1RM is rising
     adherence     sessions done against sessions planned (last 4 weeks)

   Muscle groups the Hunter has ruled out are left out of volume, frequency
   and balance, so a plan with no legs is not marked down for it.

   Pure, so test/plan-metrics.test.mjs exercises it without a browser.
   ========================================================================= */

import {
  MUSCLE_GROUPS, GOAL_REPS, dayFrequencies, plannedSessionsPerWeek, plannedVolume, groupCredit,
  targetReps, liftTrend, resolveGoal, STALL_KG_PER_WEEK,
} from './optimiser.js';
import { isRunDef } from './set-inputs.js';

const PUSH = ['Chest', 'Shoulders', 'Triceps'];
const PULL = ['Back', 'Biceps'];
const UPPER = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'];
const LOWER = ['Quads', 'Hamstrings', 'Calves'];
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const clamp01 = v => Math.max(0, Math.min(1, v));
const round1 = v => Math.round(v * 10) / 10;
const sum = (o, keys) => keys.reduce((t, k) => t + (o[k] || 0), 0);
function dayDiff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }

/** Minutes a day of sets takes: about three a set, to the nearest five. */
export function sessionMinutes(day) {
  const sets = ((day && day.exercises) || []).reduce((n, e) => n + (Number(e.sets) || 0), 0);
  return sets ? Math.max(5, Math.round(sets * 3 / 5) * 5) : 0;
}

/** Weekday index (0 = Mon) each plan day is trained on, or null when unknown. */
function dayWeekdays(program) {
  const days = program.days || [];
  if (program.scheduleMode === 'fixed') {
    return days.map(d => (d.assignedDays || []).map(x => WEEK.indexOf(x)).filter(i => i >= 0));
  }
  const slots = (program.schedule || []).map(x => WEEK.indexOf(x)).filter(i => i >= 0).sort((a, b) => a - b);
  if (!slots.length || !days.length) return days.map(() => []);
  // rotation: day i takes the i-th slot of the week, cycling
  return days.map((_, i) => slots.filter((_, s) => s % days.length === i));
}

/**
 * ctx: { program, exercises, workouts, today, goal, excluded: [group], prs }
 * Returns { score, grade, metrics: [...], groups: {...} }.
 */
export function scorePlan(ctx) {
  const { program, exercises, today } = ctx;
  const workouts = ctx.workouts || [];
  const excluded = new Set((ctx.excluded || []).filter(g => MUSCLE_GROUPS[g]));
  const goal = resolveGoal(ctx.goal || program.goal, [], [], null).goal;
  const days = program.days || [];
  const metrics = [];
  const add = m => metrics.push(m);
  const { volume } = plannedVolume(program, exercises);
  const freq = dayFrequencies(program);

  // ── volume ────────────────────────────────────────────────────────────
  const volRows = Object.entries(MUSCLE_GROUPS).filter(([g]) => !excluded.has(g)).map(([g, lm]) => {
    const v = volume[g] || 0;
    const status = v > lm.mrv ? 'high' : v >= lm.mev ? 'good' : v > 0 ? 'low' : 'none';
    return { group: g, sets: round1(v), mev: lm.mev, mav: lm.mav, mrv: lm.mrv, status, major: lm.major };
  });
  const need = volRows.filter(r => r.major || r.sets > 0);
  const volScore = need.length ? need.reduce((t, r) => t + (r.status === 'good' ? 1 : r.status === 'high' ? 0.5 : r.status === 'low' ? 0.6 * clamp01(r.sets / r.mev) : 0), 0) / need.length : 1;
  const lowRows = volRows.filter(r => r.major && (r.status === 'low' || r.status === 'none'));
  const highRows = volRows.filter(r => r.status === 'high');
  add({ id: 'volume', label: 'Weekly volume', lowMajor: lowRows.length, score: volScore, status: volScore >= 0.85 ? 'good' : volScore >= 0.6 ? 'ok' : 'low',
    value: `${need.filter(r => r.status === 'good').length} of ${need.length} groups in range`,
    detail: 'Hard sets a week per muscle group against the minimum and maximum that grow muscle.',
    fix: lowRows.length ? `Add sets for ${lowRows.map(r => r.group).join(', ')}.` : highRows.length ? `Trim ${highRows.map(r => r.group).join(', ')}: past what can be recovered from.` : '' });

  // ── frequency ─────────────────────────────────────────────────────────
  const perGroup = {};
  days.forEach((d, di) => {
    const hit = new Set();
    (d.exercises || []).forEach(e => { const def = exercises[e.name]; if (def && !isRunDef(def)) for (const [g, c] of Object.entries(groupCredit(def))) if (c >= 0.5 && (Number(e.sets) || 0) >= 2) hit.add(g); });
    hit.forEach(g => { perGroup[g] = (perGroup[g] || 0) + (freq[di] || 0); });
  });
  const majors = Object.entries(MUSCLE_GROUPS).filter(([g, lm]) => lm.major && !excluded.has(g)).map(([g]) => g);
  const want = goal === 'endurance' ? 1 : 2;
  const freqRows = majors.map(g => ({ group: g, perWeek: round1(perGroup[g] || 0) }));
  const freqOk = freqRows.filter(r => r.perWeek >= want).length;
  const freqScore = majors.length ? freqRows.reduce((t, r) => t + clamp01(r.perWeek / want), 0) / majors.length : 1;
  const lowFreq = freqRows.filter(r => r.perWeek < want);
  add({ id: 'frequency', label: 'Frequency', score: freqScore, status: freqScore >= 0.9 ? 'good' : freqScore >= 0.65 ? 'ok' : 'low',
    value: `${freqOk} of ${majors.length} big groups ${want}× a week`,
    detail: 'Training a muscle about twice a week grows it more than once a week for the same sets.',
    fix: lowFreq.length ? `${lowFreq.map(r => r.group).join(', ')} ${lowFreq.length === 1 ? 'gets' : 'get'} under ${want} sessions a week.` : '' });

  // ── balance ───────────────────────────────────────────────────────────
  const push = sum(volume, PUSH.filter(g => !excluded.has(g))), pull = sum(volume, PULL.filter(g => !excluded.has(g)));
  if (push > 0 && pull >= 0) {
    const ratio = pull / push;
    const s = ratio >= 0.8 && ratio <= 1.5 ? 1 : ratio >= 0.6 && ratio <= 1.9 ? 0.6 : 0.3;
    add({ id: 'balance', label: 'Push / pull', score: s, status: s >= 0.9 ? 'good' : s >= 0.55 ? 'ok' : 'low',
      value: `${round1(pull)} pull : ${round1(push)} push`,
      detail: 'Pulling at least as much as you push keeps the shoulders healthy.',
      fix: ratio < 0.8 ? 'Add rows or pull-downs.' : ratio > 1.5 ? 'Add pressing work.' : '' });
  }
  const upper = sum(volume, UPPER.filter(g => !excluded.has(g))), lower = sum(volume, LOWER.filter(g => !excluded.has(g)));
  const lowerAllowed = LOWER.some(g => !excluded.has(g));
  if (lowerAllowed && upper > 0) {
    const ratio = lower / upper;
    const s = ratio >= 0.45 ? 1 : ratio >= 0.3 ? 0.6 : 0.3;
    add({ id: 'upperlower', label: 'Upper / lower', score: s, status: s >= 0.9 ? 'good' : s >= 0.55 ? 'ok' : 'low',
      value: `${round1(lower)} lower : ${round1(upper)} upper`,
      detail: 'Legs are the biggest muscles; a plan with almost none is lopsided.',
      fix: ratio < 0.45 ? 'Add leg work.' : '' });
  }

  // ── session length ────────────────────────────────────────────────────
  const mins = days.map(sessionMinutes);
  if (mins.length) {
    const longest = Math.max(...mins), shortest = Math.min(...mins);
    const s = longest <= 75 && shortest >= 20 ? 1 : longest <= 95 ? 0.6 : 0.3;
    add({ id: 'session', label: 'Session length', score: s, status: s >= 0.9 ? 'good' : s >= 0.55 ? 'ok' : 'low',
      value: longest === shortest ? `about ${longest} min` : `${shortest}–${longest} min`,
      detail: 'Long sessions are the ones people skip; very short ones rarely add up to enough volume.',
      fix: longest > 75 ? 'Your longest day is over 75 minutes. Split it.' : shortest < 20 ? 'A day under 20 minutes adds little. Merge it.' : '' });
  }

  // ── goal fit ──────────────────────────────────────────────────────────
  const range = GOAL_REPS[goal];
  let setsAll = 0, setsIn = 0;
  for (const d of days) for (const e of d.exercises || []) {
    const def = exercises[e.name];
    if (!def || isRunDef(def)) continue;
    const sets = Number(e.sets) || 0;
    setsAll += sets;
    const reps = targetReps(e);
    if (reps >= range.min && reps <= range.max) setsIn += sets;
  }
  if (setsAll) {
    const share = setsIn / setsAll;
    add({ id: 'goalfit', label: 'Goal fit', score: share, status: share >= 0.7 ? 'good' : share >= 0.45 ? 'ok' : 'low',
      value: `${Math.round(share * 100)}% of sets at ${range.min}–${range.max} reps`,
      detail: `Rep ranges for a ${goal} goal.`,
      fix: share < 0.7 ? `Move rep targets toward ${range.min}–${range.max}.` : '' });
  }

  // ── recovery ──────────────────────────────────────────────────────────
  const wd = dayWeekdays(program);
  const hard = (di, g) => (days[di].exercises || []).reduce((t, e) => { const def = exercises[e.name]; return t + (def && !isRunDef(def) ? (Number(e.sets) || 0) * (groupCredit(def)[g] || 0) : 0); }, 0) >= 5;
  const tight = [];
  let known = false;
  for (const g of majors) {
    const slots = [];
    days.forEach((_, di) => { if (hard(di, g)) wd[di].forEach(w => slots.push(w)); });
    slots.sort((a, b) => a - b);
    if (slots.length >= 2) {
      known = true;
      const gaps = slots.map((w, i) => (i ? w - slots[i - 1] : slots[0] + 7 - slots[slots.length - 1]));
      if (Math.min(...gaps) < 2) tight.push(g);
    }
  }
  if (known || days.length > 1) {
    const s = tight.length ? clamp01(1 - tight.length / Math.max(2, majors.length)) : 1;
    add({ id: 'recovery', label: 'Recovery', score: s, status: s >= 0.9 ? 'good' : s >= 0.55 ? 'ok' : 'low',
      value: tight.length ? `${tight.length} group${tight.length === 1 ? '' : 's'} on back-to-back days` : 'a day or more between hard sessions',
      detail: 'A muscle trained hard needs about 48 hours before the next hard session.',
      fix: tight.length ? `${tight.join(', ')} get hit on consecutive days.` : '' });
  }

  // ── from the logs: overload and adherence ─────────────────────────────
  const names = [...new Set(days.flatMap(d => (d.exercises || []).map(e => e.name)))];
  const trends = names.map(n => ({ name: n, ...liftTrend(n, workouts, today, ctx.prs && ctx.prs[n] && ctx.prs[n].e1rm) })).filter(t => t.sessions >= 3 && t.rate != null);
  if (trends.length) {
    const up = trends.filter(t => t.rate > STALL_KG_PER_WEEK).length;
    const s = up / trends.length;
    const stalled = trends.filter(t => t.rate <= STALL_KG_PER_WEEK).map(t => t.name);
    add({ id: 'overload', label: 'Progressive overload', score: s, status: s >= 0.6 ? 'good' : s >= 0.35 ? 'ok' : 'low', fromLogs: true,
      value: `${up} of ${trends.length} lifts rising`,
      detail: 'Estimated 1RM trend over the last 8 weeks. A plan works when the weights climb.',
      fix: stalled.length ? `Stalled: ${stalled.slice(0, 3).join(', ')}.` : '' });
  }
  const dates = [...new Set(workouts.map(w => w && w.date).filter(Boolean))].sort();
  if (dates.length && dayDiff(dates[0], today) >= 28) {
    const done = dates.filter(d => dayDiff(d, today) >= 0 && dayDiff(d, today) < 28).length / 4;
    const planned = plannedSessionsPerWeek(program) || 1;
    const share = clamp01(done / planned);
    add({ id: 'adherence', label: 'Adherence', score: share, status: share >= 0.8 ? 'good' : share >= 0.55 ? 'ok' : 'low', fromLogs: true,
      value: `${round1(done)} of ${planned} sessions a week`,
      detail: 'Sessions logged a week over the last 4 weeks against the plan.',
      fix: share < 0.8 ? 'The plan asks for more than you are doing. Fewer days you keep beat more days you skip.' : '' });
  }

  // ── total ─────────────────────────────────────────────────────────────
  const WEIGHT = { volume: 30, frequency: 15, balance: 10, upperlower: 8, session: 7, goalfit: 10, recovery: 8, overload: 7, adherence: 5 };
  let tw = 0, ts = 0;
  for (const m of metrics) { const w = WEIGHT[m.id] || 5; tw += w; ts += w * m.score; }
  let score = tw ? Math.round(ts / tw * 100) : 0;
  // A plan that leaves big muscle groups under the minimum cannot be called solid, whatever else it gets right.
  if (metrics.some(m => m.id === 'volume' && m.lowMajor >= 2)) score = Math.min(score, 69);
  const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Solid' : score >= 55 ? 'Needs work' : 'Rework';
  return { score, grade, goal, metrics, groups: volRows, frequency: freqRows };
}

/** What changed between two plans, as readable lines. */
export function diffPlans(before, after) {
  const key = p => new Map(((p && p.days) || []).flatMap(d => (d.exercises || []).map(e => [e.name, e])));
  const a = key(before), b = key(after);
  const out = { added: [], removed: [], changed: [] };
  for (const [n, e] of b) {
    if (!a.has(n)) out.added.push(`${n} ${e.sets}×${e.reps}`);
    else { const o = a.get(n); if (o.sets !== e.sets || targetReps(o) !== targetReps(e)) out.changed.push(`${n} ${o.sets}×${targetReps(o)} → ${e.sets}×${targetReps(e)}`); }
  }
  for (const [n] of a) if (!b.has(n)) out.removed.push(n);
  return out;
}
