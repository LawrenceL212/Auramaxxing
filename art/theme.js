// theme.js: every colour and lighting constant of the art pack lives in this one object.
//
// The palette mirrors the app's CSS tokens in index.html (:root, lines 17-49), so a 3D asset
// and the card it sits on share one look. Change a token there, change it here.
//
//   get('palette.violet')            read a value by dotted path
//   set('light.key', 2.2)            change one live; materials made with kit.themed() follow
//   onThemeChange((path) => ...)     path is the key that changed, or null after reset()
//   reset()                          back to DEFAULTS
//
// Presentation only: nothing here reads or writes progression state.

export const DEFAULTS = {
  palette: {
    void: '#05060a',      // --void: page base
    deep: '#0a0d13',      // --deep
    surface: '#10141c',   // --surface: card background
    rim: '#1e2535',       // --rim: borders, dark trims
    text: '#f2f5fa',      // --text
    brass: '#5ba8ff',     // --brass: the System blue (named brass for history)
    violet: '#a17fff',    // --violet
    growing: '#6fffb0',   // --growing: success
    excess: '#ff4d67',    // --excess: danger
    // materials
    iron: '#3d4761',      // dark metal: grips, frames, bars (lifted off near-black so it reads)
    steel: '#b9c3d6',     // bright metal: plates' rims, collars, chrome
    rubber: '#1b1f29',    // bumper plates, handles' rubber
    leather: '#6b4a3a',   // straps, bench pads' stitching
    pad: '#2a3550',       // upholstery
    stone: '#3a4258',     // gate frames, plinths
    shadow: '#2a2448',    // shadow soldiers: dark violet, light enough that the toon bands still read
    skin: '#e8b996',
    bone: '#cfc4b0',      // horns, claws, crowns
    hide: '#2c2340',      // the raid boss's armoured hide, a step lighter than shadow
  },
  // --rank-e .. --rank-s
  rank: { E: '#6b7894', D: '#5ba8ff', C: '#2fb8c6', B: '#a17fff', A: '#ff6b35', S: '#ffd66b' },
  // the rarity palette of showDungeonClearModal / REWARD_RARITY in index.html
  rarity: { Common: '#a0a0a0', Uncommon: '#4ecd78', Rare: '#5ba8ff', Epic: '#8b5cff', Legendary: '#ffd66b' },
  rarityGlow: { Common: 0.15, Uncommon: 0.3, Rare: 0.45, Epic: 0.65, Legendary: 0.9 },
  light: { key: 3.0, keyColor: '#d0deff', hemi: 1.6, rim: 2.4, rimColor: '#8b5cff', exposure: 1.3, contact: 0.65 },
  toggles: { outlines: true, toon: true, glow: true },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
let state = clone(DEFAULTS);
const listeners = new Set();

export function get(path) {
  let o = state;
  for (const k of path.split('.')) {
    if (o == null || !(k in o)) throw new Error(`theme: unknown path "${path}"`);
    o = o[k];
  }
  return o;
}

export function set(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let o = state;
  for (const k of keys) {
    if (o == null || typeof o[k] !== 'object') throw new Error(`theme: unknown path "${path}"`);
    o = o[k];
  }
  if (!(last in o)) throw new Error(`theme: unknown path "${path}"`);
  o[last] = value;
  listeners.forEach((fn) => fn(path));
}

export function reset() {
  state = clone(DEFAULTS);
  listeners.forEach((fn) => fn(null));
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
