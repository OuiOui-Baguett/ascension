// Vérification À L'ÉCRAN du chaos : on ferre un Gouffre, on se fait arracher,
// on tombe à l'eau, on remonte. (serveur lancé avec DEBUG=1)
import { launch } from './_browser.mjs';
const b = await launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; page.on('pageerror', e => errs.push('JS: ' + e.message));
const tap = async sel => { const el = await page.$(sel); if (!el) return false; await el.evaluate(e => e.click()); return true; };
const walk = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(500); };
const dbg = () => page.evaluate(() => window.__fish && window.__fish());
const bar = async () => ((await page.evaluate(() => (document.querySelector('.actionbar,.hint')||{}).textContent || '')).trim().split('\n')[0]);

await page.goto('http://localhost:2567/?quality=high');
await page.waitForFunction(() => !!document.querySelector('#gamepick'), null, { timeout: 20000 });
await tap('.gcard[data-g="fish"]'); await page.fill('#name', 'QUENTIN'); await tap('#create');
await page.waitForFunction(() => !!document.querySelector('#start'), null, { timeout: 15000 });
await tap('#start'); await page.waitForTimeout(7000);
for (let i = 0; i < 8; i++) { const p = (await dbg())?.pos; if (!p || Math.abs(p.x) < .6) break; await walk(p.x > 0 ? 'ArrowLeft' : 'ArrowRight', 1600); }
for (let i = 0; i < 5; i++) { const p = (await dbg())?.pos; if (!p || p.z < -4) break; await walk('ArrowUp', 3000); }
console.log('départ  ', JSON.stringify((await dbg())?.pos));

await page.evaluate(() => window.__ferrer('deepmaw', 40));
await page.waitForTimeout(2500);
console.log('combat  ', JSON.stringify((await dbg())?.pos), '|', await bar());
await page.screenshot({ path: '/tmp/shots/c1-combat.png' });

for (let i = 0; i < 24; i++) { await page.waitForTimeout(700); if ((await bar()).includes('À L')) break; }
console.log('chute   ', JSON.stringify((await dbg())?.pos), '|', await bar());
await page.screenshot({ path: '/tmp/shots/c2-a-leau.png' });
for (let i = 0; i < 30; i++) { await page.waitForTimeout(700); if (!(await bar()).includes('À L')) break; }
console.log('remontée', JSON.stringify((await dbg())?.pos), '|', await bar());
await page.screenshot({ path: '/tmp/shots/c3-remonte.png' });
console.log('erreurs :', errs.length ? errs : 'aucune');
await b.close();
