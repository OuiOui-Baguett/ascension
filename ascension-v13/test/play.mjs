// Parcours : accueil machine → bouton JOUER → mise ; slots ; géodes ; scores dépliables.
// ⚠ à lancer sur un serveur à vitesse NORMALE (sans SPEED) : avec SPEED=10 l'étage
// ne dure que 18 s et la partie tombe au milieu du parcours.
import { chromium } from 'playwright';
const errs = [];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errs.push('JS: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('C: ' + m.text()); });
const shot = n => page.screenshot({ path: `/tmp/q-${n}.png` });
const walk = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

// pilote : marche vers une position connue, en lisant la position réelle du joueur.
// On repasse toujours par le couloir dégagé (z ≈ 1) avant de viser la machine :
// les machines sont des obstacles solides, un trajet en diagonale s'y coince.
const SPOTS = { Roue: [-11.08, -3.08], Pierres: [-8.09, -8.18], Totem: [2.96, -11.11], Fourmis: [8.09, -8.18], Capybaras: [11.08, -3.08] };
const pos = () => page.evaluate(() => window.__pos && window.__pos());
async function step(dx, dz) {
  if (Math.abs(dx) > 0.5) await walk(dx > 0 ? 'ArrowRight' : 'ArrowLeft', Math.min(650, Math.abs(dx) * 210));
  if (Math.abs(dz) > 0.5) await walk(dz > 0 ? 'ArrowDown' : 'ArrowUp', Math.min(650, Math.abs(dz) * 210));
  await page.waitForTimeout(150);
}
async function goTo(fragment) {
  const [tx, tz] = SPOTS[fragment];
  for (const [wx, wz, near] of [[null, 1.5, 0.8], [tx, 1.5, 0.8], [tx, tz, 2.4]]) {
    for (let i = 0; i < 20; i++) {
      const p = await pos();
      if (!p) { await page.waitForTimeout(200); continue; }
      const dx = wx === null ? 0 : wx - p.x, dz = wz - p.z;
      if (Math.hypot(dx, dz) < near) break;
      await step(dx, dz);
    }
  }
  await page.waitForTimeout(360);
  const btn = await page.$('#openmachine');
  if (!btn) return false;
  const txt = await page.textContent('.minfo b');
  return !!(txt && txt.includes(fragment));
}

await page.goto('http://localhost:2567');
await page.fill('#name', 'QUENTIN');
await page.click('.ht[data-h="3"]');
await page.click('#create');
await page.waitForSelector('.code');
await page.click('#start');
await page.waitForSelector('.top', { timeout: 20000 });
await page.waitForTimeout(500);

// --- machine 1 (roue, haut-gauche) : la fiche doit s'afficher SANS lancer le jeu
await goTo('Roue');
await shot('fiche');
if (!(await page.$('#openmachine'))) errs.push('pas de bouton JOUER à l’approche');
if (await page.$('#betin')) errs.push('la mise s’ouvre sans appui volontaire');
await page.click('#openmachine');
await page.waitForTimeout(300);
await shot('mise');
if (!(await page.$('#betin'))) errs.push('mise indisponible après JOUER');
await page.click('#go');
await page.waitForTimeout(4300);

// --- machine à sous (index 3 du 1er étage : bas-droite)
const found2 = await goTo('Totem');
const om2 = found2 ? await page.$('#openmachine') : null;
if (om2) {
  await om2.click(); await page.waitForTimeout(300);
  const t = await page.textContent('#ui');
  if (!t.includes('LANCER')) errs.push('bouton LANCER absent sur les slots : ' + t.slice(0, 60));
  await page.click('#go');
  await page.waitForTimeout(1200); await shot('slots-spin');
  await page.waitForTimeout(2400); await shot('slots-fin');
} else { await shot('slots-miss'); errs.push('machine à sous non atteinte'); }

// --- géodes / caisses (index 1 : haut-milieu-gauche)
const found3 = await goTo('Pierres');
const om3 = found3 ? await page.$('#openmachine') : null;
if (om3) {
  await om3.click(); await page.waitForTimeout(300); await shot('caisses-ui');
  const cells = await page.$$('.cell');
  if (cells.length !== 9) errs.push('grille de caisses incomplète : ' + cells.length);
  else { await cells[4].click(); await page.waitForTimeout(2000); await shot('caisses-open'); }
} else { await shot('caisses-miss'); errs.push('caisses non atteintes'); }

// --- MINES : grille de 25, cases sûres, encaissement
const found4 = await goTo('Fourmis');
const om4 = found4 ? await page.$('#openmachine') : null;
if (om4) {
  await om4.click(); await page.waitForTimeout(300);
  await page.click('#go'); await page.waitForTimeout(700);
  const n = (await page.$$('.mcell')).length;
  if (n !== 25) errs.push('grille de mines incomplète : ' + n);
  // l'interface se reconstruit à chaque case : on re-cible à chaque tour
  for (let k = 0; k < 3; k++) {
    const c = await page.$('.mcell:not(.safe)');
    if (!c || !(await page.$('#mcash'))) break;
    await c.click(); await page.waitForTimeout(550);
  }
  await shot('mines');
  if (await page.$('#mcash')) { await page.click('#mcash'); await page.waitForTimeout(900); }
} else { await shot('mines-miss'); errs.push('mines non atteintes'); }

// --- COURSE : 4 partants avec leurs cotes
const found5 = await goTo('Capybaras');
const om5 = found5 ? await page.$('#openmachine') : null;
if (om5) {
  await om5.click(); await page.waitForTimeout(300);
  const rn = await page.$$('.rn');
  if (rn.length !== 4) errs.push('partants manquants : ' + rn.length);
  else { await rn[1].click(); await page.waitForTimeout(1800); await shot('course'); await page.waitForTimeout(3200); }
} else { await shot('course-miss'); errs.push('course non atteinte'); }

// --- scores dépliables
await page.click('#side');
await page.waitForTimeout(300);
await shot('scores');
const st = await page.textContent('#side');
if (!/misé|gagné/.test(st || '')) errs.push('détail des scores absent après appui');

console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- PARCOURS OK ---');
await b.close();
process.exit(errs.length ? 1 : 0);
