// index.js: imports every pack so the registry is populated, and re-exports the registry and the
// model loader. index.html loads this lazily; new assets are reviewed in art/catalogue.html first.
//
//   resolve(id, opts) -> Promise<{ object, model }>   what the app should show for an asset id: the
//     authored model registered to replace it (art/models/index.js) when there is one and it loads,
//     otherwise the code-drawn asset. model is the loadModel() handle (clips, play, update) or null.
//   take(id, opts) -> { object, model }   the same, synchronously: the authored model if its file has
//     already loaded (call prepare(id) early), otherwise the code-drawn asset. For scenes that build
//     on a frame and cannot wait.
//   prepare(id) -> Promise   starts loading the model registered for id, if any
import './packs/gym.js';
import './packs/equipment.js';
import './packs/system.js';
import './models/index.js';
import { make } from './registry.js';
import { modelFor, loadModel, preloadModel, isLoaded, instantiate } from './models.js';

export * from './registry.js';
export { defineModel, listModels, modelFor, loadModel, preloadModel, isLoaded, instantiate, inspect, checkModel, setRenderer, glowLight, MODEL_BUDGETS } from './models.js';
export { applyEnvironment, lightModel, heroLights, createLook } from './look.js';

export async function resolve(id, opts = {}) {
  const m = modelFor(id);
  if (m) {
    try {
      const model = await loadModel(m.id);
      model.object.userData.assetId = id;
      return { object: model.object, model };
    } catch (e) {
      console.warn(`model "${m.id}" failed to load, drawing "${id}" instead`, e);
    }
  }
  return { object: make(id, opts), model: null };
}

export function prepare(id) {
  const m = modelFor(id);
  return m ? preloadModel(m.id).catch((e) => console.warn(`model "${m.id}" failed to load`, e)) : Promise.resolve();
}

export function take(id, opts = {}) {
  const m = modelFor(id);
  if (m && isLoaded(m.id)) {
    try {
      const model = instantiate(m.id);
      model.object.userData.assetId = id;
      return { object: model.object, model };
    } catch (e) {
      console.warn(`model "${m.id}" failed to build, drawing "${id}" instead`, e);
    }
  }
  return { object: make(id, opts), model: null };
}
