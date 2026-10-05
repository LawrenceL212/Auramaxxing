// models.js: authored 3D models (.glb files) next to the code-drawn assets.
//
// Code-drawn assets top out at a clean stylised look. Sculpted, hand-textured models
// (from Blender, ZBrush, an asset store, Sketchfab, or an AI generator like Meshy or Tripo)
// carry the detail that a Black Desert or Expedition 33 look needs, and this loads them.
//
//   defineModel(id, { url, height, category, sector, tiles, replaces?, clips?, credit, licence })
//     url: the .glb, relative to art/ (art/models/<file>.glb) or absolute.
//     height: the size it is scaled to, in units (1 unit = 1 metre; a person is ~1.8).
//     replaces: the id of a code-drawn asset this model stands in for in the app (e.g. 'raid-boss').
//       The app asks resolve(id) and gets this model when one is registered and loads.
//     clips: { idle: 'Idle', ... } the animation names to use for each role (defaults to the first clip).
//     turn: degrees to yaw it so it faces +Z, the camera (most exports face +Z already; some face -Z: 180).
//     credit, licence: who made it and on what terms. Required: every model in the repo is attributed.
//   loadModel(idOrUrl, { height }?) -> Promise<{ object, clips, mixer, play(name), update(dt), stats }>
//     object stands on y = 0, centred on x and z, scaled to height. Every call returns its own clone
//     (skinned meshes included), so one file can be shown many times; the file is fetched once.
//   modelFor(assetId) -> the model registered to replace that asset, or null.
//   setRenderer(renderer)  enables KTX2 (Basis) textures, which need the renderer to pick a format.
//   inspect(object) -> { triangles, meshes, materials, textures, texturePixels, skinned, clips }
//
// Compression: Draco and Meshopt meshes and KTX2 textures all load. A phone can hold a few
// detailed models, not dozens: see BUDGETS in models below and art/MODELS.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// The decoders come from the same three build as the import map, so versions always match.
const LIBS = `https://unpkg.com/three@0.${THREE.REVISION}.0/examples/jsm/libs/`;

// Per-model budgets for a phone: triangles drawn, and texture pixels (1024x1024 = 1M; a 2K set of
// four maps is ~16M, about 64 MB of GPU memory uncompressed).
export const MODEL_BUDGETS = Object.freeze({
  hero: { triangles: 60000, texturePixels: 16.8e6 },     // a boss or the Hunter: one on screen
  character: { triangles: 25000, texturePixels: 8.4e6 }, // soldiers: a few on screen
  prop: { triangles: 12000, texturePixels: 4.2e6 },      // relics, gym gear
});

const models = new Map();
export function defineModel(id, def = {}) {
  if (models.has(id)) throw new Error(`model "${id}" is already defined`);
  const { url, height, category = 'prop', sector = 'core', tiles = [1, 1], replaces = null, clips = {}, turn = 0, credit, licence } = def;
  if (typeof url !== 'string' || !url) throw new Error(`model "${id}": url is required`);
  if (!(height > 0)) throw new Error(`model "${id}": height must be a positive number of units`);
  if (!MODEL_BUDGETS[category]) throw new Error(`model "${id}": category must be one of ${Object.keys(MODEL_BUDGETS).join(', ')}`);
  if (!credit || !licence) throw new Error(`model "${id}": give its credit and licence`);
  models.set(id, { id, url: new URL(url, import.meta.url).href, height, category, sector, tiles, replaces, clips, turn, credit, licence });
}
export const listModels = () => [...models.values()].map((m) => ({ ...m }));
export const modelFor = (assetId) => [...models.values()].find((m) => m.replaces === assetId) || null;

let loader = null, ktx2 = null;
function getLoader() {
  if (loader) return loader;
  loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${LIBS}draco/gltf/`);
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}
export function setRenderer(renderer) {
  if (ktx2 || !renderer) return;
  ktx2 = new KTX2Loader().setTranscoderPath(`${LIBS}basis/`).detectSupport(renderer);
  getLoader().setKTX2Loader(ktx2);
}

const files = new Map();  // url -> Promise<gltf>, fetched once
const loaded = new Map(); // url -> gltf, once it has arrived (so a scene can build from it synchronously)
function fetchGltf(url) {
  if (!files.has(url)) {
    files.set(url, new Promise((res, rej) => getLoader().load(url, res, undefined, rej)));
    files.get(url).then((g) => loaded.set(url, g), () => files.delete(url)); // a failed fetch may be retried
  }
  return files.get(url);
}
const urlOf = (idOrUrl) => models.get(idOrUrl)?.url ?? idOrUrl;
// preloadModel(id) starts the fetch; isLoaded(id) says whether instantiate(id) can build it right now
export const preloadModel = (idOrUrl) => fetchGltf(urlOf(idOrUrl));
export const isLoaded = (idOrUrl) => loaded.has(urlOf(idOrUrl));

export async function loadModel(idOrUrl, opts = {}) {
  await fetchGltf(urlOf(idOrUrl));
  return instantiate(idOrUrl, opts);
}

// instantiate(idOrUrl, opts) -> the same handle as loadModel, built synchronously from a file that
// has already loaded (isLoaded). Throws if it has not.
export function instantiate(idOrUrl, opts = {}) {
  const def = models.get(idOrUrl);
  const url = urlOf(idOrUrl);
  const gltf = loaded.get(url);
  if (!gltf) throw new Error(`model "${idOrUrl}" has not loaded yet`);
  const height = opts.height ?? def?.height ?? 1.8;
  const src = gltf.scene || gltf.scenes[0];
  const inner = cloneSkinned(src);
  inner.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false; // a skinned mesh's bounds are its bind pose
    }
  });
  inner.rotation.y = THREE.MathUtils.degToRad(opts.turn || def?.turn || 0);
  // stand it on the floor, centred, at the requested height
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner, true);
  const size = box.getSize(new THREE.Vector3());
  const s = size.y > 0 ? height / size.y : 1;
  inner.scale.multiplyScalar(s);
  inner.position.set(-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s);
  const object = new THREE.Group();
  object.name = def ? def.id : 'model';
  object.add(inner);
  object.userData.model = def ? def.id : url;

  const clips = gltf.animations || [];
  const mixer = clips.length ? new THREE.AnimationMixer(inner) : null;
  let current = null;
  const pick = (name) => clips.find((c) => c.name === (def?.clips?.[name] ?? name)) || null;
  function play(name, fade = 0.3) {
    if (!mixer) return null;
    const clip = pick(name) || (current ? null : clips[0]);
    if (!clip) return null;
    const next = mixer.clipAction(clip);
    if (current && current !== next) { next.reset().play(); current.crossFadeTo(next, fade, false); }
    else next.play();
    current = next;
    return next;
  }
  if (mixer) play(opts.clip || 'idle');
  return { object, clips: clips.map((c) => c.name), mixer, play, update: (dt) => mixer?.update(dt), stats: inspect(object, clips) };
}

export function inspect(root, clips = []) {
  let triangles = 0, meshes = 0, skinned = false;
  const mats = new Set(), texs = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.isSkinnedMesh) skinned = true;
    const g = o.geometry;
    triangles += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      mats.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture) texs.add(v);
    }
  });
  let texturePixels = 0;
  for (const t of texs) { const i = t.image; if (i && i.width) texturePixels += i.width * i.height; }
  return { triangles, meshes, materials: mats.size, textures: texs.size, texturePixels, skinned, clips: clips.map((c) => c.name) };
}

// check a loaded model against its category's phone budget -> [problem strings]
export function checkModel(category, stats) {
  const b = MODEL_BUDGETS[category] || MODEL_BUDGETS.prop;
  const out = [];
  if (stats.triangles > b.triangles) out.push(`over budget: ${stats.triangles} of ${b.triangles} triangles`);
  if (stats.texturePixels > b.texturePixels) out.push(`textures too large: ${(stats.texturePixels / 1e6).toFixed(1)}M of ${(b.texturePixels / 1e6).toFixed(1)}M pixels (resize to 1K or 2K, or use KTX2)`);
  return out;
}
