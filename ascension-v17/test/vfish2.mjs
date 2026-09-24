// Tour du propriétaire de la crique : plusieurs points de vue pour juger la direction artistique.
import { launch } from './_browser.mjs';
const b = await launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push('JS: ' + e.message));
const shot = n => page.screenshot({ path: `/tmp/shots/${n}.png` });
const tap = async sel => { const el = await page.$(sel); if (!el) throw new Error('introuvable ' + sel); await el.evaluate(e => e.click()); };
const walk = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(500); };

await page.goto('http://localhost:2567/?quality=high');
await page.waitForFunction(() => !!document.querySelector('#gamepick'), null, { timeout: 20000 });
await tap('.gcard[data-g="fish"]');
await page.fill('#name', 'QUENTIN');
await tap('#create');
await page.waitForFunction(() => !!document.querySelector('#start'), null, { timeout: 15000 });
await tap('#start');
await page.waitForTimeout(8000);

await walk('ArrowDown', 2200); await shot('5-vers-la-plage');
await walk('ArrowLeft', 2600); await shot('6-marche');
await walk('ArrowRight', 5200); await shot('7-boutique');
await walk('ArrowUp', 4000); await shot('8-bout-du-ponton');
console.log('erreurs :', errs.length ? errs : 'aucune');
await b.close();
