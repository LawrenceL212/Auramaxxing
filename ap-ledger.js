/* =========================================================================
   AP LEDGER — ordering without the composite index

   The admin ledger asks Firestore for `apEvents where uid == X order by
   timestamp desc`. That shape needs a composite index (uid ASC, timestamp
   DESC). Until the index is deployed the query fails with
   `failed-precondition` and the ledger shows nothing at all.

   The fallback reads the same documents with the uid filter alone, which an
   automatic single-field index serves, and orders them here instead. This
   module holds that ordering so it can be tested without a browser.

   Read-only: nothing here writes to Firestore or touches an AP balance.
   ========================================================================= */

export const LEDGER_LIMIT = 50;

// Milliseconds for one event. `timestamp` is a Firestore Timestamp once the
// server has filled it in; a write still pending locally reads as null, so
// fall back to the `date` day string, and then to "now" so a just-written
// event sorts to the top rather than the bottom.
export function apEventMillis(e, now = Date.now()) {
  const ts = e && e.timestamp;
  if (ts) {
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    if (ts instanceof Date) return ts.getTime();
  }
  if (e && typeof e.date === 'string') {
    const d = Date.parse(e.date + 'T00:00:00');
    if (!Number.isNaN(d)) return d;
  }
  return now;
}

// Newest first, capped at `max` — the same result the indexed query returns.
export function newestApEvents(events, max = LEDGER_LIMIT, now = Date.now()) {
  return events
    .map((e, i) => ({ e, i, t: apEventMillis(e, now) }))
    .sort((a, b) => (b.t - a.t) || (a.i - b.i))
    .slice(0, max)
    .map(x => x.e);
}

// True when an error means "this query needs an index that isn't deployed".
export function isMissingIndexError(err) {
  return !!err && (err.code === 'failed-precondition' || /requires an index/i.test(err.message || ''));
}
