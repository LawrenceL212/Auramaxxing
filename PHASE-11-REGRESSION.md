# Phase 11 — Full System Integrity / Regression

**Mandatory. Runs AFTER all cinematic phases (1–10) are complete and BEFORE any
production merge or push.**

The cinematic transformation is **not complete** until the whole application has
passed functional regression. This is a full system test, not visual QA.

**Core rule:** every mechanic that worked before the cinematic work must still
work after it. No silent failures, dead buttons, broken navigation, broken
persistence, stale UI, or presentation code mutating game state.

A feature that cannot be safely tested is marked **UNVERIFIED**, never **PASS**.

---

## Checklist — FINAL RESULTS

Run **2026-08-22** at `e405202`, authenticated against the real application with
the owner/QA account (`eUtGPw…`, L6, 1389.8 XP, 10 workouts). The account was
restored field-by-field to its exact pre-run state afterwards.

| # | Area | Status |
|---|---|---|
| 1 | Navigation — every tab and sub-view, incl. A→B→C→A lifecycle | **PASS** |
| 2 | Workout lifecycle — full path, RIR vs RPE separation, running | **PASS** |
| 3 | Progression — XP, level, AP, stats, PR, milestones, reconciliation | **PARTIAL** |
| 4 | Hunter/physique — male + female, 21 regions, aura, read-only proof | **PARTIAL** |
| 5 | System Moments — all five tiers, queue, skip, reduced motion | **PASS** |
| 6 | Modals/overlays — open/close/confirm/cancel, z-index, scroll lock | **PASS** |
| 7 | Mobile/responsive — 9 viewports incl. 375×667, 414×896, 430×932 | **PASS** |
| 8 | Persistence — write → reload → read round trips | **PASS** |
| 9 | Reconciliation — controlled mismatch → repair, subsystem versioning | **PARTIAL** |
| 10 | Dungeons / Raid / Shadow World | **PARTIAL** |
| 11 | Duels / Gates | **PARTIAL** |
| 12 | Inventory / equipment | **PARTIAL** |
| 13 | Error handling — missing data, denied reads, no WebGL, failed assets | **PARTIAL** |
| 14 | Performance regression vs pre-cinematic baseline | **PASS** |
| 15 | Gameplay-data immutability audit across all cinematic commits | **PASS** |
| 16 | Cross-system causality audit | **PARTIAL** |
| 17 | Full user journey — new user and returning user | **PARTIAL** |

**Classification: READY WITH WARNINGS** — held out of plain READY by the
Firestore read-scope finding in the security section below, which remains
exploitable.

### What each PARTIAL means

- **§3** XP, level, stat training XP and `lastWorkoutDate` verified from a real
  save. PR award, milestone unlock and level-up AP did not trigger on the test
  workout (values below existing bests), so those branches are unproven.
- **§4** Male anatomy verified: 22/22 canonical regions render on the board with
  377 coloured nodes, `anatomy.svg` is the only anatomy file fetched, and there
  are **zero** GLB/atlas network requests — the 3D Hunter removal is complete at
  runtime. No gender toggle is reachable from the board, so the female SVG was
  verified by file inspection only.
- **§9** `_reconcileVersions` is `{army,date,dungeon,milestones,prs,xp}` all at 1
  and unchanged across four reloads, so startup is idempotent. `reconcileState`
  is module-scoped and not callable from the console; deliberate-corruption
  repair was **not** run — it would require damaging live progression.
- **§10** Shadow World fully verified (below). Dungeon and raid entry points
  exist as globals, but no dungeon was active and starting one mutates
  progression, so those flows were not exercised.
- **§11** `duels` reads now succeed on every shape (0 documents). Designer and
  send entry points exist. End-to-end needs a second account and real duel data.
- **§12** Inventory renders with six loadout slots (all EMPTY) and the full
  rarity vocabulary (COMMON/RARE/EPIC/LEGENDARY). The account owns no items, so
  equip/unequip is **UNVERIFIED** — not manufactured as a pass.
- **§13** No-WebGL degradation verified clean (`start()` returns false, seen flag
  still set, no overlay left behind, app usable, 0 errors). Denied reads and
  failed-asset paths were not separately exercised.
- **§16** workout→XP, workout→stat XP, workout→`lastWorkoutDate`,
  workout→muscle status and rank/level→presentation all confirmed on a live
  save. workout→PR, progression→System Moment and reward→inventory did not fire
  on the test workout and remain unproven.
- **§17** The journey ran login→Hunt→workout→save→progression→Rank/anatomy→
  Codex→inventory→Shadow World→history→reload coherently. The **new-user**
  branch was not run — it needs a fresh account.

### Pre-cinematic performance baseline (for §14)

Measured at `b95924a`, 8 views × 6 viewports, authenticated:

```
fps 60.7–61.3 · 0 contrast failures · no horizontal overflow · 0 console errors
heap 12.1–24.8 MB · DOM 3902–6262
```

### §15 audit command

```
git diff 9bcec20..HEAD -- index.html shadow-world.html \
  | grep -E '^[+-]' | grep -vE '^[+-][+-]' \
  | grep -E 'computeWorkoutXP|xpForLevel|apForLevel|levelFromTotalXP|epley1RM|getStrengthTier|TIER_XP|STAT_RANK_AP_COST|RECONCILE_VERSIONS|statWeights|skillTier|minRIR|RIR_MULT|collection\(db|setDoc\(|updateDoc\(|addDoc\(|deleteDoc\(|auraPoints|hunterXP|shadowArmy'
```

---

## Known blockers and limitations — VERIFIED 2026-08-22

### Resolved since this document was written

| Was documented as | Actual status now |
|---|---|
| **`switchView` not on `window`** — Arsenal / Shadow Log / Gates throw `ReferenceError` | **FIXED.** `window.switchView` exists; all three navigate correctly. All 15 inline-handler callees resolve as globals — no dead controls anywhere. |
| **`duels` — no rules published, `permission-denied` on every shape** | **STALE ENTRY.** All three query shapes now succeed (0 documents). The read blocker is gone. |
| **`config/shadowWorld` — no rules, failure-fallback payload** | **STALE ENTRY.** The document reads fine: `resetAt, setBy, explorationUnlocksAt, setAt, resetBy`. |

### Still live

| Issue | Status |
|---|---|
| **`apEvents` composite index missing** | **CONFIRMED STILL MISSING.** `uid ==` + `orderBy timestamp desc` returns `failed-precondition`. The Admin AP Ledger remains broken. Index needed: `apEvents` · `uid` ASC · `timestamp` DESC · `__name__` DESC. |
| **Female `Lower Abs` empty SVG group** | **CONFIRMED.** `anatomy-female.svg` contains an empty `<g id="Lower Abs">`; `anatomy.svg` (male) has no empty groups. Both files carry 22/22 canonical region ids. |
| **Client-side duel resolution is not a trusted architecture** | **UNCHANGED.** Still needs a Cloud Function. See the security section. |
| **Shadow World frame rate** | **NEW.** The iframe renders a 2048×1024 (2.1 Mpx) canvas and runs at **32.9 fps internally**, holding the host page to ~40 fps while the World view is open. This is the iframe's own render loop, *not* AuraGL — the host recovers to 99 fps on leaving the view. Separate work from the cinematic layer. |
| **Startup announcement has no read-state** | **NEW.** The streak SYSTEM ANNOUNCEMENT re-shows on every load while `streakFreeze.active` is true. The update notice persists correctly via localStorage. Left unchanged — adding persistence would alter dismissal semantics. |
| **AuraGL ambient headroom** | **NEW, not a regression.** Even at its 30 fps cadence the ambient scene costs ~35 fps on the quest view (87.6 with, 122.8 without). Absolute figures are well above baseline. |

### Security — Firestore access model (established empirically, reads only)

The published rules are **not in this repository** (no `firestore.rules`, no
`firebase.json`, no `.firebaserc`) and could not be read directly. The model
below was established by read probes from an ordinary authenticated session.
**Cross-user writes were deliberately not tested** — doing so would modify
another user's data.

| Collection | Read scope observed as an authenticated user |
|---|---|
| `users` | **entire collection — 6 documents** |
| `workouts` | **entire collection — 40 documents** (own: 10) |
| `programs` | **entire collection — 4 documents** |
| `customExercises` | entire collection — 34 |
| `bodyweight` | **entire collection — 15** (own: 4) |
| `prs` | entire collection — 3 |
| `checkins` | entire collection — 0 |
| `apEvents` | **entire collection — 29** (own: 18) |
| `duels` | entire collection — 0 |
| `config/shadowWorld` | readable |

**Finding 1 — every collection is world-readable to any signed-in account.**
That exposes other users' full profiles, complete workout history, bodyweight
measurements and AP ledgers. This is why the project is not plain READY.

**Finding 2 — AP write authority.** `index.html` contains
`setDoc(doc(db,'users', uid), { auraPoints: increment(amount) }, {merge:true})`
against an **arbitrary uid** (`index.html:13724`), plus a raw-JSON
`setDoc(..., {merge:false})` full profile overwrite (`:13788`) and a
`lastWorkoutDate` write to arbitrary uids (`:13410`). Whether these succeed for
a non-owner depends entirely on the rules, which cannot be read from here.

**Finding 3 — the admin gate is client-side only.** Authorization is
`currentUser?.uid === 'eUtGPwQBcCSO0x3xS3ZGYFGXNIT2'` in JavaScript
(`index.html:4537`). It hides UI; it is not a security boundary. Combined with
Finding 2, if `users/*` is writable by any authenticated account then any user
can mint AP and overwrite other profiles. **This must be settled by reading the
published rules.**

### Expected UNVERIFIED

| Area | Why |
|---|---|
| **Admin panel actions** | The QA account *is* the hardcoded owner, so the panel is reachable — but every action writes another user's document, so none were exercised. |
| **Duel end-to-end** | Reads work; needs a second account and real duel data. |
| **Equip / unequip** | QA account owns no items. |
| **Reconciliation repair** | Requires deliberately corrupting live progression. |
| **New-user journey** | Requires a fresh account. |
| **Active dungeon / raid flow** | Starting one mutates progression state. |

---

## Measured results — 2026-08-22, `e405202`

### Performance (§14)

Measured on a **restored, visible, actively-rendering window**. A control page in
the same debugger-attached browser reaches **165.6 fps**, so CDP overhead is
ruled out. Earlier readings of 20–29 fps in this project's notes were taken
through a **minimized** window (a minimized window produces no frames at all) and
are invalid — they must not be compared against the baseline.

Baseline `b95924a`: fps 60.7–61.3 · heap 12.1–24.8 MB · DOM 3902–6262.

| View | fps | draws | tris | tex | geo | canvases | DOM | heap | overflow |
|---|---|---|---|---|---|---|---|---|---|
| quest | 99.5 | 1 | 0 | 0 | 16 | 3 | 6435 | 22 MB | none |
| board | 85.9 | 1 | 0 | 0 | 16 | 3 | 6438 | 22 MB | none |
| trends | 158.0 | 1 | 0 | 0 | 16 | 3 | 6438 | 22 MB | none |
| exercises | 160.4 | 1 | 0 | 0 | 16 | 3 | 6438 | 22 MB | none |
| history | 157.0 | 1 | 0 | 0 | 16 | 3 | 6438 | 22 MB | none |
| feats | 161.3 | 1 | 0 | 0 | 16 | 3 | 6438 | 22 MB | none |
| inventory | 159.7 | 1 | 0 | 0 | 16 | 3 | 6438 | 22 MB | none |
| world | 41.9 | 1 | 0 | 0 | 16 | 3 | 6438 | 22 MB | none |

Every view exceeds the pre-cinematic baseline. 0 console errors; no horizontal
overflow at 320, 360, 375, 390, 414, 430, 768, 960 or 1440 px.

**Renderer isolation** — the four renderers reported separately:

| Renderer | fps |
|---|---|
| quest, AuraGL ambient at its 30 fps cadence | 87.6 |
| quest, AuraGL stopped entirely | 122.8 (+35.2) |
| legendary System Moment on screen (cinematic) | 41.3 |
| **shadow-world iframe, measured inside the iframe** | **32.9** |
| host page while the World view is open | 39.9 |
| host page after leaving World (lifecycle resume) | 99.2 |

The Shadow World figure is the **iframe's own** loop and must not be attributed
to AuraGL.

**Startup notices (§6):**

| State | fullscreen blur layers | fps |
|---|---|---|
| both stacked (before the queue fix) | 2 | 23.0 |
| announcement only (queued) | 1 | 43.9 |
| update notice only | 1 | 44.3 |
| no notices | 0 | 99.5 |

### Opening (§7, §17)

Real authenticated first run:

```
   670ms  ◈ SIGNAL DETECTED
  3474ms  ◈ SYSTEM GEOMETRY RESOLVED
  4375ms  ◈ TELEMETRY LINKED
  5894ms  ◈ HUNTER IDENTIFIED  +  LAWRENCE AURA GOAT
  6807ms  RANK E · LEVEL 6  +  rank glyph E
          [5234ms appreciation window — nothing new arrives]
 12041ms  ◈ SYSTEM ONLINE   (907ms on screen)
 12948ms  hand-off; overlay torn down; app usable
```

- SKIP at 2500ms → whole sequence ends at 2546ms, clean teardown
- Returning user → 750ms, `SYSTEM · WELCOME BACK` + name
- Reduced motion → appreciation hold 3486ms, SYSTEM ONLINE 894ms
- Orientation change mid-sequence → 390×844 → 844×390, no clipping, no
  overflow, completes, tears down, app usable

### System Moments (§5)

All five tiers hold to spec at 390×844 and 1440×900; the veil is on for
`major`/`progression`/`legendary` and off for `micro`/`minor`, matching the
`TIERS` table. Five moments fired at once serialise (`pending=4, busy=true`);
`clear()` drops the queue, settles every promise, clears stage and veil;
duplicate `micro` coalesces (`pending=1`); under reduced motion every hold
survives at spec. 0 console errors.

### RIR / RPE (§2)

`usesRPE()` verified against every supported timed-unit case:

| Exercise | Case | Expected | Got |
|---|---|---|---|
| Bench Press | not timed | RIR | RIR |
| Dead Hang | timed, no unit | RPE | RPE |
| German Hang | timed, `secs` | RPE | RPE |
| **Hill Sprints** | **timed, `mins`, non-endurance** | **RIR** | **RIR** |
| Running | timed, `mins`, endurance | RPE | RPE |

A real workout logged after switching an existing row from resistance to timed
stored `Barbell Curl {rir:2, rpe:null}` and `Dead Hang {rir:null, rpe:8}`.

### Gameplay immutability (§15)

The audit command over `9bcec20..HEAD` (30 commits) returns 3 matches, all
reviewed: two whitespace re-indents of an existing `setDoc`, and one genuinely
new write at `index.html:4819` (`69e9593`, signup self-heal) that fires only when
the profile document is absent and cannot touch existing progression. No
formula, constant table or `RECONCILE_VERSIONS` entry changed.

### QA account restoration

Restored field-by-field and verified against the session-start snapshot:
`hunterXP`, `hunterLevel`, `auraPoints`, `lastWorkoutDate`, `weeklyGoal`,
`bodyType`, `bodyweightKg`, `stats`, `statTrainingXP`, `statAP`,
`statTimeAtRank`, `statBaselines`, `milestonesAchieved`, `unlockedAchievements`,
`inventory`, `slayerTitles`, `streakFreeze`, `shadowArmy`, `activeDungeon`,
`_reconcileVersions` — all match. Collections: workouts 10, apEvents 18, prs 0.

Two restoration defects were found and corrected during the run, and are worth
remembering for any future QA on live data:

1. A `merge: true` restore wrote `milestonesAchieved: null` — the field is a map,
   and the captured value had round-tripped to `null` through the driver.
2. `merge` cannot remove keys the tests *added*. `statBaselines.strengthLifts`,
   `unlockedAchievements.pr_novice` and two `PR XP` `apEvents` rows survived the
   first restore and had to be removed explicitly with `deleteField()` and
   document deletes.

---

## Gate Duels — blocked on a Firestore rule (2026-08-25)

**Client-side deadlock: FIXED** (see `fix/gate-duels`). **Server-side access:
BLOCKED — needs deployment, not deployed.**

`duels` has no `match` block in the published rules, and SETUP.md's rules
listing covers only `users`, `workouts`, `programs`, `customExercises` and
`bodyweight`. A collection with no rule is denied to everyone the admin
catch-all does not cover, so for every non-admin Hunter:

- `checkPendingDuels()` cannot read the collection, so a defender is never
  shown an incoming challenge
- the confirm handler in `sendGateDuel()` cannot `addDoc`
- `resolveGateDuel()` writes to BOTH participants' user documents, which is a
  cross-user write and is denied regardless

Note the admin uid (`index.html:4543`) passes the catch-all, so testing while
signed in as admin makes duels look functional. Any duel verification must be
read as admin-only unless run from a normal account.

Proposed rule — **merge into the existing rules, do not replace them**:

```
match /duels/{duelId} {
  // both participants can read their own duel
  allow read: if request.auth != null
              && (resource.data.challengerId == request.auth.uid
               || resource.data.defenderId  == request.auth.uid);

  // a challenger may only create a duel in their own name, as pending
  allow create: if request.auth != null
                && request.resource.data.challengerId == request.auth.uid
                && request.resource.data.status == 'pending';

  // either participant may advance their own duel
  allow update: if request.auth != null
                && (resource.data.challengerId == request.auth.uid
                 || resource.data.defenderId  == request.auth.uid);

  allow delete: if false;
}
```

`resolveGateDuel()` writing to the opponent's `users/{uid}` document is NOT
solved by the above and should not be solved by loosening `users` — settlement
belongs in a trusted backend (see the backend phase). Until then duel
resolution stays admin-only.

**Status: prepared, NOT deployed. Requires Firebase console access.**

---

## Reporting

Final report must contain: PASS · FAIL · WARNINGS · KNOWN LIMITATIONS ·
BROKEN CONNECTIONS FOUND · FIXES APPLIED · TESTS PERFORMED · VIEWPORT RESULTS ·
PERFORMANCE RESULTS · FIRESTORE RESULTS · GAMEPLAY INTEGRITY RESULTS ·
REMAINING TECHNICAL DEBT.

Do not hide failures.
