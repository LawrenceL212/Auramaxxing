/* Tests for the Shadow World player roster.  Run:  node test/world-players.test.mjs */

import { worldPlayer, worldPlayers, KNOWN_PLAYERS, PLAYER_PALETTE } from '../world-players.js';

let pass = 0, fail = 0;
const results = [];

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
}

const ADMIN = 'eUtGPwQBcCSO0x3xS3ZGYFGXNIT2';

check('1. a known Hunter keeps their colour',
  worldPlayer(ADMIN).hex, KNOWN_PLAYERS[ADMIN].hex);
check('2. rgb matches the hex',
  (({ r, g, b }) => [r, g, b])(worldPlayer(ADMIN)), [212, 160, 23]);
check('3. profile name wins over the hard-coded one',
  worldPlayer(ADMIN, { displayName: 'Enzo' }).name, 'Enzo');

const stranger = worldPlayer('newUid123', { displayName: '  Lucho ' });
check('4. a new Hunter gets a palette colour', PLAYER_PALETTE.includes(stranger.hex), true);
check('5. a new Hunter gets their own name, trimmed', stranger.name, 'Lucho');
check('6. the colour is steady for the same uid',
  worldPlayer('newUid123').hex, stranger.hex);
check('7. no name falls back to Hunter', worldPlayer('x').name, 'Hunter');

const roster = worldPlayers([{ uid: 'newUid123', displayName: 'Lucho' }, { displayName: 'no uid' }, null]);
check('8. the roster has the four originals plus every user', Object.keys(roster).length, 5);
check('9. the roster entry for a new Hunter', roster.newUid123.name, 'Lucho');
check('10. empty input still gives the originals', Object.keys(worldPlayers()).length, 4);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
