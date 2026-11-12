// ============================================================
// Cœur du serveur de jeu, sans dépendance à Node : il tourne sur le vrai serveur
// (WebSocket) et dans le navigateur pour la version d'aperçu (bots compris).
// Le serveur fait autorité : salons, tirage des personnages, positions diffusées.
// ============================================================
import { PLAYER_AVATARS, MAX_PLAYERS, TICK_MS, type ClientMsg, type ServerMsg, type Settings, type PlayerInfo } from './protocol';

export interface Conn { send(m: ServerMsg): void }

interface Player {
  id: string; token: string; name: string; avatar: string;
  conn: Conn | null; room: Room | null; lastSeen: number;
  x: number; z: number; yaw: number; mv: number; t: number;
  bot?: { path: [number, number][]; i: number; speed: number };
}
interface Room {
  code: string; host: string; players: Player[]; phase: 'lobby' | 'night';
  settings: Settings; seed: number; startedAt: number;
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rid = (n: number) => Array.from({ length: n }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]).join('');
const BOT_NAMES = ['Lulu', 'Le Marseillais', 'Nina', 'Boris', 'Madame Rose', 'Kader', 'Ti-Jean'];
// rondes des bots : allées publiques du casino (aucune collision côté serveur)
const BOT_PATHS: [number, number][][] = [
  [[-.9, 12], [-.9, 3.2], [-3.2, 0], [-.9, -3.2], [-.9, -10], [.9, -10], [.9, -3.2], [3.2, 0], [.9, 3.2], [.9, 12]],
  [[-7.6, 12], [-7.6, -12], [-8.2, -12.6], [-7.6, -5], [-4.8, -5], [-7.6, -5], [-7.6, 7], [-4.8, 7], [-7.6, 7]],
  [[11.3, 9.5], [11.3, -11], [11.3, 9.5], [8, 9.5], [5, 7], [8, 9.5]],
];
const SPAWNS: [number, number][] = [[-1.6, 12.6], [0, 12.6], [1.6, 12.6], [-2.4, 13.6], [-.8, 13.6], [.8, 13.6], [2.4, 13.6], [0, 11.6]];

export class Core {
  rooms = new Map<string, Room>();
  byToken = new Map<string, Player>();
  private timer: ReturnType<typeof setInterval>;
  constructor() { this.timer = setInterval(() => this.tick(), TICK_MS); }
  stop() { clearInterval(this.timer); }

  /** Une connexion arrive : on renvoie le gestionnaire de messages et de fermeture. */
  open(conn: Conn) {
    let me: Player | null = null;
    return {
      message: (m: ClientMsg) => { me = this.handle(conn, me, m); },
      close: () => { if (me && me.conn === conn) { me.conn = null; me.lastSeen = Date.now(); if (me.room) this.broadcastLobby(me.room); } },
    };
  }

  private handle(conn: Conn, me: Player | null, m: ClientMsg): Player | null {
    const now = Date.now();
    if (m.t === 'ping') { conn.send({ t: 'pong', c: m.c }); return me; }
    if (m.t === 'hello') {
      const known = m.token ? this.byToken.get(m.token) : undefined;
      const p = known ?? this.newPlayer(m.name);
      if (m.name) p.name = clean(m.name);
      p.conn = conn; p.lastSeen = now;
      conn.send({ t: 'welcome', id: p.id, token: p.token });
      if (p.room) {
        this.broadcastLobby(p.room);
        if (p.room.phase === 'night') conn.send(this.startedMsg(p.room, true));
      }
      return p;
    }
    if (!me) { conn.send({ t: 'error', msg: 'Connexion pas encore prête.' }); return me; }
    me.lastSeen = now;
    switch (m.t) {
      case 'create': {
        this.leave(me);
        let code = '';
        do code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join(''); while (this.rooms.has(code));
        const room: Room = { code, host: me.id, players: [], phase: 'lobby', settings: { indics: 1, duree: 'normale' }, seed: 0, startedAt: 0 };
        this.rooms.set(code, room);
        this.join(me, room);
        break;
      }
      case 'join': {
        const room = this.rooms.get((m.code || '').toUpperCase().trim());
        if (!room) { conn.send({ t: 'error', msg: 'Aucune partie avec ce code.' }); break; }
        if (room.phase !== 'lobby' && !room.players.includes(me)) { conn.send({ t: 'error', msg: 'La nuit a déjà commencé.' }); break; }
        if (room.players.length >= MAX_PLAYERS && !room.players.includes(me)) { conn.send({ t: 'error', msg: 'La partie est complète (8 joueurs).' }); break; }
        this.leave(me);
        this.join(me, room);
        break;
      }
      case 'name': me.name = clean(m.name); if (me.room) this.broadcastLobby(me.room); break;
      case 'settings': {
        const r = me.room;
        if (!r || r.host !== me.id || r.phase !== 'lobby') break;
        const max = maxIndics(r.players.length);
        if (typeof m.indics === 'number') r.settings.indics = Math.max(0, Math.min(max, Math.round(m.indics)));
        if (m.duree === 'courte' || m.duree === 'normale' || m.duree === 'longue') r.settings.duree = m.duree;
        this.broadcastLobby(r);
        break;
      }
      case 'bot': {
        const r = me.room;
        if (!r || r.host !== me.id || r.phase !== 'lobby' || r.players.length >= MAX_PLAYERS) break;
        const b = this.newPlayer(BOT_NAMES[r.players.filter(p => p.bot).length % BOT_NAMES.length]);
        const path = BOT_PATHS[r.players.filter(p => p.bot).length % BOT_PATHS.length];
        b.bot = { path, i: Math.floor(Math.random() * path.length), speed: 1.2 + Math.random() * .4 };
        this.join(b, r);
        break;
      }
      case 'start': {
        const r = me.room;
        if (!r || r.host !== me.id || r.phase !== 'lobby') break;
        r.phase = 'night'; r.seed = Math.floor(Math.random() * 1e9); r.startedAt = now;
        r.settings.indics = Math.min(r.settings.indics, maxIndics(r.players.length));
        // tirage au sort des personnages : tous différents tant que possible
        const pool = shuffle([...PLAYER_AVATARS]);
        r.players.forEach((p, i) => {
          p.avatar = pool[i % pool.length];
          const s = SPAWNS[i % SPAWNS.length];
          if (p.bot) { const q = p.bot.path[p.bot.i]; p.x = q[0]; p.z = q[1]; } else { p.x = s[0]; p.z = s[1]; }
          p.yaw = 0; p.mv = 0; p.t = now;
        });
        this.broadcastLobby(r);
        for (const p of r.players) p.conn?.send(this.startedMsg(r, false));
        break;
      }
      case 'input': {
        const r = me.room;
        if (!r || r.phase !== 'night' || !Number.isFinite(m.x) || !Number.isFinite(m.z) || !Number.isFinite(m.yaw)) break;
        // garde-fou : on refuse un déplacement impossible (plus de 9 m/s)
        const dt = Math.max(.03, (now - me.t) / 1000), d = Math.hypot(m.x - me.x, m.z - me.z);
        if (d / dt < 9 || d > 30) { me.x = m.x; me.z = m.z; }
        me.yaw = m.yaw; me.mv = m.mv | 0; me.t = now;
        break;
      }
      case 'leave': this.leave(me); conn.send({ t: 'left' }); break;
    }
    return me;
  }

  private newPlayer(name: string): Player {
    const p: Player = { id: rid(8), token: rid(24), name: clean(name), avatar: '', conn: null, room: null, lastSeen: Date.now(), x: 0, z: 0, yaw: 0, mv: 0, t: 0 };
    this.byToken.set(p.token, p);
    return p;
  }
  private join(p: Player, r: Room) {
    if (!r.players.includes(p)) r.players.push(p);
    p.room = r;
    this.broadcastLobby(r);
  }
  private leave(p: Player) {
    const r = p.room;
    if (!r) return;
    r.players = r.players.filter(q => q !== p);
    p.room = null;
    const humans = r.players.filter(q => !q.bot);
    if (!humans.length) { for (const b of r.players) this.byToken.delete(b.token); this.rooms.delete(r.code); return; }
    if (r.host === p.id) r.host = humans[0].id;
    this.broadcastLobby(r);
    for (const q of r.players) q.conn?.send({ t: 'gone', id: p.id });
  }
  private info(r: Room): PlayerInfo[] {
    return r.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, online: !!p.conn || !!p.bot, bot: !!p.bot }));
  }
  private broadcastLobby(r: Room) {
    const msg: ServerMsg = { t: 'lobby', code: r.code, host: r.host, phase: r.phase, players: this.info(r), settings: r.settings, maxIndics: maxIndics(r.players.length) };
    for (const p of r.players) p.conn?.send(msg);
  }
  private startedMsg(r: Room, rejoin: boolean): ServerMsg {
    return { t: 'started', seed: r.seed, rejoin, elapsed: Date.now() - r.startedAt, players: this.info(r), pos: r.players.map(p => [p.id, p.x, p.z, p.yaw]) };
  }

  private tick() {
    const now = Date.now();
    for (const r of this.rooms.values()) {
      // les absents depuis plus de 2 minutes quittent la partie
      for (const p of [...r.players]) if (!p.bot && !p.conn && now - p.lastSeen > 120000) { this.leave(p); this.byToken.delete(p.token); }
      if (!this.rooms.has(r.code) || r.phase !== 'night') continue;
      for (const p of r.players) if (p.bot) this.moveBot(p, TICK_MS / 1000);
      const snap: ServerMsg = { t: 'snap', p: r.players.map(p => [p.id, round(p.x), round(p.z), round(p.yaw), p.mv]) };
      for (const p of r.players) p.conn?.send(snap);
    }
  }
  private moveBot(p: Player, dt: number) {
    const b = p.bot!, q = b.path[(b.i + 1) % b.path.length];
    const dx = q[0] - p.x, dz = q[1] - p.z, d = Math.hypot(dx, dz), step = b.speed * dt;
    if (d <= step) { p.x = q[0]; p.z = q[1]; b.i = (b.i + 1) % b.path.length; }
    else { p.x += dx / d * step; p.z += dz / d * step; p.yaw = Math.atan2(dx, dz); }
    p.mv = 1;
  }
}

export function maxIndics(n: number) { return n >= 8 ? 3 : n >= 6 ? 2 : 1; }
const clean = (s: string) => (s || 'Anonyme').replace(/[<>]/g, '').trim().slice(0, 16) || 'Anonyme';
const round = (v: number) => Math.round(v * 100) / 100;
function shuffle<T>(a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
