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

// --- roulette (étage 2) : choix obligatoire, débit, résolution ---
const r5 = new GameRoom('T5');
const q5 = r5.addPlayer('R', fakeWs());
r5.start(q5);
r5.floor = 2; r5.phase = 'FLOOR'; r5.bank = 20_000;
r5.bet(q5, 'roulette_marees', 1000); // sans couleur → rejeté
assert(r5.bank === 20_000, 'roulette : mise sans couleur rejetée');
r5.bet(q5, 'roulette_marees', 1000, 'RED');
assert(r5.bank === 19_000 && q5.spinPending, 'roulette : mise débitée, bille lancée');
await wait(3900);
assert(!q5.spinPending, 'roulette : résolue après le spin');
r5.destroy();

// --- craps (étage 3) ---
const r6 = new GameRoom('T6');
const q6 = r6.addPlayer('C', fakeWs());
r6.start(q6);
r6.floor = 3; r6.phase = 'FLOOR'; r6.bank = 2_000_000;
r6.bet(q6, 'des_braise', 10_000, 'SEVEN');
assert(r6.bank === 1_990_000 && q6.spinPending, 'craps : mise débitée, dés lancés');
await wait(2600);
assert(!q6.spinPending, 'craps : résolu après le lancer');
r6.destroy();

// --- blackjack (étage 2) : main démarrée puis résolue au stand ---
const r7 = new GameRoom('T7');
const q7 = r7.addPlayer('B', fakeWs());
r7.start(q7);
r7.floor = 2; r7.phase = 'FLOOR'; r7.bank = 20_000;
r7.bet(q7, 'bj_epave', 1000);
assert(r7.bank === 19_000, 'blackjack : mise débitée');
if (q7.play) {
  assert(q7.play.kind === 'BJ' && q7.play.total >= 4, `blackjack : main servie (${q7.play.total} vs ${q7.play.dealerCard})`);
  r7.bjAction(q7, 'STAND');
}
assert(q7.play === null, 'blackjack : main résolue (stand ou naturel)');
r7.destroy();

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
