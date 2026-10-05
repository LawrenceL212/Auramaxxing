// kit.js: the procedural building blocks every art pack builds with. Zero image assets:
// everything here is code, so nothing can 404 and the whole pack weighs a few kilobytes.
//
// Ported from Grimoire's game/engine/kit.js (same author), trimmed to what the packs use.
//
//   toon(color, opts)            a cached MeshToonMaterial on the shared stepped ramp
//   themed(path)                 a toon material whose colour follows theme.get(path), live
//   themedGlow(path, ei)         the same, lit from inside (emissive = its own colour)
//   rbox sphere capsule cyl cone ico oct torus   cached geometry (rbox(w, h, d, r, seg))
//   part(geo, mat, { x, y, z, rx, ry, rz, s, outline, cast, parent })  one mesh with an ink outline
//   setOutlines(on) / setToon(scene, on)          the two style toggles
//   canvasTex(w, h, draw)        a CanvasTexture drawn by draw(ctx, w, h)
//   glow(color, size, opacity)   an additive sprite halo
//   contactShadow(group, { w, d, opacity })      a soft blob under an object, on the floor
//   ease, lerp, damp             animation helpers
//
// The outline is an inverted hull: the same geometry pushed out along its normals and drawn
// back-faces only, in ink. It costs one extra draw per part and needs no post-processing,
// which is what keeps this cheap enough for a phone.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { get as themeGet, onThemeChange } from './theme.js';

export const INK = 0x07080d;

// ---------- toon materials ----------
// Four light bands and a floor at 100/255, so shadowed sides keep their colour instead of going black.
const ramp = new Uint8Array([100, 150, 200, 255]);
export const gradientMap = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;
gradientMap.needsUpdate = true;

const smooth = new Uint8Array(64).map((_, i) => 70 + Math.round((i / 63) * 185));
export const smoothRamp = new THREE.DataTexture(smooth, smooth.length, 1, THREE.RedFormat);
smoothRamp.minFilter = smoothRamp.magFilter = THREE.LinearFilter;
smoothRamp.needsUpdate = true;

const matCache = new Map();
export function toon(color, { emissive = 0x000000, ei = 1, side = THREE.FrontSide } = {}) {
  const k = `${color}|${emissive}|${ei}|${side}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshToonMaterial({ color, gradientMap, emissive, emissiveIntensity: ei, side }));
  return matCache.get(k);
}

const themedMats = new Map();
export function themed(path) {
  if (!themedMats.has(path)) {
    const m = new THREE.MeshToonMaterial({ color: themeGet(path), gradientMap });
    themedMats.set(path, m);
    onThemeChange((p) => { if (!p || p === path) m.color.set(themeGet(path)); });
  }
  return themedMats.get(path);
}

const glowMats = new Map();
export function themedGlow(path, ei = 0.6) {
  const k = `${path}|${ei}`;
  if (!glowMats.has(k)) {
    const c = themeGet(path);
    const m = new THREE.MeshToonMaterial({ color: c, emissive: c, emissiveIntensity: ei, gradientMap });
    glowMats.set(k, m);
    onThemeChange((p) => { if (!p || p === path) { m.color.set(themeGet(path)); m.emissive.set(themeGet(path)); } });
  }
  return glowMats.get(k);
}

// ---------- geometry cache: one geometry per shape and size, shared by every build ----------
const geoCache = new Map();
function cached(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
// seg 2 (the default, ~300 triangles) rounds an edge; seg 1 (~108) chamfers it, for small or repeated parts
export const rbox = (w, h, d, r = 0.04, seg = 2) => cached(`rb${w},${h},${d},${r},${seg}`, () =>
  new RoundedBoxGeometry(w, h, d, seg, Math.max(0.001, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))));
export const sphere = (r, ws = 18, hs = 14) => cached(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const capsule = (r, l, rs = 12) => cached(`cp${r},${l},${rs}`, () => new THREE.CapsuleGeometry(r, l, 4, rs));
export const cyl = (rt, rb, h, s = 16, open = false) => cached(`cy${rt},${rb},${h},${s},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open));
export const cone = (r, h, s = 16) => cached(`co${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s, 1));
export const ico = (r, d = 0) => cached(`ic${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
export const oct = (r) => cached(`oc${r}`, () => new THREE.OctahedronGeometry(r, 0));
export const torus = (r, t, rs = 8, ts = 24, arc = Math.PI * 2) => cached(`to${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));

// ---------- inverted-hull outline ----------
const outlineMats = new Map();
export function outlineMat(th = 0.02) {
  if (!outlineMats.has(th)) {
    outlineMats.set(th, new THREE.ShaderMaterial({
      uniforms: { th: { value: th }, color: { value: new THREE.Color(INK) } },
      vertexShader: `uniform float th;
        void main(){ vec3 p = position + normalize(normal) * th;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }`,
      side: THREE.BackSide,
    }));
  }
  return outlineMats.get(th);
}
export function setOutlines(on) { outlineMats.forEach((m) => { m.visible = on; }); }

// toon on: the stepped ramp; off: a smooth ramp (reads like soft Lambert shading)
export function setToon(scene, on) {
  scene.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (m.isMeshToonMaterial && (m.gradientMap === gradientMap || m.gradientMap === smoothRamp)) {
        m.gradientMap = on ? gradientMap : smoothRamp;
        m.needsUpdate = true;
      }
    }
  });
}

// part(): one mesh, positioned, shadowed, outlined unless outline is 0 or false.
export function part(geo, material, o = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  if (o.s !== undefined) Array.isArray(o.s) ? m.scale.set(...o.s) : m.scale.setScalar(o.s);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  if (o.outline !== 0 && o.outline !== false) {
    const th = o.outline ?? 0.018;
    const ol = new THREE.Mesh(geo, outlineMat(th));
    ol.userData.outlineChild = true;
    ol.raycast = () => {};
    m.add(ol);
  }
  if (o.parent) o.parent.add(m);
  return m;
}

// ---------- canvas textures and glows ----------
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _glowTex = null, _blobTex = null;
function radial(stops) {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}
const glowTex = () => (_glowTex ||= radial([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]));
const blobTex = () => (_blobTex ||= radial([[0, 'rgba(0,0,0,0.85)'], [0.6, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]));

export function glow(color, size, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  s.userData.glow = true;
  return s;
}

// A soft dark blob on the floor (y = 0.002) under an object, multiply-blended, never outlined.
const blobGeo = new THREE.PlaneGeometry(1, 1);
export function contactShadow(group, { w = 1, d = 1, opacity = 1 } = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: opacity * themeGet('light.contact') });
  onThemeChange(() => { mat.opacity = opacity * themeGet('light.contact'); });
  const m = new THREE.Mesh(blobGeo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.scale.set(w, d, 1);
  m.renderOrder = -1;
  m.castShadow = m.receiveShadow = false;
  m.userData.contactShadow = true;
  group.add(m);
  return m;
}

// ---------- animation helpers ----------
export const ease = {
  linear: (k) => k,
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  back: (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
};
export const lerp = (a, b, k) => a + (b - a) * k;
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
