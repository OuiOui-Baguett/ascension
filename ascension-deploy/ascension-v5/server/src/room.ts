// ============================================================
// GameRoom — serveur autoritaire.
// Rythme : 3 minutes par étage, mises libres, ascenseur dès que
// le Péage est couvert. 4 machines : roue, crash, slots, hi-lo.
// ============================================================
import type { WebSocket } from 'ws';
import {
  floorAt, ITEMS, itemAt, START_BANK, FLOOR_MS, CARD_NAMES,
  betMin, betMax, floorFloat, tollOf, fmt,
  type MachineDef,
} from '../../shared/content';

const SPEED = Number(process.env.SPEED || 1);
const DUR = {
  BRIEFING: 8_000 / SPEED,
  FLOOR: FLOOR_MS / SPEED,
  SHOP: 35_000 / SPEED,
  FALLING: 9_000 / SPEED,
};
const RECONNECT_GRACE = 120_000;
const MAX_PLAYERS = 4;

type Phase = 'LOBBY' | 'BRIEFING' | 'FLOOR' | 'SHOP' | 'FALLING' | 'VICTORY';

interface ActivePlay {
  kind: 'CRASH' | 'HILO' | 'BJ';
  machineId: string;
  bet: number;
  // CRASH
  startAt?: number;
  crashMult?: number;
  bustTimer?: NodeJS.Timeout;
  // HILO
  card?: number;
  mult?: number;
  steps?: number;
  hiloTimer?: NodeJS.Timeout; // sert aussi de deadline au blackjack
  // BLACKJACK
  total?: number;
  soft?: number;
  dealerCard?: number;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  ws: WebSocket | null;
  connected: boolean;
  disconnectedAt: number;
  play: ActivePlay | null;
  spinPending: boolean; // roue ou slots en cours de résolution
  x: number;
  z: number;
  moved: boolean;
  net: number;   // bilan personnel : gains encaissés - mises engagées
}

const rid = (n = 8) => Math.random().toString(36).slice(2, 2 + n);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const makeCode = () =>
  Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

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
  bank = 0;
  phaseEndsAt = 0;
  createdAt = Date.now();
  private timer: NodeJS.Timeout | null = null;
  private posTimer: NodeJS.Timeout;
  effects = { shield: 0, fruit: false, insurance: false };
  offers: { itemId: string; price: number }[] = [];
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

  // ---------- réseau ----------
  addPlayer(name: string, ws: WebSocket): Player | string {
    if (this.phase !== 'LOBBY') return 'La partie a déjà commencé.';
    if (this.players.size >= MAX_PLAYERS) return 'La table est pleine (4 joueurs max).';
    const p: Player = {
      id: rid(6), token: rid(16),
      name: (name || 'Joueur').slice(0, 14),
      ws, connected: true, disconnectedAt: 0, play: null, spinPending: false,
      x: -1.5 + this.players.size * 1.1, z: 2.6, moved: true, net: 0,
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

  move(p: Player, x: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    p.x = Math.max(-9, Math.min(9, x));
    p.z = Math.max(-9, Math.min(9, z));
    p.moved = true;
  }

  send(p: Player, msg: unknown) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
  broadcastMsg(msg: unknown) {
    for (const p of this.players.values()) this.send(p, msg);
  }
  broadcast() {
    for (const p of this.players.values()) {
      this.send(p, { t: 'state', state: this.serialize(), youId: p.id });
    }
  }
  logEv(kind: string, text: string, data: Record<string, unknown> = {}) {
    this.broadcastMsg({ t: 'ev', kind, text, ...data });
  }

  serialize() {
    const f = this.floorDef;
    return {
      code: this.code,
      phase: this.phase,
      floor: this.floor,
      bank: this.bank,
      toll: tollOf(f),
      betMin: betMin(f),
      betMax: betMax(f),
      phaseEndsAt: this.phaseEndsAt,
      serverNow: Date.now(),
      effects: this.effects,
      offers: this.offers,
      stats: this.stats,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, connected: p.connected,
        x: p.x, z: p.z, net: p.net,
        playing: p.play ? p.play.machineId : (p.spinPending ? 'spin' : null),
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
    this.effects = { shield: 0, fruit: false, insurance: false };
    this.offers = [];
    this.stats = { biggestWin: 0, biggestLoss: 0, falls: 0, bestFloor: 1, startedAt: Date.now() };
    for (const pl of this.players.values()) pl.net = 0;
    this.logEv('start', `La tour vous ouvre ses portes. Banque commune : ${fmt(START_BANK)}.`);
    this.gotoFloor(1);
  }

  private gotoFloor(n: number) {
    this.floor = n;
    this.stats.bestFloor = Math.max(this.stats.bestFloor, n);
    const f = this.floorDef;
    const float = floorFloat(f);
    if (this.bank < float) {
      const adv = float - this.bank;
      this.bank = float;
      this.logEv('advance', `Avance de la Maison : +${fmt(adv)}. La tour n'oublie jamais une dette.`);
    }
    this.setPhase('BRIEFING', DUR.BRIEFING, () => this.startFloor());
  }

  private startFloor() {
    const f = this.floorDef;
    this.logEv('floor', `${f.theme.emoji} 3 minutes. Péage : ${fmt(tollOf(f))}. Bonne chance.`);
    this.setPhase('FLOOR', DUR.FLOOR, () => this.endFloor());
  }

  // fin d'étage : chrono écoulé OU ascenseur appelé
  private endFloor() {
    for (const p of this.players.values()) {
      if (p.play?.kind === 'CRASH') this.cashout(p, true);
      else if (p.play?.kind === 'HILO') this.hiloCash(p, true);
      else if (p.play?.kind === 'BJ') this.bjAction(p, 'STAND');
    }
    this.resolveFloor();
  }

  elevator(p: Player) {
    if (this.phase !== 'FLOOR') return;
    if (this.bank < tollOf(this.floorDef)) return this.reject(p, 'Le Péage n’est pas couvert.');
    if (this.timer) clearTimeout(this.timer);
    this.logEv('elevator', `${p.name} appelle l'ascenseur !`);
    this.endFloor();
  }

  private resolveFloor() {
    const f = this.floorDef;
    const toll = tollOf(f);
    if (this.bank >= toll) {
      this.bank -= toll;
      this.logEv('toll', `PÉAGE PAYÉ : -${fmt(toll)}. L'ascenseur arrive…`);
      if (this.floor === 5) return this.victory();
      this.effects.shield = 0;
      this.effects.fruit = false;
      this.openShop();
    } else {
      this.fall(`Péage non payé (${fmt(this.bank)} / ${fmt(toll)}).`);
    }
  }

  private openShop() {
    const next = floorAt(this.floor + 1);
    this.offers = ITEMS.map(it => ({
      itemId: it.id,
      price: Math.round(it.priceFrac * floorFloat(next)),
    }));
    this.setPhase('SHOP', DUR.SHOP, () => this.gotoFloor(this.floor + 1));
  }

  buy(p: Player, itemId: string) {
    if (this.phase !== 'SHOP') return this.reject(p, 'Le shop est fermé.');
    const idx = this.offers.findIndex(o => o.itemId === itemId);
    if (idx < 0) return this.reject(p, 'Objet indisponible.');
    const offer = this.offers[idx];
    if (offer.price > this.bank) return this.reject(p, 'Banque insuffisante.');
    this.offers.splice(idx, 1);
    this.bank -= offer.price;
    const it = itemAt(itemId)!;
    if (it.category === 'PROTECTION') this.effects.shield += 3;
    if (it.category === 'RECOMPENSE') this.effects.fruit = true;
    if (it.category === 'ASSURANCE') this.effects.insurance = true;
    this.logEv('buy', `${p.name} achète ${it.icon} ${it.name} (-${fmt(offer.price)}).`);
    this.broadcast();
  }

  private fall(reason: string) {
    this.stats.falls++;
    for (const p of this.players.values()) this.clearPlay(p);
    this.logEv('fall', `LA CHUTE. ${reason}`);
    this.setPhase('FALLING', DUR.FALLING, () => {
      const kept = this.effects.insurance
        ? Math.max(START_BANK, Math.round(this.bank * 0.3))
        : START_BANK;
      if (this.effects.insurance) this.logEv('insurance', `🥚 L'Œuf Mystérieux éclot : ${fmt(kept)} sauvés.`);
      this.bank = kept;
      this.effects = { shield: 0, fruit: false, insurance: false };
      this.gotoFloor(1);
    });
  }

  private victory() {
    const mins = Math.round((Date.now() - this.stats.startedAt) / 60000);
    this.logEv('victory', `LA DERNIÈRE PORTE S'OUVRE. Victoire en ${mins} min, ${this.stats.falls} chute(s).`);
    this.setPhase('VICTORY', 3_600_000);
  }

  // ---------- jeu ----------
  private reject(p: Player, reason: string) {
    this.send(p, { t: 'ev', kind: 'reject', text: reason });
  }

  private clearPlay(p: Player) {
    if (p.play?.bustTimer) clearTimeout(p.play.bustTimer);
    if (p.play?.hiloTimer) clearTimeout(p.play.hiloTimer);
    p.play = null;
  }

  private applyLoss(bet: number, p?: Player): { lost: number; saved: number } {
    if (this.effects.shield > 0) {
      this.effects.shield--;
      const saved = Math.round(bet / 2);
      this.bank += saved;
      if (p) p.net += saved;
      return { lost: bet - saved, saved };
    }
    return { lost: bet, saved: 0 };
  }

  // faillite : plus rien à miser et personne en jeu
  private checkRuin() {
    if (this.phase !== 'FLOOR') return;
    const anyActive = [...this.players.values()].some(p => p.play || p.spinPending);
    if (!anyActive && this.bank < betMin(this.floorDef)) {
      if (this.timer) clearTimeout(this.timer);
      this.fall('FAILLITE — la banque ne couvre plus la mise minimale.');
    }
  }

  bet(p: Player, machineId: string, amount: number, opt = '') {
    if (this.phase !== 'FLOOR') return this.reject(p, 'Ce n’est pas le moment de miser.');
    if (p.play || p.spinPending) return this.reject(p, 'Tu as déjà une mise en cours.');
    const m = this.machine(machineId);
    if (!m) return this.reject(p, 'Machine inconnue.');
    const f = this.floorDef;
    amount = Math.round(amount);
    if (!Number.isFinite(amount) || amount < betMin(f)) return this.reject(p, `Mise minimale : ${fmt(betMin(f))}.`);
    if (amount > betMax(f)) return this.reject(p, `Mise maximale : ${fmt(betMax(f))}.`);
    if (amount > this.bank) return this.reject(p, 'La banque ne couvre pas cette mise.');

    // certains jeux exigent un choix (couleur, pari de dés)
    if (m.archetype === 'ROULETTE' && !['RED', 'BLACK', 'GREEN'].includes(opt))
      return this.reject(p, 'Choisis une couleur.');
    if (m.archetype === 'CRAPS' && !['UNDER', 'SEVEN', 'OVER'].includes(opt))
      return this.reject(p, 'Choisis un pari.');

    this.bank -= amount;
    p.net -= amount;
    if (m.archetype === 'WHEEL') this.playWheel(p, m, amount);
    else if (m.archetype === 'SLOTS') this.playSlots(p, m, amount);
    else if (m.archetype === 'CRASH') this.playCrash(p, m, amount);
    else if (m.archetype === 'HILO') this.playHilo(p, m, amount);
    else if (m.archetype === 'ROULETTE') this.playRoulette(p, m, amount, opt);
    else if (m.archetype === 'CRAPS') this.playCraps(p, m, amount, opt);
    else this.playBJ(p, m, amount);
    this.broadcast();
  }

  // --- ROULETTE ---
  private playRoulette(p: Player, m: MachineDef, bet: number, opt: string) {
    const r = m.roulette!;
    const pocket = Math.floor(Math.random() * 37); // 0 = vert
    const color = pocket === 0 ? 'GREEN' : (pocket % 2 ? 'RED' : 'BLACK');
    const mult = opt === color ? (color === 'GREEN' ? r.greenMult : r.colorMult) : 0;
    const win = Math.round(bet * mult);
    const emo = { RED: '🔴', BLACK: '⚫', GREEN: '🟢' } as any;
    p.spinPending = true;
    this.broadcastMsg({
      t: 'ev', kind: 'roulette_spin',
      playerId: p.id, machineId: m.id, bet, opt, color, pocket, win, mult, spinMs: r.spinMs,
      text: `${p.name} mise ${fmt(bet)} sur ${emo[opt]} à la roulette…`,
    });
    setTimeout(() => {
      p.spinPending = false;
      if (win > 0) {
        this.bank += win;
        p.net += win;
        this.stats.biggestWin = Math.max(this.stats.biggestWin, win - bet);
        this.logEv('roulette_win', `${emo[color]} ${pocket} ! ×${mult} → +${fmt(win)}`,
          { playerId: p.id, machineId: m.id, win, mult });
      } else {
        const { lost, saved } = this.applyLoss(bet, p);
        this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
        this.logEv('roulette_lose',
          saved ? `${emo[color]} ${pocket}… 🐢 ${fmt(saved)} sauvés.` : `${emo[color]} ${pocket}. ${fmt(lost)} perdus.`,
          { playerId: p.id, machineId: m.id });
      }
      this.broadcast();
      this.checkRuin();
    }, r.spinMs);
  }

  // --- CRAPS ---
  private playCraps(p: Player, m: MachineDef, bet: number, opt: string) {
    const c = m.craps!;
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const total = d1 + d2;
    const hit = (opt === 'UNDER' && total < 7) || (opt === 'OVER' && total > 7) || (opt === 'SEVEN' && total === 7);
    const mult = hit ? (opt === 'SEVEN' ? c.sevenMult : c.sideMult) : 0;
    const win = Math.round(bet * mult);
    const lab = { UNDER: 'SOUS 7', SEVEN: 'PILE 7', OVER: 'SUR 7' } as any;
    p.spinPending = true;
    this.broadcastMsg({
      t: 'ev', kind: 'craps_roll',
      playerId: p.id, machineId: m.id, bet, opt, d1, d2, total, win, mult, rollMs: c.rollMs,
      text: `${p.name} lance les dés (${lab[opt]}, ${fmt(bet)})…`,
    });
    setTimeout(() => {
      p.spinPending = false;
      if (win > 0) {
        this.bank += win;
        p.net += win;
        this.stats.biggestWin = Math.max(this.stats.biggestWin, win - bet);
        this.logEv('craps_win', `🎲 ${d1}+${d2} = ${total} ! ×${mult} → +${fmt(win)}`,
          { playerId: p.id, machineId: m.id, win, mult });
      } else {
        const { lost, saved } = this.applyLoss(bet, p);
        this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
        this.logEv('craps_lose',
          saved ? `🎲 ${d1}+${d2} = ${total}… 🐢 ${fmt(saved)} sauvés.` : `🎲 ${d1}+${d2} = ${total}. ${fmt(lost)} perdus.`,
          { playerId: p.id, machineId: m.id });
      }
      this.broadcast();
      this.checkRuin();
    }, c.rollMs);
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
    const a = this.drawBJ(), b = this.drawBJ();
    const dealerCard = this.drawBJ();
    p.play = { kind: 'BJ', machineId: m.id, bet, total: 0, soft: 0, dealerCard };
    this.bjAdd(p.play, a); this.bjAdd(p.play, b);
    this.broadcastMsg({
      t: 'ev', kind: 'bj_start',
      playerId: p.id, machineId: m.id, bet, total: p.play.total, dealerCard,
      text: `${p.name} : ${p.play.total} contre ${dealerCard} au blackjack (${fmt(bet)}).`,
    });
    if (p.play.total === 21) { this.bjResolve(p, true); return; }
    p.play.hiloTimer = setTimeout(() => this.bjAction(p, 'STAND'), m.bj!.decideMs);
    this.broadcast();
  }

  bjAction(p: Player, action: string) {
    const play = p.play;
    if (!play || play.kind !== 'BJ') return this.reject(p, 'Pas de main en cours.');
    const m = this.machine(play.machineId)!;
    if (play.hiloTimer) clearTimeout(play.hiloTimer);
    if (action === 'HIT') {
      const v = this.drawBJ();
      this.bjAdd(play, v);
      this.broadcastMsg({
        t: 'ev', kind: 'bj_card',
        playerId: p.id, machineId: m.id, card: v, total: play.total,
        text: `${p.name} tire ${v === 11 ? 'As' : v} → ${play.total}.`,
      });
      if (play.total! > 21) {
        this.clearPlay(p);
        const { lost, saved } = this.applyLoss(play.bet, p);
        this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
        this.broadcastMsg({
          t: 'ev', kind: 'bj_bust', playerId: p.id, machineId: m.id, total: play.total,
          text: saved ? `${p.name} saute à ${play.total}… 🐢 ${fmt(saved)} sauvés.` : `${p.name} saute à ${play.total}. ${fmt(lost)} perdus.`,
        });
        this.broadcast();
        this.checkRuin();
        return;
      }
      play.hiloTimer = setTimeout(() => this.bjAction(p, 'STAND'), m.bj!.decideMs);
      this.broadcast();
    } else {
      this.bjResolve(p, false);
    }
  }

  private bjResolve(p: Player, natural: boolean) {
    const play = p.play!;
    const m = this.machine(play.machineId)!;
    this.clearPlay(p);
    // le croupier tire jusqu'à 17
    const dealer: ActivePlay = { kind: 'BJ', machineId: m.id, bet: 0, total: 0, soft: 0 };
    this.bjAdd(dealer, play.dealerCard!);
    while (dealer.total! < 17) this.bjAdd(dealer, this.drawBJ());
    let outcome: string, win = 0;
    if (natural) { outcome = 'BLACKJACK'; win = Math.round(play.bet * m.bj!.naturalMult); }
    else if (dealer.total! > 21 || play.total! > dealer.total!) { outcome = 'WIN'; win = Math.round(play.bet * m.bj!.winMult); }
    else if (play.total === dealer.total) { outcome = 'PUSH'; win = play.bet; }
    else outcome = 'LOSE';
    if (win > 0) {
      this.bank += win;
      if (win > play.bet) this.stats.biggestWin = Math.max(this.stats.biggestWin, win - play.bet);
    } else {
      const { lost } = this.applyLoss(play.bet, p);
      this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
    }
    const txt = {
      BLACKJACK: `♠️ BLACKJACK ! ${p.name} → +${fmt(win)}`,
      WIN: `${p.name} : ${play.total} bat ${dealer.total} → +${fmt(win)}`,
      PUSH: `${p.name} : égalité à ${play.total}, mise rendue.`,
      LOSE: `${p.name} : ${play.total} contre ${dealer.total}. Perdu.`,
    }[outcome];
    this.broadcastMsg({
      t: 'ev', kind: 'bj_result',
      playerId: p.id, machineId: m.id, total: play.total, dealerTotal: dealer.total, outcome, win,
      text: txt,
    });
    this.broadcast();
    this.checkRuin();
  }

  // --- ROUE ---
  private playWheel(p: Player, m: MachineDef, bet: number) {
    const w = m.wheel!;
    const seg = pickWeighted(w.segments);
    const boost = this.effects.fruit && seg.mult > 0 ? 1.25 : 1;
    const win = Math.round(bet * seg.mult * boost);
    p.spinPending = true;
    this.broadcastMsg({
      t: 'ev', kind: 'wheel_spin',
      playerId: p.id, machineId: m.id, bet, mult: seg.mult, win, spinMs: w.spinMs,
      text: `${p.name} mise ${fmt(bet)} sur ${m.name}…`,
    });
    setTimeout(() => {
      p.spinPending = false;
      if (win > 0) {
        this.bank += win;
        p.net += win;
        this.stats.biggestWin = Math.max(this.stats.biggestWin, win - bet);
        this.logEv('wheel_win', `${m.name} : ×${seg.mult}${boost > 1 ? ' 🥭' : ''} → +${fmt(win)} !`,
          { playerId: p.id, machineId: m.id, mult: seg.mult, win });
      } else {
        const { lost, saved } = this.applyLoss(bet, p);
        this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
        this.logEv('wheel_lose',
          saved ? `${m.name} : ×0… 🐢 la Carapace sauve ${fmt(saved)}.` : `${m.name} : ×0. ${fmt(lost)} envolés.`,
          { playerId: p.id, machineId: m.id, mult: 0 });
      }
      this.broadcast();
      this.checkRuin();
    }, w.spinMs);
  }

  // --- SLOTS ---
  private playSlots(p: Player, m: MachineDef, bet: number) {
    const s = m.slots!;
    const idx = [pickWeighted(s.symbols), pickWeighted(s.symbols), pickWeighted(s.symbols)]
      .map(sym => s.symbols.indexOf(sym));
    const [a, b, c] = idx;
    let mult = 0;
    if (a === b && b === c) mult = s.symbols[a].triple;
    else if (a === b || a === c) mult = s.symbols[a].pair;
    else if (b === c) mult = s.symbols[b].pair;
    const boost = this.effects.fruit && mult > 0 ? 1.25 : 1;
    const win = Math.round(bet * mult * boost);
    const faces = idx.map(i => s.symbols[i].e).join(' ');
    p.spinPending = true;
    this.broadcastMsg({
      t: 'ev', kind: 'slots_spin',
      playerId: p.id, machineId: m.id, bet, symbols: idx, win, mult, spinMs: s.spinMs,
      text: `${p.name} lance ${m.name} (${fmt(bet)})…`,
    });
    setTimeout(() => {
      p.spinPending = false;
      if (win > 0) {
        this.bank += win;
        p.net += win;
        this.stats.biggestWin = Math.max(this.stats.biggestWin, win - bet);
        const jackpot = mult >= 100 ? ' 💰 JACKPOT !' : '';
        this.logEv('slots_win', `${faces} → ×${mult}${boost > 1 ? ' 🥭' : ''} +${fmt(win)} !${jackpot}`,
          { playerId: p.id, machineId: m.id, win, mult });
      } else {
        const { lost, saved } = this.applyLoss(bet, p);
        this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
        this.logEv('slots_lose',
          saved ? `${faces} → rien… 🐢 ${fmt(saved)} sauvés.` : `${faces} → rien. ${fmt(lost)} perdus.`,
          { playerId: p.id, machineId: m.id });
      }
      this.broadcast();
      this.checkRuin();
    }, s.spinMs);
  }

  // --- CRASH ---
  private playCrash(p: Player, m: MachineDef, bet: number) {
    const c = m.crash!;
    const u = Math.random();
    const crashMult = Math.min(100, Math.max(1, (1 - c.edge) / (1 - u)));
    const ticksToBust = Math.log(crashMult) / Math.log(c.growth);
    const msToBust = Math.max(200, ticksToBust * c.tickMs);
    const startAt = Date.now();
    const bustTimer = setTimeout(() => this.bust(p), msToBust);
    p.play = { kind: 'CRASH', machineId: m.id, bet, startAt, crashMult, bustTimer };
    this.broadcastMsg({
      t: 'ev', kind: 'crash_start',
      playerId: p.id, machineId: m.id, bet, startAt,
      growth: c.growth, tickMs: c.tickMs,
      text: `${p.name} engage ${fmt(bet)} sur ${m.name}…`,
    });
  }

  private crashCurrentMult(play: ActivePlay, m: MachineDef): number {
    const c = m.crash!;
    return Math.pow(c.growth, (Date.now() - play.startAt!) / c.tickMs);
  }

  cashout(p: Player, auto = false) {
    const play = p.play;
    if (!play) { if (!auto) this.reject(p, 'Rien à encaisser.'); return; }
    if (play.kind === 'HILO') return this.hiloCash(p, auto);
    const m = this.machine(play.machineId)!;
    const mult = this.crashCurrentMult(play, m);
    if (mult >= play.crashMult!) return this.bust(p);
    clearTimeout(play.bustTimer!);
    p.play = null;
    const win = Math.round(play.bet * mult);
    this.bank += win;
    p.net += win;
    this.stats.biggestWin = Math.max(this.stats.biggestWin, win - play.bet);
    this.logEv('crash_cash',
      `${p.name} encaisse à ×${mult.toFixed(2)} → +${fmt(win)}${auto ? ' (fin du chrono)' : ''}.`,
      { playerId: p.id, machineId: m.id, mult: Number(mult.toFixed(2)), win });
    this.broadcast();
  }

  private bust(p: Player) {
    const play = p.play;
    if (!play || play.kind !== 'CRASH') return;
    p.play = null;
    const m = this.machine(play.machineId)!;
    const { lost, saved } = this.applyLoss(play.bet, p);
    this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
    this.logEv('crash_bust',
      saved
        ? `💥 ${m.name} s'effondre à ×${play.crashMult!.toFixed(2)}… 🐢 ${fmt(saved)} sauvés.`
        : `💥 ${m.name} s'effondre à ×${play.crashMult!.toFixed(2)}. ${fmt(lost)} perdus.`,
      { playerId: p.id, machineId: m.id, mult: Number(play.crashMult!.toFixed(2)) });
    this.broadcast();
    this.checkRuin();
  }

  // --- HILO ---
  private drawCard() { return 1 + Math.floor(Math.random() * 13); }

  private hiloDeadline(p: Player, m: MachineDef) {
    if (p.play?.hiloTimer) clearTimeout(p.play.hiloTimer);
    p.play!.hiloTimer = setTimeout(() => this.hiloCash(p, true), m.hilo!.decideMs);
  }

  private playHilo(p: Player, m: MachineDef, bet: number) {
    const card = this.drawCard();
    p.play = { kind: 'HILO', machineId: m.id, bet, card, mult: 1, steps: 0 };
    this.hiloDeadline(p, m);
    this.broadcastMsg({
      t: 'ev', kind: 'hilo_start',
      playerId: p.id, machineId: m.id, bet, card,
      text: `${p.name} tire ${CARD_NAMES[card]} aux ${m.name} (${fmt(bet)}).`,
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
    const stepMult = (1 - h.edge) / pWin;
    const n = this.drawCard();
    const ok = choice === 'HI' ? n > c : n < c;
    if (ok) {
      play.card = n;
      play.mult = play.mult! * stepMult;
      play.steps = play.steps! + 1;
      this.broadcastMsg({
        t: 'ev', kind: 'hilo_card',
        playerId: p.id, machineId: m.id, card: n, ok: true,
        mult: Number(play.mult.toFixed(2)), steps: play.steps,
        text: `${p.name} : ${CARD_NAMES[n]} ✓ — multiplicateur ×${play.mult.toFixed(2)}.`,
      });
      if (play.steps >= h.maxSteps) return this.hiloCash(p, true);
      this.hiloDeadline(p, m);
      this.broadcast();
    } else {
      this.clearPlay(p);
      const { lost, saved } = this.applyLoss(play.bet, p);
      this.stats.biggestLoss = Math.max(this.stats.biggestLoss, lost);
      this.broadcastMsg({
        t: 'ev', kind: 'hilo_bust',
        playerId: p.id, machineId: m.id, card: n,
        text: saved
          ? `${p.name} : ${CARD_NAMES[n]} ✗… 🐢 ${fmt(saved)} sauvés.`
          : `${p.name} : ${CARD_NAMES[n]} ✗. ${fmt(lost)} perdus.`,
      });
      this.broadcast();
      this.checkRuin();
    }
  }

  private hiloCash(p: Player, auto = false) {
    const play = p.play;
    if (!play || play.kind !== 'HILO') return;
    const m = this.machine(play.machineId)!;
    this.clearPlay(p);
    if (play.steps === 0) {
      this.bank += play.bet; // aucune carte jouée : mise rendue
      this.logEv('hilo_cash', `${p.name} repose ses cartes (mise rendue).`,
        { playerId: p.id, machineId: m.id, win: play.bet, mult: 1 });
    } else {
      const win = Math.round(play.bet * play.mult!);
      this.bank += win;
      this.stats.biggestWin = Math.max(this.stats.biggestWin, win - play.bet);
      this.logEv('hilo_cash',
        `${p.name} encaisse ×${play.mult!.toFixed(2)} aux cartes → +${fmt(win)}${auto ? '' : ' !'}`,
        { playerId: p.id, machineId: m.id, win, mult: Number(play.mult!.toFixed(2)) });
    }
    this.broadcast();
  }

  destroy() {
    clearInterval(this.posTimer);
    if (this.timer) clearTimeout(this.timer);
    for (const p of this.players.values()) this.clearPlay(p);
  }
}
