// registry.js: the art pack's catalogue of asset factories. Ported from Grimoire's game/art/registry.js.
//
// register(id, { category, sector = 'core', tiles: [w, d], budget?, budgetReason?, options?, build(opts) -> Object3D, anims? })
//   id: kebab-case, unique. tiles: footprint in floor tiles (1 tile = 1 unit), w along X, d along Z.
//   sector: which part of the app the asset belongs to (core, gym, equipment, system, dungeon, ...).
//   options (optional): { name: [choices] }, e.g. { rarity: RARITIES }; the catalogue offers a picker per name
//   and build() receives the choice as opts[name]. The first choice is the default.
//   budget: mesh triangles (outline hulls excluded, reported separately); defaults to BUDGETS[category].
//   A budget above the category default needs a non-empty budgetReason (shown in the catalogue).
//   build(opts) must return an Object3D whose origin is the floor centre of its footprint, +Z facing front.
//   anims (optional): { name: (object3d, seconds) => void }, played by the catalogue's close-up.
// make(id, opts) -> Object3D with userData.assetId.   list({ category, sector }?) -> metadata copies.
// measure(object3d) -> { triangles (all drawn, hulls included), outlineTriangles, drawables, bbox: { w, h, d }, bounds, hasNaN }
//   Sprites (glow halos) are counted as drawn but left out of the bounds: light may spill past a footprint.
// check(meta, measured) -> [problem strings]; the catalogue shows them as warnings.
// make() fills any option the caller leaves out with that option's first choice.
//
// Pure on purpose: no `three` import, so node can test it. measure() walks anything shaped
// like THREE.Object3D (children, matrix.elements, geometry.index, geometry.attributes.position).

// Triangle budgets per category. The app runs on phones (portrait, 390 px wide), so these are
// set for a scene of a dozen assets at 30 fps on a mid-range handset.
export const BUDGETS = Object.freeze({
  floor: 200, prop: 3000, equipment: 4000, emblem: 3000, structure: 6000, fx: 3000, character: 7000,
});
export const MAX_HEIGHT = 3.2;      // units, for everything but category 'structure'
export const TOLERANCE = 0.05;      // footprint slack

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const assets = new Map();

export function register(id, def = {}) {
  if (typeof id !== 'string' || !KEBAB.test(id)) throw new Error(`asset id "${id}" must be kebab-case`);
  if (assets.has(id)) throw new Error(`asset "${id}" is already registered`);
  const { category, sector = 'core', tiles, build, anims, options } = def;
  const budgetReason = typeof def.budgetReason === 'string' && def.budgetReason.trim() ? def.budgetReason.trim() : null;
  if (typeof category !== 'string' || !category) throw new Error(`asset "${id}": category is required`);
  if (typeof sector !== 'string' || !sector) throw new Error(`asset "${id}": sector must be a string`);
  if (!Array.isArray(tiles) || tiles.length !== 2 || !tiles.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) {
    throw new Error(`asset "${id}": tiles must be [w, d], two positive numbers`);
  }
  if (typeof build !== 'function') throw new Error(`asset "${id}": build must be a function`);
  const cap = BUDGETS[category];
  const budget = def.budget ?? cap;
  if (typeof budget !== 'number' || !(budget > 0)) throw new Error(`asset "${id}": category "${category}" has no default budget; give one`);
  if (cap !== undefined && budget > cap && !budgetReason) {
    throw new Error(`asset "${id}": budget ${budget} exceeds the ${category} budget of ${cap}; give a budgetReason`);
  }
  if (options !== undefined && (typeof options !== 'object' || Object.values(options).some((v) => !Array.isArray(v) || !v.length))) {
    throw new Error(`asset "${id}": options must map each name to a non-empty list of choices`);
  }
  assets.set(id, { id, category, sector, tiles: [tiles[0], tiles[1]], budget, budgetReason, options: options || null, build, anims: anims || null });
}

export function get(id) {
  const a = assets.get(id);
  return a && { ...a, tiles: [...a.tiles] };
}

export function list({ category, sector } = {}) {
  const out = [];
  for (const a of assets.values()) {
    if (category && a.category !== category) continue;
    if (sector && a.sector !== sector) continue;
    out.push({ id: a.id, category: a.category, sector: a.sector, tiles: [...a.tiles], budget: a.budget, budgetReason: a.budgetReason, options: a.options, anims: a.anims ? Object.keys(a.anims) : [] });
  }
  return out;
}

export function make(id, opts = {}) {
  const a = assets.get(id);
  if (!a) throw new Error(`unknown asset "${id}"`);
  const chosen = {};
  for (const [k, v] of Object.entries(a.options || {})) chosen[k] = v[0];
  const o = a.build({ ...chosen, ...(opts ?? {}) });
  if (!o || typeof o !== 'object' || !o.userData && !o.children) throw new Error(`asset "${id}": build() did not return an Object3D`);
  o.userData = o.userData || {};
  o.userData.assetId = id;
  return o;
}

// ---- measure: pure geometry walk ----
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { // column-major 4x4: a * b
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function localMatrix(o) {
  if (typeof o.updateMatrix === 'function' && o.matrixAutoUpdate !== false) o.updateMatrix();
  const e = o.matrix && o.matrix.elements;
  return e && e.length === 16 ? Array.from(e) : IDENTITY;
}
function triangles(o, g) {
  if (o.isLine || o.isLineSegments || o.isLineLoop || o.isPoints) return 0;
  if (o.isSprite) return 2;
  const pos = g.attributes && g.attributes.position;
  let n = g.index ? g.index.count : pos ? pos.count : 0;
  const dr = g.drawRange;
  if (dr && Number.isFinite(dr.count)) n = Math.max(0, Math.min(n - (dr.start || 0), dr.count));
  const t = Math.floor(n / 3);
  return o.isInstancedMesh ? t * (o.count ?? 1) : t;
}

export function measure(root) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let tris = 0, outlineTris = 0, drawables = 0, hasNaN = false;

  function points(g, M) {
    const pos = g.attributes && g.attributes.position;
    if (!pos) return;
    const n = pos.count || 0, s = pos.itemSize || 3, arr = pos.array;
    const read = typeof pos.getX === 'function'
      ? (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]
      : (i) => [arr[i * s], arr[i * s + 1], arr[i * s + 2]];
    for (let i = 0; i < n; i++) {
      const [x, y, z] = read(i);
      const p = [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) { hasNaN = true; continue; }
      for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
    }
  }
  function visit(o, M) {
    if (M.some((v) => !Number.isFinite(v))) { hasNaN = true; return; }
    const g = o.geometry;
    if (g && g.attributes) {
      const t = triangles(o, g);
      drawables++; tris += t;
      if (o.userData && o.userData.outlineChild) outlineTris += t;
      else if (o.isSprite) { /* a halo is light, not body: drawn and counted, but outside the bounds */ }
      else if (o.isInstancedMesh && o.instanceMatrix) {
        const a = o.instanceMatrix.array;
        for (let i = 0; i < (o.count ?? 0); i++) points(g, mul(M, Array.from(a.slice(i * 16, i * 16 + 16))));
      } else points(g, M); // outline hulls share their parent's geometry: no new bounds
    }
    for (const c of o.children || []) if (c.visible !== false) visit(c, mul(M, localMatrix(c)));
  }
  visit(root, IDENTITY); // measured in the asset's own frame: the root's placement is ignored

  const empty = min[0] === Infinity;
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return {
    triangles: tris,
    outlineTriangles: outlineTris,
    drawables,
    bbox: empty ? { w: 0, h: 0, d: 0 } : { w: r(max[0] - min[0]), h: r(max[1] - min[1]), d: r(max[2] - min[2]) },
    bounds: empty ? null : { min: min.map(r), max: max.map(r) },
    hasNaN,
  };
}

export function check(meta, m) {
  const out = [];
  if (m.hasNaN) out.push('NaN in the geometry');
  if (!m.bounds || m.drawables === 0) { out.push('draws nothing'); return out; }
  const mesh = m.triangles - m.outlineTriangles; // budgets exclude outline hulls
  if (mesh > meta.budget) out.push(`over budget: ${mesh} of ${meta.budget} triangles`);
  const [w, d] = meta.tiles, e = 1e-6;
  const hx = (w / 2) * (1 + TOLERANCE) + e, hz = (d / 2) * (1 + TOLERANCE) + e;
  const { min, max } = m.bounds;
  if (min[0] < -hx || max[0] > hx || min[2] < -hz || max[2] > hz) {
    out.push(`outside its ${w}x${d} footprint (x ${min[0].toFixed(2)}..${max[0].toFixed(2)}, z ${min[2].toFixed(2)}..${max[2].toFixed(2)})`);
  }
  if (meta.category !== 'structure' && m.bbox.h >= MAX_HEIGHT) out.push(`too tall: ${m.bbox.h.toFixed(2)} (limit ${MAX_HEIGHT})`);
  return out;
}
