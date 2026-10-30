/* Tests for the Hunt gate lightning geometry.  Run: node test/hunt-fx.test.mjs */
import { archPoint, boltPath, strikePlan, nextGap, FX_BOX, huntFxHtml } from '../hunt-fx.js';
let fail = 0;
const check = (n, ok) => { if (!ok) fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${n}`); };
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let allOk = true;
for (let i = 0; i < 200; i++) {
  const p = archPoint(rng);
  if (!(p.x > 60 && p.x < 330 && p.y > 80 && p.y < 310)) allOk = false;
}
check('start points lie on the arch edge inside the box', allOk);
const b = boltPath(rng);
check('bolt has a main path plus at least one branch', (b.d.match(/M/g) || []).length >= 2);
check('bolt main path is jagged (7+ segments)', b.points.length >= 8);
const plan = strikePlan(rng);
check('a strike is 2-3 bolts', plan.length >= 2 && plan.length <= 3);
check('bolts differ between strikes', strikePlan(rng)[0].d !== plan[0].d);
let gapOk = true; for (let i = 0; i < 100; i++) { const g = nextGap(rng); if (g < 2200 || g > 5500) gapOk = false; }
check('strikes come every 2.2 to 5.5 s', gapOk);
check('markup has 3 bolt slots and sits in the 390x540 box', (huntFxHtml().match(/hfx-bolt"/g) || []).length === 3 && FX_BOX.w === 390 && FX_BOX.h === 540);
process.exit(fail ? 1 : 0);
