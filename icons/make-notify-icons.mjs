/* Generates the notification icon (192 px, full colour) and badge (96 px, white on transparent, which Android
   tints). Same crest as icon-192.png: two rising chevrons and a violet gem, in the game's palette.
   Run from the repo root:  node icons/make-notify-icons.mjs   (needs playwright + chromium; output is committed). */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
import fs from 'node:fs';

const crest = (c1, c2, gem, glow) => `
  <g ${glow ? 'filter="url(#g)"' : ''}>
    <path d="M18 52 L96 18 L174 52 L174 74 L96 42 L18 74 Z" fill="${c1}"/>
    <path d="M30 100 L96 70 L162 100 L162 120 L96 92 L30 120 Z" fill="${c2}"/>
    <path d="M96 100 L122 128 L96 156 L70 128 Z" fill="${gem}"/>
  </g>`;
const full = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <defs><filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#0E1530"/><stop offset="1" stop-color="#05070D"/></radialGradient></defs>
  <rect width="192" height="192" rx="40" fill="url(#bg)"/>
  <g transform="translate(0 6)">${crest('#5BA8FF', '#3C7FD0', '#A17FFF', true)}</g></svg>`;
const mono = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 192 192">
  <g transform="translate(0 6)">${crest('#fff', '#fff', '#fff', false)}</g></svg>`;

const b = await chromium.launch();
for (const [svg, size, file, transparent] of [[full, 192, 'icons/notify-192.png', false], [mono, 96, 'icons/notify-badge-96.png', true]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  fs.writeFileSync(file, await p.screenshot({ omitBackground: transparent, type: 'png' }));
}
await b.close();
