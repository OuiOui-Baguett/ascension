// ============================================================
// Point d'entrée : HTTP (statique en prod) + WebSocket /ws
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { GameRoom, makeCode, type Player } from './room';

const PORT = Number(process.env.PORT || 2567);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../client/dist');

const rooms = new Map<string, GameRoom>();

// nettoyage des rooms abandonnées
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.empty && Date.now() - room.createdAt > 60_000) {
      room.destroy();
      rooms.delete(code);
      console.log(`[room ${code}] fermée.`);
    }
  }
}, 30_000);

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

// Version du jeu — ouvrir /version pour savoir laquelle tourne en ligne.
export const BUILD = 'v6-coffre';

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (url === '/version') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end(BUILD);
  }
  // statique (prod) — en dev, Vite sert le client
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('build manquant — npm run build'); }
  // les fichiers de /assets/ ont un nom unique par build → cache long ;
  // index.html ne doit JAMAIS être caché, sinon les joueurs gardent l'ancienne version.
  const hashed = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-store, must-revalidate',
  });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

interface Session { room: GameRoom | null; player: Player | null }

wss.on('connection', (ws: WebSocket) => {
  const s: Session = { room: null, player: null };

  const fail = (text: string) => ws.send(JSON.stringify({ t: 'error', text }));

  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (typeof msg?.t !== 'string') return;

    try {
      switch (msg.t) {
        case 'create': {
          let code = makeCode();
          while (rooms.has(code)) code = makeCode();
          const room = new GameRoom(code);
          rooms.set(code, room);
          console.log(`[room ${code}] créée.`);
          const p = room.addPlayer(String(msg.name ?? ''), ws, Number(msg.color ?? 0), Number(msg.hat ?? 0));
          if (typeof p === 'string') return fail(p);
          s.room = room; s.player = p;
          ws.send(JSON.stringify({ t: 'joined', token: p.token, code, youId: p.id, state: room.serialize() }));
          room.broadcast();
          break;
        }
        case 'join': {
          const room = rooms.get(String(msg.code ?? '').toUpperCase());
          if (!room) return fail('Aucune table avec ce code.');
          const p = room.addPlayer(String(msg.name ?? ''), ws, Number(msg.color ?? 0), Number(msg.hat ?? 0));
          if (typeof p === 'string') return fail(p);
          s.room = room; s.player = p;
          ws.send(JSON.stringify({ t: 'joined', token: p.token, code: room.code, youId: p.id, state: room.serialize() }));
          room.broadcast();
          break;
        }
        case 'rejoin': {
          for (const room of rooms.values()) {
            const p = room.rejoin(String(msg.token ?? ''), ws);
            if (p) {
              s.room = room; s.player = p;
              ws.send(JSON.stringify({ t: 'joined', token: p.token, code: room.code, youId: p.id, state: room.serialize() }));
              return;
            }
          }
          return fail('Session expirée.');
        }
        case 'start': if (s.room && s.player) s.room.start(s.player); break;
        case 'bet': if (s.room && s.player) s.room.bet(s.player, String(msg.machineId), Number(msg.amount), String(msg.opt ?? '')); break;
        case 'bj': if (s.room && s.player) s.room.bjAction(s.player, String(msg.action)); break;
        case 'cashout': if (s.room && s.player) s.room.cashout(s.player); break;
        case 'move': if (s.room && s.player) s.room.move(s.player, Number(msg.x), Number(msg.z)); break;
        case 'hilo': if (s.room && s.player) s.room.hiloChoice(s.player, String(msg.choice)); break;
        case 'elevator': if (s.room && s.player) s.room.elevator(s.player); break;
        case 'buy': if (s.room && s.player) s.room.buy(s.player, String(msg.itemId)); break;
        case 'withdraw': if (s.room && s.player) s.room.withdraw(s.player, Number(msg.amount)); break;
        case 'deposit': if (s.room && s.player) s.room.deposit(s.player, msg.amount === undefined ? undefined : Number(msg.amount)); break;
      }
    } catch (e) {
      console.error('message error', e);
    }
  });

  ws.on('close', () => {
    if (s.room && s.player) s.room.onDisconnect(s.player);
  });
});

// heartbeat — détecte les connexions mortes
setInterval(() => {
  for (const ws of wss.clients) {
    if ((ws as any).dead) { ws.terminate(); continue; }
    (ws as any).dead = true;
    ws.ping();
  }
}, 15_000);
wss.on('connection', (ws) => {
  (ws as any).dead = false;
  ws.on('pong', () => { (ws as any).dead = false; });
});

server.listen(PORT, () => console.log(`ASCENSION server → http://localhost:${PORT} (ws: /ws)`));
