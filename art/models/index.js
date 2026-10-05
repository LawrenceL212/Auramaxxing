// models/index.js: the authored models (.glb) in the pack. Put the file in art/models/, add an
// entry here, and check it in /art/catalogue.html. See art/MODELS.md for sourcing, sizes and licences.
//
// Example (commented out until a real file exists):
//
// defineModel('antares', {
//   url: './models/antares.glb',     // relative to art/
//   height: 6.8,                     // units; the old raid boss stood about 6.8
//   category: 'hero',
//   sector: 'dungeon',
//   tiles: [3, 3],
//   replaces: 'raid-boss',           // the raid cinematics show this instead of the code-drawn boss
//   clips: { idle: 'Idle', roar: 'Roar' },
//   turn: 0,                         // degrees; 180 if it was exported facing away
//   credit: 'Name of the artist, link',
//   licence: 'CC-BY 4.0',
// });
import { defineModel } from '../models.js';

void defineModel;
