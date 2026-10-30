'use strict';
/* sendReminders: the hourly job behind push reminders.

   READ-ONLY on workouts and programmes. The only write it ever makes is
   removing a device token that FCM reports as dead (users/{uid}.pushDevices.<id>).

   Which reminder to send (if any) is decided by lib/reminders.mjs, a copy of the
   app's pure reminders.js (test/reminders.test.mjs fails if they drift). This
   file only gathers the data, calls it, and delivers.

   `runReminders` takes its Firestore / messaging handles as arguments so it can be
   exercised with fakes (test/send-reminders.test.mjs); index.js passes the real ones. */

const ICON = 'icons/notify-192.png';
const BADGE = 'icons/notify-badge-96.png';

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

let _lib;
const lib = async () => (_lib ||= await import('./lib/reminders.mjs'));

/**
 * @param {object} deps
 * @param {object} deps.db          Firestore (admin)
 * @param {object} deps.messaging   admin messaging
 * @param {Function} deps.deleteField  () => FieldValue.delete()
 * @param {Function} deps.fieldPath    (...segments) => FieldPath
 * @param {number} [deps.now]
 */
async function runReminders({ db, messaging, deleteField, fieldPath, now = Date.now() }) {
  const { decideReminder, localParts, isQuietHour } = await lib();
  const stats = { users: 0, sent: 0, skipped: 0, pruned: 0, errors: 0 };
  const snap = await db.collection('users').where('pushPrefs.enabled', '==', true).get();

  for (const userDoc of snap.docs) {
    stats.users++;
    try {
      const uid = userDoc.id;
      const user = userDoc.data() || {};
      const prefs = user.pushPrefs || {};
      const devices = Object.entries(user.pushDevices || {}).filter(([, d]) => d && d.token);
      if (!devices.length) { stats.skipped++; continue; }

      // Cheap exit before reading any workouts: nothing is ever sent in quiet hours.
      const t = prefs.tz ? localParts(now, prefs.tz) : null;
      if (!t || isQuietHour(t.hour)) { stats.skipped++; continue; }

      const [wSnap, pSnap] = await Promise.all([
        db.collection('workouts').where('uid', '==', uid).select('date', 'time').get(),
        db.doc('programs/' + uid).get(),
      ]);
      const workouts = wSnap.docs.map(d => d.data());
      const program = pSnap.exists ? pSnap.data() : null;
      // With a home and a gym plan (plan-modes.js), rest days are always the gym plan's.
      const gymPlan = program && program.mode === 'home' && program.alt ? program.alt : program;
      const schedule = (gymPlan && gymPlan.schedule && gymPlan.schedule.length ? gymPlan.schedule : (program && program.schedule)) || [];

      const decision = decideReminder({
        now, prefs, workouts, schedule, program, uid,
        freeze: user.streakFreeze || null, backfill: user.streakBackfill || [],
      });
      if (!decision.send) { stats.skipped++; continue; }

      const res = await messaging.sendEachForMulticast({
        tokens: devices.map(([, d]) => d.token),
        // Data-only: the service worker builds the notification (System icon, badge, same-day tag,
        // Begin Hunt / Quick 15 buttons, tap opens the Hunt screen). Icon paths are relative to the
        // worker's scope so a GitHub Pages project path works.
        data: { type: decision.type, title: decision.title, body: decision.body, tag: decision.tag, icon: ICON, badge: BADGE },
        webpush: { headers: { Urgency: 'normal', TTL: '7200' } },
      });
      stats.sent += res.successCount;

      const dead = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(devices[i][0]);
      });
      if (dead.length) {
        const patch = [];
        for (const id of dead) patch.push(fieldPath('pushDevices', id), deleteField());
        await userDoc.ref.update(...patch);
        stats.pruned += dead.length;
      }
    } catch (e) {
      stats.errors++;
      console.error('sendReminders: user failed', userDoc.id, e && e.message);
    }
  }
  return stats;
}

module.exports = { runReminders };
