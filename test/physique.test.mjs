/* Tests for the physique rules.  Run:  node test/physique.test.mjs
   No dependencies and no runner, like the other tests here: a plain script
   that exits non-zero on failure. */

import { muscleDevelopment, bodyBuild, bodyFrame, muscleShape, MUSCLE_REGION, REFERENCE } from '../physique.js';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`);
}

const MUSCLES = ['Middle Chest', 'Triceps', 'Biceps', 'Quads'];
const EX = {
  'Bench Press': { muscles: { 'Middle Chest': 1, 'Triceps': 0.5 } },
  'Curl': { muscles: { 'Biceps': 1 } },
};
const now = new Date('2026-10-05T12:00:00');
const day = (n) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
const session = (n, name, sets, uid = 'u1') => ({ uid, date: day(n), exercises: [{ name, sets: Array.from({ length: sets }, () => ({ reps: 8 })) }] });

// ── development ─────────────────────────────────────────────────────────
const none = muscleDevelopment({ workouts: [], exercises: EX, muscles: MUSCLES, now });
check('no training: nothing developed', Object.values(none).every((v) => v === 0), JSON.stringify(none));

const bench = Array.from({ length: 12 }, (_, i) => session(i * 7, 'Bench Press', 12));
const dev = muscleDevelopment({ workouts: bench, exercises: EX, muscles: MUSCLES, now, uid: 'u1' });
check('trained muscle develops', dev['Middle Chest'] > 0.4, JSON.stringify(dev));
check('secondary muscle develops less', dev['Triceps'] > 0 && dev['Triceps'] < dev['Middle Chest'], JSON.stringify(dev));
check('untrained muscle stays flat', dev['Biceps'] === 0 && dev['Quads'] === 0, JSON.stringify(dev));
check('development stays within 0..1', Object.values(dev).every((v) => v >= 0 && v <= 1));

const other = muscleDevelopment({ workouts: bench.map((w) => ({ ...w, uid: 'u2' })), exercises: EX, muscles: MUSCLES, now, uid: 'u1' });
check("another hunter's workouts don't count", other['Middle Chest'] === 0);

const old = muscleDevelopment({ workouts: [session(120, 'Curl', 20)], exercises: EX, muscles: MUSCLES, now });
check('training older than 12 weeks has faded', old['Biceps'] === 0);
const recent = muscleDevelopment({ workouts: [session(1, 'Curl', 10)], exercises: EX, muscles: MUSCLES, now });
const later = muscleDevelopment({ workouts: [session(60, 'Curl', 10)], exercises: EX, muscles: MUSCLES, now });
check('recent training counts more than old', recent['Biceps'] > later['Biceps'], `${recent['Biceps']} vs ${later['Biceps']}`);

const strong = muscleDevelopment({ workouts: [], exercises: EX, prs: { 'Bench Press': { tier: 'Elite' } }, muscles: MUSCLES, now });
check('strength alone shows', strong['Middle Chest'] > 0.3 && strong['Triceps'] === 0, JSON.stringify(strong));
const both = muscleDevelopment({ workouts: bench, exercises: EX, prs: { 'Bench Press': { tier: 'Elite' } }, muscles: MUSCLES, now });
check('strength adds to volume', both['Middle Chest'] > dev['Middle Chest']);

// ── build ───────────────────────────────────────────────────────────────
const def = bodyBuild({});
check('no data: default build, all 1', def.source === 'default' && ['chest', 'waist', 'legs'].every((k) => def[k] === 1));
const avg = bodyBuild({ bodyType: 'male', heightCm: 180, weightKg: 24 * 1.8 * 1.8 });
check('average BMI is close to 1', avg.source === 'estimated' && Math.abs(avg.chest - 1) < 0.01 && Math.abs(avg.waist - 1) < 0.01, JSON.stringify(avg));
const heavy = bodyBuild({ bodyType: 'male', heightCm: 175, weightKg: 110 });
const light = bodyBuild({ bodyType: 'male', heightCm: 185, weightKg: 62 });
check('heavier draws wider', heavy.chest > 1 && light.chest < 1 && heavy.waist > heavy.chest, JSON.stringify({ heavy, light }));
check('build stays in a sane range', [heavy, light].every((b) => ['chest', 'waist', 'legs'].every((k) => b[k] > 0.75 && b[k] < 1.4)));
check('nonsense height is ignored', bodyBuild({ heightCm: 5, weightKg: 80 }).source === 'default');

const refM = REFERENCE.male;
const tape = bodyBuild({ bodyType: 'male', heightCm: 180, weightKg: 80, checkin: { chest: refM.chest * 1.2, waist: refM.waist * 0.9, armLeft: 40, armRight: 41 } });
check('tape measurements win', tape.source === 'measured' && tape.chest > 1.15 && tape.waist < 0.95 && tape.arms > 1.15, JSON.stringify(tape));
const fem = bodyBuild({ bodyType: 'female', checkin: { hip: REFERENCE.female.hip } });
check('female measured against female averages', fem.hips === 1 && fem.source === 'measured');

// ── shape ───────────────────────────────────────────────────────────────
check('every tracked muscle has a region', ['Upper Chest', 'Lats', 'Calves', 'Obliques', 'Traps'].every((m) => MUSCLE_REGION[m]));
const s0 = muscleShape('Biceps', 0), s1 = muscleShape('Biceps', 1);
check('undeveloped muscle draws at 1', s0.sx === 1 && s0.sy === 1);
check('developed muscle draws bigger, wider than taller', s1.sx > s1.sy && s1.sy > 1, JSON.stringify(s1));
check('build widens the region', muscleShape('Quads', 0, { legs: 1.1 }).sx === 1.1);
check('abs grow less than biceps', muscleShape('Upper Abs', 1).sx < s1.sx);
check('frame follows the build', bodyFrame(heavy) > 1 && bodyFrame(light) < 1 && bodyFrame({}) === 1, JSON.stringify([bodyFrame(heavy), bodyFrame(light)]));
check('muscles never draw narrower than the frame', muscleShape('Quads', 0, light, bodyFrame(light)).sx === 1);
check('a region broader than the frame widens on top of it', muscleShape('Upper Abs', 0, heavy, bodyFrame(heavy)).sx > 1);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
