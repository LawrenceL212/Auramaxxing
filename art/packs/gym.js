// packs/gym.js: the training floor. Equipment a Hunter actually lifts, drawn in the System's palette.
// Real sizes (1 unit = 1 metre): a 20 kg bar is 2.2 m with 450 mm plates.
import { cyl, rbox, sphere, torus } from '../kit.js';
import { define, adder, C, L } from '../parts.js';

const X = { rz: Math.PI / 2 }; // a cylinder lying along X

// one bumper plate: rubber disc, a coloured band on its face, a steel hub
function plate(add, x, y, r, t, band) {
  add(cyl(r, r, t, 28), C('palette.rubber'), { x, y, ...X, outline: 0.012 });
  add(cyl(r * 0.92, r * 0.92, t + 0.004, 28), C(band), { x, y, ...X, outline: 0 });
  add(cyl(r * 0.78, r * 0.78, t + 0.008, 28), C('palette.rubber'), { x, y, ...X, outline: 0 });
  add(cyl(0.05, 0.05, t + 0.016, 16), C('palette.steel'), { x, y, ...X, outline: 0 });
}

define('barbell', {
  category: 'prop', sector: 'gym', tiles: [3, 1],
  options: { load: ['blue', 'violet', 'gold', 'empty'] },
  build(g, { load }) {
    const add = adder(g);
    const r = 0.225, y = load === 'empty' ? 0.03 : r;
    add(cyl(0.014, 0.014, 1.31, 10), C('palette.steel'), { y, ...X, outline: 0.006 });
    for (const s of [-1, 1]) {
      add(cyl(0.025, 0.025, 0.42, 14), C('palette.steel'), { x: s * 0.865, y, ...X, outline: 0.008 });
      add(cyl(0.04, 0.04, 0.03, 14), C('palette.iron'), { x: s * 0.64, y, ...X, outline: 0.008 });
      if (load !== 'empty') {
        const band = { blue: 'palette.brass', violet: 'palette.violet', gold: 'rank.S' }[load];
        plate(add, s * 0.71, y, r, 0.07, band);
        plate(add, s * 0.79, y, r * 0.86, 0.06, band);
        add(cyl(0.045, 0.045, 0.04, 14), C('palette.iron'), { x: s * 0.845, y, ...X, outline: 0.008 }); // collar
      }
    }
  },
  shadow: { w: 2.4, d: 0.5 },
});

define('dumbbell', {
  category: 'prop', sector: 'gym', tiles: [1, 1],
  build(g) {
    const add = adder(g);
    const r = 0.085, y = r * Math.cos(Math.PI / 6); // a hex head rests on a flat
    add(cyl(0.02, 0.02, 0.3, 10), C('palette.steel'), { y, ...X, outline: 0.006 });
    for (const s of [-1, 1]) {
      add(cyl(r, r, 0.13, 6), C('palette.rubber'), { x: s * 0.215, y, ...X, outline: 0.012 });
      add(cyl(r * 0.55, r * 0.55, 0.134, 6), L('palette.brass', 0.5), { x: s * 0.215, y, ...X, outline: 0 });
      add(cyl(0.035, 0.035, 0.02, 12), C('palette.steel'), { x: s * 0.14, y, ...X, outline: 0.005 });
    }
  },
  shadow: { w: 0.7, d: 0.3 },
});

define('kettlebell', {
  category: 'prop', sector: 'gym', tiles: [1, 1],
  options: { finish: ['iron', 'violet', 'gold'] },
  build(g, { finish }) {
    const add = adder(g);
    const mat = finish === 'iron' ? C('palette.iron') : finish === 'violet' ? C('palette.violet') : C('rank.S');
    add(sphere(0.15, 22, 16), mat, { y: 0.15, s: [1, 0.92, 1], outline: 0.012 });
    add(cyl(0.11, 0.11, 0.02, 20), mat, { y: 0.01, outline: 0.008 }); // flat base
    add(torus(0.085, 0.022, 8, 20, Math.PI), mat, { y: 0.27, outline: 0.008 });
    for (const s of [-1, 1]) add(cyl(0.022, 0.022, 0.05, 8), mat, { x: s * 0.085, y: 0.25, outline: 0.008 });
    add(rbox(0.07, 0.035, 0.01, 0.004), L('palette.brass', 0.6), { y: 0.16, z: 0.147, outline: 0 }); // weight plate on its face
  },
  shadow: { w: 0.45, d: 0.45 },
});

define('flat-bench', {
  category: 'prop', sector: 'gym', tiles: [2, 1],
  build(g) {
    const add = adder(g);
    add(rbox(1.2, 0.09, 0.3, 0.035), C('palette.pad'), { y: 0.45, outline: 0.012 });
    add(rbox(1.16, 0.015, 0.26, 0.005), L('palette.brass', 0.35), { y: 0.4, outline: 0 }); // the light seam under the pad
    add(rbox(1.0, 0.06, 0.08, 0.01), C('palette.iron'), { y: 0.37, outline: 0.01 });
    for (const s of [-1, 1]) {
      add(rbox(0.07, 0.34, 0.07, 0.01), C('palette.iron'), { x: s * 0.46, y: 0.2, outline: 0.01 });
      add(rbox(0.1, 0.05, 0.46, 0.015), C('palette.iron'), { x: s * 0.46, y: 0.025, outline: 0.01 });
      add(cyl(0.03, 0.03, 0.03, 8), C('palette.rubber'), { x: s * 0.46, y: 0.015, z: 0.2, outline: 0 });
      add(cyl(0.03, 0.03, 0.03, 8), C('palette.rubber'), { x: s * 0.46, y: 0.015, z: -0.2, outline: 0 });
    }
  },
  shadow: { w: 1.4, d: 0.6 },
});
