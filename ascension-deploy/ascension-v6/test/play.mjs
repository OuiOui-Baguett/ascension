// Parcours joueur complet dans le navigateur : skin → table → coffre → machine → boutique.
import { chromium } from 'playwright';
const errs = [];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errs.push('JS: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('C: ' + m.text()); });
const shot = n => page.screenshot({ path: `/tmp/p-${n}.png` });

await page.goto('http://localhost:2567');
await page.fill('#name', 'QUENTIN');
await page.click('.ht[data-h="2"]');            // couronne
await page.click('.sw[data-c="3"]');            // vert
await shot('home');
await page.click('#create');
await page.waitForSelector('.code');
await page.click('#start');
await page.waitForSelector('.top', { timeout: 20000 });
await page.waitForTimeout(600);
await shot('spawn');

// on démarre près du Coffre (centre) : ouvrir et retirer
let bar = await page.textContent('#ui');
if (!bar.includes('COFFRE')) errs.push('Coffre non détecté au spawn');
const ov = await page.$('#openvault');
if (ov) {
  await ov.click(); await page.waitForTimeout(300); await shot('vault');
  await page.click('#vplus'); await page.click('#vplus');
  await page.click('#vwd');                      // retirer
  await page.waitForTimeout(500);
  await shot('vault-after');
  const wal = await page.textContent('#wal');
  if (!/[1-9]/.test(wal || '')) errs.push('retrait sans effet sur les jetons en main : ' + wal);
} else errs.push('bouton OUVRIR LE COFFRE absent');

// marcher vers une machine (haut-gauche)
await page.click('#closepanel').catch(() => {});
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1300); await page.keyboard.up('ArrowUp');
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(1300); await page.keyboard.up('ArrowLeft');
await page.waitForTimeout(500);
await shot('machine');
const go = await page.$('#go, .opt');
if (!go) errs.push('aucune action de mise près de la machine');
else {
  const betIn = await page.$('#betin');
  if (!betIn) errs.push('champ de mise manuel absent');
  else { await betIn.fill('30'); await page.waitForTimeout(150); }
  await go.click();
  await page.waitForTimeout(4500);
  await shot('result');
}

// boutique (bas-gauche)
await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1700); await page.keyboard.up('ArrowDown');
await page.waitForTimeout(500);
const os = await page.$('#openshop');
if (os) { await os.click(); await page.waitForTimeout(300); await shot('shop'); }
else { await shot('shop-miss'); errs.push('boutique non atteinte'); }

console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- PARCOURS OK ---');
await b.close();
process.exit(errs.length ? 1 : 0);
