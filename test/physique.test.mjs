/* Tests for the physique rules.  Run:  node test/physique.test.mjs
   No dependencies and no runner, like the other tests here: a plain script
   that exits non-zero on failure. */

import { muscleDevelopment, bodyBuild, bodyFrame, muscleShape, muscleTransform, principalAngle, LIMB_MUSCLES, MUSCLE_REGION, REFERENCE } from '../physique.js';

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

// ── limbs stay attached ─────────────────────────────────────────────────
const near = (a, b) => Math.abs(a - b) < 1e-3;
const diag = Array.from({ length: 20 }, (_, i) => [i, i]);
check('principal axis of a diagonal line is 45deg', near(principalAngle(diag), Math.PI / 4), String(principalAngle(diag)));
check('principal axis of a vertical line is 90deg', near(Math.abs(principalAngle([[0, 0], [0, 5], [0, 9]])), Math.PI / 2));
check('principal axis with no points is 0', principalAngle([]) === 0 && principalAngle([[1, 1]]) === 0);
// apply an SVG transform string (translate/rotate/scale chain) to a point
function apply(tf, [x, y]) {
  const ops = [...tf.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)].map((m) => [m[1], m[2].trim().split(/\s+/).map(Number)]);
  for (const [op, a] of ops.reverse()) {
    if (op === 'translate') { x += a[0]; y += a[1]; }
    else if (op === 'scale') { x *= a[0]; y *= a[a.length > 1 ? 1 : 0]; }
    else { const r = (a[0] * Math.PI) / 180; [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]; }
  }
  return [x, y];
}
const big = { sx: 1.4, sy: 1.08 };
check('undeveloped muscle needs no transform', muscleTransform('Calves', [5, 5], { sx: 1, sy: 1 }) === null);
check('Calves is a limb muscle, Middle Chest is not', LIMB_MUSCLES.has('Calves') && !LIMB_MUSCLES.has('Middle Chest'));
check('non-limb muscles keep the plain x/y scale', muscleTransform('Middle Chest', [10, 20], big).includes('scale(1.4 1.08)'));
const ang = Math.atan2(3, 1); // a tilted limb
const tfLimb = muscleTransform('Forearms', [100, 200], big, ang);
const along = [100 + 50 * Math.cos(ang), 200 + 50 * Math.sin(ang)];
const end = apply(tfLimb, along), across = apply(tfLimb, [100 - 5 * Math.sin(ang), 200 + 5 * Math.cos(ang)]);
check('a limb muscle keeps its ends in place', near(end[0], along[0]) && near(end[1], along[1]), JSON.stringify(end) + ' vs ' + JSON.stringify(along));
check('a limb muscle still widens across its axis', Math.hypot(across[0] - 100, across[1] - 200) > 5.5, JSON.stringify(across));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
