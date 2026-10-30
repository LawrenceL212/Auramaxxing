/* =========================================================================
   FLOW SCREENS — the small pure pieces

   Enter Gate, the logger header, Gate Complete, Rank Up, the after-hunt
   chain and the tab dots. Nothing here reads or writes stored state: every
   function takes what it needs and returns plain data, so the rendering code
   in index.html stays presentation only and test/flow-view.test.mjs can
   exercise it without a browser.
   ========================================================================= */

import { daysBetween } from './hunt-view.js';

/* ── muscle figure for the logger header ─────────────────────────────────
   The ten art slots in art-list.md (muscle-<group>) from the exercise
   database's own `muscles` map (21 regions, 0-1 emphasis). */
const GROUP_RULES = [
  ['chest',     /Chest$/],
  ['back',      /^(Upper Back|Lower Back|Lats|Traps)$/],
  ['shoulders', /Shoulders$/],
  ['arms',      /^(Biceps|Triceps|Forearms)$/],
  ['legs',      /^(Quads|Hamstrings|Hip Flexors|Inner Thighs)$/],
  ['core',      /^(Upper Abs|Middle Abs|Lower Abs|Obliques)$/],
  ['glutes',    /^Glutes$/],
  ['calves',    /^Calves$/],
];
export function muscleGroupOf(region) {
  for (const [g, re] of GROUP_RULES) if (re.test(region)) return g;
  return null;
}

/** Below this share (a third) of the weight, no single group leads and the figure is the whole body. */
export const FULLBODY_SHARE = 0.33;

/**
 * The art name for a set of exercises: 'muscle-<group>' for the leading group,
 * 'muscle-cardio' when every exercise is endurance work, 'muscle-fullbody' when
 * no group leads or there is nothing to go on.
 *   exercises  [{ name, sets? }]   db  { [name]: { muscles, intent } }
 */
export function sessionMuscleArt(exercises, db) {
  const list = (exercises || []).filter(e => e && e.name);
  if (!list.length) return 'muscle-fullbody';
  const defs = list.map(e => (db && db[e.name]) || {});
  if (defs.length && defs.every(d => d.intent === 'endurance')) return 'muscle-cardio';
  const score = new Map();
  let total = 0;
  list.forEach((e, i) => {
    const sets = Number(e.sets) || 1;
    for (const [region, w] of Object.entries(defs[i].muscles || {})) {
      const g = muscleGroupOf(region);
      const v = sets * (Number(w) || 0);
      if (!g || v <= 0) continue;
      score.set(g, (score.get(g) || 0) + v);
      total += v;
    }
  });
  if (!total) return 'muscle-fullbody';
  const [best, bestV] = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return bestV / total >= FULLBODY_SHARE ? `muscle-${best}` : 'muscle-fullbody';
}

/* ── Gate Complete reward tiles ──────────────────────────────────────────
   Only real, non-zero numbers become tiles. The app has no gold currency, so
   there is no gold tile: a tile is never drawn for a number that does not exist. */
export function rewardTiles({ xp, ap, streak }) {
  const tiles = [];
  const x = Math.round(Number(xp) || 0);
  if (x > 0) tiles.push({ key: 'xp', art: 'icon-xp', value: `+${x.toLocaleString('en-US')}`, label: 'XP' });
  const a = Math.round(Number(ap) || 0);
  if (a > 0) tiles.push({ key: 'ap', art: 'icon-ap', value: `+${a.toLocaleString('en-US')}`, label: 'AP' });
  const s = Math.floor(Number(streak) || 0);
  if (s > 0) tiles.push({ key: 'streak', art: 'icon-streak', value: `${s}d`, label: 'Streak' });
  return tiles;
}

/* ── AP that can actually be spent ───────────────────────────────────── */
/**
 * The most AP the Hunter can put into one stat right now: the smaller of their
 * AP and that stat's investable cap (stats at S rank are skipped).
 *   stats  [{ isMaxed, maxInvestable }]  from checkV2UpgradeGates
 */
export function investableAp(ap, stats) {
  const have = Math.floor(Number(ap) || 0);
  if (have <= 0) return 0;
  let best = 0;
  for (const s of stats || []) {
    if (!s || s.isMaxed) continue;
    best = Math.max(best, Math.min(have, Math.floor(Number(s.maxInvestable) || 0)));
  }
  return best;
}

/** Days after which a weigh-in is worth suggesting again. */
export const WEIGH_IN_STALE_DAYS = 7;

/**
 * The one thing to suggest after Gate Complete, from real state only.
 *   1. AP that can be invested        -> 'ap'
 *   2. no weigh-in for a week (or ever) -> 'weigh'
 *   3. otherwise                      -> 'codex' (see what the session did)
 * `lastWeighIn` is the newest weigh-in or check-in date ('YYYY-MM-DD') or null.
 */
export function nextAfterHunt({ investable = 0, lastWeighIn = null, today }) {
  if (Number(investable) > 0) {
    return { kind: 'ap', label: 'Invest AP', sub: `${Math.floor(investable).toLocaleString('en-US')} ready to spend` };
  }
  if (!lastWeighIn) return { kind: 'weigh', label: 'Weigh in', sub: 'Never logged' };
  const d = today ? daysBetween(lastWeighIn, today) : 0;
  if (d >= WEIGH_IN_STALE_DAYS) return { kind: 'weigh', label: 'Weigh in', sub: `Last ${d} days ago` };
  return { kind: 'codex', label: 'Open the Codex', sub: 'See what this hunt grew' };
}

/* ── bottom nav dots ─────────────────────────────────────────────────────
   A dot shows only when the tab holds something real to act on:
     board  AP that can be invested in a stat (not just any AP balance)
     world  Shadow Army soldiers earned and not yet deployed
   Hunt, Codex and Arsenal never show one: nothing there is "unspent". */
export const DOT_TABS = ['quest', 'board', 'trends', 'exercises', 'world'];

export function tabDots({ ap = 0, stats = [], pool = {} } = {}) {
  const soldiers = Object.values(pool || {}).reduce((n, v) => n + Math.max(0, Number(v) || 0), 0);
  return {
    quest: false,
    board: investableAp(ap, stats) > 0,
    trends: false,
    exercises: false,
    world: soldiers > 0,
  };
}

/**
 * The one line shown at the top of a tab that has a dot, saying why.
 * `null` when the tab has no dot. Same inputs as tabDots, so the two never disagree.
 *   board  "120 AP to invest"        -> action opens the stat picker
 *   world  "40 soldiers to deploy"   -> action opens the map
 */
export function tabDotBanner(view, state = {}) {
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  if (view === 'board') {
    const n = investableAp(state.ap, state.stats);
    return n > 0 ? { view, kind: 'ap', text: `${fmt(n)} AP to invest`, action: 'Invest' } : null;
  }
  if (view === 'world') {
    const n = Object.values(state.pool || {}).reduce((a, v) => a + Math.max(0, Number(v) || 0), 0);
    return n > 0 ? { view, kind: 'army', text: `${fmt(n)} ${n === 1 ? 'soldier' : 'soldiers'} to deploy`, action: 'Open map' } : null;
  }
  return null;
}
