// 8 joueurs à la même table : couleurs distinctes, places distinctes, 9e refusé.
import { WebSocket } from 'ws';
const errs = [];
const open = () => new Promise(r => { const w = new WebSocket('ws://localhost:2567/ws'); w.on('open', () => r(w)); });
const once = (w, t) => new Promise(r => {
  const h = d => { const m = JSON.parse(d); if (m.t === t) { w.off('message', h); r(m); } };
  w.on('message', h);
});
const host = await open();
host.send(JSON.stringify({ t: 'create', name: 'P1', color: 0, hat: 0 }));
const j = await once(host, 'joined');
const code = j.code;
const socks = [host];
for (let i = 2; i <= 8; i++) {
  const w = await open(); socks.push(w);
  w.send(JSON.stringify({ t: 'join', code, name: 'P' + i, color: 0, hat: 0 }));
  await once(w, 'joined');
}
const w9 = await open();
w9.send(JSON.stringify({ t: 'join', code, name: 'P9', color: 0, hat: 0 }));
const err = await Promise.race([once(w9, 'error'), new Promise(r => setTimeout(() => r(null), 1500))]);
if (!err || !/pleine/.test(err.text)) errs.push('9e joueur non refusé : ' + JSON.stringify(err));
host.send(JSON.stringify({ t: 'start' }));
const st = await once(host, 'state');
const P = st.state.players;
if (P.length !== 8) errs.push('table à ' + P.length + ' joueurs au lieu de 8');
if (new Set(P.map(p => p.color)).size !== 8) errs.push('couleurs en double : ' + P.map(p => p.color).join(','));
if (new Set(P.map(p => p.x + ':' + p.z)).size !== 8) errs.push('places superposées : ' + P.map(p => p.x + ':' + p.z).join(' '));
console.log(errs.length ? 'ERREURS:\n' + errs.join('\n') : `--- 8 JOUEURS OK --- couleurs ${P.map(p => p.color).join(',')}`);
for (const s of [...socks, w9]) s.close();
process.exit(errs.length ? 1 : 0);
