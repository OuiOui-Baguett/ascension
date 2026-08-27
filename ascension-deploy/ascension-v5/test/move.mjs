// Vérifie que les déplacements d'un joueur (vrai client navigateur)
// sont bien relayés aux autres (client ws témoin).
import { chromium } from 'playwright';
import WebSocket from 'ws';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:2567');
await page.fill('#name', 'MOVER');
await page.click('#create');
await page.waitForSelector('.code');
const code = (await page.textContent('.code')).trim();

let moves = 0;
const ws = new WebSocket('ws://localhost:2567/ws');
ws.on('open', () => ws.send(JSON.stringify({ t: 'join', code, name: 'Témoin' })));
ws.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.t === 'pos') moves++;
});

await page.waitForTimeout(800);
await page.click('#start');
await page.waitForSelector('.top', { timeout: 15000 });
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(1500);
await page.keyboard.up('ArrowLeft');
await page.waitForTimeout(500);

console.log(moves > 3 ? `--- MOVE OK (${moves} relais de position reçus) ---` : `ÉCHEC : ${moves} relais reçus`);
await browser.close();
process.exit(moves > 3 ? 0 : 1);
