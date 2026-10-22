/* Tests for the flow-screen helpers.  Run:  node test/flow-view.test.mjs
   No dependencies and no runner, in the style of test/hunt-view.test.mjs. */

import {
  muscleGroupOf, sessionMuscleArt, rewardTiles, investableAp, nextAfterHunt, tabDots, DOT_TABS, tabDotBanner,
} from '../flow-view.js';
import { UI_ART_NAMES } from '../ui-art.js';
import { BASE_EXERCISES } from '../exercises.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const db = {
  Bench: { muscles: { 'Middle Chest': 1, 'Front Shoulders': 0.4, Triceps: 0.5 } },
  Row: { muscles: { Lats: 1, 'Upper Back': 0.6, Biceps: 0.4 } },
  Squat: { muscles: { Quads: 1, Glutes: 0.7, Hamstrings: 0.4 } },
  Run: { intent: 'endurance', muscles: { Quads: 0.3 } },
  Bike: { intent: 'endurance', muscles: {} },
};

// ── muscle figure ─────────────────────────────────────────────────────────
check('chest regions map to chest', ['Upper Chest', 'Middle Chest', 'Lower Chest', 'Chest'].map(muscleGroupOf), ['chest', 'chest', 'chest', 'chest']);
check('back regions', ['Lats', 'Upper Back', 'Lower Back', 'Traps'].map(muscleGroupOf), ['back', 'back', 'back', 'back']);
check('shoulder heads', ['Front Shoulders', 'Lateral Shoulders', 'Rear Shoulders'].map(muscleGroupOf), ['shoulders', 'shoulders', 'shoulders']);
check('unknown region has no group', muscleGroupOf('Elbows'), null);
check('every figure name is an art slot',
  ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'glutes', 'calves'].every(g => UI_ART_NAMES.includes(`muscle-${g}`)) &&
  UI_ART_NAMES.includes('muscle-cardio') && UI_ART_NAMES.includes('muscle-fullbody'), true);
check('a push day leads with chest', sessionMuscleArt([{ name: 'Bench', sets: 4 }], db), 'muscle-chest');
check('a pull day leads with back', sessionMuscleArt([{ name: 'Row', sets: 3 }], db), 'muscle-back');
check('all-endurance session is cardio', sessionMuscleArt([{ name: 'Run' }, { name: 'Bike' }], db), 'muscle-cardio');
check('mixed with one lift is not cardio', sessionMuscleArt([{ name: 'Run' }, { name: 'Bench', sets: 3 }], db), 'muscle-chest');
check('no exercises is the whole body', sessionMuscleArt([], db), 'muscle-fullbody');
check('unknown exercise is the whole body', sessionMuscleArt([{ name: 'Nope' }], db), 'muscle-fullbody');
check('no group leading is the whole body', sessionMuscleArt([{ name: 'Bench', sets: 3 }, { name: 'Row', sets: 3 }, { name: 'Squat', sets: 3 }], db), 'muscle-fullbody');
check('sets weight the lead', sessionMuscleArt([{ name: 'Bench', sets: 1 }, { name: 'Squat', sets: 8 }], db), 'muscle-legs');
{
  const real = Object.keys(BASE_EXERCISES).slice(0, 400).map(n => sessionMuscleArt([{ name: n, sets: 3 }], BASE_EXERCISES));
  check('real database always resolves to a known slot', real.every(n => UI_ART_NAMES.includes(n)), true);
}

// ── reward tiles ──────────────────────────────────────────────────────────
check('all three real numbers', rewardTiles({ xp: 120.4, ap: 5, streak: 3 }).map(t => [t.key, t.value]), [['xp', '+120'], ['ap', '+5'], ['streak', '3d']]);
check('zero and missing become no tile', rewardTiles({ xp: 0, ap: undefined, streak: 0 }), []);
check('only XP when that is all there is', rewardTiles({ xp: 40, ap: 0, streak: 0 }).map(t => t.key), ['xp']);
check('never a gold tile', rewardTiles({ xp: 1, ap: 1, streak: 1, gold: 99 }).some(t => /gold/.test(t.key + t.art)), false);
check('thousands get a separator', rewardTiles({ xp: 1234 })[0].value, '+1,234');
check('NaN is no tile', rewardTiles({ xp: NaN, ap: 'x', streak: null }), []);

// ── investable AP ─────────────────────────────────────────────────────────
check('no AP means nothing to invest', investableAp(0, [{ maxInvestable: 50 }]), 0);
check('AP but nothing investable', investableAp(10, [{ maxInvestable: 0 }]), 0);
check('limited by AP', investableAp(10, [{ maxInvestable: 50 }]), 10);
check('limited by the cap', investableAp(100, [{ maxInvestable: 7 }, { maxInvestable: 3 }]), 7);
check('maxed stats are skipped', investableAp(10, [{ isMaxed: true, maxInvestable: 50 }]), 0);
check('fractional AP floors', investableAp(0.9, [{ maxInvestable: 5 }]), 0);
check('empty stats', investableAp(10, []), 0);

// ── after-hunt chain ──────────────────────────────────────────────────────
const T = '2026-10-22';
check('AP to spend comes first', nextAfterHunt({ investable: 12, lastWeighIn: T, today: T }).kind, 'ap');
check('stale weigh-in is next', nextAfterHunt({ investable: 0, lastWeighIn: '2026-10-10', today: T }), { kind: 'weigh', label: 'Weigh in', sub: 'Last 12 days ago' });
check('never weighed in', nextAfterHunt({ investable: 0, lastWeighIn: null, today: T }).sub, 'Never logged');
check('weigh-in exactly 7 days old', nextAfterHunt({ lastWeighIn: '2026-10-15', today: T }).kind, 'weigh');
check('weigh-in 6 days old falls through to the Codex', nextAfterHunt({ lastWeighIn: '2026-10-16', today: T }).kind, 'codex');
check('AP beats a stale weigh-in', nextAfterHunt({ investable: 3, lastWeighIn: null, today: T }).kind, 'ap');

// ── tab dots ──────────────────────────────────────────────────────────────
const open = [{ isMaxed: false, maxInvestable: 20 }];
check('no dots with nothing to do', tabDots({}), { quest: false, board: false, trends: false, exercises: false, world: false });
check('Rank dot with investable AP', tabDots({ ap: 10, stats: open }).board, true);
check('no Rank dot when AP is capped out', tabDots({ ap: 10, stats: [{ maxInvestable: 0 }] }).board, false);
check('no Rank dot with no AP', tabDots({ ap: 0, stats: open }).board, false);
check('World dot with undeployed soldiers', tabDots({ pool: { iron: 0, swift: 4 } }).world, true);
check('no World dot with an empty pool', tabDots({ pool: { iron: 0 } }).world, false);
check('negative pool is not a dot', tabDots({ pool: { iron: -3 } }).world, false);
check('keys match the five tabs', Object.keys(tabDots({})), DOT_TABS);

// ── dot banner: says why, and agrees with the dot
check('board banner names the AP', tabDotBanner('board', { ap: 120, stats: [{ maxInvestable: 500 }] }), { view: 'board', kind: 'ap', text: '120 AP to invest', action: 'Invest' });
check('board banner limited by the cap', tabDotBanner('board', { ap: 120, stats: [{ maxInvestable: 7 }] }).text, '7 AP to invest');
check('no banner without a dot (board)', tabDotBanner('board', { ap: 0, stats: [{ maxInvestable: 500 }] }), null);
check('world banner counts soldiers', tabDotBanner('world', { pool: { a: 3, b: 4 } }).text, '7 soldiers to deploy');
check('world banner singular', tabDotBanner('world', { pool: { a: 1 } }).text, '1 soldier to deploy');
check('no banner for an empty pool', tabDotBanner('world', { pool: { a: 0 } }), null);
check('no banner on tabs that never get a dot', ['quest', 'trends', 'exercises'].map(v => tabDotBanner(v, { ap: 99, stats: [{ maxInvestable: 9 }], pool: { a: 9 } })), [null, null, null]);
check('banner and dot agree', ['board', 'world'].every(v => !!tabDotBanner(v, { ap: 5, stats: [{ maxInvestable: 5 }], pool: { a: 2 } }) === tabDots({ ap: 5, stats: [{ maxInvestable: 5 }], pool: { a: 2 } })[v]), true);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
