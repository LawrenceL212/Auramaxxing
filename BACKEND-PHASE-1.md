# Trusted Backend — Phase 1 milestone (AP ledger shadow mode)

**Status: complete, approved, and deliberately NOT part of the cinematic
release.** Held on `feat/trusted-backend-phase1`. Not deployed. Not merged.

## Why this is a separate branch

The cinematic transformation and the trusted-backend migration are independent
pieces of work with different risk profiles and different release gates:

* the cinematic work is presentation-only, fully regression-tested, and ready to
  merge to `main`;
* the backend work adds a deploy target and changes nothing a user can see until
  it is deployed and Phase 2 moves authority.

Shipping them together would put an undeployed server-side milestone into a
release whose whole claim is that it changed no behaviour. So they are split.

## What this milestone contains

| Commit | Contents |
|---|---|
| `deff9f4` | AP ledger shadow mode — functions, formula extractor, tests, indexes |
| `75ae96b` | Drift guard hardened against CRLF checkouts |

Files, all additive:

```
firebase.json                          deploy config (functions + indexes)
firestore.indexes.json                 apEvents + apShadow composite indexes
.gitattributes                         pins functions/** to LF
functions/index.js                     Cloud Functions — shadow only
functions/src/shadow.js                pure shadow computation, no Firebase
functions/src/formulas.generated.js    GENERATED from index.html
functions/src/base-exercises.js        GENERATED from exercises.js
functions/tools/extract-formulas.mjs   extractor + drift detector
functions/test/shadow.test.mjs         31 tests
functions/README.md                    design, limitations, deploy steps
functions/package.json                 separate deploy target
```

**No client file is touched by either commit.** `index.html`, `exercises.js` and
`shadow-world.html` are byte-identical to `991c825`.

## Verified state at this milestone

```
unit tests                31 / 31 pass       (no network, no emulator)
client/server parity      46 / 46 = 100.00%  (real index.html vs this module)
drift guard               fires on real change; tolerates CRLF checkout
production shadow events  0                  (not deployed)
```

## Known limitation carried forward

`replayTotalXP` reports the unmultiplied XP baseline. The duel XP boost/debuff
and the streak-rank multiplier are applied by the client at award time and are
not persisted per workout, so they cannot be replayed. Shadow results flag
`multipliersUnavailable: true` rather than guessing. Users with an active duel
window or a streak above rank E will produce genuine amount mismatches.

Closing it requires one additive field written at workout-save time. That is a
Phase 2 change and is deliberately not made here.

## Resuming (Phase 2 — not started)

Do not start Phase 2 until this has been deployed and has produced real
agreement data. The gate is in the architecture design: server shadow
calculation proven, idempotency proven, and client/server agreement observed
over a full week of real training — including a level-up, a PR, a trial and a
raid week.

To deploy this milestone independently of the cinematic release:

```bash
git checkout feat/trusted-backend-phase1
cd functions && npm install && npm run verify
firebase use <project-id>            # .firebaserc intentionally not committed
firebase deploy --only firestore:indexes
firebase deploy --only functions
```

The `apEvents` index is worth deploying on its own regardless — the admin AP
Ledger currently fails with `failed-precondition` without it.

## Rebasing onto the cinematic release

After the cinematic work lands on `main`, this branch rebases cleanly, because
the two sets of commits share no files:

```bash
git checkout feat/trusted-backend-phase1
git rebase main
cd functions && npm run check:drift   # confirms the mirrors still match main's client
```

The drift check is the important step: if `main` ever changes a progression
formula, the generated mirrors must be regenerated or the shadow comparison
becomes meaningless.
