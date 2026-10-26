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

  const rank = { act: 0, watch: 1, good: 2 };
  flags.sort((a, b) => rank[a.tone] - rank[b.tone]);
  const acts = flags.filter(f => f.tone === 'act'), watch = flags.filter(f => f.tone === 'watch');
  const tone = acts.length ? 'act' : watch.length ? 'watch' : flags.length ? 'good' : 'none';
  const headline = !flags.length ? 'Log a few sessions and the trainer will start reading them.'
    : acts.length ? acts[0].title : watch.length ? watch[0].title : 'On track. Nothing needs changing.';
  return { headline, tone, flags, readiness, stats };
}
