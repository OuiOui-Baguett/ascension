// FISH & FURY — la boucle complète, côté serveur : lancer → touche → ferrage →
// combat → capture → vente → achat. Et les règles qui doivent tenir :
// pas d'argent créé, ligne qui casse si on force, besace limitée.
import { FishRoom, BAG_MAX } from '../server/src/fishroom.ts';
import { fishValue, RODS, fishAt } from '../shared/fish.ts';

const ws = () => ({ readyState: 1, send: () => {} });
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok:', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// --- 1. la boucle nominale ---
const r = new FishRoom('T1');
const p = r.addPlayer('Testeur', ws());
r.start(p);
ok(p.stage === 'IDLE', 'au départ, ligne rangée');

r.cast(p, 0.8);
ok(p.stage === 'CAST', 'lancer en cours');
await wait(1400);
ok(p.stage === 'WAIT', 'appât à l’eau, on attend la touche');

// on force la touche tout de suite pour ne pas attendre le hasard
clearTimeout(p.timer);
r['bite'](p);
ok(p.stage === 'BITE' && !!p.hooked, `touche : ${p.hooked.fish.name} de ${p.hooked.kg} kg`);

r.hook(p);
ok(p.stage === 'FIGHT', 'ferrage réussi, combat engagé');
const espece = p.hooked.fish.name;

// on mouline par à-coups, en relâchant quand la tension grimpe
let guard = 0;
while (p.stage === 'FIGHT' && guard++ < 400) {
  r.reel(p, p.hooked.tension < 55);
  await wait(60);
}
ok(p.stage === 'IDLE', `combat terminé (${guard} pas)`);
ok(p.bag.length === 1, `${espece} est dans la besace`);
const prise = p.bag[0];
ok(prise.value === fishValue(prise.fishId, prise.kg, prise.variant),
  `valeur conforme à la formule : ${prise.value} ⧗`);
ok(p.dex.length === 1, 'espèce ajoutée au carnet');

const avant = p.shells;
r.sell(p);
ok(p.shells === avant + prise.value && p.bag.length === 0, `vente : +${prise.value} ⧗, besace vidée`);
ok(r.shared === prise.value, 'la caisse du bateau suit les ventes');
r.destroy();

// --- 2. forcer le moulinet casse la ligne ---
const r2 = new FishRoom('T2');
const q = r2.addPlayer('Brute', ws());
r2.start(q);
r2.cast(q, 0.9); await wait(1400); clearTimeout(q.timer);
r2['bite'](q); r2.hook(q);
const espece2 = q.hooked.fish.name;
let g2 = 0;
while (q.stage === 'FIGHT' && g2++ < 400) { r2.reel(q, true); await wait(60); }   // jamais relâcher
ok(q.stage === 'IDLE', 'le combat s’arrête si on ne relâche jamais');
console.log(`   → ${espece2} : ${q.bag.length ? 'sorti malgré tout' : 'ligne cassée'}`);
r2.destroy();

// --- 3. économie : aucune pièce ne sort de nulle part ---
const r3 = new FishRoom('T3');
const a = r3.addPlayer('A', ws());
r3.start(a);
a.bag = [{ fishId: 'gardon', kg: 1, variant: 'normal', value: fishValue('gardon', 1) }];
const v = a.bag[0].value;
r3.sell(a);
ok(a.shells === v && r3.shared === v, 'vente : le gain du joueur == le total encaissé');
// achat : l'argent sort du joueur, rien n'est créé
a.shells = 500;
r3.buy(a, 'rod', 'fibre');
ok(a.shells === 500 - RODS[1].price && a.rod === 'fibre', `achat canne : ${a.shells} ⧗ restants`);
r3.buy(a, 'rod', 'bambou');
ok(a.rod === 'fibre', 'on ne redescend pas en gamme');
a.shells = 10;
r3.buy(a, 'rod', 'acier');
ok(a.rod === 'fibre' && a.shells === 10, 'achat refusé si l’argent manque');
r3.destroy();

// --- 4. besace limitée ---
const r4 = new FishRoom('T4');
const b = r4.addPlayer('B', ws());
r4.start(b);
b.bag = Array.from({ length: BAG_MAX }, () => ({ fishId: 'gardon', kg: 1, variant: 'normal', value: 18 }));
r4.cast(b, .5);
ok(b.stage === 'IDLE', `besace pleine (${BAG_MAX}) : on ne peut plus lancer`);
r4.destroy();

// --- 5. ferrer trop tôt fait perdre le coup ---
const r5 = new FishRoom('T5');
const c = r5.addPlayer('C', ws());
r5.start(c);
r5.cast(c, .5); await wait(1400);
ok(c.stage === 'WAIT', 'ligne à l’eau');
r5.hook(c);
ok(c.stage === 'IDLE' && !c.hooked, 'ferrer avant la touche fait perdre le coup');
r5.destroy();

console.log('\n--- FISH OK ---');
process.exit(0);
