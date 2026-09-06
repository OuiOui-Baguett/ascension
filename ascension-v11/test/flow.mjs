// Machine à états : montée des 5 étages, ascenseur, chute, assurance.
import { GameRoom } from '../server/src/room.ts';

const ws = () => ({ readyState: 1, send: () => {} });
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok:', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// --- montée complète jusqu'à la victoire ---
const room = new GameRoom('TEST');
const p = room.addPlayer('Testeur', ws());
room.start(p);
// il faut avoir joué pour figurer au palmarès : on mise une fois
room.phase = 'FLOOR'; room.bank = 50_000;
room.bet(p, 'roue_ancetres', 100);
await wait(4200);
for (let f = 1; f <= 5; f++) {
  ok(room.floor === f, `étage ${f} atteint (cagnotte ${room.bank})`);
  room.bank = 10_000_000_000;
  room['resolveFloor']();
  if (f < 5) {
    ok(room.phase === 'ELEVATOR', `ascenseur après le péage de l'étage ${f}`);
    room['gotoFloor'](f + 1);          // on n'attend pas le timer
  }
}
ok(room.phase === 'VICTORY', 'VICTOIRE après le péage de l’étage 5');
ok(room.awards().length > 0, 'palmarès décerné à la victoire');
room.destroy();

// --- la boutique vit dans le casino, pas dans une phase dédiée ---
const r2 = new GameRoom('SHOP');
const q = r2.addPlayer('Acheteur', ws());
r2.start(q); r2.phase = 'FLOOR'; r2.bank = 100000;
const before = r2.bank;
r2.buy(q, 'carapace');
ok(r2.bank < before && r2.effects.shield === 3, 'achat possible pendant l’étage');
r2.phase = 'ELEVATOR';
const during = r2.bank;
r2.buy(q, 'fruit_dore');
ok(r2.bank === during, 'achat refusé hors de la phase de jeu');
r2.destroy();

// --- ascenseur appelé à la main quand le péage est couvert ---
const r3 = new GameRoom('ELEV');
const e = r3.addPlayer('E', ws());
r3.start(e); r3.phase = 'FLOOR'; r3.bank = 100;
r3.elevator(e);
ok(r3.phase === 'FLOOR', 'ascenseur refusé si le péage n’est pas couvert');
r3.bank = r3.toll + 500;
r3.elevator(e);
ok(r3.phase === 'ELEVATOR', 'ascenseur appelé une fois le péage atteint');
r3.destroy();

// --- chute + assurance ---
const r4 = new GameRoom('FALL');
const x = r4.addPlayer('X', ws());
r4.start(x);
r4.phase = 'FLOOR'; r4.bank = 50_000;
r4.bet(x, 'roue_ancetres', 100);
await wait(4200);
r4.bank = 50_000;
r4.effects.insurance = true;
r4['fall']('test');
ok(r4.awards().length > 0, 'palmarès décerné à la chute');
await wait(1100);
ok(r4.floor === 1 && r4.bank === 15_000, `assurance : 30 % conservés (${r4.bank})`);
r4.destroy();

console.log('--- FLOW OK ---');
process.exit(0);
