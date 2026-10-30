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
- "planMode" says which of the Hunter's two plans this is: "gym" or "home" (they pick one on the day). For a home plan use only exercises that fit what they have at home ("homeEquipment", and whatever they told you in their goals and answers); with nothing known, bodyweight only. Never put a barbell, cable or machine move in a home plan unless they said they have it. "otherPlan" is their other plan, for reference only.
- In "home" mode, design their HOME plan for the goal physique they want (goals, currentGoal, their measurements and focus groups), exactly as you would design any plan for that goal, restricted only by their home equipment. The equipment limits which exercises you can pick, never the goal. Pick the best exercise in exerciseList for each muscle the goal needs; where the kit is light, use harder variations, higher reps, slower tempo, pauses or more sets to keep each set hard. Use as many sessions as their gym plan ("gymPlan") has, or sessionsPerWeek if there is none, so the days line up with their week. gymPlan is only context (what they already train at the gym): do not copy or translate it. Always return "days". In "coach", say how this plan serves the goal and anything the home equipment cannot fully cover (for example heavy leg loading) and how the plan makes up for it.
- In "review" mode, keep what works. Return "days" as null if the current plan is fine, otherwise the full adjusted plan. Say what you changed and why in "coach".
- "holdExercises" are the timed holds in exerciseList (front lever, planche, L-sit, handstand work and so on): for those, "reps" means seconds per hold (5-60), not repetitions. Use them when the Hunter wants skills; never leave out a skill they asked for.
- Respect their recovery: if their feedback shows heavy soreness or missed work, do not add volume.

Coaching text
- "headline" is one short line. "summary" is two to four plain sentences on where they stand against the goal, using their real numbers (weight trend, measurements, sessions, lifts). "wins" and "concerns" are short, specific facts. "nextSteps" are one to four concrete actions for this week. No hype, no medical advice, no diets below maintenance-minus-500 kcal.

Return only the JSON object the schema describes.`;

/* ── goal intake ──────────────────────────────────────────────────────── */
const MAX_ROUNDS = 4;
const QuestionSchema = z.object({ id: z.string(), question: z.string(), options: z.array(z.string()) });
const IntakeSchema = z.object({
  ready: z.boolean(),
  summary: z.string(),
  goals: z.array(z.string()),
  assumptions: z.array(z.string()),
  questions: z.array(QuestionSchema),
});

const INTAKE_SYSTEM = `You are the coach inside Auramaxxing, a training app. Before you plan anything you must understand what this Hunter actually wants. You are given what they have said so far (their own words, plus any questions you asked and their answers) and their own data.

Decide whether you understand the goal well enough to design a plan that fits this person, and say so in "ready". Be thorough: a plan built on guesses fails, so cover everything below that their data does not already answer. Never ask what the data says.
- The outcome: what they want (look, strength, size of a body part, fat loss, a lift, endurance, or a mix), which matters most, and what "done" looks like to them.
- Timing: how soon, and whether there is a fixed date or event.
- Training they can really do: sessions a week, how long a session, where (gym, home, what equipment).
- Training history: how long they have trained, what programmes they have followed, what worked and what stalled or made them quit.
- Body and limits: injuries, pain, movements to avoid, anything a doctor told them.
- Fuel and recovery: how they eat now (protein, rough calories, meal habits, diet rules), sleep hours, stress, job activity.
- Preferences: exercises or styles they love or hate (machines, free weights, bodyweight), and skills they want to learn: calisthenics skills (pull-ups, muscle-up, handstand, planche, front lever, pistol squat, L-sit), running, swimming or a sport. Ask whether they want skill work in the plan at all, and which skills.
- Consistency: what usually gets in the way, so the plan fits their real week.
- If something that would change the plan is missing or vague, ask. Ask at most 5 questions in a round, only ones whose answer would change the plan, short and plain, each with 2 to 5 tap-able "options" (short answers; the Hunter can also type their own). Give every question a short id like "timeline" or "injuries". Put the most important questions first, and do not repeat one already answered.
- A vague goal like "look good" or "get fit" is not ready: ask what that means to them. Even a clear goal ("bigger arms, 12 weeks") is not ready until you know the training, history, limits and fuel/recovery points above, unless their data already covers them.
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
  const questions = ready ? [] : (raw.questions || []).slice(0, 5).map((q, n) => ({
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
function sanitizeDays(days, allowed, holds = new Set()) {
  if (!Array.isArray(days)) return null;
  const out = [];
  for (const d of days.slice(0, 6)) {
    const exercises = [];
    for (const e of (d.exercises || []).slice(0, 10)) {
      if (!allowed.has(e.name) || exercises.some(x => x.name === e.name)) continue;
      exercises.push(holds.has(e.name)
        ? { name: e.name, sets: Math.round(clamp(num(e.sets) ?? 3, 1, 6)), reps: Math.round(clamp(num(e.reps) ?? 10, 3, 90)) } // a hold: reps are seconds
        : { name: e.name, sets: Math.round(clamp(num(e.sets) ?? 3, 1, 6)), reps: Math.round(clamp(num(e.reps) ?? 8, 1, 30)) });
    }
    if (exercises.length) out.push({ name: str(d.name, 30) || `Day ${out.length + 1}`, exercises });
  }
  return out.length ? out : null;
}

/** What the client gets back: validated, clamped, nothing the Hunter did not see. */
function sanitizePlan(raw, { sex, exercises, holds }) {
  const allowed = new Set(exercises || []);
  const coach = raw.coach || {};
  const list = (a, n, max) => (Array.isArray(a) ? a.slice(0, n).map(s => str(s, max)).filter(Boolean) : []);
  return {
    look: sanitizeLook(raw.look, sex),
    focus: (raw.focus || []).filter(g => GROUPS.includes(g)).slice(0, 4),
    goal: GOALS.includes(raw.goal) ? raw.goal : 'general',
    sessionsPerWeek: Math.round(clamp(num(raw.sessionsPerWeek) ?? 3, 2, 6)),
    days: sanitizeDays(raw.days, allowed, new Set(holds || [])),
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

/** What the Hunter has at home, as short text, or null. */
function sanitizeHomeEquipment(h) {
  if (!h || typeof h !== 'object') return null;
  const told = Array.isArray(h.toldCoach) ? h.toldCoach.slice(0, 6).map(x => str(x, 240)).filter(Boolean) : [];
  const out = { kit: str(h.kit, 200), note: str(h.note, 200), toldCoach: told };
  return out.kit || out.note || told.length ? out : null;
}

/* ── the request ──────────────────────────────────────────────────────── */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_CHARS = 2_500_000;

/** The user turn: the Hunter's facts as JSON, plus an optional reference image. */
/** The app's own computed read of the Hunter (trainer read, plan score, whole history): data only, size-capped. */
function sanitizeTrainer(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  let o;
  try { o = JSON.parse(JSON.stringify(t)); } catch (_) { return null; }
  for (const k of ['history', 'fullHistory', 'read']) {
    if (JSON.stringify(o).length <= 16000) break;
    delete o[k];
  }
  return JSON.stringify(o).length <= 16000 ? o : null;
}

function buildFacts(input) {
  return {
    mode: ['review', 'intake', 'chat', 'home'].includes(input.mode) ? input.mode : 'design',
    planMode: input.planMode === 'home' ? 'home' : 'gym',
    homeEquipment: sanitizeHomeEquipment(input.homeEquipment),
    gymPlan: Array.isArray(input.gymPlan) ? input.gymPlan.slice(0, 7) : null,
    otherPlan: input.otherPlan && Array.isArray(input.otherPlan.days) ? { mode: input.otherPlan.mode === 'home' ? 'home' : 'gym', days: input.otherPlan.days.slice(0, 7) } : null,
    request: str(input.request, 600) || null,
    trainer: input.mode === 'chat' ? sanitizeTrainer(input.trainer) : null,
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
    holdExercises: Array.isArray(input.holds) ? input.holds.slice(0, 150).map(h => str(h, 80)).filter(Boolean) : [],
  };
}

function buildContent(input) {
  const facts = buildFacts(input);
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
  return sanitizePlan(response.parsed_output, { sex: input.sex, exercises: input.exercises, holds: input.holds });
}

/* ── chat ─────────────────────────────────────────────────────────────── */
const CHAT_LIMIT = 40;
const MAX_TURNS = 12;
const ChatSchema = z.object({
  reply: z.string(),
  days: z.array(DaySchema).nullable(),
  goal: z.enum(GOALS).nullable(),
  goals: z.object({ summary: z.string(), goals: z.array(z.string()) }).nullable(),
  suggestions: z.array(z.string()),
});

const CHAT_SYSTEM = `You are the coach inside Auramaxxing, chatting with one Hunter about their training. You can see their own data and the goals they confirmed, below. Talk like a good coach texting: direct, warm, specific, short (under 120 words unless they ask for detail). Use their real numbers.

- "trainer" in the data is the app's own computed read of them: findings on rhythm, recovery, performance and body, a plan score out of 100 with its measures, and their whole logged history. Use it for how-am-I-doing and will-I-progress questions, quote its real numbers, and never invent others.\n- Answer what they asked. Ask one short question at a time only when you truly need the answer to help.
- Respect their goals ("goals" in the data). If they say they want something different (a new target, a skill, dropping one, a new date), return the full updated list in "goals" (summary: one or two plain sentences; goals: one to four short statements, most important first, keeping the ones they did not change) and say in "reply" what you changed. Nothing is saved until they tap, so never say it is saved. Otherwise "goals" is null. A target look and date for tracking measurements is a separate setting they change from the goal card; point them there if they ask for that.
- If they ask WHY something is or is not in their plan ("why no front lever holds?"), look at currentPlan, their goals, the answers they gave in intake, and the exerciseList, and give the real reason in plain words: not in the list, not asked for, no room for the volume, recovery, a limit they told you about, or simply that you did not include it. Never invent a reason and never blame the app for what was your own choice. If they were not asked about it or it is a skill they want, say so and offer to add it. If the exercise is not in exerciseList at all, say so and offer the closest exercise that is.
- If they then ask to change it ("add it back", "I don't like X, drop it", "swap Y for Z"), do it: return the full adjusted plan. Start from the plan you proposed last in this conversation if it was not applied yet (its summary is in the conversation), otherwise from currentPlan.
- You may change their plan. Only when they ask for a change, or a change clearly follows from what they said (sore, missing equipment, a new target), return the FULL adjusted plan in "days" using exact exercise names from exerciseList (sets 2-5, reps 3-20, or seconds 5-60 for holdExercises, at most 6 sessions), keep what works, and say in "reply" what changed and why. Otherwise "days" is null. Nothing is applied until they tap.
- Set "goal" (strength, muscle, endurance, general) only when you return days; otherwise null.
- "suggestions" are 0 to 3 short things they might tap next (under 40 characters each), such as follow-up questions. Empty is fine.
- Respect recovery: if their feedback shows heavy soreness or missed work, do not add volume. No medical advice, no diets below maintenance minus 500 kcal. Never promise a result. Never identify anyone.`;

/** The conversation as alternating turns that start and end with the Hunter, bounded. */
function sanitizeTurns(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages.slice(-MAX_TURNS)) {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user';
    const content = str(m && m.content, role === 'assistant' ? 2500 : 800); // a coach turn can carry the plan it proposed
    if (!content) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + content;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
}

function sanitizeChat(raw, { exercises, holds }) {
  const reply = str(raw.reply, 1500);
  if (!reply) return null;
  const days = sanitizeDays(raw.days, new Set(exercises || []), new Set(holds || []));
  const g = raw.goals && Array.isArray(raw.goals.goals) ? raw.goals.goals.slice(0, 4).map(x => str(x, 160)).filter(Boolean) : [];
  return {
    reply,
    days,
    goals: g.length ? { summary: str(raw.goals.summary, 500), goals: g } : null,
    goal: days && GOALS.includes(raw.goal) ? raw.goal : null,
    suggestions: (raw.suggestions || []).slice(0, 3).map(x => str(x, 40)).filter(Boolean),
  };
}

/** One chat turn: the coach's reply and, only when it changes the plan, the full adjusted plan. */
async function designChat({ client, input }) {
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
  const turns = sanitizeTurns(input.messages);
  if (!turns.length) {
    const e = new Error('Say something to the coach first.');
    e.code = 'unparseable';
    throw e;
  }
  const facts = buildFacts({ ...input, mode: 'chat' });
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: 'low', format: zodOutputFormat(ChatSchema) },
    system: `${CHAT_SYSTEM}\n\nThe Hunter's data:\n${JSON.stringify(facts)}`,
    messages: turns,
  });
  if (response.stop_reason === 'refusal') {
    const e = new Error('The coach could not help with that. Try asking differently.');
    e.code = 'refused';
    throw e;
  }
  const out = response.parsed_output ? sanitizeChat(response.parsed_output, { exercises: input.exercises, holds: input.holds }) : null;
  if (!out) {
    const e = new Error('The coach answered in a form the app could not read. Try again.');
    e.code = 'unparseable';
    throw e;
  }
  return out;
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

module.exports = { sanitizeTrainer, sanitizeHomeEquipment, MODEL, GROUPS, GOALS, PlanSchema, SYSTEM, sanitizeLook, sanitizeDays, sanitizePlan, buildContent, designPlan, MAX_IMAGE_CHARS, IntakeSchema, INTAKE_SYSTEM, MAX_ROUNDS, sanitizeIntake, sanitizeIntakeState, sanitizeGoals, designIntake, buildFacts, ChatSchema, CHAT_SYSTEM, CHAT_LIMIT, MAX_TURNS, sanitizeTurns, sanitizeChat, designChat };

/** Daily limit per Hunter: the usage record to store and whether one more call is allowed. */
const DAILY_LIMIT = 10;
function nextUsage(prev, today, max = DAILY_LIMIT) {
  const used = prev && prev.date === today && Number.isFinite(prev.count) ? prev.count : 0;
  if (used >= max) return { allowed: false, usage: { date: today, count: used } };
  return { allowed: true, usage: { date: today, count: used + 1 } };
}
module.exports.nextUsage = nextUsage;
module.exports.DAILY_LIMIT = DAILY_LIMIT;
