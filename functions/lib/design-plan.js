'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   design-plan — the AI coach behind the `designPlan` Cloud Function
   ═══════════════════════════════════════════════════════════════════════════

   Two modes, one schema:
     design  the Hunter describes a look ("bigger arms", "Nightwing", a reference
             photo): Claude picks target proportions and proposes a training plan
     review  no new goal: Claude reads the Hunter's data against their current goal
             and plan, says how they are doing, and proposes plan changes

   WHAT CLAUDE DECIDES AND WHAT IT DOES NOT
   · It picks target proportions, which exercises, sets and reps, and writes the
     coaching text. The app's own maths (physique-goal.js) then plans the timeline
     from those targets and says honestly if the date is unrealistic.
   · Nothing it returns is applied by this function. The client shows the proposal
     and the Hunter taps to apply it. Exercise names are checked against the list
     the client sent; unknown ones are dropped. Numbers are clamped below.
   · No formula, constant or stored progression value is touched.

   The model sees only what the client sends, which is the Hunter's own data.
   ═══════════════════════════════════════════════════════════════════════════ */

const { z } = require('zod');

const MODEL = 'claude-opus-5-5';
const GROUPS = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Biceps', 'Triceps', 'Core', 'Calves'];
const GOALS = ['strength', 'muscle', 'endurance', 'general'];

const LookSchema = z.object({
  label: z.string(),
  blurb: z.string(),
  bodyFat: z.number().nullable(),
  vTaper: z.number().nullable(),
  chestWaist: z.number().nullable(),
  armChest: z.number().nullable(),
  waistHip: z.number().nullable(),
});
const ExerciseSchema = z.object({ name: z.string(), sets: z.number(), reps: z.number() });
const DaySchema = z.object({ name: z.string(), exercises: z.array(ExerciseSchema) });

const PlanSchema = z.object({
  look: LookSchema.nullable(),
  focus: z.array(z.enum(GROUPS)),
  goal: z.enum(GOALS),
  sessionsPerWeek: z.number(),
  days: z.array(DaySchema).nullable(),
  coach: z.object({
    headline: z.string(),
    summary: z.string(),
    wins: z.array(z.string()),
    concerns: z.array(z.string()),
    nextSteps: z.array(z.string()),
  }),
  caveat: z.string().nullable(),
});

const SYSTEM = `You are the coach inside Auramaxxing, a training app. You are given one Hunter's own data and either a look they want (mode "design") or a request to review how they are doing (mode "review"). Be direct, specific and honest. Use their numbers.

Targets
- A look can be words ("bigger arms"), several goals at once, a character or a famous physique, or a reference photo. Turn it into target proportions: bodyFat (%), vTaper (shoulders around / waist around), chestWaist (chest around / waist around), armChest (flexed arm around / chest around), waistHip (women). Use null for any proportion the look does not ask for; for "bigger arms" alone, set armChest and leave the rest null.
- Always pick the closest natural, achievable version. Never aim past a fat-free mass index of about 25 or below healthy body fat (men about 8%, women about 15%). If the look needs more, give the closest natural version and say so in "caveat". Never promise a result or a date.
- Describe only the physique in a reference photo. Never identify anyone in it.
- "focus" lists the muscle groups that deserve extra weekly volume to get there, most important first.

Plan
- Build days from the exercise list given, using the exact names only. Fit the sessions per week they can actually do. Put the focus groups first in each session and give them enough sets to grow (about 10-20 hard sets a week for a focus group, 8-12 for others, fewer if they are a beginner). Use rep ranges that fit the goal. Sets 2-5, reps within 3-20.
- In "review" mode, keep what works. Return "days" as null if the current plan is fine, otherwise the full adjusted plan. Say what you changed and why in "coach".
- Respect their recovery: if their feedback shows heavy soreness or missed work, do not add volume.

Coaching text
- "headline" is one short line. "summary" is two to four plain sentences on where they stand against the goal, using their real numbers (weight trend, measurements, sessions, lifts). "wins" and "concerns" are short, specific facts. "nextSteps" are one to four concrete actions for this week. No hype, no medical advice, no diets below maintenance-minus-500 kcal.

Return only the JSON object the schema describes.`;

/* ── goal intake ──────────────────────────────────────────────────────── */
const MAX_ROUNDS = 3;
const QuestionSchema = z.object({ id: z.string(), question: z.string(), options: z.array(z.string()) });
const IntakeSchema = z.object({
  ready: z.boolean(),
  summary: z.string(),
  goals: z.array(z.string()),
  assumptions: z.array(z.string()),
  questions: z.array(QuestionSchema),
});

const INTAKE_SYSTEM = `You are the coach inside Auramaxxing, a training app. Before you plan anything you must understand what this Hunter actually wants. You are given what they have said so far (their own words, plus any questions you asked and their answers) and their own data.

Decide whether you understand the goal well enough to design a plan, and say so in "ready".
- Ready means you know: the outcome they want (look, strength, size of a body part, fat loss, a lift, endurance, or a mix and which matters most), roughly how soon they want it, how many sessions a week they can really do, and anything that limits them (injury, equipment, time). Their data already answers many of these (sessions, weight, measurements, lifts); never ask what the data says.
- If something that would change the plan is missing or vague, ask. Ask at most 4 questions in a round, only ones whose answer would change the plan, short and plain, each with 2 to 5 tap-able "options" (short answers; the Hunter can also type their own). Give every question a short id like "timeline" or "injuries".
- A vague goal like "look good" or "get fit" is not ready: ask what that means to them. A clear one ("bigger arms, 12 weeks, 4 days a week, full gym") is ready at once.
- If this is round ${MAX_ROUNDS} or later, set ready to true and list in "assumptions" every gap you filled with a reasonable default.
- When ready: "summary" is two to three sentences restating the goal in their terms (no hype), "goals" is one to four short goal statements, most important first, "questions" is empty.
- When not ready: "summary" is one short sentence on what you understood so far, "goals" is empty, "questions" has your questions.
- Describe only the physique in a reference photo. Never identify anyone in it. No medical advice.

Return only the JSON object the schema describes.`;

function sanitizeGoals(g) {
  if (!g || typeof g !== 'object') return null;
  const list = Array.isArray(g.goals) ? g.goals.slice(0, 4).map(x => str(x, 160)).filter(Boolean) : [];
  if (!list.length) return null;
  return { summary: str(g.summary, 500), goals: list, answers: sanitizeAnswers(g.answers) };
}

function sanitizeAnswers(a) {
  if (!Array.isArray(a)) return [];
  return a.slice(0, 12).map(x => ({ q: str(x && x.q, 200), a: str(x && x.a, 300) })).filter(x => x.q && x.a);
}

function sanitizeIntakeState(i) {
  if (!i || typeof i !== 'object') return null;
  return { text: str(i.text, 800), answers: sanitizeAnswers(i.answers), round: Math.round(clamp(num(i.round) ?? 1, 1, 9)) };
}

/** What the client gets back from an intake round: either questions or a confirmed understanding. */
function sanitizeIntake(raw, round) {
  const ready = !!raw.ready || round >= MAX_ROUNDS;
  const questions = ready ? [] : (raw.questions || []).slice(0, 4).map((q, n) => ({
    id: str(q.id, 30) || `q${n + 1}`,
    question: str(q.question, 200),
    options: (q.options || []).slice(0, 5).map(o => str(o, 60)).filter(Boolean),
  })).filter(q => q.question);
  const goals = (raw.goals || []).slice(0, 4).map(g => str(g, 160)).filter(Boolean);
  // not ready but nothing to ask, or ready with no goals: treat as unusable so the client can retry
  if ((!ready && !questions.length) || (ready && !goals.length)) return null;
  return {
    ready,
    summary: str(raw.summary, 500),
    goals: ready ? goals : [],
    assumptions: ready ? (raw.assumptions || []).slice(0, 4).map(a => str(a, 160)).filter(Boolean) : [],
    questions,
  };
}

/* ── clamping ─────────────────────────────────────────────────────────── */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const LOOK_RANGES = {
  male:   { bodyFat: [6, 25], vTaper: [1.1, 1.75], chestWaist: [1.0, 1.5], armChest: [0.28, 0.4], waistHip: [0.6, 0.9] },
  female: { bodyFat: [12, 35], vTaper: [1.1, 1.5], chestWaist: [1.0, 1.4], armChest: [0.26, 0.38], waistHip: [0.6, 0.9] },
};

/** The look with every number clamped to a sane range, or null when it asks for nothing. */
function sanitizeLook(look, sex) {
  if (!look) return null;
  const r = LOOK_RANGES[sex === 'female' ? 'female' : 'male'];
  const out = { label: str(look.label, 40) || 'Custom look', blurb: str(look.blurb, 100) };
  let any = false;
  for (const k of Object.keys(r)) {
    const v = num(look[k]);
    if (v == null) continue;
    out[k] = Math.round(clamp(v, r[k][0], r[k][1]) * 1000) / 1000;
    any = true;
  }
  return any ? out : null;
}

/** The plan days with only known exercises, sane sets and reps and bounded size, or null. */
function sanitizeDays(days, allowed) {
  if (!Array.isArray(days)) return null;
  const out = [];
  for (const d of days.slice(0, 6)) {
    const exercises = [];
    for (const e of (d.exercises || []).slice(0, 10)) {
      if (!allowed.has(e.name) || exercises.some(x => x.name === e.name)) continue;
      exercises.push({ name: e.name, sets: Math.round(clamp(num(e.sets) ?? 3, 1, 6)), reps: Math.round(clamp(num(e.reps) ?? 8, 1, 30)) });
    }
    if (exercises.length) out.push({ name: str(d.name, 30) || `Day ${out.length + 1}`, exercises });
  }
  return out.length ? out : null;
}

/** What the client gets back: validated, clamped, nothing the Hunter did not see. */
function sanitizePlan(raw, { sex, exercises }) {
  const allowed = new Set(exercises || []);
  const coach = raw.coach || {};
  const list = (a, n, max) => (Array.isArray(a) ? a.slice(0, n).map(s => str(s, max)).filter(Boolean) : []);
  return {
    look: sanitizeLook(raw.look, sex),
    focus: (raw.focus || []).filter(g => GROUPS.includes(g)).slice(0, 4),
    goal: GOALS.includes(raw.goal) ? raw.goal : 'general',
    sessionsPerWeek: Math.round(clamp(num(raw.sessionsPerWeek) ?? 3, 2, 6)),
    days: sanitizeDays(raw.days, allowed),
    coach: {
      headline: str(coach.headline, 90),
      summary: str(coach.summary, 700),
      wins: list(coach.wins, 4, 160),
      concerns: list(coach.concerns, 4, 160),
      nextSteps: list(coach.nextSteps, 4, 160),
    },
    caveat: raw.caveat ? str(raw.caveat, 300) : null,
  };
}

/* ── the request ──────────────────────────────────────────────────────── */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_CHARS = 2_500_000;

/** The user turn: the Hunter's facts as JSON, plus an optional reference image. */
function buildContent(input) {
  const facts = {
    mode: input.mode === 'review' ? 'review' : input.mode === 'intake' ? 'intake' : 'design',
    request: str(input.request, 600) || null,
    goals: sanitizeGoals(input.goals),
    intake: sanitizeIntakeState(input.intake),
    sex: input.sex === 'female' ? 'female' : 'male',
    age: num(input.age), heightCm: num(input.heightCm), weightKg: num(input.weightKg),
    latest: input.latest || null,
    weightTrend: input.weightTrend || null,
    trainingMonths: num(input.trainingMonths), sessionsPerWeek: num(input.sessionsPerWeek),
    sessionsLast28Days: num(input.sessionsLast28Days),
    lifts: Array.isArray(input.lifts) ? input.lifts.slice(0, 15) : [],
    currentGoal: input.currentGoal || null,
    currentPlan: Array.isArray(input.currentPlan) ? input.currentPlan.slice(0, 7) : null,
    feedback: Array.isArray(input.feedback) ? input.feedback.slice(0, 10) : [],
    block: input.block || null,
    exerciseList: Array.isArray(input.exercises) ? input.exercises.slice(0, 400) : [],
  };
  const content = [];
  const img = input.image;
  if (img && IMAGE_TYPES.includes(img.mediaType) && typeof img.data === 'string' && img.data.length <= MAX_IMAGE_CHARS) {
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  }
  content.push({ type: 'text', text: `${content.length ? 'The image above is the look I want (a reference, not me).\n' : ''}My data:\n${JSON.stringify(facts)}` });
  return content;
}

/**
 * Ask Claude. `client` is an Anthropic client (or a stand-in with messages.parse in tests).
 * Throws on a refusal or an unparseable answer so the caller can tell the Hunter.
 */
async function designPlan({ client, input }) {
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: zodOutputFormat(PlanSchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: buildContent(input) }],
  });
  if (response.stop_reason === 'refusal') {
    const e = new Error('The coach could not help with that request. Try describing the look differently.');
    e.code = 'refused';
    throw e;
  }
  if (!response.parsed_output) {
    const e = new Error('The coach answered in a form the app could not read. Try again.');
    e.code = 'unparseable';
    throw e;
  }
  return sanitizePlan(response.parsed_output, { sex: input.sex, exercises: input.exercises });
}

/** One round of goal intake: questions to ask, or the confirmed understanding. */
async function designIntake({ client, input }) {
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const state = sanitizeIntakeState(input.intake);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(IntakeSchema) },
    system: INTAKE_SYSTEM,
    messages: [{ role: 'user', content: buildContent({ ...input, mode: 'intake' }) }],
  });
  if (response.stop_reason === 'refusal') {
    const e = new Error('The coach could not help with that request. Try describing the goal differently.');
    e.code = 'refused';
    throw e;
  }
  const out = response.parsed_output ? sanitizeIntake(response.parsed_output, state ? state.round : 1) : null;
  if (!out) {
    const e = new Error('The coach answered in a form the app could not read. Try again.');
    e.code = 'unparseable';
    throw e;
  }
  return out;
}

module.exports = { MODEL, GROUPS, GOALS, PlanSchema, SYSTEM, sanitizeLook, sanitizeDays, sanitizePlan, buildContent, designPlan, MAX_IMAGE_CHARS, IntakeSchema, INTAKE_SYSTEM, MAX_ROUNDS, sanitizeIntake, sanitizeIntakeState, sanitizeGoals, designIntake };

/** Daily limit per Hunter: the usage record to store and whether one more call is allowed. */
const DAILY_LIMIT = 10;
function nextUsage(prev, today, max = DAILY_LIMIT) {
  const used = prev && prev.date === today && Number.isFinite(prev.count) ? prev.count : 0;
  if (used >= max) return { allowed: false, usage: { date: today, count: used } };
  return { allowed: true, usage: { date: today, count: used + 1 } };
}
module.exports.nextUsage = nextUsage;
module.exports.DAILY_LIMIT = DAILY_LIMIT;
