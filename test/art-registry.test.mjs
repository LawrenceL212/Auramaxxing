/* Tests for the art registry (art/registry.js).  Run:  node test/art-registry.test.mjs
   The registry is pure on purpose (no three import), so it runs in node. The trees here are
   tiny fakes with the THREE.Object3D shape: children, matrix.elements, geometry. */

import { register, make, list, get, measure, check, BUDGETS } from '../art/registry.js';

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail = '') {
  cond ? pass++ : fail++;
  results.push(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${cond ? '' : `\n          ${detail}`}`);
}
function throws(name, fn, re) {
  try { fn(); ok(name, false, 'did not throw'); } catch (e) { ok(name, re.test(e.message), `threw "${e.message}"`); }
}

// ---- a tiny fake Object3D tree ----
const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function translate(x, y, z) { const e = I(); e[12] = x; e[13] = y; e[14] = z; return e; }
function node(opts = {}) {
  return { children: opts.children || [], visible: true, userData: opts.userData || {}, matrix: { elements: opts.matrix || I() }, geometry: opts.geometry };
}
// a w x h x d box on the floor (y 0..h), centred on x and z: 12 triangles
function box(w, h, d, o = {}) {
  const pts = [];
  for (const x of [-w / 2, w / 2]) for (const y of [0, h]) for (const z of [-d / 2, d / 2]) pts.push(x, y, z);
  return node({ ...o, geometry: { index: { count: 36 }, attributes: { position: { count: 8, itemSize: 3, array: new Float32Array(pts) } } } });
}

// ---- register ----
throws('rejects a non-kebab id', () => register('Bad_Id', { category: 'prop', tiles: [1, 1], build: () => node() }), /kebab-case/);
throws('requires tiles [w, d]', () => register('no-tiles', { category: 'prop', build: () => node() }), /tiles/);
throws('requires build()', () => register('no-build', { category: 'prop', tiles: [1, 1] }), /build/);
throws('over budget needs a reason', () => register('greedy', { category: 'prop', tiles: [1, 1], budget: BUDGETS.prop + 1, build: () => node() }), /budgetReason/);
throws('options must be non-empty lists', () => register('bad-opts', { category: 'prop', tiles: [1, 1], options: { rank: [] }, build: () => node() }), /options/);

let seen = null;
register('crate', { category: 'prop', sector: 'gym', tiles: [1, 1], options: { rank: ['E', 'S'], size: ['s', 'l'] }, build: (o) => { seen = o; return box(0.8, 0.6, 0.8); } });
throws('rejects a duplicate id', () => register('crate', { category: 'prop', tiles: [1, 1], build: () => node() }), /already registered/);

// ---- make: options default to their first choice ----
const o = make('crate', { size: 'l' });
ok('make tags the asset id', o.userData.assetId === 'crate');
ok('make fills a missing option with its first choice', seen.rank === 'E' && seen.size === 'l', JSON.stringify(seen));
throws('make rejects an unknown id', () => make('nope'), /unknown asset/);

// ---- list / get ----
const l = list({ sector: 'gym' });
ok('list filters by sector', l.length === 1 && l[0].id === 'crate');
ok('list carries the options', JSON.stringify(l[0].options) === JSON.stringify({ rank: ['E', 'S'], size: ['s', 'l'] }));
ok('get returns a copy', (() => { const g = get('crate'); g.tiles[0] = 9; return get('crate').tiles[0] === 1; })());

// ---- measure ----
const m = measure(box(0.8, 0.6, 0.8));
ok('measure counts triangles', m.triangles === 12, String(m.triangles));
ok('measure finds the bounding box', m.bbox.w === 0.8 && m.bbox.h === 0.6 && m.bbox.d === 0.8, JSON.stringify(m.bbox));
const outlined = box(1, 1, 1, { children: [Object.assign(box(1, 1, 1), { userData: { outlineChild: true } })] });
const mo = measure(outlined);
ok('outline hulls are counted apart', mo.triangles === 24 && mo.outlineTriangles === 12, JSON.stringify(mo));
const moved = node({ children: [box(0.2, 0.2, 0.2, { matrix: translate(2, 0, 0) })] });
ok('measure applies child transforms', measure(moved).bounds.max[0] === 2.1, JSON.stringify(measure(moved).bounds));

const halo = Object.assign(box(4, 4, 4), { isSprite: true });
const withHalo = measure(node({ children: [box(0.5, 0.5, 0.5), halo] }));
ok('a sprite halo is drawn but stays out of the bounds', withHalo.drawables === 2 && withHalo.bbox.w === 0.5, JSON.stringify(withHalo));

// ---- check ----
const meta = get('crate');
ok('a box inside its footprint passes', check(meta, measure(box(0.8, 0.6, 0.8))).length === 0);
ok('a box outside its footprint fails', check(meta, measure(box(1.4, 0.6, 0.8))).some((p) => /footprint/.test(p)));
ok('a tall box fails', check(meta, measure(box(0.5, 3.5, 0.5))).some((p) => /too tall/.test(p)));
ok('an empty tree fails', check(meta, measure(node())).some((p) => /draws nothing/.test(p)));
const heavy = { ...meta, budget: 10 };
ok('over budget fails, outlines excluded', check(heavy, mo).some((p) => /over budget: 12 of 10/.test(p)), JSON.stringify(check(heavy, mo)));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
