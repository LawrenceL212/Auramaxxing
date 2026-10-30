/* Tests for the suggestion box.  Run:  node test/suggestions.test.mjs
   No dependencies and no runner, in the style of test/streak.test.mjs. */

import { cleanSuggestion, suggestionDoc, sentToday, canSend, sortSuggestions, countNew,
  claudePrompt, claudeUrl, toMillis, bugContext, contextLines, trimError, ERRORS_KEPT, SUGGESTION_MAX, DAILY_LIMIT, STATUS_LABELS, STATUSES } from '../suggestions.js';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

// ── cleaning what was typed ───────────────────────────────────────────────
check('trims and collapses spaces', cleanSuggestion('  add   a dark  mode  ').text, 'add a dark mode');
check('keeps one blank line, not five', cleanSuggestion('one\n\n\n\n\ntwo idea').text, 'one\n\ntwo idea');
check('too short is refused', cleanSuggestion('hi').ok, false);
check('empty is refused', cleanSuggestion('').ok, false);
check('null is refused, not thrown', cleanSuggestion(null).ok, false);
check('a normal idea is fine', cleanSuggestion('Let me reorder exercises in the logger').ok, true);
check('too long is refused', cleanSuggestion('x'.repeat(SUGGESTION_MAX + 1)).ok, false);
check('exactly the limit is fine', cleanSuggestion('x'.repeat(SUGGESTION_MAX)).ok, true);

// ── the stored document ───────────────────────────────────────────────────
const d = suggestionDoc({ uid: 'u1', name: 'Lucho', text: 'More bosses' });
check('an idea stores only uid, name, text, status, kind', Object.keys(d).sort(), ['kind', 'name', 'status', 'text', 'uid']);
check('an idea is kind idea', d.kind, 'idea');
check('an idea never carries context', 'context' in suggestionDoc({ uid: 'u', text: 't', context: { a: 1 } }), false);
check('an unknown kind becomes idea', suggestionDoc({ uid: 'u', text: 't', kind: 'hack' }).kind, 'idea');
check('starts as new', d.status, 'new');
check('a missing name becomes Hunter', suggestionDoc({ uid: 'u', text: 't' }).name, 'Hunter');

// ── daily limit ───────────────────────────────────────────────────────────
const now = Date.parse('2026-10-29T12:00:00Z');
const mine = [
  { createdAt: { seconds: (now - 3600e3) / 1000 } },
  { createdAt: new Date(now - 2 * 3600e3) },
  { createdAt: now - 30 * 3600e3 },
];
check('counts only the last 24 hours', sentToday(mine, now), 2);
check('under the limit can send', canSend(mine, now), true);
const full = Array.from({ length: DAILY_LIMIT }, () => ({ createdAt: now - 1000 }));
check('at the limit cannot send', canSend(full, now), false);
check('a pending write (no createdAt yet) does not count as today', sentToday([{}], now), 0);

// ── times ─────────────────────────────────────────────────────────────────
check('Timestamp-like with toMillis', toMillis({ toMillis: () => 42 }), 42);
check('bad date is 0', toMillis('not a date'), 0);

// ── inbox order ───────────────────────────────────────────────────────────
const inbox = sortSuggestions([
  { id: 'a', status: 'done', createdAt: 5 },
  { id: 'b', status: 'new', createdAt: 1 },
  { id: 'c', status: 'new', createdAt: 9 },
  { id: 'd', status: 'sent', createdAt: 7 },
  { id: 'e', status: 'dismissed', createdAt: 8 },
]);
check('new first (newest first), then sent, done, dismissed', inbox.map(s => s.id), ['c', 'b', 'd', 'a', 'e']);
check('counts new ones', countNew(inbox), 2);
check('a missing status counts as new', countNew([{}]), 1);
check('every status has a label', STATUSES.every(s => !!STATUS_LABELS[s]), true);

// ── handing it to Claude ──────────────────────────────────────────────────
const p = claudePrompt({ name: 'Lucho', text: 'Add rest timer sounds\nand a mute', createdAt: Date.parse('2026-10-28T10:00:00Z') });
check('quotes every line of the idea', p.includes('> Add rest timer sounds\n> and a mute'), true);
check('names the repo', p.includes('LawrenceL212/Auramaxxing'), true);
check('says the date', p.includes('2026-10-28'), true);
check('reminds Claude of the gameplay rule', p.includes('must not alter gameplay'), true);
const u = claudeUrl(p);
check('opens claude.ai with the prompt filled in', u.startsWith('https://claude.ai/new?q='), true);
check('the prompt round-trips through the link', decodeURIComponent(u.split('?q=')[1]), p);
check('a long prompt is cut', decodeURIComponent(claudeUrl('y'.repeat(9000)).split('?q=')[1]).length, 6000);

// ── bug reports ───────────────────────────────────────────────────────────
const raw = {
  screen: 'quest', sheet: 'Gate Complete', url: 'https://x/#a', userAgent: 'iPhone Safari', viewport: '390x844',
  installed: true, online: true, timezone: 'Europe/London', language: 'en-GB', version: '2026-10-29', level: 12,
  reportedAt: '2026-10-29T21:30:00Z',
  errors: Array.from({ length: 14 }, (_, i) => ({ t: 't' + i, msg: 'boom ' + i, src: 'index.html:1', stack: 's'.repeat(5000) })),
};
const ctx = bugContext(raw);
check('keeps only the last ten errors', ctx.errors.length, ERRORS_KEPT);
check('the kept errors are the newest', ctx.errors[ERRORS_KEPT - 1].msg, 'boom 13');
check('a stack is cut to size', ctx.errors[0].stack.length, 1200);
check('a message is cut to size', trimError({ msg: 'm'.repeat(900) }).msg.length, 400);
check('keeps screen and level', [ctx.screen, ctx.level], ['quest', 12]);
check('leaves out what was not gathered', Object.keys(bugContext({ screen: 'quest' })).sort(), ['errors', 'installed', 'online', 'screen']);
check('no email field ever', 'email' in bugContext({ ...raw, email: 'a@b.c' }), false);
const bug = suggestionDoc({ uid: 'u', name: 'Lucho', text: 'Save button froze', kind: 'bug', context: ctx });
check('a bug keeps its context', bug.context.screen, 'quest');
check('a bug is kind bug', bug.kind, 'bug');
const lines = contextLines(ctx);
check('context reads as lines', lines.includes('Screen: quest') && lines.includes('Running as: installed app'), true);
check('says when no errors were caught', contextLines(bugContext({})).includes('Errors caught: none'), true);
const bp = claudePrompt({ ...bug, createdAt: Date.parse('2026-10-29T21:30:00Z') });
check('a bug prompt asks for a fix', bp.includes('find the cause') && bp.includes('reported this bug'), true);
check('a bug prompt carries the details', bp.includes('Screen size: 390x844') && bp.includes('boom 13'), true);
check('an idea prompt does not say bug', p.includes('bug'), false);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
