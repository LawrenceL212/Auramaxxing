/* Shadow World players: the colour and name each Hunter's territories wear on the map.

   The map used to know only four hard-coded uids, so a territory claimed by anyone else
   drew as unclaimed, as if the deploy had failed. This builds the roster from the users
   collection instead: the original four keep their colours, everyone else gets a steady
   colour from their uid and the Hunter name from their profile. Pure; reads nothing. */

export const KNOWN_PLAYERS = {
  'eUtGPwQBcCSO0x3xS3ZGYFGXNIT2': { hex:'#d4a017', name:'Lawrence' },
  'd1W5vTx5aSTIwkR4CIwnO2xW7vf1': { hex:'#7c3aed', name:'LuChing'  },
  'rzcznIkNRrSKVXl74LsTaRSdHOk2': { hex:'#0ea5e9', name:'Lucas'    },
  'oFFi2hATYARhqcSZQlHwlsYBOge2': { hex:'#ff6b9d', name:'Mireyah'  },
};

// Picked to stay readable on the dark map and apart from the four above.
export const PLAYER_PALETTE = ['#22c55e', '#f97316', '#e11d48', '#14b8a6', '#a3e635', '#f43f5e', '#8b5cf6', '#facc15', '#38bdf8', '#fb7185', '#10b981', '#c084fc'];

function hashUid(uid) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return h;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** One player's map entry: { hex, r, g, b, name }. */
export function worldPlayer(uid, user = {}) {
  const known = KNOWN_PLAYERS[uid];
  const hex = known?.hex || PLAYER_PALETTE[hashUid(String(uid)) % PLAYER_PALETTE.length];
  const own = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  const name = (own || known?.name || 'Hunter').slice(0, 24);
  return { hex, ...rgb(hex), name };
}

/** Every Hunter in `users` ([{ uid, displayName, ... }]) keyed by uid, plus the original four. */
export function worldPlayers(users = []) {
  const out = {};
  Object.keys(KNOWN_PLAYERS).forEach(uid => { out[uid] = worldPlayer(uid); });
  (users || []).forEach(u => { if (u && u.uid) out[u.uid] = worldPlayer(u.uid, u); });
  return out;
}
