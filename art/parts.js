// parts.js: the helpers every pack builds its assets with.
//
//   define(id, def)       registers an asset whose def.build(g, opts) fills a group; adds the contact
//                         shadow last (def.shadow: { w, d, opacity } or false; default: the footprint)
//   adder(g) -> add(geo, material, o)   kit.part() with parent g
//   C(path) / L(path, ei)              kit.themed / kit.themedGlow, short names for build code
//   RANKS, RARITIES                    the option lists most packs offer
//   letterTex(text, color)             a canvas texture of one rank letter in the app's display style
import * as THREE from 'three';
import { register } from './registry.js';
import { part, themed, themedGlow, contactShadow, canvasTex } from './kit.js';

export const RANKS = Object.freeze(['E', 'D', 'C', 'B', 'A', 'S']);
export const RARITIES = Object.freeze(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
export const C = themed;
export const L = themedGlow;

export function define(id, def) {
  const { shadow = {}, build, ...rest } = def;
  register(id, {
    ...rest,
    build(opts) {
      const g = new THREE.Group();
      g.name = id;
      build(g, opts || {});
      if (shadow !== false) {
        const [w, d] = def.tiles;
        contactShadow(g, { w: shadow.w ?? w * 0.9, d: shadow.d ?? d * 0.9, opacity: shadow.opacity ?? 1 });
      }
      return g;
    },
  });
}

export const adder = (g) => (geo, mat, o = {}) => part(geo, mat, { ...o, parent: o.parent || g });

// Orbitron is the app's display face; it may not be loaded where the catalogue runs, so the stack falls back.
const DISPLAY = '"Orbitron", "Rajdhani", system-ui, sans-serif';
const letters = new Map();
export function letterTex(text, color) {
  const k = `${text}|${color}`;
  if (!letters.has(k)) {
    letters.set(k, canvasTex(256, 256, (g, w, h) => {
      g.font = `900 180px ${DISPLAY}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 28;
      g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 8);
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText(text, w / 2, h / 2 + 8);
    }));
  }
  return letters.get(k);
}
