/* Tests for the pure parts of ui-art.js.  Run:  node test/ui-art.test.mjs */

import { BASE_EXERCISES } from '../exercises.js';
import { equipmentKind, muscleTint, uiRing, uiSigil, uiIcon, uiArtHtml, UI_ART_NAMES } from '../ui-art.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

check('barbell from the database', equipmentKind('Bench Press', BASE_EXERCISES['Bench Press']), 'barbell');
check('dumbbell from the database', equipmentKind('Incline Dumbbell Press', BASE_EXERCISES['Incline Dumbbell Press']), 'dumbbell');
check('cable from the database', equipmentKind('Tricep Pushdown', BASE_EXERCISES['Tricep Pushdown']), 'cable');
check('bodyweight from the database', equipmentKind('Dips', BASE_EXERCISES['Dips']), 'bodyweight');
check('kettlebell by name', equipmentKind('Kettlebell Swing', { equipment: 'Other' }), 'kettlebell');
check('band by name', equipmentKind('Band Pull Apart', { equipment: 'Bodyweight' }), 'band');
check('cardio by intent', equipmentKind('Running', { intent: 'endurance', equipment: 'Bodyweight' }), 'cardio');
check('unknown custom exercise', equipmentKind('Mystery', { equipment: 'Other' }), 'other');
check('no definition at all', equipmentKind('Mystery'), 'other');

check('chest work is blue', muscleTint({ 'Middle Chest': 1, Triceps: 0.6 }), 'var(--brass)');
check('lat work is violet', muscleTint({ Lats: 1, Biceps: 0.6 }), 'var(--violet)');
check('leg work is green', muscleTint({ Quads: 1, Glutes: 0.6 }), 'var(--growing)');
check('core work is teal', muscleTint({ 'Upper Abs': 1 }), 'var(--maintaining)');
check('no muscles falls back to blue', muscleTint({}), 'var(--brass)');

check('ring: half full dash is half the circumference', /stroke-dasharray="119\.4 /.test(uiRing({ size: 84, r: 38, frac: 0.5 })), true);
check('ring: frac is clamped', /stroke-dasharray="238\.8 /.test(uiRing({ size: 84, r: 38, frac: 7 })), true);
check('sigil is an svg', uiSigil({ size: 200 }).startsWith('<svg class="ui-sigil'), true);
check('sigil can stand still', uiSigil({ still: true }).includes('ui-sigil still'), true);
check('every equipment kind has an icon', ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'band', 'kettlebell', 'cardio', 'other'].every(k => uiIcon(k).includes('<svg')), true);
check('art stand-in carries its name for hydration', uiArtHtml('icon-ap').includes('data-ui-art="icon-ap"'), true);
check('art names include the list from art-list.md', ['gate-card-bg', 'icon-streak', 'muscle-chest', 'rank-up-aura'].every(n => UI_ART_NAMES.includes(n)), true);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
