// models/index.js: the authored models (.glb) in the pack. Put the file in art/models/, add an
// entry here, and check it in /art/catalogue.html. See art/MODELS.md for sourcing, sizes and licences.
//
// The Monarch: the raid boss, sculpted, textured and rigged in Blender from the scripts in
// models/src/monarch/ (python3.11 -m pip install bpy; python3.11 build.py --bake --out monarch.glb).
// 59k triangles, one 2K texture set (colour, normal, occlusion/roughness/metal) plus a 1K glow map,
// clips Idle and Roar. Its eyes and chest rift carry extras.eye, so the raid recolours them.
import { defineModel } from '../models.js';

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
