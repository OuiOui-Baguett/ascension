// ============================================================
// Point d'entrée : HTTP (statique en prod) + WebSocket /ws
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { route, type AnyRoom, type Session } from './router';

const PORT = Number(process.env.PORT || 2567);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../client/dist');

const rooms = new Map<string, AnyRoom>();

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
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

// Version du jeu — ouvrir /version pour savoir laquelle tourne en ligne.
export const BUILD = 'v18-claque';

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
  // /res/ (modèles, textures) change rarement : cache d'une journée, revalidé ensuite
  const hashed = file.includes(`${path.sep}assets${path.sep}`);
  const isRes = file.includes(`${path.sep}res${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : isRes ? 'public, max-age=86400' : 'no-store, must-revalidate',
  });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

interface WsSession extends Session {}

wss.on('connection', (ws: WebSocket) => {
  const s: WsSession = { room: null, player: null };
  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (typeof msg?.t !== 'string') return;
    try {
      const code = route(rooms, s, ws as any, msg);
      if (msg.t === 'create' && typeof code === 'string') console.log(`[room ${code}] créée.`);
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
