// Relais de position entre joueurs.
// Deux volets : le serveur relaie fidèlement (y compris AUX BORDS de la grande salle,
// où l'ancienne borne à ±10 figeait les coéquipiers), et un vrai client navigateur émet
// bien sa position quand il marche.
import { chromium } from 'playwright';
import WebSocket from 'ws';
const errs = [];
const open = () => new Promise(r => { const w = new WebSocket('ws://localhost:2567/ws'); w.on('open', () => r(w)); });
const once = (w, t) => new Promise(r => { const h = d => { const m = JSON.parse(d); if (m.t === t) { w.off('message', h); r(m); } }; w.on('message', h); });

// --- volet 1 : le serveur relaie, sans raboter les positions ---
const a = await open();
a.send(JSON.stringify({ t: 'create', name: 'A' }));
const ja = await once(a, 'joined');
const b2 = await open();
b2.send(JSON.stringify({ t: 'join', code: ja.code, name: 'B' }));
const jb = await once(b2, 'joined');
a.send(JSON.stringify({ t: 'start' }));
await once(a, 'state');

const seen = [];
b2.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.t === 'pos' && m.p[ja.youId]) seen.push(m.p[ja.youId]);
});
// A parcourt la salle jusqu'aux machines latérales (x ≈ 11) et au fond (z ≈ -11)
const trajet = [[-2.4, 6.4], [4, 3], [9.4, -0.4], [11.1, -3.1], [-2.9, -11.1], [-10.6, 2.2]];
for (const [x, z] of trajet) {
  a.send(JSON.stringify({ t: 'move', x, z }));
  await new Promise(r => setTimeout(r, 200));
}
await new Promise(r => setTimeout(r, 300));
if (seen.length < 4) errs.push('relais insuffisants : ' + seen.length);
const dernier = seen[seen.length - 1] || [0, 0];
const loin = seen.some(p => Math.abs(p[0]) > 10.5 || Math.abs(p[1]) > 10.5);
if (!loin) errs.push('positions rabotees aux bords : ' + JSON.stringify(seen));
console.log(`serveur : ${seen.length} relais, dont les bords (dernier vu ${JSON.stringify(dernier)})`);
a.close(); b2.close();

// --- volet 2 : un vrai navigateur émet sa position en marchant ---
const br = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await br.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errs.push('JS: ' + e.message));
await page.goto('http://localhost:2567/?quality=low');
await page.evaluate(() => {
  window.__sent = [];
  const O = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { window.__sent.push(JSON.parse(d)); } catch {} return O.call(this, d); };
});
await page.fill('#name', 'MOVER'); await page.click('#create');
await page.waitForSelector('.code');
await page.$eval('#start', e => e.click());
await page.waitForFunction(() => !!document.querySelector('.top'), null, { timeout: 25000 });
await page.waitForTimeout(9500);                       // le briefing dure 8 s
await page.evaluate(() => { window.__sent = []; });
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(2500);
await page.keyboard.up('ArrowLeft');
const moves = await page.evaluate(() => window.__sent.filter(m => m.t === 'move'));
const p = await page.evaluate(() => window.__pos());
if (!moves.length) errs.push('le client n emet aucune position en marchant');
if (Math.abs(p.x - (-2.4)) < .5) errs.push('le joueur n a pas bouge : ' + JSON.stringify(p));
console.log(`client : ${moves.length} position(s) emise(s), arrive en ${JSON.stringify(p)}`);
await br.close();

console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- MOVE OK ---');
process.exit(errs.length ? 1 : 0);
