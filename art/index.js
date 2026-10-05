// index.js: imports every pack so the registry is populated, and re-exports the registry.
// Add a pack by importing it here. Nothing in index.html imports this yet: the art stack is
// reviewed in art/catalogue.html first, then wired into a screen one asset at a time.
import './packs/gym.js';
import './packs/equipment.js';
import './packs/system.js';

export * from './registry.js';
