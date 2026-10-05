// index.js: imports every pack so the registry is populated, and re-exports the registry.
// Add a pack by importing it here. index.html loads this lazily (the reward reveal, in
// buildRewardScene); new assets are reviewed in art/catalogue.html before a screen uses them.
import './packs/gym.js';
import './packs/equipment.js';
import './packs/system.js';

export * from './registry.js';
