/* =========================================================================
   PHYSIQUE — how the muscle map's body is drawn: which muscles look
   developed, and the body's overall build.

   Presentation only. Everything here reads data the app already has (the
   workout log, PRs, the weigh-in log, check-in tape measurements, the
   profile's bodyType and heightCm) and returns drawing factors. Nothing feeds
   XP, levels, stats, tiers or any stored value.

     muscleDevelopment(ctx)  -> { muscle: 0..1 }
       How built each muscle looks. Training volume over the last 12 weeks
       (recent sessions count more, so a muscle that stops being trained
       slowly shrinks back) plus the best strength tier of its main lifts.
     bodyBuild(ctx)          -> { chest, shoulders, arms, waist, back, hips, legs, source, bmi, bodyFat }
       Width factors per body region, around 1.0. 'measured' when a check-in
       has tape measurements, 'estimated' from height and weight, otherwise
       'default' (all 1).
     bodyFrame(build)        -> the whole figure's width factor
     muscleShape(muscle, dev, build, frame) -> { sx, sy }
       The scale to draw one muscle at, on top of the frame.
     hunterMorphs(ctx)       -> { morphName: weight }
       The same inputs for the 3D body (art/hunter.js): training, build, height
       and tape measurements, plus the look the player picked (ancestry, face).
   ========================================================================= */

export const DEV_WINDOW_DAYS = 84;      // 12 weeks of training shapes the body
export const DEV_HALF_LIFE_DAYS = 42;   // a session six weeks ago counts half
export const DEV_SETS_SCALE = 45;       // weighted sets for ~63% of full volume development
export const GROW_X = 0.2;              // a fully developed muscle draws 20% wider...
export const GROW_Y = 0.08;             // ...and 8% taller

const TIER_DEV = { Beginner: 0.1, Novice: 0.3, Intermediate: 0.55, Advanced: 0.8, Elite: 1 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round3 = (v) => Math.round(v * 1000) / 1000;

/** ctx: { workouts, exercises, prs, muscles, uid?, now? }
 *  workouts: [{ uid, date: 'YYYY-MM-DD', exercises: [{ name, sets: [{ reps }] }] }]
 *  exercises: { name: { muscles: { muscle: emphasis 0..1 } } }
 *  prs: { exerciseName: { tier } } */
export function muscleDevelopment({ workouts = [], exercises = {}, prs = {}, muscles = [], uid = null, now = new Date() }) {
  const sets = Object.fromEntries(muscles.map((m) => [m, 0]));
  const today = new Date(now);
  for (const w of workouts) {
    if (uid && w.uid !== uid) continue;
    const age = (today - new Date(w.date + 'T12:00:00')) / 86400000;
    if (!(age >= -1 && age <= DEV_WINDOW_DAYS)) continue;
    const decay = Math.pow(0.5, Math.max(0, age) / DEV_HALF_LIFE_DAYS);
    for (const ex of w.exercises || []) {
      const done = (ex.sets || []).filter((s) => s && s.reps > 0).length;
      if (!done) continue;
      for (const [m, emph] of Object.entries((exercises[ex.name] || {}).muscles || {})) {
        if (m in sets) sets[m] += done * Math.min(1, emph) * decay;
      }
    }
  }
  const strength = {};
  for (const [name, pr] of Object.entries(prs || {})) {
    const d = TIER_DEV[pr && pr.tier];
    if (d == null) continue;
    for (const [m, emph] of Object.entries((exercises[name] || {}).muscles || {})) {
      if (emph >= 0.6 && (strength[m] ?? 0) < d) strength[m] = d;
    }
  }
  const out = {};
  for (const m of muscles) {
    const vol = 1 - Math.exp(-sets[m] / DEV_SETS_SCALE);
    out[m] = round3(clamp(0.65 * vol + 0.35 * (strength[m] ?? 0), 0, 1));
  }
  return out;
}

// Average adult circumferences (cm) a tape-measured body is compared against.
export const REFERENCE = {
  male:   { chest: 100, shoulders: 116, waist: 86, hip: 98, arm: 33, neck: 38, bmi: 24, bodyFat: 18, heightCm: 176 },
  female: { chest: 90,  shoulders: 102, waist: 75, hip: 100, arm: 29, neck: 33, bmi: 23, bodyFat: 27, heightCm: 163 },
};
const IDENTITY = { chest: 1, shoulders: 1, arms: 1, waist: 1, back: 1, hips: 1, legs: 1 };

/** ctx: { bodyType: 'male'|'female', heightCm?, weightKg?, checkin?: { chest, shoulders, waist, hip, armLeft, armRight, bodyFatPct } } */
export function bodyBuild({ bodyType = 'male', heightCm = null, weightKg = null, checkin = null } = {}) {
  const ref = REFERENCE[bodyType === 'female' ? 'female' : 'male'];
  const h = Number(heightCm), w = Number(weightKg);
  const bmi = h > 100 && h < 250 && w > 25 && w < 350 ? w / ((h / 100) ** 2) : null;
  const bf = checkin && checkin.bodyFatPct > 0 && checkin.bodyFatPct < 60 ? checkin.bodyFatPct : null;
  const result = { ...IDENTITY, source: 'default', bmi: bmi && Math.round(bmi * 10) / 10, bodyFat: bf };
  // general size from BMI: heavier bodies draw wider everywhere, a little more through the middle
  if (bmi) {
    const g = clamp(1 + (bmi - ref.bmi) * 0.022, 0.86, 1.25);
    const fat = bf != null ? clamp(1 + (bf - ref.bodyFat) * 0.012, 0.85, 1.3) : g;
    Object.assign(result, { chest: g, shoulders: g, arms: g, back: g, hips: g, legs: g, waist: clamp(g * 0.5 + fat * 0.5 + (g - 1) * 0.4, 0.82, 1.35), source: 'estimated' });
  }
  // tape measurements win for the regions they cover: the ratio to an average body, softened
  const ratio = (v, r) => (Number(v) > 0 ? clamp(1 + (Number(v) / r - 1) * 0.9, 0.78, 1.35) : null);
  if (checkin) {
    const arm = Math.max(Number(checkin.armLeft) || 0, Number(checkin.armRight) || 0);
    const m = {
      chest: ratio(checkin.chest, ref.chest), shoulders: ratio(checkin.shoulders, ref.shoulders),
      waist: ratio(checkin.waist, ref.waist), hips: ratio(checkin.hip, ref.hip), arms: ratio(arm, ref.arm),
    };
    let any = false;
    for (const [k, v] of Object.entries(m)) if (v != null) { result[k] = v; any = true; }
    if (any) {
      if (m.chest != null || m.shoulders != null) result.back = ((m.chest ?? result.chest) + (m.shoulders ?? result.shoulders)) / 2;
      result.source = 'measured';
    }
  }
  for (const k of Object.keys(IDENTITY)) result[k] = round3(result[k]);
  return result;
}

export const MUSCLE_REGION = {
  'Upper Chest': 'chest', 'Middle Chest': 'chest', 'Lower Chest': 'chest',
  'Front Shoulders': 'shoulders', 'Lateral Shoulders': 'shoulders', 'Rear Shoulders': 'shoulders', 'Traps': 'shoulders',
  'Biceps': 'arms', 'Triceps': 'arms', 'Forearms': 'arms',
  'Upper Abs': 'waist', 'Middle Abs': 'waist', 'Lower Abs': 'waist', 'Obliques': 'waist',
  'Upper Back': 'back', 'Lats': 'back', 'Lower Back': 'back',
  'Glutes': 'hips', 'Hip Flexors': 'hips',
  'Quads': 'legs', 'Hamstrings': 'legs', 'Calves': 'legs',
};

/** The whole figure's width: the build's average, drawn by scaling the entire body (head too, a
 *  little), so a slim build narrows without opening gaps between the traced shapes. */
export function bodyFrame(build = IDENTITY) {
  const regions = Object.keys(IDENTITY).map((k) => build[k] ?? 1);
  return round3(clamp(regions.reduce((a, b) => a + b, 0) / regions.length, 0.9, 1.18));
}

/** frame: bodyFrame(build), already applied to the whole figure. A muscle only ever grows on top of
 *  it (a region narrower than the frame stays at the frame), so the shapes never pull apart. */
export function muscleShape(muscle, dev = 0, build = IDENTITY, frame = 1) {
  const d = clamp(Number(dev) || 0, 0, 1);
  const region = Math.max(1, (build[MUSCLE_REGION[muscle]] ?? 1) / frame);
  // abs don't swell much with training; the waist is mostly build
  const grow = MUSCLE_REGION[muscle] === 'waist' ? 0.4 : 1;
  return { sx: round3((1 + GROW_X * d * grow) * region), sy: round3(1 + GROW_Y * d * grow) };
}

// ── the 3D body ─────────────────────────────────────────────────────────
// Which trained muscles grow which part of the 3D body (morphs in art/models/hunter-*.glb).
export const DEV_MORPH = {
  'dev.chest': ['Upper Chest', 'Middle Chest', 'Lower Chest'],
  'dev.lats': ['Lats', 'Upper Back'],
  'dev.shoulders': ['Front Shoulders', 'Lateral Shoulders', 'Rear Shoulders', 'Traps'],
  'dev.arms': ['Biceps', 'Triceps'],
  'dev.forearms': ['Forearms'],
  'dev.glutes': ['Glutes'],
  'dev.legs': ['Quads', 'Hamstrings'],
  'dev.calves': ['Calves'],
};
export const FACE_SHAPES = ['oval', 'round', 'rectangular', 'square', 'triangular', 'invertedtriangular', 'diamond'];
// The look sliders, each -1..1 (0 is the body type's average)
export const FACE_SLIDERS = ['face.full', 'face.wide', 'face.long', 'nose.wide', 'nose.long', 'nose.hump', 'nose.size',
  'nose.nostrils', 'nose.tip', 'mouth.wide', 'lips.full', 'eyes.size', 'eyes.slant', 'eyes.fold', 'ears.size', 'brows.up', 'neck.wide'];
export const ANCESTRY = ['african', 'asian', 'caucasian'];

/** ctx: { dev, bodyType, heightCm?, bmi?, bodyFat?, checkin?, appearance? }
 *  dev: muscleDevelopment(); bmi/bodyFat: from bodyBuild(); checkin: the latest check-in (tape, cm)
 *  appearance: { ancestry?: { african, asian, caucasian } (any scale), face?: one of FACE_SHAPES,
 *                sliders?: { name: -1..1 } }
 *  Returns morph weights; every morph the file knows is present (0 when unused). */
export function hunterMorphs({ dev = {}, bodyType = 'male', heightCm = null, bmi = null, bodyFat = null, checkin = null, appearance = {} } = {}) {
  const ref = REFERENCE[bodyType === 'female' ? 'female' : 'male'];
  const w = {};
  const avg = (ms) => ms.reduce((a, m) => a + (Number(dev[m]) || 0), 0) / ms.length;
  // training: each trained group grows, and the whole body firms up with the overall average
  const all = Object.values(DEV_MORPH).flat();
  const overall = avg(all);
  for (const [k, ms] of Object.entries(DEV_MORPH)) w[k] = round3(clamp(avg(ms), 0, 1) * 0.85);
  w.muscle = round3(clamp(overall, 0, 1) * 0.6);
  w.muscleLess = round3(clamp(0.25 - overall, 0, 0.25));
  // build: heavier or lighter than average for the body type; trained bodies carry weight as muscle
  const b = Number(bmi);
  w.heavy = b > 0 ? round3(clamp((b - ref.bmi) / 10, 0, 1) * (1 - 0.5 * overall)) : 0;
  w.thin = b > 0 ? round3(clamp((ref.bmi - b) / 6, 0, 1)) : 0;
  const bf = Number(bodyFat ?? (checkin && checkin.bodyFatPct));
  w.belly = round3(bf > 0 ? clamp((bf - ref.bodyFat) / 15, 0, 1) * 0.8 : w.heavy * 0.4);
  // height changes the proportions; the viewer frames the whole body either way
  const h = Number(heightCm);
  w.tall = h > 100 && h < 250 ? round3(clamp((h - ref.heightCm) / 25, 0, 1)) : 0;
  w.short = h > 100 && h < 250 ? round3(clamp((ref.heightCm - h) / 25, 0, 1)) : 0;
  // tape measurements: each one pushes its circumference toward the measured size
  const tape = { bust: checkin?.chest, waist: checkin?.waist, hips: checkin?.hip, shoulders: checkin?.shoulders, neck: checkin?.neck,
    arm: Math.max(Number(checkin?.armLeft) || 0, Number(checkin?.armRight) || 0) };
  const refOf = { bust: ref.chest, waist: ref.waist, hips: ref.hip, shoulders: ref.shoulders, neck: ref.neck, arm: ref.arm };
  for (const k of ['bust', 'waist', 'hips', 'shoulders', 'neck', 'arm', 'thigh']) {
    const v = Number(tape[k]);
    const r = v > 0 && refOf[k] ? v / refOf[k] - 1 : 0;
    w[k + 'Up'] = round3(clamp(r / 0.25, 0, 1));
    w[k + 'Down'] = round3(clamp(-r / 0.2, 0, 1));
  }
  // the look: ancestry blend (weights normalised to sum 1; even is the average), face shape, sliders
  const anc = appearance.ancestry || {};
  const tot = ANCESTRY.reduce((a, k) => a + Math.max(0, Number(anc[k]) || 0), 0);
  for (const k of ANCESTRY) w[k] = tot > 0 ? round3(Math.max(0, Number(anc[k]) || 0) / tot) : round3(1 / 3);
  for (const s of FACE_SHAPES) w['face.' + s] = appearance.face === s ? 0.7 : 0;
  const sl = appearance.sliders || {};
  for (const k of FACE_SLIDERS) {
    const v = clamp(Number(sl[k]) || 0, -1, 1);
    w[k + '+'] = round3(Math.max(0, v));
    w[k + '-'] = round3(Math.max(0, -v));
  }
  return w;
}
