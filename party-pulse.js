/* =========================================================================
   PARTY PULSE

   Who in the party has trained today, when each Hunter last trained, and
   what the party has done this week, read from the workouts already loaded.
   Reads only: no stored data is created or changed.

   Pure, so test/party-pulse.test.mjs exercises it without a browser.
   ========================================================================= */

function shift(date, n) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

/** One entry per Hunter, the signed-in Hunter first, then by most recent session. */
export function partyPulse(users, workouts, today, meUid, weekStart) {
  const rows = (users || []).map(u => {
    const mine = (workouts || []).filter(w => w && w.uid === u.uid && w.date && w.date <= today);
    const last = mine.reduce((m, w) => (w.date > m ? w.date : m), '');
    return {
      uid: u.uid,
      name: u.displayName || 'Hunter',
      isMe: u.uid === meUid,
      trainedToday: mine.some(w => w.date === today),
      lastDate: last || null,
      daysAgo: last ? daysBetween(last, today) : null,
      weekSessions: mine.filter(w => w.date >= weekStart).length,
    };
  });
  return rows.sort((a, b) => (b.isMe - a.isMe) || ((b.lastDate || '').localeCompare(a.lastDate || '')) || a.name.localeCompare(b.name));
}

/** The one line under the avatars. */
export function pulseSummary(rows) {
  const n = rows.length;
  if (!n) return '';
  const done = rows.filter(r => r.trainedToday);
  if (n === 1) return done.length ? 'You have trained today.' : 'You have not trained today.';
  if (done.length === n) return 'The whole party has trained today.';
  if (!done.length) return 'Nobody has trained yet today. Be the first.';
  const me = rows.find(r => r.isMe);
  const others = done.filter(r => !r.isMe);
  if (me && !me.trainedToday) {
    const who = others.length === 1 ? others[0].name : `${others.length} hunters`;
    return `${who} ${others.length === 1 ? 'has' : 'have'} trained today. You're next.`;
  }
  return `${done.length} of ${n} hunters have trained today.`;
}

/** "today", "yesterday", "3d ago", "2w ago", or "no sessions yet". */
export function agoLabel(daysAgo) {
  if (daysAgo == null) return 'no sessions yet';
  if (daysAgo <= 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo < 14) return `${daysAgo}d ago`;
  return `${Math.round(daysAgo / 7)}w ago`;
}

export { shift };
