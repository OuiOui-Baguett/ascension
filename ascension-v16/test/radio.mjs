// Radio du casino : la station est commune à la table, elle se propage à tout le monde,
// et le moteur de musique produit réellement du son.
// (Pas de marche ici : le rendu logiciel du CI est trop lent, l'étage se terminerait avant.)
import { chromium } from 'playwright';
import { WebSocket } from 'ws';
const errs = [];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => errs.push('JS: ' + e.message));
await page.goto('http://localhost:2567/?quality=low');
await page.fill('#name', 'QUENTIN'); await page.click('#create');
await page.waitForSelector('.code');
const code = (await page.textContent('.code')).trim();

const once = (w, t) => new Promise(r => { const h = d => { const m = JSON.parse(d); if (m.t === t) { w.off('message', h); r(m); } }; w.on('message', h); });
const w2 = await new Promise(r => { const w = new WebSocket('ws://localhost:2567/ws'); w.on('open', () => r(w)); });
w2.send(JSON.stringify({ t: 'join', code, name: 'POTE' }));
const j2 = await once(w2, 'joined');
if (j2.state.station !== 'auto') errs.push('station de depart inattendue : ' + j2.state.station);

await page.click('#start');
await page.waitForSelector('.top', { timeout: 25000 });
await page.waitForTimeout(9500);                 // le briefing dure 8 s
await page.keyboard.press('Space');              // debloque l audio (iOS-like)
await page.waitForTimeout(500);

// un AUTRE joueur change de station : la table entiere doit suivre
w2.send(JSON.stringify({ t: 'radio', station: 'forge' }));
await page.waitForTimeout(1500);
const d = await page.evaluate(() => window.__dbg());
if (d.station !== 'forge') errs.push('la station n a pas atteint le client : ' + JSON.stringify(d));
if (d.stationOn !== 'forge') errs.push('le lecteur ne joue pas la bonne station : ' + d.stationOn);

// la musique tourne-t-elle vraiment ? on compte les oscillateurs crees
const osc = await page.evaluate(async () => {
  const AC = window.AudioContext;
  let n = 0;
  const orig = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { n++; return orig.call(this); };
  await new Promise(r => setTimeout(r, 3000));
  AC.prototype.createOscillator = orig;
  return n;
});
console.log('oscillateurs crees en 3 s de Forge :', osc);
// seuil bas : la machine de test peut manquer des tours d'ordonnanceur.
// Ce qui compte : une station joue (des dizaines de voix) et « coupee » n'en joue aucune.
if (osc < 20) errs.push('la station ne joue pas (' + osc + ' oscillateurs)');

// couper la radio doit vraiment tout arreter
w2.send(JSON.stringify({ t: 'radio', station: 'off' }));
await page.waitForTimeout(1200);
const osc2 = await page.evaluate(async () => {
  const AC = window.AudioContext;
  let n = 0;
  const orig = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { n++; return orig.call(this); };
  await new Promise(r => setTimeout(r, 2000));
  AC.prototype.createOscillator = orig;
  return n;
});
console.log('oscillateurs en 2 s apres coupure :', osc2);
if (osc2 > 12) errs.push('la radio continue de jouer apres coupure (' + osc2 + ')');

w2.close();
console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- RADIO OK ---');
await b.close();
process.exit(errs.length ? 1 : 0);
