// Parcours : accueil machine → bouton JOUER → mise ; slots ; géodes ; scores dépliables.
import { chromium } from 'playwright';
const errs = [];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errs.push('JS: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('C: ' + m.text()); });
const shot = n => page.screenshot({ path: `/tmp/q-${n}.png` });
const walk = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

// pilote : se déplace jusqu'à ce que la fiche de la machine voulue apparaisse
async function goTo(fragment, moves) {
  for (const [key, ms] of moves) {
    await walk(key, ms);
    await page.waitForTimeout(320);
    const btn = await page.$('#openmachine');
    if (btn) {
      const txt = await page.textContent('.minfo b');
      if (txt && txt.includes(fragment)) return true;
    }
  }
  return false;
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
await goTo('Roue', [['ArrowUp', 1300], ['ArrowLeft', 1300], ['ArrowLeft', 300], ['ArrowUp', 250]]);
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
const found2 = await goTo('Totem', [['ArrowDown', 700], ['ArrowRight', 1500], ['ArrowRight', 900],
  ['ArrowRight', 600], ['ArrowUp', 400], ['ArrowRight', 400], ['ArrowUp', 300]]);
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
const found3 = await goTo('Pierres', [['ArrowDown', 500], ['ArrowLeft', 1500], ['ArrowLeft', 900],
  ['ArrowLeft', 600], ['ArrowUp', 700], ['ArrowUp', 400], ['ArrowLeft', 400],
  ['ArrowUp', 300], ['ArrowRight', 700], ['ArrowUp', 500], ['ArrowRight', 350],
  ['ArrowUp', 300], ['ArrowRight', 300]]);
const om3 = found3 ? await page.$('#openmachine') : null;
if (om3) {
  await om3.click(); await page.waitForTimeout(300); await shot('caisses-ui');
  const cells = await page.$$('.cell');
  if (cells.length !== 9) errs.push('grille de caisses incomplète : ' + cells.length);
  else { await cells[4].click(); await page.waitForTimeout(2000); await shot('caisses-open'); }
} else { await shot('caisses-miss'); errs.push('caisses non atteintes'); }

// --- scores dépliables
await page.click('#side');
await page.waitForTimeout(300);
await shot('scores');
const st = await page.textContent('#side');
if (!/misé|gagné/.test(st || '')) errs.push('détail des scores absent après appui');

console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- PARCOURS OK ---');
await b.close();
process.exit(errs.length ? 1 : 0);
