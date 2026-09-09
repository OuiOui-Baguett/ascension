// Changement d'étage répété dans UNE MÊME page : c'est là qu'une texture mutualisée
// libérée par erreur deviendrait noire, ce que les tests page-par-page ne voient pas.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const errs = [];
const page = await b.newPage({ viewport: { width: 760, height: 520 } });
page.on('pageerror', e => errs.push('JS: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('C: ' + m.text()); });
await page.goto('http://localhost:2567/?quality=low');
await page.waitForTimeout(1800);
for (const pass of [1, 2]) {
  for (let f = 1; f <= 5; f++) {
    // clic direct : le controle « element stable » de Playwright expire quand le rendu rame
    await page.$eval(`.fchip[data-f="${f}"]`, e => e.click());
    await page.waitForTimeout(500);
    const g = await page.evaluate(() => window.__gfx());
    if (g.triangles < 5000) errs.push(`étage ${f} (passe ${pass}) : décor quasi vide (${g.triangles} triangles)`);
  }
}
await page.evaluate(() => { document.getElementById('ui').innerHTML = ''; });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/apres-bascule.png' });
const g = await page.evaluate(() => window.__gfx());
console.log(`après 10 changements d'étage : ${g.meshes} objets, ${g.triangles} triangles, ${g.mem.textures} textures, ${g.mem.geometries} géométries`);
if (g.mem.textures > 120) errs.push('fuite de textures : ' + g.mem.textures);
if (g.mem.geometries > 2200) errs.push('fuite de géométries : ' + g.mem.geometries);
console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- BASCULE D’ÉTAGE OK ---');
await b.close();
process.exit(errs.length ? 1 : 0);
