/* =========================================================================
   TRAINER READ

   What a personal trainer checks each time they open a client's file,
   computed from the logged sessions and body metrics:

     rhythm        days since the last session against the usual gap, and
                   sessions a week now against the four weeks before
     recovery      how long since each muscle group was trained hard, a
                   sudden jump in weekly volume, days trained in a row, and
                   whether the signs call for a lighter week
     performance   lifts rising, stalled or falling (estimated 1RM trend),
                   recent personal records, volume against the month before
     body          weight trend, waist, weigh-in gaps, and what the body and
                   the lifts say together (for example losing weight while
                   getting stronger)

   Every finding is a computed fact with one action. A finding can carry a
   sentence for "Ask your trainer", so a tap turns it into a plan change the
   Hunter still has to accept. Nothing here writes anything, and nothing
   reads or alters XP, stats or progression.

   Pure, so test/trainer-insights.test.mjs exercises it without a browser.
   ========================================================================= */

import { MUSCLE_GROUPS, groupCredit, liftTrend, STALL_KG_PER_WEEK } from './optimiser.js';
import { isRunDef } from './set-inputs.js';

const MS = 86400000;
const day = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / MS);
const shift = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const avg = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const r1 = v => Math.round(v * 10) / 10;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function setCount(w) { return (w.exercises || []).reduce((t, e) => t + (e.sets || []).length, 0); }

/** Weekly rate (kg per week) of a series [{date, kg}] by least squares, or null. */
export function weightTrend(points, today, days = 28) {
  const since = shift(today, -days);
  const p = points.filter(x => x.date >= since && x.date <= today && Number(x.kg) > 0);
  if (p.length < 4) return null;
  const span = day(p[0].date, p[p.length - 1].date);
  if (span < 10) return null;
  const xs = p.map(x => day(p[0].date, x.date) / 7), ys = p.map(x => Number(x.kg));
  const mx = avg(xs), my = avg(ys);
  const sxx = xs.reduce((t, x) => t + (x - mx) ** 2, 0);
  if (!sxx) return null;
  const rate = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / sxx;
  return { perWeekKg: Math.round(rate * 100) / 100, current: r1(my + rate * (xs[xs.length - 1] - mx)), n: p.length };
}

/**
 * ctx: { workouts, exercises, program, weights:[{date,weight}], checkins:[{date,weight,waist}],
 *        prs:{name:{e1rm,date}}, today, targetKg }
 * Returns { headline, tone, flags:[{id,area,tone,title,detail,ask?}], readiness:[{group,state,days}], stats }.
 */
export function trainerRead(ctx) {
  const { exercises, today } = ctx;
  const workouts = (ctx.workouts || []).filter(w => w && w.date && w.date <= today);
  const flags = [];
  const flag = f => flags.push(f);
  const dates = [...new Set(workouts.map(w => w.date))].sort();
  const stats = { sessionsLogged: dates.length };

  // ── rhythm ──────────────────────────────────────────────────────────────
  if (dates.length >= 3) {
    const last = dates[dates.length - 1];
    const sinceLast = day(last, today);
    const recent = dates.filter(d => day(d, today) < 56);
    const gaps = recent.slice(1).map((d, i) => day(recent[i], d));
    const usual = gaps.length ? r1(avg(gaps)) : null;
    const longest = gaps.length ? Math.max(...gaps) : null;
    const perWeekNow = dates.filter(d => day(d, today) < 28).length / 4;
    const perWeekBefore = dates.filter(d => day(d, today) >= 28 && day(d, today) < 56).length / 4;
    Object.assign(stats, { sinceLast, usualGapDays: usual, longestGapDays: longest, perWeekNow: r1(perWeekNow), perWeekBefore: r1(perWeekBefore) });
    if (usual != null && sinceLast >= 4 && sinceLast > usual * 1.8) {
      flag({ id: 'gap', area: 'rhythm', tone: 'act', title: `${plural(sinceLast, 'day')} since your last session`,
        detail: `You usually train every ${usual} days. The longer the break, the easier the first session should be.`,
        ask: sinceLast >= 10 ? 'I have been off for a while, ease me back in for the first two weeks.' : null });
    } else if (usual != null) {
      flag({ id: 'gap', area: 'rhythm', tone: 'good', title: `Training about every ${usual} days`,
        detail: `Last session ${sinceLast === 0 ? 'today' : plural(sinceLast, 'day') + ' ago'}.` });
    }
    if (perWeekBefore >= 1 && perWeekNow <= perWeekBefore * 0.6) {
      flag({ id: 'drop', area: 'rhythm', tone: 'watch', title: `Sessions down to ${r1(perWeekNow)} a week from ${r1(perWeekBefore)}`,
        detail: 'A smaller plan you keep beats a bigger one you skip.', ask: 'Fewer sessions a week, I am struggling to keep up.' });
    } else if (perWeekBefore > 0 && perWeekNow >= perWeekBefore * 1.4 && perWeekNow >= 3) {
      flag({ id: 'up', area: 'rhythm', tone: 'good', title: `Sessions up to ${r1(perWeekNow)} a week from ${r1(perWeekBefore)}`, detail: 'Good consistency. Watch recovery as the load rises.' });
    }
    // days in a row
    let run = 0;
    for (let d = today; ; d = shift(d, -1)) { if (dates.includes(d)) run++; else if (d !== today) break; if (day(d, today) > 14) break; }
    stats.daysInARow = run;
    if (run >= 4) flag({ id: 'streak', area: 'recovery', tone: 'watch', title: `${run} training days in a row`, detail: 'Muscles grow while resting. Put a rest day in.', ask: 'Add a rest day, I am training too many days in a row.' });
  }

  // ── recovery ────────────────────────────────────────────────────────────
  const groupLast = {};
  for (const w of workouts) {
    const sets = {};
    for (const e of w.exercises || []) {
      const def = exercises[e.name];
      if (!def || isRunDef(def)) continue;
      for (const [g, c] of Object.entries(groupCredit(def))) sets[g] = (sets[g] || 0) + (e.sets || []).length * c;
    }
    for (const [g, v] of Object.entries(sets)) if (v >= 4 && (!groupLast[g] || w.date > groupLast[g])) groupLast[g] = w.date;
  }
  const readiness = Object.keys(MUSCLE_GROUPS).filter(g => groupLast[g]).map(g => {
    const d = day(groupLast[g], today);
    return { group: g, days: d, state: d <= 1 ? 'recovering' : d <= 3 ? 'ready' : 'fresh' };
  }).sort((a, b) => a.days - b.days);
  const hot = readiness.filter(r => r.state === 'recovering');
  if (hot.length) flag({ id: 'hot', area: 'recovery', tone: 'watch', title: `${hot.map(r => r.group).join(', ')} still recovering`, detail: 'Trained hard in the last day. Give them about 48 hours before the next hard session.' });
  const weekSets = (from, to) => workouts.filter(w => day(w.date, today) >= from && day(w.date, today) < to).reduce((t, w) => t + setCount(w), 0);
  const thisWeek = weekSets(0, 7), prior = weekSets(7, 35) / 4;
  stats.setsThisWeek = thisWeek; stats.setsPerWeekBefore = r1(prior);
  if (prior >= 20 && thisWeek > prior * 1.5) {
    flag({ id: 'spike', area: 'recovery', tone: 'act', title: `Volume jumped to ${thisWeek} sets from about ${Math.round(prior)} a week`,
      detail: 'A sudden rise of more than half is when injuries and burnout happen. Build up more gradually.', ask: 'Cut this week\'s volume back, I jumped up too fast.' });
  }
  // deload signs
  const names = [...new Set(workouts.filter(w => day(w.date, today) < 56).flatMap(w => (w.exercises || []).map(e => e.name)))];
  const trends = names.map(n => ({ name: n, ...liftTrend(n, workouts, today, ctx.prs?.[n]?.e1rm) })).filter(t => t.sessions >= 3 && t.rate != null);
  const stalled = trends.filter(t => t.rate <= STALL_KG_PER_WEEK);
  const falling = trends.filter(t => t.rate < -STALL_KG_PER_WEEK);
  const rirs = workouts.filter(w => day(w.date, today) < 14).flatMap(w => (w.exercises || []).flatMap(e => (e.sets || []).map(s => s.rir).filter(v => v != null && v !== '')).map(Number));
  const lowRir = rirs.length >= 8 ? avg(rirs) : null;
  const heavyWeeks = [0, 1, 2, 3, 4, 5].every(i => weekSets(i * 7, i * 7 + 7) >= Math.max(6, prior * 0.7));
  if (trends.length >= 2 && (falling.length >= 1 || stalled.length / trends.length >= 0.6) && (lowRir != null && lowRir <= 1 || heavyWeeks)) {
    flag({ id: 'deload', area: 'recovery', tone: 'act', title: 'Signs you need a lighter week',
      detail: `${stalled.length} of ${trends.length} lifts have stopped rising${lowRir != null && lowRir <= 1 ? ' while sets are being ground out' : ''}${heavyWeeks ? ', after 6 weeks of steady volume' : ''}. A week at about 60% of the sets usually resets this.`,
      ask: 'Give me a deload week: about 60% of the sets, same exercises, stop well short of failure.' });
  }

  // ── performance ─────────────────────────────────────────────────────────
  const rising = trends.filter(t => t.rate > STALL_KG_PER_WEEK);
  Object.assign(stats, { liftsTracked: trends.length, liftsRising: rising.length, liftsStalled: stalled.length });
  if (trends.length) {
    if (rising.length) flag({ id: 'rising', area: 'performance', tone: 'good', title: `${rising.length} of ${trends.length} lifts rising`,
      detail: `${rising.slice(0, 3).map(t => `${t.name} +${r1(t.rate)} kg/wk`).join(', ')} (estimated 1RM, last 8 weeks).` });
    if (stalled.length && !flags.some(f => f.id === 'deload')) flag({ id: 'stalled', area: 'performance', tone: 'watch', title: `${stalled.slice(0, 3).map(t => t.name).join(', ')} not rising`,
      detail: 'No gain in the last 8 weeks. Change the rep range, add a set, or check sleep and food.', ask: `Change how I train ${stalled[0].name}, it has stalled.` });
  }
  const prsRecent = Object.entries(ctx.prs || {}).filter(([, p]) => p && p.date && day(p.date, today) >= 0 && day(p.date, today) <= 14);
  if (prsRecent.length) flag({ id: 'prs', area: 'performance', tone: 'good', title: `${plural(prsRecent.length, 'personal record')} in 14 days`, detail: prsRecent.slice(0, 3).map(([n]) => n).join(', ') + '.' });
  const volNow = weekSets(0, 28), volBefore = weekSets(28, 56);
  if (volBefore >= 20) {
    const ch = Math.round((volNow / volBefore - 1) * 100);
    stats.volumeChangePct = ch;
    if (ch <= -30) flag({ id: 'volume', area: 'performance', tone: 'watch', title: `Volume ${Math.abs(ch)}% lower than the month before`, detail: 'Fine for a planned lighter spell. If it was not planned, the plan may be too much.' });
  }

  // ── body ────────────────────────────────────────────────────────────────
  const series = [...(ctx.weights || []).map(w => ({ date: w.date, kg: Number(w.weight) })), ...(ctx.checkins || []).filter(c => c.weight).map(c => ({ date: c.date, kg: Number(c.weight) }))]
    .filter(p => p.date && p.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  const lastWeigh = series.length ? series[series.length - 1].date : null;
  if (lastWeigh) {
    const since = day(lastWeigh, today);
    stats.daysSinceWeighIn = since;
    if (since >= 10) flag({ id: 'weighin', area: 'body', tone: 'watch', title: `${plural(since, 'day')} since your last weigh-in`, detail: 'The trainer reads your plan against your weight. One weigh-in a few times a week is enough.' });
  } else if (dates.length >= 3) flag({ id: 'weighin', area: 'body', tone: 'watch', title: 'No weigh-ins yet', detail: 'Add one so the trainer can read your weight against your training.' });
  const wt = weightTrend(series, today);
  if (wt) {
    stats.weightPerWeekKg = wt.perWeekKg; stats.weightNowKg = wt.current;
    const share = wt.current ? Math.abs(wt.perWeekKg) / wt.current : 0;
    const strong = rising.length >= 1 && stalled.length + falling.length <= rising.length;
    const weak = falling.length >= 1;
    if (wt.perWeekKg <= -0.1 && strong) flag({ id: 'recomp', area: 'body', tone: 'good', title: 'Getting lighter and stronger', detail: `Weight ${wt.perWeekKg} kg a week while lifts rise: fat is going, muscle is being kept.` });
    else if (wt.perWeekKg <= -0.1 && weak) flag({ id: 'muscleloss', area: 'body', tone: 'act', title: 'Weight and strength both falling', detail: 'Losing weight while losing strength can mean losing muscle. Eat a little more, protein especially, or slow the cut.', ask: 'My weight and lifts are both dropping, ease the deficit and keep strength.' });
    if (share > 0.0125 && wt.perWeekKg < 0) flag({ id: 'fastcut', area: 'body', tone: 'act', title: `Losing ${Math.abs(wt.perWeekKg)} kg a week`, detail: 'Faster than about 1% of body weight a week costs muscle. Slow down.' });
    else if (wt.perWeekKg > 0.1 && share > 0.005) flag({ id: 'fastgain', area: 'body', tone: 'watch', title: `Gaining ${wt.perWeekKg} kg a week`, detail: 'Over about 0.5% of body weight a week is mostly fat gain.' });
    if (Number(ctx.targetKg) > 0 && Math.abs(wt.perWeekKg) >= 0.05) {
      const togo = ctx.targetKg - wt.current, weeks = togo / wt.perWeekKg;
      if (weeks > 0 && weeks < 200) flag({ id: 'goalweight', area: 'body', tone: 'good', title: `${r1(Math.abs(togo))} kg to your ${ctx.targetKg} kg goal`, detail: `About ${Math.round(weeks)} weeks at the current pace.` });
      else if (weeks < 0) flag({ id: 'goalweight', area: 'body', tone: 'watch', title: `Moving away from your ${ctx.targetKg} kg goal`, detail: `Weight is going ${wt.perWeekKg > 0 ? 'up' : 'down'} when the goal is ${togo > 0 ? 'up' : 'down'}.` });
    }
  }
  const cks = (ctx.checkins || []).filter(c => Number(c.waist) > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (cks.length >= 2) {
    const a = cks[cks.length - 2], b = cks[cks.length - 1], d = day(a.date, b.date);
    if (d >= 14) { const ch = r1(b.waist - a.waist); stats.waistChangeCm = ch; if (Math.abs(ch) >= 1) flag({ id: 'waist', area: 'body', tone: ch < 0 ? 'good' : 'watch', title: `Waist ${ch < 0 ? 'down' : 'up'} ${Math.abs(ch)} cm`, detail: `Over ${plural(d, 'day')}.` }); }
  }

  // ── long term ───────────────────────────────────────────────────────────
  const hist = fullHistory({ workouts, exercises, weights: ctx.weights, checkins: ctx.checkins, today });
  stats.history = hist ? { since: hist.since, sessions: hist.sessions } : null;
  if (hist && hist.daysSince >= 56) {
    const top = [...hist.lifts].sort((x, y) => y.gainKg - x.gainKg)[0];
    if (top && top.gainKg >= 5 && top.gainPct >= 5) flag({ id: 'longlift', area: 'longterm', tone: 'good', title: `${top.name} up ${top.gainKg} kg since ${top.since}`, detail: `Estimated 1RM from ${top.firstE1rm} kg to ${top.currentE1rm || top.bestE1rm} kg (${top.gainPct > 0 ? '+' : ''}${top.gainPct}%) over ${Math.round(hist.daysSince / 30)} months.` });
    const slid = hist.lifts.filter(l => l.currentE1rm && l.currentE1rm < l.bestE1rm * 0.9 && l.sessions >= 8);
    if (slid.length) flag({ id: 'longslide', area: 'longterm', tone: 'watch', title: `${slid[0].name} is ${slid[0].bestE1rm - slid[0].currentE1rm} kg below your best`, detail: `Best was ${slid[0].bestE1rm} kg on ${slid[0].bestDate}. Often a sign of a long break or an overdue lighter week.` });
    const consistency = Math.round(hist.weeksTrained / hist.weeksSinceStart * 100);
    flag({ id: 'longconsistency', area: 'longterm', tone: consistency >= 60 ? 'good' : 'watch', title: `You trained in ${consistency}% of weeks since you started`, detail: `${hist.sessions} sessions over ${hist.weeksSinceStart} weeks. Longest run: ${hist.longestRunOfWeeks} weeks in a row${hist.longestBreaks[0] ? `; longest break ${hist.longestBreaks[0].days} days` : ''}.` });
  }

  const rank = { act: 0, watch: 1, good: 2 };
  flags.sort((a, b) => rank[a.tone] - rank[b.tone]);
  const acts = flags.filter(f => f.tone === 'act'), watch = flags.filter(f => f.tone === 'watch');
  const tone = acts.length ? 'act' : watch.length ? 'watch' : flags.length ? 'good' : 'none';
  const headline = !flags.length ? 'Log a few sessions and the trainer will start reading them.'
    : acts.length ? acts[0].title : watch.length ? watch[0].title : 'On track. Nothing needs changing.';
  return { headline, tone, flags, readiness, stats };
}


/* ── the whole history ───────────────────────────────────────────────────── */

const monthOf = d => d.slice(0, 7);
function lastMonths(today, n) {
  const out = []; const t = new Date(today + 'T12:00:00'); t.setDate(1);
  for (let i = n - 1; i >= 0; i--) { const d = new Date(t); d.setMonth(d.getMonth() - i); out.push(d.toISOString().slice(0, 7)); }
  return out;
}

/**
 * Everything the Hunter has logged, boiled down: when they started, how the
 * months went, how each main lift has moved since the first session, the
 * longest breaks, and the weight over the whole period. Compact on purpose,
 * since it is also sent to the trainer.
 */
export function fullHistory(ctx) {
  const { exercises, today } = ctx;
  const workouts = (ctx.workouts || []).filter(w => w && w.date && w.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  if (!workouts.length) return null;
  const dates = [...new Set(workouts.map(w => w.date))];
  const first = dates[0];
  const spanDays = Math.max(1, day(first, today));
  const months = lastMonths(today, Math.min(36, Math.max(1, Math.ceil(spanDays / 30.4))));
  const perMonth = {}, setsMonth = {};
  for (const w of workouts) { const m = monthOf(w.date); setsMonth[m] = (setsMonth[m] || 0) + setCount(w); }
  for (const d of dates) { const m = monthOf(d); perMonth[m] = (perMonth[m] || 0) + 1; }
  const monthly = months.map(m => ({ month: m, sessions: perMonth[m] || 0, sets: setsMonth[m] || 0 }));
  const bestMonth = monthly.reduce((b, m) => (m.sessions > b.sessions ? m : b), monthly[0]);

  // lifts: first, best and current estimated 1RM, plus a monthly best series
  const byLift = {};
  for (const w of workouts) for (const e of w.exercises || []) {
    const def = exercises[e.name];
    if (!def || isRunDef(def)) continue;
    const top = Math.max(0, ...(e.sets || []).filter(st => Number(st.weight) > 0 && Number(st.reps) > 0).map(st => Number(st.weight) * (1 + Number(st.reps) / 30)));
    const L = byLift[e.name] || (byLift[e.name] = { name: e.name, sessions: 0, first: null, firstDate: null, best: 0, bestDate: null, months: {}, recent: [] });
    L.sessions++;
    if (top) {
      if (L.first == null) { L.first = top; L.firstDate = w.date; }
      if (top > L.best) { L.best = top; L.bestDate = w.date; }
      const m = monthOf(w.date); L.months[m] = Math.max(L.months[m] || 0, top);
      if (day(w.date, today) < 28) L.recent.push(top);
    }
  }
  const lifts = Object.values(byLift).filter(L => L.sessions >= 3 && L.first != null).sort((a, b) => b.sessions - a.sessions).slice(0, 10).map(L => {
    const current = L.recent.length ? Math.max(...L.recent) : null;
    return { name: L.name, sessions: L.sessions, since: L.firstDate, firstE1rm: Math.round(L.first), bestE1rm: Math.round(L.best), bestDate: L.bestDate,
      currentE1rm: current ? Math.round(current) : null, gainKg: Math.round((current || L.best) - L.first), gainPct: Math.round(((current || L.best) / L.first - 1) * 100),
      monthlyBest: months.slice(-18).map(m => (L.months[m] ? Math.round(L.months[m]) : null)) };
  });

  // breaks and consistency
  const gaps = dates.slice(1).map((d, i) => ({ from: dates[i], to: d, days: day(dates[i], d) })).filter(g => g.days >= 14).sort((a, b) => b.days - a.days).slice(0, 4);
  const weeks = new Set(dates.map(d => Math.floor(day('2000-01-03', d) / 7)));
  let longestWeeks = 0, run = 0, prev = null;
  for (const w of [...weeks].sort((a, b) => a - b)) { run = prev != null && w === prev + 1 ? run + 1 : 1; longestWeeks = Math.max(longestWeeks, run); prev = w; }
  const totalWeeks = Math.max(1, Math.ceil(spanDays / 7));

  // body weight over the whole period, by month
  const pts = [...(ctx.weights || []).map(w => ({ date: w.date, kg: Number(w.weight) })), ...(ctx.checkins || []).filter(c => c.weight).map(c => ({ date: c.date, kg: Number(c.weight) }))]
    .filter(p => p.date && p.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  const wm = {};
  for (const p of pts) (wm[monthOf(p.date)] = wm[monthOf(p.date)] || []).push(p.kg);
  const weightMonthly = months.slice(-24).map(m => (wm[m] ? { month: m, kg: r1(avg(wm[m])) } : null)).filter(Boolean);
  const body = pts.length ? { firstDate: pts[0].date, firstKg: pts[0].kg, nowKg: pts[pts.length - 1].kg, minKg: Math.min(...pts.map(p => p.kg)), maxKg: Math.max(...pts.map(p => p.kg)), changeKg: r1(pts[pts.length - 1].kg - pts[0].kg), monthly: weightMonthly } : null;
  const cks = (ctx.checkins || []).filter(c => Number(c.waist) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const waist = cks.length >= 2 ? { firstDate: cks[0].date, firstCm: cks[0].waist, nowCm: cks[cks.length - 1].waist, changeCm: r1(cks[cks.length - 1].waist - cks[0].waist) } : null;

  return {
    since: first, daysSince: spanDays, sessions: dates.length, sets: workouts.reduce((t, w) => t + setCount(w), 0),
    sessionsPerWeekOverall: r1(dates.length / (spanDays / 7)), weeksTrained: weeks.size, weeksSinceStart: totalWeeks, longestRunOfWeeks: longestWeeks,
    bestMonth: { month: bestMonth.month, sessions: bestMonth.sessions }, monthly: monthly.slice(-24), lifts, longestBreaks: gaps, body, waist,
  };
}

/**
 * A plain summary built only from the computed read, for when the AI summary
 * is not available. Same shape as the AI one: { answer, outlook }.
 */
export function localSummary(tr, score) {
  const st = tr.stats || {};
  if (!st.sessionsLogged || st.sessionsLogged < 3) return { answer: 'There is not enough training logged yet to judge progress. Log a few more sessions and check again.', outlook: 'not_enough_data' };
  const p1 = [];
  if (st.perWeekNow != null) p1.push(`You are training about ${st.perWeekNow} time${st.perWeekNow === 1 ? '' : 's'} a week${st.perWeekBefore ? ` (${st.perWeekBefore} the month before)` : ''}.`);
  if (st.liftsTracked) p1.push(`${st.liftsRising} of ${st.liftsTracked} tracked lifts are rising.`);
  if (st.weightPerWeekKg != null) p1.push(`Weight is moving ${st.weightPerWeekKg > 0 ? 'up' : 'down'} about ${Math.abs(st.weightPerWeekKg)} kg a week.`);
  if (score) p1.push(`Your plan scores ${score.score} out of 100.`);
  const bad = tr.flags.filter(f => f.tone === 'act'), watch = tr.flags.filter(f => f.tone === 'watch');
  let outlook = 'on_track';
  if (st.liftsTracked && st.liftsRising / st.liftsTracked < 0.34) outlook = 'slow';
  if (bad.length >= 2) outlook = 'off_track';
  else if (bad.length === 1 && outlook === 'on_track') outlook = 'slow';
  const p2 = outlook === 'on_track' ? 'At this pace you are progressing.' : outlook === 'slow' ? 'Progress is slower than it could be.' : 'Several signs say the current approach is not working.';
  const h = tr.stats && tr.stats.history;
  if (h) p1.unshift(`Since ${h.since} you have logged ${h.sessions} sessions.`);
  const longLift = tr.flags.find(f => f.id === 'longlift');
  if (longLift) p1.push(longLift.title + '.');
  const next = [...bad, ...watch].slice(0, 2).map(f => f.title + '.');
  return { answer: [p1.join(' '), p2, next.length ? 'Look at: ' + next.join(' ') : 'Nothing needs changing right now.'].join('\n\n'), outlook, change: (bad[0] || watch[0] || {}).ask || null };
}
