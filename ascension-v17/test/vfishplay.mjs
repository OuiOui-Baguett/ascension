// Boucle de jeu en vrai : marcher jusqu'au bout du ponton, lancer, ferrer, mouliner.
import { launch } from './_browser.mjs';
const b = await launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push('JS: ' + e.message));
const tap = async sel => { const el = await page.$(sel); if (!el) return false; await el.evaluate(e => e.click()); return true; };
const walk = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(600); };
const dbg = () => page.evaluate(() => window.__fish && window.__fish());
const bar = () => page.evaluate(() => (document.querySelector('.actionbar, .hint') || {}).textContent || '');

await page.goto('http://localhost:2567/?quality=low');
await page.waitForFunction(() => !!document.querySelector('#gamepick'), null, { timeout: 20000 });
await tap('.gcard[data-g="fish"]'); await page.fill('#name', 'QUENTIN'); await tap('#create');
await page.waitForFunction(() => !!document.querySelector('#start'), null, { timeout: 15000 });
await tap('#start'); await page.waitForTimeout(6000);

// rejoindre l'axe du ponton puis avancer sur l'eau, en lisant la position réelle
for (let i = 0; i < 10; i++) {
  const p = (await dbg())?.pos; if (!p) break;
  if (Math.abs(p.x) > .6) await walk(p.x > 0 ? 'ArrowLeft' : 'ArrowRight', Math.min(4000, Math.abs(p.x) * 1400));
  else break;
}
for (let i = 0; i < 10; i++) {
  const p = (await dbg())?.pos; if (!p || p.z < -1.5) break;
  await walk('ArrowUp', 3500);
}
console.log('position', JSON.stringify((await dbg())?.pos), '|', (await bar()).trim().split('\n')[0]);
await page.screenshot({ path: '/tmp/shots/p1-bout.png' });

// lancer : on maintient le bouton
const cast = await page.$('#cast');
if (!cast) { console.log('!! pas de bouton LANCER'); await b.close(); process.exit(1); }
const press = async (sel, ms) => {
  await page.evaluate(s => document.querySelector(s)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 })), sel);
  await page.waitForTimeout(ms);
  await page.evaluate(s => document.querySelector(s)?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 })), sel);
};
await press('#cast', 1400);
await page.waitForTimeout(1500);
console.log('après lancer', (await bar()).trim());
await page.screenshot({ path: '/tmp/shots/p2-lance.png' });

// attendre la touche puis ferrer
let ferre = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const t = await bar();
  if (t.includes('FERRER')) { await tap('#hook'); ferre = true; break; }
}
console.log('ferré :', ferre, '|', (await bar()).trim());
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/shots/p3-combat.png' });

// combat : on mouline par à-coups en relâchant quand ça tire
const reel = await page.$('#reel');
if (reel) {
  for (let i = 0; i < 30; i++) {
    await press('#reel', 900);
    await page.waitForTimeout(700);
    if (!(await page.$('#reel'))) break;
  }
}
await page.waitForTimeout(1200);
console.log('fin      ', (await bar()).trim());
console.log('besace   ', await page.evaluate(() => (document.querySelector('#openbag') || {}).textContent));
await page.screenshot({ path: '/tmp/shots/p4-fin.png' });
console.log('erreurs :', errs.length ? errs : 'aucune');
await b.close();
