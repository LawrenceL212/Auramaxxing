/* Tests for functions/send-reminders.js with fake Firestore/messaging.  Run: node test/send-reminders.test.mjs */
import { createRequire } from 'node:module';
import { localParts } from '../reminders.js';
import { shiftDay } from '../streak.js';
const { runReminders } = createRequire(import.meta.url)('../functions/send-reminders.js');

let pass = 0, fail = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`); };

const NOW = Date.parse('2026-10-21T20:00:00Z');       // Wednesday 20:00 UTC
const today = localParts(NOW, 'UTC').date;
const days = (n) => Array.from({ length: n }, (_, i) => ({ uid: 'u1', date: shiftDay(today, -(i + 1)), time: '18:00' }));

function fakes({ users, workouts = [], programs = {}, sendResult }) {
  const log = { reads: [], updates: [], sends: [] };
  const db = {
    collection(name) {
      return {
        where(f, op, v) {
          const q = { select() { return q; }, async get() {
            log.reads.push(name);
            if (name === 'users') return { docs: users };
            return { docs: workouts.filter(w => w[f] === v).map((w, i) => ({ id: 'w' + i, data: () => w })) };
          } };
          return q;
        },
      };
    },
    doc(path) { return { async get() { const p = programs[path.split('/')[1]]; return { exists: !!p, data: () => p }; } }; },
  };
  const messaging = { async sendEachForMulticast(m) { log.sends.push(m); return sendResult ? sendResult(m) : { successCount: m.tokens.length, responses: m.tokens.map(() => ({ success: true })) }; } };
  return { db, messaging, log };
}
const user = (o = {}) => { const d = { pushPrefs: { enabled: true, tz: 'UTC', planned: true, evening: true }, pushDevices: { d1: { token: 'tok1' }, d2: { token: 'tok2' } }, ...o }; return { id: 'u1', data: () => d, ref: { update: async () => { throw new Error('unexpected write'); } } }; };
const deps = (f) => ({ ...f, now: NOW, deleteField: () => 'DEL', fieldPath: (...p) => p.join('.') });

{
  const f = fakes({ users: [user()], workouts: days(5), programs: { u1: { schedule: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } } });
  const s = await runReminders(deps(f));
  check('sends one multicast to both devices', [f.log.sends.length, f.log.sends[0].tokens, s.sent], [1, ['tok1', 'tok2'], 2]);
  check('payload is the evening reminder', f.log.sends[0].data.type, 'evening');
  check('no writes when all tokens are fine', f.log.updates.length, 0);
}
{
  const f = fakes({ users: [user()], workouts: [...days(5), { uid: 'u1', date: today, time: '07:00' }], programs: { u1: { schedule: [] } } });
  const s = await runReminders(deps(f));
  check('trained today sends nothing', [f.log.sends.length, s.skipped], [0, 1]);
}
{
  const f = fakes({ users: [user({ pushDevices: {} })], workouts: days(5) });
  await runReminders(deps(f));
  check('no devices: no workout reads, nothing sent', [f.log.reads, f.log.sends.length], [['users'], 0]);
}
{
  const f = fakes({ users: [user()], workouts: days(5) });
  await runReminders({ ...deps(f), now: Date.parse('2026-10-21T23:00:00Z') });
  check('quiet hours: workouts are never even read', [f.log.reads, f.log.sends.length], [['users'], 0]);
}
{
  const u = user(); const updates = [];
  u.ref.update = async (...a) => updates.push(a);
  const f = fakes({ users: [u], workouts: days(5), programs: { u1: { schedule: [] } },
    sendResult: () => ({ successCount: 1, responses: [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }] }) });
  const s = await runReminders(deps(f));
  check('a dead token is pruned, nothing else written', [updates, s.pruned], [[['pushDevices.d2', 'DEL']], 1]);
}
{
  const f = fakes({ users: [user()], workouts: days(5), sendResult: () => ({ successCount: 0, responses: [{ success: false, error: { code: 'messaging/internal-error' } }, { success: false, error: { code: 'messaging/internal-error' } }] }) });
  const s = await runReminders(deps(f));
  check('transient errors keep the tokens', [f.log.updates.length, s.pruned], [0, 0]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
