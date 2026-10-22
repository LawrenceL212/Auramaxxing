/* Tests for reminders.js.  Run:  node test/reminders.test.mjs  (plain script, exits non-zero on failure) */
import fs from 'node:fs';
import { decideReminder, learnUsualMinutes, plannedSlotHour, localParts, isQuietHour, reminderCopy, MAX_PER_DAY } from '../reminders.js';
import { shiftDay, weekdayOf } from '../streak.js';

let pass = 0, fail = 0;
const out = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

/** ms for a local wall-clock time in a zone */
function at(tz, date, hhmm) {
  const base = Date.parse(`${date}T${hhmm}:00Z`);
  for (let m = -15 * 60; m <= 15 * 60; m += 15) {
    const ms = base + m * 60000, p = localParts(ms, tz);
    if (p.date === date && `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` === hhmm) return ms;
  }
  throw new Error('no such local time ' + tz + date + hhmm);
}
const TODAY = '2026-10-21';                       // a Wednesday
const ALL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const run = (n, time = '18:00') => ({ date: shiftDay(TODAY, -n), time });
const streak5 = [1, 2, 3, 4, 5].map(n => run(n));
const prefs = (o = {}) => ({ enabled: true, planned: true, evening: true, tz: 'UTC', ...o });
const decide = (hhmm, o = {}) => decideReminder({ now: at(o.tz || 'UTC', TODAY, hhmm), prefs: prefs({ tz: o.tz || 'UTC', ...o.prefs }), workouts: o.workouts ?? streak5, schedule: o.schedule ?? ALL, freeze: o.freeze, sentToday: o.sentToday });

check('Oct 21 2026 is a Wednesday (fixture sanity)', weekdayOf(TODAY), 'Wed');

// ── learning the usual time
check('default 17:00 with no history', learnUsualMinutes([], TODAY), 17 * 60);
check('default with fewer than 3 timed sessions', learnUsualMinutes([run(1, '07:00'), run(2, '07:00')], TODAY), 17 * 60);
check('median of recent times', learnUsualMinutes([run(1, '06:30'), run(2, '07:00'), run(3, '20:00')], TODAY), 7 * 60);
check('even count averages the middle two', learnUsualMinutes([run(1, '06:00'), run(2, '07:00'), run(3, '08:00'), run(4, '09:00')], TODAY), 450);
check('sessions older than 6 weeks ignored', learnUsualMinutes([run(50, '06:00'), run(60, '06:00'), run(70, '06:00'), run(1, '19:00')], TODAY), 17 * 60);
check('sessions without a time ignored', learnUsualMinutes([{ date: shiftDay(TODAY, -1) }, run(2, '19:00'), run(3, '19:00'), run(4, '19:00')], TODAY), 19 * 60);
check('slot is the first whole hour at or after', [plannedSlotHour(17 * 60), plannedSlotHour(17 * 60 + 1), plannedSlotHour(6 * 60)], [17, 18, 8]);
check('slot never lands in quiet hours', plannedSlotHour(23 * 60), 21);

// ── planned nudge
check('planned nudge at the default hour', decide('17:00', { workouts: [] }).type, 'planned');
check('not before the slot', decide('16:00').send, false);
check('not after the slot (once a day)', decide('18:00', { workouts: [] }).send, false);
check('uses a learned time (sessions at 18:20 -> 19:00 slot)', [decide('18:00', { workouts: [1, 2, 3, 4].map(n => run(n, '18:20')) }).send, decide('19:00', { workouts: [1, 2, 3, 4].map(n => run(n, '18:20')) }).type], [false, 'planned']);
check('early riser: slot is clamped to 08:00', decide('08:00', { workouts: [1, 2, 3, 4].map(n => run(n, '06:40')) }).type, 'planned');
check('usualTime override wins', decide('12:00', { prefs: { usualTime: '11:30' } }).type, 'planned');
check('planned switch off', decide('17:00', { prefs: { planned: false }, workouts: [] }).send, false);
check('no plan today (not scheduled) means no nudge', decide('17:00', { schedule: ['Mon', 'Fri'], workouts: [] }).reason, 'rest-day');
check('no programme at all means no planned nudge', decide('17:00', { schedule: [], workouts: [] }).reason, 'not-due');

// ── evening streak warning
const ev = decide('20:00');
check('evening warning for a live streak', [ev.send, ev.type], [true, 'evening']);
check('evening copy names the streak, no loss language', /5 days/.test(ev.body) && !/lose|lost|break|fail|miss|don't|never/i.test(ev.title + ev.body), true);
check('evening switch off', decide('20:00', { prefs: { evening: false } }).send, false);
check('streak of 1 is not warned', decide('20:00', { workouts: [run(1)] }).send, false);
check('no streak, no warning', decide('20:00', { workouts: [] }).send, false);
check('evening only at 20:00', [decide('19:00', { workouts: streak5 }).type, decide('21:00').send], [undefined, false]);
check('evening wins when both fall in the same hour', decide('20:00', { prefs: { usualTime: '19:30' } }).type, 'evening');

// ── hard rules
check('never when already trained today', decide('20:00', { workouts: [{ date: TODAY, time: '08:00' }, ...streak5] }).reason, 'trained-today');
check('quiet hours at 23:00', decide('23:00').reason, 'quiet-hours');
check('quiet hours at 03:00', decide('03:00').reason, 'quiet-hours');
check('quiet-hour helper edges', [isQuietHour(21), isQuietHour(22), isQuietHour(6), isQuietHour(7)], [false, true, true, false]);
check('hard cap of 2 a day', [MAX_PER_DAY, decide('20:00', { sentToday: 2 }).reason], [2, 'daily-cap']);
check('one already sent still allows another', decide('20:00', { sentToday: 1 }).send, true);
check('disabled', decide('20:00', { prefs: { enabled: false } }).reason, 'disabled');
check('no prefs', decideReminder({ now: Date.now() }).reason, 'disabled');
check('no timezone stored means silence', decide('20:00', { prefs: { tz: '' } }).reason, 'no-timezone');
check('invalid timezone means silence', decide('20:00', { prefs: { tz: 'Mars/Base' } }).reason, 'bad-timezone');
check('freeze active means silence', decide('20:00', { freeze: { from: shiftDay(TODAY, -2), active: true } }).reason, 'frozen');

// ── the user's own timezone decides
const tokyo = decide('20:00', { tz: 'Asia/Tokyo' });
check('evening fires at 20:00 Tokyo time', tokyo.type, 'evening');
check('same instant is quiet or not-due elsewhere', decideReminder({ now: at('Asia/Tokyo', TODAY, '20:00'), prefs: prefs({ tz: 'America/New_York' }), workouts: streak5, schedule: ALL }).send, false);
check('New York 22:30 is quiet', decide('22:30', { tz: 'America/New_York' }).reason, 'quiet-hours');
check('trained today is judged on the local date', decideReminder({ now: at('Asia/Tokyo', TODAY, '20:00'), prefs: prefs({ tz: 'Asia/Tokyo' }), workouts: [{ date: TODAY, time: '07:00' }, ...streak5], schedule: ALL }).reason, 'trained-today');

// ── tone
for (const t of ['planned', 'evening']) {
  const c = reminderCopy(t, { streak: 4 });
  check(`${t} copy is short and gentle`, c.title.length <= 40 && c.body.length <= 140 && !/!|lose|lost|last chance|hurry|don't|only \d|expires|miss/i.test(c.title + c.body), true);
}

// ── the Cloud Function carries copies of the pure modules; they must not drift
const lf = (s) => s.replace(/\r\n/g, '\n');
const norm = (s) => lf(s).replace("'./streak.mjs'", "'./streak.js'");
check('functions/lib/reminders.mjs matches reminders.js', norm(fs.readFileSync(new URL('../functions/lib/reminders.mjs', import.meta.url), 'utf8')), lf(fs.readFileSync(new URL('../reminders.js', import.meta.url), 'utf8')));
check('functions/lib/streak.mjs matches streak.js', lf(fs.readFileSync(new URL('../functions/lib/streak.mjs', import.meta.url), 'utf8')), lf(fs.readFileSync(new URL('../streak.js', import.meta.url), 'utf8')));

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
