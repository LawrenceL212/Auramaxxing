/* Tests for the body metrics.  Run:  node test/body-metrics.test.mjs
   No dependencies and no runner, like the other tests here: a plain script
   that exits non-zero on failure. */

import {
  navyBodyFat, bodyFatCategory, bmi, bmiCategory, ffmi, waistToHeight,
  measurementWarnings, bodyMetrics, physiquePriorities, physiqueFocus,
  measureHint, measureStep, tapeIconSvg, bodyScanSvg, checkinProgress, EXPLAIN, GOLDEN_RATIO,
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
