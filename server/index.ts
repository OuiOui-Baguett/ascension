// ============================================================
// Serveur de Le Casse : sert le site (dossier dist) et fait tourner les parties
// en temps réel par WebSocket sur /ws. Un seul processus, rien d'autre à installer.
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { Core } from '../shared/core';
import type { ClientMsg } from '../shared/protocol';

const PORT = +(process.env.PORT || 8787);
const DIST = path.resolve(process.env.DIST || 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const core = new Core();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`ok ${core.rooms.size} parties`); return; }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    const target = !err && st.isFile() ? file : path.join(DIST, 'index.html');
    const ext = path.extname(target);
    const cache = target.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable'
      : ext === '.html' ? 'no-cache' : 'public, max-age=86400';
    fs.readFile(target, (e2, buf) => {
      if (e2) { res.writeHead(404); res.end('introuvable'); return; }
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache });
      res.end(buf);
    });
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();
wss.on('connection', ws => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  const h = core.open({ send: m => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); } });
  ws.on('message', data => {
    let m: ClientMsg;
    try { m = JSON.parse(String(data)); } catch { return; }
    if (m && typeof m === 'object' && typeof (m as any).t === 'string') h.message(m);
  });
  ws.on('close', () => h.close());
  ws.on('error', () => ws.terminate());
});
// connexions mortes (téléphone en veille, réseau coupé) : on les détecte et on les ferme
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) { ws.terminate(); continue; }
    alive.set(ws, false); ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Le Casse — serveur prêt sur le port ${PORT} (site : ${DIST})`));
