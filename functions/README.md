# Auramaxxing trusted backend — Phase 1 (AP ledger shadow mode)

**Status: observational only. Not deployed.** The client remains fully
authoritative for AP. Nothing in this directory changes what a user sees.

This is step 1 of the trusted-write-authority migration. It exists to answer one
question before any authority moves: *does a server, recomputing from the raw
history, arrive at the same AP the client awarded?*

---

## What it does

For four AP-producing events it computes what it **would** have awarded, compares
that against what the client actually recorded, and writes the result to a
separate `apShadow` collection.

| Event | Trigger | Source of truth |
|---|---|---|
| A1 level-up AP | Firestore trigger on `workouts` create | full workout history replay |
| A2 PR award | callable `shadowPrAward` | stored sets, e1RM recomputed |
| A3 class trial | callable `shadowTrialAward` | sessions inside the trial window |
| A4 raid reward | callable `shadowRaidClaim` | server week key + damage shares |

It never reads a client-supplied amount, level, balance or eligibility flag.
`shadowLevelUp` takes `workouts`, not `profile.hunterXP`, precisely so a forged
profile cannot influence the shadow result.

## What it must never do

The only writer is `writeShadow()` and it is hard-wired to the `apShadow`
collection. There is no code path here that writes `auraPoints`, `hunterXP`,
`hunterLevel`, `stats`, `inventory` or `duels`. A test asserts that a shadow
record contains none of those keys.

Shadow records deliberately do **not** go into `apEvents` — that would put
non-authoritative rows into the collection the admin AP Ledger reads.

## The formulas are generated, not rewritten

`src/formulas.generated.js` and `src/base-exercises.js` are produced from
`index.html` and `exercises.js` by `tools/extract-formulas.mjs`, byte for byte.
The server runs the client's own code.

This matters: if the formulas were hand-copied, the first edit to either side
would silently make shadow agreement meaningless. Instead:

```bash
npm run generate      # regenerate the mirrors after a client formula change
npm run check:drift   # fails if the mirrors are stale
npm run verify        # drift check + tests
```

The drift check is verified to actually fail — changing `apForLevel` in
`index.html` without regenerating makes `check:drift` exit 1.

## Known limitation — recorded, not hidden

`replayTotalXP` reports the **unmultiplied** XP baseline. The client applies two
multipliers at award time that are not recoverable from stored data:

* a duel XP boost / defeat debuff, depending on where the duel windows sat on the
  day of the session, and
* a streak-rank multiplier, depending on the streak as it stood then.

Neither is persisted per workout, so a faithful replay is impossible today. The
shadow result flags `multipliersUnavailable: true` rather than guessing and
manufacturing agreement. **For users with an active duel boost/debuff or a streak
above rank E, expect amount mismatches** — those are a real finding about the
schema, not a bug in the comparison.

Closing it needs one additive field: persist the applied multiplier on the
workout document at save time. That is a Phase 2 change and is deliberately not
made here.

## Idempotency

The shadow document ID *is* the idempotency key, so a retry collides on
`create()` and is recorded as a duplicate (incrementing `retryCount`) instead of
inserting a second row. Keys derive only from stable identity — never from a
timestamp or a computed amount:

```
lvl:{uid}:{workoutId}
pr:{uid}:{workoutId}:{exercise}
trial:{uid}:{classKey}:{tierIndex}
raid:{uid}:{weekKey}          ← server week key, never the client's
```

## Required indexes

`firestore.indexes.json` at the repo root declares both. The first is **already
needed today** — the admin AP Ledger currently fails with `failed-precondition`
without it.

```
apEvents:  uid ASC, timestamp DESC, __name__ DESC
apShadow:  uid ASC, timestamp DESC, __name__ DESC
```

Deploy indexes only:

```bash
firebase deploy --only firestore:indexes
```

## Deploying (when you choose to)

Not deployed by this phase. When you are ready:

```bash
cd functions && npm install
npm run verify                          # drift + tests must pass first
firebase use <your-project-id>          # .firebaserc is intentionally not committed
firebase deploy --only functions
```

Suggested rollout: deploy the trigger first, leave it for a full week of real
training, then read the agreement summary via the `shadowReport` callable.

**No Firestore rule change is required for Phase 1**, and none should be made.
The server writes with admin credentials, which bypass rules; the client is
untouched. Rules tighten in Phase 2, only after agreement is proven.

## Local verification

```bash
npm run verify
```

31 tests, no network, no emulator, no Firebase credentials. The client/server
parity harness lives in the QA scratchpad and drives the real `index.html` in a
browser against this module.
