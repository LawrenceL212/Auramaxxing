# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory final phase

Before any production merge or push, **Phase 11 — Full System Integrity /
Regression** must pass. See [PHASE-11-REGRESSION.md](PHASE-11-REGRESSION.md) for
the 17-area checklist, the pre-cinematic performance baseline to compare
against, the gameplay-immutability audit command, and the register of already
known defects, blockers and expected-UNVERIFIED areas.

The cinematic work is not complete until that regression passes. A feature that
cannot be safely tested is marked UNVERIFIED, never PASS.

## Prime directive — this is a stable production game with live user data

Real users have accumulated progression state in Firestore that **cannot be regenerated from nothing**. Presentation, visual, and UI work must not alter gameplay behaviour.

Do **not** modify the following without explicit, per-task authorization:

- **Scoring/progression formulas** — `computeWorkoutXP`, `xpForLevel`, `levelFromTotalXP`, `apForLevel`, `epley1RM`, `getStrengthTier`, `calcResistanceScore`, `calcTimedScore`, `computeSessionDungeonDamage`, `computeSessionArmySoldiers`
- **Constant tables that feed them** — `TIER_XP`, `STAT_BONUS_XP`, `STAT_RANK_AP_COST`, `RANK_TIERS`, `SKILL_TIERS`, `MILESTONES`, `statWeights`/`skillTier` in `exercises.js`
- **Firestore shape** — collection names, document fields, write paths
- **The reconciliation system** (`index.html`, section `STATE RECONCILIATION SYSTEM`) and `RECONCILE_VERSIONS`
- **Auth flow and Firestore security rules**

Changing a rendering function is presentation. Changing a number that feeds a stored value is gameplay. When a task sits on the boundary, ask before proceeding.

### Why formula edits are especially dangerous here

`RECONCILE_VERSIONS` (`const RECONCILE_VERSIONS`, `index.html`) is a per-subsystem version map (`xp`, `dungeon`, `army`, `prs`, `milestones`, `date`). On startup, `startupIntegrityCheck()` compares each against `profile._reconcileVersions.{key}` and **replays every user's entire workout history** through the current formulas for any subsystem whose version increased.

The consequence: editing a formula *without* bumping its version silently desynchronizes new results from stored state. Editing one *with* a bump rewrites live progression for every user on next load. Never bump a version casually — it is a migration trigger, not a cache buster.

## Commands

**There is no build system, package manager, bundler, test suite, or linter.** No `package.json`, no `node_modules`. Do not introduce one without discussion — the zero-build architecture is deliberate (see below).

```bash
# Run locally — required; opening index.html via file:// breaks
# anatomy.svg fetch() and ES module imports
python -m http.server 8000     # then http://localhost:8000

# Deploy — any static host
firebase deploy                # or drag the folder to Netlify/Vercel
```

Verification is manual: load the app in a browser and exercise the affected screen. There are no automated tests to run.

## Finding things in index.html

`index.html` is ~25,000 lines, so **search by name, never read it whole**: `grep -n "function name"`
or a section banner (`grep -n "^   STATE RECONCILIATION"`). Line numbers below are approximate and drift;
trust the name. Read 100–200 lines around a hit, not the file.

| Lines (approx.) | What lives there |
|---|---|
| 14–3441 | `<style>`: all CSS. Tokens are CSS custom properties; screen styles are grouped by comment banners |
| 3443–3930 | Markup: one `section.view#view-<name>` per screen (quest, board, trends, exercises, history, feats, inventory, world), plus the workout logger modal |
| 3939–25035 | The main `<script type="module">` |
| 3967 | Firebase config; 3990 exercise database merge; 4118 global state; 4552 helpers |
| 4672 | Auth; 5230 nav (`switchView`) |
| 7676 | Data load (Firestore reads into `allWorkouts`, `myWorkouts`, `profile`) |
| 7820 | Quest / program screen; 8340 progressive overload engine |
| 9032 | State reconciliation (`RECONCILE_VERSIONS`, `reconcileState`, `startupIntegrityCheck`) |
| 9527–10400 | Workout logger: `openExercisePicker`, `addExerciseRow` (set rows, load picker), `gatherExercises`, the save handler |
| 10283 | Rank; 11064 PR system; 11290–11700 XP formulas (`xpForLevel`, `computeWorkoutXP`, `awardWorkoutXP`) |
| 11879 | Aura points and character stats; 13529 system modals; 14562 class system |
| 15081 | Admin functions; 16406 debrief modal |
| 17867 | Trends; 19028 exercise library; 19503 feats; 19588 inventory; 19948 trial keys |
| 20938 | Dungeon damage; 22888 calendar and history (`openWorkoutDetail` with Edit); 23910 shadow army |

Small, testable logic lives in separate files with tests in `test/` (`set-inputs.js`, `backfill.js`, `streak.js`, `goals.js`, `habit.js`, `physique.js`, `optimiser.js`): prefer putting new logic there, not in `index.html`.

## Architecture

### Zero-build static PWA

14 tracked files served verbatim. `index.html` is a **1.1 MB, ~25,000-line single file** holding all CSS, markup, and the main `<script type="module">` (see the map below). Firebase 10.12.2 is imported as ESM directly from `gstatic.com`, both statically at the top and via inline `await import(...)` at ~25 call sites throughout.

Any new runtime dependency must follow the same pattern — **CDN ESM URL or import map**, not npm. An import map must be declared *before* the main module block (an `<script type="importmap">` already sits there).

### Module split

Statically imported at the top of the main module:

- [exercises.js](exercises.js) — `BASE_EXERCISES`; each entry carries `intent`, `statWeights` (XP distribution across the 6 stats), `muscles` (0–1 emphasis), `equipment`, optional `skillTier`. Merged with per-user custom exercises by `rebuildExercisesAll()`.
- [progression-chains.js](progression-chains.js), [archetype-chains.js](archetype-chains.js), [auto-achievements.js](auto-achievements.js)

[physique.js](physique.js) draws the Hunter's own muscle map to their body: muscles grow with
12 weeks of training plus PR tiers, and the build comes from check-in tape measurements, else
`profile.heightCm` (set in Settings) and the latest weigh-in. `bodySvg()` applies it; pure, so
`node test/physique.test.mjs` tests it. Presentation only.

[backfill.js](backfill.js) holds the rules for logging a past session (up to 30 days back, never
the future, no identical session twice on one date). Past sessions use the normal save path, so every
reward treats them as if logged on that date. Pure, so `node test/backfill.test.mjs` tests it.

[set-inputs.js](set-inputs.js) decides which inputs the logger shows for a set (kg + reps, reps,
load + reps, seconds, h:mm, or h:mm:ss + km) from fields each exercise already has, and turns them into
the same stored fields as before. Exercises with a kg input also get a Load picker (kg, Bands,
Band assisted on bodyweight moves, Bodyweight, No weight, plus band strength); non-kg sets store
weight 0 with optional `load`/`band` fields, so formulas read them like a set with no kg. Pure, so
`node test/set-inputs.test.mjs` tests it.

[optimiser.js](optimiser.js) suggests plan changes from the plan and the logged sessions: a set
off a lift that has stalled at RIR 0-1, rep targets moved into the range for the plan's goal
(Strength, Muscle, Endurance, General), raised targets on bodyweight, band and no-weight moves and
holds, and weekly sets per muscle group against volume landmarks. It also reads each personal goal
and directive against the training record (`assessGoals`: e1RM trend, sessions count, run pace,
consistency) and tunes the plan toward the ones that are stalled, behind or missing from the plan. The card under the quest carousel (`renderPlanOptimiser`) applies a suggestion only when
tapped, through the same `programs/{uid}` write as the plan editor; the plan stores the picked
`goal` and stamps a changed exercise `optimisedAt`. Pure, so `node test/optimiser.test.mjs` tests it.

[plan-gen.js](plan-gen.js) is the pure side of "Build a plan with the System": the Hunter writes a goal, the `generatePlan` Cloud Function (`functions/lib/generate-plan.js`, Anthropic key in the `ANTHROPIC_API_KEY` secret) returns a proposal, and `validatePlan` keeps only exercises that exist and nothing from a muscle group the Hunter ruled out. It also holds the caliper body-fat (Jackson-Pollock) and goal-feasibility maths. Nothing saves until Accept, which writes `programs/{uid}` like the plan editor and offers an Undo; standing preferences live in localStorage. Pure, so `node test/plan-gen.test.mjs` and `node test/generate-plan.test.mjs` test it. No XP, stat or progression value is read or written.

[plan-metrics.js](plan-metrics.js) scores a plan out of 100 the way a trainer reads a programme (weekly sets per muscle group against the landmarks, frequency, push/pull and upper/lower balance, session length, rep ranges for the goal, recovery gaps, lifts rising, adherence), and `diffPlans` lists what an adjustment changed. Every number is computed, never written by the AI. The "Ask your trainer" box sends a sentence plus the current plan to `generatePlan`; the result is previewed with a diff and the before/after score, and saved only on Accept. Pure, so `node test/plan-metrics.test.mjs` tests it.

[trainer-insights.js](trainer-insights.js) is the "Trainer read": rhythm (gaps between sessions), recovery (muscle readiness, volume spikes, days in a row, deload signs), performance (lifts rising or stalled, PRs) and body metrics (weight trend, waist, weigh-in gaps, body and lifts read together), recomputed on every open from logs. Each finding can carry a sentence that opens "Ask your trainer". The `askTrainer` Cloud Function answers free questions from that computed context (text only, plus an optional one-sentence plan change the Hunter must tap and accept). `fullHistory()` boils the whole logged history (first session to today: monthly consistency, each main lift since its first session, longest breaks, weight and waist over time) into a compact object that goes to every trainer request, with personal records, goals and check-ins. Read-only; no progression values touched. `node test/trainer-insights.test.mjs`.


[weigh-in.js](weigh-in.js) is the pure side of the weigh-in input in the check-in hub (`openCheckinHub('weigh')`:
start value, −0.5/−0.1/+0.1/+0.5 steppers, a typed value, the change since the last weigh-in) and of the Codex Weight
card's trend (`weightOnTrackHtml`: a dot per weigh-in, the 7-day average line, 7-day avg, 30-day change, kg per week).
It also has a goal-pace helper (`goalPace`) that nothing uses yet; goal pace on screen is `weight-path.js`. Writes
nothing. Pure, so `node test/weigh-in.test.mjs` tests it. Presentation only.
[body-metrics.js](body-metrics.js) is the maths behind the weekly check-in (`openCheckinModal`): every tape
field is a circumference (measured around the body), and it gives US Navy body fat (female needs hips,
no height means no estimate), fat/lean mass, BMI, FFMI, waist-to-height, V-taper (shoulders ÷ waist) against
the 1.618 golden ratio, chest ÷ waist, arm balance, warnings for a width typed as a circumference, and ranked
physique priorities. The plan optimiser takes the priorities' muscle groups as `physiqueFocus` (latest
check-in under 8 weeks old) and gives them the growth dose. Stored check-in fields are unchanged. Pure, so
`node test/body-metrics.test.mjs` tests it. Presentation only.

[weight-path.js](weight-path.js) turns a Bodyweight directive into a path: a straight "where you should be today" line from the start weight and date to the goal, held against the 7-day average (ahead or behind in kg, finish date at the current pace against the chosen date, percent of goal, lowest so far, needed pace and the daily kcal it implies) plus this week's average against last week's. `weightPathHtml()` shows it on the screen after a check-in saves (`showCheckinResults`) and on the Codex Weight card. Reads `myWeights` and the directive only; pure, so `node test/weight-path.test.mjs` tests it. Presentation only.

Calipers are optional extra inputs in the same check-in: `body-metrics.js` adds 3-site Jackson-Pollock skin folds (men chest/abdomen/thigh, women triceps/suprailiac/thigh, ages 18-61) and uses them for body fat over the tape formula when all three folds and an age are in; the two are never compared across methods in progress rows. New optional `checkins` fields: `skinfolds`, `age`, `bodyFatSource`.

[weight-rate.js](weight-rate.js) is the weekly weight goal: the Hunter picks an average to lose a week (0.25 to 1 kg, or typed), a line falls at that rate from their 7-day average on the day they set it, and every weigh-in's 7-day average is judged against it (ahead, on pace within 0.3 kg, behind), with the average per week since the start and this week against last. Shown in the weigh-in input (live as the number changes), after a weigh-in saves, and on the Codex Weight card (`weightRateHtml`, `openWeightRateSheet`). The one stored value is `users.weightRateGoal = {kgPerWeek, since}` (additive, optional; negative to lose; a new pick starts a new line). Pure, so `node test/weight-rate.test.mjs` tests it. Presentation only.

[physique-goal.js](physique-goal.js) turns a chosen look (Lean, Athletic, Golden V; men and women) plus a deadline into a plan from the latest check-in: target waist, shoulders, chest, arms, body fat and weight, a Cut then Build phase plan (fat loss 0.75% of bodyweight a week, muscle gain by training age, an FFMI 25 realism ceiling), protein, sessions a week, and a verdict (on schedule, tight, not realistic with the earliest date). It re-solves from the latest check-in every time it is shown, so it adjusts as the body does. `profile.physiqueGoal = {preset, deadline, startDate, start}` (a new additive field on `users/{uid}`) is the only thing stored. Its focus feeds the plan optimiser and its waypoints draw the weight path (`weight-path.js` accepts `waypoints`). Pure, so `node test/physique-goal.test.mjs` tests it. Presentation and planning only.

[progress-check.js](progress-check.js) is the Hunt screen's Progress check: streak, week and 30-day sessions, PRs, last check-in changes, goal progress, and one next step, picked only from what the numbers say. Reads state, writes nothing; `node test/progress-check.test.mjs` tests it.

[fitness-score.js](fitness-score.js) folds strength tiers (from the existing standards tables, passed in as tier names), consistency and body (body fat, waist ÷ height, FFMI) into one 0-100 fitness level with the weakest part's next step; a missing part is left out and the rest re-weighted. [rhythm.js](rhythm.js) splits check-ins by how fast the number moves: weigh daily (10 sec, the hub's `openCheckinHub`), tape weekly, full scan (calipers, thigh) every 28 days, always leading with the smallest ask that is due, with an honest reward after a weigh-in (7-day average, week dots). Between caliper scans `body-metrics.js` nudges the tape formula by how far it read from the calipers last time (`calibrationOffset`, source `tapeCal`). The 7-site calipers add `fatDistribution` (trunk vs limb) and `limbMuscle` (corrected girth = girth - pi x fold, Heymsfield arm muscle area). Presentation only; tested in `test/fitness-score.test.mjs`, `test/rhythm.test.mjs`, `test/body-metrics.test.mjs`.

[session-feedback.js](session-feedback.js) takes four ratings after a session (pump, soreness, workload, performance); a muscle group whose last two sessions agree on add or reduce gets a one-set `volumeNudge` into `optimisePlan`, shown as an ordinary suggestion the Hunter applies. Stored as `users.feedback[date]` (additive map, pruned to 60 days); workouts are never rewritten. [mesocycle.js](mesocycle.js) is the 6-week block (RIR 3, 2, 2, 1, 0, then a deload week of half the sets), guidance only; the one stored value is `users.block.start`. Tests in `test/session-feedback.test.mjs` and `test/mesocycle.test.mjs`.

The AI coach (`designPlan` Cloud Function, [functions/lib/design-plan.js](functions/lib/design-plan.js), Claude Opus 5.5 through the Anthropic SDK, structured output) is the one place the app calls a model. In "design" mode the Hunter describes a look in words, several goals, a character or a reference photo; it picks target proportions (the app's `physique-goal.js` maths then plans the timeline and says honestly if it is unrealistic; `preset: 'custom'` with `custom` stored on `users.physiqueGoal`) and proposes a plan. In "review" mode (Progress check, "Ask the coach") it says how the Hunter is doing and proposes plan changes. Nothing is applied until the Hunter taps; exercise names are checked against the app's list, numbers are clamped, and a plan replaces the old one only on a second tap. The key is a Firebase secret (`ANTHROPIC_API_KEY`), callers must be signed in, and usage is limited to 10 a day per Hunter (`users.aiCoach`, written by the function). Deploy with `npm run deploy:coach` in `functions/`. Before any of that the coach needs the Hunter's goals: "intake" mode (`openCoachIntake`) takes what they want in their own words (or a photo), asks up to 5 short tap-able questions a round for at most 4 rounds (outcome, timing, real training time and equipment, training history, injuries, diet, sleep and recovery, what gets in the way; never what the data already says) (the last round fills any gap with a stated assumption), then states the goals back; only on "Yes, that's it" is `users.coachProfile = {summary, goals, assumptions, answers, text, updated}` saved (additive field). Every later coach call reads it, and the coach buttons (goal sheet, Progress check) open intake first when it is missing; "Change my goals" reopens it. The Hunt screen shows the Hunter's goal right under the hero (`renderHuntGoal`, `#hunt-goal`): the look, a progress bar from `goalProgress`, weeks left, the date, the verdict chip and the first coach goal; tap opens the goal sheet, "Ask the coach" opens the review. Presentation only. The plan optimiser card is no longer on the Hunt screen (the coach replaced it; `#plan-optimiser` was removed from the markup, so `renderPlanOptimiser` renders nothing); `optimiser.js` and the function are kept, nothing was deleted. The Hunt "more" area opens on a coach chat (`renderCoachChat`, `coachChatSend`, mode "chat"; the goal card's "Message the coach" opens it): a short conversation about the Hunter's own data and confirmed goals; it answers why-questions about the plan ("why no front lever holds?") and edits it on request ("add it back"); a reply may carry a full adjusted plan, applied only on a tap (a second tap to replace). The coach's exercise list includes timed holds (`holds` in the request: reps are seconds, up to 90); minutes-based timed work and runs stay out. The conversation lives in the browser only (`localStorage`, last 20 messages); chat has its own daily limit of 40 messages (`users.aiChat`, written by the function). Tested without the network in `test/design-plan.test.mjs`.

[plan-modes.js](plan-modes.js) gives a Hunter a gym plan and a home plan, picked on the day with the Gym | Home switch under the Hunt hero (`renderPlanModeBar`, `#hunt-mode`, `setPlanMode`). Both live in `programs/{uid}`: the top-level fields are the plan in use exactly as before (so streak, reminders, party and admin read it unchanged), with two optional fields, `mode` ('gym' | 'home') and `alt` (the other plan). A doc with no `mode` is the gym plan and is written back unchanged until the Hunter first switches; every plan write goes through `programDoc()`. Each plan keeps its own rotation. Rest days for the streak always come from the gym plan (`streakScheduleOf`, also in `send-reminders.js`). Sessions logged for a plan day while two plans exist carry an optional `planMode` on the workout so a home day never ticks the gym day of the same number; untagged workouts are the gym plan's. "Build my home plan with the coach" (`openHomePlanCoach`) sends coach mode "home": the coach designs the plan for the Hunter's goal physique (their coach goals, look and measurements), restricted only by the home kit; the gym plan is context, not a template, and sets only the number of sessions. It needs confirmed coach goals (opens intake first), finds home equipment the Hunter already told the coach (intake answers, their words, chat) or a party member's, asks only when nothing is known, saves the kit as `users.homeEquipment = {kit, note, updated}` (additive), limits the exercise list to that kit, and saves the result only on a tap (on the gym plan's training days when the session count matches). The coach always gets `planMode`, `homeEquipment` and the other plan. Pure, so `node test/plan-modes.test.mjs` tests it. No XP, stat or progression value is read or written.

[ui-system.css](ui-system.css) is the shared "System window" look (`.ui-window`, `.ui-banner`, `.ui-btn-primary`, `.ui-chip`, `.ui-tile`, `.ui-row`, `.ui-crest`, ...), linked from `index.html`; every rule is scoped to a `.ui-*` class, so it restyles nothing that does not opt in. [ui-art.js](ui-art.js) gives painted-art slots (`uiArt(name)`, files go in `art/ui/`, code stand-ins until then) and the sigil/ring/equipment-icon SVG generators. [hunt-view.js](hunt-view.js) (week strip, last-time label, up-next) and [quick-quest.js](quick-quest.js) (the fixed bodyweight Quick 15 circuit, logged as an ordinary workout) are pure, tested in `test/hunt-view.test.mjs`, `test/quick-quest.test.mjs`, `test/ui-art.test.mjs`. Presentation only.

[flow-view.js](flow-view.js) is the pure side of the flow screens (Enter Gate before the logger, the logger header's muscle figure, Gate Complete reward tiles, Rank Up, the after-hunt next step, bottom-nav dots), tested in `test/flow-view.test.mjs`. Reward tiles show only real XP / AP / streak (the game has no gold); a nav dot shows only for AP that can actually be invested (Rank) or soldiers waiting to deploy (World). Presentation only: every button reuses its existing handler.

[suggestions.js](suggestions.js) is the suggestion box and bug reporter: any Hunter sends an idea or a bug from Settings (and a "Something went wrong · Report it" pill appears once per session after an uncaught error). A bug report carries `context` built by `bugContext()` (screen, open sheet, device, viewport, installed or browser, time zone, page version date, level and the last errors kept by the small error-trail `<script>` before the import map; error toasts are kept too). Stored in a new `suggestions` collection (`uid, name, text, status, kind, context?, createdAt`; the admin adds `statusAt`). The admin uid reads them in the Suggestions inbox (Settings → Admin), and "Send to Claude" copies a ready-made prompt (`claudePrompt`) and opens claude.ai with it. Rules are in the project's firestore-draft. Pure, so `node test/suggestions.test.mjs` tests it. Writes nothing else.

Lazy-loaded: [classes.js](classes.js) via `await import('./classes.js')` in the class system section (6 root archetypes, 63 paths, 250+ class names) — kept out of the initial load deliberately.

[countries_embedded.js](countries_embedded.js) (1.4 MB `COUNTRIES_GEO`) is imported **only** by [shadow-world.html](shadow-world.html), never by `index.html`.

Arsenal (`view-exercises`) and World (`view-world`) wear the same look. World is a portrait page with an
Army / Dungeons / Raids switch (`setWorldPane`, `renderWorldDungeons`, `renderWorldRaids` in `index.html`); the
Shadow World iframe and its message handlers are untouched, and "Full map" restores the old fullscreen map.
Presentation only; the map in `nothing-lost-map.md` lists where each old part went.

### Rendering model

Hand-rolled, no framework. `switchView(name)` (`index.html`) toggles `.active` on `section.view#view-<name>` and syncs `.bottom-nav`. Screens are ~30 `renderX()` functions that build HTML strings and assign `innerHTML`, re-rendering wholesale rather than diffing.

`#view-world` is the exception: fixed-position fullscreen, and it hosts [shadow-world.html](shadow-world.html) in an `<iframe>` (search `shadow-world.html`). Shadow World is an independent 851-line page drawing the country map to a **2D canvas** with CSS-transform pan/zoom.

Global mutable state: `currentUser`, `profile`, `myProgram`, `authMode` — module-scoped `let` bindings read directly by render functions.

### Art stack (`art/`)

A procedural, toon-shaded three.js art pack ported from Grimoire: zero image assets, everything is code.
`art/kit.js` (toon materials, ink outlines, cached geometry), `art/theme.js` (palette mirrored from the
CSS tokens), `art/registry.js` (asset factories with triangle budgets, footprints and checks; pure, so
`node test/art-registry.test.mjs` tests it), `art/packs/*.js` (the assets). Review assets in
`/art/catalogue.html` under the local server. Authored `.glb` models (`art/models.js`, `art/look.js`,
registered in `art/models/index.js`; see [art/MODELS.md](art/MODELS.md)) replace a code-drawn asset by
id through `take()`/`resolve()`. Each raid tier (E–S) has its own boss model (`raid-boss:<tier>`), built in Blender from
`art/models/src/bosses/` (a shared kit plus one script per boss); the Monarch is tier A and the default.
The 14 weekly named bosses each have a model too (`raid-boss:named:<slug of the name>`), built on
`art/models/src/bosses/armour.py` (a plate cut to each muscle); the raid card shows the week's boss in 3D
through `art/boss-stage.js`, attacking when tapped.
The reward reveal (`buildRewardScene`) and the raid boss
(`buildSystemCoreScene`) use the pack lazily and fall back to the old primitives if it fails to load;
wire further screens the same way, through the existing AuraGL runtime. Presentation only.

### Firestore collections

Nine in use: `users/{uid}`, `workouts/{autoId}`, `programs/{uid}`, `customExercises/{autoId}`, `bodyweight/{autoId}`, `prs/{...}`, `apEvents/{...}`, `checkins/{...}`, `suggestions/{autoId}` (ideas and bug reports, nothing reads them for gameplay).

⚠️ [SETUP.md](SETUP.md) is **stale** — it documents only five collections and omits `prs`, `apEvents`, and `checkins`, and its security-rules block covers only the five it knows about. Trust the code over SETUP.md; treat SETUP.md as first-time setup instructions, not a current data-model reference.

### State reconciliation — the central invariant

Documented in a header comment of the `STATE RECONCILIATION SYSTEM` section. Read it before touching anything that writes progression state.

- **Authoritative, never rewritten:** the `workouts` collection (exercises, sets, reps, weight, RIR/RPE, dates)
- **Derived, repaired when stale:** `hunterXP`, `hunterLevel`, `statTrainingXP`, level-derived AP, `prs`, `activeDungeon.hp`, `shadowArmy.pool`, `milestonesAchieved`, `lastWorkoutDate`
- **Not reconstructable — never overwrite:** manually granted `auraPoints`, stat ranks and `statTimeAtRank` (time-gated), `inventory.earnedAt`, duel state, `shadowArmy.countries`, `streakFreeze`

Each `reconcileX()` function takes a `dryRun` flag; `reconcileState(scope, dryRun, versionForce)` (`index.html`) orchestrates. Prefer `dryRun = true` when investigating.

## Conventions

- **Six stats**, spelled `defence` (British) throughout: `strength`, `endurance`, `agility`, `focus`, `flexibility`, `defence`
- **Ranks** E → D → C → B → A → S
- **21 muscle regions**, matching the named shapes traced in `anatomy.svg` / `anatomy-female.svg`. Custom exercises must target these exact names or the heatmap silently misses them.
- Theming runs on CSS custom properties (`--brass`, `--violet`, `--rank-s`, `--growing`, …). Prefer editing tokens over hardcoding colors; note that several render functions define local `STAT_COLORS`/`STAT_ICONS` maps inline and duplicate each other — they are not a single source of truth.
- Source files are UTF-8 with box-drawing comment banners (`── SECTION ──`) and emoji. Preserve the encoding when editing.

## Mobile constraints

`manifest.json` declares `display: standalone` and **`orientation: portrait`** — the installed PWA is portrait-locked. Layout breakpoints in `index.html` target ~390/768/960 px with `env(safe-area-inset-bottom)` padding for the bottom nav. Any presentation work must hold up on a 390 px-wide portrait viewport; desktop-only designs are out of scope for this app.

The only service worker is [firebase-messaging-sw.js](firebase-messaging-sw.js), for push reminders (see [PUSH-SETUP.md](PUSH-SETUP.md)). It has no fetch handler and caches nothing, and it registers only after a Hunter enables reminders — the app is still online-only and will not load offline.
