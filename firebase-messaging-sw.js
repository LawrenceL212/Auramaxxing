/* Push-only service worker for reminders.

   It exists so the browser can show a notification while the app is closed.
   It has NO fetch handler and caches nothing: the app is online-only exactly as
   before, and it is only registered after a Hunter taps Enable in Settings >
   Reminders (or on later visits once they have). Without it, or with
   notifications blocked, the app behaves as it always has.

   Firebase is loaded with importScripts (compat build) because service workers
   cannot reliably use ES module imports in Safari and Firefox. Keep the version
   in step with index.html (10.12.2). */

importScripts('notification-options.js');   // relative to this file, so it works under a Pages project path

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

try {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
  );
  firebase.initializeApp({
    apiKey: 'AIzaSyCmS8AsUKTqSZmeRjZkAnQDpgVmf168ZGY',
    authDomain: 'auramaxxing-3d4bb.firebaseapp.com',
    projectId: 'auramaxxing-3d4bb',
    storageBucket: 'auramaxxing-3d4bb.firebasestorage.app',
    messagingSenderId: '634364008045',
    appId: '1:634364008045:web:6e982579ecb217750e5164',
  });
  // The sender ships data-only pushes; we build and show the notification so it carries
  // the System icon, badge, tag and Android buttons (notification-options.js).
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const n = self.AuraNotify.buildNotification(payload && payload.data, self.registration.scope);
    return self.registration.showNotification(n.title, n.options);
  });
} catch (err) {
  // Offline or blocked CDN: the local test notification below still works.
}

/* Tapping the notification, or Begin Hunt / Quick 15 / Log weight (Android buttons), focuses the open app and tells it
   where to go, or opens the app at index.html?go=hunt|quick|weigh. Old-style FCM notification messages carry their
   own link and are handled by the SDK. */
self.addEventListener('notificationclick', (event) => {
  const data = event.notification && event.notification.data;
  if (data && data.FCM_MSG) return;
  event.notification.close();
  const type = data && data.type;
  const go = self.AuraNotify.goFor(event.action, type);
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        await c.focus();
        c.postMessage({ type: 'aura-go', go });
        return;
      }
    }
    return self.clients.openWindow(self.AuraNotify.targetUrl(event.action, self.registration.scope, type));
  })());
});
