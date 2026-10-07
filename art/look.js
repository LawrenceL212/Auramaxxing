// look.js: the realistic look for authored models. Image-based lighting, a key/rim/fill rig and bloom.
//
// Toon materials (kit.js) light themselves in bands; PBR models (models.js) need light to reflect, or
// they read flat and dark. This gives a scene that light without downloading anything: the
// environment map is three's RoomEnvironment, built on the GPU in a few milliseconds.
//
//   applyEnvironment(renderer, scene, { intensity })   a PMREM environment for PBR reflections
//   lightModel(object, renderer, intensity)            the same environment on one model's materials only,
//     for a scene whose other objects must keep their own look (the app's System core)
//   heroLights({ key, rim, rimColor, fill }) -> Group     key from front-right, rim from behind, soft fill
//   createLook(renderer, scene, camera, { quality })   -> { render(), setSize(w, h), bloom, dispose() }
//     quality: 'high' (bloom at full res), 'medium' (half-res bloom), 'low' (no bloom: phones that
//     are struggling). The app's AuraGL tiers map onto these.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const envs = new WeakMap(); // renderer -> environment texture, built once per renderer
export function applyEnvironment(renderer, scene, { intensity = 1 } = {}) {
  if (!envs.has(renderer)) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envs.set(renderer, pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    pmrem.dispose();
  }
  scene.environment = envs.get(renderer);
  scene.environmentIntensity = intensity;
  return scene.environment;
}

export function lightModel(object, renderer, intensity = 1) {
  if (!envs.has(renderer)) applyEnvironment(renderer, new THREE.Scene());
  const env = envs.get(renderer);
  object.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.isMeshStandardMaterial) { m.envMap = env; m.envMapIntensity = intensity; m.needsUpdate = true; }
    }
  });
}

export function heroLights({ key = 2.4, rim = 3.2, rimColor = 0x8b5cff, fill = 0.5, shadows = true } = {}) {
  const g = new THREE.Group();
  g.name = 'hero-lights';
  const k = new THREE.DirectionalLight(0xfff1e0, key);
  k.position.set(3, 5, 4);
  if (shadows) {
    k.castShadow = true;
    k.shadow.mapSize.set(2048, 2048);
    k.shadow.bias = -0.0003;
    k.shadow.normalBias = 0.02;
  }
  const r = new THREE.DirectionalLight(rimColor, rim);
  r.position.set(-3, 3, -5);
  const f = new THREE.HemisphereLight(0xbfd0ff, 0x120c1c, fill);
  g.add(k, k.target, r, f);
  g.userData = { key: k, rim: r, fill: f };
  return g;
}

export function createLook(renderer, scene, camera, { quality = 'medium', bloom: b = {} } = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (quality === 'low') {
    return { render: () => renderer.render(scene, camera), setSize: () => {}, bloom: null, dispose: () => {} };
  }
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const scale = quality === 'high' ? 1 : 0.5;
  // Bloom runs on the linear HDR image, before tone mapping: a threshold above 1 keeps lit skin and
  // metal out of it, so only what is truly bright blooms (glowing eyes, runes, emissive maps, halos).
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * scale, size.y * scale), b.strength ?? 0.4, b.radius ?? 0.4, b.threshold ?? 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloom.resolution.set(w * scale, h * scale); },
    bloom,
    dispose: () => composer.dispose(),
  };
}
