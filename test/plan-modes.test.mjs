/* Tests for home and gym plans.  Run:  node test/plan-modes.test.mjs */

import { splitProgramDoc, programDocFor, switchPlans, plansByMode, streakScheduleOf, streakScheduleOfDoc, workoutInMode, homeEquipmentNotes, kitFromNotes, homeExerciseNames, kitLabel } from '../plan-modes.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const gym = { name: 'Gym', schedule: ['Mon', 'Wed', 'Fri'], currentDayIndex: 1, days: [{ name: 'A', exercises: [{ name: 'Bench Press', sets: 3, reps: 8 }] }] };
const home = { name: 'Home', schedule: ['Tue', 'Thu'], currentDayIndex: 0, days: [{ name: 'H', exercises: [{ name: 'Push-ups', sets: 3, reps: 15 }] }] };

// a doc from before the feature is the gym plan, and is written back unchanged
const legacy = splitProgramDoc(gym);
check('legacy doc is gym', legacy.mode, 'gym');
check('legacy doc active plan', legacy.active, gym);
check('legacy doc has no other plan', legacy.alt, null);
check('legacy doc written back unchanged', programDocFor(legacy.active, legacy.mode, legacy.alt, legacy.stored), gym);
check('no doc', splitProgramDoc(null), { mode: 'gym', active: null, alt: null, stored: false });

// switching to an empty home plan keeps the gym plan aside
const s1 = switchPlans(legacy, 'home');
check('switch to home: no home plan yet', s1.active, null);
check('switch to home: gym kept', s1.alt, gym);
const doc1 = programDocFor(s1.active, s1.mode, s1.alt, true);
check('doc with only the gym plan aside', doc1, { mode: 'home', alt: gym });
const back1 = splitProgramDoc(doc1);
check('read back: home has no plan', back1.active, null);
check('read back: gym aside', back1.alt, gym);
check('read back: mode', back1.mode, 'home');

// both plans
const doc2 = programDocFor(home, 'home', gym, true);
check('doc has home on top', doc2.name, 'Home');
check('doc keeps gym aside', doc2.alt, gym);
const s2 = switchPlans(splitProgramDoc(doc2), 'gym');
check('switch back to gym', s2.active, gym);
check('home kept aside', s2.alt.name, 'Home');
check('switch to the same mode does nothing', switchPlans(s2, 'gym').active, gym);
check('nested mode fields never stored twice', programDocFor({ ...home, mode: 'x', alt: { a: 1 } }, 'home', gym, true).alt, gym);
check('gym back on top after switching', programDocFor(s2.active, s2.mode, s2.alt, true).mode, 'gym');
check('plansByMode in home', plansByMode({ mode: 'home', active: home, alt: gym }).gym, gym);

// streak days come from the gym plan whichever is in use
check('streak schedule in gym', streakScheduleOf({ mode: 'gym', active: gym, alt: home }), ['Mon', 'Wed', 'Fri']);
check('streak schedule in home', streakScheduleOf({ mode: 'home', active: home, alt: gym }), ['Mon', 'Wed', 'Fri']);
check('streak schedule with only a home plan', streakScheduleOf({ mode: 'home', active: home, alt: null }), ['Tue', 'Thu']);
check('streak schedule from another Hunter\'s doc', streakScheduleOfDoc(doc2), ['Mon', 'Wed', 'Fri']);
check('streak schedule from a legacy doc', streakScheduleOfDoc(gym), ['Mon', 'Wed', 'Fri']);

// workouts
check('untagged workout is gym', workoutInMode({ programDayIndex: 0 }, 'gym'), true);
check('untagged workout is not home', workoutInMode({ programDayIndex: 0 }, 'home'), false);
check('home workout in home', workoutInMode({ planMode: 'home' }, 'home'), true);

// equipment the Hunter already told the coach about
const cp = {
  text: 'I want to get lean. At home I have dumbbells up to 20kg, a pull-up bar and bands.',
  answers: [{ q: 'Where do you train?', a: 'Gym 3 days, home on busy days' }, { q: 'How long have you trained?', a: '2 years' }, { q: 'What equipment do you have?', a: 'Full gym with machines' }],
  assumptions: [],
};
const notes = homeEquipmentNotes({ coachProfile: cp });
check('finds the home sentence', notes.includes('At home I have dumbbells up to 20kg, a pull-up bar and bands.'), true);
check('skips unrelated answers', notes.some(n => /2 years/.test(n)), false);
check('kit from home lines only', kitFromNotes(notes), ['bar', 'dumbbells', 'bands']);
check('chat messages count', homeEquipmentNotes({ chat: [{ role: 'user', content: 'I only have a kettlebell at home.' }, { role: 'assistant', content: 'At home use dumbbells.' }] }), ['I only have a kettlebell at home.']);
check('nothing said', homeEquipmentNotes({ coachProfile: { text: 'Bigger arms please.' } }), []);

const defs = { 'Push-ups': { equipment: 'Bodyweight' }, 'Dumbbell Row': { equipment: 'Dumbbell' }, 'Bench Press': { equipment: 'Barbell' }, 'Lat Pulldown': { equipment: 'Cable' }, 'Plank': {} };
check('bodyweight only', homeExerciseNames(defs, ['bodyweight']), ['Push-ups', 'Plank']);
check('dumbbells open dumbbell work', homeExerciseNames(defs, ['dumbbells', 'bar']), ['Push-ups', 'Dumbbell Row', 'Plank']);
check('cable kit', homeExerciseNames(defs, ['cable']), ['Push-ups', 'Lat Pulldown', 'Plank']);
check('kit label', kitLabel(['dumbbells', 'bands']), 'Dumbbells, Bands');
check('empty kit label', kitLabel([]), 'Bodyweight only');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
