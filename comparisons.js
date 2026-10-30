/* =========================================================================
   COMPARISONS

   Head-to-head between the signed-in Hunter and another Hunter in the party:
   shared lifts (best estimated 1RM), the six stat ranks, level, streak and
   sessions this week. Each comparison says who leads and by how much, so the
   game can show "Ben is ahead of you on bench, you lead him on endurance".

   Reads only. Nothing here writes data or feeds a score, XP or rank.

   Pure, so test/comparisons.test.mjs exercises it without a browser.
   ========================================================================= */

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
/** A lift within this fraction of the other counts as level. */
export const LIFT_TIE = 0.03;

function kg(v) { return Math.round(v * 10) / 10; }

/** Lifts both Hunters have a best for, biggest gap first. */
export function liftEdges(mine, theirs) {
  const out = [];
  for (const [exercise, pr] of Object.entries(mine || {})) {
    const a = Number(pr && pr.e1rm) || 0, b = Number(theirs && theirs[exercise] && theirs[exercise].e1rm) || 0;
    if (!a || !b) continue;
    const gap = (a - b) / Math.max(a, b);
    out.push({ exercise, mine: kg(a), theirs: kg(b), diff: kg(a - b), lead: Math.abs(gap) < LIFT_TIE ? 'tie' : gap > 0 ? 'me' : 'them', pct: Math.round(Math.abs(gap) * 100) });
  }
  return out.sort((x, y) => y.pct - x.pct);
}

/** The stat ranks side by side. `defs` is [{ id, label }]. */
export function statEdges(myStats, theirStats, defs) {
  return (defs || []).map(d => {
    const a = RANKS.indexOf((myStats || {})[d.id] || 'E'), b = RANKS.indexOf((theirStats || {})[d.id] || 'E');
    return { stat: d.id, label: d.label, mine: RANKS[a], theirs: RANKS[b], lead: a === b ? 'tie' : a > b ? 'me' : 'them', steps: Math.abs(a - b) };
  });
}

/** The whole comparison between two Hunters. */
export function compareHunters(me, them, ctx = {}) {
  const num = (a, b) => ({ mine: a, theirs: b, lead: a === b ? 'tie' : a > b ? 'me' : 'them' });
  return {
    name: them.displayName || 'Hunter',
    level: num(Number(me.hunterLevel) || 1, Number(them.hunterLevel) || 1),
    streak: num(ctx.myStreak || 0, ctx.theirStreak || 0),
    week: num(ctx.myWeek || 0, ctx.theirWeek || 0),
    lifts: liftEdges(ctx.myPRs, ctx.theirPRs),
    stats: statEdges(me.stats, them.stats, ctx.statDefs),
  };
}

/** Short sentences, split by who leads. At most `limit` lines each. */
export function describeEdges(cmp, limit = 3) {
  const name = cmp.name;
  const youLead = [], theyLead = [];
  const push = (lead, you, they) => { if (lead === 'me') youLead.push(you); else if (lead === 'them') theyLead.push(they); };
  cmp.lifts.forEach(l => push(l.lead,
    `${l.exercise}: you ${l.mine} kg vs ${l.theirs} kg (+${l.pct}%)`,
    `${l.exercise}: ${l.theirs} kg vs your ${l.mine} kg (+${l.pct}%)`));
  cmp.stats.forEach(s => push(s.lead,
    `${s.label}: rank ${s.mine} vs ${s.theirs}`,
    `${s.label}: rank ${s.theirs} vs your ${s.mine}`));
  push(cmp.streak.lead, `Streak: ${cmp.streak.mine} days vs ${cmp.streak.theirs}`, `Streak: ${cmp.streak.theirs} days vs your ${cmp.streak.mine}`);
  push(cmp.week.lead, `This week: ${cmp.week.mine} sessions vs ${cmp.week.theirs}`, `This week: ${cmp.week.theirs} sessions vs your ${cmp.week.mine}`);
  push(cmp.level.lead, `Level ${cmp.level.mine} vs ${cmp.level.theirs}`, `Level ${cmp.level.theirs} vs your ${cmp.level.mine}`);
  return { name, youLead: youLead.slice(0, limit), theyLead: theyLead.slice(0, limit), youLeadCount: youLead.length, theyLeadCount: theyLead.length };
}

/** One line for a lift: who in the party is ahead of you on it, or that you lead. */
export function liftRival(exercise, myPRs, partyPRs) {
  const mine = Number(myPRs && myPRs[exercise] && myPRs[exercise].e1rm) || 0;
  let best = null;
  for (const [name, prs] of partyPRs || []) {
    const v = Number(prs && prs[exercise] && prs[exercise].e1rm) || 0;
    if (v && (!best || v > best.value)) best = { name, value: kg(v) };
  }
  if (!best) return null;
  if (!mine) return { lead: 'them', text: `${best.name} has ${best.value} kg e1RM`, name: best.name };
  if (best.value > mine * (1 + LIFT_TIE)) return { lead: 'them', text: `${best.name} leads you: ${best.value} vs ${kg(mine)} kg`, name: best.name };
  return { lead: 'me', text: `You lead the party: ${kg(mine)} kg`, name: null };
}

/**
 * Feed lines about the party rather than one Hunter: a recent PR that puts
 * someone ahead of (or behind) you on a lift, and days you trained alongside
 * someone. `others` is [{ uid, name, prs, streak, trainedToday }].
 */
export function rivalryMoments(me, others, myPRs, today, cutoff) {
  const out = [];
  for (const o of others || []) {
    for (const [exercise, pr] of Object.entries(o.prs || {})) {
      const theirs = Number(pr && pr.e1rm) || 0, mine = Number(myPRs && myPRs[exercise] && myPRs[exercise].e1rm) || 0;
      if (!theirs || !mine || !pr.date || pr.date < cutoff) continue;
      if (theirs > mine * (1 + LIFT_TIE)) out.push({ date: pr.date, uid: o.uid, kind: 'ahead', text: `${o.name}'s ${exercise} PR (${kg(theirs)} kg) is ahead of yours (${kg(mine)} kg)` });
    }
    for (const [exercise, pr] of Object.entries(myPRs || {})) {
      const mine = Number(pr && pr.e1rm) || 0, theirs = Number(o.prs && o.prs[exercise] && o.prs[exercise].e1rm) || 0;
      if (!theirs || !mine || !pr.date || pr.date < cutoff) continue;
      if (mine > theirs * (1 + LIFT_TIE)) out.push({ date: pr.date, uid: me.uid, kind: 'behind', text: `Your ${exercise} PR (${kg(mine)} kg) now leads ${o.name} (${kg(theirs)} kg)` });
    }
    if (me.trainedToday && o.trainedToday) out.push({ date: today, uid: o.uid, kind: 'together', text: `You and ${o.name} both trained today` });
    if ((me.streak || 0) >= 7 && (o.streak || 0) >= 7) out.push({ date: today, uid: o.uid, kind: 'streaks', text: `You and ${o.name} are both on ${Math.min(me.streak, o.streak)}+ day streaks` });
  }
  return out;
}
