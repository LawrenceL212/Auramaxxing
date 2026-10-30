/* A CSS rule that scrolls itself (overflow-y auto or scroll) must not set touch-action:none, or a phone
   cannot swipe it (the Gate Complete reward screen could not be scrolled on Android).
   Run:  node test/scroll-overlays.test.mjs */
import fs from 'fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') +
  fs.readFileSync(new URL('../ui-system.css', import.meta.url), 'utf8');
const bad = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const body = m[2].replace(/\s+/g, '');
  if (/touch-action:none/.test(body) && /overflow(-y)?:(auto|scroll)/.test(body)) bad.push(m[1].trim().split('\n').pop().trim());
}
console.log(bad.length ? 'FAIL scrolling rules with touch-action:none:\n  ' + bad.join('\n  ') : 'ok    no scrolling rule blocks touch panning');
process.exit(bad.length ? 1 : 0);
