# Auramaxxing Cloud Functions

One function: **`resolveGateDuel`** — trusted settlement for Gate Duels.

> **Status: hardened and tested, NOT DEPLOYED.** Until it is deployed, only the
> admin can settle duels (the app falls back to the old client path for the
> admin only; other players see "will settle next time you open the app").
> Deploy steps are [below](#deploying) - run them in order.

---

## Why this exists

Duel settlement writes to **both** participants' `users/{uid}` documents: AP
transfer, win/loss, streak, XP boost, defeat debuff, trophy weapon, and
shadow-army territory.

That is a cross-user write. **No Firestore rule can authorise it** without
letting any signed-in Hunter write any other Hunter's document. So the
client-side `resolveGateDuel()` in `index.html` only ever worked for the
hardcoded admin uid — for everyone else, duels never settled.

This runs with Admin privileges, so `duels` and `users` stay locked down and
settlement still completes.

## What it improves over the client version

| | client | function |
|---|---|---|
| **Atomicity** | several independent writes — a duel could half-settle | one transaction across the duel and both users |
| **Idempotency** | none — both clients call it after `endDate`, so AP could transfer **twice** | re-reads `status` inside the transaction and aborts unless still `active` |
| **Determinism** | scored using whoever happened to trigger it | scored from stored workouts only |

## Formulas are unchanged

Winner selection, AP wager, streak tier, trophy tier and territory maths are
copied from `index.html`. Verified by differential test against the live client
code:

- **4,000 randomised fixtures** across all 9 metrics, both RIR and RPE schemas,
  every RIR gate, `minSessions` and `minWeightPct` value, mixed
  resistance/timed/run exercises → **0 mismatches**
- **251 streak tiers**, **201 trophy tiers**, **5 trophy items** (every field
  incl. `dmgMult` and `statBonus`) → **identical**

### One deliberate behaviour change

The client called `latestBodyweightKg()`, which returns **the signed-in user's**
bodyweight, and applied it to **both** Hunters when enforcing
`spec.minWeightPct`. On a server there is no signed-in user — and replicating it
would make the outcome depend on *who opened the app first*, so the same duel
could resolve two different ways.

Each Hunter's own bodyweight is used instead. This only affects duels with
`minWeightPct > 0`; at the default of `0` the gate is inert and behaviour is
byte-identical.

## ⚠ Mirrored code — keep in sync

`lib/scoring.js` and `lib/rewards.js` are hand-mirrors of `index.html`. If these
drift, **a duel resolves differently from the score the Hunters watched all
week.**

If you change any of these in `index.html`, mirror it here:

| index.html | mirror |
|---|---|
| `getDuelScore` | `lib/scoring.js` |
| `getSetIntensity`, `e1rm` | `lib/scoring.js` |
| `DUEL_STREAK_REWARDS`, `DUEL_TROPHY_TIERS` | `lib/rewards.js` |
| `ITEM_DEFINITIONS.duel_trophy_*` | `lib/rewards.js` |
| `exercises.js` (any `timed`/`timedUnit`/`intent`) | run `npm run gen` |

`lib/exercise-scale.js` is generated — never edit it by hand:

```bash
cd functions && npm run gen     # regenerates from ../exercises.js
```

---

## Audit (what the function does and where it can be abused)

**How a duel starts (client, Firestore `duels/{id}`):** the challenger
`addDoc`s `{challengerId, defenderId, status:'pending', challengerStreak,
defenderStreak, spec:null}` and sets `users/{me}.duels.activeDuelId`. The
defender designs the fight (`spec`, `startDate=today`, `endDate=today+3|7d`,
`status:'active'`) and sets their own `activeDuelId`. Scores are never
submitted: both are derived from each hunter's logged `workouts` in the window.

**How it settled before:** `resolveGateDuel()` in `index.html` ran on either
player's next app open once `endDate < today`, writing the duel doc and both
`users` docs. Rules only let a user write their own doc, so for everyone but
the admin uid it failed (swallowed with `console.warn`) and the duel stayed
`active` forever.

**What `resolveGateDuel` writes (one transaction):**
- `duels/{id}`: status `complete`, winnerId/loserId, both scores, apWager,
  apLost, winnerStreak, winnerTotalWins, territoryResult, resolvedAt,
  resolvedBy, resolvedByUid
- winner `users/{uid}`: `auraPoints` +wager, `duels.wins`+1, `duels.streak`,
  `activeDuelId:null`, trophyTier, duelTitle, xpBoostMult/Until (7d), trophy
  weapon at 5/15/30/60/100 wins
- loser `users/{uid}`: `auraPoints` -wager (floored at 0), `duels.losses`+1,
  streak 0, activeDuelId null, lastLossDate, defeatedBy/Name/Domain/Until,
  debuffPct, trophyTier 0, duel-trophy weapon removed
- if fought over a country: both `shadowArmy.countries.{id}` soldiers (+ owner
  on a challenger win)
- two `apEvents` ledger rows (winner gain, loser loss)
No XP is awarded; `xpBoost*` only sets a multiplier read elsewhere.

**Defects found in the previous function, now fixed** (`lib/settle-duel.js`):

| Finding | Fix |
|---|---|
| Streak (and so the AP wager, 10 to 500) was read from `challengerStreak`/`defenderStreak` on the duel doc, which a participant can edit under the documented rules | streak read from the winner's own `users` doc inside the transaction |
| "Ended" check used the server's UTC date, so duels could settle hours before the window closed in the Americas | requires UTC-12 end of `endDate`; early call gets `failed-precondition` |
| Participant-editable `endDate`/`startDate`/`spec`/target fields trusted blindly | terms validated: distinct ids, ISO dates, window 1-30 days, known metric, numeric limits, country id charset (it becomes a Firestore field path) |
| Loser AP could go negative (`increment(-wager)`) | floored at 0 (`apLost` recorded); winner still gains the wager |
| Back-dated sessions: backfill allows 30 days, so a session could be added to a finished window before anyone settled; sessions could also be pre-logged | only workouts whose server `createdAt` is inside the window count (docs without `createdAt` still count) |
| Users/streaks/soldiers read outside the transaction, then written | duel + both users read inside the transaction; terms re-compared; status re-checked |
| A second caller got an error if the duel was already settled | returns the stored result |
| Loser's `inventory.weapon` was nulled and the winner's overwritten whatever it was | only duel trophies are removed/replaced; other weapons are untouched |
| No AP ledger rows | `apEvents` rows written |
| Any error became an opaque failure | `DuelError` to precise `HttpsError` codes; unexpected errors are logged and returned as `internal` |

**Abuse paths, answered:** forge a result - no, nothing numeric comes from
the request. Double-settle - no (status re-check in the transaction; tested
with concurrent calls). Settle a duel you are not in - `permission-denied`
(admin uid excepted). Make AP negative - no. Settle early - no.

**Residual risks (not fixable in the function):**
1. Workouts are client-written: a hunter can log fake sets. That is the game's
   existing trust model ("training is the entry"), unchanged.
2. Without rules hardening a participant can still edit `startDate`, `endDate`,
   `spec` and `target*` on an active duel (it is how terms are set). The
   function validates and bounds them but cannot know the original. Optional
   fix: the stricter rules in [step 2](#2-firestore-rules-optional-hardening).
3. Both hunters failing the terms: both score 0 or both forfeit, and the
   **challenger wins** (`>=` tie-break, inherited from the client). Left alone
   because it is a gameplay rule; flagged for a decision.
4. `targetCountryId` is not checked against who actually owns the country.
5. Deliberate change kept from before: each hunter's own bodyweight is used for
   `minWeightPct`.

## Deploying

Run these **in order, as separate steps**. Nothing here has been run.

### 1. Deploy the function (required)

```bash
cd functions && npm install && npm run lint && cd ..
node test/resolve-gate-duel.test.mjs     # optional sanity check
firebase deploy --only functions:resolveGateDuel --project auramaxxing-3d4bb
```

`firebase.json` and `engines.node` are now Node 22 (Node 20 is retired
2026-10-30). `firebase-functions` stays at ^4.9: the only other function
(`sendReminders`) is not on this branch, so an upgrade could not be tested
against it. The first deploy asks to enable the Cloud Build / Artifact Registry
APIs if they are off. The app needs no change at deploy time.

### 2. Firestore rules (not needed for settlement; optional hardening)

Settlement uses the Admin SDK and needs **no rules change**. The repo has no
`firestore.rules` (and `firebase.json` has no `firestore` entry), so
`--only firestore:rules` cannot deploy anything from here. If you want the
hardening, paste this into the console rules (or add a `firestore.rules`
file containing your **full** live rules plus this block, then run
`firebase deploy --only firestore:rules --project auramaxxing-3d4bb`). **Merge
into the existing rules; replacing the file drops `prs`, `apEvents`,
`checkins`, `config`.**

```
match /duels/{duelId} {
  allow read: if request.auth != null
    && (resource.data.challengerId == request.auth.uid
     || resource.data.defenderId  == request.auth.uid);
  allow create: if request.auth != null
    && request.resource.data.challengerId == request.auth.uid
    && request.resource.data.status == 'pending';
  // defender sets terms once (pending -> active); challenger may withdraw;
  // 'complete' and any later edit of an active duel are server-only
  allow update: if request.auth != null
    && resource.data.status == 'pending'
    && ((resource.data.defenderId == request.auth.uid
         && request.resource.data.status == 'active'
         && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['status','startDate','endDate','spec']))
     || (resource.data.challengerId == request.auth.uid
         && request.resource.data.status == 'forfeited'));
  allow delete: if false;
}
```

### 3. Verify

1. Two non-admin accounts; one challenges, the other sets terms
2. Both log qualifying sets
3. After the window closes everywhere (about noon UTC the day after `endDate`),
   either opens the app and sees the result modal
4. AP moved once, `activeDuelId` cleared on both, wins/losses once
5. The other account opens the app and gets the stored result, no second transfer

## designPlan — the AI coach

Calls Claude (`claude-opus-5-5`, Anthropic SDK, structured output) to design a look and plan, or review how a Hunter is doing. See `lib/design-plan.js`.

```
firebase functions:secrets:set ANTHROPIC_API_KEY     # once, paste the key
npm run deploy:coach                                 # firebase deploy --only functions:designPlan
```

Needs the Blaze plan (secrets and outbound calls). Callers must be signed in; 10 calls a Hunter a day, counted in `users/{uid}.aiCoach` by the Admin SDK. Nothing it returns is applied by the function.
