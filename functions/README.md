# Auramaxxing Cloud Functions

One function: **`resolveGateDuel`** — trusted settlement for Gate Duels.

> **Status: written and formula-verified, NOT DEPLOYED.**
> Deployment needs Firebase console/CLI access. Nothing in the app calls this
> yet — see [Step 4](#4-switch-the-client-over) for the client change, which
> must happen **after** deployment.

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

## Deploying

### 1. Install

```bash
cd functions
npm install
npm run lint          # syntax-checks every file
```

### 2. Add the Firestore rules for `duels`

**ADD this block to the existing rules — do not replace the file.** The live
ruleset contains collections not documented here (`prs`, `apEvents`,
`checkins`, `config`, the admin catch-all); replacing it wholesale would drop
them.

```
match /duels/{duelId} {
  allow read: if request.auth != null
    && (resource.data.challengerId == request.auth.uid
     || resource.data.defenderId  == request.auth.uid);
  allow create: if request.auth != null
    && request.resource.data.challengerId == request.auth.uid
    && request.resource.data.status == 'pending';
  // participants may set terms and withdraw, but NEVER settle:
  // 'complete' is written only by the Cloud Function, which bypasses rules.
  allow update: if request.auth != null
    && (resource.data.challengerId == request.auth.uid
     || resource.data.defenderId  == request.auth.uid)
    && request.resource.data.status != 'complete';
  allow delete: if false;
}
```

### 3. Deploy

```bash
firebase deploy --only functions:resolveGateDuel
```

Test against the emulator first if you prefer: `npm run serve`.

### 4. Switch the client over — ALREADY DONE

`index.html` already routes settlement through `settleGateDuel()`, which calls
the function first and falls back to the client path if it is **unreachable**
(not deployed, offline, blocked). So the app behaves exactly as it does today
until you deploy, and switches over on its own the moment you do — no client
change is needed at deploy time.

The fallback is deliberately narrow: it fires only when the function could not
be REACHED. If the function ran and rejected — not a participant, already
settled, not ended yet — that is an authoritative answer, and re-running the
client path could pay AP twice. Those surface as errors instead.

The client-side `resolveGateDuel()` is kept in place as that fallback. Remove
it only once the function has settled real duels.

<details><summary>What the wiring looks like</summary>

Previously `checkPendingDuels()` called the client settlement directly:

```js
if (d.status === 'active' && d.endDate < todayStr()) {
  await resolveGateDuel(activeDuelId, d);
}
```

Replace that call with the callable, keeping the old path as a fallback so
nothing regresses if the function is unreachable:

```js
if (d.status === 'active' && d.endDate < todayStr()) {
  try {
    const { getFunctions, httpsCallable } =
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
    await httpsCallable(getFunctions(), 'resolveGateDuel')({ duelId: activeDuelId });
    await loadAllData();
  } catch (err) {
    console.error('Server settlement failed, falling back:', err);
    await resolveGateDuel(activeDuelId, d);   // admin-only, but better than nothing
  }
}
```

</details>

## Verifying after deploy

1. Two non-admin accounts, one challenges the other
2. Defender sets terms → both see the terms panel
3. Both log qualifying sets
4. After `endDate`, either opens the app → duel settles
5. Check: AP moved once (not twice), `activeDuelId` cleared on **both**,
   `duels.wins`/`losses` incremented once, winner's trophy granted at 5 wins
6. Re-open on the other account → returns `alreadyResolved`, no second transfer
