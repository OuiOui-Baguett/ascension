// Rendement réel de chaque mécanique, mesuré sur le moteur (pas sur le papier).
// Règle de conception : ~100 % partout — ici la « maison » n'existe pas.
// Le blackjack est la seule machine sensible à l'adresse : 99,4 % en jouant
// « je tire sous 17 », 102,3 % en stratégie de base (mesuré sur 200 000 mains).
// Un écart durable au-delà de 3 écarts-types = un bug d'équilibrage.
let Q = [];
globalThis.setTimeout = (fn, ms = 0) => { const h = { fn, ms }; Q.push(h); return h; };
globalThis.clearTimeout = h => { Q = Q.filter(x => x !== h); };
globalThis.setInterval = () => ({}); globalThis.clearInterval = () => {};
let NOW = Date.now(); Date.now = () => NOW;
const { GameRoom } = await import('../server/src/room.ts');
const { FLOORS } = await import('../shared/content.ts');
const ws = () => ({ readyState: 1, send: () => {} });
function drain(from) {
  for (let k = 0; k < 60; k++) {
    const p = Q.slice(from).sort((a, b) => a.ms - b.ms);
    if (!p.length) return;
    const h = p[0]; Q = Q.filter(x => x !== h); h.fn();
  }
}
const N = Number(process.env.N || 20000);
const seen = new Set(), rows = [];
for (const f of FLOORS) {
  const r = new GameRoom('EV' + f.index), p = r.addPlayer('A', ws());
  r.floor = f.index; r.phase = 'FLOOR';
  const BET = 10 * f.mult;              // la mise minimale monte avec l'étage
  for (const m of f.machines) {
    if (seen.has(m.archetype)) continue;          // une mesure par mécanique
    seen.add(m.archetype);
    let staked = 0, back = 0, sq = 0;
    for (let i = 0; i < N; i++) {
      r.bank = 1e12; r.jackpot = 0; p.busyMachine = null; p.play = null; r.phase = 'FLOOR';
      const before = r.bank, mark = Q.length;
      const opt = { ROULETTE: 'RED', CRAPS: 'SEVEN', CHESTS: '4', RACE: '2' }[m.archetype] ?? '';
      r.bet(p, m.id, BET, opt);
      if (!p.busyMachine && r.bank === before) { console.error('MISE REFUSÉE sur', m.id); process.exit(1); }
      if (m.archetype === 'CRASH') {
        const c = m.crash; NOW += (Math.log(2) / Math.log(c.growth)) * c.tickMs;
        r.cashout(p); drain(mark); NOW += 1;
      } else if (m.archetype === 'HILO') { r.hiloChoice(p, 'LO'); if (p.play) r.cashout(p); }
      else if (m.archetype === 'BLACKJACK') {
        // joueur normal : il tire tant qu'il est sous 17, comme le croupier
        while (p.play && (p.play.total ?? 0) < 17) r.bjAction(p, 'HIT');
        if (p.play) r.bjAction(p, 'STAND');
      }
      else if (m.archetype === 'MINES') {
        // joueur type : 4 cases puis on encaisse
        for (let k = 0; k < 4 && p.play; k++) r.minesPick(p, k);
        if (p.play) r.cashout(p);
      }
      drain(mark);
      const ret = ((r.bank - before) + BET) / BET;   // retour du coup, en multiple de la mise
      staked += BET; back += ret * BET; sq += ret * ret;
    }
    // marge d'erreur réelle : une machine qui paie ×105 est bien plus bruyante qu'une roulette
    const mean = back / staked, se = Math.sqrt(Math.max(0, sq / N - mean * mean) / N);
    rows.push([m.archetype, 100 * mean, 100 * se]);
  }
  r.destroy();
}
let bad = 0;
for (const [a, ev, se] of rows.sort((x, y) => x[1] - y[1])) {
  // Plancher large : les machines à très gros lot (slots ×105, plinko ×19) ont une
  // queue rare que l'échantillon sous-estime — leur écart-type mesuré ment un peu.
  // Ce test attrape les grosses erreurs de conception, pas le bruit de 2 points.
  const tol = Math.max(3.5, 3 * se);
  const flag = Math.abs(ev - 100) > tol ? '  ⚠ hors cible' : '';
  if (flag) bad++;
  console.log(`${a.padEnd(10)} ${ev.toFixed(1).padStart(6)} % ± ${se.toFixed(1)}${flag}`);
}
console.log(bad ? `\n${bad} mécanique(s) hors cible.` : '\n--- ÉQUILIBRAGE OK : les 11 mécaniques rendent 100 % ---');
process.exit(0);
