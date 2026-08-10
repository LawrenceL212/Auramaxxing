// ══════════════════════════════════════════════════════════════════════════════
// AURAMAXXING — CLASS SYSTEM
// 6 root archetypes. 63 unique paths. 250+ class names across tiers.
// Loaded lazily — only imported when classification or trials are needed.
// ══════════════════════════════════════════════════════════════════════════════

// ── ROOT ARCHETYPES ──
// Every hunter is evaluated against 6 roots. Each root has a score 0-100
// based on their lifetime workout data. The combination of roots that score
// above the confidence threshold (20%+ of training identity) determines the path.

export const ROOTS = {
  IRON:   { label: 'Iron',   icon: '🏋️', desc: 'Strength — barbell, compounds, progressive overload' },
  SHADOW: { label: 'Shadow', icon: '🤸', desc: 'Skill — planche, lever, handstand, gymnastics, calisthenics' },
  SWIFT:  { label: 'Swift',  icon: '🏃', desc: 'Speed & Cardio — running, sprinting, explosive movement' },
  TIDE:   { label: 'Tide',   icon: '🌊', desc: 'Endurance — swimming, cycling, sustained output' },
  COURT:  { label: 'Court',  icon: '🥊', desc: 'Combat & Sport — boxing, martial arts, team sports' },
  WILD:   { label: 'Wild',   icon: '🧗', desc: 'Wilderness — climbing, flexibility, mobility, nature movement' },
};

// ── CONFIDENCE THRESHOLD ──
// A root must represent at least this fraction of total training to count.
// 0.20 = 20%. Max 5 roots can contribute (5 × 20% = 100%).
export const CONFIDENCE_THRESHOLD = 0.20;

// ── MINIMUM GATES ──
// Before any classification can fire, these must be met.
// Not time-based — data-based. The System needs enough to be sure.
export const MIN_GATES = {
  totalWorkouts: 40,        // at least 40 sessions logged ever
  distinctWeeks: 12,        // spread across at least 12 different calendar weeks
  dominantWeekFraction: 0.6, // dominant root must appear in 60%+ of all logged weeks
  maxGapWeeks: 3,           // no training gap longer than 3 weeks (consistency check)
};

// ── ROOT SCORING FUNCTION ──
// Takes processed workout data and returns root scores { IRON: 0-100, ... }
// Called by evaluateClass() — never called directly.
export function scoreRoots(data) {
  const {
    totalSets, cats, lowRIRSets, totalRIRSets, highRIRSets,
    totalPRs, avgWeekly, totalWorkouts, bestStrRatio,
    bestPullupReps, bestWeightedPullup, skillBestSecs,
    qualifyingRuns, bestPace, swimSessions, cyclingSessions,
    climbSessions, sportSessions, sportMins, pistolData,
    bestGermanHangSecs, weeklyData,
  } = data;

  const pct     = k => totalSets > 0 ? (cats[k] || 0) / totalSets : 0;
  const rirLow  = totalRIRSets > 0 ? lowRIRSets  / totalRIRSets : 0;
  const rirHigh = totalRIRSets > 0 ? highRIRSets / totalRIRSets : 0;

  const scores = { IRON: 0, SHADOW: 0, SWIFT: 0, TIDE: 0, COURT: 0, WILD: 0 };

  // ── IRON — compound strength, progressive overload, low RIR ──
  scores.IRON += pct('compound') * 40;
  scores.IRON += rirLow * 25;
  scores.IRON += Math.min(totalPRs * 2, 20);
  scores.IRON += bestStrRatio >= 1.0 ? 15 : bestStrRatio >= 0.75 ? 8 : 0;
  scores.IRON += pct('isolation') * 10; // accessory work is still iron
  scores.IRON += pct('compound') > 0.4 ? 10 : 0; // bonus for dominance

  // ── SHADOW — skill holds, calisthenics, gymnastic control ──
  scores.SHADOW += pct('skill') * 45;
  scores.SHADOW += pct('calisthenics') * 25;
  scores.SHADOW += rirHigh * 15; // skill work is controlled, not maximal
  scores.SHADOW += Object.keys(skillBestSecs || {}).length * 2; // variety of skills
  scores.SHADOW += (skillBestSecs['Full Planche'] || 0) > 0 ? 15 : 0;
  scores.SHADOW += (skillBestSecs['Front Lever'] || 0) > 0 ? 10 : 0;
  scores.SHADOW += (skillBestSecs['Freestanding Handstand Hold'] || 0) > 10 ? 10 : 0;
  scores.SHADOW = Math.min(scores.SHADOW, 100);

  // ── SWIFT — running, sprinting, explosive output ──
  scores.SWIFT += pct('explosive') * 35;
  scores.SWIFT += pct('cardio') * 25;
  scores.SWIFT += qualifyingRuns.length * 1.5;
  scores.SWIFT += bestPace < 300 ? 20 : bestPace < 360 ? 12 : bestPace < 420 ? 6 : 0;
  scores.SWIFT += (pistolData?.bestReps || 0) >= 10 ? 10 : (pistolData?.bestReps || 0) >= 5 ? 5 : 0;
  scores.SWIFT = Math.min(scores.SWIFT, 100);

  // ── TIDE — swimming, cycling, sustained endurance output ──
  scores.TIDE += (swimSessions?.size || 0) * 2;
  scores.TIDE += (cyclingSessions?.size || 0) * 2;
  scores.TIDE += pct('cardio') * 20;
  scores.TIDE += (swimSessions?.size || 0) > 20 ? 20 : 0;
  scores.TIDE += (cyclingSessions?.size || 0) > 20 ? 20 : 0;
  scores.TIDE = Math.min(scores.TIDE, 100);

  // ── COURT — boxing, combat sports, team sports ──
  scores.COURT += (sportSessions?.boxing?.size || 0) * 2.5;
  scores.COURT += (sportSessions?.court?.size || 0) * 2;
  scores.COURT += (sportMins?.boxing || 0) / 30;
  scores.COURT += (sportMins?.court || 0) / 30;
  scores.COURT += pct('combat') * 30;
  scores.COURT = Math.min(scores.COURT, 100);

  // ── WILD — climbing, flexibility, mobility, movement ──
  scores.WILD += (climbSessions?.size || 0) * 2.5;
  scores.WILD += pct('flexibility') * 35;
  scores.WILD += pct('climbing') * 30;
  scores.WILD += bestGermanHangSecs >= 30 ? 15 : bestGermanHangSecs >= 15 ? 8 : 0;
  scores.WILD = Math.min(scores.WILD, 100);

  return scores;
}

// ── WEEKLY CONSISTENCY CHECK ──
// Returns fraction of weekly training blocks where each root was dominant.
// Used to ensure the pattern is stable — not just a recent spike.
export function weeklyConsistency(weeklyData) {
  if (!weeklyData || weeklyData.length === 0) return {};
  const rootWeekCounts = { IRON:0, SHADOW:0, SWIFT:0, TIDE:0, COURT:0, WILD:0 };
  weeklyData.forEach(week => {
    const top = Object.entries(week.rootScores || {}).sort((a,b)=>b[1]-a[1])[0];
    if (top && top[1] > 10) rootWeekCounts[top[0]]++;
  });
  const result = {};
  Object.entries(rootWeekCounts).forEach(([r,c]) => {
    result[r] = weeklyData.length > 0 ? c / weeklyData.length : 0;
  });
  return result;
}

// ── CLASS PATH DEFINITIONS ──
// Each path has tiers E through S. Each tier has:
//   name        — the class name at that tier
//   minRootScore — minimum score needed in contributing roots to reach this tier
//   raidAffinity — which stat type gets the damage bonus
//   affinityMult — multiplier applied to that stat's raid damage
//   trialName   — name of the class trial
//   trialDesc   — what the trial requires
//   trialCheck  — function(workouts, weeklyData) => boolean
//   color       — UI accent colour

const tier = (name, minScore, affinity, mult, trialName, trialDesc, color) =>
  ({ name, minScore, raidAffinity: affinity, affinityMult: mult, trialName, trialDesc, color });

export const CLASS_PATHS = {

  // ══════════════════════════════════════════════
  // SINGLE ROOT PATHS (6)
  // ══════════════════════════════════════════════

  'IRON': {
    roots: ['IRON'],
    tiers: [
      tier('Grunt',        20, 'strength', 1.15, 'First Load',      'Log 3 compound sessions this week with at least 3 sets each at RIR 0-2.',                        '#9CA3AF'),
      tier('Lifter',       35, 'strength', 1.25, 'Iron Session',    'Log 5 compound sessions this week. Every set at RIR 2 or lower.',                                '#78716C'),
      tier('Powerlifter',  50, 'strength', 1.40, 'Max Effort Week', 'Hit a PR on squat, bench, and deadlift in the same week.',                                       '#B45309'),
      tier('Berserker',    65, 'strength', 1.55, 'Iron Gauntlet',   'Log 5 workouts in 7 days each with 3+ compound lifts at RIR 0-1.',                               '#DC2626'),
      tier('Iron Lord',    80, 'strength', 1.75, 'Sovereign Lift',  'Hit 1.5× BW bench, 2× BW squat, and 2.5× BW deadlift in a single week.',                        '#EF4444'),
    ],
  },

  'SHADOW': {
    roots: ['SHADOW'],
    tiers: [
      tier('Novice',       20, 'focus',    1.15, 'First Hold',      'Log 3 skill hold sessions this week — planche, lever, or handstand.',                            '#9CA3AF'),
      tier('Acrobat',      35, 'focus',    1.25, 'Skill Session',   'Log 5 skill sessions. Every hold at 80%+ of your best logged duration.',                         '#7C3AED'),
      tier('Gymnast',      50, 'focus',    1.40, 'Advanced Hold',   'Log Advanced Tuck Planche 10s AND Tuck Front Lever 10s in the same week.',                       '#6D28D9'),
      tier('Monk',         65, 'focus',    1.55, 'Still Water',     'Log 10 skill hold sessions in 7 days — planche, lever, handstand, or L-sit.',                    '#5B21B6'),
      tier('Shadow Monk',  80, 'focus',    1.75, 'Void Still',      'Full Planche 3s AND Front Lever 5s logged in the same week.',                                    '#4C1D95'),
    ],
  },

  'SWIFT': {
    roots: ['SWIFT'],
    tiers: [
      tier('Jogger',       20, 'agility',  1.15, 'First Run',       'Log 3 qualifying runs this week (3km+, sub 8:00/km).',                                           '#9CA3AF'),
      tier('Runner',       35, 'agility',  1.25, 'Tempo Week',      'Log 5 runs this week, at least 2 at sub 6:00/km.',                                               '#059669'),
      tier('Sprinter',     50, 'agility',  1.40, 'Speed Trial',     'Complete 5 explosive sessions in 7 days — hill sprints, box jumps, or interval runs.',           '#10B981'),
      tier('Ranger',       65, 'agility',  1.55, 'Ranger\'s March', 'Log a strength session AND a cardio session on the same day, 3 times in 7 days.',                '#34D399'),
      tier('Ghost Runner', 80, 'agility',  1.75, 'Wind Trial',      'Log running sessions 6 out of 7 days, best pace sub 5:00/km.',                                   '#6EE7B7'),
    ],
  },

  'TIDE': {
    roots: ['TIDE'],
    tiers: [
      tier('Paddler',         20, 'endurance', 1.15, 'First Lengths',    'Log 3 swim or cycle sessions this week, 20+ mins each.',                                    '#9CA3AF'),
      tier('Swimmer',         35, 'endurance', 1.25, 'Endurance Week',   'Log 5 swim or cycle sessions this week.',                                                    '#0EA5E9'),
      tier('Endurance Athlete',50,'endurance', 1.40, 'Iron Distance',    'Log cycling, swimming, AND running sessions in the same week.',                              '#0284C7'),
      tier('AquaHunter',      65, 'endurance', 1.55, 'Deep Water Trial', 'Log 7 swimming sessions in 7 days.',                                                         '#0369A1'),
      tier('Tide Sovereign',  80, 'endurance', 1.75, 'Ocean Sovereign',  '40+ total swim sessions AND 40+ cycle sessions in your history.',                            '#1E3A5F'),
    ],
  },

  'COURT': {
    roots: ['COURT'],
    tiers: [
      tier('Rookie',          20, 'agility',  1.15, 'Court Entry',      'Log 3 boxing or court sport sessions this week.',                                            '#9CA3AF'),
      tier('Athlete',         35, 'agility',  1.25, 'Field Week',       'Log 5 combat or sport sessions this week.',                                                  '#F59E0B'),
      tier('Court Striker',   50, 'agility',  1.40, 'Combat Trial',     'Log 7 boxing sessions in 7 days.',                                                           '#D97706'),
      tier('CourtKing',       65, 'agility',  1.55, 'Court Dominance',  'Log 7 court or field sport sessions in 7 days.',                                             '#B45309'),
      tier('Arena Sovereign', 80, 'agility',  1.75, 'Arena Trial',      '30+ boxing sessions AND 30+ court sessions in your history.',                                '#92400E'),
    ],
  },

  'WILD': {
    roots: ['WILD'],
    tiers: [
      tier('Wanderer',        20, 'flexibility',1.15,'First Ascent',    'Log 3 climbing or mobility sessions this week.',                                              '#9CA3AF'),
      tier('Climber',         35, 'flexibility',1.25,'Wall Week',       'Log 5 climbing sessions this week.',                                                          '#65A30D'),
      tier('Alpinist',        50, 'flexibility',1.40,'Summit Trial',    'Log 5 climbing AND 5 flexibility sessions in 7 days.',                                        '#4D7C0F'),
      tier('Sovereign',       65, 'flexibility',1.55,'Sovereign\'s Grace','Log flexibility sessions every day for 7 days.',                                             '#3F6212'),
      tier('Wild Monarch',    80, 'flexibility',1.75,'Apex Trial',      '40+ climbing sessions AND German Hang 45s logged.',                                           '#1A2E05'),
    ],
  },

  // ══════════════════════════════════════════════
  // DUAL ROOT PATHS (15)
  // ══════════════════════════════════════════════

  'IRON+SHADOW': {
    roots: ['IRON','SHADOW'],
    tiers: [
      tier('Street Fighter',    20, 'strength', 1.20, 'Dual Discipline',  'Log compound lifts AND skill holds in the same week, 3 sessions each.',                   '#9CA3AF'),
      tier('Shadowblade',       35, 'strength', 1.30, 'Shadow Protocol',  'Log 7 calisthenics-only sessions in 7 days.',                                              '#7C3AED'),
      tier('Iron Monk',         50, 'strength', 1.45, 'Iron Still',       'Hit 1.0× BW deadlift AND log Advanced Tuck Planche 8s in the same week.',                 '#6D28D9'),
      tier('Phantom Knight',    65, 'focus',    1.60, 'Knight\'s Trial',  '5 compound sessions AND 5 skill sessions in the same 7 days.',                             '#5B21B6'),
      tier('Iron Phantom',      80, 'focus',    1.80, 'Phantom Iron',     '1.25× BW squat AND Full Planche 3s logged in your history.',                               '#3B0764'),
    ],
  },

  'IRON+SWIFT': {
    roots: ['IRON','SWIFT'],
    tiers: [
      tier('Warrior',           20, 'strength', 1.20, 'Warrior\'s Path',  'Log compound lifts AND a qualifying run in the same week.',                                '#9CA3AF'),
      tier('Iron Ranger',       35, 'strength', 1.30, 'Ranger\'s Lift',   '3 strength sessions AND 3 cardio sessions in the same 7 days.',                           '#059669'),
      tier('Combat Ranger',     50, 'strength', 1.45, 'Iron March',       'Log a strength session AND a cardio session on the same day, 3 times in 7 days.',          '#10B981'),
      tier('Iron Ghost',        65, 'agility',  1.60, 'Ghost Lift',       '5 compound sessions AND 5 explosive sessions in 7 days.',                                  '#34D399'),
      tier('Iron Sovereign',    80, 'strength', 1.80, 'Iron Sovereign',   '1.5× BW deadlift AND sub-5:00/km run in the same week.',                                  '#064E3B'),
    ],
  },

  'IRON+TIDE': {
    roots: ['IRON','TIDE'],
    tiers: [
      tier('Iron Swimmer',      20, 'strength', 1.20, 'Iron Tide',        'Log compound lifts AND a swim or cycle session in the same week.',                         '#9CA3AF'),
      tier('Ironclad',          35, 'endurance',1.30, 'Endurance Engine', 'Log 4 cycling AND 2 strength sessions in 7 days.',                                         '#0EA5E9'),
      tier('Iron Tide',         50, 'strength', 1.45, 'Tide Lifter',      '4 swim sessions AND 4 compound sessions in the same week.',                                '#0284C7'),
      tier('Deep Iron',         65, 'endurance',1.60, 'Deep Iron Trial',  '20+ swim sessions AND 20+ compound sessions in your history.',                             '#075985'),
      tier('Iron Sovereign',    80, 'strength', 1.80, 'Sovereign Iron',   '1.25× BW deadlift AND 30+ swim sessions in your history.',                                '#0C4A6E'),
    ],
  },

  'IRON+COURT': {
    roots: ['IRON','COURT'],
    tiers: [
      tier('Street Iron',       20, 'strength', 1.20, 'Iron Court',       'Log compound lifts AND a boxing or sport session in the same week.',                       '#9CA3AF'),
      tier('Warlord',           35, 'strength', 1.30, 'Volume War',       'Accumulate 100 total sets across 5 workouts in 7 days.',                                   '#D97706'),
      tier('Arena Lord',        50, 'strength', 1.45, 'Arena Lifter',     '4 boxing sessions AND 4 compound sessions in the same week.',                              '#B45309'),
      tier('Iron Sovereign',    65, 'strength', 1.60, 'Iron Arena',       '20+ boxing sessions AND 20+ compound sessions in your history.',                           '#92400E'),
      tier('Warlord Supreme',   80, 'strength', 1.80, 'Supreme War',      '1.25× BW squat AND 30+ boxing sessions in your history.',                                 '#78350F'),
    ],
  },

  'IRON+WILD': {
    roots: ['IRON','WILD'],
    tiers: [
      tier('Stone Climber',     20, 'strength', 1.20, 'Stone Path',       'Log compound lifts AND a climbing session in the same week.',                              '#9CA3AF'),
      tier('Mountain Lifter',   35, 'strength', 1.30, 'Mountain Trial',   '3 compound sessions AND 3 climbing sessions in 7 days.',                                  '#65A30D'),
      tier('Iron Alpinist',     50, 'strength', 1.45, 'Iron Summit',      '4 climbing sessions AND 4 compound sessions in the same week.',                            '#4D7C0F'),
      tier('Mountain Lord',     65, 'flexibility',1.60,'Mountain Lord',   '20+ climbing sessions AND 1.0× BW deadlift in your history.',                              '#3F6212'),
      tier('Iron Wild',         80, 'strength', 1.80, 'Wild Iron',        '1.25× BW squat AND 40+ climbing sessions in your history.',                               '#1A2E05'),
    ],
  },

  'SHADOW+SWIFT': {
    roots: ['SHADOW','SWIFT'],
    tiers: [
      tier('Quick Acrobat',     20, 'agility',  1.20, 'Dual Speed',       'Log skill holds AND explosive work in the same week.',                                     '#9CA3AF'),
      tier('Assassin',          35, 'agility',  1.30, 'Speed Trial',      'Complete 5 explosive sessions in 7 days.',                                                 '#7C3AED'),
      tier('Phantom',           50, 'focus',    1.45, 'Phantom Run',      '3 skill sessions AND 3 explosive sessions in the same week.',                              '#6D28D9'),
      tier('Ghost',             65, 'agility',  1.60, 'Ghost Protocol',   '5 boxing AND 5 calisthenics sessions in 7 days.',                                          '#5B21B6'),
      tier('Void Ghost',        80, 'focus',    1.80, 'Void Speed',       'Tuck Planche 15s AND sub-5:00/km run in same week.',                                      '#2E1065'),
    ],
  },

  'SHADOW+TIDE': {
    roots: ['SHADOW','TIDE'],
    tiers: [
      tier('Sea Acrobat',       20, 'endurance',1.20, 'Sea Skill',        'Log skill holds AND a swim session in the same week.',                                     '#9CA3AF'),
      tier('Merman',            35, 'endurance',1.30, 'Amphibious Trial', '4 swimming AND 4 calisthenics sessions in 7 days.',                                        '#0EA5E9'),
      tier('Sea Monk',          50, 'focus',    1.45, 'Deep Monk',        '4 swim sessions AND 4 skill hold sessions in the same week.',                              '#0284C7'),
      tier('Tide Phantom',      65, 'endurance',1.60, 'Phantom Tide',     '20+ swim sessions AND Advanced Tuck Planche 8s in your history.',                         '#075985'),
      tier('Deep Phantom',      80, 'focus',    1.80, 'Void Tide',        'Front Lever 3s AND 30+ swim sessions in your history.',                                   '#0C4A6E'),
    ],
  },

  'SHADOW+COURT': {
    roots: ['SHADOW','COURT'],
    tiers: [
      tier('Skilled Fighter',   20, 'agility',  1.20, 'Skill Fight',      'Log skill holds AND a boxing session in the same week.',                                   '#9CA3AF'),
      tier('Striker',           35, 'agility',  1.30, 'Kombat Trial',     'Log 7 boxing sessions in 7 days.',                                                         '#D97706'),
      tier('Shadow Striker',    50, 'agility',  1.45, 'Shadow Kombat',    '4 boxing sessions AND 4 skill sessions in the same week.',                                 '#B45309'),
      tier('Phantom Fighter',   65, 'focus',    1.60, 'Phantom Fight',    '20+ boxing sessions AND Tuck Front Lever 10s in your history.',                            '#92400E'),
      tier('Void Striker',      80, 'agility',  1.80, 'Void Fight',       'Front Lever 3s AND 30+ boxing sessions in your history.',                                 '#78350F'),
    ],
  },

  'SHADOW+WILD': {
    roots: ['SHADOW','WILD'],
    tiers: [
      tier('Skilled Climber',   20, 'flexibility',1.20,'Skill Climb',     'Log skill holds AND a climbing session in the same week.',                                 '#9CA3AF'),
      tier('Vanguard',          35, 'flexibility',1.30,'Vertical Horizon','4 climbing AND 4 flexibility sessions in 7 days.',                                          '#65A30D'),
      tier('Shadow Alpinist',   50, 'focus',    1.45, 'Shadow Summit',    '4 climbing AND 4 skill hold sessions in the same week.',                                   '#4D7C0F'),
      tier('Wild Monk',         65, 'focus',    1.60, 'Monk\'s Ascent',   '20+ climbing sessions AND Tuck Planche 10s in your history.',                             '#3F6212'),
      tier('Void Alpinist',     80, 'focus',    1.80, 'Void Summit',      'Front Lever 5s AND 40+ climbing sessions in your history.',                               '#1A2E05'),
    ],
  },

  'SWIFT+TIDE': {
    roots: ['SWIFT','TIDE'],
    tiers: [
      tier('Endurance Rookie',  20, 'endurance',1.20, 'Dual Endurance',   'Log a run AND a swim or cycle in the same week.',                                          '#9CA3AF'),
      tier('Duathlete',         35, 'endurance',1.30, 'Dual Distance',    '3 runs AND 3 cycle sessions in the same 7 days.',                                          '#0EA5E9'),
      tier('Triathlete',        50, 'endurance',1.45, 'Iron Distance',    'Log cycling, swimming, AND running sessions in the same week.',                             '#0284C7'),
      tier('Endurance Ghost',   65, 'endurance',1.60, 'Ghost Distance',   '20+ qualifying runs AND 20+ swim sessions in your history.',                              '#075985'),
      tier('Tide Runner',       80, 'endurance',1.80, 'Sovereign Run',    'Sub-5:00/km pace AND 30+ swim sessions in your history.',                                 '#0C4A6E'),
    ],
  },

  'SWIFT+COURT': {
    roots: ['SWIFT','COURT'],
    tiers: [
      tier('Speed Athlete',     20, 'agility',  1.20, 'Speed Fight',      'Log a run AND a boxing or sport session in the same week.',                                '#9CA3AF'),
      tier('Gladiator',         35, 'agility',  1.30, 'Arena Trial',      '4 boxing AND 4 running sessions in 7 days.',                                               '#DC2626'),
      tier('Speed Fighter',     50, 'agility',  1.45, 'Speed Arena',      '4 boxing AND 4 explosive sessions in the same week.',                                      '#B91C1C'),
      tier('Court Ghost',       65, 'agility',  1.60, 'Ghost Court',      '20+ boxing sessions AND sub-5:30/km run in your history.',                                '#991B1B'),
      tier('Arena Ghost',       80, 'agility',  1.80, 'Void Arena',       'Sub-5:00/km AND 30+ boxing sessions in your history.',                                    '#7F1D1D'),
    ],
  },

  'SWIFT+WILD': {
    roots: ['SWIFT','WILD'],
    tiers: [
      tier('Trail Wanderer',    20, 'agility',  1.20, 'Trail Start',      'Log a run AND a climbing session in the same week.',                                       '#9CA3AF'),
      tier('Parkour',           35, 'agility',  1.30, 'Parkour Trial',    '3 explosive AND 3 climbing sessions in 7 days.',                                           '#65A30D'),
      tier('Trail Runner',      50, 'agility',  1.45, 'Trail Run',        '4 runs AND 4 climbing sessions in the same week.',                                         '#4D7C0F'),
      tier('Wind Climber',      65, 'agility',  1.60, 'Wind Summit',      '20+ qualifying runs AND 20+ climbing sessions in your history.',                           '#3F6212'),
      tier('Ghost Alpinist',    80, 'agility',  1.80, 'Void Trail',       'Sub-5:00/km AND 40+ climbing sessions in your history.',                                  '#1A2E05'),
    ],
  },

  'TIDE+COURT': {
    roots: ['TIDE','COURT'],
    tiers: [
      tier('Aqua Athlete',      20, 'endurance',1.20, 'Aqua Fight',       'Log a swim or cycle AND a boxing or sport session in the same week.',                      '#9CA3AF'),
      tier('Aqua Striker',      35, 'endurance',1.30, 'Water Combat',     '3 swim AND 3 boxing sessions in 7 days.',                                                  '#0EA5E9'),
      tier('Water Athlete',     50, 'endurance',1.45, 'Aqua Trial',       '4 swim AND 4 boxing sessions in the same week.',                                           '#0284C7'),
      tier('Tide Fighter',      65, 'agility',  1.60, 'Tide Fight',       '20+ swim sessions AND 20+ boxing sessions in your history.',                              '#075985'),
      tier('Aqua Sovereign',    80, 'endurance',1.80, 'Sovereign Tide',   '30+ swim sessions AND 30+ boxing sessions in your history.',                              '#0C4A6E'),
    ],
  },

  'TIDE+WILD': {
    roots: ['TIDE','WILD'],
    tiers: [
      tier('Sea Wanderer',      20, 'endurance',1.20, 'Sea Wild',         'Log a swim AND a climbing session in the same week.',                                      '#9CA3AF'),
      tier('Sea Climber',       35, 'endurance',1.30, 'Sea Summit',       '3 swim AND 3 climbing sessions in 7 days.',                                                '#0EA5E9'),
      tier('Aqua Alpinist',     50, 'endurance',1.45, 'Aqua Summit',      '4 swim AND 4 climbing sessions in the same week.',                                         '#0284C7'),
      tier('Ocean Sovereign',   65, 'flexibility',1.60,'Ocean Wild',      '20+ swim AND 20+ climbing sessions in your history.',                                      '#065F46'),
      tier('Deep Sovereign',    80, 'endurance',1.80, 'Deep Wild',        '30+ swim sessions AND 40+ climbing sessions in your history.',                             '#064E3B'),
    ],
  },

  'COURT+WILD': {
    roots: ['COURT','WILD'],
    tiers: [
      tier('Street Wanderer',   20, 'agility',  1.20, 'Street Wild',      'Log a boxing AND a climbing session in the same week.',                                    '#9CA3AF'),
      tier('Street Athlete',    35, 'agility',  1.30, 'Street Trial',     '3 boxing AND 3 climbing sessions in 7 days.',                                              '#D97706'),
      tier('Court Climber',     50, 'agility',  1.45, 'Court Summit',     '4 boxing AND 4 climbing sessions in the same week.',                                       '#B45309'),
      tier('Wild Fighter',      65, 'agility',  1.60, 'Wild Fight',       '20+ boxing AND 20+ climbing sessions in your history.',                                   '#92400E'),
      tier('Wild Sovereign',    80, 'agility',  1.80, 'Sovereign Wild',   '30+ boxing AND 30+ climbing sessions in your history.',                                   '#78350F'),
    ],
  },

  // ══════════════════════════════════════════════
  // TRIPLE ROOT PATHS (20) — abbreviated names
  // ══════════════════════════════════════════════

  'IRON+SHADOW+SWIFT': {
    roots: ['IRON','SHADOW','SWIFT'],
    tiers: [
      tier('Iron Acrobat',      20, 'strength', 1.25, 'Triple Discipline','Log compounds, skill holds, AND explosive work in the same week.',                         '#9CA3AF'),
      tier('Dreadnought',       35, 'strength', 1.35, 'Dread Trial',      '5 compound, 5 skill, 5 explosive sessions in 7 days.',                                    '#DC2626'),
      tier('Iron Phantom',      50, 'strength', 1.50, 'Iron Ghost',       'Hit 1.0× BW deadlift, Advanced Tuck 8s, AND sub-6:00/km run in same week.',               '#B91C1C'),
      tier('Shadow Warrior',    65, 'focus',    1.65, 'Shadow War',       '1.25× BW squat AND Tuck Planche 15s AND sub-5:30/km in history.',                         '#991B1B'),
      tier('Iron Ghost',        80, 'strength', 1.85, 'Void Iron Ghost',  '1.5× BW deadlift AND Advanced Tuck 15s AND sub-5:00/km in history.',                     '#7F1D1D'),
    ],
  },

  'IRON+SHADOW+TIDE': {
    roots: ['IRON','SHADOW','TIDE'],
    tiers: [
      tier('Iron Swimmer Monk', 20, 'strength', 1.25, 'Deep Iron Skill',  'Log compounds, skill holds, AND a swim in the same week.',                                '#9CA3AF'),
      tier('Iron Merman',       35, 'endurance',1.35, 'Iron Merman',      '3 compound, 3 skill, 3 swim sessions in 7 days.',                                         '#0EA5E9'),
      tier('Deep Shadow Iron',  50, 'strength', 1.50, 'Deep Iron',        '1.0× BW deadlift AND Tuck Front Lever 10s AND 20+ swim sessions.',                        '#0284C7'),
      tier('Iron Deep Phantom', 65, 'focus',    1.65, 'Iron Phantom Deep','1.25× BW deadlift AND Advanced Tuck Lever 8s AND 30+ swim sessions.',                     '#075985'),
      tier('Armoured Monk',     80, 'focus',    1.85, 'Armoured Still',   '1.5× BW deadlift AND Front Lever 3s AND 40+ swim sessions.',                             '#0C4A6E'),
    ],
  },

  'IRON+SHADOW+COURT': {
    roots: ['IRON','SHADOW','COURT'],
    tiers: [
      tier('Iron Fighter Monk', 20, 'strength', 1.25, 'Iron Fight Skill', 'Log compounds, skill holds, AND boxing in the same week.',                                '#9CA3AF'),
      tier('Iron Striker',      35, 'strength', 1.35, 'Iron Strike',      '3 compound, 3 skill, 3 boxing sessions in 7 days.',                                       '#D97706'),
      tier('Arena Monk',        50, 'strength', 1.50, 'Monk Arena',       '1.0× BW deadlift AND Tuck Planche 10s AND 20+ boxing sessions.',                          '#B45309'),
      tier('Shadow Warlord',    65, 'focus',    1.65, 'Shadow War',       '1.25× BW squat AND Advanced Tuck 8s AND 30+ boxing sessions.',                            '#92400E'),
      tier('Iron Void Striker', 80, 'strength', 1.85, 'Void Iron Strike', '1.5× BW deadlift AND Tuck Planche 15s AND 40+ boxing sessions.',                         '#78350F'),
    ],
  },

  'IRON+SHADOW+WILD': {
    roots: ['IRON','SHADOW','WILD'],
    tiers: [
      tier('Stone Monk',        20, 'strength', 1.25, 'Stone Skill',      'Log compounds, skill holds, AND climbing in the same week.',                               '#9CA3AF'),
      tier('Mountain Phantom',  35, 'focus',    1.35, 'Mountain Still',   '3 compound, 3 skill, 3 climbing sessions in 7 days.',                                     '#65A30D'),
      tier('Iron Sovereign',    50, 'strength', 1.50, 'Iron Wild',        '1.0× BW deadlift AND Tuck Front Lever 10s AND 20+ climbing sessions.',                    '#4D7C0F'),
      tier('Iron Alpinist Monk',65, 'focus',    1.65, 'Monk Summit',      '1.25× BW squat AND Advanced Tuck 8s AND 30+ climbing sessions.',                          '#3F6212'),
      tier('Mountain Phantom',  80, 'focus',    1.85, 'Void Mountain',    '1.5× BW deadlift AND Front Lever 3s AND 40+ climbing sessions.',                         '#1A2E05'),
    ],
  },

  'IRON+SWIFT+TIDE': {
    roots: ['IRON','SWIFT','TIDE'],
    tiers: [
      tier('Iron Endurance',    20, 'strength', 1.25, 'Iron Distance',    'Log compounds, a run, AND a swim or cycle in same week.',                                  '#9CA3AF'),
      tier('Iron Triathlete',   35, 'endurance',1.35, 'Iron Tri',         '3 compound, 3 run, 3 swim/cycle sessions in 7 days.',                                     '#0EA5E9'),
      tier('Endurance Lord',    50, 'endurance',1.50, 'Lord Distance',    '1.0× BW deadlift AND sub-6:30/km AND 20+ swim sessions.',                                 '#0284C7'),
      tier('Iron Ranger',       65, 'strength', 1.65, 'Iron Range',       '1.25× BW AND sub-5:30/km AND 30+ swim sessions.',                                         '#075985'),
      tier('Complete Iron',     80, 'strength', 1.85, 'Complete Iron',    '1.5× BW deadlift AND sub-5:00/km AND 40+ swim sessions.',                                '#0C4A6E'),
    ],
  },

  'IRON+SWIFT+COURT': {
    roots: ['IRON','SWIFT','COURT'],
    tiers: [
      tier('Warrior Athlete',   20, 'strength', 1.25, 'Iron Speed Fight', 'Log compounds, a run, AND boxing in same week.',                                           '#9CA3AF'),
      tier('Iron Gladiator',    35, 'strength', 1.35, 'Iron Arena',       '3 compound, 3 run, 3 boxing sessions in 7 days.',                                         '#DC2626'),
      tier('Warrior King',      50, 'strength', 1.50, 'King\'s Trial',    '1.0× BW deadlift AND sub-6:30/km AND 20+ boxing sessions.',                               '#B91C1C'),
      tier('Combat Ranger',     65, 'agility',  1.65, 'Combat Range',     '1.25× BW AND sub-5:30/km AND 30+ boxing sessions.',                                       '#991B1B'),
      tier('Iron Arena Ghost',  80, 'strength', 1.85, 'Iron Arena Ghost', '1.5× BW AND sub-5:00/km AND 40+ boxing sessions.',                                       '#7F1D1D'),
    ],
  },

  'IRON+SWIFT+WILD': {
    roots: ['IRON','SWIFT','WILD'],
    tiers: [
      tier('Mountain Warrior',  20, 'strength', 1.25, 'Mountain Speed',   'Log compounds, a run, AND climbing in same week.',                                         '#9CA3AF'),
      tier('Iron Parkour',      35, 'agility',  1.35, 'Iron Parkour',     '3 compound, 3 run, 3 climbing sessions in 7 days.',                                       '#65A30D'),
      tier('Trail Lord',        50, 'strength', 1.50, 'Trail Iron',       '1.0× BW deadlift AND sub-6:30/km AND 20+ climbing sessions.',                             '#4D7C0F'),
      tier('Mountain Ranger',   65, 'agility',  1.65, 'Mountain Range',   '1.25× BW AND sub-5:30/km AND 30+ climbing sessions.',                                     '#3F6212'),
      tier('Iron Trail Ghost',  80, 'strength', 1.85, 'Void Trail Iron',  '1.5× BW AND sub-5:00/km AND 40+ climbing sessions.',                                    '#1A2E05'),
    ],
  },

  'IRON+TIDE+COURT': {
    roots: ['IRON','TIDE','COURT'],
    tiers: [
      tier('Iron Aqua Fighter', 20, 'strength', 1.25, 'Iron Water Fight', 'Log compounds, swim/cycle, AND boxing in same week.',                                      '#9CA3AF'),
      tier('Water Warlord',     35, 'strength', 1.35, 'Water War',        '3 compound, 3 swim, 3 boxing sessions in 7 days.',                                        '#0EA5E9'),
      tier('Tide Lord',         50, 'endurance',1.50, 'Tide War',         '1.0× BW deadlift AND 20+ swim AND 20+ boxing sessions.',                                  '#0284C7'),
      tier('Iron Arena Swimmer',65, 'strength', 1.65, 'Iron Arena Swim',  '1.25× BW AND 30+ swim AND 30+ boxing sessions.',                                          '#075985'),
      tier('Deep Warlord',      80, 'strength', 1.85, 'Deep War',         '1.5× BW AND 40+ swim AND 40+ boxing sessions.',                                           '#0C4A6E'),
    ],
  },

  'IRON+TIDE+WILD': {
    roots: ['IRON','TIDE','WILD'],
    tiers: [
      tier('Deep Climber',      20, 'strength', 1.25, 'Iron Deep Wild',   'Log compounds, swim/cycle, AND climbing in same week.',                                    '#9CA3AF'),
      tier('Iron Sea Climber',  35, 'endurance',1.35, 'Sea Iron Climb',   '3 compound, 3 swim, 3 climbing sessions in 7 days.',                                      '#0EA5E9'),
      tier('Deep Iron Wild',    50, 'strength', 1.50, 'Deep Iron',        '1.0× BW deadlift AND 20+ swim AND 20+ climbing sessions.',                                '#0284C7'),
      tier('Mountain Swimmer',  65, 'endurance',1.65, 'Mountain Sea',     '1.25× BW AND 30+ swim AND 30+ climbing sessions.',                                         '#065F46'),
      tier('Iron Deep Sovereign',80,'strength', 1.85, 'Sovereign Deep',   '1.5× BW AND 40+ swim AND 40+ climbing sessions.',                                         '#064E3B'),
    ],
  },

  'IRON+COURT+WILD': {
    roots: ['IRON','COURT','WILD'],
    tiers: [
      tier('Street Iron Wild',  20, 'strength', 1.25, 'Iron Wild Fight',  'Log compounds, boxing, AND climbing in same week.',                                        '#9CA3AF'),
      tier('Wild Warlord',      35, 'strength', 1.35, 'Wild War',         '3 compound, 3 boxing, 3 climbing sessions in 7 days.',                                    '#D97706'),
      tier('Iron Wild Striker', 50, 'strength', 1.50, 'Iron Wild Strike', '1.0× BW deadlift AND 20+ boxing AND 20+ climbing sessions.',                              '#B45309'),
      tier('Court Climber Lord',65, 'agility',  1.65, 'Lord Wild Court',  '1.25× BW AND 30+ boxing AND 30+ climbing sessions.',                                      '#92400E'),
      tier('Mountain Arena Lord',80,'strength', 1.85, 'Mountain Arena',   '1.5× BW AND 40+ boxing AND 40+ climbing sessions.',                                       '#78350F'),
    ],
  },

  'SHADOW+SWIFT+TIDE': {
    roots: ['SHADOW','SWIFT','TIDE'],
    tiers: [
      tier('Phantom Sea Runner',20, 'agility',  1.25, 'Ghost Sea Skill',  'Log skill holds, a run, AND swim in same week.',                                           '#9CA3AF'),
      tier('Ghost Swimmer',     35, 'endurance',1.35, 'Ghost Swim',       '3 skill, 3 run, 3 swim sessions in 7 days.',                                              '#0EA5E9'),
      tier('Phantom Ranger',    50, 'agility',  1.50, 'Phantom Range',    'Tuck Front Lever 10s AND sub-6:30/km AND 20+ swim sessions.',                             '#0284C7'),
      tier('Shadow Triathlete', 65, 'focus',    1.65, 'Shadow Tri',       'Advanced Tuck 8s AND sub-5:30/km AND 30+ swim sessions.',                                  '#075985'),
      tier('Void Sea Ghost',    80, 'focus',    1.85, 'Void Sea',         'Front Lever 3s AND sub-5:00/km AND 40+ swim sessions.',                                   '#0C4A6E'),
    ],
  },

  'SHADOW+SWIFT+COURT': {
    roots: ['SHADOW','SWIFT','COURT'],
    tiers: [
      tier('Phantom Speed Fight',20,'agility',  1.25, 'Ghost Speed Fight', 'Log skill holds, explosive work, AND boxing in same week.',                               '#9CA3AF'),
      tier('Phantom Fighter',   35, 'agility',  1.35, 'Phantom Fight',    '3 skill, 3 explosive, 3 boxing sessions in 7 days.',                                      '#7C3AED'),
      tier('Shadow Gladiator',  50, 'agility',  1.50, 'Shadow Arena',     'Tuck Planche 10s AND sub-6:30/km AND 20+ boxing sessions.',                               '#6D28D9'),
      tier('Ghost Striker',     65, 'agility',  1.65, 'Ghost Strike',     'Advanced Tuck 8s AND sub-5:30/km AND 30+ boxing sessions.',                               '#5B21B6'),
      tier('Void Phantom Fight',80, 'focus',    1.85, 'Void Phantom',     'Front Lever 3s AND sub-5:00/km AND 40+ boxing sessions.',                                '#3B0764'),
    ],
  },

  'SHADOW+SWIFT+WILD': {
    roots: ['SHADOW','SWIFT','WILD'],
    tiers: [
      tier('Ghost Trail Monk',  20, 'agility',  1.25, 'Ghost Trail Skill','Log skill holds, a run, AND climbing in same week.',                                       '#9CA3AF'),
      tier('Ghost Climber',     35, 'agility',  1.35, 'Ghost Climb',      '3 skill, 3 run, 3 climbing sessions in 7 days.',                                          '#65A30D'),
      tier('Wind Monk',         50, 'focus',    1.50, 'Wind Still',       'Tuck Front Lever 10s AND sub-6:30/km AND 20+ climbing sessions.',                         '#4D7C0F'),
      tier('Shadow Parkour',    65, 'agility',  1.65, 'Shadow Trail',     'Advanced Tuck 8s AND sub-5:30/km AND 30+ climbing sessions.',                              '#3F6212'),
      tier('Void Trail Ghost',  80, 'focus',    1.85, 'Void Wind',        'Front Lever 3s AND sub-5:00/km AND 40+ climbing sessions.',                              '#1A2E05'),
    ],
  },

  'SHADOW+TIDE+COURT': {
    roots: ['SHADOW','TIDE','COURT'],
    tiers: [
      tier('Sea Phantom Fighter',20,'endurance',1.25, 'Sea Ghost Fight',  'Log skill holds, swim, AND boxing in same week.',                                          '#9CA3AF'),
      tier('Sea Phantom',       35, 'endurance',1.35, 'Sea Ghost',        '3 skill, 3 swim, 3 boxing sessions in 7 days.',                                           '#0EA5E9'),
      tier('Aqua Striker Monk', 50, 'focus',    1.50, 'Aqua Monk Fight',  'Tuck Front Lever 10s AND 20+ swim AND 20+ boxing sessions.',                              '#0284C7'),
      tier('Court Monk',        65, 'focus',    1.65, 'Court Still',      'Advanced Tuck 8s AND 30+ swim AND 30+ boxing sessions.',                                   '#075985'),
      tier('Deep Void Fighter', 80, 'focus',    1.85, 'Void Court Sea',   'Front Lever 3s AND 40+ swim AND 40+ boxing sessions.',                                   '#0C4A6E'),
    ],
  },

  'SHADOW+TIDE+WILD': {
    roots: ['SHADOW','TIDE','WILD'],
    tiers: [
      tier('Sea Wild Monk',     20, 'flexibility',1.25,'Sea Wild Skill',  'Log skill holds, swim, AND climbing in same week.',                                        '#9CA3AF'),
      tier('Deep Phantom',      35, 'endurance',1.35, 'Deep Ghost',       '3 skill, 3 swim, 3 climbing sessions in 7 days.',                                         '#0EA5E9'),
      tier('Sea Sovereign Monk',50, 'focus',    1.50, 'Sea Sovereign',    'Tuck Front Lever 10s AND 20+ swim AND 20+ climbing sessions.',                             '#065F46'),
      tier('Wild Monk',         65, 'focus',    1.65, 'Wild Still',       'Advanced Tuck 8s AND 30+ swim AND 30+ climbing sessions.',                                 '#064E3B'),
      tier('Void Sea Monk',     80, 'focus',    1.85, 'Void Sea Wild',    'Front Lever 3s AND 40+ swim AND 40+ climbing sessions.',                                 '#042F2E'),
    ],
  },

  'SHADOW+COURT+WILD': {
    roots: ['SHADOW','COURT','WILD'],
    tiers: [
      tier('Street Wild Monk',  20, 'agility',  1.25, 'Wild Fight Skill', 'Log skill holds, boxing, AND climbing in same week.',                                     '#9CA3AF'),
      tier('Wild Striker',      35, 'agility',  1.35, 'Wild Strike',      '3 skill, 3 boxing, 3 climbing sessions in 7 days.',                                       '#65A30D'),
      tier('Street Phantom',    50, 'focus',    1.50, 'Street Ghost',     'Tuck Planche 10s AND 20+ boxing AND 20+ climbing sessions.',                              '#4D7C0F'),
      tier('Wild Phantom',      65, 'focus',    1.65, 'Wild Ghost',       'Advanced Tuck 8s AND 30+ boxing AND 30+ climbing sessions.',                               '#3F6212'),
      tier('Court Sovereign',   80, 'focus',    1.85, 'Void Wild Fight',  'Front Lever 3s AND 40+ boxing AND 40+ climbing sessions.',                               '#1A2E05'),
    ],
  },

  'SWIFT+TIDE+COURT': {
    roots: ['SWIFT','TIDE','COURT'],
    tiers: [
      tier('Speed Sea Fighter', 20, 'agility',  1.25, 'Speed Sea Fight',  'Log a run, swim, AND boxing in same week.',                                                '#9CA3AF'),
      tier('Speed Swimmer',     35, 'endurance',1.35, 'Speed Swim',       '3 run, 3 swim, 3 boxing sessions in 7 days.',                                             '#0EA5E9'),
      tier('Court Triathlete',  50, 'endurance',1.50, 'Court Tri',        'Sub-6:30/km AND 20+ swim AND 20+ boxing sessions.',                                       '#0284C7'),
      tier('Aqua Gladiator',    65, 'agility',  1.65, 'Aqua Arena',       'Sub-5:30/km AND 30+ swim AND 30+ boxing sessions.',                                       '#075985'),
      tier('Sea Arena Ghost',   80, 'endurance',1.85, 'Void Sea Arena',   'Sub-5:00/km AND 40+ swim AND 40+ boxing sessions.',                                      '#0C4A6E'),
    ],
  },

  'SWIFT+TIDE+WILD': {
    roots: ['SWIFT','TIDE','WILD'],
    tiers: [
      tier('Trail Sea Runner',  20, 'agility',  1.25, 'Trail Sea Speed',  'Log a run, swim, AND climbing in same week.',                                              '#9CA3AF'),
      tier('Trail Swimmer',     35, 'endurance',1.35, 'Trail Swim',       '3 run, 3 swim, 3 climbing sessions in 7 days.',                                           '#0EA5E9'),
      tier('Wind Swimmer',      50, 'agility',  1.50, 'Wind Swim',        'Sub-6:30/km AND 20+ swim AND 20+ climbing sessions.',                                     '#0284C7'),
      tier('Wild Ranger',       65, 'agility',  1.65, 'Wild Range',       'Sub-5:30/km AND 30+ swim AND 30+ climbing sessions.',                                     '#065F46'),
      tier('Void Sea Trail',    80, 'agility',  1.85, 'Void Trail Sea',   'Sub-5:00/km AND 40+ swim AND 40+ climbing sessions.',                                    '#064E3B'),
    ],
  },

  'SWIFT+COURT+WILD': {
    roots: ['SWIFT','COURT','WILD'],
    tiers: [
      tier('Street Trail Runner',20,'agility',  1.25, 'Street Trail Speed','Log a run, boxing, AND climbing in same week.',                                           '#9CA3AF'),
      tier('Street Runner',     35, 'agility',  1.35, 'Street Run',       '3 run, 3 boxing, 3 climbing sessions in 7 days.',                                        '#D97706'),
      tier('Wild Gladiator',    50, 'agility',  1.50, 'Wild Arena',       'Sub-6:30/km AND 20+ boxing AND 20+ climbing sessions.',                                   '#B45309'),
      tier('Court Ghost',       65, 'agility',  1.65, 'Ghost Court Wild', 'Sub-5:30/km AND 30+ boxing AND 30+ climbing sessions.',                                   '#92400E'),
      tier('Void Street Ghost', 80, 'agility',  1.85, 'Void Street',      'Sub-5:00/km AND 40+ boxing AND 40+ climbing sessions.',                                  '#78350F'),
    ],
  },

  'TIDE+COURT+WILD': {
    roots: ['TIDE','COURT','WILD'],
    tiers: [
      tier('Sea Wild Fighter',  20, 'endurance',1.25, 'Sea Wild Fight',   'Log swim, boxing, AND climbing in same week.',                                             '#9CA3AF'),
      tier('Aqua Wild Striker', 35, 'endurance',1.35, 'Aqua Wild Strike', '3 swim, 3 boxing, 3 climbing sessions in 7 days.',                                       '#0EA5E9'),
      tier('Sea Court Wild',    50, 'endurance',1.50, 'Sea Court',        '20+ swim AND 20+ boxing AND 20+ climbing sessions.',                                      '#0284C7'),
      tier('Wild Sea Fighter',  65, 'agility',  1.65, 'Wild Sea Fight',   '30+ swim AND 30+ boxing AND 30+ climbing sessions.',                                      '#075985'),
      tier('Ocean Sovereign',   80, 'endurance',1.85, 'Void Ocean',       '40+ swim AND 40+ boxing AND 40+ climbing sessions.',                                     '#0C4A6E'),
    ],
  },

  // ══════════════════════════════════════════════
  // QUAD ROOT PATHS (15) — elite multi-discipline
  // ══════════════════════════════════════════════

  'IRON+SHADOW+SWIFT+TIDE': {
    roots: ['IRON','SHADOW','SWIFT','TIDE'],
    tiers: [
      tier('Quad Athlete',      20, 'strength', 1.30, 'Quad Trial',       'Log compound, skill, run, AND swim in same week.',                                         '#9CA3AF'),
      tier('Iron Phantom Ranger',35,'strength', 1.42, 'Iron Ghost Range', '3 sessions each of compound, skill, run, swim in 7 days.',                                '#7C3AED'),
      tier('Deep Shadow Warrior',50,'focus',    1.55, 'Deep Ghost War',   '1.0× BW AND Tuck Lever 10s AND sub-6:30/km AND 20+ swim.',                               '#6D28D9'),
      tier('Iron Ghost Diver',  65, 'strength', 1.70, 'Iron Void Dive',   '1.25× BW AND Adv Tuck 8s AND sub-5:30/km AND 30+ swim.',                                 '#5B21B6'),
      tier('Phantom Iron Tide', 80, 'focus',    1.90, 'Void Iron Tide',   '1.5× BW AND Front Lever 3s AND sub-5:00/km AND 40+ swim.',                              '#3B0764'),
    ],
  },

  'IRON+SHADOW+SWIFT+COURT': {
    roots: ['IRON','SHADOW','SWIFT','COURT'],
    tiers: [
      tier('Iron Ghost Fighter',20, 'strength', 1.30, 'Iron Ghost Fight', 'Log compound, skill, run, AND boxing in same week.',                                       '#9CA3AF'),
      tier('Shadow Arena Lord', 35, 'strength', 1.42, 'Shadow Arena',     '3 sessions each of compound, skill, run, boxing in 7 days.',                              '#DC2626'),
      tier('Iron Ghost Fighter',50, 'strength', 1.55, 'Ghost Iron Fight', '1.0× BW AND Tuck Planche 10s AND sub-6:30/km AND 20+ boxing.',                           '#B91C1C'),
      tier('Phantom War Ghost', 65, 'agility',  1.70, 'Phantom War',      '1.25× BW AND Adv Tuck 8s AND sub-5:30/km AND 30+ boxing.',                               '#991B1B'),
      tier('Iron Arena Phantom',80, 'strength', 1.90, 'Void Arena Iron',  '1.5× BW AND Front Lever 3s AND sub-5:00/km AND 40+ boxing.',                            '#7F1D1D'),
    ],
  },

  'IRON+SHADOW+SWIFT+WILD': {
    roots: ['IRON','SHADOW','SWIFT','WILD'],
    tiers: [
      tier('Iron Ghost Climber',20, 'strength', 1.30, 'Iron Ghost Climb', 'Log compound, skill, run, AND climbing in same week.',                                     '#9CA3AF'),
      tier('Mountain Iron Ghost',35,'strength', 1.42, 'Mountain Ghost',   '3 sessions each of compound, skill, run, climbing in 7 days.',                            '#65A30D'),
      tier('Iron Phantom Summit',50,'focus',    1.55, 'Iron Ghost Summit','1.0× BW AND Tuck Lever 10s AND sub-6:30/km AND 20+ climbing.',                           '#4D7C0F'),
      tier('Shadow Mountain War',65,'focus',    1.70, 'Shadow Mountain',  '1.25× BW AND Adv Tuck 8s AND sub-5:30/km AND 30+ climbing.',                              '#3F6212'),
      tier('Iron Ghost Alpinist',80,'focus',    1.90, 'Void Iron Climb',  '1.5× BW AND Front Lever 3s AND sub-5:00/km AND 40+ climbing.',                          '#1A2E05'),
    ],
  },

  'IRON+SHADOW+TIDE+COURT': {
    roots: ['IRON','SHADOW','TIDE','COURT'],
    tiers: [
      tier('Iron Deep Fighter', 20, 'strength', 1.30, 'Iron Deep Fight',  'Log compound, skill, swim, AND boxing in same week.',                                      '#9CA3AF'),
      tier('Deep Iron Striker', 35, 'strength', 1.42, 'Deep Iron Strike', '3 sessions each of compound, skill, swim, boxing in 7 days.',                             '#0EA5E9'),
      tier('Shadow Arena Diver',50, 'focus',    1.55, 'Shadow Arena Dive','1.0× BW AND Tuck Lever 10s AND 20+ swim AND 20+ boxing.',                                '#0284C7'),
      tier('Iron Deep Striker', 65, 'strength', 1.70, 'Iron Deep Strike', '1.25× BW AND Adv Tuck 8s AND 30+ swim AND 30+ boxing.',                                  '#075985'),
      tier('Deep Phantom Lord', 80, 'focus',    1.90, 'Void Deep Iron',   '1.5× BW AND Front Lever 3s AND 40+ swim AND 40+ boxing.',                               '#0C4A6E'),
    ],
  },

  'IRON+SHADOW+TIDE+WILD': {
    roots: ['IRON','SHADOW','TIDE','WILD'],
    tiers: [
      tier('Iron Deep Climber', 20, 'strength', 1.30, 'Iron Deep Climb',  'Log compound, skill, swim, AND climbing in same week.',                                    '#9CA3AF'),
      tier('Iron Sea Monk',     35, 'endurance',1.42, 'Iron Sea Still',   '3 sessions each of compound, skill, swim, climbing in 7 days.',                           '#0EA5E9'),
      tier('Deep Iron Sovereign',50,'focus',    1.55, 'Deep Iron Wild',   '1.0× BW AND Tuck Lever 10s AND 20+ swim AND 20+ climbing.',                              '#065F46'),
      tier('Mountain Sea Monk', 65, 'focus',    1.70, 'Mountain Sea',     '1.25× BW AND Adv Tuck 8s AND 30+ swim AND 30+ climbing.',                                '#064E3B'),
      tier('Iron Void Deep',    80, 'focus',    1.90, 'Void Iron Deep',   '1.5× BW AND Front Lever 3s AND 40+ swim AND 40+ climbing.',                             '#042F2E'),
    ],
  },

  'IRON+SHADOW+COURT+WILD': {
    roots: ['IRON','SHADOW','COURT','WILD'],
    tiers: [
      tier('Iron Wild Fighter', 20, 'strength', 1.30, 'Iron Wild Fight',  'Log compound, skill, boxing, AND climbing in same week.',                                  '#9CA3AF'),
      tier('Iron Wild Monk',    35, 'strength', 1.42, 'Iron Monk Wild',   '3 sessions each of compound, skill, boxing, climbing in 7 days.',                         '#D97706'),
      tier('Mountain Arena Monk',50,'focus',    1.55, 'Mountain Arena',   '1.0× BW AND Tuck Planche 10s AND 20+ boxing AND 20+ climbing.',                          '#B45309'),
      tier('Iron Arena Sovereign',65,'strength',1.70, 'Iron Sovereign',   '1.25× BW AND Adv Tuck 8s AND 30+ boxing AND 30+ climbing.',                              '#92400E'),
      tier('Iron Void Wild',    80, 'focus',    1.90, 'Void Wild Iron',   '1.5× BW AND Front Lever 3s AND 40+ boxing AND 40+ climbing.',                           '#78350F'),
    ],
  },

  'IRON+SWIFT+TIDE+COURT': {
    roots: ['IRON','SWIFT','TIDE','COURT'],
    tiers: [
      tier('Iron Speed Sea Fight',20,'strength',1.30, 'Iron Speed Sea',   'Log compound, run, swim, AND boxing in same week.',                                        '#9CA3AF'),
      tier('Iron Arena Swimmer',35, 'strength', 1.42, 'Iron Swim Arena',  '3 sessions each of compound, run, swim, boxing in 7 days.',                               '#DC2626'),
      tier('Speed Warlord',     50, 'strength', 1.55, 'Speed War',        '1.0× BW AND sub-6:30/km AND 20+ swim AND 20+ boxing.',                                   '#B91C1C'),
      tier('Iron Gladiator Sea',65, 'strength', 1.70, 'Iron Gladiator',   '1.25× BW AND sub-5:30/km AND 30+ swim AND 30+ boxing.',                                  '#991B1B'),
      tier('Complete Iron War', 80, 'strength', 1.90, 'Void Iron War',    '1.5× BW AND sub-5:00/km AND 40+ swim AND 40+ boxing.',                                  '#7F1D1D'),
    ],
  },

  'IRON+SWIFT+TIDE+WILD': {
    roots: ['IRON','SWIFT','TIDE','WILD'],
    tiers: [
      tier('Iron Trail Swimmer',20, 'strength', 1.30, 'Iron Trail Sea',   'Log compound, run, swim, AND climbing in same week.',                                      '#9CA3AF'),
      tier('Mountain Triathlete',35,'endurance',1.42, 'Mountain Tri',     '3 sessions each of compound, run, swim, climbing in 7 days.',                             '#0EA5E9'),
      tier('Iron Trail Swimmer',50, 'endurance',1.55, 'Iron Trail Swim',  '1.0× BW AND sub-6:30/km AND 20+ swim AND 20+ climbing.',                                '#0284C7'),
      tier('Mountain Iron Tri', 65, 'strength', 1.70, 'Mountain Iron',    '1.25× BW AND sub-5:30/km AND 30+ swim AND 30+ climbing.',                                '#065F46'),
      tier('Iron Complete Wild',80, 'strength', 1.90, 'Void Iron Wild',   '1.5× BW AND sub-5:00/km AND 40+ swim AND 40+ climbing.',                               '#064E3B'),
    ],
  },

  'IRON+SWIFT+COURT+WILD': {
    roots: ['IRON','SWIFT','COURT','WILD'],
    tiers: [
      tier('Iron Street Trail', 20, 'strength', 1.30, 'Iron Street',      'Log compound, run, boxing, AND climbing in same week.',                                    '#9CA3AF'),
      tier('Mountain Gladiator',35, 'strength', 1.42, 'Mountain Arena',   '3 sessions each of compound, run, boxing, climbing in 7 days.',                           '#D97706'),
      tier('Iron Wild Gladiator',50,'strength', 1.55, 'Iron Wild Arena',  '1.0× BW AND sub-6:30/km AND 20+ boxing AND 20+ climbing.',                              '#B45309'),
      tier('Iron Arena Climber',65, 'agility',  1.70, 'Iron Climb Arena', '1.25× BW AND sub-5:30/km AND 30+ boxing AND 30+ climbing.',                              '#92400E'),
      tier('Iron Complete Court',80,'strength', 1.90, 'Void Iron Court',  '1.5× BW AND sub-5:00/km AND 40+ boxing AND 40+ climbing.',                             '#78350F'),
    ],
  },

  'IRON+TIDE+COURT+WILD': {
    roots: ['IRON','TIDE','COURT','WILD'],
    tiers: [
      tier('Iron Sea Wild Fight',20,'strength', 1.30, 'Iron Sea Wild',    'Log compound, swim, boxing, AND climbing in same week.',                                   '#9CA3AF'),
      tier('Deep Arena Climber',35, 'strength', 1.42, 'Deep Arena Climb', '3 sessions each of compound, swim, boxing, climbing in 7 days.',                          '#0EA5E9'),
      tier('Aqua Warlord',      50, 'strength', 1.55, 'Aqua War',         '1.0× BW AND 20+ swim AND 20+ boxing AND 20+ climbing.',                                  '#0284C7'),
      tier('Iron Ocean Sovereign',65,'strength',1.70, 'Iron Ocean',       '1.25× BW AND 30+ swim AND 30+ boxing AND 30+ climbing.',                                 '#075985'),
      tier('Complete Iron Sea', 80, 'strength', 1.90, 'Void Iron Sea',    '1.5× BW AND 40+ swim AND 40+ boxing AND 40+ climbing.',                                 '#0C4A6E'),
    ],
  },

  'SHADOW+SWIFT+TIDE+COURT': {
    roots: ['SHADOW','SWIFT','TIDE','COURT'],
    tiers: [
      tier('Phantom Sea Fighter',20,'agility',  1.30, 'Ghost Sea Fight',  'Log skill, run, swim, AND boxing in same week.',                                           '#9CA3AF'),
      tier('Ghost Arena Swimmer',35,'endurance',1.42, 'Ghost Swim Arena', '3 sessions each of skill, run, swim, boxing in 7 days.',                                  '#0EA5E9'),
      tier('Phantom Arena Swim',50, 'focus',    1.55, 'Phantom Arena',    'Tuck Lever 10s AND sub-6:30/km AND 20+ swim AND 20+ boxing.',                             '#0284C7'),
      tier('Ghost Fighter Tide',65, 'agility',  1.70, 'Ghost Tide Fight', 'Adv Tuck 8s AND sub-5:30/km AND 30+ swim AND 30+ boxing.',                               '#075985'),
      tier('Void Phantom Sea',  80, 'focus',    1.90, 'Void Phantom Tide','Front Lever 3s AND sub-5:00/km AND 40+ swim AND 40+ boxing.',                            '#0C4A6E'),
    ],
  },

  'SHADOW+SWIFT+TIDE+WILD': {
    roots: ['SHADOW','SWIFT','TIDE','WILD'],
    tiers: [
      tier('Ghost Trail Swimmer',20,'agility',  1.30, 'Ghost Trail Sea',  'Log skill, run, swim, AND climbing in same week.',                                         '#9CA3AF'),
      tier('Phantom Trail Swim',35, 'agility',  1.42, 'Phantom Trail',    '3 sessions each of skill, run, swim, climbing in 7 days.',                                '#0EA5E9'),
      tier('Ghost Sea Climber', 50, 'focus',    1.55, 'Ghost Sea Climb',  'Tuck Lever 10s AND sub-6:30/km AND 20+ swim AND 20+ climbing.',                          '#065F46'),
      tier('Phantom Climber Sea',65,'focus',    1.70, 'Phantom Sea',      'Adv Tuck 8s AND sub-5:30/km AND 30+ swim AND 30+ climbing.',                             '#064E3B'),
      tier('Void Sea Phantom',  80, 'focus',    1.90, 'Void Sea Ghost',   'Front Lever 3s AND sub-5:00/km AND 40+ swim AND 40+ climbing.',                         '#042F2E'),
    ],
  },

  'SHADOW+SWIFT+COURT+WILD': {
    roots: ['SHADOW','SWIFT','COURT','WILD'],
    tiers: [
      tier('Ghost Street Climb',20, 'agility',  1.30, 'Ghost Street',     'Log skill, run, boxing, AND climbing in same week.',                                       '#9CA3AF'),
      tier('Street Phantom Fight',35,'agility', 1.42, 'Street Phantom',   '3 sessions each of skill, run, boxing, climbing in 7 days.',                             '#D97706'),
      tier('Ghost Wild Fighter',50, 'agility',  1.55, 'Ghost Wild Fight', 'Tuck Planche 10s AND sub-6:30/km AND 20+ boxing AND 20+ climbing.',                      '#B45309'),
      tier('Phantom Wild Arena',65, 'focus',    1.70, 'Phantom Wild',     'Adv Tuck 8s AND sub-5:30/km AND 30+ boxing AND 30+ climbing.',                            '#92400E'),
      tier('Ghost Alpinist',    80, 'focus',    1.90, 'Void Ghost Wild',  'Front Lever 3s AND sub-5:00/km AND 40+ boxing AND 40+ climbing.',                       '#78350F'),
    ],
  },

  'SHADOW+TIDE+COURT+WILD': {
    roots: ['SHADOW','TIDE','COURT','WILD'],
    tiers: [
      tier('Sea Wild Monk Fight',20,'endurance',1.30, 'Sea Wild Ghost',   'Log skill, swim, boxing, AND climbing in same week.',                                      '#9CA3AF'),
      tier('Sea Phantom Wild',  35, 'endurance',1.42, 'Sea Ghost Wild',   '3 sessions each of skill, swim, boxing, climbing in 7 days.',                             '#0EA5E9'),
      tier('Wild Sea Phantom',  50, 'focus',    1.55, 'Wild Sea Ghost',   'Tuck Lever 10s AND 20+ swim AND 20+ boxing AND 20+ climbing.',                            '#0284C7'),
      tier('Aqua Sovereign Monk',65,'focus',    1.70, 'Aqua Sovereign',   'Adv Tuck 8s AND 30+ swim AND 30+ boxing AND 30+ climbing.',                               '#065F46'),
      tier('Void Sea Sovereign',80, 'focus',    1.90, 'Void Sea Wild',    'Front Lever 3s AND 40+ swim AND 40+ boxing AND 40+ climbing.',                           '#064E3B'),
    ],
  },

  'SWIFT+TIDE+COURT+WILD': {
    roots: ['SWIFT','TIDE','COURT','WILD'],
    tiers: [
      tier('Complete Athlete',  20, 'endurance',1.30, 'Complete Trial',   'Log run, swim, boxing, AND climbing in same week.',                                        '#9CA3AF'),
      tier('Endurance Fighter', 35, 'endurance',1.42, 'Endure Fight',     '3 sessions each of run, swim, boxing, climbing in 7 days.',                               '#0EA5E9'),
      tier('Complete Endurance',50, 'endurance',1.55, 'Full Endure',      'Sub-6:30/km AND 20+ swim AND 20+ boxing AND 20+ climbing.',                              '#0284C7'),
      tier('Titan Athlete',     65, 'endurance',1.70, 'Titan Trial',      'Sub-5:30/km AND 30+ swim AND 30+ boxing AND 30+ climbing.',                               '#075985'),
      tier('Living Legend',     80, 'endurance',1.90, 'Legend Trial',     'Sub-5:00/km AND 40+ swim AND 40+ boxing AND 40+ climbing.',                             '#0C4A6E'),
    ],
  },

  // ══════════════════════════════════════════════
  // QUINT ROOT PATHS (6) — near S-Class
  // ══════════════════════════════════════════════

  'IRON+SHADOW+SWIFT+TIDE+COURT': {
    roots: ['IRON','SHADOW','SWIFT','TIDE','COURT'],
    tiers: [
      tier('Five Domain Athlete',20,'strength', 1.35, 'Five Domain',      'Log compound, skill, run, swim, AND boxing in same week.',                                 '#9CA3AF'),
      tier('Iron Transcendent', 35, 'strength', 1.48, 'Iron Trans',       '3 sessions of each of the 5 in 7 days.',                                                  '#7C3AED'),
      tier('Urban Legend',      50, 'strength', 1.62, 'Urban Trial',      '1.0× BW AND Tuck Lever 10s AND sub-6:30/km AND 20+ swim AND 20+ boxing.',               '#6D28D9'),
      tier('Phantom Sovereign', 65, 'focus',    1.78, 'Phantom Sovereign','1.25× BW AND Adv Tuck 8s AND sub-5:30/km AND 30+ swim AND 30+ boxing.',                  '#5B21B6'),
      tier('Iron Transcendent', 80, 'strength', 1.95, 'Void Five',        '1.5× BW AND Front Lever 3s AND sub-5:00/km AND 40+ swim AND 40+ boxing.',               '#3B0764'),
    ],
  },

  'IRON+SHADOW+SWIFT+TIDE+WILD': {
    roots: ['IRON','SHADOW','SWIFT','TIDE','WILD'],
    tiers: [
      tier('Five Domain Wild',  20, 'strength', 1.35, 'Five Wild',        'Log compound, skill, run, swim, AND climbing in same week.',                               '#9CA3AF'),
      tier('Mountain Legend',   35, 'endurance',1.48, 'Mountain Legend',  '3 sessions of each of the 5 in 7 days.',                                                  '#65A30D'),
      tier('Iron Sovereign',    50, 'focus',    1.62, 'Iron Sovereign',   '1.0× BW AND Tuck Lever 10s AND sub-6:30/km AND 20+ swim AND 20+ climbing.',             '#4D7C0F'),
      tier('Complete Sovereign',65, 'focus',    1.78, 'Complete Sov',     '1.25× BW AND Adv Tuck 8s AND sub-5:30/km AND 30+ swim AND 30+ climbing.',               '#3F6212'),
      tier('Mountain Phantom',  80, 'focus',    1.95, 'Void Five Wild',   '1.5× BW AND Front Lever 3s AND sub-5:00/km AND 40+ swim AND 40+ climbing.',            '#1A2E05'),
    ],
  },

  'IRON+SHADOW+SWIFT+COURT+WILD': {
    roots: ['IRON','SHADOW','SWIFT','COURT','WILD'],
    tiers: [
      tier('Five Domain Fighter',20,'strength', 1.35, 'Five Fight',       'Log compound, skill, run, boxing, AND climbing in same week.',                             '#9CA3AF'),
      tier('Iron Legend',       35, 'strength', 1.48, 'Iron Legend',      '3 sessions of each of the 5 in 7 days.',                                                  '#DC2626'),
      tier('Iron Phantom Sovereign',50,'focus', 1.62, 'Iron Phantom Sov', '1.0× BW AND Tuck Planche 10s AND sub-6:30/km AND 20+ boxing AND 20+ climbing.',         '#B91C1C'),
      tier('Shadow Iron Sovereign',65,'strength',1.78,'Shadow Iron Sov',  '1.25× BW AND Adv Tuck 8s AND sub-5:30/km AND 30+ boxing AND 30+ climbing.',             '#991B1B'),
      tier('Void Iron Sovereign',80,'strength', 1.95, 'Void Iron Sov',    '1.5× BW AND Front Lever 3s AND sub-5:00/km AND 40+ boxing AND 40+ climbing.',          '#7F1D1D'),
    ],
  },

  'IRON+SHADOW+TIDE+COURT+WILD': {
    roots: ['IRON','SHADOW','TIDE','COURT','WILD'],
    tiers: [
      tier('Deep Five Domain',  20, 'strength', 1.35, 'Deep Five',        'Log compound, skill, swim, boxing, AND climbing in same week.',                            '#9CA3AF'),
      tier('Deep Sovereign',    35, 'strength', 1.48, 'Deep Sovereign',   '3 sessions of each of the 5 in 7 days.',                                                  '#0EA5E9'),
      tier('Iron Deep Sovereign',50,'focus',    1.62, 'Iron Deep Sov',    '1.0× BW AND Tuck Lever 10s AND 20+ swim AND 20+ boxing AND 20+ climbing.',              '#0284C7'),
      tier('Deep Iron Phantom', 65, 'focus',    1.78, 'Deep Iron Ph',     '1.25× BW AND Adv Tuck 8s AND 30+ swim AND 30+ boxing AND 30+ climbing.',                '#075985'),
      tier('Void Deep Iron',    80, 'focus',    1.95, 'Void Deep Iron',   '1.5× BW AND Front Lever 3s AND 40+ swim AND 40+ boxing AND 40+ climbing.',             '#0C4A6E'),
    ],
  },

  'IRON+SWIFT+TIDE+COURT+WILD': {
    roots: ['IRON','SWIFT','TIDE','COURT','WILD'],
    tiers: [
      tier('Complete Fighter',  20, 'strength', 1.35, 'Complete Fight',   'Log compound, run, swim, boxing, AND climbing in same week.',                              '#9CA3AF'),
      tier('Iron Complete',     35, 'strength', 1.48, 'Iron Complete',    '3 sessions of each of the 5 in 7 days.',                                                  '#D97706'),
      tier('Complete Lord',     50, 'endurance',1.62, 'Complete Lord',    '1.0× BW AND sub-6:30/km AND 20+ swim AND 20+ boxing AND 20+ climbing.',                 '#B45309'),
      tier('Sovereign Complete',65, 'strength', 1.78, 'Sovereign Com',    '1.25× BW AND sub-5:30/km AND 30+ swim AND 30+ boxing AND 30+ climbing.',               '#92400E'),
      tier('Void Complete',     80, 'strength', 1.95, 'Void Complete',    '1.5× BW AND sub-5:00/km AND 40+ swim AND 40+ boxing AND 40+ climbing.',               '#78350F'),
    ],
  },

  'SHADOW+SWIFT+TIDE+COURT+WILD': {
    roots: ['SHADOW','SWIFT','TIDE','COURT','WILD'],
    tiers: [
      tier('Five Domain Ghost', 20, 'agility',  1.35, 'Ghost Five',       'Log skill, run, swim, boxing, AND climbing in same week.',                                 '#9CA3AF'),
      tier('Transcendent Wanderer',35,'focus',  1.48, 'Trans Wander',     '3 sessions of each of the 5 in 7 days.',                                                  '#7C3AED'),
      tier('Phantom Complete',  50, 'focus',    1.62, 'Phantom Complete', 'Tuck Lever 10s AND sub-6:30/km AND 20+ swim AND 20+ boxing AND 20+ climbing.',           '#6D28D9'),
      tier('Ghost Complete',    65, 'focus',    1.78, 'Ghost Complete',   'Adv Tuck 8s AND sub-5:30/km AND 30+ swim AND 30+ boxing AND 30+ climbing.',              '#5B21B6'),
      tier('Void Complete Ghost',80,'focus',    1.95, 'Void Complete',    'Front Lever 3s AND sub-5:00/km AND 40+ swim AND 40+ boxing AND 40+ climbing.',          '#3B0764'),
    ],
  },

  // ══════════════════════════════════════════════
  // ALL SIX ROOTS — S-CLASS ONLY
  // ══════════════════════════════════════════════

  'IRON+SHADOW+SWIFT+TIDE+COURT+WILD': {
    roots: ['IRON','SHADOW','SWIFT','TIDE','COURT','WILD'],
    tiers: [
      tier('Centurion',         20, 'all',      1.40, 'All-Front War',    'Log sessions hitting all 6 stat categories in 7 days.',                                    '#94A3B8'),
      tier('Transcendent',      40, 'all',      1.60, 'Absolute Trial',   'Log 7 sessions in 7 days hitting all 6 stat categories across them.',                     '#C084FC'),
      tier('Shadow Monarch',    60, 'all',      2.00, 'Monarch\'s Proof', '1.5× BW AND Front Lever 5s AND sub-5:00/km AND 40+ swim AND 40+ boxing AND 40+ climbing. All six. All elite.',
                                                                                                                                                                       '#FFD700'),
    ],
  },

};

// ── PATH LOOKUP ──
// Given a sorted array of active roots, return the matching path key.
export function getPathKey(activeRoots) {
  return activeRoots.slice().sort().join('+');
}

// ── EVALUATE CLASS ──
// Main function. Takes processed workout data and returns the classification result.
// Returns null if confidence gates not met.
export function evaluateClass(data, currentClassKey, currentTierIndex) {
  const { totalWorkouts, distinctWeeks, weeklyData, maxGapWeeks, rootScores } = data;

  // Minimum data gates
  if (totalWorkouts < MIN_GATES.totalWorkouts) return null;
  if (distinctWeeks < MIN_GATES.distinctWeeks) return null;
  if (maxGapWeeks > MIN_GATES.maxGapWeeks) return null;

  // Compute what fraction of total training each root represents
  const totalScore = Object.values(rootScores).reduce((a,b)=>a+b,0);
  if (totalScore === 0) return null;

  const rootFractions = {};
  Object.entries(rootScores).forEach(([r,s]) => {
    rootFractions[r] = s / totalScore;
  });

  // Determine active roots — those above the confidence threshold
  const activeRoots = Object.entries(rootFractions)
    .filter(([,f]) => f >= CONFIDENCE_THRESHOLD)
    .sort((a,b) => b[1]-a[1])
    .map(([r]) => r);

  if (activeRoots.length === 0) return null;

  // Weekly consistency check — dominant pattern must hold across history
  const consistency = weeklyConsistency(weeklyData);
  const primaryRoot = activeRoots[0];
  if ((consistency[primaryRoot] || 0) < MIN_GATES.dominantWeekFraction) return null;

  // Find the matching path
  const pathKey = getPathKey(activeRoots);
  const path = CLASS_PATHS[pathKey];
  if (!path) return null;

  // Find the highest tier the hunter qualifies for based on root scores
  const primaryScore = rootScores[primaryRoot] || 0;
  let tierIndex = 0;
  for (let i = path.tiers.length - 1; i >= 0; i--) {
    if (primaryScore >= path.tiers[i].minScore) {
      tierIndex = i;
      break;
    }
  }

  const newClassKey  = pathKey;
  const newTierIndex = tierIndex;
  const tier2        = path.tiers[tierIndex];

  // Is this a new classification or an evolution?
  const isNew       = !currentClassKey;
  const isEvolution = currentClassKey && (newClassKey !== currentClassKey || newTierIndex > currentTierIndex);
  const isChange    = isNew || isEvolution;

  return {
    pathKey:     newClassKey,
    tierIndex:   newTierIndex,
    tier:        tier2,
    path,
    activeRoots,
    rootFractions,
    primaryScore,
    isNew,
    isEvolution,
    isChange,
  };
}

// ── RAID AFFINITY BONUS ──
// Given a hunter's class and the raid boss weak stat, return the damage multiplier.
export function getRaidAffinityMultiplier(pathKey, tierIndex, bossWeakStat) {
  const path = CLASS_PATHS[pathKey];
  if (!path) return 1.0;
  const tier2 = path.tiers[tierIndex];
  if (!tier2) return 1.0;
  if (tier2.raidAffinity === 'all') return tier2.affinityMult;
  if (tier2.raidAffinity === bossWeakStat) return tier2.affinityMult;
  // Partial bonus if the class has some relevance
  if (path.roots.some(r => {
    const rootAffinity = { IRON:'strength', SHADOW:'focus', SWIFT:'agility', TIDE:'endurance', COURT:'agility', WILD:'flexibility' };
    return rootAffinity[r] === bossWeakStat;
  })) return 1.0 + (tier2.affinityMult - 1.0) * 0.4;
  return 1.0;
}

// ── AP RANK COSTS ──
// Post-classification the costs scale significantly.
// Pre-classification hunters are on the basic track.
export const RANK_AP_COSTS = {
  preClass: [0, 50, 100, 200, 350, 500],          // E D C B A S (before class)
  postClass: [0, 100, 300, 700, 1500, 3000, 6000], // E D C B A S SS (after class)
};

export const RANK_NAMES = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
