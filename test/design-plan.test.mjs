/* Tests for the AI coach's request and clamping (no network).  Run:  node test/design-plan.test.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { designPlan, sanitizeLook, sanitizeDays, sanitizePlan, buildContent, SYSTEM, MODEL, PlanSchema, MAX_IMAGE_CHARS, nextUsage, DAILY_LIMIT } = require('../functions/lib/design-plan.js');

let pass = 0, fail = 0; const results = [];
function check(name, ok, detail = '') { ok ? pass++ : fail++; results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          ${detail}`}`); }

const EX = ['Bench Press', 'Barbell Curl', 'Squat', 'Barbell Row'];
const good = {
  look: { label: 'Bigger arms', blurb: 'Arms in proportion', bodyFat: null, vTaper: null, chestWaist: null, armChest: 0.37, waistHip: null },
  focus: ['Biceps', 'Triceps'], goal: 'muscle', sessionsPerWeek: 4,
  days: [{ name: 'Push', exercises: [{ name: 'Bench Press', sets: 4, reps: 8 }] }, { name: 'Pull', exercises: [{ name: 'Barbell Curl', sets: 4, reps: 10 }, { name: 'Barbell Row', sets: 3, reps: 8 }] }],
  coach: { headline: 'Arms are the gap', summary: 'Your arms are 33 cm on a 96 cm chest.', wins: ['6-day streak'], concerns: [], nextSteps: ['Curl twice a week'] },
  caveat: null,
};

check('the model is the current Opus', MODEL === 'claude-opus-5-5');
check('the prompt keeps the natural ceiling and never identifying a person', /fat-free mass index of about 25/.test(SYSTEM) && /Never identify anyone/.test(SYSTEM) && /exact names only/.test(SYSTEM));
check('the schema accepts a good answer and rejects a bad group', PlanSchema.safeParse(good).success && !PlanSchema.safeParse({ ...good, focus: ['Wings'] }).success);

// look clamping
const wild = sanitizeLook({ label: 'x'.repeat(80), blurb: 'y', bodyFat: 2, vTaper: 3, chestWaist: 0.5, armChest: 0.9, waistHip: 0.2 }, 'male');
check('look numbers are clamped to sane ranges', wild.bodyFat === 6 && wild.vTaper === 1.75 && wild.chestWaist === 1 && wild.armChest === 0.4 && wild.waistHip === 0.6, JSON.stringify(wild));
check('look label is cut to 40 characters', wild.label.length === 40);
check('female ranges differ', sanitizeLook({ label: 'a', blurb: '', bodyFat: 5, vTaper: 1.7 }, 'female').bodyFat === 12 && sanitizeLook({ label: 'a', blurb: '', vTaper: 1.7 }, 'female').vTaper === 1.5);
check('a look with no numbers asks for nothing', sanitizeLook({ label: 'a', blurb: 'b', bodyFat: null, vTaper: null }, 'male') === null && sanitizeLook(null, 'male') === null);
check('arms-only look keeps only the arm target', (() => { const l = sanitizeLook(good.look, 'male'); return l.armChest === 0.37 && l.bodyFat === undefined && l.vTaper === undefined; })());

// days
const allowed = new Set(EX);
check('unknown exercises are dropped', sanitizeDays([{ name: 'A', exercises: [{ name: 'Wizard Curl', sets: 3, reps: 8 }, { name: 'Squat', sets: 3, reps: 5 }] }], allowed)[0].exercises.length === 1);
check('sets and reps are clamped and rounded', (() => { const e = sanitizeDays([{ name: 'A', exercises: [{ name: 'Squat', sets: 20, reps: 99.6 }] }], allowed)[0].exercises[0]; return e.sets === 6 && e.reps === 30; })());
check('a duplicate exercise in a day is dropped', sanitizeDays([{ name: 'A', exercises: [{ name: 'Squat', sets: 3, reps: 5 }, { name: 'Squat', sets: 3, reps: 5 }] }], allowed)[0].exercises.length === 1);
check('a day with no known exercises disappears; none left gives null', sanitizeDays([{ name: 'A', exercises: [{ name: 'Nope', sets: 3, reps: 5 }] }], allowed) === null);
check('days and exercises are bounded', sanitizeDays(Array.from({ length: 12 }, () => ({ name: 'D', exercises: EX.map(n => ({ name: n, sets: 3, reps: 8 })) })), allowed).length === 6);
check('no days stays null (a review that changes nothing)', sanitizeDays(null, allowed) === null);

// whole plan
const plan = sanitizePlan({ ...good, sessionsPerWeek: 40, focus: ['Biceps', 'Biceps', 'Chest', 'Back', 'Core', 'Calves'] }, { sex: 'male', exercises: EX });
check('sessions per week are bounded to 2-6', plan.sessionsPerWeek === 6 && sanitizePlan({ ...good, sessionsPerWeek: 0 }, { sex: 'male', exercises: EX }).sessionsPerWeek === 2);
check('focus is capped at four groups', plan.focus.length === 4);
check('coach text and lists are trimmed and bounded', (() => { const p = sanitizePlan({ ...good, coach: { headline: 'h'.repeat(200), summary: 's'.repeat(2000), wins: ['a', 'b', 'c', 'd', 'e', 'f'], concerns: [''], nextSteps: [1, 'ok'] } }, { sex: 'male', exercises: EX }); return p.coach.headline.length === 90 && p.coach.summary.length === 700 && p.coach.wins.length === 4 && p.coach.concerns.length === 0 && p.coach.nextSteps.join() === 'ok'; })());
check('an unknown goal becomes general', sanitizePlan({ ...good, goal: 'bulk' }, { sex: 'male', exercises: EX }).goal === 'general');

// request
const c = buildContent({ mode: 'review', request: 'r'.repeat(900), sex: 'male', weightKg: 77, exercises: EX, lifts: Array(40).fill({ name: 'Squat', e1rm: 100 }) });
const facts = JSON.parse(c[c.length - 1].text.split('My data:\n')[1]);
check('the request carries the facts, bounded', c.length === 1 && facts.mode === 'review' && facts.request.length === 600 && facts.lifts.length === 15 && facts.exerciseList.length === 4);
check('mode defaults to design', JSON.parse(buildContent({ sex: 'male' })[0].text.split('My data:\n')[1]).mode === 'design');
const withImg = buildContent({ sex: 'male', image: { mediaType: 'image/jpeg', data: 'AAAA' } });
check('a reference image comes first, then the text that says it is a reference', withImg[0].type === 'image' && withImg[0].source.media_type === 'image/jpeg' && /reference, not me/.test(withImg[1].text));
check('a bad image type or an oversized image is ignored', buildContent({ sex: 'male', image: { mediaType: 'image/gif', data: 'AAAA' } }).length === 1 && buildContent({ sex: 'male', image: { mediaType: 'image/png', data: 'A'.repeat(MAX_IMAGE_CHARS + 1) } }).length === 1);

// the call
let seen = null;
const fake = (resp) => ({ messages: { parse: async (req) => { seen = req; return resp; } } });
const out = await designPlan({ client: fake({ stop_reason: 'end_turn', parsed_output: good }), input: { sex: 'male', exercises: EX, request: 'bigger arms' } });
check('the call uses the current model, medium effort, a schema and the system prompt', seen.model === 'claude-opus-5-5' && seen.output_config.effort === 'medium' && !!seen.output_config.format && seen.system === SYSTEM && seen.thinking === undefined && seen.temperature === undefined);
check('the call returns the clamped plan', out.look.armChest === 0.37 && out.days.length === 2 && out.focus.join() === 'Biceps,Triceps');
let err = null;
try { await designPlan({ client: fake({ stop_reason: 'refusal', parsed_output: null }), input: { sex: 'male', exercises: EX } }); } catch (e) { err = e; }
check('a refusal is reported plainly', err && err.code === 'refused');
err = null;
try { await designPlan({ client: fake({ stop_reason: 'end_turn', parsed_output: null }), input: { sex: 'male', exercises: EX } }); } catch (e) { err = e; }
check('an unreadable answer is reported plainly', err && err.code === 'unparseable');

check('daily limit: first call of the day is allowed and counted', (() => { const r = nextUsage(null, '2026-10-29'); return r.allowed && r.usage.count === 1; })());
check('daily limit: counts up within a day, stops at the limit', (() => { let u = null; for (let i = 0; i < DAILY_LIMIT; i++) u = nextUsage(u && u.usage, '2026-10-29'); return u.allowed && u.usage.count === DAILY_LIMIT && !nextUsage(u.usage, '2026-10-29').allowed; })());
check('daily limit: a new day starts again', nextUsage({ date: '2026-10-28', count: 99 }, '2026-10-29').usage.count === 1);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
