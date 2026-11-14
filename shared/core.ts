// ============================================================
// Le serveur de jeu : salons par code, manches, coups, éjections, bots.
// Tourne sur Node (en ligne) ou dans la page (version d'aperçu, avec des bots).
// Chaque joueur fait sa propre physique ; le serveur décide des touches et des vies.
// ============================================================
import type { ClientMsg, ServerMsg, PlayerInfo, Settings, SnapRow } from './protocol';
import { MAX_PLAYERS, TICK_MS } from './protocol';
import { SPAWNS, shoreR, segBlocked, terrainH, DROWN_Y } from './island';
import { MOVE, PUNCH, BLAST, RESPAWN_MS, SHIELD_MS, newBody, stepBody, knock, stunFor, type Body } from './fight';

export interface Conn { send(m: ServerMsg): void }
interface Bot { body: Body; think: number; strafe: number; jumpAt: number; blastAt: number; err: number }
interface Player {
  id: string; token: string; name: string; conn: Conn | null; bot: Bot | null; color: number; room: Room | null; goneAt: number;
  x: number; y: number; z: number; yaw: number; pitch: number; st: number; vx: number; vz: number; t: number;
  pct: number; lives: number; alive: boolean; out: boolean; respawnAt: number; shield: number;
  lastBy: string | null; lastAt: number; cdPunch: number; cdBlast: number; combo: number; comboAt: number;
}
interface Proj { pid: number; owner: string; s: number; x: number; y: number; z: number; dx: number; dy: number; dz: number; until: number }
interface Room { code: string; players: Player[]; phase: 'lobby' | 'play'; settings: Settings; projs: Proj[]; pid: number; startAt: number; out: string[] }

const BOT_NAMES = ['Coco', 'Mangue', 'Tiki', 'Corail', 'Moussaillon', 'Bernique', 'Requin', 'Pagaie'];
const rid = () => Math.random().toString(36).slice(2, 10);
const fwd = (yaw: number, pitch: number) => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });

export class Core {
  rooms = new Map<string, Room>();
  private byToken = new Map<string, Player>();
  private timer: ReturnType<typeof setInterval>;
  constructor() { this.timer = setInterval(() => this.tick(), TICK_MS); }
  stop() { clearInterval(this.timer); }

  open(conn: Conn) {
    let me: Player | null = null;
    return {
      message: (m: ClientMsg) => {
        if (m.t === 'hello') { me = this.hello(conn, m.token, m.name); return; }
        if (m.t === 'ping') { conn.send({ t: 'pong', c: m.c }); return; }
        if (me) this.handle(me, m);
      },
      close: () => { if (me && me.conn === conn) { me.conn = null; me.goneAt = Date.now(); } },
    };
  }

  private hello(conn: Conn, token: string | undefined, name: string) {
    let p = token ? this.byToken.get(token) : undefined;
    if (!p) {
      p = this.mk(String(name || 'Anonyme').slice(0, 16), null);
      this.byToken.set(p.token, p);
    }
    p.conn = conn; p.goneAt = 0;
    conn.send({ t: 'welcome', id: p.id, token: p.token });
    const r = p.room;
    if (r) {
      this.lobby(r);
      if (r.phase === 'play') {
        conn.send({ t: 'start', players: this.infos(r), lives: r.settings.lives, spawn: { x: p.x, y: p.y + .1, z: p.z, yaw: p.yaw }, at: Math.max(0, r.startAt - Date.now()) });
        this.stats(r);
      }
    }
    return p;
  }
  private mk(name: string, bot: Bot | null): Player {
    return {
      id: rid(), token: rid() + rid(), name, conn: null, bot, color: 0, room: null, goneAt: 0,
      x: 0, y: 1, z: 0, yaw: 0, pitch: 0, st: 0, vx: 0, vz: 0, t: 0, pct: 0, lives: 3, alive: true, out: false, respawnAt: 0, shield: 0,
      lastBy: null, lastAt: 0, cdPunch: 0, cdBlast: 0, combo: 0, comboAt: 0,
    };
  }

  private handle(me: Player, m: ClientMsg) {
    const r = me.room, now = Date.now();
    switch (m.t) {
      case 'name': me.name = String(m.name || '').slice(0, 16) || me.name; if (r) this.lobby(r); return;
      case 'create': {
        this.leave(me);
        let code = '';
        do code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); while (this.rooms.has(code));
        const room: Room = { code, players: [], phase: 'lobby', settings: { lives: 3 }, projs: [], pid: 0, startAt: 0, out: [] };
        this.rooms.set(code, room); this.addTo(room, me); return;
      }
      case 'join': {
        const room = this.rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) return this.err(me, 'Aucune partie avec ce code.');
        if (room === r) return;
        if (room.phase !== 'lobby') return this.err(me, 'La manche a déjà commencé : attends la suivante.');
        if (room.players.length >= MAX_PLAYERS) return this.err(me, 'La partie est pleine (8 joueurs).');
        this.leave(me); this.addTo(room, me); return;
      }
      case 'leave': this.leave(me); return;
    }
    if (!r) return;
    const host = r.players.find(p => !p.bot) === me;
    switch (m.t) {
      case 'bot':
        if (!host || r.phase !== 'lobby') return;
        if (m.add) { if (r.players.length < MAX_PLAYERS) this.addTo(r, this.mk(BOT_NAMES.find(n => !r.players.some(p => p.name === n)) ?? 'Bot', { body: newBody(0, 1, 0), think: 0, strafe: 1, jumpAt: 0, blastAt: 0, err: 0 })); }
        else { const b = [...r.players].reverse().find(p => p.bot); if (b) { r.players.splice(r.players.indexOf(b), 1); this.lobby(r); } }
        return;
      case 'settings': if (host && r.phase === 'lobby') { r.settings.lives = Math.max(1, Math.min(5, Math.round(m.lives) || 3)); this.lobby(r); } return;
      case 'start': if (host && r.phase === 'lobby') this.start(r); return;
      case 'in':
        if (r.phase !== 'play' || !me.alive || me.out) return;
        if (![m.x, m.y, m.z, m.yaw, m.pitch].every(Number.isFinite)) return;
        if (me.t) { const dt = Math.max(.02, (now - me.t) / 1000); me.vx = me.vx * .6 + (m.x - me.x) / dt * .4; me.vz = me.vz * .6 + (m.z - me.z) / dt * .4; }
        me.x = m.x; me.y = m.y; me.z = m.z; me.yaw = m.yaw; me.pitch = m.pitch; me.st = m.st | 0; me.t = now;
        if (me.y < DROWN_Y - .3) this.ko(r, me, now);
        return;
      case 'atk': if (r.phase === 'play') this.attack(r, me, m.k, m.x, m.y, m.z, m.yaw, m.pitch, m.s, now); return;
      case 'fell': if (r.phase === 'play' && me.alive) this.ko(r, me, now); return;
    }
  }

  private addTo(r: Room, p: Player) {
    const used = new Set(r.players.map(q => q.color));
    p.color = [0, 1, 2, 3, 4, 5, 6, 7].find(c => !used.has(c)) ?? 0;
    p.room = r; r.players.push(p); this.lobby(r);
  }
  private leave(p: Player) {
    const r = p.room; if (!r) return;
    r.players.splice(r.players.indexOf(p), 1); p.room = null;
    if (!r.players.some(q => !q.bot)) { this.rooms.delete(r.code); return; }
    if (r.phase === 'play') this.checkEnd(r);
    this.lobby(r);
  }
  private infos(r: Room): PlayerInfo[] {
    const host = r.players.find(p => !p.bot);
    return r.players.map(p => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot, host: p === host }));
  }
  private lobby(r: Room) { this.all(r, { t: 'lobby', code: r.code, players: this.infos(r), settings: r.settings, phase: r.phase }); }
  private stats(r: Room) { this.all(r, { t: 'stats', s: r.players.map(p => [p.id, Math.round(p.pct), p.lives]) }); }
  private all(r: Room, m: ServerMsg) { for (const p of r.players) p.conn?.send(m); }
  private err(p: Player, msg: string) { p.conn?.send({ t: 'error', msg }); }

  // ---------- la manche ----------
  private start(r: Room) {
    if (r.players.length < 2) return this.err(r.players.find(p => !p.bot)!, 'Il faut au moins 2 combattants : ajoute un bot ou invite un pote.');
    const now = Date.now();
    r.phase = 'play'; r.projs = []; r.out = []; r.startAt = now + 3500;
    const order = [...SPAWNS].sort(() => Math.random() - .5);
    r.players.forEach((p, i) => {
      const s = order[i % order.length];
      p.x = s.x; p.z = s.z; p.y = terrainH(s.x, s.z) + .05; p.yaw = Math.atan2(s.x, s.z); p.pitch = 0; p.t = 0;
      p.pct = 0; p.lives = r.settings.lives; p.alive = true; p.out = false; p.shield = 0; p.lastBy = null; p.cdPunch = 0; p.cdBlast = 0;
      if (p.bot) { p.bot.body = newBody(p.x, p.y, p.z); p.bot.blastAt = now + 4000 + Math.random() * 3000; }
    });
    const players = this.infos(r);
    for (const p of r.players) p.conn?.send({ t: 'start', players, lives: r.settings.lives, spawn: { x: p.x, y: p.y, z: p.z, yaw: p.yaw }, at: r.startAt - now });
    this.lobby(r); this.stats(r);
  }

  private attack(r: Room, me: Player, k: 'punch' | 'blast', x: number, y: number, z: number, yaw: number, pitch: number, s: number, now: number) {
    if (!me.alive || me.out || now < r.startAt) return;
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
    if (!me.bot && Math.hypot(x - me.x, z - me.z) < 3) { me.x = x; me.y = y; me.z = z; }
    me.yaw = yaw; me.pitch = pitch;
    const f = fwd(yaw, pitch), ex = me.x, ey = me.y + MOVE.eye, ez = me.z;
    if (k === 'punch') {
      if (now < me.cdPunch) return;
      me.cdPunch = now + PUNCH.cd * 1000 - 40;
      me.combo = now - me.comboAt < PUNCH.comboWindow * 1000 ? me.combo + 1 : 1; me.comboAt = now;
      const big = me.combo % 3 === 0;
      this.all(r, { t: 'atk', id: me.id, k, n: me.combo });
      for (const t of r.players) {
        if (t === me || !t.alive || t.out || now < t.shield) continue;
        const dx = t.x - ex, dy = (t.y + .95) - ey, dz = t.z - ez, d = Math.hypot(dx, dy, dz);
        if (d > PUNCH.range + MOVE.radius) continue;
        if ((dx * f.x + dy * f.y + dz * f.z) / Math.max(d, .01) < PUNCH.cos && d > .9) continue;
        const hl = Math.hypot(f.x, f.z) || 1;
        this.hit(r, t, me, 'punch', big ? PUNCH.dmg3 : PUNCH.dmg, big ? PUNCH.kb3 : PUNCH.kb, PUNCH.scale, f.x / hl, f.z / hl, now, ex + f.x * 1.2, ey + f.y * 1.2, ez + f.z * 1.2);
      }
    } else {
      if (now < me.cdBlast) return;
      me.cdBlast = now + BLAST.cd * 1000 - 60;
      const p: Proj = { pid: ++r.pid, owner: me.id, s, x: ex + f.x * .7, y: ey - .15 + f.y * .7, z: ez + f.z * .7, dx: f.x, dy: f.y, dz: f.z, until: now + BLAST.life * 1000 };
      r.projs.push(p);
      this.all(r, { t: 'atk', id: me.id, k, n: 1 });
      this.all(r, { t: 'proj', pid: p.pid, owner: me.id, s, x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz });
    }
  }

  /** Un coup qui porte : la jauge monte, puis on part en vol (d'autant plus loin que la jauge est haute). */
  private hit(r: Room, t: Player, by: Player, k: 'punch' | 'blast', dmg: number, base: number, scale: number, hx: number, hz: number, now: number, x: number, y: number, z: number) {
    t.pct = Math.min(999, t.pct + dmg);
    const kb = knock(base, scale, t.pct), stun = stunFor(kb);
    const ix = hx * kb, iz = hz * kb, iy = 2.5 + kb * .5;
    t.lastBy = by.id; t.lastAt = now;
    if (t.bot) { const b = t.bot.body; b.vx = ix; b.vz = iz; b.vy = Math.max(b.vy, iy); b.stun = stun; b.ground = false; b.dashT = 0; }
    this.all(r, { t: 'hit', id: t.id, by: by.id, k, pct: Math.round(t.pct), ix, iy, iz, stun, x, y, z, big: kb > 14 });
    this.stats(r);
  }

  private ko(r: Room, p: Player, now: number) {
    if (!p.alive || p.out) return;
    p.alive = false; p.lives--;
    const by = p.lastBy && p.lastBy !== p.id && now - p.lastAt < 8000 ? p.lastBy : null;
    this.all(r, { t: 'ko', id: p.id, by, lives: p.lives, x: p.x, z: p.z });
    if (p.lives <= 0) { p.out = true; r.out.push(p.id); } else p.respawnAt = now + RESPAWN_MS;
    this.stats(r);
    this.checkEnd(r);
  }
  private checkEnd(r: Room) {
    const left = r.players.filter(p => !p.out);
    if (left.length > 1) return;
    const winner = left[0]?.id ?? null;
    const ranking = [...(winner ? [winner] : []), ...[...r.out].reverse()].filter(id => r.players.some(p => p.id === id));
    r.phase = 'lobby'; r.projs = [];
    this.all(r, { t: 'end', winner, ranking });
    this.lobby(r);
  }
  private respawn(r: Room, p: Player, now: number) {
    // le point d'apparition le plus éloigné des autres
    let best = SPAWNS[0], bd = -1;
    for (const s of SPAWNS) {
      const d = Math.min(...r.players.filter(q => q !== p && q.alive).map(q => Math.hypot(q.x - s.x, q.z - s.z)), 99);
      if (d > bd) { bd = d; best = s; }
    }
    p.alive = true; p.pct = 0; p.shield = now + SHIELD_MS; p.lastBy = null;
    p.x = best.x; p.z = best.z; p.y = terrainH(best.x, best.z) + 9; p.yaw = Math.atan2(best.x, best.z); p.t = 0;
    if (p.bot) p.bot.body = newBody(p.x, p.y, p.z);
    this.all(r, { t: 'spawn', id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
    this.stats(r);
  }

  // ---------- les bots ----------
  private brain(r: Room, p: Player, now: number, dt: number) {
    const B = p.bot!, b = B.body;
    let tgt: Player | null = null, td = 1e9;
    for (const q of r.players) if (q !== p && q.alive && !q.out) { const d = Math.hypot(q.x - b.x, q.z - b.z); if (d < td) { td = d; tgt = q; } }
    let mx = 0, mz = 0, jump = false, dash = false;
    const go = now >= r.startAt;
    if (tgt && go) {
      const dx = tgt.x - b.x, dz = tgt.z - b.z, l = Math.hypot(dx, dz) || 1;
      if (now > B.think) { B.think = now + 600 + Math.random() * 900; B.strafe = Math.random() < .5 ? -1 : 1; B.err = (Math.random() - .5) * .25; }
      if (td > 1.7) { mx = dx / l; mz = dz / l; } else { mx = -dz / l * B.strafe * .7; mz = dx / l * B.strafe * .7; }
      p.yaw = Math.atan2(-dx, -dz) + B.err * .3;
      p.pitch = Math.atan2((tgt.y + .9) - (b.y + MOVE.eye), l) * .8;
      if (tgt.y > b.y + .8 && td < 5 && b.ground) jump = true;
      if (b.ground && Math.random() < .006) jump = true;
      if (td < 2.3 && now >= p.cdPunch && Math.random() < .5) this.attack(r, p, 'punch', b.x, b.y, b.z, p.yaw, p.pitch, 0, now);
      if (td > 5 && td < 17 && now > B.blastAt && now >= p.cdBlast) {
        const lead = td / BLAST.speed, ax = tgt.x + tgt.vx * lead * .8 - b.x, az = tgt.z + tgt.vz * lead * .8 - b.z, al = Math.hypot(ax, az);
        const ay = (tgt.y + .9) - (b.y + MOVE.eye);
        if (!segBlocked(b.x, b.y + MOVE.eye, b.z, tgt.x, tgt.y + 1, tgt.z)) {
          this.attack(r, p, 'blast', b.x, b.y, b.z, Math.atan2(-ax, -az) + B.err * .2, Math.atan2(ay, al), 0, now);
          B.blastAt = now + 2500 + Math.random() * 4000;
        }
      }
    }
    // ne pas se jeter à l'eau ; et si on a été éjecté, essayer de revenir (double saut + ruée vers le centre)
    const rr = Math.hypot(b.x, b.z) / shoreR(Math.atan2(b.z, b.x));
    if (rr > .74) { const cl = Math.hypot(b.x, b.z) || 1, w = Math.min(1, (rr - .74) * 6); mx = mx * (1 - w) - b.x / cl * w; mz = mz * (1 - w) - b.z / cl * w; }
    if (!b.ground && b.stun < .1 && rr > .95) {
      if (b.airJumps > 0 && b.vy < 0) jump = true; else if (b.dashCd <= 0 && b.vy < -2) dash = true;
    }
    if (stepBody(b, { mx, mz, jump, dash }, dt)) { p.x = b.x; p.y = b.y; p.z = b.z; this.ko(r, p, now); return; }
    p.vx = b.vx; p.vz = b.vz;
    p.x = b.x; p.y = b.y; p.z = b.z;
    p.st = (b.ground ? 1 : 0) | (b.dashT > 0 ? 2 : 0) | (b.stun > 0 ? 4 : 0);
  }

  // ---------- projectiles ----------
  private stepProjs(r: Room, now: number, dt: number) {
    for (const p of [...r.projs]) {
      let boom = now > p.until, hitT: Player | null = null;
      const n = 4, step = BLAST.speed * dt / n;
      for (let i = 0; i < n && !boom; i++) {
        p.x += p.dx * step; p.y += p.dy * step; p.z += p.dz * step;
        if (p.y < Math.max(0, terrainH(p.x, p.z)) || segBlocked(p.x, p.y, p.z, p.x, p.y + .01, p.z)) { boom = true; break; }
        for (const t of r.players) {
          if (t.id === p.owner || !t.alive || t.out) continue;
          const cy = Math.max(t.y + .3, Math.min(t.y + 1.45, p.y));
          if (Math.hypot(p.x - t.x, p.y - cy, p.z - t.z) < BLAST.radius + MOVE.radius) { boom = true; hitT = t; break; }
        }
      }
      if (!boom) continue;
      r.projs.splice(r.projs.indexOf(p), 1);
      this.all(r, { t: 'boom', pid: p.pid, x: p.x, y: p.y, z: p.z });
      const owner = r.players.find(q => q.id === p.owner);
      if (!owner) continue;
      for (const t of r.players) {
        if (t === owner || !t.alive || t.out || now < t.shield) continue;
        const d = t === hitT ? 0 : Math.hypot(t.x - p.x, (t.y + .9) - p.y, t.z - p.z);
        if (d > BLAST.splash) continue;
        const f = t === hitT ? 1 : 1 - d / BLAST.splash * .6;
        let hx = t.x - p.x, hz = t.z - p.z, hl = Math.hypot(hx, hz);
        if (hl < .2) { hx = p.dx; hz = p.dz; hl = Math.hypot(hx, hz) || 1; }
        this.hit(r, t, owner, 'blast', Math.round(BLAST.dmg * f), BLAST.kb * f, BLAST.scale * f, hx / hl, hz / hl, now, p.x, p.y, p.z);
      }
    }
  }

  private tick() {
    const now = Date.now(), dt = TICK_MS / 1000;
    for (const [code, r] of this.rooms) {
      // personne de connecté depuis 2 minutes : on ferme
      if (!r.players.some(p => !p.bot && (p.conn || now - p.goneAt < 120000))) { this.rooms.delete(code); continue; }
      if (r.phase !== 'play') continue;
      for (const p of r.players) {
        if (p.out) continue;
        if (!p.alive) { if (now >= p.respawnAt) this.respawn(r, p, now); continue; }
        if (p.bot) this.brain(r, p, now, dt);
      }
      if (r.phase !== 'play') continue;
      this.stepProjs(r, now, dt);
      const rows: SnapRow[] = r.players.map(p => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2),
        (p.st & 7) | (now < p.shield ? 8 : 0) | (!p.alive || p.out ? 16 : 0)]);
      this.all(r, { t: 'snap', p: rows });
    }
  }
}
