/* Tests for notification-options.js and the service worker's wiring.  Run: node test/notification-options.test.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const N = createRequire(import.meta.url)('../notification-options.js');
let pass = 0, fail = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

const SCOPE = 'https://enzo.github.io/Auramaxxing/';
const data = { type: 'planned', title: '[SYSTEM] A gate has opened', body: 'Today: Push.', tag: 'planned-2026-10-21', icon: 'icons/notify-192.png', badge: 'icons/notify-badge-96.png' };
const n = N.buildNotification(data, SCOPE);
check('title and body pass through', [n.title, n.options.body], [data.title, data.body]);
check('icon and badge resolve under the project path', [n.options.icon, n.options.badge], [SCOPE + 'icons/notify-192.png', SCOPE + 'icons/notify-badge-96.png']);
check('same-day tag replaces, and renotify still alerts', [n.options.tag, n.options.renotify], ['planned-2026-10-21', true]);
check('Android buttons: Begin Hunt and Quick 15', n.options.actions, [{ action: 'hunt', title: 'Begin Hunt' }, { action: 'quick', title: 'Quick 15' }]);
check('test notification has no buttons', N.buildNotification({ type: 'test', title: 't', body: 'b' }, SCOPE).options.actions, []);
check('a leading slash is never kept (would escape a project path)', N.buildNotification({ icon: '/icons/x.png' }, SCOPE).options.icon, SCOPE + 'icons/x.png');
check('defaults when the payload is empty', [N.buildNotification(null).title, N.buildNotification(null).options.icon, N.buildNotification(null).options.tag], ['[SYSTEM] Notice', 'icons/notify-192.png', 'aura-reminder']);
check('tapping the notification (and iOS) goes to the Hunt', [N.goFor(undefined), N.goFor(''), N.goFor('hunt')], ['hunt', 'hunt', 'hunt']);
check('Quick 15 button goes to quick', N.goFor('quick'), 'quick');
check('target URLs are relative to the scope', [N.targetUrl('', SCOPE), N.targetUrl('quick', SCOPE), N.targetUrl('hunt')], [SCOPE + 'index.html?go=hunt', SCOPE + 'index.html?go=quick', 'index.html?go=hunt']);
check('target URL works at a domain root too', N.targetUrl('quick', 'https://x.app/'), 'https://x.app/index.html?go=quick');

// the files the payload names exist and are the right size
const png = (f) => { const b = fs.readFileSync(new URL('../' + f, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
check('notify-192.png is 192x192', png(N.ICON), [192, 192]);
check('notify-badge-96.png is 96x96', png(N.BADGE), [96, 96]);

// the service worker is wired to it, with relative URLs only
const sw = fs.readFileSync(new URL('../firebase-messaging-sw.js', import.meta.url), 'utf8');
check('sw loads the options builder relatively and shows notifications itself', [/importScripts\('notification-options\.js'\)/.test(sw), /onBackgroundMessage/.test(sw), /showNotification/.test(sw)], [true, true, true]);
check('sw has no root-absolute app URLs', /['"`]\/(index|icons)/.test(sw), false);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
