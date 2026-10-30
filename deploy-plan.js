/* One-tap deploy: where a number of soldiers goes in one continent, without the map.
   Claims every free territory with one soldier first (capital first), then spreads the
   rest over the Hunter's own territories there, the weakest first. Never targets a
   territory another Hunter holds. Pure; the writes go through the normal deploy path. */

/**
 * @param {object} o
 * @param {string[]} o.ids       territory ids of the continent, e.g. ['na_0', ... 'na_5'] (na_0 is the capital)
 * @param {object}   o.countries gcId -> { ownerUid, soldiers } for the whole world
 * @param {string}   o.uid       the deploying Hunter
 * @param {number}   o.amount    soldiers to place (whole number, capped by the caller at the reserve)
 * @returns {{ gcId: string, amount: number }[]} one entry per territory that gets soldiers
 */
export function autoDeployPlan({ ids = [], countries = {}, uid, amount = 0 }) {
  let left = Math.max(0, Math.floor(Number(amount) || 0));
  if (!left || !uid) return [];
  const add = {};
  const free = ids.filter(id => !countries[id]?.ownerUid);
  const mine = ids.filter(id => countries[id]?.ownerUid === uid);

  free.forEach(id => { if (left > 0) { add[id] = 1; left--; mine.push(id); } });

  if (left > 0 && mine.length) {
    // Level up from the weakest: each soldier goes to the territory with the fewest after adding.
    const total = id => (countries[id]?.soldiers || 0) + (add[id] || 0);
    // At most six territories, so one soldier at a time stays cheap even for a big reserve.
    while (left > 0) {
      const weakest = mine.reduce((a, b) => (total(b) < total(a) ? b : a));
      add[weakest] = (add[weakest] || 0) + 1;
      left--;
    }
  }
  return ids.filter(id => add[id] > 0).map(id => ({ gcId: id, amount: add[id] }));
}

/** What the plan does, in words for the button: "Claims 3 territories, reinforces 2". */
export function describeDeploy(plan, countries = {}, uid) {
  const claims = plan.filter(p => !countries[p.gcId]?.ownerUid).length;
  const reinforce = plan.filter(p => countries[p.gcId]?.ownerUid === uid).length;
  const parts = [];
  if (claims) parts.push(`claims ${claims} ${claims === 1 ? 'territory' : 'territories'}`);
  if (reinforce) parts.push(`reinforces ${reinforce} of yours`);
  return parts.join(', ');
}
