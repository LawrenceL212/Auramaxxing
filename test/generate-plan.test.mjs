/* Tests for the generatePlan request/reply helpers.  node test/generate-plan.test.mjs */
import { createRequire } from 'module';
const { buildRequest, parseReply, generatePlan, makeThrottle, MODEL } = createRequire(import.meta.url)('../functions/lib/generate-plan.js');

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}
const cat = { 'Bench Press': 'Barbell; Chest', 'Squat': 'Barbell; Quads' };
const req = buildRequest({ goal: 'lean, no legs', catalogue: cat, digest: { weightKg: 78 }, standing: ['never legs'] });
check('model is set', req.model, MODEL);
check('goal is in the prompt', req.messages[0].content.includes('lean, no legs'), true);
check('catalogue is in the prompt', req.messages[0].content.includes('Bench Press | Barbell; Chest'), true);
check('standing preferences travel', req.messages[0].content.includes('never legs'), true);
check('no revision section when not revising', req.messages[0].content.includes('Change requested'), false);
check('revision is included', buildRequest({ goal: 'lean', catalogue: cat, currentPlan: { days: [] }, revision: 'add a run' }).messages[0].content.includes('add a run'), true);
check('goal is capped', buildRequest({ goal: 'x'.repeat(5000), catalogue: cat }).messages[0].content.length < 4000, true);
let err; try { buildRequest({ goal: '', catalogue: cat }); } catch (e) { err = e.code; }
check('empty goal refused', err, 'invalid-argument');
err = null; try { buildRequest({ goal: 'lean', catalogue: {} }); } catch (e) { err = e.code; }
check('missing catalogue refused', err, 'invalid-argument');
check('reply with prose around JSON is read', parseReply('Here you go: {"a":1} done'), { a: 1 });
check('garbage is null', parseReply('no json'), null);

const ok = (obj) => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] }) });
const sent = [];
const fetchImpl = async (url, init) => { sent.push({ url, init }); return ok({ understood: { goal: 'lean' }, exclude: ['Quads', 'Wings'], plan: { days: [] } })(); };
const r = await generatePlan({ data: { goal: 'lean', catalogue: cat }, apiKey: 'k', fetchImpl });
check('hits the Messages API', sent[0].url, 'https://api.anthropic.com/v1/messages');
check('key goes in the header, not the body', [sent[0].init.headers['x-api-key'], sent[0].init.body.includes('"k"')], ['k', false]);
check('unknown groups are filtered out of exclude', r.exclude, ['Quads']);
const q = await generatePlan({ data: { goal: 'lean', catalogue: cat }, apiKey: 'k', fetchImpl: ok({ question: 'How many days?' }) });
check('a question comes back as a question', [q.question, q.plan], ['How many days?', null]);
err = null; try { await generatePlan({ data: { goal: 'lean', catalogue: cat }, apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 529 }) }); } catch (e) { err = e.code; }
check('API outage is unavailable', err, 'unavailable');
err = null; try { await generatePlan({ data: { goal: 'lean', catalogue: cat }, apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'sorry' }] }) }) }); } catch (e) { err = e.code; }
check('unreadable reply is internal', err, 'internal');

let t = 0; const th = makeThrottle(2, () => t);
check('throttle allows two', [th('u'), th('u')], [true, true]);
check('then refuses', th('u'), false);
check('other users unaffected', th('v'), true);
t = 3600001;
check('and resets after an hour', th('u'), true);

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
