// boss-stage.js: this week's raid boss, standing in 3D on the raid card. Presentation only: it is
// told which boss to show and reads nothing else of the game.
//
//   mountBossStage(host, { asset, fallback, accent, defeated }) -> stage | null
//     asset: the id the boss model replaces ('raid-boss:named:<slug>' for a weekly boss, else
//     'raid-boss:<tier>'); fallback: the id to show if no model is registered for asset.
//     accent: the boss's colour (CSS hex), for the rim light. defeated: dimmed, no attacks.
//     The boss idles; it attacks once on arrival and whenever the stage is tapped; drag turns it.
//   stage.attach(host)  moves the live stage into a new container (the card re-renders wholesale)
//   stage.dispose()     stops it and frees the WebGL context
import * as THREE from 'three';
import { modelFor, preloadModel, instantiate, glowLight, setRenderer } from './index.js';
import { applyEnvironment, heroLights, createLook } from './look.js';

const reduced = () => matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function mountBossStage(host, { asset, fallback = 'raid-boss', accent = '#ff5c6b', defeated = false } = {}) {
  const def = modelFor(asset) || modelFor(fallback);
  if (!def) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); }
  catch (e) { console.warn('boss stage: no WebGL', e); return null; }
  setRenderer(renderer);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMappingExposure = 1.05;
  const root = document.createElement('div');
  root.className = 'boss-stage-root';
  root.appendChild(renderer.domElement);
  const hint = document.createElement('div');
  hint.className = 'boss-stage-hint';
  hint.textContent = defeated ? 'DEFEATED' : 'LOADING…';
  root.appendChild(hint);

  // A cold stone arena: dark armour and the boss's own glow against it, a rim in the boss's colour
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d13);
  scene.fog = new THREE.Fog(0x0b0d13, 22, 48);
  applyEnvironment(renderer, scene, { intensity: 0.8 });
  const rig = heroLights({ key: 2.8, rim: 3.0, rimColor: new THREE.Color(accent).getHex(), fill: 0.5 });
  rig.userData.key.shadow.mapSize.set(1024, 1024);
  scene.add(rig);
  const rim2 = new THREE.DirectionalLight(0xcfd8ff, 1.8); rim2.position.set(4, 4, -4); scene.add(rim2);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x111319, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const look = createLook(renderer, scene, cam, { quality: (devicePixelRatio || 1) > 2 ? 'medium' : 'high', bloom: { strength: 0.5 } });

  let model = null, attacking = null, raf = 0, last = 0, visible = true, alive = true, yaw = 0.35, dragX = null, moved = 0;
  const fit = { y: 3.4, d: 26 };
  function size() {
    const w = root.clientWidth || 360, h = root.clientHeight || 260;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    look.setSize(w, h);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  function place() {
    cam.position.set(Math.sin(yaw) * fit.d, fit.y * 0.9, Math.cos(yaw) * fit.d);
    cam.lookAt(0, fit.y * 0.9, 0);
  }
  function attack() {
    if (!model || attacking || defeated) return;
    const clip = model.clips.includes('Attack') ? 'attack' : 'roar';
    const a = model.play(clip, 0.2);
    if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    attacking = a;
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) { last = t; return; }
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    model?.update(dt);
    if (dragX === null && !reduced()) yaw += (0.35 + Math.sin(t / 4000) * 0.25 - yaw) * dt * 0.6;   // drifts back to its three-quarter view
    place();
    look.render();
  }

  preloadModel(def.id).then(() => {
    if (!alive) return;
    model = instantiate(def.id, { height: def.height });
    scene.add(model.object);
    glowLight(model.object, defeated ? 0.5 : 2.5);
    const box = new THREE.Box3().setFromObject(model.object, true), s = box.getSize(new THREE.Vector3());
    fit.y = s.y * 0.6;
    fit.d = Math.max(s.y, s.x * 1.1) * 2.6;   // room above the head for a weapon raised overhead
    model.mixer?.addEventListener('finished', (e) => {
      if (e.action !== attacking) return;
      attacking = null;
      model.play('idle', 0.45);
    });
    if (defeated) { model.mixer?.update(0); model.mixer && (model.mixer.timeScale = 0.4); }
    hint.textContent = defeated ? 'DEFEATED' : 'TAP TO PROVOKE';
    if (!defeated) setTimeout(attack, 900);
  }).catch((e) => { console.warn('boss stage: model failed', e); hint.textContent = ''; });

  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', (e) => { dragX = e.clientX; moved = 0; });
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  function onMove(e) {
    if (dragX === null) return;
    const dx = e.clientX - dragX; dragX = e.clientX; moved += Math.abs(dx);
    yaw -= dx * 0.008;
  }
  function onUp() {
    if (dragX === null) return;
    if (moved < 6) attack();
    dragX = null;
  }
  const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; });
  const ro = new ResizeObserver(size);

  const stage = {
    asset, defeated, attack,
    get model() { return model; },
    attach(h) {
      h.appendChild(root);
      io.disconnect(); io.observe(root);
      ro.disconnect(); ro.observe(root);
      size();
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp);
      look.dispose?.();
      scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
      renderer.dispose(); renderer.forceContextLoss();
      root.remove();
    },
  };
  stage.attach(host);
  raf = requestAnimationFrame(frame);
  return stage;
}
