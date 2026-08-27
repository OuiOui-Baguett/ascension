// Vérifie que TOUT l'argent est conservé et que le bilan de chaque joueur
// correspond exactement à ce qu'il a gagné/perdu aux machines.
import { GameRoom } from '../server/src/room.ts';
import { FLOORS } from '../shared/content.ts';

const ws = () => ({ readyState: 1, send: () => {} });
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok:', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const totalMoney = r => r.bank + [...r.players.values()].reduce((s, p) => s + p.wallet, 0);

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
    r.withdraw(p, 1e6);
    const before = totalMoney(r), netBefore = p.net, walletBefore = p.wallet;
    const bet = Math.max(m.archetype ? 0 : 0, r.serialize().betMin);
    r.bet(p, m.id, bet, opts[m.archetype] ?? '');
    ok(p.wallet === walletBefore - bet, `${f.name} / ${m.name} : mise débitée en main`);
    ok(p.net === netBefore - bet, `${f.name} / ${m.name} : mise débitée du bilan`);
    // résoudre : crash/hilo/bj demandent une action, les autres se résolvent seuls
    if (m.archetype === 'CRASH') { await wait(120); r.cashout(p); }
    else if (m.archetype === 'HILO') { r.hiloChoice(p, 'LO'); if (p.play) r.cashout(p); }
    else if (m.archetype === 'BLACKJACK') { if (p.play) r.bjAction(p, 'STAND'); }
    else await wait(4200);
    ok(!p.busyMachine, `${f.name} / ${m.name} : machine libérée après le coup`);
    // la variation du bilan == la variation de l'argent total du jeu
    ok(Math.abs((totalMoney(r) - before) - (p.net - netBefore)) < 1,
      `${f.name} / ${m.name} : bilan == variation d'argent (${p.net - netBefore})`);
    tested++;
  }
  r.destroy();
}
console.log(`\n${tested} machines testées.\n`);

// --- occupation : un seul joueur à la fois ---
const r2 = new GameRoom('OCC');
const a = r2.addPlayer('A', ws()), b = r2.addPlayer('B', ws());
r2.start(a); r2.phase = 'FLOOR'; r2.bank = 100000;
r2.withdraw(a, 5000); r2.withdraw(b, 5000);
r2.bet(a, 'roue_ancetres', 100);
const bw = b.wallet;
r2.bet(b, 'roue_ancetres', 100);
ok(b.wallet === bw && !b.busyMachine, 'machine occupée : la 2e mise est refusée');
r2.bet(b, 'pierres_scarabees', 100, '2');
ok(b.busyMachine === 'pierres_scarabees', 'B peut jouer sur une AUTRE machine');
await wait(4300);
r2.destroy();

// --- coffre : retraits/dépôts ne touchent PAS le bilan ---
const r3 = new GameRoom('VLT');
const c = r3.addPlayer('C', ws());
r3.start(c); r3.phase = 'FLOOR'; r3.bank = 50000;
const t0 = totalMoney(r3);
r3.withdraw(c, 20000);
ok(c.wallet === 20000 && r3.bank === 30000 && c.net === 0, 'retrait : transfert pur, bilan inchangé');
r3.deposit(c, 5000);
ok(c.wallet === 15000 && r3.bank === 35000 && c.net === 0, 'dépôt partiel : bilan inchangé');
r3.deposit(c);
ok(c.wallet === 0 && r3.bank === 50000 && c.net === 0, 'tout déposer');
ok(totalMoney(r3) === t0, 'aucun argent créé ni détruit par le Coffre');
r3.withdraw(c, 999999);
ok(c.wallet === 0, 'retrait supérieur à la cagnotte refusé');
r3.destroy();

// --- boutique : payée en main, effets appliqués ---
const r4 = new GameRoom('SHP');
const d = r4.addPlayer('D', ws());
r4.start(d); r4.phase = 'FLOOR'; r4.bank = 100000;
r4.withdraw(d, 2000);
const price = r4.serialize().shopPrices.carapace;
const w0 = d.wallet;
r4.buy(d, 'carapace');
ok(d.wallet === w0 - price && r4.effects.shield === 3, `carapace achetée (-${price}, 3 charges)`);
r4.buy(d, 'carapace');
ok(r4.effects.shield === 3, 'objet d’équipe non achetable deux fois');
const tollBefore = r4.toll;
r4.buy(d, 'passe_droit');
ok(r4.toll === Math.round(tollBefore * 0.8), `passe-droit : péage ${tollBefore} → ${r4.toll}`);
r4.buy(d, 'jeton_chance');
ok(d.refunds === 1, 'jeton porte-bonheur en réserve');
// le jeton rembourse la prochaine perte
d.wallet = 10000;
const netB = d.net;
r4.bet(d, 'pierres_scarabees', 100, '0');
await wait(1600);
ok(d.refunds === 0, 'jeton consommé');
r4.destroy();

// --- fin d'étage : les jetons en main rentrent dans la cagnotte ---
const r5 = new GameRoom('END');
const e = r5.addPlayer('E', ws());
r5.start(e); r5.phase = 'FLOOR'; r5.bank = 10000;
r5.withdraw(e, 4000);
const before5 = totalMoney(r5);
r5['endFloor']();
ok(e.wallet === 0, 'fin d’étage : jetons déposés automatiquement');
ok(r5.bank === before5 - r5.toll || r5.phase === 'FALLING', 'péage prélevé sur le total');
r5.destroy();

console.log('--- MONEY OK ---');
process.exit(0);
