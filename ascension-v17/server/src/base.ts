// ============================================================
// BaseRoom — la coquille de salon, commune à TOUS les jeux.
// Elle ne connaît ni machines, ni poissons : seulement des joueurs,
// un code de table, la reconnexion, les émotes, la radio et le relais
// de position. Chaque jeu en hérite et n'écrit QUE ses règles.
// ============================================================
import type { WebSocket } from 'ws';
import { MAX_PLAYERS, STATIONS } from '../../shared/content';

export const RECONNECT_GRACE = 120_000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const rid = (n = 8) => Math.random().toString(36).slice(2, 2 + n);
export const makeCode = () =>
  Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

export function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) { r -= i.weight; if (r <= 0) return i; }
  return items[items.length - 1];
}

/** Ce que tout joueur possède, quel que soit le jeu. */
export interface BasePlayer {
  id: string; token: string; name: string;
  ws: WebSocket | null; connected: boolean; disconnectedAt: number;
  color: number; hat: number;
  x: number; z: number; moved: boolean;
  lastEmote?: number;
}

export abstract class BaseRoom<P extends BasePlayer> {
  code: string;
  game = 'ascension';
  players = new Map<string, P>();
  phase = 'LOBBY';
  station = 'auto';                 // radio : le choix est commun à la table
  createdAt = Date.now();
  protected posTimer: any = null;
  protected timer: any = null;

  constructor(code: string) {
    this.code = code;
    // relais de position à ~8 Hz, séparé des états complets (bien plus lourds)
    this.posTimer = setInterval(() => {
      const moved = [...this.players.values()].filter(p => p.moved);
      if (!moved.length) return;
      const pos: Record<string, [number, number]> = {};
      for (const p of moved) { pos[p.id] = [p.x, p.z]; p.moved = false; }
      this.broadcastMsg({ t: 'pos', p: pos });
    }, 120);
  }

  /** Chaque jeu complète son joueur (bilan, inventaire…) et place les arrivants. */
  protected abstract initPlayer(p: BasePlayer): P;
  protected abstract spawnSpot(index: number): { x: number; z: number };
  /** Rayon de la zone jouable, pour borner les positions relayées. */
  protected get worldRadius() { return 17; }
  abstract serialize(): Record<string, unknown>;

  /** Deux joueurs de la même couleur seraient indiscernables : on décale. */
  private freeColor(want: number): number {
    const taken = new Set([...this.players.values()].map(p => p.color));
    const c = Math.max(0, Math.min(7, want | 0));
    if (!taken.has(c)) return c;
    for (let i = 0; i < 8; i++) if (!taken.has(i)) return i;
    return c;
  }

  addPlayer(name: string, ws: WebSocket, color = 0, hat = 0): P | string {
    if (this.phase !== 'LOBBY') return 'La partie a déjà commencé.';
    if (this.players.size >= MAX_PLAYERS) return `La table est pleine (${MAX_PLAYERS} joueurs max).`;
    const base: BasePlayer = {
      id: rid(6), token: rid(16), name: (name || 'Joueur').slice(0, 14),
      ws, connected: true, disconnectedAt: 0,
      color: this.freeColor(color), hat: Math.max(0, Math.min(5, hat | 0)),
      ...this.spawnSpot(this.players.size), moved: true,
    };
    const p = this.initPlayer(base);
    this.players.set(p.id, p);
    this.logEv('info', `${p.name} rejoint la table.`);
    return p;
  }

  rejoin(token: string, ws: WebSocket): P | null {
    for (const p of this.players.values()) {
      if (p.token === token) {
        p.ws = ws; p.connected = true; p.disconnectedAt = 0;
        this.logEv('info', `${p.name} est de retour.`);
        this.broadcast();
        return p;
      }
    }
    return null;
  }

  onDisconnect(p: P) {
    p.ws = null; p.connected = false; p.disconnectedAt = Date.now();
    if (this.phase === 'LOBBY') this.players.delete(p.id);
    else this.logEv('info', `${p.name} a perdu la connexion…`);
    this.broadcast();
  }

  get empty() {
    return [...this.players.values()].every(
      p => !p.connected && Date.now() - p.disconnectedAt > RECONNECT_GRACE,
    ) || this.players.size === 0;
  }

  /** Réaction rapide au-dessus de la tête (purement social). */
  emote(p: P, index: number) {
    if (!Number.isInteger(index) || index < 0 || index > 7) return;
    if (Date.now() - (p.lastEmote ?? 0) < 900) return;      // anti-spam
    p.lastEmote = Date.now();
    this.broadcastMsg({ t: 'emote', id: p.id, i: index });
  }

  /** Position relayée aux autres. La borne suit la taille du monde du jeu. */
  move(p: P, x: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const R = this.worldRadius;
    p.x = Math.max(-R, Math.min(R, x));
    p.z = Math.max(-R, Math.min(R, z));
    p.moved = true;
  }

  /** Change la station : tout le monde entend la même chose, c'est le but. */
  setStation(p: P, id: string) {
    const st = STATIONS.find(x => x.id === id);
    if (!st || id === this.station) return;
    this.station = id;
    this.logEv('radio', `📻 ${p.name} met « ${st.name} ».`, { station: id });
    this.broadcast();
  }

  send(p: P, msg: unknown) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
  broadcastMsg(msg: unknown) { for (const p of this.players.values()) this.send(p, msg); }
  broadcast() {
    for (const p of this.players.values()) {
      this.send(p, { t: 'state', state: this.serialize(), youId: p.id });
    }
  }
  logEv(kind: string, text: string, data: Record<string, unknown> = {}) {
    this.broadcastMsg({ t: 'ev', kind, text, ...data });
  }
  protected reject(p: P, reason: string) {
    this.send(p, { t: 'ev', kind: 'reject', text: reason });
  }

  /** Les joueurs tels que le client les affiche (pastilles, avatars, scores). */
  protected serializePlayers() {
    return [...this.players.values()].map(p => ({
      id: p.id, name: p.name, connected: p.connected,
      color: p.color, hat: p.hat, x: p.x, z: p.z,
    }));
  }

  destroy() {
    if (this.posTimer) clearInterval(this.posTimer);
    if (this.timer) clearTimeout(this.timer);
  }
}
