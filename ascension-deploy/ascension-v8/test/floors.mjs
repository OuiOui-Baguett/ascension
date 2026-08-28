// Vérifie que les 5 étages (et leurs machines variées) se construisent sans erreur JS.
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let failed = false;
for (let f = 1; f <= 5; f++) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:2567/?floor=${f}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/floor-${f}.png` });
  console.log(`étage ${f}:`, errors.length ? 'ERREURS ' + errors.join(' | ') : 'ok');
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
