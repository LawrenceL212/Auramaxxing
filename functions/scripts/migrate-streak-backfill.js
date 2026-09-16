'use strict';
/* =========================================================================
   ONE-TIME HISTORICAL STREAK BACKFILL

   The streak engine (../../streak.js) is strict from STREAK_RULES_START
   onward: a day with no workout, no scheduled rest day and no freeze breaks
   the run. Before that boundary some freezes were never recorded — holidays
   nobody remembered to enter, and the period when the Firestore rules were
   denying reads so Hunters physically could not log. This writes those
   omissions back as explicit, auditable records.

   WHAT IT WILL NOT DO

   · It does not create workout documents. Nothing here touches `workouts`, so
     session counts, XP, PRs, volume and every other statistic are unaffected.
   · It does not infer intent. A gap in the data cannot tell you whether
     someone was on holiday or simply skipped, so this applies only the windows
     declared in BACKFILL_PLAN below — deliberate decisions, reviewable in the
     diff. Every other gap stays a genuine break.
   · It does not touch anything on or after STREAK_RULES_START. The engine
     ignores backfill from that date onward regardless, so a stale window can
     never grant forgiveness under the new rules.

   IDEMPOTENT

   Each window carries a stable id (`from_to`). Re-running skips any window a
   user already has, so it is safe to run repeatedly.

   USAGE

     node scripts/migrate-streak-backfill.js --analyse   # list every gap, write nothing
     node scripts/migrate-streak-backfill.js --dry-run   # show what --apply would write
     node scripts/migrate-streak-backfill.js --apply     # write it

   Requires GOOGLE_APPLICATION_CREDENTIALS, or a service account path in
   AURAMAXXING_CREDENTIALS.
   ========================================================================= */

const admin = require('firebase-admin');
const path = require('path');

/* ── GRANDFATHER MODE ────────────────────────────────────────────────────
   Deliberate owner decision (2026-09-16): every Hunter is brought to the same
   baseline rather than picking apart which historical gaps were forgotten
   freezes and which were genuine misses. The data cannot tell those apart, all
   four accounts started on the same day, and the owner is telling the players
   directly what changed — so a uniform amnesty is fairer than a judgement
   call made from incomplete evidence.

   This overrides the "preserve genuine historical breaks" rule, knowingly and
   only for dates before STREAK_RULES_START. From the boundary onward nothing
   is forgiven.

   Each Hunter gets ONE window: first session -> the day before the boundary. */
const GRANDFATHER_ALL = true;
const GRANDFATHER_REASON =
  'One-time amnesty at the streak-rules changeover. Historical freezes were '
  + 'not reliably recorded (holidays, and the Firestore outage when logging '
  + 'was impossible), so all pre-2026-09-16 gaps are forgiven uniformly.';

/* Windows applied regardless of grandfather mode. Add an entry only when you
   can say why. `uids: null` means every Hunter. */
const BACKFILL_PLAN = [];

const STREAK_RULES_START = '2026-09-16';
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const weekday = (d) => WD[(new Date(d + 'T12:00:00').getDay() + 6) % 7];

function init() {
  const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS
            || process.env.AURAMAXXING_CREDENTIALS;
  if (!cred) throw new Error('Set AURAMAXXING_CREDENTIALS to a service account JSON path.');
  admin.initializeApp({ credential: admin.credential.cert(path.resolve(cred)) });
  return admin.firestore();
}

async function load(db) {
  const [users, progs, works] = await Promise.all([
    db.collection('users').get(),
    db.collection('programs').get(),
    db.collection('workouts').get(),
  ]);
  const programs = {};
  progs.forEach((d) => { programs[d.id] = d.data() || {}; });
  const dates = {};
  works.forEach((d) => {
    const w = d.data() || {};
    if (!w.uid || !w.date) return;
    (dates[w.uid] = dates[w.uid] || new Set()).add(w.date);
  });
  return { users: users.docs.map((d) => ({ uid: d.id, ...(d.data() || {}) })), programs, dates };
}

/** Why a date qualifies — mirrors dayState() in streak.js. */
function dayState(dateStr, ctx) {
  if (ctx.dates.has(dateStr)) return 'workout';
  const s = ctx.schedule;
  if (Array.isArray(s) && s.length > 0 && s.length < 7 && !s.includes(weekday(dateStr))) return 'rest';
  const f = ctx.freeze;
  if (f && f.from) {
    if (f.active && dateStr >= f.from) return 'freeze';
    if (f.to && dateStr >= f.from && dateStr <= f.to) return 'freeze';
  }
  if (dateStr < STREAK_RULES_START) {
    for (const w of (ctx.backfill || [])) {
      if (w && dateStr >= w.from && dateStr <= w.to) return 'backfill';
    }
  }
  return null;
}

function streak(ctx, today) {
  let cur = dayState(today, ctx) ? today : shift(today, -1);
  let n = 0;
  for (let g = 0; g < 3660; g++) {
    if (!dayState(cur, ctx)) break;
    n++; cur = shift(cur, -1);
  }
  return n;
}

function ctxFor(u, programs, dates) {
  return {
    dates: dates[u.uid] || new Set(),
    schedule: (programs[u.uid] || {}).schedule || [],
    freeze: u.streakFreeze || null,
    backfill: u.streakBackfill || [],
  };
}

/** Every streak-breaking gap between a Hunter's first session and the boundary. */
function gaps(ctx) {
  const all = [...ctx.dates].sort();
  if (!all.length) return [];
  const out = [];
  let run = null;
  for (let d = all[0]; d < STREAK_RULES_START; d = shift(d, 1)) {
    if (dayState(d, ctx)) { if (run) { out.push(run); run = null; } continue; }
    if (run) run.to = d; else run = { from: d, to: d };
  }
  if (run) out.push(run);
  return out;
}

async function main() {
  const mode = process.argv.includes('--apply') ? 'apply'
             : process.argv.includes('--dry-run') ? 'dry-run' : 'analyse';
  const today = new Date().toISOString().slice(0, 10);
  const db = init();
  const { users, programs, dates } = await load(db);

  console.log(`mode: ${mode}    today: ${today}    boundary: ${STREAK_RULES_START}\n`);

  for (const u of users) {
    const ctx = ctxFor(u, programs, dates);
    if (!ctx.dates.size) continue;
    const name = (u.displayName || u.uid).slice(0, 26);
    const now = streak(ctx, today);

    if (mode === 'analyse') {
      console.log(`${name}   streak now = ${now}`);
      const g = gaps(ctx);
      if (!g.length) { console.log('   no unqualified days before the boundary\n'); continue; }
      for (const w of g) {
        const days = Math.round((new Date(w.to) - new Date(w.from)) / 86400000) + 1;
        const covered = BACKFILL_PLAN.some((p) => (!p.uids || p.uids.includes(u.uid))
          && w.from >= p.from && w.to <= p.to);
        console.log(`   ${w.from} -> ${w.to}  (${days}d, ${weekday(w.from)}…)`
                  + `  ${covered ? 'COVERED by the plan' : 'not covered — stays a break'}`);
      }
      console.log('');
      continue;
    }

    // apply / dry-run
    const existing = u.streakBackfill || [];
    const haveIds = new Set(existing.map((w) => w.id));
    const planned = BACKFILL_PLAN
      .filter((p) => !p.uids || p.uids.includes(u.uid))
      .map((p) => ({ id: `${p.from}_${p.to}`, from: p.from, to: p.to, reason: p.reason }));

    if (GRANDFATHER_ALL) {
      // One window per Hunter: their first session through the day before the
      // boundary. Anchoring at the first session rather than an arbitrary date
      // keeps the walk bounded and means the amnesty cannot reach back further
      // than the account itself.
      const first = [...ctx.dates].sort()[0];
      const last = shift(STREAK_RULES_START, -1);
      if (first && first <= last) {
        planned.push({
          id: `grandfather_${first}_${last}`,
          from: first, to: last, reason: GRANDFATHER_REASON,
        });
      }
    }

    const additions = planned
      .map((w) => ({ ...w, source: 'migrate-streak-backfill', appliedAt: today }))
      .filter((w) => !haveIds.has(w.id));

    const after = streak({ ...ctx, backfill: existing.concat(additions) }, today);
    console.log(`${name}   streak ${now} -> ${after}   `
              + `${additions.length ? `adding ${additions.length} window(s)` : 'already up to date (no-op)'}`);
    for (const w of additions) console.log(`   + ${w.id}`);

    if (mode === 'apply' && additions.length) {
      await db.collection('users').doc(u.uid).update({
        streakBackfill: admin.firestore.FieldValue.arrayUnion(...additions),
      });
      console.log('   written');
    }
  }

  if (mode !== 'apply') console.log('\nnothing written.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
