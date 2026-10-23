# Push reminders: setup for enzo

Code is merged-ready but **nothing works until you do steps 1-5**. Until the VAPID key is pasted, the Enable button in Settings > Reminders just says "Reminders are not switched on for this app yet", and the rest of the app is unaffected.

## What was added

| Piece | File |
|---|---|
| Service worker (push only, no caching) | `firebase-messaging-sw.js` |
| Browser side: permission, token, test | `push-client.js` (VAPID constant lives here) |
| Settings > Reminders, Tab dots switch | `index.html` |
| Which reminder to send, rules, copy (pure, tested) | `reminders.js`, `test/reminders.test.mjs` |
| Notification look and tap targets (pure, tested): icon, badge, same-day tag, Begin Hunt / Quick 15 buttons | `notification-options.js`, `icons/notify-192.png`, `icons/notify-badge-96.png` (made by `icons/make-notify-icons.mjs`) |
| Hourly sender (Cloud Function) | `functions/send-reminders.js`, `functions/index.js` (`sendReminders`) |
| Copies of pure modules for the function | `functions/lib/reminders.mjs`, `functions/lib/streak.mjs` |

Data: **one optional field pair on the signed-in user's own `users/{uid}` document**, written through `writeUserFields`:

- `pushDevices.<deviceId>` = `{ token, platform, createdAt }`
- `pushPrefs` = `{ enabled, planned, evening, usualTime, tz }`

No rules change is needed: the existing `users/{userId}` rule already lets a user write their own document. The function uses the Admin SDK and is read-only apart from deleting dead tokens.

## Steps

1. **Switch the Firebase project to Blaze** (pay as you go). Console > Usage and billing > Modify plan. Scheduled functions need it. One hourly run is far inside the free quotas, so expect roughly zero cost; set a budget alert anyway.
2. **Generate the Web Push certificate.** Console > Project settings > Cloud Messaging > Web configuration > Web Push certificates > Generate key pair. Copy the **Key pair** (a long string starting with `B`).
3. **Paste it** into `push-client.js`, replacing `PASTE_YOUR_WEB_PUSH_VAPID_KEY_HERE` in `FCM_VAPID_KEY`. It is a public key, safe to commit.
4. **Deploy the function.**
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions:sendReminders
   ```
   Deploy by name. `--only functions` would also deploy `resolveGateDuel`, which is written but deliberately not deployed yet (see `functions/README.md`). First deploy may ask to enable the Cloud Scheduler, Cloud Build and Artifact Registry APIs; say yes.
5. **Deploy the site** as you normally do (it now includes the service worker and `push-client.js`). The Cloud Messaging API (Firebase Cloud Messaging API, v1) must be enabled in Google Cloud; it is by default on new projects.
6. **iPhone:** open the site in Safari, tap Share, **Add to Home Screen**, then open Auramaxxing from the Home Screen icon. Needs iOS 16.4 or later. Push does not exist in a normal Safari tab.
7. In the app: gear > **Reminders > Enable reminders** > Allow. The status turns to "On for this device".

## Testing

- **Device check:** Reminders > **Send test**. This shows a notification through the service worker, proving this device can display one. It does not go through FCM.
- **Real delivery:** the sender runs at minute 0 of every hour (UTC clock, per-user local time). The planned-day nudge goes out in the first whole hour at or after your usual time (default 17:00; set your own under Usual training time to test sooner, say the next full hour, on a planned day when you have not trained). The streak heads-up goes out at 20:00 local if you have a 2+ day streak and have not trained. To force a run now: Cloud Scheduler console > `firebase-schedule-sendReminders-us-central1` > Force run. Logs: `firebase functions:log --only sendReminders` (one line: users, sent, skipped, pruned, errors).
- **Local logic:** `node test/reminders.test.mjs && node test/send-reminders.test.mjs`.

## Rules the sender follows

Max 2 a day; quiet hours 22:00-07:00 in the user's own timezone (`pushPrefs.tz`, refreshed on app open); never once the user trained today (local date); never on a rest day or while a streak freeze is on; no timezone stored means no message. Copy states facts and an easy next step, no guilt or loss wording. One tap off in Settings; it disables reminders and removes that device's token.

The sender has no memory (it writes nothing), so each reminder has exactly one hourly slot a day. Edge cases: a daylight-saving fall-back hour can repeat a slot once a year; a skipped or failed hourly run means that day's reminder is simply not sent.

## Keeping the copies in step

`functions/` deploys alone, so it carries copies of `reminders.js` and `streak.js`. After changing either, run `sh functions/scripts/sync-reminders.sh`. `test/reminders.test.mjs` fails if they drift.

## Things to know

- **Tokens are readable by other signed-in users.** The existing rule `match /users/{userId} { allow read: if request.auth != null }` applies to the new `pushDevices` field, and the app already loads every user document. An FCM token alone cannot send anything (sending needs your server credentials), but if you want them private, the clean fix is moving tokens to a subcollection `users/{uid}/private/push` with owner-only rules. That is a rules change and was not authorised here, so it is not done.
- Not verified on real devices: delivery on iOS and Android, a Blaze deploy, real FCM. Phase 11 regression has not been run.


## System-voice notifications update (redeploy the sender only)

The reminder copy now comes from pools of System-voice messages (`[SYSTEM] A gate has opened`, "Today: Push. 5 exercises, about 50 min. Your streak is at 6."), picked per user per day so it varies and never repeats two days running. The sender also now ships a data-only push; the service worker builds the notification (System icon and badge, one notification per day via `tag` + `renotify`, **Begin Hunt** / **Quick 15** buttons on Android). Tapping the notification itself (the only option on iOS) opens the Hunt screen; the buttons open `index.html?go=hunt` or `?go=quick`, which the app reads and then removes from the URL.

Because the **sender's copy and payload changed**, enzo must redeploy the sender (and only the sender):

```
firebase deploy --only functions:sendReminders --project auramaxxing-3d4bb
```

Also deploy the site as usual so the new service worker, `notification-options.js` and the two icons go live. Order does not matter much: an old service worker ignores the new data-only push (no notification) until the site is deployed, so deploy the site first if you want no gap. Delivery and appearance on real iOS and Android devices are UNVERIFIED; Reminders > Send test shows the new look on the device you are holding.
