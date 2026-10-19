// packs/equipment.js: the four reward slots (weapon, armour, boots, accessory) as relics.
//
// The toon successors of createItemMesh() in index.html. Each relic floats over a sigil in its
// rarity colour; rarity drives the colour of the metal's accents, how hard they glow and the halo,
// nothing else. The floating part is the child named 'float' (anim 'hover' bobs and turns it).
// userData.anchor names the Hunter attach point, the same names createItemMesh uses.
import * as THREE from 'three';
import { cyl, cone, rbox, sphere, torus, oct, ico, glow, canvasTex } from '../kit.js';
import { get as tget } from '../theme.js';
import { define, adder, C, L, RARITIES } from '../parts.js';

const HOVER_Y = 0.95;
const sigilGeo = new THREE.PlaneGeometry(0.9, 0.9);
const sigilMats = new Map(); // one per colour, shared by every build

const sigils = new Map();
function sigilTex() {
  if (!sigils.has('s')) {
    sigils.set('s', canvasTex(256, 256, (g, w) => {
      const c = w / 2;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 6; g.beginPath(); g.arc(c, c, 118, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.arc(c, c, 100, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * 96, c + Math.sin(a) * 96); }
      g.stroke();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(c + Math.cos(a) * 109 - 3, c + Math.sin(a) * 109 - 3, 6, 6); }
    }));
  }
  return sigils.get('s');
}

// The pieces every relic shares: the floor sigil, the halo, and the float group the item is built in.
function relic(g, rarity, anchor) {
  const col = tget(`rarity.${rarity}`);
  if (!sigilMats.has(col)) sigilMats.set(col, new THREE.MeshBasicMaterial({
    map: sigilTex(), color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const sig = new THREE.Mesh(sigilGeo, sigilMats.get(col));
  sig.rotation.x = -Math.PI / 2; sig.position.y = 0.004; sig.name = 'sigil';
  g.add(sig);
  const f = new THREE.Group();
  f.name = 'float'; f.position.y = HOVER_Y;
  g.add(f);
  f.add(Object.assign(glow(col, 0.9 + tget(`rarityGlow.${rarity}`) * 0.9, 0.25 + tget(`rarityGlow.${rarity}`) * 0.35), { name: 'halo' }));
  g.userData.anchor = anchor;
  g.userData.rarity = rarity;
  return { f, add: adder(f), metal: L(`rarity.${rarity}`, tget(`rarityGlow.${rarity}`)), gem: L(`rarity.${rarity}`, 1.2) };
}

const hover = (o, t) => {
  const f = o.getObjectByName('float');
  if (f) { f.position.y = HOVER_Y + Math.sin(t * 1.6) * 0.05; f.rotation.y = t * 0.7; }
  const s = o.getObjectByName('sigil');
  if (s) s.rotation.z = -t * 0.25;
};
const common = { category: 'equipment', sector: 'equipment', tiles: [1, 1], options: { rarity: RARITIES }, anims: { hover }, shadow: { w: 0.5, d: 0.5, opacity: 0.6 } };

define('relic-sword', {
  ...common,
  build(g, { rarity }) {
    const { add, metal, gem } = relic(g, rarity, 'hand.R');
    // a flat blade: a four-sided cylinder squashed on Z gives a diamond section that catches the rim light
    add(cyl(0.05, 0.075, 0.62, 4), C('palette.steel'), { y: 0.2, ry: Math.PI / 4, s: [1, 1, 0.3], outline: 0.008 });
    add(cone(0.05, 0.16, 4), C('palette.steel'), { y: 0.59, ry: Math.PI / 4, s: [1, 1, 0.3], outline: 0.008 });
    add(rbox(0.012, 0.5, 0.014, 0.004), metal, { y: 0.2, z: 0.012, outline: 0 }); // the fuller, lit
    add(rbox(0.3, 0.05, 0.07, 0.02), metal, { y: -0.13, outline: 0.01 });
    for (const s of [-1, 1]) add(oct(0.04), metal, { x: s * 0.17, y: -0.13, s: [1.3, 0.8, 0.8], outline: 0.008 });
    add(cyl(0.028, 0.032, 0.22, 10), C('palette.leather'), { y: -0.27, outline: 0.008 });
    add(oct(0.05), gem, { y: -0.41, s: [1, 1.2, 1], outline: 0.008 });
  },
});

define('relic-chestplate', {
  ...common,
  build(g, { rarity }) {
    const { add, metal, gem } = relic(g, rarity, 'chest');
    // a tapered, eight-sided cuirass: the facets give the toon bands edges to break on
    add(cyl(0.2, 0.15, 0.4, 8), C('palette.steel'), { y: 0, ry: Math.PI / 8, s: [1, 1, 0.62], outline: 0.012 });
    add(cyl(0.155, 0.17, 0.06, 8), metal, { y: -0.22, ry: Math.PI / 8, s: [1, 1, 0.66], outline: 0.01 });  // the faulds
    add(cyl(0.135, 0.15, 0.05, 8), C('palette.iron'), { y: -0.27, ry: Math.PI / 8, s: [1, 1, 0.66], outline: 0.008 });
    add(torus(0.085, 0.022, 6, 16), metal, { y: 0.2, rx: Math.PI / 2, s: [1, 0.7, 1], outline: 0.008 }); // the gorget
    add(oct(0.05), C('palette.steel'), { y: 0.04, z: 0.115, s: [0.6, 3.2, 0.5], outline: 0.008 });          // the keel down the front
    for (const s of [-1, 1]) {
      // pauldrons: two lames, the lower one smaller, both tipped off the shoulder
      add(sphere(0.11, 14, 8), C('palette.steel'), { x: s * 0.24, y: 0.16, rz: -s * 0.35, s: [1.25, 0.55, 1.05], outline: 0.01 });
      add(sphere(0.095, 14, 8), C('palette.steel'), { x: s * 0.28, y: 0.09, rz: -s * 0.5, s: [1.15, 0.45, 0.95], outline: 0.01 });
      add(torus(0.11, 0.01, 6, 18), metal, { x: s * 0.24, y: 0.165, rx: Math.PI / 2, rz: -s * 0.35, s: [1.25, 1.05, 1], outline: 0 });
    }
    add(ico(0.04, 0), gem, { y: 0.1, z: 0.125, outline: 0.008 });
  },
});

define('relic-boots', {
  ...common,
  build(g, { rarity }) {
    const { add, metal, gem } = relic(g, rarity, 'feet');
    for (const s of [-1, 1]) {
      const x = s * 0.11;
      add(cyl(0.06, 0.065, 0.24, 12), C('palette.steel'), { x, y: 0.05, outline: 0.01 });
      add(rbox(0.13, 0.08, 0.24, 0.035), C('palette.steel'), { x, y: -0.1, z: 0.05, outline: 0.01 });
      add(rbox(0.14, 0.025, 0.26, 0.01), C('palette.rubber'), { x, y: -0.15, z: 0.05, outline: 0.008 });
      add(torus(0.064, 0.012, 6, 16), metal, { x, y: 0.16, rx: Math.PI / 2, outline: 0 });
      for (const k of [0, 1]) add(rbox(0.012, 0.012, 0.09, 0.004), metal, { x: x + s * 0.068, y: 0.15 - k * 0.04, z: -0.02, ry: s * 0.2, rz: s * 0.5, outline: 0 }); // wings
      add(oct(0.022), gem, { x, y: -0.08, z: 0.17, outline: 0 });
    }
  },
});

define('relic-ring', {
  ...common,
  build(g, { rarity }) {
    const { add, metal, gem } = relic(g, rarity, 'orbit');
    add(torus(0.17, 0.035, 10, 32), metal, { rx: 0.25, outline: 0.01 });
    add(torus(0.17, 0.012, 6, 32), C('palette.steel'), { rx: 0.25, z: 0.03, outline: 0 });
    add(cyl(0.05, 0.06, 0.05, 6), C('palette.steel'), { y: 0.2, outline: 0.008 }); // setting
    add(oct(0.075), gem, { y: 0.27, s: [1, 1.25, 1], outline: 0.01 });
  },
});
