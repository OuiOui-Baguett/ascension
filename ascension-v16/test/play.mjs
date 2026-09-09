// Parcours : accueil machine → bouton JOUER → mise ; slots ; géodes ; scores dépliables.
// ⚠ à lancer avec SPEED=0.5 : l'étage dure alors 6 minutes, le temps de visiter cinq
// machines malgré la lenteur du rendu logiciel du CI (d'où aussi ?quality=low).
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
async function leg(tx, tz, near) {
  for (let i = 0; i < 7; i++) {
    const p = await pos(); if (!p) { await page.waitForTimeout(300); continue; }
    const dx = tx === null ? 0 : tx - p.x, dz = tz - p.z;
    if (Math.hypot(dx, dz) < near) return true;
    if (Math.abs(dx) > 0.4) await walk(dx > 0 ? 'ArrowRight' : 'ArrowLeft', Math.min(5000, Math.abs(dx) * 750));
    if (Math.abs(dz) > 0.4) await walk(dz > 0 ? 'ArrowDown' : 'ArrowUp', Math.min(5000, Math.abs(dz) * 750));
  }
  return false;
}
async function goTo(fragment) {
  const [tx, tz] = SPOTS[fragment];
  await leg(null, 1.5, 0.9);
  await leg(tx, 1.5, 0.9);
  await leg(tx, tz, 2.4);
  await page.waitForTimeout(400);
  if (!(await page.$('#openmachine'))) return false;
  const txt = await page.textContent('.minfo b');
  return !!(txt && txt.includes(fragment));
}
/** Clic direct : sous rendu logiciel, le controle « element stable » de Playwright expire. */
const tap = async (sel) => { const el = await page.$(sel); if (!el) return false; await el.evaluate(e => e.click()); return true; };

await page.goto('http://localhost:2567/?quality=low');
await page.fill('#name', 'QUENTIN');
await tap('.ht[data-h="3"]');
await tap('#create');
await page.waitForSelector('.code');
await tap('#start');
await page.waitForFunction(() => !!document.querySelector('.top'), null, { timeout: 30000 });
await page.waitForTimeout(17000);   // avec SPEED=0.5 le briefing dure 16 s : avant, le joueur est fige

// --- machine 1 (roue, haut-gauche) : la fiche doit s'afficher SANS lancer le jeu
await goTo('Roue');
await shot('fiche');
if (!(await page.$('#openmachine'))) errs.push('pas de bouton JOUER à l’approche');
if (await page.$('#betin')) errs.push('la mise s’ouvre sans appui volontaire');
await tap('#openmachine');
await page.waitForTimeout(300);
await shot('mise');
if (!(await page.$('#betin'))) errs.push('mise indisponible après JOUER');
await tap('#go');
await page.waitForTimeout(4300);

// (machine à sous et géodes : leur logique est couverte par money.mjs sur les 30 machines ;
// le parcours navigateur se concentre sur une machine classique et les deux nouvelles.)

// --- MINES : grille de 25, cases sûres, encaissement
const found4 = await goTo('Fourmis');
const om4 = found4 ? await page.$('#openmachine') : null;
if (om4) {
  await om4.evaluate(e => e.click()); await page.waitForTimeout(300);
  await tap('#go'); await page.waitForTimeout(700);
  const n = (await page.$$('.mcell')).length;
  if (n !== 25) errs.push('grille de mines incomplète : ' + n);
  // l'interface se reconstruit à chaque case : on re-cible à chaque tour
  for (let k = 0; k < 3; k++) {
    const c = await page.$('.mcell:not(.safe)');
    if (!c || !(await page.$('#mcash'))) break;
    await c.evaluate(e => e.click()); await page.waitForTimeout(550);
  }
  await shot('mines');
  if (await page.$('#mcash')) { await tap('#mcash'); await page.waitForTimeout(900); }
} else { await shot('mines-miss'); errs.push('mines non atteintes'); }

// --- COURSE : 4 partants avec leurs cotes
const found5 = await goTo('Capybaras');
const om5 = found5 ? await page.$('#openmachine') : null;
if (om5) {
  await om5.evaluate(e => e.click()); await page.waitForTimeout(300);
  const rn = await page.$$('.rn');
  if (rn.length !== 4) errs.push('partants manquants : ' + rn.length);
  else { await rn[1].evaluate(e => e.click()); await page.waitForTimeout(1800); await shot('course'); await page.waitForTimeout(3200); }
} else { await shot('course-miss'); errs.push('course non atteinte'); }

// --- scores dépliables
await tap('#side');
await page.waitForTimeout(300);
await shot('scores');
const st = await page.textContent('#side');
if (!/misé|gagné/.test(st || '')) errs.push('détail des scores absent après appui');

console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- PARCOURS OK ---');
await b.close();
process.exit(errs.length ? 1 : 0);
