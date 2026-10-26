'use strict';
/* Goal to plan: builds the request for Claude and reads the reply. The reply is
   only a proposal; the app validates every exercise against the game's own list
   (plan-gen.js) before the Hunter sees it, and nothing is saved until Accept.
   No network here except the injected fetch, so test/generate-plan.test.mjs
   runs it with a stand-in. */

const MODEL = 'claude-sonnet-5-5';
const MAX_GOAL = 1200;
const MAX_CATALOGUE = 700;
const GROUPS = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Biceps', 'Triceps', 'Core', 'Calves'];

const SYSTEM = [
  'You are the System in a fitness game. You write a weekly training plan for one Hunter from what they say they want and what their logged history shows.',
  'Use ONLY exercise names from the catalogue you are given, spelled exactly. Never invent an exercise.',
  'Treat what the Hunter says as binding. If they rule out a muscle group or exercise, put it in "exclude" and never include it, and do not suggest adding it back.',
  'Fit the plan to the days per week and minutes they give (default 3 days, 45 minutes, about 4 to 6 exercises a day). Use their history: lead with lifts they are strong at, fill muscle groups with little recent volume unless excluded, and prefer exercises they already do.',
  'Reps and sets should suit the goal (strength 3-6 reps, muscle 6-12, endurance 12-20). Cardio exercises in the catalogue use sets 1 and reps as minutes or km as the exercise implies.',
  'Each exercise gets a short "why" tied to their goal or history. Write plainly, no hype.',
  'If the request is too unclear to plan (no goal at all), return {"question": "..."} with ONE short question and no plan.',
  'Reply with a single JSON object and nothing else, in this shape:',
  '{"understood":{"goal":"...","daysPerWeek":3,"notes":"..."},"exclude":["Quads"],"plan":{"name":"...","summary":"two sentences on how the plan serves the goal","schedule":["Mon","Wed","Fri"],"days":[{"name":"Push","exercises":[{"name":"Bench Press","sets":4,"reps":8,"why":"..."}]}]}}',
  '"exclude" is a list drawn from: ' + GROUPS.join(', ') + '.',
].join('\n');

function clip(v, n) { return String(v == null ? '' : v).slice(0, n); }

/** Throws a short Error for anything the function should refuse. */
function buildRequest(data) {
  const goal = clip(data && data.goal, MAX_GOAL).trim();
  if (goal.length < 3) { const e = new Error('Tell the System what you want first.'); e.code = 'invalid-argument'; throw e; }
  const names = data && data.catalogue && typeof data.catalogue === 'object' ? Object.entries(data.catalogue) : [];
  if (!names.length || names.length > MAX_CATALOGUE) { const e = new Error('Exercise list missing.'); e.code = 'invalid-argument'; throw e; }
  const catalogue = names.map(([n, d]) => `${clip(n, 60)} | ${clip(d, 60)}`).join('\n');
  const parts = [
    `The Hunter says: ${goal}`,
    `History and body (JSON): ${clip(JSON.stringify(data.digest || {}), 4000)}`,
  ];
  if (data.feasibility) parts.push(`Goal check (computed): ${clip(JSON.stringify(data.feasibility), 800)}`);
  if (Array.isArray(data.standing) && data.standing.length) parts.push(`Standing preferences to always respect: ${clip(data.standing.join('; '), 400)}`);
  if (data.currentPlan) parts.push(`Current plan to revise (JSON): ${clip(JSON.stringify(data.currentPlan), 6000)}`);
  if (data.revision) parts.push(`Change requested to that plan: ${clip(data.revision, 600)}`);
  parts.push(`Catalogue (name | equipment; muscle groups):\n${catalogue}`);
  return {
    model: MODEL, max_tokens: 3500, system: SYSTEM,
    messages: [{ role: 'user', content: parts.join('\n\n') }],
  };
}

/** First JSON object in the reply, or null. */
function parseReply(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { return null; }
}

async function generatePlan({ data, apiKey, fetchImpl }) {
  const body = buildRequest(data);
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = new Error('The System could not reach its planner. Try again in a minute.'); e.code = 'unavailable'; e.status = res.status; throw e; }
  const json = await res.json();
  const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const reply = parseReply(text);
  if (!reply) { const e = new Error('The planner gave an answer the System could not read. Try again.'); e.code = 'internal'; throw e; }
  const exclude = Array.isArray(reply.exclude) ? reply.exclude.filter(g => GROUPS.includes(g)) : [];
  return { question: reply.question ? clip(reply.question, 300) : null, understood: reply.understood || null, exclude, plan: reply.plan || null };
}

/** At most `max` calls per user per hour, per function instance. */
function makeThrottle(max, now = Date.now) {
  const seen = new Map();
  return uid => {
    const t = now(), keep = (seen.get(uid) || []).filter(x => t - x < 3600000);
    if (keep.length >= max) return false;
    keep.push(t); seen.set(uid, keep);
    return true;
  };
}

module.exports = { buildRequest, parseReply, generatePlan, makeThrottle, MODEL, GROUPS };
