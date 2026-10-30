/* Tests for one-tap deploy.  Run:  node test/deploy-plan.test.mjs */

import { autoDeployPlan, describeDeploy } from '../deploy-plan.js';

let pass = 0, fail = 0;
const results = [];

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const ids = ['na_0', 'na_1', 'na_2', 'na_3', 'na_4', 'na_5'];
const sum = plan => plan.reduce((a, p) => a + p.amount, 0);

check('1. empty continent, 3 soldiers: claims the first three, capital first',
  autoDeployPlan({ ids, countries: {}, uid: 'me', amount: 3 }),
  [{ gcId: 'na_0', amount: 1 }, { gcId: 'na_1', amount: 1 }, { gcId: 'na_2', amount: 1 }]);

const p2 = autoDeployPlan({ ids, countries: {}, uid: 'me', amount: 20 });
check('2. 20 soldiers on an empty continent claim all six', p2.length, 6);
check('2b. every soldier is placed', sum(p2), 20);
check('2c. spread is even within one', Math.max(...p2.map(p => p.amount)) - Math.min(...p2.map(p => p.amount)) <= 1, true);

const held = { na_0: { ownerUid: 'rival', soldiers: 50 }, na_1: { ownerUid: 'me', soldiers: 10 }, na_2: { ownerUid: 'me', soldiers: 2 } };
const p3 = autoDeployPlan({ ids, countries: held, uid: 'me', amount: 10 });
check('3. never touches a rival territory', p3.some(p => p.gcId === 'na_0'), false);
check('3b. claims the three free ones', ['na_3', 'na_4', 'na_5'].every(id => p3.some(p => p.gcId === id)), true);
check('3c. all 10 placed', sum(p3), 10);
check('3d. the weakest own territory gets more than the strongest',
  (p3.find(p => p.gcId === 'na_2')?.amount || 0) > (p3.find(p => p.gcId === 'na_1')?.amount || 0), true);

const allRival = Object.fromEntries(ids.map(id => [id, { ownerUid: 'rival', soldiers: 1 }]));
check('4. a fully rival continent gives no plan', autoDeployPlan({ ids, countries: allRival, uid: 'me', amount: 5 }), []);
check('5. zero or bad amount gives no plan', autoDeployPlan({ ids, uid: 'me', amount: 'x' }), []);

check('6. description', describeDeploy(p3, held, 'me'), 'claims 3 territories, reinforces 1 of yours');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
