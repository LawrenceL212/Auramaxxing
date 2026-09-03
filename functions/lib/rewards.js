'use strict';
/* Duel reward tables — copied verbatim from index.html.
 * DUEL_STREAK_REWARDS and DUEL_TROPHY_TIERS decide AP transfer, XP multiplier,
 * defeat debuff and trophy weapon. They are gameplay constants: mirror any
 * change made in index.html here, and vice versa.
 */

const DUEL_STREAK_REWARDS = [
  { minStreak: 1,   maxStreak: 4,   apGain: 10,  apLoss: 10,  xpMult: 1.10, title: 'Challenger',    debuffDays: 3, debuffPct: 0.10 },
  { minStreak: 5,   maxStreak: 14,  apGain: 25,  apLoss: 25,  xpMult: 1.20, title: 'Victor',        debuffDays: 5, debuffPct: 0.15 },
  { minStreak: 15,  maxStreak: 29,  apGain: 50,  apLoss: 50,  xpMult: 1.35, title: 'Conqueror',     debuffDays: 7, debuffPct: 0.20 },
  { minStreak: 30,  maxStreak: 59,  apGain: 100, apLoss: 100, xpMult: 1.50, title: 'Warlord',       debuffDays: 7, debuffPct: 0.25 },
  { minStreak: 60,  maxStreak: 99,  apGain: 200, apLoss: 200, xpMult: 1.75, title: 'Sovereign',     debuffDays: 7, debuffPct: 0.25 },
  { minStreak: 100, maxStreak: 999, apGain: 500, apLoss: 500, xpMult: 2.00, title: 'Shadow Monarch', debuffDays: 7, debuffPct: 0.30 },
];

const DUEL_TROPHY_TIERS = [
  { wins: 5,   tier: 1 },
  { wins: 15,  tier: 2 },
  { wins: 30,  tier: 3 },
  { wins: 60,  tier: 4 },
  { wins: 100, tier: 5 },
];

/* Only the duel trophy weapons — the slice of ITEM_DEFINITIONS settlement
 * writes into inventory.weapon. */
const DUEL_TROPHY_ITEMS = {
  duel_trophy_1: {
    slot: 'weapon', stat: 'strength', tier: 1, rarity: 'Common',
    name: "Challenger's Mark",
    desc: 'The System has registered your aggression. Something has begun.',
    dmgMult: 1.15, statBonus: { strength: 3, agility: 2 },
  },
  duel_trophy_2: {
    slot: 'weapon', stat: 'strength', tier: 2, rarity: 'Uncommon',
    name: "Victor's Seal",
    desc: 'Others have started watching how you fight.',
    dmgMult: 1.28, statBonus: { strength: 6, agility: 4, focus: 2 },
  },
  duel_trophy_3: {
    slot: 'weapon', stat: 'strength', tier: 3, rarity: 'Rare',
    name: "Conqueror's Crest",
    desc: 'Thirty without defeat. You have become a problem for this party.',
    dmgMult: 1.45, statBonus: { strength: 10, agility: 6, focus: 4, defence: 3 },
  },
  duel_trophy_4: {
    slot: 'weapon', stat: 'strength', tier: 4, rarity: 'Epic',
    name: "Sovereign's Brand",
    desc: "Undefeated. The Threat Board changes when your name appears. The System's records mention something further. A weapon without a name. The System will not say more.",
    dmgMult: 1.65, statBonus: { strength: 15, agility: 10, focus: 8, defence: 5, endurance: 4 },
  },
  duel_trophy_5: {
    slot: 'weapon', stat: 'strength', tier: 5, rarity: 'Legendary',
    name: '???',
    _hiddenName: 'Excalibur',
    desc: 'The System has no name on record for this weapon. Only that it exists. Only that it has never been held.',
    dmgMult: 2.50, statBonus: { strength: 30, agility: 20, focus: 20, defence: 15, endurance: 15, flexibility: 10 },
  },
};

function getDuelStreakTier(streak) {
  return [...DUEL_STREAK_REWARDS].reverse().find((t) => streak >= t.minStreak) || DUEL_STREAK_REWARDS[0];
}

function getDuelTrophyTier(wins) {
  return [...DUEL_TROPHY_TIERS].reverse().find((t) => wins >= t.wins) || null;
}

module.exports = {
  DUEL_STREAK_REWARDS, DUEL_TROPHY_TIERS, DUEL_TROPHY_ITEMS,
  getDuelStreakTier, getDuelTrophyTier,
};
