// ============================================================
// Cœur du serveur de jeu, sans dépendance à Node : il tourne sur le vrai serveur
// (WebSocket) et dans le navigateur pour la version d'aperçu (bots compris).
// Le serveur fait autorité : salons, tirage des personnages, positions diffusées.
// ============================================================
import { PLAYER_AVATARS, MAX_PLAYERS, TICK_MS, type ClientMsg, type ServerMsg, type Settings, type PlayerInfo, type TableState } from './protocol';
import { ITEMS, START_MONEY, TRAP_ITEMS, TRAP_LIMIT } from './items';
import { CAISSE, ROULETTES, SLOT_LIST, slotSeat, dist2, REPERAGE_MS, HALL_RECT, inRect, losClear, MEET_SPOTS, MEET_MS, clockText } from './layout';
import { slotSpin, SLOT_BETS, CHIPS, ROUL_PHASES, rouletteReturn, type BetKind } from './games';

export interface Conn { send(m: ServerMsg): void }

interface Player {
  id: string; token: string; name: string; avatar: string;
  conn: Conn | null; room: Room | null; lastSeen: number;
  x: number; z: number; yaw: number; mv: number; t: number;
  bot?: { path: [number, number][]; i: number; speed: number };
  money: number; inv: Record<string, number>; seat: number; table: number; busy: number;
  role: 'team' | 'indic'; out: boolean; usedMeet: boolean; cy: number; traps: number; nextTrap: number; wait: number;
}
interface Meeting { ph: 'talk' | 'vote' | 'reveal'; by: string; endsAt: number; votes: Map<string, string>; out?: Player; counts?: [string, number][] }
interface RTable { id: number; ph: TableState['ph']; endsAt: number; bets: { p: Player; kind: BetKind; value: number; amount: number }[]; res: number; hist: number[]; wins: [string, number][]; players: Set<Player> }
interface Room {
  code: string; host: string; players: Player[]; phase: 'lobby' | 'night';
  settings: Settings; seed: number; startedAt: number;
  prices: Record<string, number>; stock: Record<string, number>; jackpot: number; tables: RTable[]; slotOwner: Map<number, Player>;
  heat: number; paused: number; pauseAt: number; meetLeft: number; meeting: Meeting | null; nIndics: number;
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
        if (p.room.phase === 'night') {
          // retour en pleine nuit : on se relève, on garde ses mises en cours
          this.standUp(p); this.leaveTable(p);
          conn.send(this.startedMsg(p.room, true));
          this.sendEcon(p.room, p);
          conn.send({ t: 'role', role: p.role, n: p.room.settings.secret ? undefined : p.room.nIndics });
          this.sendState(p.room, p);
          if (p.room.meeting) conn.send({ t: 'meeting', m: this.meetState(p.room) });
        }
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
        const room: Room = { code, host: me.id, players: [], phase: 'lobby', settings: { indics: 1, duree: 'normale' }, seed: 0, startedAt: 0, prices: {}, stock: {}, jackpot: 0, tables: [], slotOwner: new Map(), heat: 0, paused: 0, pauseAt: 0, meetLeft: 2, meeting: null, nIndics: 0 };
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
        if (typeof m.secret === 'boolean') r.settings.secret = m.secret;
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
        // économie de la nuit : prix ±30 %, stocks, jackpot, tables
        r.prices = {}; r.stock = {};
        for (const it of ITEMS) { r.prices[it.id] = Math.round(it.price * (.7 + Math.random() * .6) / 10) * 10; r.stock[it.id] = it.stock; }
        r.jackpot = 3000 + Math.round(Math.random() * 1500);
        r.tables = ROULETTES.map((_, id) => ({ id, ph: 'idle', endsAt: 0, bets: [], res: -1, hist: [], wins: [], players: new Set() }));
        r.slotOwner = new Map();
        for (const p of r.players) { Object.assign(p, { money: START_MONEY, inv: {}, seat: -1, table: -1, busy: 0, role: 'team', out: false, usedMeet: false, traps: 0, nextTrap: now + 50000 + Math.random() * 40000, wait: 0 }); }
        // tirage secret des indics (bots compris : en solo, on peut s'entraîner à griller un bot)
        const max = maxIndics(r.players.length);
        r.nIndics = r.settings.secret ? Math.floor(Math.random() * (max + 1)) : Math.min(r.settings.indics, max);
        for (const p of shuffle([...r.players]).slice(0, r.nIndics)) {
          p.role = 'indic';
          // un bot indic fait sa ronde dans la galerie, qui passe devant la caisse
          if (p.bot) { p.bot.path = BOT_PATHS[0]; p.bot.i = 0; const q = p.bot.path[0]; p.x = q[0]; p.z = q[1]; }
        }
        r.heat = 0; r.paused = 0; r.pauseAt = 0; r.meetLeft = 2; r.meeting = null;
        this.broadcastLobby(r);
        for (const p of r.players) {
          p.conn?.send(this.startedMsg(r, false)); this.sendEcon(r, p);
          p.conn?.send({ t: 'role', role: p.role, n: r.settings.secret ? undefined : r.nIndics });
          this.sendState(r, p);
        }
        break;
      }
      case 'input': {
        const r = me.room;
        if (!r || r.phase !== 'night' || !Number.isFinite(m.x) || !Number.isFinite(m.z) || !Number.isFinite(m.yaw)) break;
        // garde-fou : on refuse un déplacement impossible (plus de 9 m/s)
        const dt = Math.max(.03, (now - me.t) / 1000), d = Math.hypot(m.x - me.x, m.z - me.z);
        if (Number.isFinite(m.cy)) me.cy = m.cy!;
        if (me.seat >= 0 || r.meeting) { me.t = now; break; }
        // tolérance pour les paquets groupés ; au-delà on rapproche sans téléporter
        const allowed = 9 * dt + 1.5;
        if (d <= allowed || d > 40) { me.x = m.x; me.z = m.z; }
        else { me.x += (m.x - me.x) / d * allowed; me.z += (m.z - me.z) / d * allowed; }
        me.yaw = m.yaw; me.mv = m.mv | 0; me.t = now;
        break;
      }
      case 'leave': this.leave(me); conn.send({ t: 'left' }); break;
      default: this.game(me, m, now);
    }
    return me;
  }

  /** Argent, caisse et jeux : tout est vérifié ici (distance, solde, stock, phase). */
  private game(me: Player, m: ClientMsg, now: number) {
    const r = me.room;
    if (!r || r.phase !== 'night') return;
    const near = (x: number, z: number, d: number) => dist2(me.x, me.z, x, z) < d * d;
    if (m.t === 'vote') { this.vote(r, me, m.target, now); return; }
    if (me.out) return this.err(me, 'Tu as été écarté : tu regardes la fin de la nuit.');
    if (r.meeting) return;
    if (m.t === 'meet') {
      if (!MEET_SPOTS.some(s => near(s.x, s.z, 2.6))) return this.err(me, 'Une réunion se lance depuis les toilettes ou la radio de la camionnette.');
      if (me.usedMeet) return this.err(me, 'Tu as déjà appelé ta réunion de crise.');
      if (r.meetLeft <= 0) return this.err(me, 'Plus de réunion possible cette nuit.');
      me.usedMeet = true; r.meetLeft--;
      this.startMeeting(r, me, now);
      return;
    }
    if (m.t === 'buy' && TRAP_ITEMS.some(t => t.id === m.item)) { this.trap(r, me, m.item, now); return; }
    switch (m.t) {
      case 'buy': {
        const it = ITEMS.find(i => i.id === m.item), price = r.prices[m.item];
        if (!it || now < me.busy) return;
        if (!near(CAISSE.x, CAISSE.z, 3.5)) return this.err(me, 'Approche-toi du guichet.');
        if ((r.stock[it.id] ?? 0) <= 0) return this.err(me, 'Plus en stock cette nuit.');
        if (me.money < price) return this.err(me, 'Pas assez d\'argent.');
        me.money -= price; me.inv[it.id] = (me.inv[it.id] ?? 0) + 1; r.stock[it.id]--; me.busy = now + 2000;
        this.sendMe(me);
        this.all(r, { t: 'shop', prices: r.prices, stock: r.stock });
        this.all(r, { t: 'fx', k: 'env', id: me.id, c: 'white' });
        break;
      }
      case 'give': {
        const to = r.players.find(p => p.id === m.to), a = Math.floor(m.amount);
        if (!to || to === me || !(a > 0)) return;
        if (!near(to.x, to.z, 3.2)) return this.err(me, 'Rapproche-toi pour donner.');
        if (me.money < a) return this.err(me, 'Pas assez d\'argent.');
        me.money -= a; to.money += a;
        this.sendMe(me); this.sendMe(to);
        to.conn?.send({ t: 'note', msg: `${me.name} t'a donné ${a} €` });
        me.conn?.send({ t: 'note', msg: `Tu as donné ${a} € à ${to.name}` });
        break;
      }
      case 'sit': {
        const s = SLOT_LIST[m.slot];
        if (!s) return;
        const seat = slotSeat(s), owner = r.slotOwner.get(m.slot);
        if (owner && owner !== me) return this.err(me, 'Machine déjà prise.');
        if (!near(seat.x, seat.z, 3)) return;
        this.standUp(me); this.leaveTable(me);
        me.seat = m.slot; r.slotOwner.set(m.slot, me); me.x = seat.x; me.z = seat.z; me.yaw = seat.yaw;
        break;
      }
      case 'stand': this.standUp(me); break;
      case 'spin': {
        if (me.seat < 0 || now < me.busy || !SLOT_BETS.includes(m.bet)) return;
        if (me.money < m.bet) return this.err(me, 'Pas assez d\'argent.');
        me.money -= m.bet; r.jackpot += Math.round(m.bet * .06); me.busy = now + 2300;
        const o = slotSpin(m.bet, r.jackpot);
        me.money += o.win;
        me.conn?.send({ t: 'slot', reels: o.reels, win: o.win, jackpot: o.jackpot, money: me.money });
        if (o.jackpot) { r.jackpot = 3000; this.all(r, { t: 'jack', v: r.jackpot, who: me.name, amount: o.win }); }
        else this.all(r, { t: 'jack', v: r.jackpot });
        break;
      }
      case 'rjoin': {
        const tb = r.tables[m.table], pos = ROULETTES[m.table];
        if (!tb || !near(pos.x, pos.z, 4.6)) return;
        this.standUp(me); this.leaveTable(me);
        me.table = tb.id; tb.players.add(me);
        if (tb.ph === 'idle') { tb.ph = 'bets'; tb.endsAt = now + ROUL_PHASES.bets; this.tableOut(tb); }
        else me.conn?.send({ t: 'rtab', s: this.tableState(tb) });
        break;
      }
      case 'rleave': this.leaveTable(me); break;
      case 'bet': {
        const tb = r.tables[me.table];
        if (!tb || tb.ph !== 'bets' || !CHIPS.includes(m.amount)) return;
        const kinds: BetKind[] = ['n', 'red', 'black', 'even', 'odd', 'low', 'high', 'd1', 'd2', 'd3'];
        if (!kinds.includes(m.kind) || (m.kind === 'n' && !(m.value >= 0 && m.value <= 36 && Number.isInteger(m.value)))) return;
        if (me.money < m.amount) return this.err(me, 'Pas assez d\'argent.');
        if (tb.bets.filter(b => b.p === me).length >= 30) return;
        me.money -= m.amount;
        tb.bets.push({ p: me, kind: m.kind, value: m.kind === 'n' ? m.value : 0, amount: m.amount });
        this.sendMe(me); this.tableOut(tb);
        break;
      }
      case 'bclear': {
        const tb = r.tables[me.table];
        if (!tb || tb.ph !== 'bets') return;
        for (const b of tb.bets) if (b.p === me) me.money += b.amount;
        tb.bets = tb.bets.filter(b => b.p !== me);
        this.sendMe(me); this.tableOut(tb);
        break;
      }
    }
  }
  private standUp(p: Player) {
    const r = p.room;
    if (p.seat >= 0 && r && r.slotOwner.get(p.seat) === p) r.slotOwner.delete(p.seat);
    p.seat = -1;
  }
  private leaveTable(p: Player) {
    const tb = p.room?.tables[p.table];
    tb?.players.delete(p);
    p.table = -1;
  }
  private tableState(tb: RTable): TableState {
    return { id: tb.id, ph: tb.ph, left: Math.max(0, tb.endsAt - Date.now()), bets: tb.bets.map(b => [b.p.id, b.kind, b.value, b.amount]), res: tb.ph === 'bets' || tb.ph === 'idle' ? -1 : tb.res, hist: tb.hist, wins: tb.wins };
  }
  private tableOut(tb: RTable) { const s = this.tableState(tb); for (const p of tb.players) p.conn?.send({ t: 'rtab', s }); }
  private stepTable(r: Room, tb: RTable, now: number) {
    if (tb.ph === 'idle' || now < tb.endsAt) return;
    if (tb.ph === 'bets') {
      if (!tb.players.size && !tb.bets.length) { tb.ph = 'idle'; return; }
      tb.ph = 'spin'; tb.res = Math.floor(Math.random() * 37); tb.wins = []; tb.endsAt = now + ROUL_PHASES.spin;
    } else if (tb.ph === 'spin') {
      const won = new Map<Player, number>();
      for (const b of tb.bets) { const g = rouletteReturn(b.kind, b.value, b.amount, tb.res); if (g) won.set(b.p, (won.get(b.p) ?? 0) + g); }
      for (const [p, g] of won) { p.money += g; this.sendMe(p); }
      tb.wins = [...won].map(([p, g]) => [p.id, g]);
      tb.hist = [tb.res, ...tb.hist].slice(0, 12); tb.bets = [];
      tb.ph = 'result'; tb.endsAt = now + ROUL_PHASES.result;
    } else {
      if (tb.players.size) { tb.ph = 'bets'; tb.endsAt = now + ROUL_PHASES.bets; } else tb.ph = 'idle';
    }
    this.tableOut(tb);
  }
  private sendMe(p: Player) { p.conn?.send({ t: 'me', money: p.money, inv: p.inv }); }
  private sendEcon(r: Room, p: Player) {
    this.sendMe(p);
    p.conn?.send({ t: 'shop', prices: r.prices, stock: r.stock });
    p.conn?.send({ t: 'jack', v: r.jackpot });
  }
  private err(p: Player, msg: string) { p.conn?.send({ t: 'error', msg }); }
  private all(r: Room, m: ServerMsg) { for (const p of r.players) p.conn?.send(m); }

  // ---------- l'indic ----------
  /** Achat piégé : effet immédiat, enveloppe rouge visible, témoins calculés ici. */
  private trap(r: Room, me: Player, id: string, now: number) {
    const it = TRAP_ITEMS.find(t => t.id === id)!;
    if (me.role !== 'indic') return;
    if (now < me.busy) return;
    if (dist2(me.x, me.z, CAISSE.x, CAISSE.z) > 3.5 ** 2) return this.err(me, 'Approche-toi du guichet.');
    if (me.traps >= TRAP_LIMIT) return this.err(me, 'L\'inspecteur ne répond plus cette nuit.');
    if (!me.bot && me.money < it.price) return this.err(me, 'Pas assez d\'argent.');
    if (!me.bot) me.money -= it.price;
    me.traps++; me.busy = now + 2000;
    if (id === 'tuyau') r.heat = Math.min(100, r.heat + 15);
    this.sendMe(me);
    this.all(r, { t: 'fx', k: 'env', id: me.id, c: 'red' });
    // témoins : dans la galerie, à moins de 15 m, en train de regarder par là, sans obstacle
    const at = clockText(this.elapsed(r, now), REPERAGE_MS[r.settings.duree]);
    for (const p of r.players) {
      if (p === me || p.bot || p.out || !p.conn) continue;
      if (!inRect(p.x, p.z, HALL_RECT) || !inRect(me.x, me.z, HALL_RECT)) continue;
      const dx = me.x - p.x, dz = me.z - p.z, d = Math.hypot(dx, dz);
      if (d > 15) continue;
      const facing = d < 1.5 ? 1 : (dx * -Math.sin(p.cy) + dz * -Math.cos(p.cy)) / d;
      if (facing < .57 || !losClear(p.x, p.z, me.x, me.z)) continue;
      p.conn.send({ t: 'proof', text: `Tu as vu ${me.name} recevoir une enveloppe rouge à la caisse (${at}).` });
    }
    for (const p of r.players) this.sendState(r, p);
    this.checkEnd(r, now);
  }
  private elapsed(r: Room, now: number) { return now - r.startedAt - r.paused - (r.pauseAt ? now - r.pauseAt : 0); }
  private startMeeting(r: Room, by: Player, now: number) {
    for (const p of r.players) { this.standUp(p); this.leaveTable(p); }
    r.pauseAt = now;
    r.meeting = { ph: 'talk', by: by.id, endsAt: now + MEET_MS.talk, votes: new Map() };
    this.meetOut(r);
    for (const p of r.players) this.sendState(r, p);
  }
  private alive(r: Room) { return r.players.filter(p => !p.out); }
  private vote(r: Room, me: Player, target: string, now: number) {
    const mt = r.meeting;
    if (!mt || mt.ph !== 'vote' || me.out) return;
    if (target !== 'skip' && !this.alive(r).some(p => p.id === target)) return;
    mt.votes.set(me.id, target);
    if (this.alive(r).every(p => mt.votes.has(p.id))) mt.endsAt = now;
    this.meetOut(r);
  }
  private stepMeeting(r: Room, now: number) {
    const mt = r.meeting!;
    if (now < mt.endsAt) return;
    if (mt.ph === 'talk') {
      mt.ph = 'vote'; mt.endsAt = now + MEET_MS.vote;
      for (const p of this.alive(r)) if (p.bot) mt.votes.set(p.id, 'skip');
      if (this.alive(r).every(p => mt.votes.has(p.id))) mt.endsAt = now + 1500;
    } else if (mt.ph === 'vote') {
      // majorité relative ; égalité ou « passer » en tête = personne n'est écarté
      const c = new Map<string, number>();
      for (const v of mt.votes.values()) c.set(v, (c.get(v) ?? 0) + 1);
      const sorted = [...c].filter(([k]) => k !== 'skip').sort((a, b) => b[1] - a[1]);
      const skip = c.get('skip') ?? 0;
      mt.counts = [...c];
      if (sorted.length && sorted[0][1] > skip && (sorted.length < 2 || sorted[0][1] > sorted[1][1])) {
        const out = r.players.find(p => p.id === sorted[0][0])!;
        out.out = true; mt.out = out; this.standUp(out); this.leaveTable(out);
        r.heat = out.role === 'indic' ? Math.max(0, r.heat - 25) : Math.min(100, r.heat + 15);
      }
      mt.ph = 'reveal'; mt.endsAt = now + MEET_MS.reveal;
    } else {
      r.paused += now - r.pauseAt; r.pauseAt = 0; r.meeting = null;
      this.all(r, { t: 'meeting', m: null });
      for (const p of r.players) this.sendState(r, p);
      this.checkEnd(r, now);
      return;
    }
    this.meetOut(r);
    for (const p of r.players) this.sendState(r, p);
  }
  private meetState(r: Room) {
    const mt = r.meeting!;
    return { ph: mt.ph, by: mt.by, left: Math.max(0, mt.endsAt - Date.now()), voted: [...mt.votes.keys()], alive: this.alive(r).map(p => p.id),
      out: mt.ph === 'reveal' ? (mt.out?.id ?? '') : undefined, outRole: mt.ph === 'reveal' ? mt.out?.role : undefined, counts: mt.ph === 'reveal' ? mt.counts : undefined };
  }
  private meetOut(r: Room) { this.all(r, { t: 'meeting', m: this.meetState(r) }); }
  private sendState(r: Room, p: Player) {
    p.conn?.send({ t: 'state', heat: Math.round(r.heat), paused: r.paused + (r.pauseAt ? Date.now() - r.pauseAt : 0), meetLeft: r.meetLeft,
      out: r.players.filter(q => q.out).map(q => q.id), myMeet: p.usedMeet, traps: p.traps });
  }
  private checkEnd(r: Room, now: number) {
    if (r.phase !== 'night' || r.meeting) return;
    const indics = r.players.filter(p => p.role === 'indic'), alive = indics.filter(p => !p.out);
    if (r.heat >= 100) return this.endNight(r, 'indic', 'Descente de police : la chaleur a atteint 100 %.');
    if (indics.length && !alive.length) return this.endNight(r, 'team', indics.length > 1 ? 'Tous les indics ont été démasqués.' : 'L\'indic a été démasqué.');
    if (this.elapsed(r, now) >= REPERAGE_MS[r.settings.duree]) {
      if (alive.length) return this.endNight(r, 'indic', '3 h : le casino ferme et l\'indic court toujours.');
      return this.endNight(r, 'team', '3 h : le casino ferme, l\'équipe est restée propre.');
    }
  }
  private endNight(r: Room, winner: 'team' | 'indic', reason: string) {
    this.all(r, { t: 'end', winner, reason, roles: r.players.map(p => [p.id, p.role]) });
    r.phase = 'lobby'; r.meeting = null; r.pauseAt = 0;
    for (const p of r.players) { this.standUp(p); this.leaveTable(p); p.avatar = ''; p.out = false; }
    for (const tb of r.tables) { tb.ph = 'idle'; tb.bets = []; tb.players.clear(); }
    this.broadcastLobby(r);
  }

  private newPlayer(name: string): Player {
    const p: Player = { id: rid(8), token: rid(24), name: clean(name), avatar: '', conn: null, room: null, lastSeen: Date.now(), x: 0, z: 0, yaw: 0, mv: 0, t: 0, money: 0, inv: {}, seat: -1, table: -1, busy: 0, role: 'team', out: false, usedMeet: false, cy: 0, traps: 0, nextTrap: 0, wait: 0 };
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
    this.standUp(p); this.leaveTable(p);
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
    return { t: 'started', seed: r.seed, rejoin, elapsed: Date.now() - r.startedAt, dur: REPERAGE_MS[r.settings.duree], players: this.info(r), pos: r.players.map(p => [p.id, p.x, p.z, p.yaw]) };
  }

  private tick() {
    const now = Date.now();
    for (const r of this.rooms.values()) {
      // les absents depuis plus de 2 minutes quittent la partie
      for (const p of [...r.players]) if (!p.bot && !p.conn && now - p.lastSeen > 120000) { this.leave(p); this.byToken.delete(p.token); }
      if (!this.rooms.has(r.code) || r.phase !== 'night') continue;
      if (r.meeting) this.stepMeeting(r, now);
      else {
        for (const p of r.players) if (p.bot && !p.out) this.moveBot(r, p, TICK_MS / 1000, now);
        for (const tb of r.tables) this.stepTable(r, tb, now);
        this.checkEnd(r, now);
      }
      if (r.phase !== 'night') continue;
      const snap: ServerMsg = { t: 'snap', p: r.players.map(p => [p.id, round(p.x), round(p.z), round(p.yaw), p.seat >= 0 ? 0 : p.mv, p.seat]) };
      for (const p of r.players) p.conn?.send(snap);
    }
  }
  private moveBot(r: Room, p: Player, dt: number, now: number) {
    if (now < p.wait) { p.mv = 0; return; }
    // bot indic : quand il passe devant la caisse, il lui arrive d'acheter un coup piégé
    if (p.role === 'indic' && p.traps < 3 && now > p.nextTrap && dist2(p.x, p.z, CAISSE.x, CAISSE.z) < 2.6 ** 2) {
      p.wait = now + 2600; p.yaw = Math.PI; p.nextTrap = now + 70000 + Math.random() * 50000;
      this.trap(r, p, Math.random() < .7 ? 'tuyau' : 'fauxcode', now);
      return;
    }
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
