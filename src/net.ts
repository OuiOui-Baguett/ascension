// ============================================================
// Connexion au serveur de jeu. En ligne : WebSocket sur /ws, reconnexion
// automatique avec le même jeton (on retrouve sa place dans la partie).
// Version d'aperçu (VITE_SOLO) : le serveur tourne dans la page, avec des bots.
// ============================================================
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { Core } from '../shared/core';

export type Status = 'connecting' | 'online' | 'offline';
const params = new URLSearchParams(location.search);
export const LOCAL = import.meta.env.VITE_SOLO === '1' || params.has('local');

function store(k: string, v?: string) {
  try { if (v === undefined) return localStorage.getItem(k) ?? ''; localStorage.setItem(k, v); } catch { /* stockage indisponible */ }
  return '';
}

export class Net {
  id = '';
  token = store('nfg.token');
  name = store('nfg.name');
  status: Status = 'connecting';
  onMsg: (m: ServerMsg) => void = () => {};
  onStatus: (s: Status) => void = () => {};
  private ws: WebSocket | null = null;
  private local: { message(m: ClientMsg): void } | null = null;
  private queue: ClientMsg[] = [];
  private retry = 0;
  private timer = 0;

  connect() {
    if (LOCAL) {
      const core = new Core();
      (window as any).__core = core;   // pour les tests automatiques
      this.local = core.open({ send: m => queueMicrotask(() => this.receive(m)) });
      this.setStatus('online');
      this.local.message({ t: 'hello', token: this.token, name: this.name || 'Toi' });
      return;
    }
    clearTimeout(this.timer);
    if (this.ws && this.ws.readyState <= 1) return;
    this.setStatus('connecting');
    const url = params.get('server') || import.meta.env.VITE_SERVER || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { this.later(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', token: this.token, name: this.name || 'Anonyme' }));
    };
    ws.onmessage = e => { try { this.receive(JSON.parse(e.data)); } catch { /* message illisible */ } };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.setStatus('offline'); this.later(); } };
    ws.onerror = () => ws.close();
  }

  /** Le téléphone revient au premier plan : on se reconnecte tout de suite. */
  wake() { if (!LOCAL && !this.ws) { this.retry = 0; this.connect(); } }

  send(m: ClientMsg) {
    if (this.local) { this.local.message(m); return; }
    if (this.ws && this.ws.readyState === 1 && this.status === 'online') this.ws.send(JSON.stringify(m));
    else if (m.t !== 'in' && m.t !== 'ping' && m.t !== 'atk') this.queue.push(m);
  }

  setName(n: string) { this.name = n; store('nfg.name', n); this.send({ t: 'name', name: n }); }

  private receive(m: ServerMsg) {
    if (m.t === 'welcome') {
      this.id = m.id; this.token = m.token; store('nfg.token', m.token);
      this.setStatus('online');
      const q = this.queue; this.queue = [];
      for (const x of q) this.send(x);
    }
    this.onMsg(m);
  }
  private later() {
    const wait = [400, 1000, 2000, 4000][Math.min(3, this.retry++)];
    this.timer = window.setTimeout(() => this.connect(), wait);
  }
  private setStatus(s: Status) { if (this.status !== s) { this.status = s; this.onStatus(s); } }
}
