/* Tests for reminders.js.  Run:  node test/reminders.test.mjs  (plain script, exits non-zero on failure) */
import fs from 'node:fs';
import { pickIndex, planDayFor, COPY_MAX_TITLE, COPY_MAX_BODY, decideReminder, learnUsualMinutes, plannedSlotHour, localParts, isQuietHour, reminderCopy, MAX_PER_DAY, decideWeighIn, weighRun, WEIGHIN_HOUR } from '../reminders.js';
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
check('evening copy names the streak, no loss language', /\b5\b/.test(ev.title + ' ' + ev.body) && !/lose|lost|break|fail|miss|don't|never/i.test(ev.title + ' ' + ev.body), true);
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

// ── tone and copy pools
const BAD = /!|lose|lost|last chance|hurry|don't|only \d|expires|miss|break|broke|fail|never|ruin|waste|lazy|shame|disappoint|behind|slip|\bgone\b|wasted|punish|penalt/i;
const FULL = { streak: 6, dayName: 'Push', exercises: 5, mins: 50, uid: 'u1' };
let allOk = true, shown = [];
for (const type of ['planned', 'evening', 'test']) {
  for (let d = 0; d < 40; d++) {
    for (const ctx of [FULL, { streak: 2, uid: 'u2' }, { streak: 0, dayName: 'Legs', exercises: 1, mins: 15, uid: 'u3' }, {}]) {
      const c = reminderCopy(type, { ...ctx, date: shiftDay('2026-10-01', d) });
      if (c.title.length > COPY_MAX_TITLE || c.body.length > COPY_MAX_BODY || BAD.test(c.title + c.body) || /undefined|NaN|\bnull\b/.test(c.title + c.body) || !c.title.startsWith('[SYSTEM]')) { allOk = false; shown.push(type + ':' + JSON.stringify(c)); }
    }
  }
}
check('every message in every pool is System-voiced, short, kind and has no blanks', [allOk, shown.slice(0, 2)], [true, []]);
check('planned copy uses the real day, exercise count and streak', (() => { for (let d = 0; d < 6; d++) { const c = reminderCopy('planned', { ...FULL, date: shiftDay('2026-10-01', d) }); if (/Push/.test(c.body) && /5 exercises/.test(c.body) && /about 50 min/.test(c.body)) return true; } return false; })(), true);
check('the headline example reads as intended', (() => { for (let d = 0; d < 6; d++) { const c = reminderCopy('planned', { ...FULL, date: shiftDay('2026-10-01', d) }); if (c.title === '[SYSTEM] A gate has opened') return c.body; } return null; })(), 'Today: Push. 5 exercises, about 50 min. Your streak is at 6.');
for (const type of ['planned', 'evening', 'test']) {
  let repeats = 0; const seen = new Set();
  for (const uid of ['a', 'b', 'enzo', 'u1', 'x9']) for (let d = 0; d < 120; d++) {
    const t0 = reminderCopy(type, { ...FULL, uid, date: shiftDay('2026-01-01', d) }).title, t1 = reminderCopy(type, { ...FULL, uid, date: shiftDay('2026-01-01', d + 1) }).title;
    if (t0 === t1) repeats++; seen.add(t0);
  }
  check(`${type}: never the same message two days running; the pool is used`, [repeats, seen.size > 1], [0, true]);
}
check('copy is deterministic per user and day', reminderCopy('planned', { ...FULL, date: '2026-10-21' }), reminderCopy('planned', { ...FULL, date: '2026-10-21' }));
check('different users get different rotations', new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(u => pickIndex(6, u + '|planned', '2026-10-21'))).size > 1, true);
check('pickIndex handles tiny pools', [pickIndex(1, 'x', '2026-10-21'), pickIndex(2, 'x', '2026-10-21') !== pickIndex(2, 'x', '2026-10-22')], [0, true]);

// ── plan day facts for the copy
const prog = { scheduleMode: 'fixed', days: [{ name: 'Push', exercises: [{ sets: 4 }, { sets: 4 }, { sets: 4 }, { sets: 3 }, { sets: 3 }], assignedDays: ['Wed'] }, { name: 'Pull', exercises: [], assignedDays: ['Fri'] }] };
check('fixed plan: the day assigned to the weekday', planDayFor(prog, TODAY), { dayName: 'Push', exercises: 5, mins: 55 });
check('fixed plan: no day assigned -> null', planDayFor(prog, '2026-10-22'), null);
check('rotation plan: the day the rotation is on', planDayFor({ days: [{ name: 'A', exercises: [] }, { name: 'B', exercises: [{ sets: 2 }] }], currentDayIndex: 1 }, TODAY), { dayName: 'B', exercises: 1, mins: 5 });
check('no program -> null', planDayFor(null, TODAY), null);
const withProg = decideReminder({ now: at('UTC', TODAY, '18:00'), prefs: prefs(), workouts: streak5, schedule: ['Wed'], program: prog, uid: 'u1' });
check('decideReminder passes the plan facts and streak into the planned copy', [withProg.type, /Push/.test(withProg.body), /5 exercises/.test(withProg.body), /streak is at \d/.test(withProg.body)], ['planned', true, true, true]);
check('decision carries a per-day tag so a same-day reminder replaces', [withProg.tag, ev.tag], ['planned-' + TODAY, 'streak-' + TODAY]);

// ── morning weigh-in
const wd = (n) => shiftDay(TODAY, -n);
const weigh = (hhmm, o = {}) => decideWeighIn({ now: at(o.tz || 'UTC', TODAY, hhmm), prefs: prefs({ tz: o.tz || 'UTC', ...o.prefs }), weightDates: o.dates ?? [wd(1), wd(2), wd(3)], freeze: o.freeze, uid: 'u1' });
check('weigh-in goes out at 08:00', [WEIGHIN_HOUR, weigh('08:00').send, weigh('08:00').type, weigh('08:00').tag], [8, true, 'weighin', 'weighin-' + TODAY]);
check('only in the 08:00 hour', [weigh('07:00').send, weigh('09:00').send], [false, false]);
check('not when already weighed today', weigh('08:00', { dates: [TODAY] }).reason, 'weighed-today');
check('on unless switched off', [weigh('08:00', { prefs: { weighin: undefined } }).send, weigh('08:00', { prefs: { weighin: false } }).reason], [true, 'switched-off']);
check('reminders off means none', weigh('08:00', { prefs: { enabled: false } }).reason, 'disabled');
check('not while a streak freeze is active', weigh('08:00', { freeze: { active: true } }).reason, 'frozen');
check('local morning, not UTC', [weigh('08:00', { tz: 'Asia/Tokyo' }).send], [true]);
check('run of mornings ends yesterday', [weighRun([wd(1), wd(2), wd(3), wd(5)], TODAY), weighRun([wd(2)], TODAY), weighRun([TODAY], TODAY)], [3, 0, 0]);
const wc = weigh('08:00');
check('weigh-in copy fits a lock screen and has no loss language', wc.title.length <= COPY_MAX_TITLE && wc.body.length <= COPY_MAX_BODY && !/lose|lost|break|fail|miss|don't|never/i.test(wc.title + ' ' + wc.body), true);
check('weigh-in copy names the run of mornings', /3 mornings in a row/.test(weigh('08:00').body), true);
check('every weigh-in message fits', [0, 1, 2, 3, 4, 5, 6, 7].every(n => { const c = reminderCopy('weighin', { run: 12, uid: 'x', date: shiftDay(TODAY, n) }); return c.title.length <= COPY_MAX_TITLE && c.body.length <= COPY_MAX_BODY; }), true);

// ── the Cloud Function carries copies of the pure modules; they must not drift
const lf = (s) => s.replace(/\r\n/g, '\n');
const norm = (s) => lf(s).replace("'./streak.mjs'", "'./streak.js'");
check('functions/lib/reminders.mjs matches reminders.js', norm(fs.readFileSync(new URL('../functions/lib/reminders.mjs', import.meta.url), 'utf8')), lf(fs.readFileSync(new URL('../reminders.js', import.meta.url), 'utf8')));
check('functions/lib/streak.mjs matches streak.js', lf(fs.readFileSync(new URL('../functions/lib/streak.mjs', import.meta.url), 'utf8')), lf(fs.readFileSync(new URL('../streak.js', import.meta.url), 'utf8')));

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
