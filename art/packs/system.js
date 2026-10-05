// packs/system.js: the System's own objects. A dungeon gate, a rank emblem, a shadow soldier.
// Rank drives colour (theme rank.E .. rank.S) and, for the gate, how fierce the swirl is.
import * as THREE from 'three';
import { cyl, cone, rbox, sphere, torus, oct, capsule, glow, canvasTex } from '../kit.js';
import { get as tget } from '../theme.js';
import { define, adder, C, L, RANKS, letterTex } from '../parts.js';

// ---- the gate ----
let swirl = null;
function swirlTex() {
  return swirl ||= canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const bg = g.createRadialGradient(c, c, 0, c, c, c);
    bg.addColorStop(0, 'rgba(255,255,255,0.95)'); bg.addColorStop(0.35, 'rgba(160,160,160,0.75)'); bg.addColorStop(1, 'rgba(30,30,30,1)');
    g.fillStyle = bg; g.fillRect(0, 0, w, w);
    g.lineCap = 'round';
    for (let arm = 0; arm < 5; arm++) {
      g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const k = i / 60, a = arm * (Math.PI * 2 / 5) + k * 4.2, r = 8 + k * 118;
        g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 10; g.stroke();
    }
  });
}

define('dungeon-gate', {
  category: 'structure', sector: 'dungeon', tiles: [3, 1],
  options: { rank: RANKS },
  build(g, { rank }) {
    const add = adder(g);
    const col = tget(`rank.${rank}`);
    const R = 1.05, cy = 1.3;
    // stone: a plinth, the ring, and the keystones around it
    add(rbox(2.5, 0.2, 0.7, 0.05), C('palette.stone'), { y: 0.1, outline: 0.016 });
    add(rbox(2.2, 0.12, 0.55, 0.04), C('palette.stone'), { y: 0.26, outline: 0.014 });
    add(torus(R, 0.13, 10, 40), C('palette.stone'), { y: cy, outline: 0.018 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.PI / 2;
      add(rbox(0.22, 0.2, 0.34, 0.03, 1), C('palette.stone'), { x: Math.cos(a) * (R + 0.09), y: cy + Math.sin(a) * (R + 0.09), rz: a, outline: 0.014 });
      add(oct(0.06), L(`rank.${rank}`, 0.9), { x: Math.cos(a) * (R + 0.2), y: cy + Math.sin(a) * (R + 0.2), z: 0.12, outline: 0 });
    }
    add(torus(R - 0.1, 0.025, 6, 40), L(`rank.${rank}`, 1.1), { y: cy, z: 0.05, outline: 0 });
    // the rift: a disc of the swirl tinted in the rank colour, turned by anim 'swirl'
    const rift = new THREE.Mesh(new THREE.CircleGeometry(R - 0.1, 48), new THREE.MeshBasicMaterial({ map: swirlTex(), color: col, side: THREE.DoubleSide }));
    rift.position.set(0, cy, 0); rift.name = 'rift';
    g.add(rift);
    const halo = glow(col, 3.4, 0.35); halo.position.set(0, cy, -0.1); halo.name = 'halo';
    g.add(halo);
    g.userData.fierce = RANKS.indexOf(rank) / (RANKS.length - 1);
    // the rank letter on the plinth's face
    const letter = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: letterTex(rank, col), transparent: true, depthWrite: false }));
    letter.position.set(0, 0.11, 0.352);
    g.add(letter);
  },
  anims: {
    swirl(o, t) {
      const f = o.userData.fierce ?? 0.5;
      const rift = o.getObjectByName('rift'); if (rift) rift.rotation.z = -t * (0.6 + f * 1.6);
      const halo = o.getObjectByName('halo'); if (halo) halo.material.opacity = 0.28 + 0.12 * Math.sin(t * (2 + f * 3));
    },
  },
  shadow: { w: 2.7, d: 0.9 },
});

// ---- the rank emblem: a crystal over a plinth carrying the letter ----
define('rank-emblem', {
  category: 'emblem', sector: 'system', tiles: [1, 1],
  options: { rank: RANKS },
  build(g, { rank }) {
    const add = adder(g);
    const col = tget(`rank.${rank}`);
    add(cyl(0.32, 0.36, 0.14, 6), C('palette.stone'), { y: 0.07, outline: 0.012 });
    add(cyl(0.26, 0.3, 0.1, 6), C('palette.rim'), { y: 0.19, outline: 0.01 });
    add(torus(0.27, 0.012, 6, 6), L(`rank.${rank}`, 1), { y: 0.24, rx: Math.PI / 2, ry: Math.PI / 6, outline: 0 });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: letterTex(rank, col), transparent: true, depthWrite: false }));
    card.position.set(0, 0.075, 0.33);
    g.add(card);
    const f = new THREE.Group(); f.name = 'float'; f.position.y = 0.85; g.add(f);
    const fa = adder(f);
    fa(oct(0.2), L(`rank.${rank}`, 0.55), { s: [0.85, 1.55, 0.85], outline: 0.014 });
    fa(torus(0.3, 0.01, 6, 40), L(`rank.${rank}`, 1.2), { rx: Math.PI / 2 + 0.3, outline: 0, cast: false });
    fa(torus(0.36, 0.008, 6, 40), L(`rank.${rank}`, 1.2), { rx: Math.PI / 2 - 0.4, rz: 0.5, outline: 0, cast: false });
    f.add(glow(col, 1.3, 0.45));
  },
  anims: {
    hover(o, t) {
      const f = o.getObjectByName('float');
      if (f) { f.position.y = 0.85 + Math.sin(t * 1.4) * 0.05; f.children[0].rotation.y = t * 0.9; f.children[1].rotation.z = t * 0.6; f.children[2].rotation.y = -t * 0.5; }
    },
  },
  shadow: { w: 0.8, d: 0.8 },
});

// ---- the shadow soldier: an extracted shadow, standing guard ----
// No skeleton yet: the parts are rigid and anim 'breathe' moves them. The rigged body is the
// next phase (Grimoire's people/rig.js is the model for it).
define('shadow-soldier', {
  category: 'character', sector: 'army', tiles: [1, 1],
  options: { eyes: ['violet', 'blue', 'gold'] },
  build(g, { eyes }) {
    const add = adder(g);
    const body = C('palette.shadow');
    const trim = C('palette.rim');
    const eye = L({ violet: 'palette.violet', blue: 'palette.brass', gold: 'rank.S' }[eyes], 2.2);
    const upper = new THREE.Group(); upper.name = 'upper'; upper.position.y = 0.95; g.add(upper);
    const up = adder(upper);
    for (const s of [-1, 1]) {
      add(capsule(0.075, 0.6), body, { x: s * 0.11, y: 0.43, outline: 0.016 });              // legs
      add(rbox(0.13, 0.08, 0.24, 0.03), trim, { x: s * 0.11, y: 0.05, z: 0.04, outline: 0.012 }); // sabatons
      add(sphere(0.07, 12, 8), trim, { x: s * 0.11, y: 0.48, z: 0.05, outline: 0.01 });          // knee guards
      up(capsule(0.06, 0.42), body, { x: s * 0.29, y: 0.12, rz: s * 0.12, outline: 0.016 });    // arms
      up(sphere(0.12, 14, 10), trim, { x: s * 0.24, y: 0.42, s: [1.1, 0.8, 1.1], outline: 0.014 }); // pauldrons
      up(cone(0.04, 0.16, 6), trim, { x: s * 0.29, y: 0.53, rz: -s * 0.4, outline: 0.008 });    // pauldron spikes
    }
    add(rbox(0.36, 0.14, 0.22, 0.05), body, { y: 0.88, outline: 0.016 });                      // hips
    up(capsule(0.17, 0.2, 14), body, { y: 0.25, s: [1.2, 1, 0.8], outline: 0.018 });            // chest
    up(rbox(0.04, 0.24, 0.03, 0.01), L('palette.violet', 0.6), { y: 0.27, z: 0.14, outline: 0 }); // the seam of the breastplate
    const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.66; upper.add(head);
    const hd = adder(head);
    hd(sphere(0.13, 16, 12), body, { s: [1, 1.12, 1.05], outline: 0.016 });
    hd(rbox(0.2, 0.05, 0.05, 0.02), trim, { y: 0.0, z: 0.12, outline: 0.008 }); // visor brow
    for (const s of [-1, 1]) {
      hd(cone(0.035, 0.24, 6), trim, { x: s * 0.1, y: 0.15, z: -0.02, rz: -s * 0.55, outline: 0.01 }); // horns
      hd(sphere(0.022, 8, 6), eye, { x: s * 0.05, y: -0.03, z: 0.12, s: [1.4, 0.7, 0.5], outline: 0 });
    }
    // the blade, point down at its right side, the hand on the grip
    up(rbox(0.05, 0.7, 0.012, 0.006), C('palette.steel'), { x: 0.33, y: -0.55, z: 0.1, outline: 0.008 });
    up(rbox(0.2, 0.035, 0.05, 0.01), trim, { x: 0.33, y: -0.19, z: 0.1, outline: 0.008 });
    up(cyl(0.022, 0.022, 0.12, 8), C('palette.leather'), { x: 0.33, y: -0.12, z: 0.1, outline: 0.006 });
    // smoke at the feet: a dark halo and a lit one, both additive-free so it reads on any background
    const smoke = glow(tget({ violet: 'palette.violet', blue: 'palette.brass', gold: 'rank.S' }[eyes]), 1.1, 0.22);
    smoke.position.y = 0.15; smoke.name = 'smoke'; g.add(smoke);
  },
  anims: {
    breathe(o, t) {
      const u = o.getObjectByName('upper'); if (u) { u.position.y = 0.95 + Math.sin(t * 1.8) * 0.012; u.scale.set(1 + Math.sin(t * 1.8) * 0.008, 1, 1); }
      const h = o.getObjectByName('head'); if (h) h.rotation.y = Math.sin(t * 0.5) * 0.25;
      const s = o.getObjectByName('smoke'); if (s) s.material.opacity = 0.18 + 0.08 * Math.sin(t * 2.3);
    },
  },
  shadow: { w: 0.8, d: 0.8 },
});
