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
- **The reconciliation system** (`index.html` ~5558–5960) and `RECONCILE_VERSIONS`
- **Auth flow and Firestore security rules**

Changing a rendering function is presentation. Changing a number that feeds a stored value is gameplay. When a task sits on the boundary, ask before proceeding.

### Why formula edits are especially dangerous here

`RECONCILE_VERSIONS` (`index.html:5602`) is a per-subsystem version map (`xp`, `dungeon`, `army`, `prs`, `milestones`, `date`). On startup, `startupIntegrityCheck()` compares each against `profile._reconcileVersions.{key}` and **replays every user's entire workout history** through the current formulas for any subsystem whose version increased.

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

## Architecture

### Zero-build static PWA

14 tracked files served verbatim. `index.html` is a **1.1 MB, ~18,500-line single file** holding all CSS, markup, and the main `<script type="module">` (starts line 3186). Firebase 10.12.2 is imported as ESM directly from `gstatic.com`, both statically at the top and via inline `await import(...)` at ~25 call sites throughout.

Any new runtime dependency must follow the same pattern — **CDN ESM URL or import map**, not npm. An import map must be declared *before* the module block at line 3186.

### Module split

Statically imported at `index.html:3188-3191`:

- [exercises.js](exercises.js) — `BASE_EXERCISES`; each entry carries `intent`, `statWeights` (XP distribution across the 6 stats), `muscles` (0–1 emphasis), `equipment`, optional `skillTier`. Merged with per-user custom exercises by `rebuildExercisesAll()`.
- [progression-chains.js](progression-chains.js), [archetype-chains.js](archetype-chains.js), [auto-achievements.js](auto-achievements.js)

[physique.js](physique.js) draws the Hunter's own muscle map to their body: muscles grow with
12 weeks of training plus PR tiers, and the build comes from check-in tape measurements, else
`profile.heightCm` (set in Settings) and the latest weigh-in. `bodySvg()` applies it; pure, so
`node test/physique.test.mjs` tests it. Presentation only.

Lazy-loaded: [classes.js](classes.js) via `await import('./classes.js')` at line 10375 (6 root archetypes, 63 paths, 250+ class names) — kept out of the initial load deliberately.

[countries_embedded.js](countries_embedded.js) (1.4 MB `COUNTRIES_GEO`) is imported **only** by [shadow-world.html](shadow-world.html), never by `index.html`.

### Rendering model

Hand-rolled, no framework. `switchView(name)` (`index.html:4295`) toggles `.active` on `section.view#view-<name>` and syncs `.bottom-nav`. Screens are ~30 `renderX()` functions that build HTML strings and assign `innerHTML`, re-rendering wholesale rather than diffing.

`#view-world` is the exception: fixed-position fullscreen, and it hosts [shadow-world.html](shadow-world.html) in an `<iframe>` (line 16804). Shadow World is an independent 851-line page drawing the country map to a **2D canvas** with CSS-transform pan/zoom.

Global mutable state: `currentUser`, `profile`, `myProgram`, `authMode` — module-scoped `let` bindings read directly by render functions.

### Art stack (`art/`)

A procedural, toon-shaded three.js art pack ported from Grimoire: zero image assets, everything is code.
`art/kit.js` (toon materials, ink outlines, cached geometry), `art/theme.js` (palette mirrored from the
CSS tokens), `art/registry.js` (asset factories with triangle budgets, footprints and checks; pure, so
`node test/art-registry.test.mjs` tests it), `art/packs/*.js` (the assets). Review assets in
`/art/catalogue.html` under the local server. Authored `.glb` models (`art/models.js`, `art/look.js`,
registered in `art/models/index.js`; see [art/MODELS.md](art/MODELS.md)) replace a code-drawn asset by
id through `take()`/`resolve()`. The reward reveal (`buildRewardScene`) and the raid boss
(`buildSystemCoreScene`) use the pack lazily and fall back to the old primitives if it fails to load;
wire further screens the same way, through the existing AuraGL runtime. Presentation only.

The character card shows the player's own 3D body (`art/hunter.js` loads `art/models/hunter-<bodyType>.glb`;
`art/hunter-view.js` draws it in its own small canvas and holds the look creator). Its shape is
`hunterMorphs()` in physique.js, from the same training, height, weight and check-in data as the 2D
map. It is drawn in the app's manhwa style (one small camera-lit shader plus ink outlines in hunter.js,
no scene lights) and wears a street outfit, swapped for training kit in the Muscles view. The look
(skin, hair, eyes, heritage, face, boy or girl face on either body) is kept in localStorage (`auramaxx.hunterLook.v1:<uid>`),
not Firestore: a profile field for it needs the owner's OK. Any failure falls back to the 2D map.

### Firestore collections

Eight in use: `users/{uid}`, `workouts/{autoId}`, `programs/{uid}`, `customExercises/{autoId}`, `bodyweight/{autoId}`, `prs/{...}`, `apEvents/{...}`, `checkins/{...}`.

⚠️ [SETUP.md](SETUP.md) is **stale** — it documents only five collections and omits `prs`, `apEvents`, and `checkins`, and its security-rules block covers only the five it knows about. Trust the code over SETUP.md; treat SETUP.md as first-time setup instructions, not a current data-model reference.

### State reconciliation — the central invariant

Documented in a header comment at `index.html:5558`. Read it before touching anything that writes progression state.

- **Authoritative, never rewritten:** the `workouts` collection (exercises, sets, reps, weight, RIR/RPE, dates)
- **Derived, repaired when stale:** `hunterXP`, `hunterLevel`, `statTrainingXP`, level-derived AP, `prs`, `activeDungeon.hp`, `shadowArmy.pool`, `milestonesAchieved`, `lastWorkoutDate`
- **Not reconstructable — never overwrite:** manually granted `auraPoints`, stat ranks and `statTimeAtRank` (time-gated), `inventory.earnedAt`, duel state, `shadowArmy.countries`, `streakFreeze`

Each `reconcileX()` function takes a `dryRun` flag; `reconcileState(scope, dryRun, versionForce)` (`index.html:5871`) orchestrates. Prefer `dryRun = true` when investigating.

## Conventions

- **Six stats**, spelled `defence` (British) throughout: `strength`, `endurance`, `agility`, `focus`, `flexibility`, `defence`
- **Ranks** E → D → C → B → A → S
- **21 muscle regions**, matching the named shapes traced in `anatomy.svg` / `anatomy-female.svg`. Custom exercises must target these exact names or the heatmap silently misses them.
- Theming runs on CSS custom properties (`--brass`, `--violet`, `--rank-s`, `--growing`, …). Prefer editing tokens over hardcoding colors; note that several render functions define local `STAT_COLORS`/`STAT_ICONS` maps inline and duplicate each other — they are not a single source of truth.
- Source files are UTF-8 with box-drawing comment banners (`── SECTION ──`) and emoji. Preserve the encoding when editing.

## Mobile constraints

`manifest.json` declares `display: standalone` and **`orientation: portrait`** — the installed PWA is portrait-locked. Layout breakpoints in `index.html` target ~390/768/960 px with `env(safe-area-inset-bottom)` padding for the bottom nav. Any presentation work must hold up on a 390 px-wide portrait viewport; desktop-only designs are out of scope for this app.

There is no service worker despite the PWA manifest — the app is online-only and will not load offline.
