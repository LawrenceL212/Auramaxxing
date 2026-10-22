/* =========================================================================
   PUSH CLIENT: the browser side of reminders (permission, token, test).

   Firebase Messaging is imported lazily from gstatic like the rest of Firebase
   (10.12.2), so nothing here loads until a Hunter taps Enable or already has
   reminders on. Everything fails soft: the app works the same without it.
   ========================================================================= */

/* >>> enzo: paste the Web Push certificate "Key pair" (public VAPID key) from
   Firebase console > Project settings > Cloud Messaging > Web configuration.
   See PUSH-SETUP.md. While this is the placeholder, Enable explains that
   reminders are not switched on yet instead of failing. */
export const FCM_VAPID_KEY = 'BOeBVbIsL_Pksg04thTCw93Vdorx6AGUUe_Z0k8eDs4W1ASEukf5XBKlGUNORvOeMNNCwaYI77PIg2UFBzPBXfg';

const FCM_URL = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
const SW_FILE = 'firebase-messaging-sw.js';
const DEVICE_KEY = 'aura_push_device';

export const isVapidConfigured = (key = FCM_VAPID_KEY) => typeof key === 'string' && key.length > 20 && !/^PASTE_/.test(key);

/** 'ios' | 'android' | 'desktop' from a user agent (iPadOS reports as a Mac with touch). */
export function detectPlatform(ua = '', maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** What this browser can do, and what the Hunter needs to do first. */
export function pushEnv(win = (typeof window !== 'undefined' ? window : {})) {
  const nav = win.navigator || {};
  const platform = detectPlatform(nav.userAgent || '', nav.maxTouchPoints || 0);
  let standalone = false;
  try { standalone = !!(nav.standalone || (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches)); } catch (_) {}
  const hasNotification = typeof win.Notification !== 'undefined';
  const hasSW = !!nav.serviceWorker;
  const hasPush = 'PushManager' in win;
  const permission = hasNotification ? win.Notification.permission : 'unsupported';
  // iOS only exposes push to a web app that was added to the Home Screen (16.4+).
  const needsInstall = platform === 'ios' && !standalone;
  const supported = hasNotification && hasSW && hasPush && !needsInstall;
  return { platform, standalone, hasNotification, hasSW, hasPush, permission, needsInstall, supported };
}

/** Stable id for this browser/device, used as the key in users/{uid}.pushDevices. */
export function getDeviceId(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try {
    let id = storage && storage.getItem(DEVICE_KEY);
    if (!id) {
      id = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      storage && storage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (_) { return 'd' + Date.now().toString(36); }
}

export const userTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { return ''; } };

export async function registerPushSW() {
  return navigator.serviceWorker.register(new URL(SW_FILE, location.href).href);
}

async function messagingFor(app) {
  const m = await import(FCM_URL);
  if (m.isSupported && !(await m.isSupported())) return { m, messaging: null };
  return { m, messaging: m.getMessaging(app) };
}

/** Fetch (or refresh) this device's token. Caller must already have permission. */
export async function getDeviceToken(app, vapidKey = FCM_VAPID_KEY) {
  const registration = await registerPushSW();
  const { m, messaging } = await messagingFor(app);
  if (!messaging) throw new Error('unsupported');
  return m.getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
}

/**
 * Ask for permission and get a token. Never throws.
 * @returns {{status:'granted', token, deviceId, platform} | {status:'unsupported'|'needs-install'|'no-key'|'denied'|'dismissed'|'error', error?}}
 */
export async function enablePush(app, env = pushEnv(), vapidKey = FCM_VAPID_KEY) {
  try {
    if (env.needsInstall) return { status: 'needs-install' };
    if (!env.supported) return { status: 'unsupported' };
    if (!isVapidConfigured(vapidKey)) return { status: 'no-key' };
    if (env.permission === 'denied') return { status: 'denied' };
    const perm = env.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'denied') return { status: 'denied' };
    if (perm !== 'granted') return { status: 'dismissed' };
    const token = await getDeviceToken(app, vapidKey);
    if (!token) return { status: 'error', error: 'no token' };
    return { status: 'granted', token, deviceId: getDeviceId(), platform: env.platform };
  } catch (e) {
    return { status: 'error', error: String((e && e.message) || e) };
  }
}

/** Forget this device's token with FCM. Best effort. */
export async function dropDeviceToken(app) {
  try {
    const { m, messaging } = await messagingFor(app);
    if (messaging) await m.deleteToken(messaging);
  } catch (_) {}
}

/** Show a notification through the service worker, to prove this device can display one. */
export async function showTestNotification() {
  const reg = await registerPushSW();
  const ready = await navigator.serviceWorker.ready;
  await (ready || reg).showNotification('Test reminder', {
    body: 'This is what a reminder looks like. Real ones arrive from the hourly sender.',
    icon: 'icons/icon-192.png', tag: 'aura-test', data: { local: true },
  });
}
