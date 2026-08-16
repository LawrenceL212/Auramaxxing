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

## Checklist

| # | Area | Status |
|---|---|---|
| 1 | Navigation — every tab and sub-view, incl. A→B→C→A lifecycle | ☐ |
| 2 | Workout lifecycle — full path, RIR vs RPE separation, running | ☐ |
| 3 | Progression — XP, level, AP, stats, PR, milestones, reconciliation | ☐ |
| 4 | Hunter/physique — male + female, 21 regions, aura, read-only proof | ☐ |
| 5 | System Moments — all five tiers, queue, skip, reduced motion | ☐ |
| 6 | Modals/overlays — open/close/confirm/cancel, z-index, scroll lock | ☐ |
| 7 | Mobile/responsive — 9 viewports incl. 375×667, 414×896, 430×932 | ☐ |
| 8 | Persistence — write → reload → read round trips | ☐ |
| 9 | Reconciliation — controlled mismatch → repair, subsystem versioning | ☐ |
| 10 | Dungeons / Raid / Shadow World | ☐ |
| 11 | Duels / Gates | ☐ |
| 12 | Inventory / equipment | ☐ |
| 13 | Error handling — missing data, denied reads, no WebGL, failed assets | ☐ |
| 14 | Performance regression vs pre-cinematic baseline | ☐ |
| 15 | Gameplay-data immutability audit across all cinematic commits | ☐ |
| 16 | Cross-system causality audit | ☐ |
| 17 | Full user journey — new user and returning user | ☐ |

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

## Known blockers and limitations — carried in, not discovered by Phase 11

These are already identified. Phase 11 must confirm them, not rediscover them.

### Defects to fix

| Issue | Detail |
|---|---|
| **`switchView` not on `window`** | Three secondary-nav buttons ([index.html:3339-3341](index.html#L3339)) use inline `onclick="switchView(...)"`, but the module is `type="module"` so the function is not global. **Arsenal / Shadow Log / Gates buttons throw `ReferenceError` and do nothing.** Pre-existing, confirmed still present. One-line fix matching the file's own `window.x = x` convention (~30 existing examples). |

### Blocked on Firestore configuration (not code)

| Issue | Effect |
|---|---|
| **`duels` — no rules published** | Gate Duel entirely non-functional; incoming challenges never detected. Verified `permission-denied` on every shape. Rules were drafted and reviewed but never took effect. |
| **`config/shadowWorld` — no rules** | Shadow World receives the *failure-fallback* payload: map draws, but territory ownership and exploration lock never load. |
| **`apEvents` composite index missing** | Admin AP Ledger fails with `failed-precondition`. Index: `apEvents` · `uid` ASC · `timestamp` DESC · `__name__` DESC. |

### Architectural limitation — do not "fix" by weakening rules

**Client-side duel resolution is not a trusted security architecture.**
`resolveGateDuel` writes to *both* participants' `users` documents ([index.html:19989](index.html#L19989), [20001](index.html#L20001)). Permitting that would let any account mint AP and drain others. Correct fix is a Cloud Function; interim is that settlement fails silently inside its existing `try/catch`.

### Content gaps

- **Female `Lower Abs`** — source SVG group is empty (`<g id="Lower Abs"> </g>`). The 2D muscle map cannot highlight it. The 3D region exists, body-derived from female landmarks, never copied from male.
- **Anterior shin unassigned** — deliberate; the canonical 21-region taxonomy has no tibialis.
- **Lateral thigh band** — small unassigned area between quads and hamstrings; anatomically neither.

### Expected UNVERIFIED

| Area | Why |
|---|---|
| **Admin panel** | Gated on a hardcoded uid (owner's personal account) at [index.html:3990](index.html#L3990). Cannot be exercised from the QA account. |
| **Duel end-to-end** | Blocked by rules above; also needs a second account. |
| **Progression from real workouts** | QA account has no workout history. Either seed it (explicit authorisation required) or accept fixture-driven coverage only. |
| **Reconciliation repair** | Requires deliberately corrupting QA state — a Firestore write. Needs explicit authorisation. |

---

## Reporting

Final report must contain: PASS · FAIL · WARNINGS · KNOWN LIMITATIONS ·
BROKEN CONNECTIONS FOUND · FIXES APPLIED · TESTS PERFORMED · VIEWPORT RESULTS ·
PERFORMANCE RESULTS · FIRESTORE RESULTS · GAMEPLAY INTEGRITY RESULTS ·
REMAINING TECHNICAL DEBT.

Do not hide failures.
