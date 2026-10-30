/* Tests for the trainer read.  node test/trainer-insights.test.mjs */
import { BASE_EXERCISES } from '../exercises.js';
import { trainerRead, weightTrend, localSummary, fullHistory } from '../trainer-insights.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}
const EX = BASE_EXERCISES, TODAY = '2026-10-26';
const ago = n => { const d = new Date(TODAY + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const sess = (n, lifts) => ({ date: ago(n), exercises: lifts.map(([name, kg, sets = 3, rir = 2]) => ({ name, sets: Array.from({ length: sets }, () => ({ reps: 5, weight: kg, rir })) })) });
const read = (ctx) => trainerRead({ exercises: EX, today: TODAY, workouts: [], weights: [], checkins: [], ...ctx });
const f = (r, id) => r.flags.find(x => x.id === id);

// empty
const none = read({});
check('no data -> nothing to read yet', [none.tone, /Log a few/.test(none.headline)], ['none', true]);

// steady training every 3 days, bench rising
const steady = [];
for (let i = 0; i < 16; i++) steady.push(sess(i * 3 + 1, [['Bench Press', 60 + (15 - i) * 1.5]]));
const r1 = read({ workouts: steady });
check('rhythm reads the usual gap', f(r1, 'gap').tone, 'good');
check('bench rising is reported', f(r1, 'rising').tone, 'good');
check('stats carry the gap', r1.stats.usualGapDays, 3);

// long break
const away = [sess(20, [['Bench Press', 70]]), sess(23, [['Bench Press', 70]]), sess(26, [['Bench Press', 70]]), sess(29, [['Bench Press', 70]])];
const r2 = read({ workouts: away });
check('a long break is flagged', f(r2, 'gap').tone, 'act');
check('and offers an ease-back sentence', /ease me back/i.test(f(r2, 'gap').ask), true);

// consecutive days + recovering
const run = [0, 1, 2, 3, 4].map(i => sess(i, [['Bench Press', 70, 4]]));
const r3 = read({ workouts: [...run, sess(8, [['Bench Press', 70]]), sess(10, [['Bench Press', 70]])] });
check('5 days in a row flagged', f(r3, 'streak').title, '5 training days in a row');
check('chest recovering', f(r3, 'hot').title.includes('Chest'), true);

// volume spike
const base = []; for (let i = 0; i < 4; i++) for (const d of [10, 12, 14]) base.push(sess(d + i * 7, [['Bench Press', 70, 4], ['Barbell Row', 60, 4]]));
const spike = [0, 1, 2, 3].map(i => sess(i + 0, [['Bench Press', 70, 6], ['Barbell Row', 60, 6]]));
check('a volume spike is flagged', f(read({ workouts: [...base, ...spike] }), 'spike')?.tone, 'act');

// stalled + low RIR -> deload
const flat = []; for (let i = 0; i < 18; i++) flat.push(sess(i * 3 + 1, [['Bench Press', 80, 3, 0], ['Barbell Row', 70, 3, 0]]));
const r4 = read({ workouts: flat });
check('stalled lifts ground out -> deload', f(r4, 'deload')?.tone, 'act');
check('deload carries a sentence', /deload/i.test(f(r4, 'deload')?.ask || ''), true);
check('rising lifts do not trigger deload', f(r1, 'deload'), undefined);

// body
const wts = []; for (let i = 0; i < 12; i++) wts.push({ date: ago(i * 2), weight: 80 + i * 0.15 });
const t = weightTrend(wts.map(w => ({ date: w.date, kg: w.weight })).sort((a, b) => a.date.localeCompare(b.date)), TODAY);
check('weight trend is falling about 0.5 kg a week', t.perWeekKg < -0.4 && t.perWeekKg > -0.7, true);
const r5 = read({ workouts: steady, weights: wts, targetKg: 75 });
check('losing weight while getting stronger', f(r5, 'recomp')?.tone, 'good');
check('goal weight eta', /to your 75 kg goal/.test(f(r5, 'goalweight')?.title || ''), true);
const fast = []; for (let i = 0; i < 12; i++) fast.push({ date: ago(i * 2), weight: 80 + i * 0.6 });
check('fast cut flagged', f(read({ weights: fast }), 'fastcut')?.tone, 'act');
check('stale weigh-in flagged', f(read({ weights: [{ date: ago(15), weight: 80 }] }), 'weighin')?.tone, 'watch');
check('no weigh-ins flagged', f(read({ workouts: steady }), 'weighin')?.title, 'No weigh-ins yet');
check('too few points -> no trend', weightTrend([{ date: ago(2), kg: 80 }, { date: ago(1), kg: 80 }], TODAY), null);
const ck = [{ date: ago(30), weight: 80, waist: 90 }, { date: ago(2), weight: 79, waist: 87.5 }];
check('waist change reported', f(read({ checkins: ck }), 'waist')?.title, 'Waist down 2.5 cm');

// ordering and headline
const mixed = read({ workouts: away, weights: [{ date: ago(15), weight: 80 }] });
check('actions come first', mixed.flags[0].tone, 'act');
check('headline is the top action', mixed.headline, mixed.flags[0].title);
check('on track when only good news', read({ workouts: steady, weights: [{ date: ago(1), weight: 80 }] }).tone, 'good');

const ls = localSummary(r1, { score: 78 });
check('local summary quotes real numbers', /rising/.test(ls.answer) && /78/.test(ls.answer), true);
check('local summary has an outlook', ['on_track', 'slow', 'off_track'].includes(ls.outlook), true);
check('too little data says so', localSummary(none, null).outlook, 'not_enough_data');
check('a long break is not on track', localSummary(r2, null).outlook !== 'on_track', true);

// whole history
const old = []; for (let i = 0; i < 40; i++) old.push(sess(i * 7 + 2, [['Bench Press', 40 + (39 - i) * 1.2], ['Squat', 60 + (39 - i) * 2]]));
const fh = fullHistory({ workouts: old, exercises: EX, today: TODAY, weights: [{ date: ago(270), weight: 90 }, { date: ago(5), weight: 80 }], checkins: [{ date: ago(200), weight: 88, waist: 95 }, { date: ago(4), weight: 80, waist: 86 }] });
check('history starts at the first session', fh.since, ago(39 * 7 + 2));
check('counts every session', fh.sessions, 40);
check('bench gain measured from the first session', fh.lifts.find(l => l.name === 'Bench Press').gainKg > 40, true);
check('body weight over the whole period', [fh.body.firstKg, fh.body.nowKg, fh.body.changeKg], [90, 80, -10]);
check('waist over the whole period', fh.waist.changeCm, -9);
check('weekly consistency counted', fh.weeksTrained, 40);
check('monthly series is capped', fh.monthly.length <= 24, true);
check('no logs -> no history', fullHistory({ workouts: [], exercises: EX, today: TODAY }), null);
const lr = trainerRead({ exercises: EX, today: TODAY, workouts: old, weights: [], checkins: [] });
check('the read carries a long-term finding', lr.flags.some(f => f.area === 'longterm'), true);
check('and a lift gain since the start', /since/.test(lr.flags.find(f => f.id === 'longlift')?.title || ''), true);
check('history is in the stats', lr.stats.history.sessions, 40);

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
