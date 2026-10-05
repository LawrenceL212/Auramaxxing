// hunter.js: the player's own 3D body (art/models/hunter-<bodyType>.glb, built by models/src/hunter).
//
//   const h = await loadHunter('male' | 'female')
//   h.shape(weights)        morph weights by name (see physique.js hunterMorphs), baked into the body on
//                           the CPU and the normals recomputed: the shape changes rarely, so the GPU
//                           draws a plain mesh. Hair, brows, eyes and clothes ride on the body (_src).
//   h.dress(look)           { skin, hair, hairStyle, eyes, lips?, clothes? } colours as '#rrggbb', hairStyle an id ('none' for bald)
//   h.heat(colours | null)  colour each tracked muscle ({ 'Biceps': '#6fffb0', ... }) or back to skin
//   h.object                the THREE.Group to add to a scene (stands on y = 0, ~1.75 tall, faces +z)
//   h.hairStyles            the style ids in the file
//
// Presentation only: reads what it is given, writes nothing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const MUSCLES = ['Upper Chest', 'Middle Chest', 'Lower Chest', 'Front Shoulders', 'Lateral Shoulders', 'Rear Shoulders',
  'Biceps', 'Triceps', 'Forearms', 'Upper Abs', 'Middle Abs', 'Lower Abs', 'Obliques', 'Hip Flexors',
  'Traps', 'Upper Back', 'Lats', 'Lower Back', 'Glutes', 'Hamstrings', 'Quads', 'Calves'];

const files = new Map();
let loader = null;
function fetchFile(bodyType) {
  const url = new URL(`./models/hunter-${bodyType === 'female' ? 'female' : 'male'}.glb`, import.meta.url).href;
  if (!loader) {
    loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(`https://unpkg.com/three@0.${THREE.REVISION}.0/examples/jsm/libs/draco/gltf/`);
    loader.setDRACOLoader(draco);
  }
  if (!files.has(url)) files.set(url, loader.loadAsync(url).catch((e) => { files.delete(url); throw e; }));
  return files.get(url);
}

// Normals averaged across vertices that share a position, so UV seams don't show as creases.
function weldedNormals(geo) {
  const pos = geo.attributes.position, idx = geo.index;
  const n = pos.count;
  if (!geo.userData.weld) {   // which vertices share a position: found once, from the rest shape
    const key = new Map(), group = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      let g = key.get(k);
      if (g === undefined) { g = key.size; key.set(k, g); }
      group[i] = g;
    }
    geo.userData.weld = { group, size: key.size };
  }
  const { group, size } = geo.userData.weld;
  const acc = new Float32Array(size * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const tris = idx ? idx.count / 3 : n / 3;
  for (let t = 0; t < tris; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac);
    for (const i of [i0, i1, i2]) { const g = group[i] * 3; acc[g] += ab.x; acc[g + 1] += ab.y; acc[g + 2] += ab.z; }
  }
  const out = geo.attributes.normal || new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  for (let i = 0; i < n; i++) {
    const g = group[i] * 3, l = Math.hypot(acc[g], acc[g + 1], acc[g + 2]) || 1;
    out.setXYZ(i, acc[g] / l, acc[g + 1] / l, acc[g + 2] / l);
  }
  geo.setAttribute('normal', out);
  out.needsUpdate = true;
}

const col = (hex, fallback) => new THREE.Color(hex || fallback);

export async function loadHunter(bodyType = 'male') {
  const gltf = await fetchFile(bodyType);
  const root = gltf.scene.clone(true);
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry = o.geometry.clone();   // each hunter shapes its own copy
    const g = o.geometry;
    // morphs are applied on the CPU (shape()), so keep the base and the deltas aside and draw a plain mesh
    o.userData.base = g.attributes.position.array.slice();
    o.userData.deltas = (g.morphAttributes.position || []).map((m) => m.array);
    o.userData.names = Object.keys(o.morphTargetDictionary || {}).sort((x, y) => o.morphTargetDictionary[x] - o.morphTargetDictionary[y]);
    g.morphAttributes = {};
    o.morphTargetInfluences = undefined; o.morphTargetDictionary = undefined;
    o.castShadow = o.receiveShadow = true;
    meshes.push(o);
  });
  const byName = (n) => meshes.find((m) => m.name === n);
  const body = byName('body');
  const eyes = meshes.filter((m) => m.name.startsWith('eye'));
  const hair = meshes.filter((m) => m.name.startsWith('hair_'));
  const brows = meshes.filter((m) => m.name.startsWith('brow_'));
  const clothes = meshes.filter((m) => m.name === 'shorts' || m.name === 'top');

  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0 });
  // heat glow: the vertex colour lights itself a little where a muscle is painted
  const heatGlow = { value: 0 };
  skinMat.customProgramCacheKey = () => 'hunter-skin';
  skinMat.onBeforeCompile = (sh) => {
    sh.uniforms.heatGlow = heatGlow;
    sh.fragmentShader = 'uniform float heatGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb * heatGlow * vHeat;\n#endif');
    sh.fragmentShader = 'varying float vHeat;\n' + sh.fragmentShader;
    sh.vertexShader = 'attribute float heat;\nvarying float vHeat;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = heat;');
  };
  body.material = skinMat;
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15 });
  eyes.forEach((e) => { e.material = eyeMat; });
  const hairMat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.05 });
  hair.forEach((h) => { h.material = hairMat; });
  const browMat = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });
  brows.forEach((b) => { b.material = browMat; });
  const clothMat = new THREE.MeshStandardMaterial({ roughness: 0.85, color: 0x1b1f29 });
  clothes.forEach((c) => { c.material = clothMat; c.renderOrder = 1; });

  const nb = body.geometry.attributes.position.count;
  body.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nb * 3), 3));
  body.geometry.setAttribute('heat', new THREE.BufferAttribute(new Float32Array(nb), 1));
  eyes.forEach((e) => e.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(e.geometry.attributes.position.count * 3), 3)));

  let look = { skin: '#c8956e', hair: '#2a1d16', hairStyle: hair[0]?.name.slice(5) || null, eyes: '#5a3b22' };
  let heatColours = null;

  function paint() {
    const skin = col(look.skin, '#c8956e'), hairC = col(look.hair, '#2a1d16');
    const lips = look.lips ? col(look.lips) : skin.clone().lerp(new THREE.Color('#9c4a4a'), 0.35).multiplyScalar(0.92);
        const g = body.geometry, c = g.attributes.color, h = g.attributes.heat;
    const m = g.attributes._muscle, p = g.attributes._part, sc = g.attributes._scalp;
    const hairOn = look.hairStyle && look.hairStyle !== 'none';
    const scalpC = skin.clone().lerp(hairC, look.hairStyle === 'buzz' ? 0.8 : 0.6);
    const tmp = new THREE.Color();
    for (let i = 0; i < c.count; i++) {
      const part = p ? Math.round(p.getX(i)) : 0;
      tmp.copy(part === 1 ? lips : skin);
      if (hairOn && sc) tmp.lerp(scalpC, sc.getX(i));   // the hairline shaded on the skin, under the style
      let heat = 0;
      const mi = m ? Math.round(m.getX(i)) : 255;
      if (heatColours && mi < MUSCLES.length && heatColours[MUSCLES[mi]]) {
        tmp.lerp(col(heatColours[MUSCLES[mi]]), 0.78); heat = 1;
      } else if (heatColours) tmp.multiplyScalar(0.55);   // untracked skin steps back in the heat view
      c.setXYZ(i, tmp.r, tmp.g, tmp.b); h.setX(i, heat);
    }
    c.needsUpdate = true; h.needsUpdate = true;
    heatGlow.value = heatColours ? 0.35 : 0;
    const iris = col(look.eyes, '#5a3b22'), sclera = new THREE.Color('#e9e4dc'), pupil = new THREE.Color('#060606');
    for (const e of eyes) {
      const ec = e.geometry.attributes.color, d = e.geometry.attributes._iris;
      for (let i = 0; i < ec.count; i++) {
        const v = d ? d.getX(i) : 0;
        tmp.copy(v > 0.975 ? pupil : v > 0.88 ? iris : sclera);
        ec.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      ec.needsUpdate = true;
    }
    hairMat.color.copy(hairC);
    hair.forEach((m) => { m.visible = m.name === 'hair_' + look.hairStyle; });
    browMat.color.copy(hairC).lerp(skin, 0.15);
    if (look.clothes) clothMat.color.set(look.clothes);
  }
  // followers (hair, brows, eyes, clothes) move with the body vertex they sit on: _src is its base index
  const idAttr = body.geometry.attributes._id;
  const bodyVertexOf = new Map();
  if (idAttr) for (let i = 0; i < idAttr.count; i++) { const id = Math.round(idAttr.getX(i)); if (!bodyVertexOf.has(id)) bodyVertexOf.set(id, i); }
  const followers = meshes.filter((o) => o !== body && o.geometry.attributes._src);
  for (const o of followers) {
    const src = o.geometry.attributes._src, map = new Int32Array(src.count);
    for (let i = 0; i < src.count; i++) map[i] = bodyVertexOf.get(Math.round(src.getX(i))) ?? -1;
    o.userData.follow = map;
  }

  function shape(weights = {}) {
    const bp = body.geometry.attributes.position.array, bb = body.userData.base;
    bp.set(bb);
    body.userData.names.forEach((name, k) => {
      const w = weights[name];
      if (!w) return;
      const d = body.userData.deltas[k];
      for (let i = 0; i < bp.length; i++) bp[i] += d[i] * w;
    });
    for (const o of followers) {
      const out = o.geometry.attributes.position.array, base = o.userData.base, map = o.userData.follow;
      for (let i = 0; i < map.length; i++) {
        const j = map[i];
        for (let c = 0; c < 3; c++) out[i * 3 + c] = base[i * 3 + c] + (j < 0 ? 0 : bp[j * 3 + c] - bb[j * 3 + c]);
      }
    }
    for (const o of meshes) {
      o.geometry.attributes.position.needsUpdate = true;
      weldedNormals(o.geometry);
      o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere();
    }
    // stand on the floor
    root.position.y = 0;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(body);
    root.position.y = -box.min.y;
  }

  shape({});
  paint();
  return {
    object: root,
    hairStyles: hair.map((h) => h.name.slice(5)),
    morphs: body.userData.names.slice(),
    shape,
    dress(next) { look = { ...look, ...next }; paint(); },
    heat(colours) { heatColours = colours || null; paint(); },
    dispose() { meshes.forEach((m) => m.geometry.dispose()); [skinMat, eyeMat, hairMat, browMat, clothMat].forEach((m) => m.dispose()); },
  };
}
