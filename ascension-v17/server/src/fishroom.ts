// ============================================================
// FISH & FURY — serveur autoritaire.
// Le serveur décide : quel poisson mord, son poids, sa variante, la tension,
// la rupture de ligne, la valeur de vente et l'argent. Le client n'envoie que
// des intentions (je lance, je ferre, je mouline, je vends).
// ============================================================
import { BaseRoom, type BasePlayer, pickWeighted } from './base';
import {
  FISHES, RARITY, VARIANTS, RODS, BAITS, fishAt, rodAt, baitAt, variantAt,
  fishValue, fmtShells, CAST_MS, BITE_MIN, BITE_MAX, HOOK_WINDOW, TENSION_BREAK,
  type FishDef,
} from '../../shared/fish';

const SPEED = Number(process.env.SPEED || 1);
const TICK_MS = 100;                       // pas de simulation du combat

// ---- le chaos, mis en scène (aucune physique : que des règles lisibles) ----
const PIER_END = -8.0;            // dernière planche avant le grand bain
const DRAG_KG = 6;                // à partir de ce poids, le poisson tire sur le pêcheur
const PIER_HALF = 2.4;            // demi-largeur de l'avancée
const DOCK_FRONT = 1.1;           // bord avant de la plateforme, hors de l'axe
const SOAK_MS = 4500;             // temps passé à barboter avant de remonter
const CROSS_EVERY = 11_000;       // on tente un croisement de lignes toutes les 11 s
const CROSS_MS = 2600;            // durée pendant laquelle mouliner coûte double
const WAVE_MIN = 42_000, WAVE_MAX = 78_000;

type Stage = 'IDLE' | 'CAST' | 'WAIT' | 'BITE' | 'FIGHT' | 'LANDED' | 'SOAKED';

interface Hooked {
  fish: FishDef;
  kg: number;
  variant: string;
  tension: number;      // 0 → 100, au-delà la ligne casse
  distance: number;     // 0 = au bord, 100 = au bout de la ligne
  stamina: number;      // endurance restante du poisson, en secondes
  reeling: boolean;     // le joueur mouline-t-il en ce moment ?
  surge: number;        // à-coup en cours (le poisson tire)
  nextSurge: number;
}

export interface FishPlayer extends BasePlayer {
  shells: number;
  rod: string;
  bait: string;
  stage: Stage;
  hooked: Hooked | null;
  hold: number;             // puissance du lancer (0→1)
  castAt: number;
  biteAt: number;
  catches: number;
  best: { fishId: string; kg: number; value: number } | null;
  bag: { fishId: string; kg: number; variant: string; value: number }[];
  dex: string[];            // espèces déjà vues
  timer: any;
  soakedUntil: number;      // > 0 : le joueur est à l'eau et ne joue plus
  crossedUntil: number;     // lignes emmêlées avec un coéquipier
  dragged: number;          // mètres arrachés pendant le combat en cours
}

export const BAG_MAX = 6;

export class FishRoom extends BaseRoom<FishPlayer> {
  shared = 0;                       // caisse commune du bateau
  totalCatches = 0;
  biggest: { name: string; kg: number; by: string } | null = null;
  private loop: any = null;

  constructor(code: string) {
    super(code);
    this.game = 'fish';
  }

  protected get worldRadius() { return 26; }

  protected initPlayer(b: BasePlayer): FishPlayer {
    return {
      ...b, shells: 0, rod: 'bambou', bait: 'vers',
      stage: 'IDLE', hooked: null, hold: 0, castAt: 0, biteAt: 0,
      catches: 0, best: null, bag: [], dex: [], timer: null,
      soakedUntil: 0, crossedUntil: 0, dragged: 0,
    };
  }

  /** Un joueur à l'eau ne pilote plus rien : c'est le serveur qui le repêche. */
  move(p: FishPlayer, x: number, z: number) {
    if (p.stage === 'SOAKED') return;
    super.move(p, x, z);
  }

  /** Sur le ponton, en arc face à la mer. */
  protected spawnSpot(i: number) {
    const col = i % 4, row = i < 4 ? 0 : 1;
    return { x: -4.5 + col * 3 + row * 1.5, z: 6 + row * 2.4 };
  }

  start(p: FishPlayer) {
    if (this.phase !== 'LOBBY') return;
    this.phase = 'PLAYING';
    for (const pl of this.players.values()) {
      pl.shells = 0; pl.rod = 'bambou'; pl.bait = 'vers';
      pl.stage = 'IDLE'; pl.hooked = null; pl.bag = []; pl.dex = []; pl.catches = 0; pl.best = null;
      pl.soakedUntil = 0; pl.crossedUntil = 0; pl.dragged = 0;
    }
    this.shared = 0; this.totalCatches = 0; this.biggest = null;
    this.logEv('start', 'La marée est bonne. Bonne pêche !');
    this.loop = setInterval(() => this.tick(), TICK_MS);
    this.broadcast();
  }

  // ---------- lancer ----------
  /** Le client maintient le bouton : il envoie la puissance au relâchement. */
  cast(p: FishPlayer, power: number) {
    if (this.phase !== 'PLAYING') return;
    if (p.stage === 'SOAKED') return this.reject(p, 'Tu es à l’eau ! Remonte d’abord.');
    if (p.stage !== 'IDLE') return this.reject(p, 'Ta ligne est déjà à l’eau.');
    if (p.bag.length >= BAG_MAX) return this.reject(p, 'Ta besace est pleine — va vendre.');
    const pw = Math.max(0, Math.min(1, Number(power) || 0));
    p.hold = pw;
    p.stage = 'CAST';
    p.castAt = Date.now();
    const rod = rodAt(p.rod);
    this.broadcastMsg({
      t: 'ev', kind: 'cast', playerId: p.id, power: pw, dist: pw * rod.power,
      castMs: CAST_MS, text: `${p.name} lance sa ligne.`,
    });
    p.timer = setTimeout(() => this.startWait(p), CAST_MS / SPEED);
    this.broadcast();
  }

  private startWait(p: FishPlayer) {
    if (p.stage !== 'CAST') return;
    p.stage = 'WAIT';
    // un lancer puissant et un bon appât font mordre plus vite
    const bait = baitAt(p.bait);
    const lure = bait.lure * (0.7 + p.hold * 0.6);
    const delay = (BITE_MIN + Math.random() * (BITE_MAX - BITE_MIN)) / lure;
    p.biteAt = Date.now() + delay;
    p.timer = setTimeout(() => this.bite(p), delay / SPEED);
    this.broadcast();
  }

  /** Tirage du poisson : la profondeur atteinte dépend de la force du lancer. */
  private rollFish(p: FishPlayer): FishDef {
    const bait = baitAt(p.bait);
    const deep = p.hold > .75, mid = p.hold > .4;
    const pool = FISHES.map(f => {
      let w = f.weight;
      if (f.depth === 'PROFOND') w *= deep ? 1.6 : 0.15;
      if (f.depth === 'MOYEN') w *= mid ? 1.25 : 0.5;
      if (f.bestBait === bait.id) w *= 2;
      w *= bait.lure;
      return { ...f, weight: w };
    });
    return fishAt(pickWeighted(pool).id)!;
  }

  private bite(p: FishPlayer) {
    if (p.stage !== 'WAIT') return;
    const f = this.rollFish(p);
    const kg = Math.round((f.weightMin + Math.random() * (f.weightMax - f.weightMin)) * 10) / 10;
    const variant = pickWeighted(VARIANTS).id;
    p.stage = 'BITE';
    p.hooked = {
      fish: f, kg, variant, tension: 18, distance: 100,
      stamina: f.stamina, reeling: false, surge: 0, nextSurge: Date.now() + 900,
    };
    this.broadcastMsg({ t: 'ev', kind: 'bite', playerId: p.id, text: `Ça mord chez ${p.name} !` });
    // fenêtre de ferrage : passé ce délai, le poisson recrache
    p.timer = setTimeout(() => {
      if (p.stage !== 'BITE') return;
      const name = p.hooked?.fish.name ?? 'Quelque chose';
      p.hooked = null; p.stage = 'IDLE';
      this.logEv('miss', `${name} recrache l’appât de ${p.name}.`, { playerId: p.id });
      this.broadcast();
    }, HOOK_WINDOW / SPEED);
    this.broadcast();
  }

  /** Outil de mise au point (DEBUG=1 seulement) : ferrer l'espèce que l'on veut,
   *  au poids que l'on veut. Sans ça, vérifier l'arrachage à l'écran demande
   *  d'attendre un Gouffre au hasard. */
  debugHook(p: FishPlayer, fishId: string, kg?: number) {
    if (process.env.DEBUG !== '1') return;
    const f = fishAt(fishId); if (!f || this.phase !== 'PLAYING') return;
    clearTimeout(p.timer);
    const poids = Math.round((kg ?? f.weightMax) * 10) / 10;
    p.stage = 'FIGHT'; p.dragged = 0;
    p.hooked = { fish: f, kg: poids, variant: 'normal', tension: 18, distance: 100,
      stamina: f.stamina, reeling: false, surge: 0, nextSurge: Date.now() + 400 };
    this.broadcastMsg({ t: 'ev', kind: 'hooked', playerId: p.id, fishId: f.id, rarity: f.rarity,
      text: `[debug] ${p.name} ferre ${f.name} (${poids} kg).` });
    this.broadcast();
  }

  /** Ferrage : réussi seulement pendant la fenêtre de morsure. */
  hook(p: FishPlayer) {
    if (p.stage === 'WAIT') {           // ferrer trop tôt = on perd le coup
      clearTimeout(p.timer);
      p.stage = 'IDLE'; p.hooked = null;
      this.logEv('early', `${p.name} ferre dans le vide.`, { playerId: p.id });
      return this.broadcast();
    }
    if (p.stage !== 'BITE' || !p.hooked) return;
    clearTimeout(p.timer);
    p.stage = 'FIGHT';
    p.dragged = 0;
    this.broadcastMsg({
      t: 'ev', kind: 'hooked', playerId: p.id,
      fishId: p.hooked.fish.id, rarity: p.hooked.fish.rarity,
      text: `${p.name} a ferré quelque chose.`,
    });
    this.broadcast();
  }

  /** Le joueur mouline (ou relâche) : c'est le seul levier pendant le combat. */
  reel(p: FishPlayer, on: boolean) {
    if (p.stage === 'FIGHT' && p.hooked) p.hooked.reeling = !!on;
  }

  /** Simulation du combat, côté serveur uniquement. */
  private tick() {
    if (this.phase !== 'PLAYING') return;
    const dt = TICK_MS / 1000;
    let dirty = false;
    this.chaos();
    for (const p of this.players.values()) {
      if (p.stage === 'SOAKED' && Date.now() >= p.soakedUntil) this.climbOut(p);
    }
    for (const p of this.players.values()) {
      const h = p.hooked;
      if (p.stage !== 'FIGHT' || !h) continue;
      const rod = rodAt(p.rod);
      const tired = Math.max(.25, h.stamina / h.fish.stamina);     // il faiblit avec le temps

      // à-coups : le poisson tire d'un coup, c'est là qu'on doit relâcher
      if (Date.now() > h.nextSurge) {
        const b = h.fish.behaviour;
        const every = b === 'NERVEUX' ? 700 : b === 'RAPIDE' ? 800 : b === 'LOURD' ? 1800 : b === 'TIREUR' ? 2100 : 1200;
        h.surge = h.fish.strength * (b === 'TIREUR' ? 1.5 : 1) * tired;
        h.nextSurge = Date.now() + every + Math.random() * 600;
        if (b === 'SAUTEUR' && Math.random() < .35) {
          this.broadcastMsg({ t: 'ev', kind: 'jump', playerId: p.id, text: `${h.fish.name} saute hors de l’eau !` });
        }
        if (b === 'ELECTRIQUE' && Math.random() < .3) {
          h.tension += 14;
          this.broadcastMsg({ t: 'ev', kind: 'zap', playerId: p.id, text: `Décharge ! ${p.name} lâche presque la canne.` });
        }
        // ARRACHÉ : les gros poissons ne tirent pas que sur la ligne, ils tirent
        // sur le PÊCHEUR. Un pas vers le large à chaque à-coup — et au bout du
        // ponton, il n'y a plus de planche.
        // Le seuil est le POIDS, pas la force : « à partir de 6 kg, ça tire sur
        // le pêcheur » se comprend sans lire une table de stats.
        if (h.kg >= DRAG_KG) {
          const step = .22 + Math.min(.55, h.kg * .012) + h.fish.strength * .08;
          p.z -= step; p.moved = true; p.dragged += step;
          this.broadcastMsg({
            t: 'ev', kind: 'drag', playerId: p.id, x: p.x, z: p.z,
            text: p.dragged > 1.2 && p.dragged - step <= 1.2 ? `${p.name} se fait arracher !` : '',
          });
          // Sur l'avancée on a neuf mètres de rab ; sur le bord de la plateforme,
          // une seconde. C'est toute la règle : un gros poisson, on le combat
          // dans l'axe du ponton.
          const bord = Math.abs(p.x) <= PIER_HALF ? PIER_END : DOCK_FRONT;
          if (p.z <= bord) { this.overboard(p); continue; }
        }
      }
      h.surge = Math.max(0, h.surge - dt * 2.8);   // il faut de VRAIES fenêtres entre deux à-coups

      // Tension : elle monte quand on mouline et quand il tire, redescend quand on relâche.
      // Le coût du moulinet suit la FORCE du poisson : un gardon se remonte presque
      // sans lever le doigt, un Gouffre impose de relâcher sans arrêt.
      const pull = (h.surge * 26) + (h.fish.strength * 7 * tired);
      const crossed = p.crossedUntil > Date.now();
      const reelCost = h.reeling ? (10 + h.fish.strength * 14 + h.kg * .4) * (crossed ? 2.1 : 1) : -32;
      h.tension = Math.max(0, h.tension + (pull + reelCost) * dt);

      if (h.reeling) {
        // on ne récupère de la ligne que si le poisson n'est pas en plein à-coup
        const gain = (14 + rod.reelSpeed * 10 - h.surge * 13) * dt;
        h.distance = Math.max(0, h.distance - Math.max(-2, gain));
        h.stamina -= dt * (1 + h.surge);
      } else {
        h.distance = Math.min(100, h.distance + h.surge * 5 * dt);
        h.stamina -= dt * .25;
      }

      if (h.tension >= TENSION_BREAK * (rod.lineMax / 100)) { this.lineBreak(p); dirty = true; continue; }
      if (h.distance <= 0) { this.land(p); dirty = true; continue; }
      dirty = true;
    }
    if (dirty) this.broadcastFight();
  }

  // ============================================================
  // LE CHAOS — trois moments écrits, jamais de la vraie physique :
  // se faire arracher, tomber à l'eau, emmêler sa ligne avec un pote.
  // Tout est décidé ici, côté serveur : tout le monde voit la même scène.
  // ============================================================
  private nextCross = 0;
  private nextWave = 0;

  private chaos() {
    const now = Date.now();
    if (!this.nextCross) { this.nextCross = now + CROSS_EVERY; this.nextWave = now + WAVE_MIN; }

    // LIGNES CROISÉES : deux combats en cours = deux lignes qui s'emmêlent.
    // Mouliner coûte alors le double : il faut se parler pour s'en sortir.
    if (now >= this.nextCross) {
      this.nextCross = now + CROSS_EVERY / SPEED;
      const fighting = [...this.players.values()].filter(p => p.stage === 'FIGHT' && p.crossedUntil < now);
      if (fighting.length >= 2 && Math.random() < .55) {
        const a = fighting[Math.floor(Math.random() * fighting.length)];
        let b = a;
        while (b === a) b = fighting[Math.floor(Math.random() * fighting.length)];
        a.crossedUntil = b.crossedUntil = now + CROSS_MS / SPEED;
        if (a.hooked) a.hooked.tension += 16;
        if (b.hooked) b.hooked.tension += 16;
        this.broadcastMsg({
          t: 'ev', kind: 'cross', ids: [a.id, b.id], ms: CROSS_MS / SPEED,
          text: `🪢 ${a.name} et ${b.name} ont emmêlé leurs lignes !`,
        });
      }
    }

    // VAGUE : elle balaie le ponton, recule tout le monde et fait lâcher les touches.
    if (now >= this.nextWave) {
      this.nextWave = now + (WAVE_MIN + Math.random() * (WAVE_MAX - WAVE_MIN)) / SPEED;
      if (this.phase === 'PLAYING' && this.players.size) {
        const pushed: Record<string, [number, number]> = {};
        for (const p of this.players.values()) {
          if (p.stage === 'SOAKED') continue;
          if (Math.abs(p.x) <= PIER_HALF + .2 && p.z < 1) { p.z = Math.min(1, p.z + 1.6); p.moved = true; }
          pushed[p.id] = [p.x, p.z];
          if (p.stage === 'WAIT' || p.stage === 'BITE') { clearTimeout(p.timer); p.stage = 'IDLE'; p.hooked = null; }
          if (p.stage === 'FIGHT' && p.hooked) p.hooked.tension += 10;
        }
        this.broadcastMsg({ t: 'ev', kind: 'wave', pos: pushed, text: '🌊 Une vague balaie le ponton !' });
        this.broadcast();
      }
    }
  }

  /** À L'EAU : on perd le poisson ferré, une prise de la besace, et 4 s de baignade. */
  private overboard(p: FishPlayer) {
    clearTimeout(p.timer);
    const fish = p.hooked?.fish.name;
    p.hooked = null;
    p.stage = 'SOAKED';
    p.soakedUntil = Date.now() + SOAK_MS / SPEED;
    p.dragged = 0;
    let lost = '';
    if (p.bag.length && Math.random() < .7) {
      const i = Math.floor(Math.random() * p.bag.length);
      lost = fishAt(p.bag[i].fishId)?.name ?? '';
      p.bag.splice(i, 1);
    }
    p.z = (Math.abs(p.x) <= PIER_HALF ? PIER_END : DOCK_FRONT) - 1.2; p.moved = true;
    this.broadcastMsg({
      t: 'ev', kind: 'overboard', playerId: p.id, x: p.x, z: p.z, ms: SOAK_MS / SPEED,
      lost, text: `💦 ${fish ?? 'Le poisson'} a mis ${p.name} à l'eau !${lost ? ` ${lost} repart à la mer.` : ''}`,
    });
    this.broadcast();
  }

  /** On remonte sur le ponton, trempé mais vivant. */
  private climbOut(p: FishPlayer) {
    p.stage = 'IDLE';
    p.soakedUntil = 0;
    p.z = (Math.abs(p.x) <= PIER_HALF ? PIER_END : DOCK_FRONT) + 1.4;
    if (Math.abs(p.x) > PIER_HALF) p.x = Math.max(-7, Math.min(7, p.x));
    p.moved = true;
    this.broadcastMsg({
      t: 'ev', kind: 'climb', playerId: p.id, x: p.x, z: p.z,
      text: `${p.name} remonte sur le ponton.`,
    });
    this.broadcast();
  }

  /** Le combat bouge 10×/s : on n'envoie que les chiffres utiles, pas tout l'état. */
  private broadcastFight() {
    const f: Record<string, [number, number, number]> = {};
    for (const p of this.players.values()) {
      if (p.stage === 'FIGHT' && p.hooked) {
        const rod = rodAt(p.rod);
        f[p.id] = [
          Math.round(p.hooked.tension / (rod.lineMax / 100)),
          Math.round(p.hooked.distance),
          Math.round(p.hooked.surge * 100) / 100,
        ];
      }
    }
    this.broadcastMsg({ t: 'fight', f });
  }

  private lineBreak(p: FishPlayer) {
    const h = p.hooked!;
    p.hooked = null; p.stage = 'IDLE';
    this.broadcastMsg({
      t: 'ev', kind: 'snap', playerId: p.id,
      text: `💥 La ligne de ${p.name} casse. ${h.fish.name} repart.`,
    });
    this.broadcast();
  }

  private land(p: FishPlayer) {
    const h = p.hooked!;
    p.hooked = null; p.stage = 'IDLE';
    const value = fishValue(h.fish.id, h.kg, h.variant);
    p.bag.push({ fishId: h.fish.id, kg: h.kg, variant: h.variant, value });
    p.catches++; this.totalCatches++;
    const first = !p.dex.includes(h.fish.id);
    if (first) p.dex.push(h.fish.id);
    if (!p.best || value > p.best.value) p.best = { fishId: h.fish.id, kg: h.kg, value };
    if (!this.biggest || h.kg > this.biggest.kg) this.biggest = { name: h.fish.name, kg: h.kg, by: p.name };
    const vn = variantAt(h.variant).name;
    this.broadcastMsg({
      t: 'ev', kind: 'catch', playerId: p.id,
      fishId: h.fish.id, kg: h.kg, variant: h.variant, value, first,
      text: `${p.name} sort ${vn ? vn + ' ' : ''}${h.fish.name} — ${h.kg} kg`,
    });
    this.broadcast();
  }

  /** Vente de toute la besace au marché. */
  sell(p: FishPlayer) {
    if (this.phase !== 'PLAYING') return;
    if (!p.bag.length) return this.reject(p, 'Ta besace est vide.');
    const total = p.bag.reduce((s, b) => s + b.value, 0);
    const n = p.bag.length;
    p.bag = [];
    p.shells += total;
    this.shared += total;
    this.logEv('sell', `${p.name} vend ${n} prise${n > 1 ? 's' : ''} pour ${fmtShells(total)}.`, { playerId: p.id, total });
    this.broadcast();
  }

  buy(p: FishPlayer, kind: string, id: string) {
    if (this.phase !== 'PLAYING') return;
    if (kind === 'rod') {
      const r = RODS.find(x => x.id === id);
      if (!r) return;
      if (rodAt(p.rod).price >= r.price) return this.reject(p, 'Tu as déjà mieux.');
      if (p.shells < r.price) return this.reject(p, `Il te manque ${fmtShells(r.price - p.shells)}.`);
      p.shells -= r.price; p.rod = r.id;
      this.logEv('buy', `${p.name} s’équipe : ${r.name}.`, { playerId: p.id });
    } else if (kind === 'bait') {
      const b = BAITS.find(x => x.id === id);
      if (!b) return;
      if (p.shells < b.price) return this.reject(p, `Il te manque ${fmtShells(b.price - p.shells)}.`);
      p.shells -= b.price; p.bait = b.id;
      this.logEv('buy', `${p.name} prend de l’appât : ${b.name}.`, { playerId: p.id });
    } else return;
    this.broadcast();
  }

  serialize() {
    return {
      code: this.code, game: this.game, phase: this.phase, station: this.station,
      shared: this.shared, totalCatches: this.totalCatches, biggest: this.biggest,
      serverNow: Date.now(),
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, connected: p.connected, color: p.color, hat: p.hat,
        x: p.x, z: p.z,
        shells: p.shells, rod: p.rod, bait: p.bait, stage: p.stage,
        bag: p.bag.length, catches: p.catches, dex: p.dex.length,
        fish: p.hooked ? { id: p.hooked.fish.id, rarity: p.hooked.fish.rarity } : null,
      })),
      you: null,
    };
  }

  /** L'état personnel (besace détaillée) ne part qu'au joueur concerné. */
  broadcast() {
    for (const p of this.players.values()) {
      const st: any = this.serialize();
      st.you = { shells: p.shells, rod: p.rod, bait: p.bait, stage: p.stage, bag: p.bag, dex: p.dex, best: p.best,
        soakedUntil: p.soakedUntil, crossedUntil: p.crossedUntil };
      this.send(p, { t: 'state', state: st, youId: p.id });
    }
  }

  destroy() {
    super.destroy();
    if (this.loop) clearInterval(this.loop);
    for (const p of this.players.values()) if (p.timer) clearTimeout(p.timer);
  }
}
