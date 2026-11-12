// ============================================================
// Pendant la nuit : argent, horloge, caisse, sac, dons, roulette et machines à sous.
// Le serveur décide de tout (soldes, stocks, tirages) ; ici on affiche et on met en scène.
// ============================================================
import * as THREE from 'three';
import type { ServerMsg, TableState } from '../shared/protocol';
import { ITEMS } from '../shared/items';
import { CAISSE, ROULETTES, SLOT_LIST, slotSeat, dist2, clockText } from '../shared/layout';
import { SLOT_BETS, SLOT_PAYS, CHIPS, RED, BET_LABEL, ROUL_PHASES, type BetKind } from '../shared/games';
import { ROULETTE_CTL } from './world/tables';
import { SEATS, SLOT_SEAT } from './world/people';
import { setJackpotBoard } from './world/hall';
import { fitFov } from './cam';
import { voice, preloadVoices } from './audio';
import type { Walker } from './cam';
import type { Net } from './net';
import type { Body, Remotes } from './player';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
/** La caissière, derrière le guichet central */
const CASHIER = { x: 0, z: -13.2 };
const eur = (n: number) => n.toLocaleString('fr-FR') + ' €';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

type Mode = 'walk' | 'shop' | 'bag' | 'give' | 'roul' | 'slot';
interface Ctx {
  net: Net; walker: Walker; cam: () => THREE.PerspectiveCamera; scene: () => THREE.Scene | null;
  body: () => Body | null; remotes: () => Remotes | null; names: () => Map<string, string>;
  toast: (line: string, big: string) => void; error: (msg: string) => void;
}

export class Play {
  money = 0; inv: Record<string, number> = {};
  prices: Record<string, number> = {}; stock: Record<string, number> = {};
  jackpot = 0; mode: Mode = 'walk'; on = false;
  private clock0 = 0; private dur = 1; private clockTxt = '';
  private near: { kind: 'caisse' | 'roul' | 'slot'; i: number } | null = null;
  private giveTo: string | null = null;
  private table = -1; private ts: TableState | null = null; private chip = 50; private tsAt = 0;
  private slot = -1; private bet = 10; private reel: Reels | null = null;
  private attract: Reels | null = null; private attractSlot = -1; private lastCall = false;
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3();
  private holdMoney: number | null = null;

  constructor(private c: Ctx) { this.bindUi(); }

  // ---------- cycle de la nuit ----------
  start(elapsed: number, dur: number) {
    preloadVoices(['caisse_bonsoir', 'caisse_merci', 'caisse_epuise', 'caisse_argent', 'croupier_faites', 'croupier_derniers', 'croupier_rien', 'annonce_jackpot']);
    this.on = true; this.clock0 = performance.now() - elapsed; this.dur = dur;
    $('#play').classList.remove('hidden');
    setJackpotBoard(this.jackpot);
    this.renderMoney();
  }
  stop() {
    this.close(false);
    this.on = false; $('#play').classList.add('hidden');
    this.reel?.dispose(); this.reel = null;
    this.attract?.dispose(); this.attract = null; this.attractSlot = -1;
  }

  onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'me':
        if (this.mode === 'shop' && Object.values(m.inv).reduce((a, b) => a + b, 0) > Object.values(this.inv).reduce((a, b) => a + b, 0)) this.say('caisse_merci', CASHIER);
        this.money = m.money; this.inv = m.inv; this.renderMoney(); if (this.mode === 'shop') this.renderShop(); if (this.mode === 'bag') this.renderBag(); break;
      case 'shop': this.prices = m.prices; this.stock = m.stock; if (this.mode === 'shop') this.renderShop(); break;
      case 'jack':
        this.jackpot = m.v; setJackpotBoard(m.v); $('#s-jack').textContent = eur(m.v);
        if (m.who) { this.c.toast(`Jackpot pour ${esc(m.who)} !`, '+ ' + eur(m.amount ?? 0)); voice('annonce_jackpot', { gain: .9 }); }
        break;
      case 'fx': {
        const b = m.id === this.c.net.id ? this.c.body() : this.c.remotes()?.map.get(m.id)?.body;
        b?.envelope(m.c);
        break;
      }
      case 'note': this.c.toast('', m.msg); break;
      case 'slot':
        if (this.reel) this.reel.spin(m.reels, () => { this.holdMoney = null; this.money = m.money; this.renderMoney(); this.slotResult(m.win, m.jackpot); });
        else { this.holdMoney = null; this.money = m.money; this.renderMoney(); }
        break;
      case 'rtab': if (m.s.id === this.table) this.onTable(m.s); break;
      case 'error':
        if (this.mode === 'shop') this.say(/stock/.test(m.msg) ? 'caisse_epuise' : /argent/.test(m.msg) ? 'caisse_argent' : '', CASHIER);
        return false;
      default: return false;
    }
    return true;
  }
  /** Une réplique d'un personnage, plus faible quand on est loin de lui. */
  private say(name: string, from: { x: number; z: number }) {
    if (name) voice(name, { pos: from, listener: { x: this.c.walker.pos.x, z: this.c.walker.pos.z } });
  }

  /** Chaque image : horloge, bouton d'action, caméra des jeux. Renvoie vrai si la caméra est pilotée ici. */
  update(dt: number) {
    if (!this.on) return false;
    const now = performance.now();
    const txt = clockText(now - this.clock0, this.dur);
    if (txt !== this.clockTxt) { this.clockTxt = txt; $('#p-clock').textContent = now - this.clock0 >= this.dur ? '3 h 00 · fermeture' : txt; }
    if (this.mode === 'walk') this.findNear();
    if (this.mode === 'roul') { this.tableCam(dt); this.tickTable(); return true; }
    if (this.mode === 'slot') { this.slotCam(dt); this.reel?.update(dt); return true; }
    return false;
  }

  // ---------- proximité ----------
  private findNear() {
    const p = this.c.walker.pos;
    let near: Play['near'] = null;
    if (dist2(p.x, p.z, CAISSE.x, CAISSE.z) < 2.4 ** 2) near = { kind: 'caisse', i: 0 };
    ROULETTES.forEach((t, i) => { if (!near && Math.abs(p.x - t.x) < 3.7 && Math.abs(p.z - t.z) < 2.7) near = { kind: 'roul', i }; });
    if (!near) {
      // la machine visée : proche ET dans la direction où l'on regarde (plus de mauvaise machine)
      let best = Infinity;
      const busy = this.c.remotes()?.busySlots, w = this.c.walker;
      const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw);
      SLOT_LIST.forEach((s, i) => {
        if (SEATS[SLOT_SEAT[i]]?.taken || busy?.has(i)) return;
        const q = slotSeat(s), d = Math.sqrt(dist2(p.x, p.z, q.x, q.z));
        if (d > 1.8) return;
        const dx = s.x - p.x, dz = s.z - p.z, l = Math.hypot(dx, dz) || 1;
        const facing = (dx * fx + dz * fz) / l;          // 1 = pile devant
        if (facing < .1) return;
        const score = d + (1 - facing) * 1.6;
        if (score < best) { best = score; near = { kind: 'slot', i }; }
      });
    }
    this.near = near;
    // la machine visée s'allume (écran « JOUER ») pour qu'on sache laquelle on prend
    const target = near?.kind === 'slot' ? near.i : -1;
    if (target !== this.attractSlot) {
      this.attract?.dispose(); this.attract = null; this.attractSlot = target;
      const sc = this.c.scene();
      if (target >= 0 && sc) this.attract = new Reels(SLOT_LIST[target], sc, true);
    }
    this.attract?.update(1 / 60);
    const act = $('#p-act');
    act.classList.toggle('hidden', !near);
    if (near) act.innerHTML = near.kind === 'caisse' ? 'Caisse<small>acheter</small>' : near.kind === 'roul' ? 'Roulette<small>jouer</small>' : 'Machine<small>s\'asseoir</small>';
    // donner : le joueur le plus proche à moins de 2 m
    let who: string | null = null, bd = 2 * 2;
    for (const [id, r] of this.c.remotes()?.map ?? []) {
      const h = r.body.holder.position, d = dist2(p.x, p.z, h.x, h.z);
      if (d < bd) { bd = d; who = id; }
    }
    this.giveTo = who;
    const gv = $('#p-give');
    gv.classList.toggle('hidden', !who);
    if (who) gv.innerHTML = `Donner<small>à ${esc(this.c.names().get(who) ?? '?')}</small>`;
  }

  private act() {
    const n = this.near; if (!n) return;
    if (n.kind === 'caisse') { this.open('shop'); this.say('caisse_bonsoir', CASHIER); }
    else if (n.kind === 'roul') {
      this.table = n.i; this.ts = null; this.open('roul');
      this.c.net.send({ t: 'rjoin', table: n.i });
      const t = ROULETTES[n.i], side = Math.sign(this.c.walker.pos.z - t.z) || 1;
      // le joueur se tourne vers la table
      this.c.walker.bodyYaw = side > 0 ? Math.PI : 0;
      const b = this.c.body(); if (b) b.holder.rotation.y = this.c.walker.bodyYaw;
      this.camPos.copy(this.c.cam().position); this.camLook.set(t.x, .9, t.z);
    } else {
      const s = SLOT_LIST[n.i], q = slotSeat(s);
      this.slot = n.i; this.open('slot');
      this.c.net.send({ t: 'sit', slot: n.i });
      const b = this.c.body(); b?.sit(q.x, q.z, q.yaw);
      this.c.walker.pos.set(q.x, 0, q.z);
      this.reel = new Reels(s, this.c.scene()!);
      this.camPos.copy(this.c.cam().position); this.camLook.set(s.x + s.face * .17, 1.5, s.z);
      $('#s-msg').textContent = 'Choisis ta mise et lance.';
    }
  }

  private open(mode: Mode) {
    this.close(false);
    this.attract?.dispose(); this.attract = null; this.attractSlot = -1;
    this.mode = mode;
    this.c.walker.active = false;
    $('#p-act').classList.add('hidden'); $('#p-give').classList.add('hidden');
    const id = { shop: '#shop', bag: '#bag', give: '#give', roul: '#roul', slot: '#slot' }[mode as Exclude<Mode, 'walk'>];
    $(id).classList.remove('hidden');
    if (mode === 'shop') this.renderShop();
    if (mode === 'bag') this.renderBag();
    if (mode === 'roul') this.renderTable();
    if (mode === 'slot') this.renderSlot();
    document.body.classList.add('panel-open');
  }
  /** Ferme le panneau ouvert ; reactivate = on rend la main au joystick. */
  close(reactivate = true) {
    if (this.mode === 'roul') { this.c.net.send({ t: 'rleave' }); this.table = -1; }
    if (this.mode === 'slot') {
      this.c.net.send({ t: 'stand' }); this.c.body()?.stand();
      const s = SLOT_LIST[this.slot];
      // on se relève face à l'allée (la caméra a la place de se mettre derrière)
      if (s) { const q = slotSeat(s); this.c.walker.place(q.x + s.face * .35, q.z, s.z > 0 ? Math.PI : 0); }
      const b = this.c.body(); if (b) b.holder.visible = true;
      this.reel?.dispose(); this.reel = null; this.slot = -1; this.holdMoney = null; this.renderMoney();
    }
    document.querySelectorAll('.panel').forEach(e => e.classList.add('hidden'));
    document.body.classList.remove('panel-open');
    this.mode = 'walk';
    if (reactivate) this.c.walker.active = this.on;
  }

  // ---------- caisse et sac ----------
  private renderShop() {
    $('#shop-money').textContent = eur(this.money);
    $('#shop-list').innerHTML = ITEMS.map(it => {
      const price = this.prices[it.id] ?? it.price, left = this.stock[it.id] ?? 0, mine = this.inv[it.id] ?? 0;
      const ok = left > 0 && this.money >= price;
      return `<li><div><b>${it.name}</b>${mine ? ` <i>×${mine}</i>` : ''}<p>${it.desc}</p></div>
        <button data-buy="${it.id}" ${ok ? '' : 'disabled'}><span>${eur(price)}</span><small>${left > 50 ? 'en stock' : left ? `reste ${left}` : 'épuisé'}</small></button></li>`;
    }).join('');
  }
  private renderBag() {
    const own = ITEMS.filter(it => this.inv[it.id]);
    $('#bag-list').innerHTML = own.length
      ? own.map(it => `<li><div><b>${it.name}</b> <i>×${this.inv[it.id]}</i><p>${it.desc}</p></div></li>`).join('')
      : '<li class="empty">Ton sac est vide. Tout s\'achète à la caisse, au fond de la galerie.</li>';
  }
  private renderMoney() {
    const v = this.holdMoney ?? this.money;
    $('#p-money').textContent = eur(v);
    const n = Object.values(this.inv).reduce((a, b) => a + b, 0);
    $('#p-bag small').textContent = n ? String(n) : '';
    if (this.mode === 'slot') $('#s-money').textContent = eur(v);
    if (this.mode === 'roul') $('#r-money').textContent = eur(v);
  }

  // ---------- roulette ----------
  private onTable(s: TableState) {
    const prev = this.ts;
    this.ts = s; this.tsAt = performance.now();
    const ctl = ROULETTE_CTL[s.id], t = ROULETTES[s.id], dealer = { x: t.x + 1, z: t.z - 1.25 };
    if (s.ph === 'spin' && (!prev || prev.ph !== 'spin') && ctl) { ctl.play(s.res, Math.max(1.5, s.left / 1000 - .3)); this.say('croupier_rien', dealer); }
    if (s.ph === 'bets' && prev?.ph !== 'bets') { this.say('croupier_faites', dealer); this.lastCall = false; preloadVoices([]); }
    if (s.ph === 'spin') preloadVoices([`numero_${String(s.res).padStart(2, '0')}`]);
    if (s.ph === 'result' && prev?.ph !== 'result') this.say(`numero_${String(s.res).padStart(2, '0')}`, dealer);
    if (s.ph === 'result' && prev?.ph !== 'result') {
      const w = s.wins.find(x => x[0] === this.c.net.id);
      const mineBet = (prev?.bets ?? []).filter(b => b[0] === this.c.net.id).reduce((a, b) => a + b[3], 0);
      $('#r-msg').innerHTML = w ? `<b class="win">Tu gagnes ${eur(w[1])} !</b>` : mineBet ? 'Perdu. La banque ramasse.' : '';
    }
    if (s.ph === 'bets' && prev?.ph !== 'bets') $('#r-msg').textContent = '';
    this.renderTable();
  }
  private tickTable() {
    const s = this.ts; if (!s) return;
    const left = Math.max(0, Math.ceil((s.left - (performance.now() - this.tsAt)) / 1000));
    const el = $('#r-time');
    if (s.ph === 'bets' && left <= 4 && left > 0 && !this.lastCall) { this.lastCall = true; const tb = ROULETTES[s.id]; this.say('croupier_derniers', { x: tb.x + 1, z: tb.z - 1.25 }); }
    const t = s.ph === 'bets' ? `${left} s` : '';
    if (el.textContent !== t) el.textContent = t;
  }
  private renderTable() {
    const s = this.ts, me = this.c.net.id;
    const ph = !s ? 'Connexion à la table…' : s.ph === 'bets' ? 'Faites vos jeux' : s.ph === 'spin' ? 'Rien ne va plus' : s.ph === 'result' ? numLabel(s.res) : 'En attente';
    $('#r-phase').innerHTML = ph;
    $('#r-hist').innerHTML = (s?.hist ?? []).map(n => `<i class="${n === 0 ? 'g' : RED.has(n) ? 'r' : 'k'}">${n}</i>`).join('');
    const mine = new Map<string, number>(); let total = 0, others = 0;
    for (const [pid, k, v, a] of s?.bets ?? []) {
      if (pid === me) { const key = k === 'n' ? 'n' + v : k; mine.set(key, (mine.get(key) ?? 0) + a); total += a; } else others += a;
    }
    document.querySelectorAll<HTMLElement>('#roul [data-bet]').forEach(b => {
      const v = mine.get(b.dataset.bet!);
      b.dataset.chip = v ? (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(v)) : '';
      b.classList.toggle('has', !!v);
    });
    $('#r-mine').textContent = total ? `Tes mises : ${eur(total)}` : 'Aucune mise';
    $('#r-others').textContent = others ? `Les autres : ${eur(others)}` : '';
    $('#r-money').textContent = eur(this.money);
    $('#roul').classList.toggle('closed', s?.ph !== 'bets');
    document.querySelectorAll<HTMLElement>('#r-chips button').forEach(b => b.classList.toggle('on', +b.dataset.chip! === this.chip));
  }
  private tableCam(dt: number) {
    const t = ROULETTES[this.table]; if (!t) return;
    const side = Math.sign(this.c.walker.pos.z - t.z) || 1;
    const close = this.ts?.ph === 'spin' || this.ts?.ph === 'result';
    // pendant le tirage : vue plongeante sur le cylindre, on voit les cases défiler et la bille tomber
    const pos = close ? new THREE.Vector3(t.x + 1.38, 1.78, t.z + side * .62) : new THREE.Vector3(t.x + .1, 2.45, t.z + side * 2.75);
    const look = close ? new THREE.Vector3(t.x + 1.62, .9, t.z) : new THREE.Vector3(t.x + .5, .75, t.z);
    this.moveCam(pos, look, dt, close ? 52 : 58);
  }

  // ---------- machines à sous ----------
  private renderSlot() {
    $('#s-jack').textContent = eur(this.jackpot);
    $('#s-money').textContent = eur(this.holdMoney ?? this.money);
    document.querySelectorAll<HTMLElement>('#s-bets button').forEach(b => b.classList.toggle('on', +b.dataset.sb! === this.bet));
  }
  private spin() {
    if (!this.reel || this.reel.busy) return;
    if (this.money < this.bet) { this.c.error('Pas assez d\'argent.'); return; }
    this.holdMoney = this.money - this.bet; this.renderMoney();
    $('#s-msg').textContent = '';
    this.reel.start();
    this.c.net.send({ t: 'spin', bet: this.bet });
  }
  private slotResult(win: number, jackpot: boolean) {
    $('#s-msg').innerHTML = jackpot ? `<b class="win">JACKPOT ! +${eur(win)}</b>` : win ? `<b class="win">+${eur(win)}</b>` : 'Rien cette fois.';
  }
  private slotCam(dt: number) {
    const s = SLOT_LIST[this.slot]; if (!s) return;
    const b = this.c.body(); if (b) b.holder.visible = false;
    this.moveCam(new THREE.Vector3(s.x + s.face * 1.05, 1.56, s.z), new THREE.Vector3(s.x + s.face * .17, 1.5, s.z), dt, 50);
  }

  private moveCam(pos: THREE.Vector3, look: THREE.Vector3, dt: number, fov: number) {
    const k = Math.min(1, dt * 3.2), cam = this.c.cam();
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    const f = fitFov(fov, cam.aspect);
    if (Math.abs(cam.fov - f) > .01) { cam.fov = f; cam.updateProjectionMatrix(); }
    // le sujet est cadré au centre de la partie de l'écran que le panneau ne cache pas
    const el = document.querySelector('.panel:not(.hidden)');
    if (el) {
      const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
      let cx = W / 2, cy = H / 2;
      if (r.left > W * .3) cx = r.left / 2; else if (r.top > H * .15) cy = r.top / 2;
      const tv = Math.tan(cam.fov * Math.PI / 360), th = tv * cam.aspect;
      cam.rotateY(Math.atan((cx / W * 2 - 1) * th));
      cam.rotateX(-Math.atan((1 - cy / H * 2) * tv));
    }
  }

  // ---------- interface ----------
  private bindUi() {
    $('#p-act').onclick = () => this.act();
    $('#p-give').onclick = () => { if (this.giveTo) { $('#give-who').textContent = this.c.names().get(this.giveTo) ?? ''; this.open('give'); } };
    $('#p-bag').onclick = () => this.open('bag');
    document.querySelectorAll<HTMLElement>('.panel .x').forEach(b => b.onclick = () => this.close());
    $('#shop-list').onclick = e => {
      const b = (e.target as HTMLElement).closest('[data-buy]') as HTMLElement | null;
      if (b) this.c.net.send({ t: 'buy', item: b.dataset.buy! });
    };
    document.querySelectorAll<HTMLElement>('#give [data-g]').forEach(b => b.onclick = () => {
      if (this.giveTo) this.c.net.send({ t: 'give', to: this.giveTo, amount: +b.dataset.g! });
      this.close();
    });
    // tapis de roulette : 0, puis 3 rangées de 12 numéros comme sur une vraie table
    const grid = $('#r-grid');
    let h = '<button class="z" data-bet="n0">0</button>';
    for (const row of [3, 2, 1]) for (let c = 0; c < 12; c++) { const n = row + c * 3; h += `<button class="${RED.has(n) ? 'r' : 'k'}" data-bet="n${n}">${n}</button>`; }
    grid.innerHTML = h;
    const outside: BetKind[] = ['d1', 'd2', 'd3', 'low', 'even', 'red', 'black', 'odd', 'high'];
    $('#r-out').innerHTML = outside.map(k => `<button class="${k === 'red' ? 'r' : k === 'black' ? 'k' : ''} ${k[0] === 'd' ? 'dz' : ''}" data-bet="${k}">${k === 'd1' ? '1 – 12' : k === 'd2' ? '13 – 24' : k === 'd3' ? '25 – 36' : k === 'red' ? '◆' : k === 'black' ? '◆' : BET_LABEL[k]}</button>`).join('');
    $('#roul').onclick = e => {
      const b = (e.target as HTMLElement).closest('[data-bet]') as HTMLElement | null;
      if (!b || this.ts?.ph !== 'bets') return;
      const key = b.dataset.bet!;
      if (this.money < this.chip) { this.c.error('Pas assez d\'argent pour ce jeton.'); return; }
      const kind = (key[0] === 'n' ? 'n' : key) as BetKind;
      this.c.net.send({ t: 'bet', kind, value: kind === 'n' ? +key.slice(1) : 0, amount: this.chip });
    };
    $('#r-chips').innerHTML = CHIPS.map(v => `<button data-chip="${v}">${v}</button>`).join('');
    document.querySelectorAll<HTMLElement>('#r-chips button').forEach(b => b.onclick = e => { e.stopPropagation(); this.chip = +b.dataset.chip!; this.renderTable(); });
    $('#r-clear').onclick = e => { e.stopPropagation(); this.c.net.send({ t: 'bclear' }); };
    $('#s-bets').innerHTML = SLOT_BETS.map(v => `<button data-sb="${v}">${v} €</button>`).join('');
    document.querySelectorAll<HTMLElement>('#s-bets button').forEach(b => b.onclick = () => { this.bet = +b.dataset.sb!; this.renderSlot(); });
    $('#s-spin').onclick = () => this.spin();
    $('#s-pays').innerHTML = SLOT_PAYS.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('') + '<span>Jackpot entier à 100 €</span><b></b>';
    addEventListener('keydown', e => {
      if (!this.on || e.target instanceof HTMLInputElement) return;
      if (e.key === 'e' && this.mode === 'walk' && this.near) this.act();
      else if (e.key === 'Escape' && this.mode !== 'walk') this.close();
      else if (e.key === ' ' && this.mode === 'slot') { e.preventDefault(); this.spin(); }
    });
  }
}

function numLabel(n: number) {
  const c = n === 0 ? 'vert' : RED.has(n) ? 'rouge' : 'noir';
  return `<b class="${n === 0 ? 'g' : RED.has(n) ? 'r' : 'k'}">${n}</b> ${c}${n ? ` · ${n % 2 ? 'impair' : 'pair'}` : ''}`;
}

// ---------- rouleaux affichés sur l'écran de la machine ----------
const SYM_N = 8;
class Reels {
  busy = false;
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture; private mesh: THREE.Mesh;
  private pos = [Math.random() * SYM_N, Math.random() * SYM_N, Math.random() * SYM_N];
  private vel = [0, 0, 0]; private target: number[] | null = null; private stopAt = [0, 0, 0]; private t = 0;
  private done: (() => void) | null = null;
  private t0 = 0;
  constructor(s: { x: number; z: number; face: number }, scene: THREE.Scene, private attractMode = false) {
    this.cv.width = 512; this.cv.height = 372;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(.58, .42), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.mesh.position.set(s.x + s.face * .178, 1.55, s.z);
    this.mesh.rotation.y = s.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.mesh.layers.set(1);
    scene.add(this.mesh);
    this.draw();
  }
  start() { this.busy = true; this.vel = [16, 17, 18]; this.target = null; this.t = 0; }
  spin(reels: number[], done: () => void) {
    // les rouleaux s'arrêtent un par un, de gauche à droite
    this.target = reels; this.done = done; this.stopAt = [.75, 1.15, 1.6].map(x => Math.max(x, this.t + x - .5));
    if (!this.busy) this.start();
  }
  update(dt: number) {
    if (this.attractMode) {
      // écran d'appel : rouleaux qui défilent doucement + « JOUER » qui clignote
      this.t0 += dt; this.pos = this.pos.map((p, i) => (p + dt * (1.2 + i * .3)) % SYM_N);
      this.draw();
      const c = this.cv.getContext('2d')!, on = Math.sin(this.t0 * 5) > -.3;
      c.fillStyle = 'rgba(10,4,6,.62)'; c.fillRect(0, 128, 512, 116);
      c.fillStyle = on ? '#ffd25a' : '#a8761e'; c.font = '86px "Bebas Neue", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('▶  JOUER', 256, 190);
      this.tex.needsUpdate = true;
      return;
    }
    if (!this.busy) return;
    this.t += dt;
    let moving = false;
    for (let i = 0; i < 3; i++) {
      if (this.target && this.t >= this.stopAt[i]) {
        // on glisse jusqu'au symbole visé (case centrale)
        const want = this.target[i];
        let d = ((want - this.pos[i]) % SYM_N + SYM_N) % SYM_N;
        if (this.vel[i] > 0 && d < .02) { this.pos[i] = want; this.vel[i] = 0; continue; }
        if (this.vel[i] === 0) continue;
        const sp = Math.max(1.5, Math.min(this.vel[i], d * 7));
        const step = Math.min(d, sp * dt); this.pos[i] = (this.pos[i] + step) % SYM_N; this.vel[i] = sp;
        moving = true;
      } else { this.pos[i] = (this.pos[i] + this.vel[i] * dt) % SYM_N; moving = moving || this.vel[i] > 0; }
    }
    this.draw();
    if (!moving && this.target) { this.busy = false; const d = this.done; this.done = null; d?.(); }
  }
  private draw() {
    const c = this.cv.getContext('2d')!, W = 512, H = 372, cw = W / 3, sh = H / 2.6;
    c.fillStyle = '#100608'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      c.save(); c.beginPath(); c.rect(i * cw + 8, 8, cw - 16, H - 16); c.clip();
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#9c9284'); g.addColorStop(.5, '#fbf6ea'); g.addColorStop(1, '#9c9284');
      c.fillStyle = g; c.fillRect(i * cw + 8, 8, cw - 16, H - 16);
      const p = this.pos[i], base = Math.floor(p);
      for (let k = -2; k <= 2; k++) {
        const sym = ((base + k) % SYM_N + SYM_N) % SYM_N;
        const y = H / 2 + (k - (p - base)) * sh;
        drawSym(c, sym, i * cw + cw / 2, y, sh * .78, this.vel[i] > 6);
      }
      c.restore();
    }
    c.strokeStyle = 'rgba(220,30,30,.8)'; c.lineWidth = 3; c.beginPath(); c.moveTo(4, H / 2); c.lineTo(W - 4, H / 2); c.stroke();
    this.tex.needsUpdate = true;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.tex.dispose(); }
}

/** Symboles dessinés à la main (pas d'emoji : rendu identique partout). 0 «7», 1 cerises, 2 BAR, 3 cloche, 4 diamant, 5 citron, 6 étoile, 7 dollar */
function drawSym(c: CanvasRenderingContext2D, s: number, x: number, y: number, size: number, blur: boolean) {
  c.save(); c.translate(x, y); c.globalAlpha = blur ? .55 : 1;
  const r = size / 2;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  if (s === 0) { c.font = `${size * 1.05}px "Bebas Neue", Impact, sans-serif`; c.fillStyle = '#d0121c'; c.strokeStyle = '#5a0006'; c.lineWidth = 4; c.strokeText('7', 0, r * .08); c.fillText('7', 0, r * .08); }
  else if (s === 1) {
    c.strokeStyle = '#2f7a1a'; c.lineWidth = 5; c.beginPath(); c.moveTo(-r * .35, r * .2); c.quadraticCurveTo(-r * .1, -r * .6, r * .25, -r * .75); c.moveTo(r * .35, r * .25); c.quadraticCurveTo(r * .3, -r * .4, r * .25, -r * .75); c.stroke();
    for (const [cx, cy] of [[-r * .38, r * .38], [r * .38, r * .42]]) { const g = c.createRadialGradient(cx - r * .1, cy - r * .1, 2, cx, cy, r * .34); g.addColorStop(0, '#ff6b6b'); g.addColorStop(1, '#9a0010'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r * .32, 0, 7); c.fill(); }
  } else if (s === 2) { c.fillStyle = '#111'; c.fillRect(-r * .95, -r * .38, r * 1.9, r * .76); c.fillStyle = '#f2d36b'; c.font = `${size * .52}px "Bebas Neue", Impact, sans-serif`; c.fillText('BAR', 0, r * .05); }
  else if (s === 3) {
    const g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#ffe27a'); g.addColorStop(1, '#c9871a'); c.fillStyle = g;
    c.beginPath(); c.moveTo(-r * .7, r * .5); c.quadraticCurveTo(-r * .6, -r * .8, 0, -r * .8); c.quadraticCurveTo(r * .6, -r * .8, r * .7, r * .5); c.closePath(); c.fill();
    c.fillStyle = '#8a5a10'; c.beginPath(); c.arc(0, r * .62, r * .16, 0, 7); c.fill();
  } else if (s === 4) {
    const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#bff4ff'); g.addColorStop(1, '#1c8fd8'); c.fillStyle = g;
    c.beginPath(); c.moveTo(0, -r * .85); c.lineTo(r * .7, 0); c.lineTo(0, r * .85); c.lineTo(-r * .7, 0); c.closePath(); c.fill(); c.strokeStyle = '#0b4f86'; c.lineWidth = 3; c.stroke();
  } else if (s === 5) { const g = c.createRadialGradient(-r * .2, -r * .2, 2, 0, 0, r); g.addColorStop(0, '#fff48a'); g.addColorStop(1, '#d6b400'); c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, r * .75, r * .52, -.4, 0, 7); c.fill(); }
  else if (s === 6) {
    c.fillStyle = '#7a2bd6'; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .36 : r * .85; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fill();
  } else { c.font = `${size * .95}px "Bebas Neue", Impact, sans-serif`; c.fillStyle = '#178a3a'; c.fillText('$', 0, r * .08); }
  c.restore();
}
