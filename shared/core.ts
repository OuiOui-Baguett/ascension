// ============================================================
// Le serveur de jeu : salons par code, manches, classes, coups, éjections, bots.
// Tourne sur Node (en ligne) ou dans la page (version d'aperçu, avec des bots).
// Chaque joueur fait sa propre physique ; le serveur décide des touches et des vies.
// ============================================================
import type { ClientMsg, ServerMsg, PlayerInfo, Settings, SnapRow } from './protocol';
import { MAX_PLAYERS, TICK_MS, teamsFor } from './protocol';
import { SPAWNS, segBlocked, terrainH, DROWN_Y, nearestLand, aimPoint, solidAt, DYN, type Solid } from './island';
import { MOVE, RESPAWN_MS, SHIELD_MS, newBody, stepBody, knock, stunFor, type Body } from './fight';
import { CLASSES, CLASS_IDS, FIREBALL, GEYSER, METEOR, COLOSSE_PUNCH, WALL, QUAKE, ULT, type ClassId, type Ability } from './classes';

export interface Conn { send(m: ServerMsg): void }
interface Bot { body: Body; think: number; strafe: number; powAt: number; err: number }
interface Player {
  id: string; token: string; name: string; conn: Conn | null; bot: Bot | null; color: number; team: number; cls: ClassId; room: Room | null; goneAt: number;
  x: number; y: number; z: number; yaw: number; pitch: number; st: number; vx: number; vz: number; t: number;
  pct: number; lives: number; alive: boolean; out: boolean; respawnAt: number; shield: number; ult: number;
  lastBy: string | null; lastAt: number; cd: Record<Ability, number>; combo: number; comboAt: number;
}
interface Proj { pid: number; owner: string; s: number; x: number; y: number; z: number; dx: number; dy: number; dz: number; until: number }
interface Pending { at: number; kind: 'geyser' | 'meteor'; owner: string; x: number; y: number; z: number }
interface Wall { id: number; until: number; parts: Solid[] }
interface Room {
  code: string; players: Player[]; phase: 'lobby' | 'play'; settings: Settings; startAt: number; out: string[];
  projs: Proj[]; pid: number; pending: Pending[]; walls: Wall[];
}

const BOT_NAMES = ['Coco', 'Mangue', 'Tiki', 'Corail', 'Moussaillon', 'Bernique', 'Requin', 'Pagaie'];
const rid = () => Math.random().toString(36).slice(2, 10);
const fwd = (yaw: number, pitch: number) => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
const r2 = (v: number) => Math.round(v * 100) / 100;

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
    if (!p) { p = this.mk(String(name || 'Anonyme').slice(0, 16), null); this.byToken.set(p.token, p); }
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
      id: rid(), token: rid() + rid(), name, conn: null, bot, color: 0, team: 0, cls: 'brasier', room: null, goneAt: 0,
      x: 0, y: 1, z: 0, yaw: 0, pitch: 0, st: 0, vx: 0, vz: 0, t: 0, pct: 0, lives: 3, alive: true, out: false, respawnAt: 0, shield: 0, ult: 0,
      lastBy: null, lastAt: 0, cd: { atk: 0, pow: 0, ult: 0 }, combo: 0, comboAt: 0,
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
        const room: Room = { code, players: [], phase: 'lobby', settings: { lives: 3, mode: 'ffa' }, startAt: 0, out: [], projs: [], pid: 0, pending: [], walls: [] };
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
      case 'class': if (CLASSES[m.c as ClassId] && (!r || r.phase === 'lobby')) { me.cls = m.c as ClassId; if (r) this.lobby(r); } return;
    }
    if (!r) return;
    const host = r.players.find(p => !p.bot) === me;
    switch (m.t) {
      case 'bot':
        if (!host || r.phase !== 'lobby') return;
        if (m.add) {
          if (r.players.length < MAX_PLAYERS) {
            const b = this.mk(BOT_NAMES.find(n => !r.players.some(p => p.name === n)) ?? 'Bot', { body: newBody(0, 1, 0), think: 0, strafe: 1, powAt: 0, err: 0 });
            b.cls = CLASS_IDS[r.players.filter(p => p.bot).length % CLASS_IDS.length];
            this.addTo(r, b);
          }
        } else { const b = [...r.players].reverse().find(p => p.bot); if (b) { r.players.splice(r.players.indexOf(b), 1); this.lobby(r); } }
        return;
      case 'settings':
        if (!host || r.phase !== 'lobby') return;
        if (m.lives !== undefined) r.settings.lives = Math.max(1, Math.min(5, Math.round(m.lives) || 3));
        if (m.mode === 'ffa' || m.mode === 'duo' || m.mode === 'coop') r.settings.mode = m.mode;
        this.lobby(r); return;
      case 'start': if (host && r.phase === 'lobby') this.start(r); return;
      case 'in':
        if (r.phase !== 'play' || !me.alive || me.out) return;
        if (![m.x, m.y, m.z, m.yaw, m.pitch].every(Number.isFinite)) return;
        if (me.t) { const dt = Math.max(.02, (now - me.t) / 1000); me.vx = me.vx * .6 + (m.x - me.x) / dt * .4; me.vz = me.vz * .6 + (m.z - me.z) / dt * .4; }
        me.x = m.x; me.y = m.y; me.z = m.z; me.yaw = m.yaw; me.pitch = m.pitch; me.st = m.st | 0; me.t = now;
        if (me.y < DROWN_Y - .3) this.ko(r, me, now);
        return;
      case 'atk': if (r.phase === 'play') { this.useWalls(r); this.ability(r, me, m.k, m.x, m.y, m.z, m.yaw, m.pitch, m.s, now); } return;
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
    if (!r.players.some(q => !q.bot)) { this.clearRoom(r); this.rooms.delete(r.code); return; }
    if (r.phase === 'play') this.checkEnd(r);
    this.lobby(r);
  }
  private infos(r: Room): PlayerInfo[] {
    const host = r.players.find(p => !p.bot), teams = r.phase === 'play' ? r.players.map(p => p.team) : teamsFor(r.players, r.settings.mode);
    return r.players.map((p, i) => ({ id: p.id, name: p.name, color: p.color, bot: !!p.bot, host: p === host, team: teams[i], cls: p.cls }));
  }
  private lobby(r: Room) { this.all(r, { t: 'lobby', code: r.code, players: this.infos(r), settings: r.settings, phase: r.phase }); }
  private stats(r: Room) { this.all(r, { t: 'stats', s: r.players.map(p => [p.id, Math.round(p.pct), p.lives, Math.floor(p.ult)]) }); }
  private all(r: Room, m: ServerMsg) { for (const p of r.players) p.conn?.send(m); }
  private err(p: Player, msg: string) { p.conn?.send({ t: 'error', msg }); }
  private clearRoom(r: Room) { r.walls = []; r.projs = []; r.pending = []; this.useWalls(r); }
  /** Les murs de roche n'existent que dans leur salon : on charge ceux du salon traité dans la physique. */
  private useWalls(r: Room) { DYN.splice(0, DYN.length, ...r.walls.flatMap(w => w.parts)); }

  // ---------- la manche ----------
  private start(r: Room) {
    if (r.players.length < 2) return this.err(r.players.find(p => !p.bot)!, 'Il faut au moins 2 combattants : ajoute un bot ou invite un pote.');
    const now = Date.now();
    const teams = teamsFor(r.players, r.settings.mode);
    if (new Set(teams).size < 2) return this.err(r.players.find(p => !p.bot)!, r.settings.mode === 'coop' ? 'En « potes contre bots », ajoute au moins un bot.' : 'Il faut au moins 2 équipes.');
    r.players.forEach((p, i) => { p.team = teams[i]; });
    this.clearRoom(r);
    r.phase = 'play'; r.out = []; r.startAt = now + 3500;
    // les coéquipiers apparaissent côte à côte
    const order = [...SPAWNS].sort(() => Math.random() - .5), byTeam = [...r.players].sort((a, b) => a.team - b.team);
    r.players.forEach(p => {
      const s = order[byTeam.indexOf(p) % order.length];
      p.x = s.x; p.z = s.z; p.y = terrainH(s.x, s.z) + .05; p.yaw = Math.atan2(s.x, s.z); p.pitch = 0; p.t = 0;
      p.pct = 0; p.lives = r.settings.lives; p.alive = true; p.out = false; p.shield = 0; p.lastBy = null; p.cd = { atk: 0, pow: now + 2000, ult: 0 }; p.ult = 0;
      if (p.bot) { p.bot.body = newBody(p.x, p.y, p.z); p.bot.powAt = now + 4000 + Math.random() * 3000; }
    });
    const players = this.infos(r);
    for (const p of r.players) p.conn?.send({ t: 'start', players, lives: r.settings.lives, spawn: { x: p.x, y: p.y, z: p.z, yaw: p.yaw }, at: r.startAt - now });
    this.lobby(r); this.stats(r);
  }

  private enemies(r: Room, me: Player) { return r.players.filter(t => t !== me && t.team !== me.team && t.alive && !t.out); }

  /** Frapper / Pouvoir / Ultime, selon la classe. */
  private ability(r: Room, me: Player, k: Ability, x: number, y: number, z: number, yaw: number, pitch: number, s: number, now: number) {
    if (!me.alive || me.out || now < r.startAt) return;
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
    if (!me.bot && Math.hypot(x - me.x, z - me.z) < 3) { me.x = x; me.y = y; me.z = z; }
    me.yaw = yaw; me.pitch = pitch;
    const C = CLASSES[me.cls];
    if (k === 'ult') { if (me.ult < 100) return; me.ult = 0; this.stats(r); }
    else {
      if (now < me.cd[k]) return;
      me.cd[k] = now + (k === 'atk' ? C.atk.cd : C.pow.cd) * 1000 - 60;
    }
    const f = fwd(yaw, pitch), ex = me.x, ey = me.y + MOVE.eye, ez = me.z;
    if (me.cls === 'colosse' && k === 'atk') { me.combo = now - me.comboAt < 800 ? me.combo + 1 : 1; me.comboAt = now; }
    this.all(r, { t: 'atk', id: me.id, k, n: me.combo });

    if (me.cls === 'brasier') {
      if (k === 'atk') {
        const p: Proj = { pid: ++r.pid, owner: me.id, s, x: ex + f.x * .6, y: ey - .12 + f.y * .6, z: ez + f.z * .6, dx: f.x, dy: f.y, dz: f.z, until: now + FIREBALL.life * 1000 };
        r.projs.push(p);
        this.all(r, { t: 'proj', pid: p.pid, owner: me.id, s, x: r2(p.x), y: r2(p.y), z: r2(p.z), dx: r2(p.dx), dy: r2(p.dy), dz: r2(p.dz) });
      } else {
        const kind = k === 'pow' ? 'geyser' : 'meteor', range = kind === 'geyser' ? GEYSER.range : METEOR.range, delay = kind === 'geyser' ? GEYSER.delay : METEOR.delay;
        const t = aimPoint(ex, ey, ez, f.x, f.y, f.z, range);
        r.pending.push({ at: now + delay, kind, owner: me.id, x: t.x, y: t.y, z: t.z });
        this.all(r, { t: 'fx', k: 'warn', kind, x: r2(t.x), y: r2(t.y), z: r2(t.z), r: kind === 'geyser' ? GEYSER.radius : METEOR.radius, ms: delay, id: me.id });
      }
    } else {
      if (k === 'atk') {
        const big = me.combo % 3 === 0, P = COLOSSE_PUNCH;
        for (const t of this.enemies(r, me)) {
          if (now < t.shield) continue;
          const dx = t.x - ex, dy = (t.y + .95) - ey, dz = t.z - ez, d = Math.hypot(dx, dy, dz);
          if (d > P.range + MOVE.radius) continue;
          if ((dx * f.x + dy * f.y + dz * f.z) / Math.max(d, .01) < P.cos && d > .9) continue;
          const hl = Math.hypot(f.x, f.z) || 1;
          this.hit(r, t, me, big ? 'punch3' : 'punch', big ? P.dmg3 : P.dmg, big ? P.kb3 : P.kb, big ? P.scale3 : P.scale, f.x / hl, f.z / hl, .5, now, ex + f.x * 1.3, ey + f.y * 1.3, ez + f.z * 1.3);
        }
      } else if (k === 'pow') {
        // mur de roche : 4 piliers alignés, perpendiculaires à la visée
        const hl = Math.hypot(f.x, f.z) || 1, fx = f.x / hl, fz = f.z / hl, cx = me.x + fx * WALL.dist, cz = me.z + fz * WALL.dist;
        const g = terrainH(cx, cz), parts: Solid[] = [];
        for (let i = 0; i < 4; i++) {
          const o = (i - 1.5) / 3 * (WALL.width - .9), px = cx - fz * o, pz = cz + fx * o;
          parts.push({ k: 'c', x: px, z: pz, r: .58, base: terrainH(px, pz) - 1, top: Math.max(g, terrainH(px, pz)) + WALL.height, tag: 'mur' });
        }
        // le mur sort de terre et repousse ceux qui sont devant
        for (const t of this.enemies(r, me)) {
          if (now < t.shield) continue;
          const rx = t.x - cx, rz = t.z - cz, along = rx * fx + rz * fz, side = Math.abs(-rx * fz + rz * fx);
          if (along > -.9 && along < 1.6 && side < WALL.width / 2 + .4) this.hit(r, t, me, 'wall', 4, WALL.push, .05, fx, fz, .7, now, t.x, t.y + 1, t.z);
        }
        const w: Wall = { id: ++r.pid, until: now + WALL.life, parts };
        r.walls.push(w); this.useWalls(r);
        this.all(r, { t: 'fx', k: 'wall', kind: 'wall', x: r2(cx), y: r2(g), z: r2(cz), r: Math.atan2(fx, fz), ms: WALL.life, id: String(w.id) });
      } else {
        // séisme : ceux qui touchent terre dans le rayon décollent
        this.all(r, { t: 'fx', k: 'quake', kind: 'quake', x: r2(me.x), y: r2(me.y), z: r2(me.z), r: QUAKE.radius, ms: 0, id: me.id });
        for (const t of this.enemies(r, me)) {
          if (now < t.shield) continue;
          const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz);
          const grounded = t.bot ? t.bot.body.ground : !!(t.st & 1) || t.y - terrainH(t.x, t.z) < .4;
          if (d > QUAKE.radius || !grounded) continue;
          const f2 = 1 - d / QUAKE.radius * .4;
          this.hit(r, t, me, 'quake', Math.round(QUAKE.dmg * f2), QUAKE.kb * f2, QUAKE.scale, dx / (d || 1), dz / (d || 1), .75, now, t.x, t.y + .5, t.z);
        }
      }
    }
  }

  /** Un coup qui porte : la jauge monte, puis on part en vol (d'autant plus loin que la jauge est haute et qu'on est léger). */
  private hit(r: Room, t: Player, by: Player, k: string, dmg: number, base: number, scale: number, hx: number, hz: number, up: number, now: number, x: number, y: number, z: number) {
    t.pct = Math.min(999, t.pct + dmg);
    by.ult = Math.min(100, by.ult + dmg * ULT.perDmg);
    const kb = knock(base, scale, t.pct) * CLASSES[t.cls].weight, stun = stunFor(kb);
    const ix = hx * kb, iz = hz * kb, iy = 2.5 + kb * up;
    t.lastBy = by.id; t.lastAt = now;
    if (t.bot) { const b = t.bot.body; b.vx = ix; b.vz = iz; b.vy = Math.max(b.vy, iy); b.stun = stun; b.ground = false; b.dashT = 0; }
    this.all(r, { t: 'hit', id: t.id, by: by.id, k, pct: Math.round(t.pct), ix: r2(ix), iy: r2(iy), iz: r2(iz), stun: r2(stun), x: r2(x), y: r2(y), z: r2(z), big: kb > 14 });
    this.stats(r);
  }

  private ko(r: Room, p: Player, now: number) {
    if (!p.alive || p.out) return;
    p.alive = false; p.lives--;
    const by = p.lastBy && p.lastBy !== p.id && now - p.lastAt < 8000 ? p.lastBy : null;
    if (by) { const k = r.players.find(q => q.id === by); if (k) k.ult = Math.min(100, k.ult + 25); }
    this.all(r, { t: 'ko', id: p.id, by, lives: p.lives, x: p.x, z: p.z });
    if (p.lives <= 0) { p.out = true; r.out.push(p.id); } else p.respawnAt = now + RESPAWN_MS;
    this.stats(r);
    this.checkEnd(r);
  }
  private checkEnd(r: Room) {
    const left = r.players.filter(p => !p.out);
    if (new Set(left.map(p => p.team)).size > 1) return;
    const winners = left.length ? r.players.filter(p => p.team === left[0].team).map(p => p.id) : [];
    const winner = left[0]?.id ?? null;
    const ranking = [...winners, ...[...r.out].reverse().filter(id => !winners.includes(id))].filter(id => r.players.some(p => p.id === id));
    r.phase = 'lobby'; this.clearRoom(r);
    this.all(r, { t: 'end', winner, winners, ranking });
    this.lobby(r);
  }
  private respawn(r: Room, p: Player, now: number) {
    let best = SPAWNS[0], bd = -1;
    for (const s of SPAWNS) {
      const d = Math.min(...r.players.filter(q => q !== p && q.alive && q.team !== p.team).map(q => Math.hypot(q.x - s.x, q.z - s.z)), 99);
      if (d > bd) { bd = d; best = s; }
    }
    p.alive = true; p.pct = 0; p.shield = now + SHIELD_MS; p.lastBy = null;
    p.x = best.x; p.z = best.z; p.y = terrainH(best.x, best.z) + 9; p.yaw = Math.atan2(best.x, best.z); p.t = 0;
    if (p.bot) p.bot.body = newBody(p.x, p.y, p.z);
    this.all(r, { t: 'spawn', id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw) });
    this.stats(r);
  }

  // ---------- effets à retardement (geyser, météore) ----------
  private stepPending(r: Room, now: number) {
    for (const e of [...r.pending]) {
      if (now < e.at) continue;
      r.pending.splice(r.pending.indexOf(e), 1);
      const owner = r.players.find(p => p.id === e.owner);
      this.all(r, { t: 'fx', k: e.kind, kind: e.kind, x: r2(e.x), y: r2(e.y), z: r2(e.z), r: e.kind === 'geyser' ? GEYSER.radius : METEOR.radius, ms: 0, id: e.owner });
      if (!owner) continue;
      for (const t of this.enemies(r, owner)) {
        if (now < t.shield) continue;
        const dx = t.x - e.x, dz = t.z - e.z, dy = t.y - e.y, d = Math.hypot(dx, dz);
        if (e.kind === 'geyser') {
          if (d > GEYSER.radius || dy > 3 || dy < -1.5) continue;
          this.hit(r, t, owner, 'geyser', GEYSER.dmg, GEYSER.kb, GEYSER.scale, dx / (d || 1), dz / (d || 1), 0, now, t.x, t.y + .3, t.z);
          // le geyser envoie surtout vers le haut
          const up = GEYSER.up + t.pct * .045;
          if (t.bot) t.bot.body.vy = Math.max(t.bot.body.vy, up);
          else t.conn?.send({ t: 'hit', id: t.id, by: owner.id, k: 'lift', pct: Math.round(t.pct), ix: 0, iy: r2(up), iz: 0, stun: .4, x: t.x, y: t.y, z: t.z, big: false });
        } else {
          const d3 = Math.hypot(dx, dy, dz); if (d3 > METEOR.radius) continue;
          const f = 1 - d3 / METEOR.radius * .5;
          this.hit(r, t, owner, 'meteor', Math.round(METEOR.dmg * f), METEOR.kb * f, METEOR.scale, dx / (d || 1), dz / (d || 1), .6, now, t.x, t.y + .5, t.z);
        }
      }
    }
    for (const w of [...r.walls]) if (now > w.until) {
      r.walls.splice(r.walls.indexOf(w), 1); this.useWalls(r);
      this.all(r, { t: 'fx', k: 'wallEnd', kind: 'wall', x: 0, y: 0, z: 0, r: 0, ms: 0, id: String(w.id) });
    }
  }

  // ---------- boules de feu ----------
  private stepProjs(r: Room, now: number, dt: number) {
    for (const p of [...r.projs]) {
      let boom = now > p.until, hitT: Player | null = null;
      const owner = r.players.find(q => q.id === p.owner);
      const n = 4, step = FIREBALL.speed * dt / n;
      for (let i = 0; i < n && !boom; i++) {
        p.x += p.dx * step; p.y += p.dy * step; p.z += p.dz * step;
        if (p.y < 0 || solidAt(p.x, p.y, p.z)) { boom = true; break; }
        for (const t of r.players) {
          if (t.id === p.owner || (owner && t.team === owner.team) || !t.alive || t.out) continue;
          const cy = Math.max(t.y + .3, Math.min(t.y + 1.45, p.y));
          if (Math.hypot(p.x - t.x, p.y - cy, p.z - t.z) < FIREBALL.radius + MOVE.radius) { boom = true; hitT = t; break; }
        }
      }
      if (!boom) continue;
      r.projs.splice(r.projs.indexOf(p), 1);
      this.all(r, { t: 'boom', pid: p.pid, x: r2(p.x), y: r2(p.y), z: r2(p.z) });
      if (!owner) continue;
      for (const t of this.enemies(r, owner)) {
        if (now < t.shield) continue;
        const d = t === hitT ? 0 : Math.hypot(t.x - p.x, (t.y + .9) - p.y, t.z - p.z);
        if (d > FIREBALL.splash) continue;
        let hx = t.x - p.x, hz = t.z - p.z, hl = Math.hypot(hx, hz);
        if (hl < .2 || t === hitT) { hx = p.dx; hz = p.dz; hl = Math.hypot(hx, hz) || 1; }
        this.hit(r, t, owner, 'fire', FIREBALL.dmg, FIREBALL.kb, FIREBALL.scale, hx / hl, hz / hl, .45, now, p.x, p.y, p.z);
      }
    }
  }

  // ---------- les bots ----------
  private brain(r: Room, p: Player, now: number, dt: number) {
    const B = p.bot!, b = B.body;
    let tgt: Player | null = null, td = 1e9;
    for (const q of this.enemies(r, p)) { const d = Math.hypot(q.x - b.x, q.z - b.z); if (d < td) { td = d; tgt = q; } }
    let mx = 0, mz = 0, jump = false, dash = false;
    const go = now >= r.startAt, ranged = p.cls === 'brasier';
    if (tgt && go) {
      const dx = tgt.x - b.x, dz = tgt.z - b.z, l = Math.hypot(dx, dz) || 1;
      if (now > B.think) { B.think = now + 600 + Math.random() * 900; B.strafe = Math.random() < .5 ? -1 : 1; B.err = (Math.random() - .5) * .25; }
      const want = ranged ? 8 : 1.6;            // le Brasier garde ses distances
      if (td > want + 2) { mx = dx / l; mz = dz / l; }
      else if (ranged && td < want - 3) { mx = -dx / l * .8 - dz / l * B.strafe * .5; mz = -dz / l * .8 + dx / l * B.strafe * .5; }
      else { mx = -dz / l * B.strafe * .7; mz = dx / l * B.strafe * .7; }
      const lead = ranged ? td / FIREBALL.speed : 0;
      const ax = tgt.x + tgt.vx * lead * .8 - b.x, az = tgt.z + tgt.vz * lead * .8 - b.z, al = Math.hypot(ax, az) || 1;
      p.yaw = Math.atan2(-ax, -az) + B.err * .25;
      p.pitch = Math.atan2((tgt.y + .9) - (b.y + MOVE.eye), al);
      if (tgt.y > b.y + .8 && td < 5 && b.ground) jump = true;
      if (b.ground && Math.random() < .006) jump = true;
      const clear = !segBlocked(b.x, b.y + MOVE.eye, b.z, tgt.x, tgt.y + 1, tgt.z);
      if (ranged) {
        if (td < 26 && clear && now >= p.cd.atk && Math.random() < .35) this.ability(r, p, 'atk', b.x, b.y, b.z, p.yaw, p.pitch, 0, now);
        if (td < GEYSER.range - 2 && now >= p.cd.pow && now > B.powAt && clear) { this.ability(r, p, 'pow', b.x, b.y, b.z, p.yaw, p.pitch, 0, now); B.powAt = now + 2000 + Math.random() * 3000; }
        if (p.ult >= 100 && td < 24 && clear) this.ability(r, p, 'ult', b.x, b.y, b.z, p.yaw, p.pitch, 0, now);
      } else {
        if (td < 2.6 && now >= p.cd.atk && Math.random() < .5) this.ability(r, p, 'atk', b.x, b.y, b.z, p.yaw, p.pitch, 0, now);
        if (td < 3.2 && now >= p.cd.pow && now > B.powAt) { this.ability(r, p, 'pow', b.x, b.y, b.z, p.yaw, 0, 0, now); B.powAt = now + 3000 + Math.random() * 3000; }
        if (p.ult >= 100 && this.enemies(r, p).filter(q => Math.hypot(q.x - b.x, q.z - b.z) < QUAKE.radius * .8).length) this.ability(r, p, 'ult', b.x, b.y, b.z, p.yaw, 0, 0, now);
        if (td > 6 && td < 12 && b.dashCd <= 0 && Math.random() < .01) dash = true;   // le Colosse fonce
      }
    }
    // ne pas se jeter à l'eau ; et si on a été éjecté, essayer de revenir (double saut + ruée vers la terre)
    const land = nearestLand(b.x, b.z);
    const ahead = terrainH(b.x + mx * 2.2, b.z + mz * 2.2), onBridge = solidAt(b.x + mx * 2.2, .7, b.z + mz * 2.2);
    if (land.edge > .72 || (ahead < .2 && !onBridge)) {
      const cx = land.x - b.x, cz = land.z - b.z, cl = Math.hypot(cx, cz) || 1, w = Math.min(1, Math.max(.4, (land.edge - .72) * 6));
      mx = mx * (1 - w) + cx / cl * w; mz = mz * (1 - w) + cz / cl * w;
    }
    if (!b.ground && b.stun < .1 && land.edge > .95 && (B.err > -.06)) {
      if (b.airJumps > 0 && b.vy < 0) jump = true; else if (b.dashCd <= 0 && b.vy < -2) dash = true;
    }
    if (stepBody(b, { mx, mz, jump, dash }, dt, CLASSES[p.cls].speed)) { p.x = b.x; p.y = b.y; p.z = b.z; this.ko(r, p, now); return; }
    p.vx = b.vx; p.vz = b.vz;
    p.x = b.x; p.y = b.y; p.z = b.z;
    p.st = (b.ground ? 1 : 0) | (b.dashT > 0 ? 2 : 0) | (b.stun > 0 ? 4 : 0);
  }

  private tick() {
    const now = Date.now(), dt = TICK_MS / 1000;
    for (const [code, r] of this.rooms) {
      if (!r.players.some(p => !p.bot && (p.conn || now - p.goneAt < 120000))) { this.clearRoom(r); this.rooms.delete(code); continue; }
      if (r.phase !== 'play') continue;
      this.useWalls(r);
      let statsDirty = false;
      for (const p of r.players) {
        if (p.out) continue;
        if (!p.alive) { if (now >= p.respawnAt) this.respawn(r, p, now); continue; }
        if (now > r.startAt && p.ult < 100) { const before = Math.floor(p.ult); p.ult = Math.min(100, p.ult + ULT.perSec * dt); if (Math.floor(p.ult / 10) !== Math.floor(before / 10)) statsDirty = true; }
        if (p.bot) this.brain(r, p, now, dt);
      }
      if (r.phase !== 'play') continue;
      this.stepProjs(r, now, dt);
      this.stepPending(r, now);
      if (statsDirty) this.stats(r);
      const rows: SnapRow[] = r.players.map(p => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch),
        (p.st & 7) | (now < p.shield ? 8 : 0) | (!p.alive || p.out ? 16 : 0)]);
      this.all(r, { t: 'snap', p: rows });
    }
  }
}
