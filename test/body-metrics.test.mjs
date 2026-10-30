/* Tests for the body metrics.  Run:  node test/body-metrics.test.mjs
   No dependencies and no runner, like the other tests here: a plain script
   that exits non-zero on failure. */

import {
  navyBodyFat, bodyFatCategory, bmi, bmiCategory, ffmi, waistToHeight,
  measurementWarnings, bodyMetrics, physiquePriorities, physiqueFocus,
  measureHint, measureStep, tapeIconSvg, bodyScanSvg, checkinProgress, jacksonPollock3, jacksonPollock7, calibrationOffset, fatDistribution, limbMuscle, SKINFOLD_SITES_7, SKINFOLD_EXTRA, cleanSkinfolds, skinfoldStep, skinfoldHint, SKINFOLD_SITES, EXPLAIN, GOLDEN_RATIO,
} from '../body-metrics.js';

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`);
}
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

// ── US Navy body fat ───────────────────────────────────────────────────
// The metric equations must agree with the original inch equations
// (Hodgdon & Beckett 1984) for the same body.
const IN = 2.54;
const navyInchesMale = (w, n, h) => 86.010 * Math.log10(w - n) - 70.041 * Math.log10(h) + 36.76;
const navyInchesFemale = (w, hip, n, h) => 163.205 * Math.log10(w + hip - n) - 97.684 * Math.log10(h) - 78.387;
for (const [w, n, h] of [[86, 38, 178], [90, 39.5, 166], [100, 40, 185], [78, 37, 172]]) {
  const metric = navyBodyFat('male', { waist: w, neck: n, height: h });
  const inches = navyInchesMale(w / IN, n / IN, h / IN);
  check(`male metric matches inch formula (${w}/${n}/${h})`, near(metric, inches, 0.6), `${metric} vs ${inches.toFixed(2)}`);
}
for (const [w, hip, n, h] of [[72, 98, 33, 165], [80, 104, 34, 160], [68, 92, 31, 170]]) {
  const metric = navyBodyFat('female', { waist: w, hip, neck: n, height: h });
  const inches = navyInchesFemale(w / IN, hip / IN, n / IN, h / IN);
  check(`female metric matches inch formula (${w}/${hip}/${n}/${h})`, near(metric, inches, 0.6), `${metric} vs ${inches.toFixed(2)}`);
}
check('90/39.5 at 166 cm is 21.2% (same as the formula in the app before)', navyBodyFat('male', { waist: 90, neck: 39.5, height: 166 }) === 21.2);
check('female without hips gives no estimate (never the male formula)', navyBodyFat('female', { waist: 72, neck: 33, height: 165 }) === null);
check('no height, no estimate (no silent 166 cm default)', navyBodyFat('male', { waist: 90, neck: 39.5 }) === null);
check('neck >= waist gives no estimate', navyBodyFat('male', { waist: 38, neck: 40, height: 180 }) === null);
check('impossible height gives no estimate', navyBodyFat('male', { waist: 90, neck: 39, height: 66 }) === null);
check('strings are read as numbers', navyBodyFat('male', { waist: '90', neck: '39.5', height: '166' }) === 21.2);
check('taller at the same tape reads leaner', navyBodyFat('male', { waist: 90, neck: 39, height: 185 }) < navyBodyFat('male', { waist: 90, neck: 39, height: 165 }));

check('ACE categories (male)', bodyFatCategory('male', 12) === 'Athletic' && bodyFatCategory('male', 20.8) === 'Average' && bodyFatCategory('male', 26) === 'High');
check('ACE categories (female)', bodyFatCategory('female', 23) === 'Fit' && bodyFatCategory('female', 33) === 'High');

// ── BMI, FFMI, waist-to-height ─────────────────────────────────────────
check('BMI 73.9 kg at 166 cm = 26.8', bmi(73.9, 166) === 26.8, String(bmi(73.9, 166)));
check('BMI WHO bands', bmiCategory(18) === 'Underweight' && bmiCategory(24.9) === 'Healthy range' && bmiCategory(25) === 'Overweight' && bmiCategory(30) === 'Obese');
check('BMI needs a real height', bmi(80, null) === null && bmi(80, 50) === null);
check('FFMI normalised at 1.8 m equals raw', ffmi(64.8, 180) === 20);
check('FFMI adds 6.1 per metre under 1.8 m', near(ffmi(58.5, 166), 58.5 / 1.66 ** 2 + 6.1 * 0.14, 0.05));
check('waist-to-height', waistToHeight(90, 180) === 0.5);

// ── warnings: width typed where circumference belongs ─────────────────
const screenshot = { weight: 73.9, height: 166, waist: 90, neck: 39.5, shoulders: 52.5, chest: 95, armLeft: 33, armRight: 33 };
const warn = measurementWarnings(screenshot);
check('52.5 cm shoulders flagged as a width', /width/.test(warn.shoulders || ''), JSON.stringify(warn));
check('a normal chest is not flagged', !warn.chest, JSON.stringify(warn));
check('shoulders smaller than waist flagged', !!measurementWarnings({ waist: 100, shoulders: 95 }).shoulders);
check('neck >= waist flagged', !!measurementWarnings({ waist: 38, neck: 40 }).neck);
check('weight warning speaks kg', /kg/.test(measurementWarnings({ weight: 500 }).weight || ''));
check('good values: no warnings', Object.keys(measurementWarnings({ weight: 80, height: 180, waist: 84, neck: 39, shoulders: 120, chest: 104, armLeft: 37, armRight: 37 })).length === 0);

// ── bodyMetrics ────────────────────────────────────────────────────────
const sm = bodyMetrics('male', screenshot);
check('a width gives no V-taper (not 0.58)', sm.vTaper === null, JSON.stringify(sm.vTaper));
check('fat + lean = weight', near(sm.fatKg + sm.leanKg, 73.9, 0.11), `${sm.fatKg} + ${sm.leanKg}`);
const fixed = bodyMetrics('male', { ...screenshot, shoulders: 117 });
check('V-taper is shoulders ÷ waist', fixed.vTaper.ratio === 1.3, JSON.stringify(fixed.vTaper));
check('golden shoulders = waist × 1.618', fixed.vTaper.shouldersFor === Math.round(90 * GOLDEN_RATIO * 10) / 10);
check('golden waist = shoulders ÷ 1.618', fixed.vTaper.waistFor === Math.round(117 / GOLDEN_RATIO * 10) / 10);
check('gap to golden shoulders', fixed.vTaper.gapShouldersCm === 28.6, String(fixed.vTaper.gapShouldersCm));
check('chest ÷ waist', fixed.chestWaist.ratio === 1.06);
check('next V-taper step is the next 0.1', fixed.vTaper.next === 1.4 && fixed.vTaper.shouldersForNext === 126, JSON.stringify(fixed.vTaper));
check('next chest step', fixed.chestWaist.next === 1.1 && fixed.chestWaist.chestForNext === 99, JSON.stringify(fixed.chestWaist));
check('next step never passes the ideal', bodyMetrics('male', { waist: 80, shoulders: 128 }).vTaper.next === GOLDEN_RATIO);
check('equal arms are not asymmetric', fixed.arms.asymmetric === false && fixed.arms.diffCm === 0);
const lop = bodyMetrics('male', { armLeft: 34, armRight: 36 });
check('2 cm arm gap is asymmetric, left weak', lop.arms.asymmetric && lop.arms.weakSide === 'left', JSON.stringify(lop.arms));
check('0.5 cm arm gap is tape error', !bodyMetrics('male', { armLeft: 35.5, armRight: 36 }).arms.asymmetric);
const fem = bodyMetrics('female', { weight: 62, height: 165, waist: 72, neck: 33 });
check('female missing hips is reported', fem.missing.hip && fem.bodyFat === null);
check('waist-to-hip for women', bodyMetrics('female', { waist: 70, hip: 100 }).waistToHip === 0.7);
check('missing height is reported', bodyMetrics('male', { waist: 90, neck: 39 }).missing.height);

// ── priorities ─────────────────────────────────────────────────────────
const pr = physiquePriorities('male', { ...screenshot, shoulders: 117 });
check('high waist-to-height puts the waist first', pr[0].id === 'waist', pr.map(p => p.id).join(','));
check('shoulders follow', pr.some(p => p.id === 'shoulders'), pr.map(p => p.id).join(','));
check('waist target is a cut, not a gain', /cm waist/.test(pr[0].target || '') && parseFloat(pr[0].target) < 90, pr[0].target);
const lean = physiquePriorities('male', { weight: 80, height: 180, waist: 80, neck: 39, shoulders: 120, chest: 104, armLeft: 36, armRight: 38.5 });
check('lean body: no waist priority', !lean.some(p => p.id === 'waist'), lean.map(p => p.id).join(','));
check('lean body: arm balance named with the weak side', lean.some(p => p.id === 'arm-balance' && /left/.test(p.title)));
const golden = physiquePriorities('male', { weight: 80, height: 180, waist: 76, neck: 39, shoulders: 125, chest: 108, armLeft: 39, armRight: 39 });
check('all ratios met: maintain', golden.length === 1 && golden[0].id === 'maintain', golden.map(p => p.id).join(','));
check('nothing measured: no priorities', physiquePriorities('male', {}).length === 0);
check('focus groups come from the top priorities', JSON.stringify(physiqueFocus('male', { ...screenshot, shoulders: 117 })) === JSON.stringify(['Shoulders', 'Back', 'Chest']), JSON.stringify(physiqueFocus('male', { ...screenshot, shoulders: 117 })));
check('women get no male chest/arm proportion targets', !physiquePriorities('female', { waist: 70, hip: 98, chest: 85, armLeft: 26, armRight: 26 }).some(p => p.id === 'chest' || p.id === 'arms'));


// ── progress between check-ins ─────────────────────────────────────────
{
  const base = { weight: 80, height: 180, waist: 86, neck: 39, shoulders: 120, chest: 104, armLeft: 36, armRight: 36 };
  check('first check-in: baseline, no rows', checkinProgress('male', null, base).first === true);
  const cut = checkinProgress('male', base, { ...base, weight: 78.5, waist: 83 });
  check('waist down is better', cut.rows.find(r => r.key === 'waist').status === 'better' && cut.rows.find(r => r.key === 'waist').diff === -3);
  check('weight is neutral, not good or bad', cut.rows.find(r => r.key === 'weight').status === 'neutral');
  check('V-taper rises as the waist drops', cut.rows.find(r => r.key === 'vTaper').status === 'better');
  const noise = checkinProgress('male', base, { ...base, weight: 80.1, waist: 86.2 });
  check('inside tape error is flat', noise.rows.every(r => r.status === 'flat' || r.status === 'neutral' && r.key === 'weight' ? true : r.status === 'flat'), JSON.stringify(noise.rows));
  check('flat week reads as steady', noise.headline === 'Holding steady', noise.headline);
  const recomp = checkinProgress('male', base, { ...base, weight: 80, waist: 82, chest: 106, armLeft: 37, armRight: 37 });
  check('lean up and fat down is recomposing', recomp.headline === 'Recomposing', recomp.headline + JSON.stringify(recomp.rows.map(r => [r.key, r.status])));
  const slip = checkinProgress('male', base, { ...base, waist: 90, shoulders: 118 });
  check('wider waist and narrower shoulders slip', slip.worse >= 2 && slip.headline !== 'Moving the right way', slip.headline);
  check('a metric missing from one side gives no row', !checkinProgress('male', { weight: 80 }, base).rows.some(r => r.key === 'waist'));
  const wide = checkinProgress('male', { ...base, shoulders: 52 }, base);
  check('a shoulder width is never compared', !wide.rows.some(r => r.key === 'shoulders'));
}

// ── skin-fold calipers ─────────────────────────────────────────────────
{
  const base = { weight: 80, height: 180, waist: 86, neck: 39, shoulders: 120, chest: 104, armLeft: 36, armRight: 36 };
  check('men pinch chest, abdomen, thigh; women triceps, suprailiac, thigh', SKINFOLD_SITES.male.join() === 'chest,abdomen,thigh' && SKINFOLD_SITES.female.join() === 'triceps,suprailiac,thigh');
  // sum 60 mm, age 30 (men): BD 1.057816 -> 17.9%
  check('Jackson-Pollock men, 60 mm at 30 = 17.9%', jacksonPollock3('male', { chest: 15, abdomen: 25, thigh: 20 }, 30) === 17.9, String(jacksonPollock3('male', { chest: 15, abdomen: 25, thigh: 20 }, 30)));
  // sum 70 mm, age 30 (women): BD 1.037083 -> 27.3%
  check('Jackson-Pollock women, 70 mm at 30 = 27.3%', jacksonPollock3('female', { triceps: 20, suprailiac: 25, thigh: 25 }, 30) === 27.3, String(jacksonPollock3('female', { triceps: 20, suprailiac: 25, thigh: 25 }, 30)));
  check('thicker folds read fatter', jacksonPollock3('male', { chest: 20, abdomen: 30, thigh: 25 }, 30) > jacksonPollock3('male', { chest: 10, abdomen: 15, thigh: 12 }, 30));
  check('older at the same folds reads fatter', jacksonPollock3('male', { chest: 15, abdomen: 25, thigh: 20 }, 50) > jacksonPollock3('male', { chest: 15, abdomen: 25, thigh: 20 }, 25));
  check('a missing site gives no reading', jacksonPollock3('male', { chest: 15, abdomen: 25 }, 30) === null);
  check('age outside 18-61 gives no reading', jacksonPollock3('male', { chest: 15, abdomen: 25, thigh: 20 }, 16) === null && jacksonPollock3('male', { chest: 15, abdomen: 25, thigh: 20 }, 70) === null);
  check('a fold in cm (not mm) gives no reading', jacksonPollock3('male', { chest: 1.5, abdomen: 2.5, thigh: 2 }, 30) === null);
  check('women’s sites are not read from the men’s', jacksonPollock3('female', { chest: 15, abdomen: 25, thigh: 20 }, 30) === null);
  check('clean skinfolds keeps only this sex’s sites', Object.keys(cleanSkinfolds('female', { chest: 10, triceps: 12 })).join() === 'triceps,suprailiac,thigh');
  const withCal = bodyMetrics('male', { ...base, age: 30, skinfolds: { chest: 8, abdomen: 14, thigh: 10 } });
  check('calipers win when entered', withCal.bodyFatSource === 'calipers' && withCal.bodyFat === withCal.bodyFatCalipers && withCal.bodyFatTape !== null, JSON.stringify([withCal.bodyFatSource, withCal.bodyFat, withCal.bodyFatTape]));
  check('fat and lean mass follow the caliper reading', Math.abs(withCal.fatKg - 80 * withCal.bodyFat / 100) < 0.1);
  const noAge = bodyMetrics('male', { ...base, skinfolds: { chest: 8, abdomen: 14, thigh: 10 } });
  check('no age: back to the tape formula', noAge.bodyFatSource === 'tape' && noAge.bodyFatCalipers === null);
  check('no folds: tape source', bodyMetrics('male', base).bodyFatSource === 'tape');
  const w = measurementWarnings({ sex: 'male', age: 70, skinfolds: { chest: 1.5, abdomen: 20 } });
  check('warns on a cm fold, a missing site and an age outside the formula', !!w.sf_chest && !!w.sf_missing && !!w.age, JSON.stringify(w));
  check('no warnings when folds are blank', !('sf_missing' in measurementWarnings({ sex: 'male', age: 30 })));
  check('pinch steps and hints exist for every site', ['chest', 'abdomen', 'thigh', 'triceps', 'suprailiac'].every(k => skinfoldStep(k).length > 20 && skinfoldHint(k).length <= 26));
  // progress never compares across methods
  const tapePrev = { ...base };
  const calCurr = { ...base, waist: 83, age: 30, skinfolds: { chest: 8, abdomen: 14, thigh: 10 } };
  const cross = checkinProgress('male', tapePrev, calCurr);
  check('no body-fat rows across methods', !cross.rows.some(r => ['bodyFat', 'leanKg', 'fatKg'].includes(r.key)) && cross.rows.some(r => r.key === 'waist'), JSON.stringify(cross.rows.map(r => r.key)));
  const calPrev = { ...base, age: 30, skinfolds: { chest: 10, abdomen: 18, thigh: 12 } };
  check('same method: body fat compared', checkinProgress('male', calPrev, calCurr).rows.some(r => r.key === 'bodyFat'));
}


// ── 7-site calipers, where fat sits, limb muscle ───────────────────────
const f7 = { chest: 10, midaxillary: 10, triceps: 12, subscapular: 14, abdomen: 20, suprailiac: 15, thigh: 19 }; // sums to 100
check('JP7 male S=100 age 30 matches the published equation', near(jacksonPollock7('male', f7, 30), 14.63, 0.06), String(jacksonPollock7('male', f7, 30)));
const f7w = { chest: 12, midaxillary: 14, triceps: 20, subscapular: 18, abdomen: 22, suprailiac: 16, thigh: 18 }; // sums to 120
check('JP7 female S=120 age 30 matches the published equation', near(jacksonPollock7('female', f7w, 30), 23.75, 0.06), String(jacksonPollock7('female', f7w, 30)));
check('JP7 needs all seven folds', jacksonPollock7('male', { ...f7, thigh: null }, 30) === null);
check('JP7 outside the age range gives nothing', jacksonPollock7('male', f7, 17) === null && jacksonPollock7('male', f7, 62) === null);
check('JP7 rejects an out-of-range fold', jacksonPollock7('male', { ...f7, chest: 1 }, 30) === null);
check('7 sites listed, 4 extra per sex', SKINFOLD_SITES_7.length === 7 && SKINFOLD_EXTRA.male.length === 4 && SKINFOLD_EXTRA.female.length === 4);
const m7 = bodyMetrics('male', { weight: 77, height: 175, waist: 88, neck: 38, skinfolds: f7, age: 30 });
check('7 folds win over 3 and the tape, source says so', m7.bodyFatSource === 'calipers7' && near(m7.bodyFat, jacksonPollock7('male', f7, 30), 0.001) && m7.bodyFatTape != null);
const m3 = bodyMetrics('male', { weight: 77, height: 175, waist: 88, neck: 38, skinfolds: { chest: 10, abdomen: 20, thigh: 19 }, age: 30 });
check('3 core folds still give the 3-site reading', m3.bodyFatSource === 'calipers' && m3.distribution === null);
check('calipers7 and calipers are never compared in progress rows', !checkinProgress('male', { weight: 77, height: 175, waist: 88, neck: 38, skinfolds: { chest: 10, abdomen: 20, thigh: 19 }, age: 30 }, { weight: 76, height: 175, waist: 87, neck: 38, skinfolds: f7, age: 30 }).rows.some(r => r.key === 'bodyFat'));
const d = fatDistribution('male', f7);
check('distribution: trunk mean over limb mean', d && near(d.trunkMm, 13.8, 0.05) && near(d.limbMm, 15.5, 0.05) && near(d.ratio, 0.89, 0.01), JSON.stringify(d && [d.trunkMm, d.limbMm, d.ratio]));
check('distribution: even label, biggest sites listed', d.label === 'Even' && d.top[0].site === 'abdomen' && d.top[1].site === 'thigh');
check('distribution: central trunk for a man', fatDistribution('male', { ...f7, abdomen: 45, subscapular: 30, suprailiac: 35, chest: 20, midaxillary: 25, triceps: 12, thigh: 14 }).label === 'Central');
check('distribution: women bands sit lower', fatDistribution('female', { chest: 8, midaxillary: 8, triceps: 25, subscapular: 12, abdomen: 14, suprailiac: 12, thigh: 30 }).label === 'Lower-body leaning');
check('distribution needs all seven', fatDistribution('male', { chest: 10, abdomen: 20, thigh: 19 }) === null);
// limb muscle: corrected girth = girth - pi x fold(cm); arm area = girth^2/4pi - 10 (men)
const lm = limbMuscle('male', { armLeft: 34, armRight: 35, thigh: 58, skinfolds: f7 });
check('corrected arm girth subtracts pi x triceps fold', lm.arm && near(lm.arm.right, 35 - Math.PI * 1.2, 0.06) && near(lm.arm.left, 34 - Math.PI * 1.2, 0.06));
check('arm muscle area uses the Heymsfield bone correction', near(lm.arm.areaCm2, lm.arm.avgCm ** 2 / (4 * Math.PI) - 10, 0.15), String(lm.arm.areaCm2));
check('female bone correction is 6.5', near(limbMuscle('female', { armLeft: 30, skinfolds: { triceps: 15 } }).arm.areaCm2, (30 - Math.PI * 1.5) ** 2 / (4 * Math.PI) - 6.5, 0.15));
check('corrected thigh uses the thigh fold', lm.thigh && near(lm.thigh.cm, 58 - Math.PI * 1.9, 0.06));
check('muscle share is the corrected over raw girth', lm.arm.share > 0.8 && lm.arm.share < 1 && lm.thigh.share < 1);
check('arm needs the triceps fold, thigh needs the thigh circumference', limbMuscle('male', { armLeft: 34, skinfolds: { chest: 10 } }) === null && limbMuscle('male', { thigh: 58, skinfolds: { thigh: 19 } }).thigh && !limbMuscle('male', { armLeft: 34, skinfolds: { triceps: 12 } }).thigh);
const grow = checkinProgress('male', { weight: 77, height: 175, waist: 88, neck: 38, armLeft: 34, armRight: 34, skinfolds: { triceps: 12 }, age: 30 }, { weight: 77.4, height: 175, waist: 88, neck: 38, armLeft: 35, armRight: 35, skinfolds: { triceps: 16 }, age: 30 });
check('an arm that grew from fat shows no muscle gain', grow.rows.find(r => r.key === 'arms').status === 'better' && grow.rows.find(r => r.key === 'armMuscle').status === 'flat', JSON.stringify(grow.rows.map(r => [r.key, r.status])));
check('warnings: extra site range, partial extras, thigh circumference', (() => { const w = measurementWarnings({ sex: 'male', skinfolds: { midaxillary: 120 }, thigh: 20 }); return w.sf_midaxillary && w.sf7_missing && w.thigh; })());

// ── tape calibrated by the last caliper scan ───────────────────────────
const fullScan = { weight: 77, height: 175, waist: 88, neck: 38, skinfolds: f7, age: 30 };
const off = calibrationOffset('male', fullScan);
check('offset is caliper minus tape', near(off, bodyMetrics('male', fullScan).bodyFatCalipers - navyBodyFat('male', { waist: 88, neck: 38, height: 175 }), 0.06), String(off));
check('no calipers, no offset', calibrationOffset('male', { weight: 77, height: 175, waist: 88, neck: 38 }) === null);
check('an implausible gap (over 8 points) is not used', calibrationOffset('male', { ...fullScan, skinfolds: { ...f7, chest: 58, abdomen: 58, thigh: 58, midaxillary: 58, triceps: 58, subscapular: 58, suprailiac: 58 } }) === null);
const weekly = bodyMetrics('male', { weight: 76.5, height: 175, waist: 87, neck: 38, tapeOffset: off });
check('weekly tape plus the offset reads on the caliper scale', weekly.bodyFatSource === 'tapeCal' && near(weekly.bodyFat, weekly.bodyFatTape + off, 0.06), JSON.stringify([weekly.bodyFat, weekly.bodyFatTape, off]));
check('calipers in the same check-in win over the offset', bodyMetrics('male', { ...fullScan, tapeOffset: 3 }).bodyFatSource === 'calipers7');
check('no offset keeps the plain tape reading', bodyMetrics('male', { weight: 76.5, height: 175, waist: 87, neck: 38 }).bodyFatSource === 'tape');
check('two calibrated weeks compare body fat, calibrated against caliper does not', (() => {
  const a = { weight: 77, height: 175, waist: 88, neck: 38, tapeOffset: off }, b = { weight: 76, height: 175, waist: 86.5, neck: 38, tapeOffset: off };
  const same = checkinProgress('male', a, b).rows.some(r => r.key === 'bodyFat');
  const mixed = checkinProgress('male', a, { ...fullScan, waist: 86.5 }).rows.some(r => r.key === 'bodyFat');
  return same && !mixed;
})());

// ── copy and icons ─────────────────────────────────────────────────────
check('every full step says around', ['neck', 'shoulders', 'chest', 'waist', 'hip', 'armLeft'].every(f => /around/.test(measureStep(f, 'male'))));
check('field hints stay short', ['neck', 'shoulders', 'chest', 'waist', 'hip', 'armLeft', 'height', 'weight'].every(f => measureHint(f, 'male').length <= 26));
check('priorities: how is a short list', physiquePriorities('male', { ...screenshot, shoulders: 117 }).every(p => Array.isArray(p.how) && p.how.every(h => h.length <= 60)));
check('female waist is the narrowest point (Navy protocol)', /narrowest/i.test(measureHint('waist', 'female')) && /navel/.test(measureHint('waist', 'male')) && /narrowest/.test(measureStep('waist', 'female')));
check('tape icon draws a front and back arc for each tape field', ['neck', 'shoulders', 'chest', 'waist', 'hip', 'armLeft', 'armRight'].every(f => (tapeIconSvg(f).match(/ A/g) || []).length === 2));
check('body scan: measured rings bright, others dim', (bodyScanSvg({ waist: true }).match(/#FFD66B/g) || []).length === 2 && /rgba\(255,214,107,\.35\)/.test(bodyScanSvg({ waist: true })));
check('no tape icon for weight', tapeIconSvg('weight') === '');
check('every explained stat has text', EXPLAIN.every(e => e.title && e.text.length > 40));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
