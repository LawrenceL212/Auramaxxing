// models/index.js: the authored models (.glb) in the pack. Put the file in art/models/, add an
// entry here, and check it in /art/catalogue.html. See art/MODELS.md for sourcing, sizes and licences.
//
// The Monarch: the raid boss, sculpted, textured and rigged in Blender from the scripts in
// models/src/monarch/ (python3.11 -m pip install bpy; python3.11 build.py --bake --out monarch.glb).
// 59k triangles, one 2K texture set (colour, normal, occlusion/roughness/metal) plus a 1K glow map,
// clips Idle and Roar. Its eyes and chest rift carry extras.eye, so the raid recolours them.
//
// One boss per raid tier, built the same way from models/src/bosses/ (a shared kit, one script each).
// They replace 'raid-boss:<tier>'; the raid shows the tier's boss once it has loaded, else the Monarch.
// The Monarch stands for tier A ("Monarch's Shadow") and for any raid without a tier.
import { defineModel } from '../models.js';

const BOSS = { category: 'hero', sector: 'dungeon', clips: { idle: 'Idle', roar: 'Roar' },
  credit: 'Original work for Auramaxxing (art/models/src/bosses)', licence: 'Same terms as this repository' };

defineModel('monarch', {
  url: './models/monarch.glb',
  height: 6.8,                     // the old raid boss stood about 6.8 units
  category: 'hero',
  sector: 'dungeon',
  tiles: [3, 2],
  replaces: 'raid-boss',
  clips: { idle: 'Idle', roar: 'Roar' },
  credit: 'Original work for Auramaxxing (art/models/src/monarch)',
  licence: 'Same terms as this repository',
});

defineModel('goblin-scout', { ...BOSS, url: './models/goblin.glb', height: 3.4, tiles: [2, 2], replaces: 'raid-boss:E' });
defineModel('stone-golem', { ...BOSS, url: './models/golem.glb', height: 6.6, tiles: [3, 3], replaces: 'raid-boss:D' });
defineModel('iron-shadow', { ...BOSS, url: './models/iron-shadow.glb', height: 7.0, tiles: [3, 2], replaces: 'raid-boss:C' });
defineModel('void-warden', { ...BOSS, url: './models/void-warden.glb', height: 7.4, tiles: [3, 3], replaces: 'raid-boss:B' });
defineModel('antares', { ...BOSS, url: './models/antares.glb', height: 7.0, tiles: [4, 3], replaces: 'raid-boss:S' });
