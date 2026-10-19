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

Lazy-loaded: [classes.js](classes.js) via `await import('./classes.js')` in the class system section (6 root archetypes, 63 paths, 250+ class names) — kept out of the initial load deliberately.

[countries_embedded.js](countries_embedded.js) (1.4 MB `COUNTRIES_GEO`) is imported **only** by [shadow-world.html](shadow-world.html), never by `index.html`.

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

Eight in use: `users/{uid}`, `workouts/{autoId}`, `programs/{uid}`, `customExercises/{autoId}`, `bodyweight/{autoId}`, `prs/{...}`, `apEvents/{...}`, `checkins/{...}`.

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

There is no service worker despite the PWA manifest — the app is online-only and will not load offline.
