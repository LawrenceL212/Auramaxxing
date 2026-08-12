// Automatic achievement definitions — check() functions need live profile/PR/workout
// data, so this is a factory function. Call fresh with current state each time.
export function getAutoAchievements({ profile, myPRs, currentUser, myWorkouts, computeStreak }) {
  return [
  // Streak milestones
  { id:'streak_7',   category:'consistency', icon:'🔥', name:'First Week',        desc:'Maintain a 7-day training streak',       rarity:'common',    check: () => computeStreak(currentUser.uid) >= 7,   ap:0 },
  { id:'streak_30',  category:'consistency', icon:'🔥', name:'Iron Month',         desc:'Maintain a 30-day training streak',      rarity:'rare',      check: () => computeStreak(currentUser.uid) >= 30,  ap:0 },
  { id:'streak_60',  category:'consistency', icon:'🔥', name:'The Unyielding',     desc:'Maintain a 60-day training streak',      rarity:'epic',      check: () => computeStreak(currentUser.uid) >= 60,  ap:0 },
  { id:'streak_100', category:'consistency', icon:'👑', name:'Century Hunter',     desc:'100 consecutive days without missing',   rarity:'legendary', check: () => computeStreak(currentUser.uid) >= 100, ap:0 },
  { id:'streak_365', category:'consistency', icon:'👑', name:'Absolute Devotion',  desc:'365 consecutive days. A full year.',     rarity:'legendary', check: () => computeStreak(currentUser.uid) >= 365, ap:0 },
  // Total workout milestones
  { id:'workouts_10',  category:'volume', icon:'⚡', name:'Awakened',       desc:'Complete 10 workouts',   rarity:'common', check: () => myWorkouts.length >= 10,  ap:0 },
  { id:'workouts_50',  category:'volume', icon:'⚡', name:'Hunter',         desc:'Complete 50 workouts',   rarity:'rare',   check: () => myWorkouts.length >= 50,  ap:0 },
  { id:'workouts_100', category:'volume', icon:'⚡', name:'Veteran Hunter', desc:'Complete 100 workouts',  rarity:'epic',   check: () => myWorkouts.length >= 100, ap:0 },
  { id:'workouts_365', category:'volume', icon:'👑', name:'Eternal Grinder',desc:'Complete 365 workouts',  rarity:'legendary', check: () => myWorkouts.length >= 365, ap:0 },
  // PR tier milestones
  { id:'pr_novice',       category:'strength', icon:'🗡️', name:'First Blood',       desc:'Reach Novice tier on any PR',        rarity:'common',    check: () => Object.values(myPRs).some(p => ['Novice','Intermediate','Advanced','Elite'].includes(p.tier)), ap:0 },
  { id:'pr_intermediate', category:'strength', icon:'⚔️', name:'True Hunter',       desc:'Reach Intermediate tier on any PR',  rarity:'rare',      check: () => Object.values(myPRs).some(p => ['Intermediate','Advanced','Elite'].includes(p.tier)),             ap:0 },
  { id:'pr_advanced',     category:'strength', icon:'💀', name:'Shadow Fighter',    desc:'Reach Advanced tier on any PR',      rarity:'epic',      check: () => Object.values(myPRs).some(p => ['Advanced','Elite'].includes(p.tier)),                              ap:0 },
  { id:'pr_elite',        category:'strength', icon:'👑', name:'The Elite',         desc:'Reach Elite tier on any PR',         rarity:'legendary', check: () => Object.values(myPRs).some(p => p.tier === 'Elite'),                                                  ap:0 },
  // Stat rank milestones
  { id:'rank_d', category:'rank', icon:'🔵', name:'Rank D',    desc:'Upgrade any stat to D rank',  rarity:'common', check: () => Object.values(profile.stats||{}).some(r => ['D','C','B','A','S'].includes(r)), ap:0 },
  { id:'rank_c', category:'rank', icon:'🩵', name:'Rank C',    desc:'Upgrade any stat to C rank',  rarity:'rare',   check: () => Object.values(profile.stats||{}).some(r => ['C','B','A','S'].includes(r)),     ap:0 },
  { id:'rank_b', category:'rank', icon:'🟣', name:'Rank B',    desc:'Upgrade any stat to B rank',  rarity:'epic',   check: () => Object.values(profile.stats||{}).some(r => ['B','A','S'].includes(r)),         ap:0 },
  { id:'rank_a', category:'rank', icon:'🔴', name:'Rank A',    desc:'Upgrade any stat to A rank',  rarity:'legendary', check: () => Object.values(profile.stats||{}).some(r => ['A','S'].includes(r)),          ap:0 },
  { id:'rank_s', category:'rank', icon:'👑', name:'Absolute Being', desc:'Reach S rank on any stat', rarity:'legendary', check: () => Object.values(profile.stats||{}).some(r => r === 'S'),                   ap:0 },
  // Class achievement
  { id:'class_assigned', category:'identity', icon:'⚔️', name:'Identity Confirmed', desc:'The System assigns your Hunter Class', rarity:'rare', check: () => !!profile.hunterClass, ap:0 },
  // Run milestone
  { id:'first_run', category:'endurance', icon:'🏃', name:'First Steps',  desc:'Log your first run', rarity:'common', check: () => myWorkouts.some(w => w.isRun), ap:0 },
  { id:'runs_10',   category:'endurance', icon:'🏃', name:'Road Hunter',  desc:'Log 10 runs',        rarity:'rare',   check: () => myWorkouts.filter(w=>w.isRun).length >= 10, ap:0 },
  ];
}
