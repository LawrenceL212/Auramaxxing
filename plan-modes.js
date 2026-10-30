/* =========================================================================
   HOME AND GYM PLANS

   A Hunter can keep two plans, one for the gym and one for home, and pick on
   the day which one to do. Both live in the existing `programs/{uid}` doc:

     top-level fields   the plan in use now, exactly as before, so every reader
                        (streak, reminders, party, admin) keeps working
     mode               'gym' | 'home', which plan the top level is (optional)
     alt                the other plan, same shape (optional)

   A doc without `mode` is a plan from before this feature: it is the gym plan.
   Switching swaps the top level and `alt`; each plan keeps its own rotation
   (currentDayIndex) and each day its own lastDate.

   Workouts logged while two plans exist carry an optional `planMode`, so a
   home session never ticks the gym plan's day of the same number. Workouts
   without it belong to the gym plan.

   Pure, so test/plan-modes.test.mjs exercises it without a browser.
   ========================================================================= */

export const PLAN_MODES = ['gym', 'home'];

const hasKeys = (o) => !!(o && typeof o === 'object' && Object.keys(o).length);

/** The stored doc split into the plan in use, its mode and the other plan. */
export function splitProgramDoc(data) {
  if (!hasKeys(data)) return { mode: 'gym', active: null, alt: null, stored: false };
  const { mode, alt, ...rest } = data;
  return {
    mode: PLAN_MODES.includes(mode) ? mode : 'gym',
    active: hasKeys(rest) ? rest : null,
    alt: hasKeys(alt) ? alt : null,
    stored: PLAN_MODES.includes(mode),
  };
}

/**
 * The doc to write. Before the Hunter has ever used a second plan (no stored
 * mode, no other plan, gym) it is the plan alone, byte for byte as before.
 */
export function programDocFor(active, mode, alt, stored) {
  const plan = hasKeys(active) ? stripModeFields(active) : {};
  if (!stored && !hasKeys(alt) && mode === 'gym') return plan;
  const out = { ...plan, mode: PLAN_MODES.includes(mode) ? mode : 'gym' };
  if (hasKeys(alt)) out.alt = stripModeFields(alt);
  return out;
}

function stripModeFields(p) {
  const { mode, alt, ...rest } = p;
  return rest;
}

/** After switching to `to`: which plan is in use and which is kept aside. */
export function switchPlans({ mode, active, alt }, to) {
  if (!PLAN_MODES.includes(to) || to === mode) return { mode, active, alt };
  return { mode: to, active: alt || null, alt: active || null };
}

/** The gym plan and the home plan, whichever is in use. */
export function plansByMode({ mode, active, alt }) {
  return mode === 'home' ? { gym: alt || null, home: active || null } : { gym: active || null, home: alt || null };
}

/**
 * The weekdays the streak counts as training days. Always the gym plan's (the
 * plan from before this feature), so picking home for a day never changes
 * which days were rest days. A Hunter with only a home plan uses that one.
 */
export function streakScheduleOf(state) {
  const { gym, home } = plansByMode(state);
  const s = (gym && gym.schedule && gym.schedule.length ? gym.schedule : null) || (home && home.schedule) || [];
  return s;
}

/** Same, straight from a stored doc (another Hunter's, or the reminders function). */
export function streakScheduleOfDoc(data) {
  return streakScheduleOf(splitProgramDoc(data));
}

/** True when workout `w` was logged for the plan of `mode`. Untagged workouts are the gym plan's. */
export function workoutInMode(w, mode) {
  return ((w && w.planMode) || 'gym') === (mode || 'gym');
}

/* ── home equipment ─────────────────────────────────────────────────────── */

/** What the Hunter can tick for home. `cats` are the exercise library's equipment values it opens up. */
export const HOME_KIT = [
  { id: 'bodyweight', label: 'Bodyweight only', cats: ['Bodyweight'], words: /\b(bodyweight|body weight|no equipment|nothing)\b/i },
  { id: 'bar', label: 'Pull-up bar', cats: ['Bodyweight'], words: /\b(pull.?up bar|chin.?up bar|door(way)? bar|bar at home)\b/i },
  { id: 'rings', label: 'Rings', cats: ['Bodyweight'], words: /\brings?\b/i },
  { id: 'dumbbells', label: 'Dumbbells', cats: ['Bodyweight', 'Dumbbell'], words: /\b(dumb.?bells?|db'?s)\b/i },
  { id: 'kettlebell', label: 'Kettlebell', cats: ['Bodyweight', 'Dumbbell'], words: /\bkettle.?bells?\b/i },
  { id: 'bands', label: 'Bands', cats: ['Bodyweight'], words: /\b(resistance )?bands?\b/i },
  { id: 'bench', label: 'Bench', cats: ['Bodyweight'], words: /\bbench\b/i },
  { id: 'barbell', label: 'Barbell + rack', cats: ['Bodyweight', 'Barbell'], words: /\b(barbell|squat rack|power rack|plates)\b/i },
  { id: 'cable', label: 'Cable / machine', cats: ['Bodyweight', 'Cable', 'Machine'], words: /\b(cable|machine|smith|home gym)\b/i },
];

const HOME_WORDS = /\b(home|house|garage|apartment|flat|room)\b/i;
const EQUIP_WORDS = /\b(equipment|home|garage|house|apartment|flat|room|dumb.?bells?|kettle.?bells?|bands?|pull.?up bar|chin.?up bar|rings?|bench|barbell|rack|plates|cable|machine|smith|bodyweight|mat)\b/i;

/**
 * Things the Hunter already told the coach about training at home: intake
 * answers, their own words, the coach's stated assumptions and their own chat
 * messages. Each note is a short line; the most specific come first.
 */
export function homeEquipmentNotes({ coachProfile, chat } = {}) {
  const notes = [];
  const add = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t || !EQUIP_WORDS.test(t) || !/\bhome|house|garage|apartment|flat|room|equipment\b/i.test(t) && !HOME_KIT.some(k => k.id !== 'bodyweight' && k.words.test(t))) return;
    const line = t.slice(0, 240);
    if (!notes.includes(line)) notes.push(line);
  };
  const cp = coachProfile || {};
  (cp.answers || []).forEach(a => {
    if (!a) return;
    const q = String(a.q || ''), ans = String(a.a || '');
    if (EQUIP_WORDS.test(q) || EQUIP_WORDS.test(ans)) add(`${q.replace(/\?*$/, '?')} ${ans}`.trim());
  });
  splitSentences(cp.text).forEach(add);
  (cp.assumptions || []).forEach(add);
  (chat || []).filter(m => m && m.role === 'user').forEach(m => splitSentences(m.content).forEach(add));
  return notes.slice(0, 6);
}

function splitSentences(s) {
  return String(s || '').split(/(?<=[.!?\n])\s+/).map(x => x.trim()).filter(Boolean);
}

/** The kit ids a set of notes mentions. */
export function kitFromNotes(notes) {
  // only lines about home: "full gym with machines" is not home kit
  const text = (notes || []).filter(n => HOME_WORDS.test(n)).join(' \n ');
  return HOME_KIT.filter(k => k.words.test(text)).map(k => k.id);
}

/** Exercise names a home plan may use, from the library and the ticked kit. */
export function homeExerciseNames(defs, kit) {
  const cats = new Set(['Bodyweight']);
  (kit || []).forEach(id => (HOME_KIT.find(k => k.id === id)?.cats || []).forEach(c => cats.add(c)));
  return Object.entries(defs || {}).filter(([, d]) => d && cats.has(d.equipment || 'Bodyweight')).map(([n]) => n);
}

/** The home kit as plain words for the coach. */
export function kitLabel(kit) {
  const labels = (kit || []).map(id => HOME_KIT.find(k => k.id === id)?.label).filter(Boolean);
  return labels.length ? labels.join(', ') : 'Bodyweight only';
}
