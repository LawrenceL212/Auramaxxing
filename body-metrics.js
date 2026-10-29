/* Body metrics: what a tape-measure check-in tells the Hunter.

   Pure: takes the measurements (all circumferences, in cm, measured AROUND the
   body) plus height, weight and sex, and returns the estimates, what they mean,
   and which physique priorities follow from them. The check-in modal and the
   Codex card render this; the plan optimiser reads the priorities' muscle
   groups. Nothing here writes data, and none of it feeds XP or progression.
   Tested by  node test/body-metrics.test.mjs

   Sources
   - Body fat: US Navy circumference method, Hodgdon & Beckett 1984 (Naval
     Health Research Center reports 84-11 / 84-29), metric form as in DoD
     Instruction 1308.3. About ±3-4 points against DEXA for most adults.
   - Skin-fold body fat: Jackson & Pollock 3-site (Br J Nutr 1978; Jackson, Pollock
     & Ward, Med Sci Sports Exerc 1980) converted with the Siri equation (1961),
     validated for ages 18-61. Usually closer than the tape formula when the
     same person pinches the same sites the same way. The 7-site version (chest,
     midaxillary, triceps, subscapular, abdomen, suprailiac, thigh; same papers)
     fits a little tighter and also shows where the fat sits.
   - Limb muscle: corrected girth = limb circumference - pi x skin fold, and the
     arm muscle area from it with the bone correction (Heymsfield et al. 1982,
     Am J Clin Nutr; Frisancho 1981). A tracking measure, not a rating.
   - Body fat categories: American Council on Exercise (ACE).
   - BMI: WHO adult cut-offs (18.5 / 25 / 30).
   - Waist-to-height: Ashwell et al. 2012 (Obesity Reviews) and NICE 2022
     (NG246): keep the waist under half the height; 0.6 and over is high risk.
   - Waist-to-hip: WHO 2008 expert consultation (risk at 0.90 men, 0.85 women).
   - FFMI: Kouri et al. 1995 (Clin J Sport Med), height-normalised to 1.8 m.
   - Shoulder-to-waist 1.618: the golden ratio ("Adonis index"), an aesthetic
     ideal rather than a health measure. Chest-to-waist 1.4 and flexed arm at
     36% of chest follow John McCallum's classic proportion guidelines. */

export const GOLDEN_RATIO = 1.618;
export const CHEST_WAIST_IDEAL = 1.4;
export const ARM_CHEST_IDEAL = 0.36;

// Plausible circumferences (cm) for an adult. Outside these the value is
// probably a typo, a width, or inches.
export const RANGES = {
  weight:    [30, 300],
  height:    [120, 230],
  neck:      [24, 65],
  shoulders: [75, 180],
  chest:     [60, 180],
  waist:     [45, 200],
  hip:       [60, 200],
  arm:       [18, 65],
  thigh:     [30, 100],
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
const sexOf = (s) => (s === 'female' ? 'female' : 'male');

/** Measurements cleaned to positive numbers or null. */
export function cleanMeasurements(m = {}) {
  return {
    weight: num(m.weight), height: num(m.height), neck: num(m.neck),
    shoulders: num(m.shoulders), chest: num(m.chest), waist: num(m.waist),
    hip: num(m.hip), armLeft: num(m.armLeft), armRight: num(m.armRight), thigh: num(m.thigh),
  };
}

/**
 * US Navy body fat %, or null when it cannot be worked out honestly.
 * Men: waist at the navel, neck, height. Women: waist at the narrowest point,
 * hips, neck, height (the female equation needs the hips; using the male one
 * instead would be wrong by several points).
 */
export function navyBodyFat(sex, { waist, neck, hip, height } = {}) {
  waist = num(waist); neck = num(neck); hip = num(hip); height = num(height);
  if (!waist || !neck || !height || !inRange(height, RANGES.height)) return null;
  let bf;
  if (sexOf(sex) === 'female') {
    if (!hip || waist + hip - neck <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(height)) - 450;
  } else {
    if (waist - neck <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  }
  if (!Number.isFinite(bf) || bf < 2 || bf > 60) return null;
  return round1(bf);
}

// ── skin-fold calipers ──────────────────────────────────────────────────
export const SKINFOLD_SITES = {
  male:   ['chest', 'abdomen', 'thigh'],
  female: ['triceps', 'suprailiac', 'thigh'],
};
export const SKINFOLD_NAMES = { chest: 'Chest', abdomen: 'Abdomen', thigh: 'Thigh', triceps: 'Triceps', suprailiac: 'Suprailiac', midaxillary: 'Side of ribs', subscapular: 'Back' };
/** The 7-site set, and the four a Hunter adds to the sex's three for it. */
export const SKINFOLD_SITES_7 = ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdomen', 'suprailiac', 'thigh'];
export const SKINFOLD_EXTRA = {
  male:   ['midaxillary', 'triceps', 'subscapular', 'suprailiac'],
  female: ['chest', 'midaxillary', 'subscapular', 'abdomen'],
};
export const SKINFOLD_RANGE = [2, 60];
export const JP_AGES = [18, 61];
const SKINFOLD_STEPS = {
  chest:      'Diagonal fold halfway between the nipple and the front of the armpit',
  abdomen:    'Vertical fold 2 cm to the side of the navel',
  thigh:      'Vertical fold on the front of the thigh, halfway between hip crease and kneecap',
  triceps:    'Vertical fold on the back of the upper arm, halfway between shoulder tip and elbow',
  suprailiac: 'Diagonal fold just above the hip bone, along its natural line',
  midaxillary: 'Vertical fold on the side of the ribs, level with the bottom of the breastbone',
  subscapular: 'Diagonal fold just below the tip of the shoulder blade',
};
const SKINFOLD_HINTS = {
  chest: 'Halfway nipple to armpit', abdomen: '2 cm beside the navel', thigh: 'Midway hip to knee',
  triceps: 'Back of arm, midway', suprailiac: 'Just above the hip bone',
  midaxillary: 'Side, level with breastbone tip', subscapular: 'Below the shoulder blade',
};
export function skinfoldHint(site) { return SKINFOLD_HINTS[site] || ''; }
export function skinfoldStep(site) { return SKINFOLD_STEPS[site] || ''; }

/** Fold readings cleaned to positive numbers for this sex's sites; a missing site is null. */
export function cleanSkinfolds(sex, folds = {}) {
  const out = {};
  for (const site of SKINFOLD_SITES[sexOf(sex)]) out[site] = num(folds && folds[site]);
  return out;
}

/**
 * Jackson-Pollock 3-site body fat %, or null when a site is missing or out of
 * range, or the age is outside 18-61 (the formula was not fitted there).
 * Men: chest, abdomen, thigh. Women: triceps, suprailiac, thigh. mm.
 */
export function jacksonPollock3(sex, folds, age) {
  sex = sexOf(sex);
  const f = cleanSkinfolds(sex, folds);
  const a = num(age);
  if (!a || a < JP_AGES[0] || a > JP_AGES[1]) return null;
  const sites = SKINFOLD_SITES[sex];
  if (sites.some(k => f[k] == null || !inRange(f[k], SKINFOLD_RANGE))) return null;
  const S = sites.reduce((t, k) => t + f[k], 0);
  const bd = sex === 'female'
    ? 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * a
    : 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * a;
  const bf = 495 / bd - 450;
  if (!Number.isFinite(bf) || bf < 2 || bf > 50) return null;
  return round1(bf);
}

/** Fold readings for all 7 sites; a missing site is null. */
export function cleanSkinfolds7(folds = {}) {
  const out = {};
  for (const site of SKINFOLD_SITES_7) out[site] = num(folds && folds[site]);
  return out;
}

/**
 * Jackson-Pollock 7-site body fat %, or null unless all seven folds are in range and
 * the age is 18-61. Same Siri conversion as the 3-site.
 */
export function jacksonPollock7(sex, folds, age) {
  sex = sexOf(sex);
  const f = cleanSkinfolds7(folds);
  const a = num(age);
  if (!a || a < JP_AGES[0] || a > JP_AGES[1]) return null;
  if (SKINFOLD_SITES_7.some(k => f[k] == null || !inRange(f[k], SKINFOLD_RANGE))) return null;
  const S = SKINFOLD_SITES_7.reduce((t, k) => t + f[k], 0);
  const bd = sex === 'female'
    ? 1.097 - 0.00046971 * S + 0.00000056 * S * S - 0.00012828 * a
    : 1.112 - 0.00043499 * S + 0.00000055 * S * S - 0.00028826 * a;
  const bf = 495 / bd - 450;
  if (!Number.isFinite(bf) || bf < 2 || bf > 50) return null;
  return round1(bf);
}

export const TAPE_OFFSET_MAX = 8;

/**
 * How far the tape formula read from the calipers on a full scan (caliper minus tape, in points), or null
 * when that scan had no caliper reading or the gap is implausible (over 8 points: a bad pinch or tape).
 */
export function calibrationOffset(sex, raw = {}) {
  const caliper = jacksonPollock7(sex, raw.skinfolds, raw.age) ?? jacksonPollock3(sex, raw.skinfolds, raw.age);
  const tape = navyBodyFat(sex, cleanMeasurements(raw));
  if (caliper == null || tape == null) return null;
  const gap = round1(caliper - tape);
  return Math.abs(gap) <= TAPE_OFFSET_MAX ? gap : null;
}

const TRUNK_SITES = ['chest', 'midaxillary', 'subscapular', 'abdomen', 'suprailiac'];
const LIMB_SITES = ['triceps', 'thigh'];
// Rule-of-thumb bands for mean trunk fold / mean limb fold. Women normally carry relatively more on the
// limbs, so their bands sit lower. A guide to where fat sits, not a clinical threshold.
const DISTRIBUTION_BANDS = {
  male:   [[1.2, 'Even', 'Fat is spread evenly between trunk and limbs.'], [1.6, 'Trunk-leaning', 'More fat sits on the trunk than the limbs. Waist and diet matter most.'], [Infinity, 'Central', 'Most fat sits on the trunk. This is the pattern that carries the most health risk, and the waist is where it comes off first.']],
  female: [[0.9, 'Lower-body leaning', 'More fat sits on the hips and thighs than the trunk, which is the usual female pattern.'], [1.3, 'Even', 'Fat is spread evenly between trunk and limbs.'], [Infinity, 'Central', 'More fat sits on the trunk than usual. Waist and diet matter most.']],
};

/**
 * Where the fat sits, from all seven folds: trunk against limb mean, the largest folds, and a
 * plain-words label. Null unless all seven are in range.
 */
export function fatDistribution(sex, folds) {
  sex = sexOf(sex);
  const f = cleanSkinfolds7(folds);
  if (SKINFOLD_SITES_7.some(k => f[k] == null || !inRange(f[k], SKINFOLD_RANGE))) return null;
  const mean = (list) => list.reduce((t, k) => t + f[k], 0) / list.length;
  const trunk = mean(TRUNK_SITES), limb = mean(LIMB_SITES);
  const ratio = round2(trunk / limb);
  const band = DISTRIBUTION_BANDS[sex].find(([max]) => ratio < max);
  const sites = SKINFOLD_SITES_7.map(k => ({ site: k, name: SKINFOLD_NAMES[k], mm: f[k] })).sort((a, b) => b.mm - a.mm);
  return { ratio, trunkMm: round1(trunk), limbMm: round1(limb), label: band[1], text: band[2], sites, top: sites.slice(0, 2) };
}

/**
 * Limb muscle from the tape and the fold on that limb. Corrected girth = circumference - pi x fold
 * (the fat layer on both sides of the limb comes off). Arm muscle area follows Heymsfield 1982
 * (bone correction 10 cm2 men, 6.5 women). Arm needs the triceps fold; thigh needs the thigh
 * fold and a mid-thigh circumference. The fold is taken on one side, so it is applied to both arms.
 * Null parts when the inputs are missing.
 */
export function limbMuscle(sex, raw = {}) {
  sex = sexOf(sex);
  const c = cleanMeasurements(raw);
  const f = cleanSkinfolds7(raw.skinfolds);
  const cm = (mm) => mm / 10;
  const out = { arm: null, thigh: null };
  if (f.triceps != null && inRange(f.triceps, SKINFOLD_RANGE) && (c.armLeft || c.armRight)) {
    const corr = (g) => g ? round1(g - Math.PI * cm(f.triceps)) : null;
    const left = corr(c.armLeft), right = corr(c.armRight);
    const have = [left, right].filter(v => v != null);
    const avg = round1(have.reduce((t, v) => t + v, 0) / have.length);
    const raw1 = [c.armLeft, c.armRight].filter(Boolean);
    const rawAvg = raw1.reduce((t, v) => t + v, 0) / raw1.length;
    const areaCm2 = round1(Math.max(0, avg * avg / (4 * Math.PI) - (sex === 'female' ? 6.5 : 10)));
    out.arm = { left, right, avgCm: avg, areaCm2, share: round2(avg / rawAvg), foldMm: f.triceps };
  }
  if (f.thigh != null && inRange(f.thigh, SKINFOLD_RANGE) && c.thigh && inRange(c.thigh, RANGES.thigh)) {
    const corr = round1(c.thigh - Math.PI * cm(f.thigh));
    out.thigh = { cm: corr, areaCm2: round1(corr * corr / (4 * Math.PI)), share: round2(corr / c.thigh), foldMm: f.thigh };
  }
  return out.arm || out.thigh ? out : null;
}

const BF_BANDS = {
  male:   [[6, 'Essential'], [14, 'Athletic'], [18, 'Fit'], [25, 'Average'], [Infinity, 'High']],
  female: [[14, 'Essential'], [21, 'Athletic'], [25, 'Fit'], [32, 'Average'], [Infinity, 'High']],
};
/** ACE body fat category. */
export function bodyFatCategory(sex, pct) {
  if (pct == null) return null;
  return BF_BANDS[sexOf(sex)].find(([hi]) => pct < hi)[1];
}

export function bmi(weight, height) {
  weight = num(weight); height = num(height);
  if (!weight || !height || !inRange(height, RANGES.height) || !inRange(weight, RANGES.weight)) return null;
  return round1(weight / (height / 100) ** 2);
}
export function bmiCategory(v) {
  if (v == null) return null;
  return v < 18.5 ? 'Underweight' : v < 25 ? 'Healthy range' : v < 30 ? 'Overweight' : 'Obese';
}

/** Fat-free mass index (kg/m²), height-normalised to 1.8 m (Kouri 1995). */
export function ffmi(leanKg, height) {
  leanKg = num(leanKg); height = num(height);
  if (!leanKg || !height) return null;
  const h = height / 100;
  return round1(leanKg / (h * h) + 6.1 * (1.8 - h));
}
const FFMI_BANDS = {
  male:   [[18, 'Below average'], [20, 'Average'], [22, 'Above average'], [23.5, 'Muscular'], [25.5, 'Very muscular'], [Infinity, 'Elite']],
  female: [[14.5, 'Below average'], [16.5, 'Average'], [18, 'Above average'], [19.5, 'Muscular'], [21.5, 'Very muscular'], [Infinity, 'Elite']],
};
export function ffmiCategory(sex, v) {
  if (v == null) return null;
  return FFMI_BANDS[sexOf(sex)].find(([hi]) => v < hi)[1];
}

export function waistToHeight(waist, height) {
  waist = num(waist); height = num(height);
  return waist && height ? round2(waist / height) : null;
}
export function waistToHeightCategory(v) {
  if (v == null) return null;
  return v < 0.4 ? 'Very slim' : v < 0.5 ? 'Healthy' : v < 0.6 ? 'Raised risk' : 'High risk';
}

/**
 * Warnings for values that look wrong, keyed by field. The common one: a
 * shoulder or chest WIDTH (tape across the front) typed where the
 * circumference (tape all the way around) belongs.
 */
export function measurementWarnings(m = {}) {
  const c = cleanMeasurements(m);
  const w = {};
  const offRange = (key, range, label, unit = 'cm') => {
    if (c[key] != null && !inRange(c[key], range)) w[key] = `Unusual for ${label} (${range[0]}–${range[1]} ${unit}). Typo, or inches?`;
  };
  if (c.shoulders != null && c.shoulders < RANGES.shoulders[0]) {
    w.shoulders = 'Looks like a width. Wrap the tape all the way around both shoulders.';
  } else if (c.shoulders != null && c.waist != null && c.shoulders < c.waist) {
    w.shoulders = 'Smaller than your waist? Check the tape went around your back too.';
  } else offRange('shoulders', RANGES.shoulders, 'shoulders');
  if (c.chest != null && c.chest < RANGES.chest[0]) {
    w.chest = 'Looks like a width. Wrap the tape around your back.';
  } else offRange('chest', RANGES.chest, 'the chest');
  if (c.neck != null && c.waist != null && c.neck >= c.waist) w.neck = 'Neck must be smaller than waist.';
  else offRange('neck', RANGES.neck, 'the neck');
  offRange('waist', RANGES.waist, 'the waist');
  offRange('hip', RANGES.hip, 'the hips');
  for (const k of ['armLeft', 'armRight']) offRange(k, RANGES.arm, 'a flexed arm');
  if (c.height != null && !inRange(c.height, RANGES.height)) w.height = `Use ${RANGES.height[0]}–${RANGES.height[1]} cm.`;
  offRange('weight', RANGES.weight, 'bodyweight', 'kg');
  // skin folds: all three sites or none; a fold is a few mm to a few cm
  const sex = sexOf(m.sex);
  const sf = cleanSkinfolds(sex, m.skinfolds);
  const entered = SKINFOLD_SITES[sex].filter(k => sf[k] != null);
  for (const k of entered) {
    if (!inRange(sf[k], SKINFOLD_RANGE)) w[`sf_${k}`] = `A fold is ${SKINFOLD_RANGE[0]}–${SKINFOLD_RANGE[1]} mm. Typo, or cm?`;
  }
  const sf7 = cleanSkinfolds7(m.skinfolds);
  const extraIn = SKINFOLD_EXTRA[sex].filter(k => sf7[k] != null);
  for (const k of extraIn) {
    if (!inRange(sf7[k], SKINFOLD_RANGE)) w[`sf_${k}`] = `A fold is ${SKINFOLD_RANGE[0]}–${SKINFOLD_RANGE[1]} mm. Typo, or cm?`;
  }
  if (extraIn.length && extraIn.length < SKINFOLD_EXTRA[sex].length) w.sf7_missing = `Fill all ${SKINFOLD_EXTRA[sex].length} extra sites for the 7-site reading, or leave them empty.`;
  if (c.thigh != null && !inRange(c.thigh, RANGES.thigh)) w.thigh = `A thigh is ${RANGES.thigh[0]}–${RANGES.thigh[1]} cm around. Typo, or a width?`;
  const age = num(m.age);
  if (entered.length && age != null && (age < JP_AGES[0] || age > JP_AGES[1])) w.age = `The caliper formula is for ages ${JP_AGES[0]}–${JP_AGES[1]}.`;
  else if (age != null && (age < 10 || age > 100)) w.age = 'Check the age.';
  if (entered.length && entered.length < SKINFOLD_SITES[sex].length) w.sf_missing = `Enter all ${SKINFOLD_SITES[sex].length} folds for a caliper reading.`;
  return w;
}

/** The next 0.1 step up from a ratio, capped at the ideal: a target reachable in a block of training. */
export function nextStep(ratio, ideal) {
  return Math.min(ideal, Math.floor(ratio * 10 + 1e-9) / 10 + 0.1);
}

/** A shoulder or chest value that is a width, not a circumference, gives no ratio. */
function usable(c, key) {
  return c[key] != null && c[key] >= RANGES[key][0];
}

/**
 * Every estimate the check-in can give. Fields are null when the inputs for
 * them are missing or unusable.
 */
export function bodyMetrics(sex, raw = {}) {
  sex = sexOf(sex);
  const c = cleanMeasurements(raw);
  const navy = navyBodyFat(sex, c);
  const caliper3 = jacksonPollock3(sex, raw.skinfolds, raw.age);
  const caliper7 = jacksonPollock7(sex, raw.skinfolds, raw.age);
  // the 7-site reading wins, then the 3-site, then the tape formula; sources are kept apart so a
  // progress row never compares across methods
  const caliper = caliper7 != null ? caliper7 : caliper3;
  // between caliper scans the tape formula is nudged by how far it read from the calipers last time
  // (raw.tapeOffset, see calibrationOffset): a weekly tape check-in then stays on the caliper scale
  const rawOff = Number(raw.tapeOffset);
  const offset = raw.tapeOffset != null && Number.isFinite(rawOff) && Math.abs(rawOff) <= TAPE_OFFSET_MAX ? rawOff : null;
  const calibrated = caliper == null && navy != null && offset != null ? round1(Math.min(50, Math.max(3, navy + offset))) : null;
  const bf = caliper != null ? caliper : calibrated != null ? calibrated : navy;
  const bodyFatSource = caliper7 != null ? 'calipers7' : caliper3 != null ? 'calipers' : calibrated != null ? 'tapeCal' : navy != null ? 'tape' : null;
  const fatKg = bf != null && c.weight ? round1(c.weight * bf / 100) : null;
  const leanKg = bf != null && c.weight ? round1(c.weight - c.weight * bf / 100) : null;
  const bmiV = bmi(c.weight, c.height);
  const ffmiV = ffmi(leanKg, c.height);
  const whtr = waistToHeight(c.waist, c.height);
  const whr = c.waist && c.hip ? round2(c.waist / c.hip) : null;

  let vTaper = null;
  if (usable(c, 'shoulders') && c.waist) {
    const ratio = round2(c.shoulders / c.waist);
    vTaper = {
      ratio,
      ofGolden: Math.round(ratio / GOLDEN_RATIO * 100),
      shouldersFor: round1(c.waist * GOLDEN_RATIO),
      waistFor: round1(c.shoulders / GOLDEN_RATIO),
      gapShouldersCm: Math.max(0, round1(c.waist * GOLDEN_RATIO - c.shoulders)),
      gapWaistCm: Math.max(0, round1(c.waist - c.shoulders / GOLDEN_RATIO)),
      next: Math.round(nextStep(ratio, GOLDEN_RATIO) * 1000) / 1000,
      shouldersForNext: round1(c.waist * nextStep(ratio, GOLDEN_RATIO)),
      label: ratio >= GOLDEN_RATIO ? 'Golden' : ratio >= 1.5 ? 'Strong V' : ratio >= 1.4 ? 'Building' : ratio >= 1.2 ? 'Mild taper' : 'Straight',
    };
  }
  let chestWaist = null;
  if (usable(c, 'chest') && c.waist) {
    const ratio = round2(c.chest / c.waist);
    chestWaist = {
      ratio, ideal: CHEST_WAIST_IDEAL, chestFor: round1(c.waist * CHEST_WAIST_IDEAL), gapCm: Math.max(0, round1(c.waist * CHEST_WAIST_IDEAL - c.chest)),
      next: Math.round(nextStep(ratio, CHEST_WAIST_IDEAL) * 1000) / 1000, chestForNext: round1(c.waist * nextStep(ratio, CHEST_WAIST_IDEAL)),
    };
  }
  let arms = null;
  if (c.armLeft || c.armRight) {
    const big = Math.max(c.armLeft || 0, c.armRight || 0);
    const both = c.armLeft && c.armRight;
    const diffCm = both ? round1(Math.abs(c.armLeft - c.armRight)) : null;
    const diffPct = both ? Math.round(Math.abs(c.armLeft - c.armRight) / big * 1000) / 10 : null;
    arms = {
      bigger: big,
      diffCm, diffPct,
      weakSide: both && c.armLeft !== c.armRight ? (c.armLeft < c.armRight ? 'left' : 'right') : null,
      // about a centimetre and 3% is past normal tape error and dominance
      asymmetric: both && diffCm >= 1 && diffPct >= 3,
      toChest: usable(c, 'chest') ? round2(big / c.chest) : null,
      armFor: usable(c, 'chest') ? round1(c.chest * ARM_CHEST_IDEAL) : null,
    };
  }

  return {
    sex,
    bodyFat: bf, bodyFatSource, bodyFatTape: navy, bodyFatCalipers: caliper, bodyFatCategory: bodyFatCategory(sex, bf), fatKg, leanKg,
    bmi: bmiV, bmiCategory: bmiCategory(bmiV),
    ffmi: ffmiV, ffmiCategory: ffmiCategory(sex, ffmiV),
    waistToHeight: whtr, waistToHeightCategory: waistToHeightCategory(whtr),
    waistToHip: whr,
    vTaper, chestWaist, arms,
    distribution: fatDistribution(sex, raw.skinfolds),
    limbs: limbMuscle(sex, raw),
    missing: {
      height: !c.height,
      hip: sex === 'female' && !c.hip,
    },
  };
}

/**
 * Physique priorities, most important first:
 * { id, title, why, how, target, focus: [optimiser MUSCLE_GROUPS names] }.
 */
export function physiquePriorities(sex, raw = {}) {
  sex = sexOf(sex);
  const m = bodyMetrics(sex, raw);
  const c = cleanMeasurements(raw);
  const out = [];

  const highFat = m.bodyFat != null && m.bodyFat >= (sex === 'female' ? 32 : 22);
  const highWaist = m.waistToHeight != null && m.waistToHeight >= 0.5;
  if (highFat || highWaist) {
    const healthyWaist = c.height ? round1(c.height * 0.5 - 0.1) : null;
    const goldenWaist = m.vTaper ? m.vTaper.waistFor : null;
    const target = [healthyWaist, goldenWaist].filter(Boolean);
    const goal = target.length ? Math.max(...target) : null;
    out.push({
      id: 'waist',
      title: 'Bring your waist down',
      why: highWaist ? `Waist is ${Math.round(m.waistToHeight * 100)}% of height (aim under 50%)` : `Body fat ${m.bodyFat}%, ${m.bodyFatCategory.toLowerCase()}`,
      how: [
        'Eat 300–500 kcal under maintenance',
        'Protein 1.6–2.2 g per kg',
        'Keep lifting heavy so the loss is fat',
        'Lose 0.5–1% of bodyweight a week',
      ],
      more: 'A smaller waist raises every taper ratio at once.',
      target: goal && c.waist && goal < c.waist ? `${goal} cm waist (−${round1(c.waist - goal)})` : null,
      focus: [],
    });
  }

  if (m.vTaper && m.vTaper.ratio < GOLDEN_RATIO) {
    out.push({
      id: 'shoulders',
      title: 'Widen your shoulders',
      why: `V-taper ${m.vTaper.ratio}, ${m.vTaper.ofGolden}% of golden`,
      how: [
        'Lateral raises and overhead press (side delts)',
        'Pull-ups and rows (lats)',
        '12–20 hard sets a week',
      ],
      more: `Golden 1.618: ${m.vTaper.shouldersFor} cm shoulders, or ${m.vTaper.waistFor} cm waist.`,
      target: `${m.vTaper.shouldersForNext} cm shoulders (+${round1(m.vTaper.shouldersForNext - c.shoulders)})`,
      focus: ['Shoulders', 'Back'],
    });
  }

  if (m.chestWaist && sex === 'male' && m.chestWaist.ratio < CHEST_WAIST_IDEAL) {
    out.push({
      id: 'chest',
      title: 'Build your chest and back',
      why: `Chest ÷ waist ${m.chestWaist.ratio} (classic ${CHEST_WAIST_IDEAL})`,
      how: [
        'Presses, incline included',
        'Rows or pull-downs (the chest tape takes in the lats)',
        '10–20 sets a week each',
      ],
      more: `Classic ${CHEST_WAIST_IDEAL}: ${m.chestWaist.chestFor} cm chest at today\u2019s waist.`,
      target: `${m.chestWaist.chestForNext} cm chest (+${round1(m.chestWaist.chestForNext - c.chest)})`,
      focus: ['Chest', 'Back'],
    });
  }

  if (m.arms && m.arms.asymmetric) {
    const weak = m.arms.weakSide;
    out.push({
      id: 'arm-balance',
      title: `Even out your arms (${weak} is smaller)`,
      why: `${m.arms.diffCm} cm apart (${m.arms.diffPct}%)`,
      how: [
        'One-arm curls and extensions',
        `Start each set with the ${weak} arm`,
        'Stop the other arm at the same reps',
      ],
      more: 'Past about 1 cm and 3% it is more than tape error.',
      target: `${weak === 'left' ? 'Left' : 'Right'} arm ${m.arms.bigger} cm`,
      focus: ['Biceps', 'Triceps'],
    });
  }

  if (m.arms && m.arms.toChest != null && sex === 'male' && m.arms.toChest < ARM_CHEST_IDEAL - 0.02) {
    out.push({
      id: 'arms',
      title: 'Bring your arms up',
      why: `Arm is ${Math.round(m.arms.toChest * 100)}% of chest (aim ${Math.round(ARM_CHEST_IDEAL * 100)}%)`,
      how: [
        'Direct curls and triceps work',
        '8–14 sets a week each, on top of presses and rows',
      ],
      more: null,
      target: `${m.arms.armFor} cm arms`,
      focus: ['Biceps', 'Triceps'],
    });
  }

  if (!out.length && (m.vTaper || m.bodyFat != null)) {
    out.push({
      id: 'maintain',
      title: 'Hold the proportions, add size evenly',
      why: 'Ratios at or past their targets',
      how: ['Train every muscle group', 'Hold the waist while the rest grows'],
      more: null,
      target: null,
      focus: [],
    });
  }
  return out;
}

/** Optimiser muscle groups to give extra weekly sets, from the top priorities. */
export function physiqueFocus(sex, raw, max = 2) {
  const groups = [];
  for (const p of physiquePriorities(sex, raw).slice(0, max + 1)) {
    for (const g of p.focus) if (!groups.includes(g)) groups.push(g);
  }
  return groups.slice(0, 3);
}

/** What each stat means, why it matters and where it comes from. */
export const EXPLAIN = [
  { key: 'bodyFat', title: 'Body fat %', good: 'Men 10–18 · women 18–28', text: 'Share of your weight that is fat. From calipers (Jackson-Pollock, 3 sites) when you enter them, else the US Navy tape formula. Each is about ±3–4 points against DEXA; keep to one method and the weekly trend is what counts.' },
  { key: 'lean', title: 'Fat / lean mass', good: 'Lean up, fat flat or down', text: 'Your weight split into fat and everything else (muscle, bone, water). Shows whether a bulk or cut is working.' },
  { key: 'vTaper', title: 'V-taper', good: '1.618 golden ratio', text: 'Shoulders ÷ waist, both measured around. Untrained men sit near 1.3. Wider delts and lats or a smaller waist raise it.' },
  { key: 'chestWaist', title: 'Chest ÷ waist', good: 'About 1.4', text: 'Upper body against your middle. The chest tape also takes in your back.' },
  { key: 'whtr', title: 'Waist ÷ height', good: 'Under 0.5', text: 'The best simple health signal here; tracks heart and metabolic risk better than BMI.' },
  { key: 'bmi', title: 'BMI', good: '18.5–25, with caveats', text: 'Weight ÷ height². Can\u2019t tell muscle from fat, so lifters often read “overweight”. Read it next to body fat.' },
  { key: 'ffmi', title: 'FFMI', good: 'Men 20–23 · women 16–19', text: 'Lean mass for your height. Men average 19–20; past 25 is rare without drugs.' },
  { key: 'arms', title: 'Arm balance', good: 'Within 1 cm', text: 'Left against right, flexed. More than 1 cm means one side does less of the work.' },
];

const MEASURE_HINTS = {
  height:    'Barefoot, against a wall',
  weight:    'Morning, before food',
  neck:      'Below Adam\u2019s apple',
  shoulders: 'Widest part of delts',
  chest:     'Nipple line, exhale',
  waistMale: 'At the navel, relaxed',
  waistFemale: 'Narrowest point, relaxed',
  hip:       'Widest part of glutes',
  arm:       'Biceps peak, flexed',
};
/** Full placement instructions, one per tape field, for the "how to measure" list. */
const MEASURE_STEPS = {
  height:    'Barefoot, back against a wall',
  weight:    'Morning, after the toilet, before food',
  neck:      'Tape around, just below the Adam’s apple',
  shoulders: 'Tape around both shoulders at the widest part of the delts, arms down',
  chest:     'Tape around at nipple line, under the armpits, after breathing out',
  waistMale: 'Tape around at the navel, relaxed, after breathing out',
  waistFemale: 'Tape around the narrowest part, relaxed, after breathing out',
  hip:       'Tape around the widest part of the glutes, feet together',
  arm:       'Tape around the biceps peak, arm flexed',
};
function pick(table, field, sex) {
  if (field === 'waist') return sexOf(sex) === 'female' ? table.waistFemale : table.waistMale;
  if (field === 'armLeft' || field === 'armRight') return table.arm;
  return table[field] || '';
}
/** A few words under the field. */
export function measureHint(field, sex) { return pick(MEASURE_HINTS, field, sex); }
/** The full instruction. */
export function measureStep(field, sex) { return pick(MEASURE_STEPS, field, sex); }

// Where the tape ring sits on the little figure, by field: [cx, y, half-width].
// The Hunter's left arm sits on the figure's right, as in a mirror.
const RING = {
  neck: [16, 9, 3.2], shoulders: [16, 15, 10], chest: [16, 19, 8], waist: [16, 28, 6.5], hip: [16, 34, 8],
  armLeft: [24.6, 17, 2.6], armRight: [7.4, 17, 2.6],
};
const FIGURE = '<circle cx="16" cy="4.5" r="3" /><path d="M13.6 8h4.8v2.4l5.6 2.1 3 9.4-2.2.7-2.4-6.6v8.6l1 2.6 0 0-.4 8.4h-15l-.4-8.4 1-2.6v-8.6l-2.4 6.6-2.2-.7 3-9.4 5.6-2.1z" />';
// A tape ring in two halves: the back arc behind the body, the front arc over it.
function ringHalves(field, bright) {
  const [cx, y, rx] = RING[field];
  const ry = Math.max(1, rx * (field.startsWith('arm') ? 0.42 : 0.22)).toFixed(1);
  const back = `<path d="M${cx - rx} ${y} A${rx} ${ry} 0 0 1 ${cx + rx} ${y}" />`;
  const front = `<path d="M${cx - rx} ${y} A${rx} ${ry} 0 0 0 ${cx + rx} ${y}" />`;
  const col = bright ? '#FFD66B' : 'rgba(255,214,107,.35)';
  return {
    back: `<g fill="none" stroke="${col}" stroke-opacity=".45" stroke-width="1" stroke-dasharray="1.2 1">${back}</g>`,
    front: `<g fill="none" stroke="${col}" stroke-width="1.4" stroke-linecap="round">${front}</g>`,
  };
}
/**
 * A small figure with the tape drawn as a ring around the measured spot, so
 * the field reads "around", not "across".
 */
export function tapeIconSvg(field, size = 26) {
  if (!RING[field]) return '';
  const r = ringHalves(field, true);
  return `<svg viewBox="0 0 32 40" width="${size}" height="${Math.round(size * 1.25)}" aria-hidden="true" style="flex-shrink:0;">` +
    r.back + `<g fill="rgba(91,168,255,.16)" stroke="rgba(91,168,255,.45)" stroke-width=".6">${FIGURE}</g>` + r.front + '</svg>';
}
/**
 * The hero figure: every tape spot ringed, bright where a value is entered.
 * measured: { neck: true, waist: true, ... }
 */
export function bodyScanSvg(measured = {}, size = 96, fields = ['neck', 'shoulders', 'chest', 'waist', 'armLeft', 'armRight']) {
  const rings = fields.filter(f => RING[f]).map(f => ringHalves(f, !!measured[f]));
  return `<svg viewBox="-2 -2 36 44" width="${size}" height="${Math.round(size * 44 / 36)}" aria-hidden="true" style="flex-shrink:0;overflow:visible;">` +
    '<defs><radialGradient id="ciScanGlow" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="rgba(91,168,255,.28)"/><stop offset="1" stop-color="rgba(91,168,255,0)"/></radialGradient>' +
    '<linearGradient id="ciScanBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(91,168,255,.32)"/><stop offset="1" stop-color="rgba(91,168,255,.08)"/></linearGradient></defs>' +
    '<ellipse cx="16" cy="20" rx="17" ry="21" fill="url(#ciScanGlow)" />' +
    '<ellipse cx="16" cy="41" rx="9" ry="1.2" fill="rgba(91,168,255,.18)" />' +
    rings.map(r => r.back).join('') +
    `<g fill="url(#ciScanBody)" stroke="rgba(120,185,255,.7)" stroke-width=".5">${FIGURE}</g>` +
    rings.map(r => r.front).join('') + '</svg>';
}

// Smallest change that is more than tape and scale noise, per metric.
const NOISE = { armMuscle: 0.5, thighMuscle: 0.6, weight: 0.3, bodyFat: 0.8, waist: 0.5, shoulders: 0.5, chest: 0.5, arms: 0.5, vTaper: 0.02, leanKg: 0.8, fatKg: 0.8 };
// Which way is progress: 1 = up is good, -1 = down is good, 0 = neither (depends on the goal).
const DIRECTION = { armMuscle: 1, thighMuscle: 1, weight: 0, bodyFat: -1, waist: -1, shoulders: 1, chest: 1, arms: 1, vTaper: 1, leanKg: 1, fatKg: -1 };
const DELTA_ROWS = [
  ['weight', 'Weight', 'kg'], ['bodyFat', 'Body fat', '%'], ['leanKg', 'Lean mass', 'kg'], ['fatKg', 'Fat mass', 'kg'],
  ['waist', 'Waist', 'cm'], ['shoulders', 'Shoulders', 'cm'], ['chest', 'Chest', 'cm'], ['arms', 'Arms', 'cm'], ['armMuscle', 'Arm muscle', 'cm'], ['thighMuscle', 'Thigh muscle', 'cm'], ['vTaper', 'V-taper', '×'],
];

function deltaValues(sex, raw) {
  const m = bodyMetrics(sex, raw);
  const c = cleanMeasurements(raw);
  const arms = c.armLeft || c.armRight ? round1(((c.armLeft || c.armRight) + (c.armRight || c.armLeft)) / 2) : null;
  return {
    weight: c.weight, bodyFat: m.bodyFat, leanKg: m.leanKg, fatKg: m.fatKg, waist: c.waist,
    shoulders: c.shoulders && c.shoulders >= RANGES.shoulders[0] ? c.shoulders : null,
    chest: c.chest && c.chest >= RANGES.chest[0] ? c.chest : null,
    arms, vTaper: m.vTaper ? m.vTaper.ratio : null, source: m.bodyFatSource,
    armMuscle: m.limbs && m.limbs.arm ? m.limbs.arm.avgCm : null, thighMuscle: m.limbs && m.limbs.thigh ? m.limbs.thigh.cm : null,
  };
}

/**
 * What changed between two check-ins, for the screen shown after saving.
 * Rows only for metrics both check-ins have. Each row: { key, label, unit,
 * prev, curr, diff, status: 'better' | 'worse' | 'flat' | 'neutral' }.
 * Changes inside tape/scale noise are 'flat'. Also a headline and a one-line verdict.
 */
export function checkinProgress(sex, prev, curr) {
  if (!curr) return null;
  const now = deltaValues(sex, curr);
  if (!prev) return { first: true, rows: [], better: 0, worse: 0, headline: 'Baseline set', verdict: 'Your first scan is saved. Next week the changes show here.' };
  const before = deltaValues(sex, prev);
  const rows = [];
  // calipers and the tape formula read a few points apart: never compare across methods
  const sameMethod = now.source === before.source;
  for (const [key, label, unit] of DELTA_ROWS) {
    if (now[key] == null || before[key] == null) continue;
    if (!sameMethod && (key === 'bodyFat' || key === 'leanKg' || key === 'fatKg')) continue;
    const decimals = key === 'vTaper' ? 2 : 1;
    const diff = Math.round((now[key] - before[key]) * 10 ** decimals) / 10 ** decimals;
    const flat = Math.abs(now[key] - before[key]) < NOISE[key];
    const status = flat ? 'flat' : DIRECTION[key] === 0 ? 'neutral' : (diff * DIRECTION[key] > 0 ? 'better' : 'worse');
    rows.push({ key, label, unit, prev: before[key], curr: now[key], diff, status });
  }
  const better = rows.filter(r => r.status === 'better').length;
  const worse = rows.filter(r => r.status === 'worse').length;
  const by = Object.fromEntries(rows.map(r => [r.key, r]));
  let headline, verdict;
  if (by.leanKg && by.fatKg && by.leanKg.status === 'better' && by.fatKg.status === 'better') {
    headline = 'Recomposing'; verdict = 'Lean mass up and fat down at once: the best case.';
  } else if (by.leanKg && by.leanKg.status === 'better' && by.fatKg && by.fatKg.status !== 'better') {
    headline = 'Building'; verdict = 'Lean mass is up. Watch the waist so the gain stays lean.';
  } else if (by.fatKg && by.fatKg.status === 'better' && !(by.leanKg && by.leanKg.status === 'worse')) {
    headline = 'Cutting clean'; verdict = 'Fat is down and lean mass held.';
  } else if (by.leanKg && by.leanKg.status === 'worse') {
    headline = 'Losing muscle'; verdict = 'Lean mass is down. Eat more protein and keep the lifts heavy.';
  } else if (better > worse) {
    headline = 'Moving the right way'; verdict = `${better} of ${better + worse} changes are progress.`;
  } else if (worse > better) {
    headline = 'Slipping'; verdict = `${worse} of ${better + worse} changes went the wrong way. One week is noise; two is a trend.`;
  } else {
    headline = 'Holding steady'; verdict = 'Nothing moved beyond tape error. Normal week to week; judge it over a month.';
  }
  return { first: false, rows, better, worse, headline, verdict };
}
