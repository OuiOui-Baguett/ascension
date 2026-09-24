// Taux de victoire d'une partie complète (5 étages), mesuré sur le vrai moteur.
// Objectif de design : autour de 5 % — le sommet doit rester un exploit atteignable.
let Q = [];
globalThis.setTimeout = (fn, ms = 0) => { const h = { fn, ms }; Q.push(h); return h; };
globalThis.clearTimeout = h => { Q = Q.filter(x => x !== h); };
globalThis.setInterval = () => ({}); globalThis.clearInterval = () => {};
let NOW = Date.now(); Date.now = () => NOW;
const { GameRoom } = await import('../server/src/room.ts');
const { floorAt, betMin, betMax, tollOf, floorFloat } = await import('../shared/content.ts');
const ws = () => ({ readyState: 1, send: () => {} });
function drain(from) {
  for (let k = 0; k < 60; k++) {
    const p = Q.slice(from).sort((a, b) => a.ms - b.ms);
    if (!p.length) return;
    const h = p[0]; Q = Q.filter(x => x !== h); h.fn();
  }
}
const PLAYS = Number(process.env.PLAYS || 45);   // coups jouables par étage de 3 min
const TOLLX = Number(process.env.TOLLX || 0);    // péage d'essai, en multiple du plancher

function playOne(strategy) {
  const r = new GameRoom('W'); const p = r.addPlayer('S', ws());
  r.bank = 1000;
  r.effects = { shield: 0, boost: false, insurance: false, tollCut: 0 };
  for (let floor = 1; floor <= 5; floor++) {
    r.floor = floor; r.phase = 'FLOOR';
    const f = floorAt(floor);
    if (r.bank < floorFloat(f)) r.bank = floorFloat(f);   // avance de la Maison
    const target = TOLLX ? Math.round(TOLLX * floorFloat(f)) : tollOf(f);
    for (let i = 0; i < PLAYS && r.bank < target; i++) {
      const lo = betMin(f), hi = Math.min(betMax(f), r.bank);
      if (hi < lo) break;
      const need = target - r.bank;
      const bet = strategy === 'max' ? hi
        : strategy === 'min' ? lo
        : Math.max(lo, Math.min(hi, Math.round(need / 3)));
      const m = f.machines[i % f.machines.length];
      p.busyMachine = null; p.play = null; r.phase = 'FLOOR';
      const mark = Q.length;
      const opt = { ROULETTE: 'RED', CRAPS: 'SEVEN', CHESTS: '4', RACE: '1' }[m.archetype] ?? '';
      r.bet(p, m.id, bet, opt);
      if (m.archetype === 'CRASH') {
        const c = m.crash; NOW += (Math.log(2) / Math.log(c.growth)) * c.tickMs;
        r.cashout(p); drain(mark); NOW += 1;
      } else if (m.archetype === 'HILO') { r.hiloChoice(p, 'LO'); if (p.play) r.cashout(p); }
      else if (m.archetype === 'BLACKJACK') {
        while (p.play && (p.play.total ?? 0) < 17) r.bjAction(p, 'HIT');
        if (p.play) r.bjAction(p, 'STAND');
      } else if (m.archetype === 'MINES') {
        for (let k = 0; k < 4 && p.play; k++) r.minesPick(p, k);
        if (p.play) r.cashout(p);
      }
      drain(mark);
      if (r.bank <= 0) return { won: false, floor };
    }
    if (r.bank < target) return { won: false, floor };
    r.bank -= target;
    if (r.bank <= 0) return { won: false, floor };
  }
  r.destroy();
  return { won: true, floor: 5 };
}

const N = Number(process.env.N || 2000);
for (const strat of (process.env.STRATS || 'min,need,max').split(',')) {
  let wins = 0; const stuck = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) { const g = playOne(strat); if (g.won) wins++; else stuck[g.floor]++; }
  console.log(`mise ${strat.padEnd(5)} → victoire ${(100 * wins / N).toFixed(1)} % | bloqués é.1/2/3/4/5 : ${stuck.slice(1).map(x => (100 * x / N).toFixed(0) + '%').join(' ')}`);
}
process.exit(0);
