// Smoke réseau : 2 bots jouent un étage complet (SPEED=10) jusqu'au SHOP ou à la CHUTE.
import WebSocket from 'ws';

const URL = 'ws://localhost:2567/ws';
const seen = new Set();
let done = false;

function bot(name, isHost) {
  const ws = new WebSocket(URL);
  let you = null;
  let busyUntil = 0;

  ws.on('open', () => ws.send(JSON.stringify(isHost ? { t: 'create', name } : { t: 'join', code: process.env.CODE, name })));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') {
      you = m.youId;
      if (isHost) {
        process.env.CODE = m.code;
        console.log('room', m.code);
        setTimeout(() => bot('Bob', false), 300);
        setTimeout(() => ws.send(JSON.stringify({ t: 'start' })), 800);
      }
    }
    if (m.t !== 'state') return;
    const S = m.state;
    if (!seen.has(S.phase)) { seen.add(S.phase); console.log('phase:', S.phase, '| bank', S.bank); }
    const me = S.players.find(p => p.id === you);
    if (S.phase === 'FLOOR' && me && !me.playing && Date.now() > busyUntil) {
      busyUntil = Date.now() + 1500;
      const amount = Math.max(S.betMin, Math.min(S.betMax, Math.round(S.bank * 0.2)));
      const machine = isHost ? 'pont_pourri' : (Math.random() < 0.5 ? 'roue_ancetres' : 'totem_bavard');
      ws.send(JSON.stringify({ t: 'bet', machineId: machine, amount }));
      if (isHost) setTimeout(() => ws.send(JSON.stringify({ t: 'cashout' })), 800);
    }
    if ((seen.has('SHOP') || seen.has('FALLING')) && !done) {
      done = true;
      console.log('--- SMOKE OK ---', [...seen].join(','), '| bank', S.bank);
      setTimeout(() => process.exit(0), 300);
    }
  });
  ws.on('error', (e) => { console.error('ws error', e.message); process.exit(1); });
}

bot('Alice', true);
setTimeout(() => { console.error('TIMEOUT — phases vues :', [...seen].join(',')); process.exit(1); }, 120000);
