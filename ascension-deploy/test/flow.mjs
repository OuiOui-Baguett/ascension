// Test déterministe : péages → shop → ascension → victoire ; slots ; hi-lo ; assurance.
import { GameRoom } from '../server/src/room.ts';

const fakeWs = () => ({ readyState: 1, send: () => {} });
const assert = (c, msg) => { if (!c) { console.error('FAIL:', msg); process.exit(1); } console.log('ok:', msg); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// --- montée complète ---
const room = new GameRoom('TEST');
const p = room.addPlayer('Testeur', fakeWs());
room.start(p);
for (let f = 1; f <= 5; f++) {
  assert(room.floor === f, `étage ${f} atteint (banque ${room.bank})`);
  room.bank = 10_000_000_000;
  room['resolveFloor']();
  if (f < 5) {
    assert(room.phase === 'SHOP', `shop ouvert après péage étage ${f}`);
    const price = room.offers[0].price;
    const before = room.bank;
    room.buy(p, room.offers[0].itemId);
    assert(room.bank === before - price, 'achat débité');
    room['gotoFloor'](f + 1);
  }
}
assert(room.phase === 'VICTORY', 'VICTOIRE après le péage de l’étage 5');
room.destroy();

// --- slots : résolution différée ---
const r3 = new GameRoom('T3');
const q3 = r3.addPlayer('S', fakeWs());
r3.start(q3);
r3.phase = 'FLOOR';
r3.bank = 1000;
r3.bet(q3, 'totem_bavard', 100);
assert(r3.bank === 900, 'slots : mise débitée immédiatement');
assert(q3.spinPending === true, 'slots : rouleaux en rotation');
await wait(3300);
assert(q3.spinPending === false, 'slots : résolu après le spin');
assert(r3.bank >= 900 || r3.bank === 900, `slots : banque cohérente (${r3.bank})`);
r3.destroy();

// --- hi-lo : mise rendue si on repose les cartes sans jouer ---
const r4 = new GameRoom('T4');
const q4 = r4.addPlayer('H', fakeWs());
r4.start(q4);
r4.phase = 'FLOOR';
r4.bank = 1000;
r4.bet(q4, 'cartes_chaman', 100);
assert(r4.bank === 900 && q4.play?.kind === 'HILO', 'hi-lo : partie démarrée');
r4.cashout(q4);
assert(r4.bank === 1000 && q4.play === null, 'hi-lo : mise rendue sans carte jouée');
// et un choix forcé impossible est rejeté proprement
r4.bet(q4, 'cartes_chaman', 100);
q4.play.card = 13;
r4.hiloChoice(q4, 'HI'); // impossible → rejet, la partie continue
assert(q4.play?.kind === 'HILO', 'hi-lo : choix impossible rejeté sans casser la partie');
r4.hiloChoice(q4, 'LO'); // 12/13 de réussite : accepté quoi qu'il arrive
assert(q4.play === null || q4.play.steps === 1, 'hi-lo : choix valide résolu');
r4.destroy();

// --- chute + assurance ---
const r2 = new GameRoom('T2');
const q2 = r2.addPlayer('X', fakeWs());
r2.start(q2);
r2.bank = 50_000;
r2.effects.insurance = true;
r2['fall']('test');
await wait(1100);
assert(r2.floor === 1 && r2.bank === 15_000, `assurance : 30 % conservés (${r2.bank})`);
r2.destroy();

console.log('--- FLOW OK ---');
process.exit(0);
