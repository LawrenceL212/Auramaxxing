// Progression chains — skill/exercise mastery ladders shown in the Moves tab.
// Pure data (id/name/icon/category/steps) — no live-state dependencies.
export const PROGRESSION_CHAINS = [
  // ── Calisthenics Skills ──
  {
    id:'planche', name:'Planche Mastery', icon:'🤸', category:'calisthenics',
    steps:['Frog Stand','Tuck Planche','Advanced Tuck Planche','Straddle Planche','Full Planche'],
  },
  {
    id:'front_lever', name:'Front Lever Mastery', icon:'🔩', category:'calisthenics',
    steps:['Tuck Front Lever','Advanced Tuck Front Lever','Single Leg Front Lever','Straddle Front Lever','Front Lever'],
  },
  {
    id:'back_lever', name:'Back Lever Mastery', icon:'🔗', category:'calisthenics',
    steps:['Skin The Cat','Tuck Back Lever','Advanced Tuck Back Lever','Straddle Back Lever','Back Lever'],
  },
  {
    id:'handstand', name:'Handstand Mastery', icon:'🙆', category:'calisthenics',
    steps:['Wall Handstand Hold','Chest-to-Wall Handstand Hold','Freestanding Handstand Hold','Handstand Push Up','Deficit Handstand Push Up'],
  },
  {
    id:'pull_progression', name:'Pull Progression', icon:'💪', category:'calisthenics',
    steps:['Inverted Row','Pull Up','Chin Up','Neutral Grip Pull Up','Muscle Up'],
  },
  {
    id:'push_up', name:'Push Up Progression', icon:'💥', category:'calisthenics',
    steps:['Incline Push Up','Push Up','Wide Push Up','Archer Push Up','Diamond Push Up'],
  },
  {
    id:'dip', name:'Dip Progression', icon:'🔱', category:'calisthenics',
    steps:['Bench Dip','Dips','Ring Dips','Weighted Dip','Muscle Up'],
  },
  {
    id:'core_progression', name:'Core Mastery', icon:'⚡', category:'calisthenics',
    steps:['Plank','Hanging Knee Raise','Hanging Leg Raise','Toes to Bar','Dragon Flag'],
  },
  // ── Strength Progressions ──
  {
    id:'squat_prog', name:'Squat Progression', icon:'🏋️', category:'strength',
    steps:['Bodyweight Squat','Goblet Squat','Squat','Front Squat','Pistol Squat'],
  },
  {
    id:'deadlift_prog', name:'Deadlift Progression', icon:'⚓', category:'strength',
    steps:['Romanian Deadlift','Stiff-Leg Deadlift','Deadlift','Sumo Deadlift','Rack Pull'],
  },
  {
    id:'press_prog', name:'Press Progression', icon:'🔨', category:'strength',
    steps:['Push Up','Dips','Bench Press','Incline Bench Press','Close Grip Bench Press'],
  },
  {
    id:'overhead_prog', name:'Overhead Progression', icon:'🏹', category:'strength',
    steps:['Pike Push Up','Dumbbell Shoulder Press','Overhead Press','Push Press','Handstand Push Up'],
  },
  {
    id:'row_prog', name:'Row Progression', icon:'🚣', category:'strength',
    steps:['Inverted Row','One-Arm Dumbbell Row','Barbell Row','Pendlay Row','T-Bar Row'],
  },
  // ── Endurance Progressions ──
  {
    id:'run_type', name:"Runner's Path", icon:'🏃', category:'endurance',
    steps:['Easy Run','Tempo Run','Interval Running','Hill Sprints','Race'],
  },
  // ── Explosive / Agility ──
  {
    id:'explosive_prog', name:'Explosive Power', icon:'💨', category:'agility',
    steps:['Burpee','Jump Squat','Box Jump','Hill Sprints','Interval Running'],
  },
  // ── Mobility / Recovery ──
  {
    id:'mobility_prog', name:'Mobility Mastery', icon:'🌊', category:'flexibility',
    steps:['Side Plank','Dead Hang','L-Sit','Skin The Cat','Front Lever'],
  },
];
