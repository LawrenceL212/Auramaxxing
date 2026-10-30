/* =========================================================================
   SUGGESTIONS — the in-app suggestion box

   Any Hunter types an idea (Settings → Suggest an idea). It is stored as one
   document in a new `suggestions` collection: { uid, name, text, status,
   createdAt }. Nothing else in the game reads it, so it touches no
   progression, no profile field and no other collection.

   The developer (the admin uid) sees every suggestion in an inbox card. Each
   one can be sent to Claude: claudePrompt() turns it into a ready-made task
   for the Auramaxxing repo, copied to the clipboard and opened in Claude.
   Status moves new → sent → done (or dismissed); only the admin changes it,
   and the Hunter who wrote it sees that status next to their own ideas.

   Bug reports use the same box and collection with `kind: 'bug'` (ideas
   are `kind: 'idea'`). A bug report also stores `context`: what the app can
   tell on its own (screen, open sheet, device, screen size, installed or
   browser, online, time zone, the page's version date and the last errors
   the page caught), built by bugContext() so every field is cut to size.
   No email, no body data, no workout content.

   Pure, so `node test/suggestions.test.mjs` tests it.
   ========================================================================= */

export const SUGGESTION_MIN = 5;
export const SUGGESTION_MAX = 1000;
export const DAILY_LIMIT = 5;
export const REPO = 'LawrenceL212/Auramaxxing';

export const STATUSES = ['new', 'sent', 'done', 'dismissed'];
export const STATUS_LABELS = {
  new: 'Waiting for the developer',
  sent: 'Being built',
  done: 'Done',
  dismissed: 'Not planned',
};

/** Tidy what the Hunter typed and say whether it can be sent. */
export function cleanSuggestion(raw) {
  const text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < SUGGESTION_MIN) return { ok: false, text, error: 'Write a little more so the idea is clear.' };
  if (text.length > SUGGESTION_MAX) return { ok: false, text, error: `Keep it under ${SUGGESTION_MAX} characters.` };
  return { ok: true, text, error: '' };
}

/** The document stored for a new suggestion. `createdAt` is set by the caller (serverTimestamp). */
export const KINDS = ['idea', 'bug'];
export const ERRORS_KEPT = 10;

export function suggestionDoc({ uid, name, text, kind = 'idea', context = null }) {
  const d = {
    uid: String(uid || ''),
    name: String(name || 'Hunter').slice(0, 40),
    text: String(text || ''),
    status: 'new',
    kind: KINDS.includes(kind) ? kind : 'idea',
  };
  if (d.kind === 'bug' && context) d.context = context;
  return d;
}

const cut = (v, n) => String(v ?? '').slice(0, n);

/** One caught error, cut to size: { t, msg, src, stack }. */
export function trimError(e) {
  return { t: cut(e && e.t, 30), msg: cut(e && e.msg, 400), src: cut(e && e.src, 200), stack: cut(e && e.stack, 1200) };
}

/** The details attached to a bug report. `raw` is what the page gathered; anything missing is left out. */
export function bugContext(raw = {}) {
  const c = {
    screen: cut(raw.screen, 60),
    sheet: cut(raw.sheet, 120),
    url: cut(raw.url, 300),
    userAgent: cut(raw.userAgent, 400),
    viewport: cut(raw.viewport, 40),
    installed: !!raw.installed,
    online: raw.online !== false,
    timezone: cut(raw.timezone, 60),
    language: cut(raw.language, 20),
    version: cut(raw.version, 40),
    reportedAt: cut(raw.reportedAt, 30),
    level: Number.isFinite(raw.level) ? raw.level : null,
    errors: (raw.errors || []).slice(-ERRORS_KEPT).map(trimError),
  };
  for (const k of Object.keys(c)) if (c[k] === '' || c[k] === null) delete c[k];
  return c;
}

/** The context as readable lines, for the inbox and for the prompt handed to Claude. */
export function contextLines(c) {
  if (!c) return [];
  const rows = [
    ['Screen', c.screen], ['Open sheet', c.sheet], ['Device', c.userAgent], ['Screen size', c.viewport],
    ['Running as', c.installed ? 'installed app' : 'browser tab'], ['Online', c.online === false ? 'no' : 'yes'],
    ['Time zone', c.timezone], ['Language', c.language], ['App version', c.version],
    ['Hunter level', c.level], ['Reported at', c.reportedAt], ['URL', c.url],
  ];
  const out = rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${v}`);
  const errs = c.errors || [];
  out.push(errs.length ? `Errors caught (${errs.length}, oldest first):` : 'Errors caught: none');
  for (const e of errs) out.push(`- ${e.t ? e.t + ' ' : ''}${e.msg}${e.src ? ` (${e.src})` : ''}${e.stack ? '\n' + e.stack.split('\n').map(l => '    ' + l).join('\n') : ''}`);
  return out;
}

/** Milliseconds from a Firestore Timestamp, a Date, an ISO string or a number. */
export function toMillis(t) {
  if (!t) return 0;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** How many suggestions this Hunter sent in the 24 hours before `now`. */
export function sentToday(list, now) {
  return (list || []).filter(s => now - toMillis(s.createdAt) < 86400000).length;
}

export function canSend(list, now) {
  return sentToday(list, now) < DAILY_LIMIT;
}

/** Inbox order: new first, then sent, done, dismissed; newest first inside each. */
export function sortSuggestions(list) {
  const rank = s => { const i = STATUSES.indexOf(s.status); return i < 0 ? 0 : i; };
  return [...(list || [])].sort((a, b) => rank(a) - rank(b) || toMillis(b.createdAt) - toMillis(a.createdAt));
}

export function countNew(list) {
  return (list || []).filter(s => !s.status || s.status === 'new').length;
}

/** The task handed to Claude for one suggestion. */
export function claudePrompt(s, repo = REPO) {
  const who = s.name ? `${s.name}, a player` : 'A player';
  const when = toMillis(s.createdAt) ? new Date(toMillis(s.createdAt)).toISOString().slice(0, 10) : '';
  const quote = String(s.text || '').split('\n').map(l => '> ' + l).join('\n');
  const rules = 'Follow CLAUDE.md: changes must not alter gameplay, scoring formulas, Firestore shape or the reconciliation system without asking me first.';
  if (s.kind === 'bug') {
    return [
      `${who} of Auramaxxing reported this bug${when ? ` on ${when}` : ''}:`,
      '',
      quote,
      '',
      'What the app recorded when they sent it:',
      ...contextLines(s.context),
      '',
      `Please find the cause in the ${repo} repo and fix it. ${rules} If you cannot reproduce it, say what you checked and what more you need from the player. Open a PR with 390x844 screenshots for me to review before merging.`,
    ].join('\n');
  }
  return [
    `${who} of Auramaxxing sent this suggestion${when ? ` on ${when}` : ''}:`,
    '',
    quote,
    '',
    `Please implement it in the ${repo} repo. ${rules} If the idea is unclear or touches any of those, say so and propose the smallest safe version. Open a PR with 390x844 screenshots for me to review before merging.`,
  ].join('\n');
}

/** A link that opens Claude with the prompt filled in. Long prompts are cut to keep the URL usable. */
export function claudeUrl(prompt, max = 6000) {
  let p = String(prompt || '');
  if (p.length > max) p = p.slice(0, max - 1) + '…';
  return 'https://claude.ai/new?q=' + encodeURIComponent(p);
}
