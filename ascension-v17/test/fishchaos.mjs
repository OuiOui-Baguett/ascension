// Le chaos : arrachage, chute à l'eau, remontée, lignes croisées, vague.
// Horloge virtuelle, comme fishfight : le chaos se mesure, il ne se suppose pas.
let NOW = Date.now();
Date.now = () => NOW;
globalThis.setTimeout = (fn, ms) => ({ fn, ms });
globalThis.clearTimeout = () => {};
globalThis.setInterval = () => ({});
globalThis.clearInterval = () => {};

const { FishRoom } = await import('../server/src/fishroom.ts');
const { FISHES } = await import('../shared/fish.ts');
const ws = () => ({ readyState: 1, send: () => {} });
let ko = 0;
const ok = (c, t) => { console.log((c ? '  ok  ' : '  KO  ') + t); if (!c) ko++; };

const room = (n = 1) => {
  const r = new FishRoom('X');
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(r.addPlayer('J' + (i + 1), ws()));
  r.phase = 'PLAYING';
  return [r, ps];
};
const combat = (p, f, kg) => {
  p.stage = 'FIGHT'; p.dragged = 0;
  p.hooked = { fish: f, kg, variant: 'normal', tension: 18, distance: 100,
    stamina: f.stamina, reeling: false, surge: 0, nextSurge: NOW + 200 };
};
const lourd = FISHES.filter(f => f.weightMin >= 6).sort((a, b) => b.strength - a.strength)[0];
const petit = FISHES.slice().sort((a, b) => a.strength - b.strength)[0];

console.log('\n— ARRACHÉ ET CHUTE —');
{
  const [r, [p]] = room();
  p.x = 0; p.z = -1;                       // sur l'avancée, déjà au-dessus de l'eau
  combat(p, lourd, lourd.weightMax);
  const evs = []; r.broadcastMsg = m => evs.push(m);
  let pas = 0;
  while (p.stage === 'FIGHT' && pas++ < 900) { r['tick'](); NOW += 100; }
  const drags = evs.filter(e => e.kind === 'drag');
  const over = evs.find(e => e.kind === 'overboard');
  ok(drags.length > 0, `${lourd.name} arrache le pêcheur (${drags.length} à-coups)`);
  ok(!!over, 'le pêcheur finit à l’eau quand il n’y a plus de planche');
  ok(p.stage === 'SOAKED', 'état SOAKED, plus de poisson ferré');
  ok(p.hooked === null, 'la prise est perdue');
  // remontée
  NOW = p.soakedUntil + 10;
  r['tick']();
  ok(p.stage === 'IDLE', 'il remonte tout seul après la baignade');
  ok(p.z > -8 && Math.abs(p.x) <= 2.4, `il remonte SUR le ponton (z=${p.z.toFixed(1)})`);
  r.destroy();
}

console.log('\n— UN PETIT POISSON NE DÉPLACE PERSONNE —');
{
  const [r, [p]] = room();
  p.x = 0; p.z = -1; const z0 = p.z;
  combat(p, petit, petit.weightMin);
  const evs = []; r.broadcastMsg = m => evs.push(m);
  let pas = 0;
  while (p.stage === 'FIGHT' && pas++ < 600) { r.reel(p, p.hooked.tension < 60); r['tick'](); NOW += 100; }
  ok(!evs.some(e => e.kind === 'drag'), `${petit.name} ne fait bouger personne`);
  ok(p.z === z0, 'la position n’a pas bougé d’un pouce');
  r.destroy();
}

console.log('\n— LIGNES CROISÉES —');
{
  const [r, [a, b]] = room(2);
  a.x = b.x = 0; a.z = b.z = 8;            // sur la plateforme : pas d'arrachage possible
  combat(a, petit, 1); combat(b, petit, 1);
  const evs = []; r.broadcastMsg = m => evs.push(m);
  for (let i = 0; i < 400; i++) { r.reel(a, false); r.reel(b, false); r['tick'](); NOW += 100; }
  const cross = evs.filter(e => e.kind === 'cross');
  ok(cross.length > 0, `les lignes s’emmêlent (${cross.length} fois en 40 s)`);
  ok(cross.every(e => e.ids.length === 2 && e.ids[0] !== e.ids[1]), 'toujours deux joueurs DIFFÉRENTS');
  r.destroy();
}

console.log('\n— TOUT SEUL, PAS DE CROISEMENT —');
{
  const [r, [p]] = room();
  p.x = 0; p.z = 8;
  combat(p, petit, 1);
  const evs = []; r.broadcastMsg = m => evs.push(m);
  for (let i = 0; i < 400; i++) { r.reel(p, false); r['tick'](); NOW += 100; }
  ok(!evs.some(e => e.kind === 'cross'), 'on ne s’emmêle pas avec soi-même');
  r.destroy();
}

console.log('\n— LA VAGUE —');
{
  const [r, [p]] = room();
  p.x = 0; p.z = -6;
  p.stage = 'WAIT'; p.hooked = { fish: petit, kg: 1 };
  const evs = []; r.broadcastMsg = m => evs.push(m);
  for (let i = 0; i < 1200; i++) { r['tick'](); NOW += 100; }
  const w = evs.filter(e => e.kind === 'wave');
  ok(w.length > 0, `la vague passe (${w.length} fois en 2 min)`);
  ok(p.z > -6, `elle repousse le pêcheur vers la terre (z=${p.z.toFixed(1)})`);
  ok(p.stage === 'IDLE', 'elle fait lâcher la touche en cours');
  r.destroy();
}

console.log('\n— ON NE PÊCHE PAS EN BARBOTANT —');
{
  const [r, [p]] = room();
  p.stage = 'SOAKED'; p.soakedUntil = NOW + 5000;
  let refus = '';
  r.reject = (_p, t) => { refus = t; };
  r.cast(p, 1);
  ok(p.stage === 'SOAKED' && refus.includes('à l’eau'), 'le lancer est refusé, avec un message clair');
  const z0 = p.z; r.move(p, 3, 3);
  ok(p.z === z0, 'et il ne peut pas nager où il veut');
  r.destroy();
}

console.log(ko ? `\n--- ${ko} PROBLÈME(S) ---` : '\n--- CHAOS OK ---');
process.exit(ko ? 1 : 0);
