/* Push-only service worker for reminders.

   It exists so the browser can show a notification while the app is closed.
   It has NO fetch handler and caches nothing: the app is online-only exactly as
   before, and it is only registered after a Hunter taps Enable in Settings >
   Reminders (or on later visits once they have). Without it, or with
   notifications blocked, the app behaves as it always has.

   Firebase is loaded with importScripts (compat build) because service workers
   cannot reliably use ES module imports in Safari and Firefox. Keep the version
   in step with index.html (10.12.2). */

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
  // Notification-style messages from the sender are shown by the SDK itself.
  firebase.messaging();
} catch (err) {
  // Offline or blocked CDN: the local test notification below still works.
}

/* Tapping a notification opens (or focuses) the app. Messages from FCM carry
   their own link and are handled by the SDK; this covers the local test one. */
self.addEventListener('notificationclick', (event) => {
  const data = event.notification && event.notification.data;
  if (data && data.FCM_MSG) return;
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./index.html');
  })());
});
