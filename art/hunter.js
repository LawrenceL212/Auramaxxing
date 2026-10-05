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

const LIGHT = new THREE.Vector3(0.35, 0.5, 0.8).normalize();   // the key, from the upper right, in view space
const RIM_FROM = new THREE.Vector3(-0.75, 0.35, 0).normalize();  // the rim catches the left edge
function ink({ color = 0xffffff, vertexColors = false, shadow = [0.6, 0.6, 0.7], spec = 0.2, gloss = 30, rim = 0.4,
  heat = null, eyes = false, side = THREE.FrontSide, edge = 0, sheen = false } = {}) {
  const m = new THREE.ShaderMaterial({
    vertexColors, side, toneMapped: false,
    defines: { ...(heat ? { HEAT: 1, COVER: 1 } : {}), ...(eyes ? { EYES: 1 } : {}), ...(sheen ? { SHEEN: 1 } : {}) },
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uShadow: { value: new THREE.Color(...shadow) },
      uSpec: { value: spec }, uGloss: { value: gloss }, uRim: { value: rim }, uRimCol: { value: new THREE.Color(0x9cc4ff) },
      uL: { value: LIGHT }, uRimFrom: { value: RIM_FROM }, uGlow: heat || { value: 0 },
      uHide: { value: 0 }, uEyeGlow: { value: 0 }, uEyeCol: { value: new THREE.Color(0x6fb6ff) }, uEdge: { value: edge },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vCol; varying float vHeat; varying float vIris; varying vec3 vP; varying float vCover;
      #ifdef HEAT
      attribute float heat;
      #endif
      #ifdef COVER
      attribute float _cover;
      #endif
      #ifdef EYES
      attribute float _iris;
      #endif
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vP = position;
        #ifdef COVER
        vCover = _cover;
        #else
        vCover = 0.0;
        #endif
        #ifdef USE_COLOR
        vCol = color;
        #else
        vCol = vec3(1.0);
        #endif
        #ifdef HEAT
        vHeat = heat;
        #else
        vHeat = 0.0;
        #endif
        #ifdef EYES
        vIris = _iris;
        #else
        vIris = 0.0;
        #endif
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uShadow, uRimCol, uL, uRimFrom, uEyeCol;
      uniform float uSpec, uGloss, uRim, uGlow, uEyeGlow, uEdge, uHide;
      varying vec3 vN; varying vec3 vCol; varying float vHeat; varying float vIris; varying vec3 vP; varying float vCover;
      void main() {
        if (uHide > 0.5 && vCover > 0.99) discard;   // skin under the outfit
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 base = uColor * vCol;
        float ndl = dot(n, uL);
        // soft, painterly form: a broad falloff with a slightly firmer terminator, shadows tinted cool
        float lit = smoothstep(uEdge - 0.45, uEdge + 0.5, ndl);
        lit = mix(lit, smoothstep(uEdge - 0.08, uEdge + 0.08, ndl), 0.35);
        float core = smoothstep(-0.75, -0.3, ndl);
        vec3 c = base * mix(uShadow * mix(0.62, 1.0, core), vec3(1.0), lit) * (0.92 + 0.12 * max(ndl, 0.0));
        c += base * 0.07 * max(n.y, 0.0);
        float ndh = max(dot(n, normalize(uL + vec3(0.0, 0.0, 1.0))), 0.0);
        #ifdef SHEEN
        // hair: a glossy band across the head, broken into strands
        float strand = 0.5 + 0.5 * sin(atan(vP.x, vP.z) * 70.0 + sin(vP.y * 40.0) * 2.0);
        c += vec3(0.75, 0.82, 1.0) * uSpec * smoothstep(0.8, 0.88, ndh) * (1.0 - smoothstep(0.93, 0.98, ndh)) * smoothstep(0.3, 0.9, strand);
        #else
        float sp = pow(ndh, uGloss);
        c += vec3(0.85, 0.9, 1.0) * uSpec * (smoothstep(0.15, 0.7, sp) * 0.6 + 0.25 * sp) * (0.4 + 0.6 * lit);
        #endif
        float fr = 1.0 - max(n.z, 0.0);
        c += uRimCol * uRim * smoothstep(0.62, 0.7, fr) * smoothstep(-0.2, 0.3, dot(n, uRimFrom));
        c += base * uGlow * vHeat;
        #ifdef EYES
        float iris = smoothstep(0.875, 0.89, vIris) * (1.0 - smoothstep(0.97, 0.98, vIris));
        c = mix(c, uEyeCol * 1.6, iris * uEyeGlow);
        #endif
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  m.color = m.uniforms.uColor.value;
  return m;
}
function outlineMat(width = 0.0028, color = 0x07080d) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, toneMapped: false,
    uniforms: { uW: { value: width }, uInk: { value: new THREE.Color(color) } },
    vertexShader: `
      uniform float uW;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        // the same width on screen at any distance, and only at the silhouette (surfaces facing the
        // camera don't swell, so the face's hollows don't fill with ink)
        mv.xyz += n * uW * -mv.z * (1.0 - abs(n.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk, 1.0); }`,
  });
}

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
  const training = meshes.filter((m) => m.name === 'shorts' || m.name === 'top');
  const OUTFIT = ['tee', 'jacket', 'pants', 'belt', 'boots'];
  const outfit = meshes.filter((m) => OUTFIT.includes(m.name));
  const clothes = [...training, ...outfit];

  // drawn in the manhwa style: a crisp light/shadow edge, a deeper core shadow, a hard specular glint and a
  // cool rim, all lit from fixed directions relative to the camera (art-directed, like an illustration),
  // with ink outlines. One small shader, no shadow maps: cheap on a phone.
  const heatGlow = { value: 0 };
  // skin: lit nearly flat like an illustrated face, the shadow only where it truly turns away
  const skinMat = ink({ vertexColors: true, shadow: [0.58, 0.52, 0.62], spec: 0.06, gloss: 40, rim: 0.28, heat: heatGlow, edge: -0.1 });
  body.material = skinMat;
  const eyeMat = ink({ vertexColors: true, shadow: [0.8, 0.8, 0.85], spec: 0.9, gloss: 120, rim: 0, eyes: true });
  eyes.forEach((e) => { e.material = eyeMat; });
  const hairMat = ink({ shadow: [0.4, 0.43, 0.58], spec: 0.32, rim: 0.5, sheen: true });
  hair.forEach((h) => { h.material = hairMat; });
  const browMat = ink({ shadow: [0.7, 0.7, 0.75], spec: 0, rim: 0, side: THREE.DoubleSide });
  brows.forEach((b) => { b.material = browMat; });
  const clothMat = ink({ color: 0x1b1f29, shadow: [0.45, 0.48, 0.62], spec: 0.32, gloss: 26, rim: 0.6, side: THREE.DoubleSide });
  training.forEach((c) => { c.material = clothMat; c.renderOrder = 1; });
  // the street outfit: near-black, the jacket and boots glossy like leather, the tee and pants matte
  const gear = {
    jacket: ink({ color: 0x1d212b, shadow: [0.4, 0.44, 0.6], spec: 0.3, gloss: 22, rim: 0.7, side: THREE.DoubleSide }),
    tee: ink({ color: 0x22252d, shadow: [0.45, 0.48, 0.6], spec: 0.05, rim: 0.3, side: THREE.DoubleSide }),
    pants: ink({ color: 0x121318, shadow: [0.42, 0.45, 0.6], spec: 0.07, gloss: 8, rim: 0.55, side: THREE.DoubleSide }),
    belt: ink({ color: 0x0f1014, shadow: [0.4, 0.4, 0.5], spec: 0.6, gloss: 40, rim: 0.4 }),
    boots: ink({ color: 0x0d0e12, shadow: [0.4, 0.42, 0.55], spec: 0.7, gloss: 30, rim: 0.6 }),
  };
  outfit.forEach((c) => { c.material = gear[c.name]; c.renderOrder = 1; });
  // ink outlines: the same geometry pushed out along its normals, back faces only
  const outline = outlineMat();
  for (const m of [body, ...hair, ...clothes]) {
    const o = new THREE.Mesh(m.geometry, outline);
    o.name = m.name + '_ink'; o.renderOrder = 0; o.raycast = () => {};
    m.add(o);
  }
  const nb = body.geometry.attributes.position.count;
  body.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nb * 3), 3));
  body.geometry.setAttribute('heat', new THREE.BufferAttribute(new Float32Array(nb), 1));
  eyes.forEach((e) => e.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(e.geometry.attributes.position.count * 3), 3)));

  const firstStyle = hair.find((h) => h.name === (bodyType === 'female' ? 'hair_long' : 'hair_messy')) || hair[0];
  let look = { skin: '#e6c4ab', hair: '#16141a', hairStyle: firstStyle?.name.slice(5) || null, eyes: '#5a3b22' };
  let heatColours = null;

  function paint() {
    const skin = col(look.skin, '#e6c4ab'), hairC = col(look.hair, '#16141a');
    const lips = look.lips ? col(look.lips) : skin.clone().lerp(new THREE.Color('#b0606a'), 0.2).multiplyScalar(0.97);
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
    heatGlow.value = heatColours ? 0.3 : 0;
    eyeMat.uniforms.uEyeGlow.value = look.eyeGlow === false ? 0 : 1;
    if (look.eyeGlowColour) eyeMat.uniforms.uEyeCol.value.set(look.eyeGlowColour);
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
    // the outfit, or training kit (always in the muscle view, so the colours show)
    const street = !heatColours && look.outfit !== 'training';
    outfit.forEach((m) => { m.visible = street; });
    skinMat.uniforms.uHide.value = street && body.geometry.attributes._cover ? 1 : 0;
    training.forEach((m) => { m.visible = !street; });
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
    dispose() { meshes.forEach((m) => m.geometry.dispose()); [skinMat, eyeMat, hairMat, browMat, clothMat, outline, ...Object.values(gear)].forEach((m) => m.dispose()); },
  };
}
