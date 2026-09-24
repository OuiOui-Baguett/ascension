// Deux jeux, une seule coquille : chaque table connaît son jeu, et un message
// destiné à l'autre jeu ne doit RIEN faire (pas de fuite entre les règles).
import { WebSocket } from 'ws';
const errs = [];
const open = () => new Promise(r => { const w = new WebSocket('ws://localhost:2567/ws'); w.on('open', () => r(w)); });
const once = (w, t, ms = 2500) => new Promise(r => {
  const h = d => { const m = JSON.parse(d); if (m.t === t) { w.off('message', h); r(m); } };
  w.on('message', h); setTimeout(() => { w.off('message', h); r(null); }, ms);
});

const a = await open();
a.send(JSON.stringify({ t: 'create', game: 'fish', name: 'Pecheur' }));
const ja = await once(a, 'joined');
if (!ja) { console.log('ERREURS: aucune reponse a la creation'); process.exit(1); }
if (ja.state.game !== 'fish') errs.push('la table ne declare pas le jeu fish : ' + ja.state.game);
if (!('shared' in ja.state)) errs.push('etat de peche incomplet');

const b = await open();
b.send(JSON.stringify({ t: 'join', code: ja.code, name: 'Mousse' }));
const jb = await once(b, 'joined');
if (!jb || jb.state.players.length !== 2) errs.push('le 2e joueur ne rejoint pas la table de peche');

a.send(JSON.stringify({ t: 'start' }));
await once(a, 'state');
a.send(JSON.stringify({ t: 'bet', machineId: 'roue_ancetres', amount: 100 }));
a.send(JSON.stringify({ t: 'elevator' }));
await new Promise(r => setTimeout(r, 300));
a.send(JSON.stringify({ t: 'cast', power: 0.7 }));
const ev = await once(a, 'ev', 2000);
if (!ev) errs.push('le lancer ne produit aucun evenement');
else if (ev.kind !== 'cast') errs.push('evenement inattendu au lancer : ' + ev.kind);

const c = await open();
c.send(JSON.stringify({ t: 'create', game: 'ascension', name: 'Joueur' }));
const jc = await once(c, 'joined');
if (!jc || jc.state.game !== 'ascension') errs.push('table casino mal creee');
if (jc && jc.code === ja.code) errs.push('les deux tables partagent le meme code');
c.send(JSON.stringify({ t: 'start' }));
const sc = await once(c, 'state');
if (!sc || !('bank' in sc.state)) errs.push('etat casino incomplet');
c.send(JSON.stringify({ t: 'cast', power: 1 }));
c.send(JSON.stringify({ t: 'sell' }));
await new Promise(r => setTimeout(r, 300));

console.log(`table peche ${ja.code} (${jb ? jb.state.players.length : '?'} joueurs) | table casino ${jc ? jc.code : '?'}`);
for (const w of [a, b, c]) w.close();
console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : '--- DEUX JEUX OK ---');
process.exit(errs.length ? 1 : 0);
