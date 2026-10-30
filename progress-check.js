/* =========================================================================
   PROGRESS CHECK — a fast, honest, motivating summary

   One tap from the Hunt screen. Reads the facts the app already has (streak,
   sessions this week and this month, new PRs, the last check-in's changes, the
   physique goal and weight path) and returns a headline, one line that picks
   the best true fact, a few wins, and the single next step. It only ever says
   what the numbers say: a bad stretch gets a restart prompt, never fake praise.

   Pure: takes plain values, returns plain data. Reads and writes nothing.
   Presentation only; nothing here feeds XP or progression.
   Tested by node test/progress-check.test.mjs
   ========================================================================= */

import { shiftDay } from './streak.js';
import { daysBetween } from './hunt-view.js';
import { weekStartOf } from './plan-day.js';

const uniq = (list) => [...new Set((list || []).filter(Boolean))];
const countIn = (dates, from, to) => dates.filter(d => d >= from && d <= to).length;

const LINES = {
  fire: ['You are on a run. Keep stacking it.', 'This is what consistency looks like.', 'The work is showing. Do not break the chain.'],
  strong: ['Solid momentum. A little more and it compounds.', 'You are showing up. That is the whole game.', 'Good week to build on.'],
  steady: ['Progress is quiet before it is loud. Keep going.', 'Every session is a vote for who you are becoming.', 'You are building the base. Stay with it.'],
  restart: ['One short session restarts everything.', 'The streak is gone, the progress is not. Start small.', 'Fifteen minutes today beats a perfect plan tomorrow.'],
};
const pickLine = (tone, today) => {
  const list = LINES[tone];
  const n = Number(String(today).replace(/-/g, '')) || 0;
  return list[n % list.length];
};

/**
 * ctx {
 *   today, streak, weeklyGoal, sessionDates: ['YYYY-MM-DD'...], prDates: [...],
 *   level, rank, lastCheckinDate, checkinProgress: { headline, better, worse, first } | null,
 *   physique: { label, overall, track } | null, weightPath: { track, pct } | null,
 *   plannedToday?: boolean, trainedToday?: boolean,
 * }
 * @returns { tone, headline, line, wins:[{key,value,label,sub,kind}], next:{text,action} }
 */
export function progressCheck(ctx) {
  const today = ctx && ctx.today;
  if (!today) return null;
  const dates = uniq(ctx.sessionDates).filter(d => d <= today);
  const streak = Math.max(0, Number(ctx.streak) || 0);
  const goal = Math.max(1, Number(ctx.weeklyGoal) || 3);
  const wk = countIn(dates, weekStartOf(today), today);
  const m30 = countIn(dates, shiftDay(today, -29), today);
  const prev30 = countIn(dates, shiftDay(today, -59), shiftDay(today, -30));
  const prs30 = uniq(ctx.prDates).filter(d => d >= shiftDay(today, -29) && d <= today).length;
  const lastSession = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  const idle = lastSession ? daysBetween(lastSession, today) : null;
  const cp = ctx.checkinProgress || null;
  const checkinAge = ctx.lastCheckinDate ? daysBetween(ctx.lastCheckinDate, today) : null;
  const ph = ctx.physique || null;
  const wp = ctx.weightPath || null;

  // tone: only what the numbers earn
  let score = 0;
  if (streak >= 7) score += 2; else if (streak >= 3) score += 1;
  if (wk >= goal) score += 2; else if (wk >= 1) score += 1;
  if (m30 > prev30 && m30 > 0) score += 1;
  if (prs30 > 0) score += 1;
  if (cp && !cp.first && cp.better > cp.worse) score += 1;
  if (ph && (ph.track === 'ahead' || ph.track === 'on')) score += 1;
  if (wp && (wp.track === 'ahead' || wp.track === 'on')) score += 1;
  const cold = (idle === null || idle >= 10) && streak === 0;
  const tone = cold ? 'restart' : score >= 6 ? 'fire' : score >= 3 ? 'strong' : 'steady';
  const headline = { restart: 'Time to restart', fire: 'On fire', strong: 'Strong momentum', steady: 'Building' }[tone];

  // wins, best first
  const wins = [];
  if (streak >= 2) wins.push({ key: 'streak', value: `${streak}`, label: 'day streak', sub: streak >= 7 ? 'A full week or more' : 'Keep it alive today', kind: 'win' });
  wins.push({ key: 'week', value: `${wk}/${goal}`, label: 'sessions this week', sub: wk >= goal ? 'Week goal hit' : `${goal - wk} to go`, kind: wk >= goal ? 'win' : 'info' });
  if (m30 > 0) wins.push({ key: 'month', value: `${m30}`, label: 'sessions in 30 days', sub: prev30 > 0 ? (m30 > prev30 ? `+${m30 - prev30} on the 30 before` : m30 === prev30 ? 'Same as the 30 before' : `${prev30 - m30} fewer than the 30 before`) : 'A new run of work', kind: m30 > prev30 ? 'win' : 'info' });
  if (prs30 > 0) wins.push({ key: 'prs', value: `${prs30}`, label: prs30 === 1 ? 'new PR in 30 days' : 'new PRs in 30 days', sub: 'You are getting stronger', kind: 'win' });
  if (cp && !cp.first) wins.push({ key: 'body', value: cp.headline, label: 'since last check-in', sub: cp.better ? `${cp.better} measurement${cp.better === 1 ? '' : 's'} improved` : cp.worse ? `${cp.worse} slipped` : 'Holding steady', kind: cp.better > cp.worse ? 'win' : cp.worse > cp.better ? 'warn' : 'info' });
  if (ph) wins.push({ key: 'physique', value: `${ph.overall}%`, label: `to ${ph.label}`, sub: ph.track === 'ahead' ? 'Ahead of pace' : ph.track === 'behind' ? 'Behind pace' : 'On pace', kind: ph.track === 'behind' ? 'warn' : 'win' });
  else if (wp) wins.push({ key: 'weight', value: `${wp.pct}%`, label: 'of your weight goal', sub: wp.track === 'ahead' ? 'Ahead of your path' : wp.track === 'behind' ? 'Behind your path' : 'On your path', kind: wp.track === 'behind' ? 'warn' : 'win' });
  if (ctx.level) wins.push({ key: 'level', value: `Lv ${ctx.level}`, label: ctx.rank ? `Rank ${ctx.rank}` : 'Hunter level', sub: '', kind: 'info' });

  // the single next step
  let next;
  if (cold) next = { text: 'Log a 15-minute session today. That restarts the streak.', action: 'train' };
  else if (!ctx.trainedToday && ctx.plannedToday) next = { text: 'Today is a training day. Get the session in.', action: 'train' };
  else if (checkinAge === null || checkinAge >= 7) next = { text: checkinAge === null ? 'Do your first body check-in to start tracking your physique.' : `Your last check-in was ${checkinAge} days ago. Do this week's.`, action: 'checkin' };
  else if (wk < goal) next = { text: `${goal - wk} more session${goal - wk === 1 ? '' : 's'} this week hits your goal.`, action: 'train' };
  else if (!ph) next = { text: 'Set a physique goal and a deadline so the plan adjusts to you.', action: 'goal' };
  else next = { text: 'Week goal done. Rest well and hold the plan.', action: null };

  // the one line: the best true fact
  let line = pickLine(tone, today);
  if (tone !== 'restart') {
    if (cp && !cp.first && cp.better >= 2 && cp.better > cp.worse) line = `${cp.better} body measurements moved the right way since your last check-in.`;
    else if (prs30 > 0 && tone !== 'steady') line = `${prs30} new PR${prs30 === 1 ? '' : 's'} in the last 30 days. ${pickLine(tone, today)}`;
    else if (streak >= 7) line = `${streak} days in a row. ${pickLine(tone, today)}`;
  } else if (idle !== null) {
    line = `${idle} days since your last session. ${pickLine(tone, today)}`;
  }

  return { tone, headline, line, wins: wins.slice(0, 6), next };
}
