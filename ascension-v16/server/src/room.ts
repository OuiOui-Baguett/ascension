// ============================================================
// GameRoom — serveur autoritaire.
// Une cagnotte commune : les mises sortent directement dedans,
// les gains y rentrent. 3 min/étage. 1 machine = 1 joueur.
// ============================================================
import type { WebSocket } from 'ws';
import {
  floorAt, ITEMS, itemAt, START_BANK, FLOOR_MS, CARD_NAMES,
  betMin, betMax, floorFloat, tollOf, fmt, MAX_PLAYERS, minesMult, raceOdds, STATIONS,
  type MachineDef,
} from '../../shared/content';

const SPEED = Number(process.env.SPEED || 1);
const DUR = {
  BRIEFING: 8_000 / SPEED,
  FLOOR: FLOOR_MS / SPEED,
  ELEVATOR: 6_000 / SPEED,
  FALLING: 9_000 / SPEED,
};
const RECONNECT_GRACE = 120_000;

type Phase = 'LOBBY' | 'BRIEFING' | 'FLOOR' | 'ELEVATOR' | 'FALLING' | 'VICTORY';

interface ActivePlay {
  kind: 'CRASH' | 'HILO' | 'BJ' | 'MINES';
  machineId: string;
  bet: number;
  startAt?: number; crashMult?: number; bustTimer?: NodeJS.Timeout;
  card?: number; mult?: number; steps?: number; timer?: NodeJS.Timeout;
  total?: number; soft?: number; dealerCard?: number;
  bombs?: number[]; opened?: number[];      // MINES : bombes cachées, cases déjà ouvertes
}

export interface Player {
  id: string; token: string; name: string;
  ws: WebSocket | null; connected: boolean; disconnectedAt: number;
  color: number; hat: number;
  net: number;             // bilan de jeu : gains - mises
  wagered: number;         // total misé
  won: number;             // total encaissé
  spent: number;           // dépensé en boutique
  plays: number;           // nombre de coups joués
  play: ActivePlay | null;
  busyMachine: string | null;  // machine occupée par ce joueur
  refunds: number;             // jetons porte-bonheur en réserve
  x: number; z: number; moved: boolean;
}

const rid = (n = 8) => Math.random().toString(36).slice(2, 2 + n);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const makeCode = () =>
  Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** Place de départ : deux rangs de 4 face aux machines. Le 2e rang est PLUS LOIN de la caméra
 *  (z plus petit) pour ne jamais masquer le joueur, et l'arc reste hors de la zone de la boutique. */
function spawnSpot(i: number): { x: number; z: number } {
  const row = i < 4 ? 0 : 1, col = i % 4;
  return { x: -2.4 + col * 1.6 + row * 0.8, z: 6.4 - row * 1.7 };  // rangs décalés : personne pile derrière un autre
}

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) { r -= i.weight; if (r <= 0) return i; }
  return items[items.length - 1];
}

export class GameRoom {
  code: string;
  players = new Map<string, Player>();
  phase: Phase = 'LOBBY';
  floor = 1;
  bank = 0;                         // LA cagnotte commune
  station = 'auto';                 // radio de la salle : le choix est commun à la table
  phaseEndsAt = 0;
  createdAt = Date.now();
  private timer: NodeJS.Timeout | null = null;
  private posTimer: NodeJS.Timeout;
  effects = { shield: 0, boost: false, insurance: false, tollCut: 0 };
  jackpot = 0;                   // cagnotte mystère, alimentée par les pertes
  owned: string[] = [];          // objets d'équipe achetés (pour l'affichage)
  stats = { biggestWin: 0, biggestLoss: 0, falls: 0, bestFloor: 1, startedAt: 0 };

  constructor(code: string) {
    this.code = code;
    this.posTimer = setInterval(() => {
      const moved = [...this.players.values()].filter(p => p.moved);
      if (!moved.length) return;
      const pos: Record<string, [number, number]> = {};
      for (const p of moved) { pos[p.id] = [p.x, p.z]; p.moved = false; }
      this.broadcastMsg({ t: 'pos', p: pos });
    }, 120);
  }

  get floorDef() { return floorAt(this.floor); }
  machine(id: string): MachineDef | undefined {
    return this.floorDef.machines.find(m => m.id === id);
  }
  /** Péage courant, remise du Passe-Droit incluse. */
  get toll() { return Math.round(tollOf(this.floorDef) * (1 - this.effects.tollCut)); }

  // ---------- argent : un seul chemin, la cagnotte commune ----------
  /** Un gain rentre dans la cagnotte commune et crédite le bilan du joueur. */
  private credit(p: Player, amount: number) {
    if (amount <= 0) return;
    this.bank += amount;
    p.net += amount;
    p.won += amount;
  }
  /** Une mise sort de la cagnotte commune et débite le bilan du joueur. */
  private debit(p: Player, amount: number) {
    this.bank -= amount;
    p.net -= amount;
    p.wagered += amount;
    p.plays++;
  }
  /** Perte : applique carapace d'équipe puis jeton perso, rend ce qui est sauvé. */
  private applyLoss(p: Player, bet: number): { lost: number; saved: number; why: string } {
    if (p.refunds > 0) {
      p.refunds--;
      this.credit(p, bet);
      return { lost: 0, saved: bet, why: '🍀' };
    }
    if (this.effects.shield > 0) {
      this.effects.shield--;
      const saved = Math.round(bet / 2);
      this.credit(p, saved);
      return { lost: bet - saved, saved, why: '🐢' };
    }
    // La mise perdue a DÉJÀ quitté la cagnotte : la Maison en met une part
    // de côté pour la cagnotte mystère. Aucun prélèvement supplémentaire,
    // l'espérance de gain des machines reste intacte.
    this.jackpot += Math.round(bet * 0.08);
    return { lost: bet, saved: 0, why: '' };
  }

  /** 1 chance sur 220 par coup : la cagnotte mystère tombe. */
  private tryJackpot(p: Player, m: MachineDef) {
    if (this.jackpot < betMin(this.floorDef)) return;
    if (Math.random() > 1 / 220) return;
    const pot = this.jackpot;
    this.jackpot = Math.round(floorFloat(this.floorDef) * 0.05);
    this.credit(p, pot);
    this.broadcastMsg({
      t: 'ev', kind: 'jackpot', playerId: p.id, machineId: m.id, win: pot,
      text: `🎰 CAGNOTTE MYSTÈRE ! ${p.name} rafle ${fmt(pot)} !`,
    });
  }
  private win(p: Player, bet: number, rawWin: number): number {
    if (rawWin <= 0) return 0;
    const w = Math.round(rawWin * (this.effects.boost ? 1.25 : 1));
    this.credit(p, w);
    this.stats.biggestWin = Math.max(this.stats.biggestWin, w - bet);
    return w;
  }

  // ---------- réseau ----------
  /** Deux joueurs de la même couleur seraient indiscernables dans le casino : on décale. */
  private freeColor(want: number): number {
    const taken = new Set([...this.players.values()].map(p => p.color));
    const c = Math.max(0, Math.min(7, want | 0));
    if (!taken.has(c)) return c;
    for (let i = 0; i < 8; i++) if (!taken.has(i)) return i;
    return c;
  }

  addPlayer(name: string, ws: WebSocket, color = 0, hat = 0): Player | string {
    if (this.phase !== 'LOBBY') return 'La partie a déjà commencé.';
    if (this.players.size >= MAX_PLAYERS) return `La table est pleine (${MAX_PLAYERS} joueurs max).`;
    const p: Player = {
      id: rid(6), token: rid(16), name: (name || 'Joueur').slice(0, 14),
      ws, connected: true, disconnectedAt: 0,
      color: this.freeColor(color), hat: Math.max(0, Math.min(5, hat | 0)),
      net: 0, wagered: 0, won: 0, spent: 0, plays: 0,
      play: null, busyMachine: null, refunds: 0,
      ...spawnSpot(this.players.size), moved: true,
    };
    this.players.set(p.id, p);
    this.logEv('info', `${p.name} rejoint la table.`);
    return p;
  }

  rejoin(token: string, ws: WebSocket): Player | null {
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

  onDisconnect(p: Player) {
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
  emote(p: Player, index: number) {
    if (!Number.isInteger(index) || index < 0 || index > 7) return;
    if (Date.now() - (p as any).lastEmote < 900) return;    // anti-spam
    (p as any).lastEmote = Date.now();
    this.broadcastMsg({ t: 'emote', id: p.id, i: index });
  }

  /** Position relayée aux autres joueurs. La borne suit le rayon de la salle :
   *  à ±10 (l'ancienne arène), les coéquipiers restaient figés près des machines latérales. */
  move(p: Player, x: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const R = 17;
    p.x = Math.max(-R, Math.min(R, x));
    p.z = Math.max(-R, Math.min(R, z));
    p.moved = true;
  }

  send(p: Player, msg: unknown) {
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
  private reject(p: Player, reason: string) {
    this.send(p, { t: 'ev', kind: 'reject', text: reason });
  }

  /** Qui occupe quelle machine (1 joueur max par machine). */
  private occupancy(): Record<string, string> {
    const o: Record<string, string> = {};
    for (const p of this.players.values()) if (p.busyMachine) o[p.busyMachine] = p.name;
    return o;
  }

  serialize() {
    const f = this.floorDef;
    return {
      code: this.code, phase: this.phase, floor: this.floor,
      bank: this.bank, toll: this.toll, jackpot: this.jackpot,
      betMin: betMin(f), betMax: betMax(f),
      shopPrices: Object.fromEntries(ITEMS.map(i => [i.id, Math.round(i.priceFrac * floorFloat(f))])),
      owned: this.owned,
      phaseEndsAt: this.phaseEndsAt, serverNow: Date.now(),
      effects: this.effects, stats: this.stats,
      awards: (this.phase === 'VICTORY' || this.phase === 'FALLING') ? this.awards() : [],
      occupied: this.occupancy(),
      station: this.station,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, connected: p.connected,
        color: p.color, hat: p.hat,
        x: p.x, z: p.z, net: p.net, refunds: p.refunds,
        wagered: p.wagered, won: p.won, spent: p.spent, plays: p.plays,
        playing: p.busyMachine,
      })),
    };
  }

  // ---------- machine à états ----------
  private setPhase(phase: Phase, dur: number, next?: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.phase = phase;
    this.phaseEndsAt = Date.now() + dur;
    this.timer = next ? setTimeout(next, dur) : null;
    this.broadcast();
  }

  start(p: Player) {
    if (this.phase !== 'LOBBY' && this.phase !== 'VICTORY') return;
    if (this.players.size < 1) return;
    this.bank = START_BANK;
    this.jackpot = Math.round(START_BANK * 0.5);
    this.effects = { shield: 0, boost: false, insurance: false, tollCut: 0 };
    this.owned = [];
    this.stats = { biggestWin: 0, biggestLoss: 0, falls: 0, bestFloor: 1, startedAt: Date.now() };
    for (const pl of this.players.values()) {
      pl.net = 0; pl.wagered = 0; pl.won = 0; pl.spent = 0; pl.plays = 0; pl.refunds = 0;
    }
    this.logEv('start', `La tour vous ouvre ses portes. Cagnotte commune : ${fmt(START_BANK)}.`);
    this.gotoFloor(1);
  }

  private gotoFloor(n: number) {
    this.floor = n;
    this.stats.bestFloor = Math.max(this.stats.bestFloor, n);
    const float = floorFloat(this.floorDef);
    if (this.bank < float) {
      const adv = float - this.bank;
      this.bank = float;
      this.logEv('advance', `Avance de la Maison : +${fmt(adv)}. La tour n'oublie jamais une dette.`);
    }
    this.effects.tollCut = 0;
    this.effects.boost = false;
    this.setPhase('BRIEFING', DUR.BRIEFING, () => this.startFloor());
  }

  private startFloor() {
    this.logEv('floor',
      `${this.floorDef.theme.emoji} 3 minutes pour atteindre ${fmt(this.toll)}. Bonne chance.`);
    this.setPhase('FLOOR', DUR.FLOOR, () => this.endFloor());
  }

  /** Fin d'étage : on solde les parties en cours, les jetons rentrent au Coffre. */
  private endFloor() {
    for (const p of this.players.values()) {
      if (p.play?.kind === 'CRASH') this.cashout(p, true);
      else if (p.play?.kind === 'HILO') this.hiloCash(p, true);
      else if (p.play?.kind === 'MINES') this.minesCash(p, true);
      else if (p.play?.kind === 'BJ') this.bjAction(p, 'STAND');
    }
    this.resolveFloor();
  }

  /** Change la station : tout le monde entend la même chose, c'est le but. */
  setStation(p: Player, id: string) {
    const st = STATIONS.find(x => x.id === id);
    if (!st || id === this.station) return;
    this.station = id;
    this.logEv('radio', `📻 ${p.name} met « ${st.name} ».`, { station: id });
    this.broadcast();
  }

  elevator(p: Player) {
    if (this.phase !== 'FLOOR') return;
    if (this.bank < this.toll) return this.reject(p, 'Le Péage n’est pas encore couvert.');
    if (this.timer) clearTimeout(this.timer);
    this.logEv('elevator', `${p.name} appelle l'ascenseur !`);
    this.endFloor();
  }

  private resolveFloor() {
    const toll = this.toll;
    if (this.bank >= toll) {
      this.bank -= toll;
      this.logEv('toll', `PÉAGE PAYÉ : -${fmt(toll)}. L'ascenseur monte…`);
      if (this.floor === 5) return this.victory();
      this.effects.shield = 0;
      this.effects.boost = false;
      this.owned = this.owned.filter(id => id === 'oeuf');
      this.setPhase('ELEVATOR', DUR.ELEVATOR, () => this.gotoFloor(this.floor + 1));
    } else {
      this.fall(`Péage non payé (${fmt(this.bank)} / ${fmt(toll)}).`);
    }
  }

  private fall(reason: string) {
    this.stats.falls++;
    for (const p of this.players.values()) this.clearPlay(p);
    this.logEv('fall', `LA CHUTE. ${reason}`, { awards: this.awards() });
    this.setPhase('FALLING', DUR.FALLING, () => {
      const kept = this.effects.insurance
        ? Math.max(START_BANK, Math.round(this.bank * 0.3))
        : START_BANK;
      if (this.effects.insurance) this.logEv('insurance', `🥚 L'Œuf éclot : ${fmt(kept)} sauvés.`);
      this.bank = kept;
      this.effects = { shield: 0, boost: false, insurance: false, tollCut: 0 };
      this.owned = [];
      for (const p of this.players.values()) p.refunds = 0;
      this.gotoFloor(1);
    });
  }

  /** Titres décernés en fin de partie, calculés sur les compteurs réels. */
  awards() {
    const P = [...this.players.values()];
    if (!P.length) return [];
    const best = (label: string, icon: string, pick: (p: Player) => number, min = 1) => {
      const sorted = [...P].sort((a, b) => pick(b) - pick(a));
      const w = sorted[0];
      return w && pick(w) >= min ? { icon, label, name: w.name, value: Math.round(pick(w)) } : null;
    };
    return [
      best('Le Flambeur', '🔥', p => p.wagered),
      best('La Machine à Cash', '💰', p => p.net),
      best('Le Gouffre', '🕳️', p => -p.net),
      best('L’Acharné', '🎰', p => p.plays),
      best('Le Mécène', '🛒', p => p.spent),
    ].filter(Boolean);
  }

  private victory() {
    const mins = Math.round((Date.now() - this.stats.startedAt) / 60000);
    this.logEv('victory', `LA DERNIÈRE PORTE S'OUVRE. Victoire en ${mins} min, ${this.stats.falls} chute(s).`,
      { awards: this.awards() });
    this.setPhase('VICTORY', 3_600_000);
  }

  // ---------- BOUTIQUE (dans le casino) ----------
  buy(p: Player, itemId: string) {
    if (this.phase !== 'FLOOR') return this.reject(p, 'La boutique est fermée.');
    const it = itemAt(itemId);
    if (!it) return this.reject(p, 'Objet inconnu.');
    const price = Math.round(it.priceFrac * floorFloat(this.floorDef));
    if (this.bank < price) return this.reject(p, `Cagnotte insuffisante (${fmt(price)}).`);
    if (it.scope === 'ÉQUIPE' && this.owned.includes(itemId))
      return this.reject(p, 'L’équipe possède déjà cet objet.');
    this.bank -= price;                       // achat : sortie de cagnotte, tracée à part
    p.spent += price;
    if (it.effect === 'SHIELD') this.effects.shield += 3;
    if (it.effect === 'BOOST') this.effects.boost = true;
    if (it.effect === 'INSURANCE') this.effects.insurance = true;
    if (it.effect === 'TOLL_CUT') this.effects.tollCut = 0.2;
    if (it.effect === 'REFUND') p.refunds++;
    if (it.scope === 'ÉQUIPE') this.owned.push(itemId);
    this.logEv('buy', `${p.name} achète ${it.icon} ${it.name} — ${it.short}.`);
    this.broadcast();
  }

  // ---------- JEU ----------
  private clearPlay(p: Player) {
    if (p.play?.bustTimer) clearTimeout(p.play.bustTimer);
    if (p.play?.timer) clearTimeout(p.play.timer);
    p.play = null;
    p.busyMachine = null;
  }
  private free(p: Player) { p.busyMachine = null; }

  private checkRuin() {
    if (this.phase !== 'FLOOR') return;
    const anyActive = [...this.players.values()].some(p => p.busyMachine);
    if (!anyActive && this.bank < betMin(this.floorDef)) {
      if (this.timer) clearTimeout(this.timer);
      this.fall('FAILLITE — plus de quoi miser.');
    }
  }

  bet(p: Player, machineId: string, amount: number, opt = '') {
    if (this.phase !== 'FLOOR') return this.reject(p, 'Ce n’est pas le moment de miser.');
    if (p.busyMachine) return this.reject(p, 'Tu as déjà une mise en cours.');
    const m = this.machine(machineId);
    if (!m) return this.reject(p, 'Machine inconnue.');
    const occ = this.occupancy()[machineId];
    if (occ) return this.reject(p, `Machine occupée par ${occ}.`);
    const f = this.floorDef;
    amount = Math.round(amount);
    if (!Number.isFinite(amount) || amount < betMin(f)) return this.reject(p, `Mise minimale : ${fmt(betMin(f))}.`);
    if (amount > betMax(f)) return this.reject(p, `Mise maximale : ${fmt(betMax(f))}.`);
    if (amount > this.bank) return this.reject(p, 'La cagnotte ne couvre pas cette mise.');
    if (m.archetype === 'ROULETTE' && !['RED', 'BLACK', 'GREEN'].includes(opt))
      return this.reject(p, 'Choisis une couleur.');
    if (m.archetype === 'CRAPS' && !['UNDER', 'SEVEN', 'OVER'].includes(opt))
      return this.reject(p, 'Choisis un pari.');
    if (m.archetype === 'CHESTS') {
      const i = Number(opt);
      if (!Number.isInteger(i) || i < 0 || i > 8) return this.reject(p, 'Choisis une case.');
    }
    if (m.archetype === 'RACE') {
      const i = Number(opt);
      if (!Number.isInteger(i) || i < 0 || i >= m.race!.runners.length)
        return this.reject(p, 'Choisis un partant.');
    }
    // Plinko : `opt` porte le nombre de billes. Chaque bille coûte la mise unitaire.
    let balls = 1;
    if (m.archetype === 'PLINKO') {
      balls = Math.max(1, Math.min(m.plinko!.maxBalls, Math.round(Number(opt) || 1)));
      const total = amount * balls;
      if (total > this.bank) return this.reject(p, `${balls} billes = ${fmt(total)} — cagnotte insuffisante.`);
      if (total > betMax(f)) return this.reject(p, `${balls} billes dépassent la mise maximale (${fmt(betMax(f))}).`);
    }

    this.debit(p, m.archetype === 'PLINKO' ? amount * balls : amount);
    p.busyMachine = machineId;
    switch (m.archetype) {
      case 'WHEEL': this.playWheel(p, m, amount); break;
      case 'SLOTS': this.playSlots(p, m, amount); break;
      case 'CRASH': this.playCrash(p, m, amount); break;
      case 'HILO': this.playHilo(p, m, amount); break;
      case 'ROULETTE': this.playRoulette(p, m, amount, opt); break;
      case 'CRAPS': this.playCraps(p, m, amount, opt); break;
      case 'CHESTS': this.playChests(p, m, amount, Number(opt)); break;
      case 'PLINKO': this.playPlinko(p, m, amount, balls); break;
      case 'BLACKJACK': this.playBJ(p, m, amount); break;
      case 'MINES': this.playMines(p, m, amount); break;
      case 'RACE': this.playRace(p, m, amount, Number(opt)); break;
    }
    this.broadcast();
  }

  /** Fin d'un coup instantané : crédite, journalise, libère la machine. */
  private settle(p: Player, m: MachineDef, bet: number, rawWin: number, label: string, kind: string, extra: Record<string, unknown> = {}) {
    this.free(p);
    this.tryJackpot(p, m);
    if (rawWin > 0) {
      const w = this.win(p, bet, rawWin);
      this.logEv(`${kind}_win`, `${label} → +${fmt(w)}${this.effects.boost ? ' 🥭' : ''}`,
        { playerId: p.id, machineId: m.id, win: w, ...extra });
    } else {
      const { lost, saved, why } = this.applyLoss(p, bet);
      this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
      this.logEv(`${kind}_lose`,
        saved ? `${label} — ${why} ${fmt(saved)} sauvés.` : `${label} — ${fmt(lost)} perdus.`,
        { playerId: p.id, machineId: m.id, ...extra });
    }
    this.broadcast();
    this.checkRuin();
  }

  // --- ROUE ---
  private playWheel(p: Player, m: MachineDef, bet: number) {
    const w = m.wheel!;
    const seg = pickWeighted(w.segments);
    this.broadcastMsg({
      t: 'ev', kind: 'wheel_spin', playerId: p.id, machineId: m.id,
      bet, mult: seg.mult, spinMs: w.spinMs,
      text: `${p.name} mise ${fmt(bet)} sur ${m.name}…`,
    });
    setTimeout(() => this.settle(p, m, bet, bet * seg.mult, `${m.name} : ×${seg.mult}`, 'wheel', { mult: seg.mult }), w.spinMs);
  }

  // --- SLOTS ---
  private playSlots(p: Player, m: MachineDef, bet: number) {
    const s = m.slots!;
    const idx = [0, 1, 2].map(() => s.symbols.indexOf(pickWeighted(s.symbols)));
    const [a, b, c] = idx;
    let mult = 0;
    if (a === b && b === c) mult = s.symbols[a].triple;
    else if (a === b || a === c) mult = s.symbols[a].pair;
    else if (b === c) mult = s.symbols[b].pair;
    const faces = idx.map(i => s.symbols[i].e).join(' ');
    this.broadcastMsg({
      t: 'ev', kind: 'slots_spin', playerId: p.id, machineId: m.id,
      bet, symbols: idx, spinMs: s.spinMs,
      text: `${p.name} lance ${m.name} (${fmt(bet)})…`,
    });
    setTimeout(() => this.settle(p, m, bet, bet * mult,
      `${faces}${mult ? ` ×${mult}` : ''}${mult >= 100 ? ' 💰 JACKPOT !' : ''}`, 'slots', { mult }), s.spinMs);
  }

  // --- ROULETTE ---
  private playRoulette(p: Player, m: MachineDef, bet: number, opt: string) {
    const r = m.roulette!;
    const pocket = Math.floor(Math.random() * 37);
    const color = pocket === 0 ? 'GREEN' : (pocket % 2 ? 'RED' : 'BLACK');
    const mult = opt === color ? (color === 'GREEN' ? r.greenMult : r.colorMult) : 0;
    const emo: any = { RED: '🔴', BLACK: '⚫', GREEN: '🟢' };
    this.broadcastMsg({
      t: 'ev', kind: 'roulette_spin', playerId: p.id, machineId: m.id,
      bet, color, pocket, spinMs: r.spinMs,
      text: `${p.name} mise ${fmt(bet)} sur ${emo[opt]}…`,
    });
    setTimeout(() => this.settle(p, m, bet, bet * mult, `${emo[color]} ${pocket}`, 'roulette', { mult }), r.spinMs);
  }

  // --- CRAPS ---
  private playCraps(p: Player, m: MachineDef, bet: number, opt: string) {
    const c = m.craps!;
    const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
    const total = d1 + d2;
    const hit = (opt === 'UNDER' && total < 7) || (opt === 'OVER' && total > 7) || (opt === 'SEVEN' && total === 7);
    const mult = hit ? (opt === 'SEVEN' ? c.sevenMult : c.sideMult) : 0;
    const lab: any = { UNDER: 'SOUS 7', SEVEN: 'PILE 7', OVER: 'SUR 7' };
    this.broadcastMsg({
      t: 'ev', kind: 'craps_roll', playerId: p.id, machineId: m.id,
      bet, d1, d2, rollMs: c.rollMs,
      text: `${p.name} lance les dés (${lab[opt]}, ${fmt(bet)})…`,
    });
    setTimeout(() => this.settle(p, m, bet, bet * mult, `🎲 ${d1}+${d2} = ${total}`, 'craps', { mult }), c.rollMs);
  }

  // --- COFFRES / PIERRES ---
  private playChests(p: Player, m: MachineDef, bet: number, pick: number) {
    const ch = m.chests!;
    const shuffled = [...ch.mults];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const mult = shuffled[pick];
    this.broadcastMsg({
      t: 'ev', kind: 'chests_open', playerId: p.id, machineId: m.id,
      bet, pick, reveal: shuffled, openMs: ch.openMs,
      text: `${p.name} ouvre la case ${pick + 1} (${fmt(bet)})…`,
    });
    setTimeout(() => this.settle(p, m, bet, bet * mult,
      mult > 0 ? `Case ${pick + 1} : ×${mult}` : `Case ${pick + 1} : vide`, 'chests', { mult }), ch.openMs);
  }

  // --- MINES ---
  // 25 cases, 3 bombes. Chaque case sûre monte le multiplicateur ; on encaisse quand on veut.
  private playMines(p: Player, m: MachineDef, bet: number) {
    const mi = m.mines!;
    const bombs: number[] = [];
    while (bombs.length < mi.bombs) {
      const c = Math.floor(Math.random() * mi.cells);
      if (!bombs.includes(c)) bombs.push(c);
    }
    p.play = { kind: 'MINES', machineId: m.id, bet, bombs, opened: [], mult: 1 };
    p.play.timer = setTimeout(() => this.minesCash(p, true), mi.decideMs);
    this.broadcastMsg({
      t: 'ev', kind: 'mines_start', playerId: p.id, machineId: m.id, bet,
      cells: mi.cells, bombs: mi.bombs,
      text: `${p.name} entre dans ${m.name} (${fmt(bet)}).`,
    });
    this.broadcast();
  }

  minesPick(p: Player, cell: number) {
    const play = p.play;
    if (!play || play.kind !== 'MINES') return this.reject(p, 'Aucune grille en cours.');
    const m = this.machine(play.machineId)!;
    const mi = m.mines!;
    if (!Number.isInteger(cell) || cell < 0 || cell >= mi.cells) return this.reject(p, 'Case inconnue.');
    if (play.opened!.includes(cell)) return this.reject(p, 'Case déjà ouverte.');
    if (play.timer) clearTimeout(play.timer);

    if (play.bombs!.includes(cell)) {
      const bet = play.bet, bombs = play.bombs!;
      this.clearPlay(p);
      this.broadcastMsg({ t: 'ev', kind: 'mines_boom', playerId: p.id, machineId: m.id, cell, bombs });
      return this.settle(p, m, bet, 0, `💣 Case ${cell + 1}`, 'mines_boom_');
    }
    play.opened!.push(cell);
    play.mult = minesMult(mi, play.opened!.length);
    // toutes les cases sûres ouvertes : on encaisse d'office
    if (play.opened!.length >= mi.cells - mi.bombs) return this.minesCash(p, true);
    play.timer = setTimeout(() => this.minesCash(p, true), mi.decideMs);
    this.broadcastMsg({
      t: 'ev', kind: 'mines_safe', playerId: p.id, machineId: m.id, cell,
      mult: play.mult, opened: play.opened!.length,
      text: `${p.name} : case ${cell + 1} sûre — ×${play.mult.toFixed(2)}`,
    });
    this.broadcast();
  }

  private minesCash(p: Player, auto = false) {
    const play = p.play;
    if (!play || play.kind !== 'MINES') return;
    const m = this.machine(play.machineId)!;
    const bet = play.bet, opened = play.opened!.length, mult = play.mult!, bombs = play.bombs!;
    this.clearPlay(p);
    this.broadcastMsg({ t: 'ev', kind: 'mines_end', playerId: p.id, machineId: m.id, bombs });
    if (opened === 0) {
      this.credit(p, bet);                    // aucune case ouverte : mise rendue
      this.logEv('mines_cash', `${p.name} ressort sans rien toucher (mise rendue).`,
        { playerId: p.id, machineId: m.id, win: bet, mult: 1 });
      this.broadcast();
    } else {
      this.settle(p, m, bet, bet * mult, `${opened} cases sûres ×${mult.toFixed(2)}`, 'mines_cash_',
        { mult: Number(mult.toFixed(2)) });
    }
  }

  // --- COURSE ---
  private playRace(p: Player, m: MachineDef, bet: number, pick: number) {
    const rc = m.race!;
    // ordre d'arrivée tiré au sort selon les poids, sans remise
    const pool = rc.runners.map((r, i) => ({ i, w: r.weight }));
    const order: number[] = [];
    while (pool.length) {
      let t = pool.reduce((s, x) => s + x.w, 0) * Math.random();
      let k = 0;
      while (k < pool.length - 1 && (t -= pool[k].w) > 0) k++;
      order.push(pool[k].i);
      pool.splice(k, 1);
    }
    const won = order[0] === pick;
    const mult = won ? raceOdds(rc, pick) : 0;
    this.broadcastMsg({
      t: 'ev', kind: 'race_start', playerId: p.id, machineId: m.id,
      bet, pick, order, raceMs: rc.raceMs,
      text: `${p.name} mise ${fmt(bet)} sur ${rc.runners[pick].icon} ${rc.runners[pick].name}…`,
    });
    setTimeout(() => this.settle(p, m, bet, bet * mult,
      `🏁 ${rc.runners[order[0]].icon} ${rc.runners[order[0]].name} l'emporte`, 'race',
      { mult, winner: order[0] }), rc.raceMs);
  }

  // --- PLINKO ---
  private playPlinko(p: Player, m: MachineDef, bet: number, balls = 1) {
    const pl = m.plinko!;
    const drops: { path: number[]; slot: number; mult: number }[] = [];
    let raw = 0;
    for (let b = 0; b < balls; b++) {
      let slot = 0;
      const path: number[] = [];
      for (let i = 0; i < 8; i++) { const r = Math.random() < 0.5 ? 0 : 1; path.push(r); slot += r; }
      const mult = pl.mults[slot];
      raw += bet * mult;
      drops.push({ path, slot, mult });
    }
    const stagger = balls > 1 ? 230 : 0;                 // les billes partent en rafale
    const total = bet * balls;
    this.broadcastMsg({
      t: 'ev', kind: 'plinko_drop', playerId: p.id, machineId: m.id,
      bet, drops, dropMs: pl.dropMs, stagger,
      text: balls > 1
        ? `${p.name} lâche ${balls} billes (${fmt(total)})…`
        : `${p.name} lâche la bille (${fmt(bet)})…`,
    });
    const best = drops.reduce((a, d) => Math.max(a, d.mult), 0);
    const label = balls > 1
      ? `${balls} billes · ${drops.map(d => '×' + d.mult).join(' ')}`
      : `Case ×${drops[0].mult}`;
    setTimeout(() => this.settle(p, m, total, raw, label, 'plinko', { mult: best }),
      pl.dropMs + stagger * (balls - 1));
  }

  // --- CRASH ---
  private playCrash(p: Player, m: MachineDef, bet: number) {
    const c = m.crash!;
    const u = Math.random();
    const crashMult = Math.min(100, Math.max(1, (1 - c.edge) / (1 - u)));
    const msToBust = Math.max(200, (Math.log(crashMult) / Math.log(c.growth)) * c.tickMs);
    const startAt = Date.now();
    const bustTimer = setTimeout(() => this.bust(p), msToBust);
    p.play = { kind: 'CRASH', machineId: m.id, bet, startAt, crashMult, bustTimer };
    this.broadcastMsg({
      t: 'ev', kind: 'crash_start', playerId: p.id, machineId: m.id,
      bet, startAt, growth: c.growth, tickMs: c.tickMs,
      text: `${p.name} engage ${fmt(bet)} sur ${m.name}…`,
    });
  }

  cashout(p: Player, auto = false) {
    const play = p.play;
    if (!play) { if (!auto) this.reject(p, 'Rien à encaisser.'); return; }
    if (play.kind === 'HILO') return this.hiloCash(p, auto);
    if (play.kind === 'MINES') return this.minesCash(p, auto);
    if (play.kind === 'BJ') return this.bjAction(p, 'STAND');
    const m = this.machine(play.machineId)!;
    const mult = Math.pow(m.crash!.growth, (Date.now() - play.startAt!) / m.crash!.tickMs);
    if (mult >= play.crashMult!) return this.bust(p);
    clearTimeout(play.bustTimer!);
    p.play = null;
    this.settle(p, m, play.bet, play.bet * mult, `${m.name} : ×${mult.toFixed(2)}`, 'crash_cash_',
      { mult: Number(mult.toFixed(2)) });
  }

  private bust(p: Player) {
    const play = p.play;
    if (!play || play.kind !== 'CRASH') return;
    p.play = null;
    const m = this.machine(play.machineId)!;
    this.settle(p, m, play.bet, 0, `💥 ${m.name} lâche à ×${play.crashMult!.toFixed(2)}`, 'crash_bust_',
      { mult: Number(play.crashMult!.toFixed(2)) });
  }

  // --- HI-LO ---
  private drawCard() { return 1 + Math.floor(Math.random() * 13); }

  private playHilo(p: Player, m: MachineDef, bet: number) {
    const card = this.drawCard();
    p.play = { kind: 'HILO', machineId: m.id, bet, card, mult: 1, steps: 0 };
    p.play.timer = setTimeout(() => this.hiloCash(p, true), m.hilo!.decideMs);
    this.broadcastMsg({
      t: 'ev', kind: 'hilo_start', playerId: p.id, machineId: m.id, bet, card,
      text: `${p.name} tire ${CARD_NAMES[card]} (${fmt(bet)}).`,
    });
    this.broadcast();
  }

  hiloChoice(p: Player, choice: string) {
    const play = p.play;
    if (!play || play.kind !== 'HILO') return this.reject(p, 'Pas de partie de cartes en cours.');
    const m = this.machine(play.machineId)!;
    const h = m.hilo!;
    const c = play.card!;
    const pWin = choice === 'HI' ? (13 - c) / 13 : (c - 1) / 13;
    if (pWin <= 0) return this.reject(p, 'Impossible — choisis l’autre sens.');
    if (play.timer) clearTimeout(play.timer);
    const n = this.drawCard();
    const ok = choice === 'HI' ? n > c : n < c;
    if (ok) {
      play.card = n;
      play.mult = play.mult! * ((1 - h.edge) / pWin);
      play.steps = play.steps! + 1;
      this.broadcastMsg({
        t: 'ev', kind: 'hilo_card', playerId: p.id, machineId: m.id, card: n,
        mult: Number(play.mult.toFixed(2)), steps: play.steps,
        text: `${p.name} : ${CARD_NAMES[n]} ✓ — ×${play.mult.toFixed(2)}`,
      });
      if (play.steps >= h.maxSteps) return this.hiloCash(p, true);
      play.timer = setTimeout(() => this.hiloCash(p, true), h.decideMs);
      this.broadcast();
    } else {
      const bet = play.bet;
      this.clearPlay(p);
      this.broadcastMsg({ t: 'ev', kind: 'hilo_bust', playerId: p.id, machineId: m.id, card: n });
      this.settle(p, m, bet, 0, `${CARD_NAMES[n]} ✗`, 'hilo_bust_');
    }
  }

  private hiloCash(p: Player, auto = false) {
    const play = p.play;
    if (!play || play.kind !== 'HILO') return;
    const m = this.machine(play.machineId)!;
    const steps = play.steps!, bet = play.bet, mult = play.mult!;
    this.clearPlay(p);
    if (steps === 0) {
      this.credit(p, bet);                    // aucune carte jouée : mise rendue
      this.logEv('hilo_cash', `${p.name} repose ses cartes (mise rendue).`,
        { playerId: p.id, machineId: m.id, win: bet, mult: 1 });
      this.broadcast();
    } else {
      this.settle(p, m, bet, bet * mult, `Cartes ×${mult.toFixed(2)}`, 'hilo_cash_', { mult: Number(mult.toFixed(2)) });
    }
  }

  // --- BLACKJACK ---
  private drawBJ(): number {
    const rank = 1 + Math.floor(Math.random() * 13);
    return rank === 1 ? 11 : Math.min(10, rank);
  }
  private bjAdd(play: ActivePlay, v: number) {
    if (v === 11) play.soft = (play.soft ?? 0) + 1;
    play.total = (play.total ?? 0) + v;
    while (play.total > 21 && play.soft! > 0) { play.total -= 10; play.soft!--; }
  }

  private playBJ(p: Player, m: MachineDef, bet: number) {
    const dealerCard = this.drawBJ();
    p.play = { kind: 'BJ', machineId: m.id, bet, total: 0, soft: 0, dealerCard };
    this.bjAdd(p.play, this.drawBJ());
    this.bjAdd(p.play, this.drawBJ());
    this.broadcastMsg({
      t: 'ev', kind: 'bj_start', playerId: p.id, machineId: m.id,
      bet, total: p.play.total, dealerCard,
      text: `${p.name} : ${p.play.total} contre ${dealerCard}.`,
    });
    if (p.play.total === 21) return this.bjResolve(p, true);
    p.play.timer = setTimeout(() => this.bjAction(p, 'STAND'), m.bj!.decideMs);
    this.broadcast();
  }

  bjAction(p: Player, action: string) {
    const play = p.play;
    if (!play || play.kind !== 'BJ') return this.reject(p, 'Pas de main en cours.');
    const m = this.machine(play.machineId)!;
    if (play.timer) clearTimeout(play.timer);
    if (action === 'HIT') {
      const v = this.drawBJ();
      this.bjAdd(play, v);
      this.broadcastMsg({
        t: 'ev', kind: 'bj_card', playerId: p.id, machineId: m.id, card: v, total: play.total,
        text: `${p.name} tire ${v === 11 ? 'As' : v} → ${play.total}.`,
      });
      if (play.total! > 21) {
        const bet = play.bet, tot = play.total;
        this.clearPlay(p);
        this.broadcastMsg({ t: 'ev', kind: 'bj_bust', playerId: p.id, machineId: m.id, total: tot });
        return this.settle(p, m, bet, 0, `Blackjack : ${tot} 💥`, 'bj_bust_');
      }
      play.timer = setTimeout(() => this.bjAction(p, 'STAND'), m.bj!.decideMs);
      this.broadcast();
    } else {
      this.bjResolve(p, false);
    }
  }

  private bjResolve(p: Player, natural: boolean) {
    const play = p.play!;
    const m = this.machine(play.machineId)!;
    const bet = play.bet, mine = play.total!;
    const dealer: ActivePlay = { kind: 'BJ', machineId: m.id, bet: 0, total: 0, soft: 0 };
    this.bjAdd(dealer, play.dealerCard!);
    while (dealer.total! < 17) this.bjAdd(dealer, this.drawBJ());
    this.clearPlay(p);

    let raw = 0, label: string;
    if (natural) { raw = bet * m.bj!.naturalMult; label = `♠️ BLACKJACK ! ${mine}`; }
    else if (dealer.total! > 21) { raw = bet * m.bj!.winMult; label = `Croupier saute (${dealer.total})`; }
    else if (mine > dealer.total!) { raw = bet * m.bj!.winMult; label = `${mine} bat ${dealer.total}`; }
    else if (mine === dealer.total!) { raw = bet; label = `Égalité à ${mine}`; }
    else label = `${mine} contre ${dealer.total}`;

    this.broadcastMsg({
      t: 'ev', kind: 'bj_result', playerId: p.id, machineId: m.id,
      total: mine, dealerTotal: dealer.total,
    });
    this.settle(p, m, bet, raw, label, 'bj_res_', { dealerTotal: dealer.total });
  }

  destroy() {
    clearInterval(this.posTimer);
    if (this.timer) clearTimeout(this.timer);
    for (const p of this.players.values()) this.clearPlay(p);
  }
}
