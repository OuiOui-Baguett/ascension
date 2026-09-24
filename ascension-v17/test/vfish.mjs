// Vérification visuelle : menu de sélection de jeu → salon FISH → la crique.
import { launch } from './_browser.mjs';
const errs = [];
const b = await launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errs.push('JS: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('C: ' + m.text()); });
const shot = n => page.screenshot({ path: `/tmp/shots/${n}.png` });
const tap = async sel => { const el = await page.$(sel); if (!el) throw new Error('introuvable ' + sel); await el.evaluate(e => e.click()); };

await page.goto('http://localhost:2567/?quality=low');
await page.waitForFunction(() => !!document.querySelector('#gamepick'), null, { timeout: 20000 });
await page.waitForTimeout(2500);
await shot('1-menu');

await tap('.gcard[data-g="fish"]');
await page.waitForTimeout(800);
await shot('2-fish-selectionne');

await page.fill('#name', 'QUENTIN');
await tap('#create');
await page.waitForFunction(() => !!document.querySelector('#start'), null, { timeout: 15000 });
await page.waitForTimeout(600);
await shot('3-salon');

await tap('#start');
await page.waitForTimeout(9000);
await shot('4-crique');
console.log('phase/jeu :', await page.evaluate(() => JSON.stringify({ ui: document.querySelector('.fishtop') ? 'fishtop OK' : 'PAS DE FISHTOP', canvas: !!document.querySelector('#scene-fish') })));
console.log('erreurs :', errs.length ? errs.slice(0, 8) : 'aucune');
await b.close();
