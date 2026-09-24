// Rythme des combats, espèce par espèce et canne par canne.
// Horloge VIRTUELLE : on avance le temps à la main, sinon mesurer 20 s de combat
// × 7 espèces × 40 essais prendrait une heure — et forcer les à-coups à chaque pas
// (mon premier banc d'essai) rendait le poisson artificiellement invincible.
let NOW = Date.now();
const realNow = Date.now;
Date.now = () => NOW;
globalThis.setTimeout = (fn, ms) => ({ fn, ms });     // aucun minuteur réel ici
globalThis.clearTimeout = () => {};
globalThis.setInterval = () => ({});
globalThis.clearInterval = () => {};

const { FishRoom } = await import('../server/src/fishroom.ts');
const { FISHES, RODS } = await import('../shared/fish.ts');
const ws = () => ({ readyState: 1, send: () => {} });
const N = Number(process.env.N || 40);
const rods = (process.env.RODS || 'bambou,acier,abysse').split(',');
const SEUIL = Number(process.env.SEUIL || 72);        // % de tension où le joueur relâche

for (const rodId of rods) {
  const rod = RODS.find(r => r.id === rodId);
  console.log(`\n=== ${rod.name} (ligne ${rod.lineMax}) ===`);
  for (const f of FISHES) {
    let sortis = 0, pasTotal = 0;
    for (let i = 0; i < N; i++) {
      const r = new FishRoom('X'); const p = r.addPlayer('P', ws());
      r.phase = 'PLAYING'; p.rod = rodId;
      const kg = f.weightMin + Math.random() * (f.weightMax - f.weightMin);
      p.stage = 'FIGHT';
      p.hooked = { fish: f, kg, variant: 'normal', tension: 18, distance: 100,
        stamina: f.stamina, reeling: false, surge: 0, nextSurge: NOW + 500 };
      let pas = 0;
      const limite = 1800;                              // 3 minutes de combat max
      while (p.stage === 'FIGHT' && pas++ < limite) {
        const seuil = SEUIL * (rod.lineMax / 100);
        r.reel(p, p.hooked.tension < seuil);
        r['tick']();
        NOW += 100;
      }
      if (p.bag.length) { sortis++; pasTotal += pas; }
      r.destroy();
    }
    const sec = sortis ? (pasTotal / sortis * 0.1).toFixed(1) : '—';
    const pct = Math.round(100 * sortis / N);
    const flag = pct === 0 ? '   ⚠ INSORTABLE' : pct < 35 ? '   ⚠ très dur' : '';
    console.log(`${f.name.padEnd(16)} ${f.rarity.padEnd(12)} sortis ${String(pct).padStart(3)} %   ${String(sec).padStart(5)} s${flag}`);
  }
}
process.exit(0);
