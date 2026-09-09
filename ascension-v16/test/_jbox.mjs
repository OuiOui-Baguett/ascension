import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
const walk = async (k, ms) => { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); };
const pos = () => page.evaluate(() => window.__pos && window.__pos());
const tap = async (sel) => { const el = await page.$(sel); if (!el) return false; await el.evaluate(e => e.click()); return true; };
await page.goto('http://localhost:2567/?quality=low');
await page.fill('#name', 'QUENTIN'); await tap('#create');
await page.waitForSelector('.code'); await tap('#start');
await page.waitForFunction(() => !!document.querySelector('.top'), null, { timeout: 30000 });
await page.waitForTimeout(17000);
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
// 1) le juke-box
await leg(7.4, 4.4, 2.0);
await page.waitForTimeout(600);
console.log('devant le juke-box :', JSON.stringify(await pos()), '| bouton :', !!(await page.$('#openradio')));
if (!(await page.$('#openradio'))) errs.push('juke-box non atteint');
await page.screenshot({ path: '/tmp/juke-approche.png' });
for (let i = 0; i < 5; i++) { await tap('#openradio'); await page.waitForTimeout(600); if ((await page.$$('.st')).length === 7) break; }
if ((await page.$$('.st')).length !== 7) errs.push('liste des stations absente');
await page.screenshot({ path: '/tmp/juke-stations.png' });
await tap('.st[data-s="tamtam"]'); await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/juke-tamtam.png' });
// 2) la machine voisine reste accessible
await tap('#closepanel'); await page.waitForTimeout(300);
await leg(11.08, -3.08, 2.4);
await page.waitForTimeout(600);
const t = await page.$('.minfo b');
const nom = t ? await t.textContent() : '(aucune fiche)';
console.log('machine voisine :', nom);
if (!nom.includes('Capybaras')) errs.push('la Course reste inaccessible : ' + nom);
console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- JUKE-BOX OK ---');
await b.close();
