// catalogue.js: the review page for the art pack. Every registered asset, on a turntable, with its
// options, its animations and the registry's checks (budget, footprint, height, NaN).
//
// Serve the repo root (python -m http.server 8000) and open /art/catalogue.html.
// window.catalogue = { show(id, opts), lineup(), audit() -> [{ id, opts, problems }] } for scripted review.
import * as THREE from 'three';
import { list, make, measure, check, get as meta } from './index.js';
import { get as tget, set as tset, onThemeChange } from './theme.js';
import { setOutlines, setToon } from './kit.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) {
  $('err').style.display = 'grid';
  $('err').textContent = 'WebGL is unavailable here, so the catalogue cannot draw.';
  throw e;
}
// At least 2x: below that the thin ink outlines alias.
renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio || 1, 2), 2.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = tget('light.exposure');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);

// lights: a cool key with shadows, a violet rim from behind, a sky/ground fill
const hemi = new THREE.HemisphereLight(0xc4ccec, 0x0a0812, tget('light.hemi'));
const key = new THREE.DirectionalLight(tget('light.keyColor'), tget('light.key'));
key.position.set(3, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
const rim = new THREE.DirectionalLight(tget('light.rimColor'), tget('light.rim'));
rim.position.set(-3, 3, -4);
scene.add(hemi, key, key.target, rim);
onThemeChange(() => {
  hemi.intensity = tget('light.hemi');
  key.intensity = tget('light.key'); key.color.set(tget('light.keyColor'));
  rim.intensity = tget('light.rim'); rim.color.set(tget('light.rimColor'));
  renderer.toneMappingExposure = tget('light.exposure');
});

// the floor: a dark disc that takes shadows, and a faint ring of System blue at its edge
const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshToonMaterial({ color: 0x0c1020 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96), new THREE.MeshBasicMaterial({ color: 0x5ba8ff, transparent: true, opacity: 0.35 }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.001;
scene.add(ring);

const stage = new THREE.Group();
scene.add(stage);

// ---- state ----
const view = { yaw: 0.5, pitch: 0.42, dist: 4, turntable: true, anims: true, outlines: true, toon: true };
let shown = []; // [{ object, meta, anims }]
let current = { id: null, opts: {} };
let radius = 1, centreY = 0.5;

function clear() {
  for (const { object } of shown) stage.remove(object);
  shown = [];
}
function fit(box) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  radius = Math.max(sphere.radius, 0.35);
  centreY = sphere.center.y;
  view.dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.12;
  const s = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) + radius * 0.6;
  floor.scale.setScalar(s); ring.scale.setScalar(s);
  const ext = s * 1.4;
  Object.assign(key.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.1, far: 40 });
  key.shadow.camera.updateProjectionMatrix();
  key.position.set(3, 6, 4).normalize().multiplyScalar(ext * 2.5);
}

function show(id, opts = {}) {
  clear();
  const object = make(id, opts);
  stage.add(object);
  shown.push({ object, meta: meta(id), anims: Object.values(meta(id).anims || {}) });
  current = { id, opts };
  stage.rotation.y = 0;
  fit(new THREE.Box3().setFromObject(object));
  applyStyle();
  renderSide();
}

function lineup() {
  clear();
  const all = list();
  const cols = Math.ceil(Math.sqrt(all.length));
  let x = 0, z = 0, rowDepth = 0;
  const placed = [];
  all.forEach((m, i) => {
    if (i % cols === 0 && i) { z += rowDepth + 0.6; x = 0; rowDepth = 0; }
    const o = make(m.id);
    o.position.set(x + m.tiles[0] / 2, 0, z + m.tiles[1] / 2);
    x += m.tiles[0] + 0.4;
    rowDepth = Math.max(rowDepth, m.tiles[1]);
    stage.add(o);
    placed.push(o);
    shown.push({ object: o, meta: m, anims: Object.values(meta(m.id).anims || {}) });
  });
  const box = new THREE.Box3();
  for (const o of placed) box.expandByObject(o);
  const c = box.getCenter(new THREE.Vector3());
  for (const o of placed) { o.position.x -= c.x; o.position.z -= c.z; }
  stage.rotation.y = 0;
  fit(new THREE.Box3().setFromObject(stage));
  current = { id: null, opts: {} };
  applyStyle();
  renderSide();
}

function audit() {
  const out = [];
  for (const m of list()) {
    const combos = [{}];
    for (const [k, vs] of Object.entries(m.options || {})) {
      const next = [];
      for (const c of combos) for (const v of vs) next.push({ ...c, [k]: v });
      combos.splice(0, combos.length, ...next);
    }
    for (const opts of combos) {
      const o = make(m.id, opts);
      o.updateMatrixWorld(true);
      const ms = measure(o);
      out.push({ id: m.id, opts, problems: check(m, ms), triangles: ms.triangles - ms.outlineTriangles, budget: m.budget });
    }
  }
  return out;
}

function applyStyle() {
  setOutlines(view.outlines);
  setToon(scene, view.toon);
}

// ---- side panel ----
const SECTOR_ORDER = ['gym', 'equipment', 'system', 'dungeon', 'army', 'core'];
function renderSide() {
  const all = list();
  const rank = (s) => (SECTOR_ORDER.includes(s) ? SECTOR_ORDER.indexOf(s) : SECTOR_ORDER.length);
  const sectors = [...new Set(all.map((m) => m.sector))].sort((a, b) => rank(a) - rank(b));
  const problemsOf = (m) => check(m, measure(make(m.id)));
  $('assets').innerHTML = sectors.map((s) => `<div class="group"><div class="gname">${s}</div><div class="chips">${
    all.filter((m) => m.sector === s).map((m) => `<button class="chip${problemsOf(m).length ? ' warn' : ''}" data-id="${m.id}" aria-pressed="${m.id === current.id}">${m.id}</button>`).join('')
  }</div></div>`).join('') + `<div class="group"><div class="chips"><button class="chip" data-lineup aria-pressed="${!current.id}">Line-up</button></div></div>`;

  const m = current.id && meta(current.id);
  $('options-panel').style.display = m && m.options ? '' : 'none';
  if (m && m.options) {
    const chosen = { ...Object.fromEntries(Object.entries(m.options).map(([k, v]) => [k, v[0]])), ...current.opts };
    $('options').innerHTML = Object.entries(m.options).map(([k, vs]) => `<div class="group"><div class="gname">${k}</div><div class="chips">${
      vs.map((v) => `<button class="chip" data-opt="${k}" data-val="${v}" aria-pressed="${chosen[k] === v}">${v}</button>`).join('')
    }</div></div>`).join('');
  }

  const toggles = [['turntable', 'Turntable'], ['anims', 'Animate'], ['outlines', 'Outlines'], ['toon', 'Toon']];
  $('toggles').innerHTML = toggles.map(([k, label]) => `<button class="chip" data-toggle="${k}" aria-pressed="${view[k]}">${label}</button>`).join('');

  const facts = $('facts'), probs = $('problems');
  if (m) {
    const o = shown[0].object;
    const ms = measure(o);
    const mesh = ms.triangles - ms.outlineTriangles;
    const p = check(m, ms);
    facts.innerHTML = `
      <dt>id</dt><dd>${m.id}</dd>
      <dt>category</dt><dd>${m.category} · ${m.sector}</dd>
      <dt>footprint</dt><dd>${m.tiles[0]} × ${m.tiles[1]} tiles</dd>
      <dt>size</dt><dd>${ms.bbox.w.toFixed(2)} × ${ms.bbox.h.toFixed(2)} × ${ms.bbox.d.toFixed(2)}</dd>
      <dt>triangles</dt><dd class="${mesh > m.budget ? 'bad' : 'ok'}">${mesh} / ${m.budget}</dd>
      <dt>outline</dt><dd>${ms.outlineTriangles} tris (not budgeted)</dd>
      <dt>draws</dt><dd>${ms.drawables}</dd>
      <dt>anims</dt><dd>${m.anims ? Object.keys(m.anims).join(', ') : '—'}</dd>`;
    probs.innerHTML = p.map((x) => `<li>⚠ ${x}</li>`).join('') || '<li class="ok">✓ passes every check</li>';
    $('tag').textContent = `${m.id.toUpperCase()}${Object.keys(current.opts).length ? ' · ' + Object.values(current.opts).join(' · ') : ''}`;
  } else {
    const a = audit();
    const bad = a.filter((r) => r.problems.length);
    facts.innerHTML = `<dt>assets</dt><dd>${all.length}</dd><dt>variants</dt><dd>${a.length}</dd><dt>failing</dt><dd class="${bad.length ? 'bad' : 'ok'}">${bad.length}</dd>`;
    probs.innerHTML = bad.map((r) => `<li>⚠ ${r.id} ${JSON.stringify(r.opts)}: ${r.problems.join('; ')}</li>`).join('') || '<li class="ok">✓ every variant passes</li>';
    $('tag').textContent = 'LINE-UP';
  }
  $('summary').textContent = `${all.length} assets · three r${THREE.REVISION}`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.id) show(b.dataset.id);
  else if ('lineup' in b.dataset) lineup();
  else if (b.dataset.opt) show(current.id, { ...current.opts, [b.dataset.opt]: b.dataset.val });
  else if (b.dataset.toggle) { view[b.dataset.toggle] = !view[b.dataset.toggle]; applyStyle(); renderSide(); }
});

// ---- orbit: drag to turn and tilt, wheel or pinch to zoom ----
const pointers = new Map();
let pinch = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); view.turntable = false; renderSide(); });
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const [px, py] = pointers.get(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) {
    view.yaw -= (e.clientX - px) * 0.008;
    view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - py) * 0.006, 0.05, 1.35);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) view.dist = THREE.MathUtils.clamp(view.dist * pinch / d, radius * 0.8, radius * 12);
    pinch = d;
  }
});
const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.dist = THREE.MathUtils.clamp(view.dist * Math.exp(e.deltaY * 0.001), radius * 0.8, radius * 12); }, { passive: false });

// ---- frame loop ----
const clock = new THREE.Clock();
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
  }
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  resize();
  if (view.turntable) view.yaw += dt * 0.35;
  if (view.anims) for (const { object, anims } of shown) for (const fn of anims) fn(object, t);
  // portrait screens see less width: back the camera off so a wide asset still fits
  const aspectPad = camera.aspect < 1 ? 1 / camera.aspect : 1;
  const d = view.dist * Math.max(1, aspectPad * 0.85);
  camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * d, centreY + Math.sin(view.pitch) * d, Math.cos(view.yaw) * Math.cos(view.pitch) * d);
  camera.lookAt(0, centreY, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.catalogue = { show, lineup, audit, view, theme: { get: tget, set: tset } };
const first = new URLSearchParams(location.search).get('asset');
if (first && meta(first)) show(first); else lineup();
frame();
