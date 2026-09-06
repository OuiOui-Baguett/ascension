// Vérifie que TOUT l'argent est conservé et que le bilan de chaque joueur
// correspond exactement à ce qu'il a gagné/perdu aux machines.
import { GameRoom } from '../server/src/room.ts';
import { FLOORS } from '../shared/content.ts';

const ws = () => ({ readyState: 1, send: () => {} });
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok:', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const totalMoney = r => r.bank;   // toute la monnaie vit dans la cagnotte commune

let tested = 0;
// --- pour chaque étage, on joue CHAQUE machine et on vérifie la conservation ---
for (const f of FLOORS) {
  const r = new GameRoom('T' + f.index);
  const p = r.addPlayer('A', ws());
  r.start(p);
  r.floor = f.index; r.phase = 'FLOOR';
  r.bank = 1e9;
  const opts = { ROULETTE: 'RED', CRAPS: 'SEVEN', CHESTS: '4' };
  for (const m of f.machines) {
    const before = totalMoney(r), netBefore = p.net, bankBefore = r.bank;
    const bet = Math.max(m.archetype ? 0 : 0, r.serialize().betMin);
    r.bet(p, m.id, bet, opts[m.archetype] ?? '');
    // (un blackjack naturel se résout tout de suite : on ne teste le débit que si la main est en cours)
    if (p.busyMachine) {
      ok(r.bank === bankBefore - bet, `${f.name} / ${m.name} : mise débitée de la cagnotte`);
      ok(p.net === netBefore - bet, `${f.name} / ${m.name} : mise débitée du bilan`);
    }
    // résoudre : crash/hilo/bj demandent une action, les autres se résolvent seuls
    if (m.archetype === 'CRASH') { await wait(120); r.cashout(p); }
    else if (m.archetype === 'HILO') { r.hiloChoice(p, 'LO'); if (p.play) r.cashout(p); }
    else if (m.archetype === 'BLACKJACK') { if (p.play) r.bjAction(p, 'STAND'); }
    else await wait(4200);
    ok(!p.busyMachine, `${f.name} / ${m.name} : machine libérée après le coup`);
    // la variation du bilan == la variation de l'argent total du jeu
    ok(Math.abs((totalMoney(r) - before) - (p.net - netBefore)) < 1,
      `${f.name} / ${m.name} : bilan == variation de cagnotte (${p.net - netBefore})`);
    tested++;
  }
  r.destroy();
}
console.log(`\n${tested} machines testées.\n`);

// --- occupation : un seul joueur à la fois ---
const r2 = new GameRoom('OCC');
const a = r2.addPlayer('A', ws()), b = r2.addPlayer('B', ws());
r2.start(a); r2.phase = 'FLOOR'; r2.bank = 100000;
r2.bet(a, 'roue_ancetres', 100);
const bankB = r2.bank;
r2.bet(b, 'roue_ancetres', 100);
ok(r2.bank === bankB && !b.busyMachine, 'machine occupée : la 2e mise est refusée');
r2.bet(b, 'pierres_scarabees', 100, '2');
ok(b.busyMachine === 'pierres_scarabees', 'B peut jouer sur une AUTRE machine');
await wait(4300);
r2.destroy();

// --- cagnotte : la mise sort et rentre au même endroit ---
const r3 = new GameRoom('BNK');
const c = r3.addPlayer('C', ws());
r3.start(c); r3.phase = 'FLOOR'; r3.bank = 50000;
const b0 = r3.bank;
r3.bet(c, 'roue_ancetres', 500);
ok(r3.bank === b0 - 500 && c.net === -500, 'mise : cagnotte et bilan débités ensemble');
await wait(4200);
ok(r3.bank - b0 === c.net, 'après résolution : cagnotte et bilan bougent du même montant');
r3.bet(c, 'roue_ancetres', 999999);
ok(!c.busyMachine, 'mise supérieure à la cagnotte refusée');
r3.destroy();

// --- boutique : payée en main, effets appliqués ---
const r4 = new GameRoom('SHP');
const d = r4.addPlayer('D', ws());
r4.start(d); r4.floor = 3; r4.phase = 'FLOOR'; r4.bank = 100000;
const price = r4.serialize().shopPrices.carapace;
const w0 = r4.bank;
r4.buy(d, 'carapace');
ok(r4.bank === w0 - price && r4.effects.shield === 3, `carapace achetée sur la cagnotte (-${price})`);
r4.buy(d, 'carapace');
ok(r4.effects.shield === 3, 'objet d’équipe non achetable deux fois');
const tollBefore = r4.toll;
r4.buy(d, 'passe_droit');
ok(r4.toll === Math.round(tollBefore * 0.8), `passe-droit : péage ${tollBefore} → ${r4.toll}`);
r4.buy(d, 'jeton_chance');
ok(d.refunds === 1, 'jeton porte-bonheur en réserve');
// invariant : le jeton n'est consommé QUE sur une perte, et il l'annule entièrement
r4.bank = 100000;
let netB = d.net, bkB = r4.bank;
r4.bet(d, 'geodes', r4.serialize().betMin, '0');
await wait(1700);
const dNet = d.net - netB, mise = r4.serialize().betMin;
// règle : le jeton ne se consomme QUE sur une perte totale, et il l'annule entièrement.
if (d.refunds === 0) ok(dNet === 0, `perte totale : jeton consommé, mise remboursée (bilan ${dNet})`);
else ok(dNet > -mise, `lot encaissé : jeton conservé (bilan ${dNet})`);
ok(Math.abs((r4.bank - bkB) - dNet) < 1, 'cagnotte et bilan restent synchrones avec le jeton');
r4.destroy();

// --- fin d'étage : le péage se prélève sur la cagnotte ---
const r5 = new GameRoom('END');
const e = r5.addPlayer('E', ws());
r5.start(e); r5.phase = 'FLOOR'; r5.bank = 10000;
const before5 = r5.bank;
r5['endFloor']();
ok(r5.bank === before5 - r5.toll || r5.phase === 'FALLING', 'péage prélevé sur la cagnotte');
r5.destroy();

console.log('--- MONEY OK ---');
process.exit(0);
