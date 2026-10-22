/* Tests for the pure parts of push-client.js.  Run: node test/push-client.test.mjs */
import { detectPlatform, pushEnv, getDeviceId, isVapidConfigured, FCM_VAPID_KEY, enablePush } from '../push-client.js';
let pass = 0, fail = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
check('platform: iPhone', detectPlatform(IPHONE), 'ios');
check('platform: iPad desktop-mode UA', detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'ios');
check('platform: Mac', detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), 'desktop');
check('platform: Android', detectPlatform(ANDROID), 'android');

const win = (o = {}) => ({ navigator: { userAgent: o.ua || ANDROID, serviceWorker: o.sw === false ? undefined : {}, standalone: o.standalone, maxTouchPoints: 0 }, PushManager: o.push === false ? undefined : function () {}, Notification: o.notif === false ? undefined : { permission: o.permission || 'default' }, matchMedia: () => ({ matches: !!o.display }) });
const w = (o = {}) => { const x = win(o); if (o.push === false) delete x.PushManager; if (o.notif === false) delete x.Notification; return x; };
check('android browser is supported', pushEnv(w()).supported, true);
check('iPhone in Safari tab needs Add to Home Screen', [pushEnv(w({ ua: IPHONE })).needsInstall, pushEnv(w({ ua: IPHONE })).supported], [true, false]);
check('iPhone from the Home Screen is supported', pushEnv(w({ ua: IPHONE, standalone: true })).supported, true);
check('display-mode standalone counts too', pushEnv(w({ ua: IPHONE, display: true })).needsInstall, false);
check('no Notification API', [pushEnv(w({ notif: false })).supported, pushEnv(w({ notif: false })).permission], [false, 'unsupported']);
check('permission is reported', pushEnv(w({ permission: 'denied' })).permission, 'denied');

const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v) }; };
const st = mem(); const a = getDeviceId(st);
check('device id is stable', getDeviceId(st), a);
check('device id is a safe field-path key', /^[A-Za-z0-9]+$/.test(a), true);
check('placeholder VAPID key is not configured', [isVapidConfigured(), isVapidConfigured('PASTE_X_xxxxxxxxxxxxxxxxxxxxxxxx'), isVapidConfigured('B' + 'x'.repeat(86))], [false, false, true]);
check('placeholder constant is the one to edit', /^PASTE_/.test(FCM_VAPID_KEY), true);

check('enable: iOS tab -> needs-install (nothing requested)', (await enablePush({}, pushEnv(w({ ua: IPHONE })))).status, 'needs-install');
check('enable: unsupported', (await enablePush({}, { supported: false })).status, 'unsupported');
check('enable: placeholder key -> no-key', (await enablePush({}, pushEnv(w()))).status, 'no-key');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
