// ============================================================
// Zones privées côté serveur : rondes des vigiles, caméras, portes, fumée,
// somnifère, tenue de serveur, brouilleur, morceaux du code. C'est ici qu'on
// décide qui est repéré : la page ne fait que montrer.
// ============================================================
import type { ServerMsg } from './protocol';
import { VAULT_RECT, VAN, BAGS, GATES, isPrivate, DOORS, DOOR_OPEN_MS, ROUTES, GUARD, CAMS, CAM, camYaw, INTEL, ORD, SMOKE_R, SMOKE_MS, clearLine, closedRects, outside, type Smoke } from './secu';

/** Ce que la surveillance a besoin de savoir d'un joueur. */
export interface WPlayer { id: string; name: string; x: number; z: number; mv: number; out: boolean; bot?: unknown; inv: Record<string, number> }
export interface WIO {
  send(p: WPlayer, m: ServerMsg): void; all(m: ServerMsg): void; others(p: WPlayer, m: ServerMsg): void; err(p: WPlayer, msg: string): void;
  me(p: WPlayer): void; end(winner: 'team' | 'indic', reason: string): void; heat(p: WPlayer | null, base: number): void; place(p: WPlayer, x: number, z: number): void;
}
interface Guard { route: number; i: number; x: number; z: number; yaw: number; wait: number; look: number; sleep: number; turn: number; turnYaw: number; alert: number }
interface PS { sus: number; csus: number; src: number; grace: number; cgrace: number; noise: number; tenue: number; found: Set<number>; sent: string }

const ang = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const r2 = (v: number) => Math.round(v * 100) / 100;

export class Watch {
  doors = DOORS.map(() => 0);
  guards: Guard[] = [];
  cams = CAMS.map(() => ({ jam: 0, alarm: 0 }));
  smokes: (Smoke & { until: number })[] = [];
  noJam = 0; lock = 0;
  code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
  fakes = new Map<number, string>();
  private ps = new Map<string, PS>();
  open = false; bags = BAGS; loot = 0; carry = new Map<string, number>();

  constructor(private io: WIO, public target = 3) { this.addGuard(0, 0); this.addGuard(1, 0); }

  addGuard(route: number, i: number) {
    const R = ROUTES[route], q = R[i % R.length];
    this.guards.push({ route, i: i % R.length, x: q[0], z: q[1], yaw: 0, wait: 0, look: 0, sleep: 0, turn: 0, turnYaw: 0, alert: 0 });
  }
  st(p: WPlayer) {
    let s = this.ps.get(p.id);
    if (!s) this.ps.set(p.id, s = { sus: 0, csus: 0, src: -1, grace: 0, cgrace: 0, noise: 0, tenue: 0, found: new Set(), sent: '' });
    return s;
  }
  private closed(now: number) { return closedRects(i => this.doors[i] > now); }
  activeSmokes() { return this.smokes; }
  /** Morceau du code tel qu'on le lit (faussé si l'indic est passé par là). */
  piece(i: number) { return this.fakes.get(i) ?? this.code.slice(i * 2, i * 2 + 2); }

  // ---------- actions des joueurs ----------
  door(p: WPlayer, d: number, how: string, now: number) {
    const D = DOORS[d];
    if (!D || (p.x - D.x) ** 2 + (p.z - D.z) ** 2 > 2 ** 2) return;
    if (this.doors[d] > now) return;
    if (D.kind === 'vault') return;
    if (how === 'push') { if (outside(D, p.x, p.z)) return this.io.err(p, 'C\'est fermé à clé de ce côté.'); }
    else if (how === 'badge') {
      if (D.kind !== 'staff') return this.io.err(p, 'Le badge n\'ouvre pas cette serrure : il faut la crocheter.');
      if (!(p.inv.badge > 0)) return this.io.err(p, 'Il te faut un faux badge.');
      p.inv.badge--; if (!p.inv.badge) delete p.inv.badge; this.io.me(p);
    } else if (how === 'pick') { if (!p.inv.crochet) return this.io.err(p, 'Il te faut un kit de crochetage.'); }
    else return;
    this.doors[d] = now + DOOR_OPEN_MS;
  }
  /** Le code à 6 chiffres, tapé à l'une des deux grilles. Un mauvais code alerte la sécurité. */
  tryCode(p: WPlayer, code: string) {
    if (this.open || !GATES.some(i => (p.x - DOORS[i].x) ** 2 + (p.z - DOORS[i].z) ** 2 < 2.4 ** 2)) return;
    if (code !== this.code) {
      this.io.send(p, { t: 'alarm', big: 'Code refusé', msg: 'La sécurité est alertée. Un des morceaux est faux… ou quelqu\'un ment.' });
      this.io.others(p, { t: 'alarm', big: '', msg: `${p.name} a tapé un mauvais code à la chambre forte.` });
      return this.io.heat(null, 10);
    }
    this.open = true; for (const i of GATES) this.doors[i] = Infinity;
    this.io.all({ t: 'alarm', big: 'Chambre forte ouverte !', msg: `${p.name} a tapé le bon code. Sortez les sacs jusqu'à la camionnette.` });
  }
  grab(p: WPlayer) {
    const R = VAULT_RECT, n = this.carry.get(p.id) ?? 0;
    if (!this.open || p.x < R[0] || p.x > R[2] || p.z < R[1] || p.z > R[3]) return;
    if (this.bags <= 0) return this.io.err(p, 'La chambre forte est vide.');
    if (n >= (p.inv.sac ? 2 : 1)) return this.io.err(p, p.inv.sac ? 'Tu portes déjà 2 sacs.' : 'Tu portes déjà un sac (le grand sac de sport permet d\'en porter 2).');
    this.bags--; this.carry.set(p.id, n + 1);
  }
  drop(p: WPlayer) {
    const n = this.carry.get(p.id) ?? 0;
    if (!n || (p.x - VAN.x) ** 2 + (p.z - VAN.z) ** 2 > 3.2 ** 2) return;
    this.carry.delete(p.id); this.loot += n;
    this.io.all({ t: 'alarm', big: `Butin ${Math.min(this.loot, this.target)} / ${this.target}`, msg: `${p.name} a chargé ${n > 1 ? n + ' sacs' : 'un sac'} dans la camionnette.` });
    if (this.loot >= this.target) this.io.end('team', 'Le butin est dans la camionnette : le casse est réussi !');
  }
  use(p: WPlayer, item: string, now: number) {
    if (!(p.inv[item] > 0)) return;
    if (item === 'brouilleur') {
      if (now < this.noJam) return this.io.err(p, 'Les caméras ont été rallumées : le brouilleur ne prend pas pour l\'instant.');
      const hit = CAMS.map((c, i) => (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < 12 ** 2 ? i : -1).filter(i => i >= 0);
      if (!hit.length) return this.io.err(p, 'Aucune caméra assez proche (12 m) à brouiller.');
      for (const i of hit) this.cams[i].jam = now + 60000;
      this.io.send(p, { t: 'alarm', big: 'Caméras brouillées', msg: `${hit.length} caméra${hit.length > 1 ? 's' : ''} coupée${hit.length > 1 ? 's' : ''} pendant 60 s` });
    } else if (item === 'fumi') {
      this.smokes.push({ x: p.x, z: p.z, r: SMOKE_R, until: now + SMOKE_MS });
      this.io.all({ t: 'smoke', x: r2(p.x), z: r2(p.z), ms: SMOKE_MS });
    } else if (item === 'tenue') {
      const s = this.st(p); s.tenue = now + 90000;
      this.io.send(p, { t: 'buff', k: 'tenue', ms: 90000 });
      this.io.send(p, { t: 'alarm', big: 'Tenue de serveur', msg: 'Les vigiles ne te remarquent pas pendant 90 s. Les caméras, si.' });
    } else return;
    p.inv[item]--; if (!p.inv[item]) delete p.inv[item]; this.io.me(p);
  }
  sleep(p: WPlayer, gi: number, now: number) {
    const g = this.guards[gi];
    if (!g || !(p.inv.somni > 0) || g.sleep > now) return;
    if ((p.x - g.x) ** 2 + (p.z - g.z) ** 2 > 1.9 ** 2) return this.io.err(p, 'Approche-toi plus du vigile.');
    p.inv.somni--; if (!p.inv.somni) delete p.inv.somni; this.io.me(p);
    if (this.sees(g, p, now)) { this.spotted(p, gi, now, 'Le vigile t\'a vu venir : raté.'); return; }
    g.sleep = now + 120000;
    this.io.send(p, { t: 'alarm', big: 'Vigile endormi', msg: 'Il dort pour 2 minutes.' });
  }
  intel(p: WPlayer, i: number, now: number) {
    const I = INTEL[i];
    if (!I || (p.x - I.x) ** 2 + (p.z - I.z) ** 2 > 2 ** 2) return;
    if (I.game === 'pick' && !p.inv.crochet) return this.io.err(p, 'Il te faut un kit de crochetage.');
    const s = this.st(p); s.found.add(i);
    this.sendClue(p, i);
    void now;
  }
  sendClue(p: WPlayer, i: number) {
    const I = INTEL[i], v = this.piece(i);
    this.io.send(p, { t: 'clue', i, code: v, text: `${I.where} — ${ORD[i]} morceau du code de la chambre forte : ${v[0]} ${v[1]}` });
  }
  /** Mini-jeu raté : la serrure claque ou l'alarme du poste sonne. */
  noise(p: WPlayer, kind: string, now: number) {
    if (!isPrivate(p.x, p.z)) return;
    for (const g of this.guards) if (g.sleep < now && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 < 9 ** 2) { g.turn = now + 3000; g.turnYaw = Math.atan2(p.x - g.x, p.z - g.z); }
    this.io.heat(p, kind === 'hack' ? 6 : 3);
    this.io.others(p, { t: 'alarm', big: '', msg: kind === 'hack' ? 'Une alarme a sonné dans la salle de surveillance.' : 'Une serrure a claqué quelque part dans les zones privées.' });
  }
  /** Coups de l'indic liés aux zones privées. */
  trap(id: string, now: number) {
    if (id === 'vigile' && this.guards.length < 4) this.addGuard(this.guards.length === 2 ? 2 : 1, 9);
    void now;
    if (id === 'fauxcode') {
      const free = [0, 1, 2].filter(i => !this.fakes.has(i));
      if (free.length) {
        const i = free[Math.floor(Math.random() * free.length)], v = this.code.slice(i * 2, i * 2 + 2).split(''), k = Math.floor(Math.random() * 2);
        v[k] = String((+v[k] + 1 + Math.floor(Math.random() * 9)) % 10);
        this.fakes.set(i, v.join(''));
      }
    }
  }
  /** Retour d'un joueur en pleine nuit : ses trouvailles et sa tenue. */
  resend(p: WPlayer, now: number) {
    const s = this.st(p);
    for (const i of s.found) this.sendClue(p, i);
    if (s.tenue > now) this.io.send(p, { t: 'buff', k: 'tenue', ms: s.tenue - now });
  }

  // ---------- vision ----------
  private sees(g: Guard, p: WPlayer, now: number, closed = this.closed(now)) {
    const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
    if (d > GUARD.range) return false;
    if (d > .8 && (dx * Math.sin(g.yaw) + dz * Math.cos(g.yaw)) / d < GUARD.cos) return false;
    return clearLine(g.x, g.z, p.x, p.z, closed, this.smokes);
  }
  private spotted(p: WPlayer, gi: number, now: number, why = 'Un vigile t\'a surpris et raccompagné dehors.') {
    const s = this.st(p), g = this.guards[gi];
    s.sus = 0; s.csus = 0; s.grace = now + 3500; s.cgrace = now + 3500;
    if (g) { g.alert = now + 2200; g.yaw = Math.atan2(p.x - g.x, p.z - g.z); }
    const west = p.x < -14;
    const to = west ? { x: -22.5, z: -6.4 } : { x: 11, z: -13.6 };
    this.io.place(p, to.x, to.z);
    this.io.send(p, { t: 'tp', x: to.x, z: to.z, yaw: 0 });
    const c = this.carry.get(p.id);
    if (c) { this.carry.delete(p.id); this.bags += c; why += ' Le sac est retourné à la chambre forte.'; }
    this.io.send(p, { t: 'alarm', big: 'Repéré !', msg: why, voice: 'vigile_hey' });
    this.io.others(p, { t: 'alarm', big: '', msg: `${p.name} s'est fait raccompagner par un vigile.` });
    this.io.heat(p, 10);
  }

  tick(players: WPlayer[], now: number, dt: number) {
    this.smokes = this.smokes.filter(s => s.until > now);
    const closed0 = this.closed(now);
    // les vigiles
    this.guards.forEach(g => {
      if (g.sleep > now || g.alert > now) return;
      if (g.turn > now) { g.yaw += ang(g.turnYaw - g.yaw) * Math.min(1, dt * 6); return; }
      if (g.wait > now) { g.yaw = g.look + Math.sin(now / 900) * .6; return; }
      const R = ROUTES[g.route], q = R[g.i], dx = q[0] - g.x, dz = q[1] - g.z, d = Math.hypot(dx, dz), step = GUARD.speed * dt;
      if (d <= step) {
        g.x = q[0]; g.z = q[1];
        if (q[2]) { g.wait = now + q[2]; g.look = g.yaw; }
        g.i = (g.i + 1) % R.length;
      } else {
        g.x += dx / d * step; g.z += dz / d * step;
        g.yaw += ang(Math.atan2(dx, dz) - g.yaw) * Math.min(1, dt * 8);
      }
      // les vigiles ont les clés : la porte s'ouvre sur leur passage
      DOORS.forEach((D, i) => { if (D.kind !== 'vault' && (D.x - g.x) ** 2 + (D.z - g.z) ** 2 < 1.3 ** 2) this.doors[i] = Math.max(this.doors[i], now + 2200); });
    });
    // une porte ne se referme pas sur quelqu'un
    DOORS.forEach((D, i) => {
      if (this.doors[i] > now && players.some(p => (p.x - D.x) ** 2 + (p.z - D.z) ** 2 < .8 ** 2)) this.doors[i] = Math.max(this.doors[i], now + 700);
    });
    const tSec = now / 1000;
    for (const p of players) {
      if (p.bot || p.out) continue;
      const s = this.st(p);
      if (!isPrivate(p.x, p.z) || now < s.grace) { s.sus = Math.max(0, s.sus - dt * 1.5); s.csus = Math.max(0, s.csus - dt * 1.5); this.pushSus(p, s); continue; }
      // vigiles
      let rate = 0, src = -1;
      this.guards.forEach((g, gi) => {
        if (g.sleep > now) return;
        const d = Math.hypot(p.x - g.x, p.z - g.z);
        if (p.mv === 2 && d < 5 && now > s.noise) {
          s.noise = now + 4000; g.turn = now + 2500; g.turnYaw = Math.atan2(p.x - g.x, p.z - g.z);
          this.io.send(p, { t: 'alarm', big: '', msg: 'Le vigile t\'a entendu courir…', voice: 'vigile_bruit' });
          this.io.heat(p, 2);
        }
        if (s.tenue > now || !this.sees(g, p, now, closed0)) return;
        const k = Math.max(.6, 1.6 - .12 * d);
        if (k > rate) { rate = k; src = gi; }
      });
      s.sus = rate ? s.sus + rate * dt : Math.max(0, s.sus - dt * .6);
      if (rate) s.src = src;
      if (s.sus >= 1) { this.spotted(p, src, now); this.pushSus(p, s); continue; }
      // caméras
      let cam = -1;
      if (now > s.cgrace) CAMS.forEach((c, ci) => {
        if (cam >= 0 || this.cams[ci].jam > now) return;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
        if (d > CAM.range || d < .3) return;
        if (Math.abs(ang(Math.atan2(dx, dz) - camYaw(c, tSec, ci))) > CAM.half) return;
        if (clearLine(c.x, c.z, p.x, p.z, closed0, this.smokes)) cam = ci;
      });
      s.csus = cam >= 0 ? s.csus + dt : Math.max(0, s.csus - dt * .6);
      if (s.csus >= 1) {
        s.csus = 0; s.cgrace = now + 5000; this.cams[cam].alarm = now + 3000;
        this.io.send(p, { t: 'alarm', big: 'Filmé !', msg: 'Une caméra t\'a vu dans les zones privées.' });
        this.io.others(p, { t: 'alarm', big: '', msg: 'Une caméra a filmé quelqu\'un dans les zones privées.' });
        this.io.heat(p, 5);
      }
      this.pushSus(p, s);
    }
  }
  private pushSus(p: WPlayer, s: PS) {
    const v = Math.round(Math.min(1, s.sus) * 10) / 10, c = Math.round(Math.min(1, s.csus) * 10) / 10;
    const key = `${v},${c},${v ? s.src : -1}`;
    if (key === s.sent) return;
    s.sent = key;
    this.io.send(p, { t: 'sus', v, c, g: v ? s.src : -1 });
  }
  snap(now: number) {
    const tSec = now / 1000;
    return {
      g: this.guards.map(g => [r2(g.x), r2(g.z), r2(g.yaw), g.sleep > now ? 3 : g.alert > now ? 2 : g.turn > now ? 1 : 0]),
      c: CAMS.map((c, i) => [r2(camYaw(c, tSec, i)), this.cams[i].jam > now ? 1 : this.cams[i].alarm > now ? 2 : 0]),
      d: this.doors.reduce((m, t, i) => t > now ? m | (1 << i) : m, 0),
      v: this.open ? 1 : 0, n: this.bags, l: this.loot, t: this.target, b: [...this.carry] as [string, number][],
    };
  }
}
