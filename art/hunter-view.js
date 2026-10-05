// hunter-view.js: the player's 3D body on screen, and the look creator.
//
//   const v = await mountHunterView(el, { bodyType, weights, look, heat, showHeat, framing })
//     draws the body (art/hunter.js) in its own small canvas filling el. Drag sideways to turn it; the
//     page still scrolls vertically. Renders only while it moves, so it costs nothing at rest.
//     v.update(sameOptions)  reshape / redress / recolour in place     v.dispose()
//   openLookCreator({ bodyType, look, morphs(look) -> weights, onSave(look) })
//     a full-screen sheet: a live preview above, skin, hair, eyes, heritage and face sliders below.
//
// Presentation only: reads what it is given, writes nothing but what onSave does with the look.
import * as THREE from 'three';
import { loadHunter } from './hunter.js';
import { applyEnvironment } from './look.js';
import { FACE_SHAPES, FACE_SLIDERS, ANCESTRY } from '../physique.js';

export const SKIN_TONES = ['#f6dccb', '#efcfb5', '#e2b897', '#d4a27c', '#c8956e', '#b57f58', '#a06b47', '#8a583a', '#71452c', '#5b3622', '#45291a', '#331d12'];
export const HAIR_COLOURS = ['#141010', '#2a1d16', '#4a3020', '#7a5434', '#7c3a1e', '#b5622e', '#c9a46a', '#e2d6bd', '#8d8a86', '#e8e6e2'];
export const EYE_COLOURS = ['#2a1a10', '#5a3b22', '#7a6236', '#4f7a4a', '#4a74a8', '#7d8a96'];
const HAIR_NAMES = { none: 'Bald', buzz: 'Buzz', short: 'Short', quiff: 'Quiff', curly: 'Curly', afro: 'Afro', medium: 'Medium', long: 'Long', ponytail: 'Ponytail' };
const FACE_NAMES = { oval: 'Oval', round: 'Round', rectangular: 'Long', square: 'Square', triangular: 'Triangle', invertedtriangular: 'Heart', diamond: 'Diamond' };
const SLIDER_NAMES = {
  'face.full': 'Cheeks', 'face.wide': 'Face width', 'face.long': 'Face length', 'nose.wide': 'Nose width', 'nose.long': 'Nose length',
  'nose.hump': 'Nose bridge', 'nose.size': 'Nose size', 'nose.nostrils': 'Nostrils', 'nose.tip': 'Nose tip', 'mouth.wide': 'Mouth width',
  'lips.full': 'Lips', 'eyes.size': 'Eye size', 'eyes.slant': 'Eye tilt', 'eyes.fold': 'Eyelid fold', 'ears.size': 'Ears',
  'brows.up': 'Brow height', 'neck.wide': 'Neck',
};
const ANCESTRY_NAMES = { african: 'African', asian: 'East Asian', caucasian: 'European' };

export function defaultLook(bodyType) {
  return { skin: '#c8956e', hair: '#2a1d16', hairStyle: bodyType === 'female' ? 'long' : 'short', eyes: '#5a3b22',
    ancestry: { african: 1, asian: 1, caucasian: 1 }, face: null, sliders: {} };
}

let cssDone = false;
function css() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
  .hv-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y;cursor:grab;display:block}
  .hv-canvas:active{cursor:grabbing}
  .hv-hint{position:absolute;left:50%;top:12px;transform:translateX(-50%);font:600 11px var(--font-body,sans-serif);letter-spacing:.12em;
    text-transform:uppercase;color:var(--text-dim,#a4b0c2);pointer-events:none;transition:opacity .8s;z-index:4}
  .lc{position:fixed;inset:0;z-index:9000;background:var(--void,#05060a);display:flex;flex-direction:column;color:var(--text,#f2f5fa);
    font-family:var(--font-body,sans-serif)}
  .lc-stage{position:relative;flex:0 0 42vh;min-height:220px;background:radial-gradient(ellipse 70% 60% at 50% 40%,rgba(91,168,255,.10),transparent 70%)}
  .lc-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:10px 12px;z-index:5;
    padding-top:max(10px,env(safe-area-inset-top))}
  .lc-top h3{margin:0;font-size:13px}
  .lc-btn{background:var(--elevated,#161b25);color:var(--text,#f2f5fa);border:1px solid var(--rim,#1e2535);border-radius:10px;padding:8px 14px;
    font:600 14px var(--font-body,sans-serif);cursor:pointer}
  .lc-btn.primary{background:var(--brass,#5ba8ff);color:#05060a;border-color:transparent}
  .lc-frame{position:absolute;right:12px;bottom:10px;z-index:5;display:flex;gap:6px}
  .lc-panel{flex:1;overflow-y:auto;padding:12px 16px calc(24px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
  .lc-sec{margin:0 0 16px}
  .lc-sec h4{margin:0 0 8px;font:600 11px var(--font-body,sans-serif);letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint,#7e8ca3)}
  .lc-sw{display:flex;flex-wrap:wrap;gap:8px}
  .lc-sw button{width:34px;height:34px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
  .lc-sw button.on{border-color:var(--text,#f2f5fa);box-shadow:0 0 0 2px var(--brass,#5ba8ff)}
  .lc-sw input[type=color]{width:34px;height:34px;border:0;padding:0;background:none;border-radius:50%}
  .lc-chips{display:flex;flex-wrap:wrap;gap:6px}
  .lc-chips button{background:var(--surface,#10141c);color:var(--text-dim,#a4b0c2);border:1px solid var(--rim,#1e2535);border-radius:999px;
    padding:7px 12px;font:600 13px var(--font-body,sans-serif);cursor:pointer}
  .lc-chips button.on{color:var(--text,#f2f5fa);border-color:var(--brass,#5ba8ff);background:var(--brass-dim,rgba(91,168,255,.1))}
  .lc-row{display:grid;grid-template-columns:96px 1fr;align-items:center;gap:10px;margin:6px 0;font-size:14px;color:var(--text-dim,#a4b0c2)}
  .lc-row input{width:100%;accent-color:var(--brass,#5ba8ff)}
  .lc-note{font-size:12px;color:var(--text-faint,#7e8ca3);margin:4px 0 0}
  `;
  document.head.appendChild(s);
}

export async function mountHunterView(el, opts = {}) {
  css();
  const canvas = document.createElement('canvas');
  canvas.className = 'hv-canvas';
  canvas.setAttribute('aria-label', 'Your hunter in 3D. Drag sideways to turn.');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { throw new Error('webgl unavailable'); }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  applyEnvironment(renderer, scene, { intensity: 0.55 });
  // lit to read clearly: a warm key from the front, a soft fill, and a cool rim to cut the silhouette out of the dark card
  const key = new THREE.DirectionalLight(0xfff1e4, 2.3); key.position.set(1.6, 3, 3.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7); fill.position.set(-2.5, 1.2, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x8fbaff, 1.6); rim.position.set(-1.5, 2.5, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x221c2c, 0.55));
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);

  const h = await loadHunter(opts.bodyType);
  const pivot = new THREE.Group(); pivot.add(h.object); scene.add(pivot);
  el.appendChild(canvas);
  const hint = document.createElement('div'); hint.className = 'hv-hint'; hint.textContent = 'Drag to turn';
  if (opts.hint !== false) el.appendChild(hint);

  let yaw = 0.42, vel = 0, dragging = false, lastX = 0, raf = 0, framing = opts.framing || 'body';
  let current = { bodyType: opts.bodyType };
  const size = { w: 0, h: 0 };

  function frame() {
    const box = new THREE.Box3().setFromObject(h.object), hgt = box.max.y - box.min.y;
    const fov = THREE.MathUtils.degToRad(camera.fov), aspect = size.w / Math.max(1, size.h);
    let cy, span;
    const pad = opts.padTop || 0;   // a share of the view kept clear at the top (the creator's buttons)
    if (framing === 'face') { cy = box.max.y - hgt * 0.085; span = hgt * 0.27; }
    else { cy = box.min.y + hgt * 0.45; span = hgt * 1.16; }   // room below the feet for the card's buttons
    cy += span * pad / 2; span *= 1 + pad;
    // fit the span vertically, and the arms horizontally on a narrow screen
    const width = framing === 'face' ? span * 0.8 : (box.max.x - box.min.x) * 1.08;
    const dist = Math.max(span / 2 / Math.tan(fov / 2), width / 2 / Math.tan(fov / 2) / aspect);
    camera.position.set(0, cy + (framing === 'face' ? 0 : hgt * 0.02), dist);
    camera.lookAt(0, cy, 0);
  }
  function resize() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    size.w = r.width; size.h = r.height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    frame(); draw();
  }
  function draw() { pivot.rotation.y = yaw; renderer.render(scene, camera); }
  function tick() {
    raf = 0;
    if (!dragging) { yaw += vel; vel *= 0.92; }
    draw();
    if (dragging || Math.abs(vel) > 0.0005) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const down = (e) => { dragging = true; lastX = e.clientX; vel = 0; hint.style.opacity = 0; kick(); };
  const move = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    yaw += dx * 0.012; vel = dx * 0.012; kick();
  };
  const up = () => { dragging = false; kick(); };
  canvas.addEventListener('pointerdown', down);
  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  const ro = new ResizeObserver(resize); ro.observe(el);
  const lost = (e) => { e.preventDefault(); opts.onLost?.(); };
  canvas.addEventListener('webglcontextlost', lost);

  function update(next = {}) {
    if (next.weights) h.shape(next.weights);
    if (next.look) h.dress(next.look);
    if ('heat' in next || 'showHeat' in next) {
      current = { ...current, ...next };
      h.heat(current.showHeat ? current.heat || null : null);
    }
    if (next.framing) { framing = next.framing; yaw = framing === 'face' ? 0.3 : 0.42; vel = 0; }
    if (size.w) { frame(); draw(); }
  }
  update({ ...opts, heat: opts.heat, showHeat: !!opts.showHeat });
  resize();
  setTimeout(() => { hint.style.opacity = 0; }, 3500);

  return {
    bodyType: opts.bodyType,
    hairStyles: h.hairStyles,
    update,
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      h.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
      canvas.remove(); hint.remove();
    },
  };
}

/** The look creator. look: the saved look (or null for the default); morphs(look): the weights for a
 *  look (the app adds training and build to it); onSave(look) is called with the new look on Save. */
export async function openLookCreator({ bodyType, look, morphs, onSave }) {
  css();
  let L = JSON.parse(JSON.stringify({ ...defaultLook(bodyType), ...(look || {}) }));
  const root = document.createElement('div');
  root.className = 'lc';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Edit your look');
  root.innerHTML = `
    <div class="lc-stage" id="lc-stage">
      <div class="lc-top"><button class="lc-btn" data-act="cancel">Cancel</button><h3>YOUR LOOK</h3><button class="lc-btn primary" data-act="save">Save</button></div>
      <div class="lc-frame lc-chips"><button data-frame="face" class="on">Face</button><button data-frame="body">Body</button></div>
    </div>
    <div class="lc-panel" id="lc-panel"></div>`;
  document.body.appendChild(root);
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
  let view = null;
  const close = () => { view?.dispose(); root.remove(); document.body.style.overflow = prevOverflow; };
  root.querySelector('[data-act=cancel]').onclick = close;
  root.querySelector('[data-act=save]').onclick = () => { onSave?.(L); close(); };
  try {
    view = await mountHunterView(root.querySelector('#lc-stage'), { bodyType, weights: morphs(L), look: L, framing: 'face', hint: false, padTop: 0.12 });
  } catch (e) {
    root.querySelector('#lc-stage').insertAdjacentHTML('beforeend', '<p class="lc-note" style="padding:60px 16px">3D preview unavailable on this device.</p>');
  }
  root.querySelectorAll('[data-frame]').forEach((b) => { b.onclick = () => {
    root.querySelectorAll('[data-frame]').forEach((x) => x.classList.toggle('on', x === b));
    view?.update({ framing: b.dataset.frame });
  }; });
  const styles = ['none', ...(view?.hairStyles || Object.keys(HAIR_NAMES).slice(1))];
  const swatches = (key, list, custom) => `<div class="lc-sw">${list.map((c) => `<button data-k="${key}" data-v="${c}" style="background:${c}" class="${L[key] === c ? 'on' : ''}" aria-label="${c}"></button>`).join('')}${custom ? `<input type="color" data-k="${key}" value="${L[key]}" aria-label="Custom colour">` : ''}</div>`;
  const chips = (key, list, names) => `<div class="lc-chips">${list.map((v) => `<button data-k="${key}" data-v="${v}" class="${(L[key] ?? null) === v ? 'on' : ''}">${names[v] || v}</button>`).join('')}</div>`;
  const range = (group, k, label, min, max, step, val) => `<label class="lc-row"><span>${label}</span><input type="range" data-g="${group}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
  const panel = root.querySelector('#lc-panel');
  panel.innerHTML = `
    <div class="lc-sec"><h4>Skin</h4>${swatches('skin', SKIN_TONES, true)}</div>
    <div class="lc-sec"><h4>Hair</h4>${chips('hairStyle', styles, HAIR_NAMES)}<div style="height:10px"></div>${swatches('hair', HAIR_COLOURS, true)}</div>
    <div class="lc-sec"><h4>Eyes</h4>${swatches('eyes', EYE_COLOURS, true)}</div>
    <div class="lc-sec"><h4>Heritage</h4>${ANCESTRY.map((k) => range('ancestry', k, ANCESTRY_NAMES[k], 0, 1, 0.05, L.ancestry?.[k] ?? 1)).join('')}
      <p class="lc-note">Blends the bone structure of the face and body. Mix them for any background.</p></div>
    <div class="lc-sec"><h4>Face shape</h4>${chips('face', [null, ...FACE_SHAPES], { null: 'Average', ...FACE_NAMES })}</div>
    <div class="lc-sec"><h4>Features</h4>${FACE_SLIDERS.map((k) => range('sliders', k, SLIDER_NAMES[k] || k, -1, 1, 0.05, L.sliders?.[k] ?? 0)).join('')}</div>
    <div class="lc-sec"><button class="lc-btn" data-act="reset">Reset to average</button>
      <p class="lc-note">Your build, muscles and height come from your training, weigh-ins and check-ins. This sets how you look.</p></div>`;
  let pending = 0;
  const refresh = (reshape) => {
    if (!view) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => view.update(reshape ? { weights: morphs(L), look: L } : { look: L }));
  };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) {
      const k = b.dataset.k, v = b.dataset.v === 'null' ? null : b.dataset.v;
      L[k] = v;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      refresh(k === 'face');
    }
    if (e.target.closest('[data-act=reset]')) {
      const keep = { skin: L.skin, hair: L.hair, hairStyle: L.hairStyle, eyes: L.eyes };
      L = { ...defaultLook(bodyType), ...keep };
      panel.querySelectorAll('input[type=range]').forEach((r) => { r.value = r.dataset.g === 'ancestry' ? 1 : 0; });
      panel.querySelectorAll('button[data-k=face]').forEach((x) => x.classList.toggle('on', x.dataset.v === 'null'));
      refresh(true);
    }
  });
  panel.addEventListener('input', (e) => {
    const t = e.target;
    if (t.type === 'color') { L[t.dataset.k] = t.value; t.parentElement.querySelectorAll('button').forEach((x) => x.classList.remove('on')); refresh(false); }
    if (t.type === 'range') { L[t.dataset.g] = { ...(L[t.dataset.g] || {}), [t.dataset.k]: Number(t.value) }; refresh(true); }
  });
}
