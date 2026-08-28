// Test visuel headless : 4 machines, déplacement, mise à la roue.
import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto('http://localhost:2567');
await page.fill('#name', 'TESTEUR');
await page.click('#create');
await page.waitForSelector('.code', { timeout: 5000 });
console.log('room:', (await page.textContent('.code')).trim());
await page.click('#start');
await page.waitForSelector('.top', { timeout: 15000 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shot-world.png' });

// marche vers la roue (spot gauche : -4.8, -1.0)
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(850);
await page.keyboard.up('ArrowLeft');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(600);
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/shot-near.png' });

const go = await page.$('#go');
if (go) {
  await page.click('#go');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: '/tmp/shot-spin.png' });
} else {
  errors.push('PAS DE BARRE DE MISE près de la roue');
  await page.screenshot({ path: '/tmp/shot-spin.png' });
}

console.log(errors.length ? 'ERREURS:\n' + errors.join('\n') : '--- VISUAL OK, aucune erreur JS ---');
await browser.close();
process.exit(errors.length ? 1 : 0);
