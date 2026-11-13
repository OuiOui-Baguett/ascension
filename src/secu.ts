// ============================================================
// Zones privées à l'écran : portes, vigiles et leur cône de vue, caméras qui
// balaient, fumée, jauge « on te voit », et les deux petits jeux (crochetage,
// piratage). Tout ce qui compte est décidé par le serveur.
// ============================================================
import * as THREE from 'three';
import { DOORS, doorRect, outside, GUARD, CAMS, CAM, INTEL, VAULT_RECT, VAN, GATES, isPrivate, blocked, closedRects, SMOKE_R, type Smoke } from '../shared/secu';
import type { SecSnap, ServerMsg, ClientMsg } from '../shared/protocol';
import { Body } from './player';
import { model } from './gfx/assets';
import { halo } from './gfx/kit';
import { voice, preloadVoices } from './audio';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const ang = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export interface Action { label: string; sub: string; fn: () => void; warn?: boolean }
interface Ctx {
  send(m: ClientMsg): void; pos(): THREE.Vector3; inv(): Record<string, number>; lock(): number; out(): boolean;
  openMini(): void; closeMini(): void; toast(a: string, b: string): void; error(m: string): void;
  yaw(): number; clues(): Map<number, { code: string }>; bodyOf(id: string): Body | null; noRun(v: boolean): void; me(): string; indic(): boolean;
}
interface GView { body: Body; cone: Cone; icon: THREE.Sprite; buf: { t: number; x: number; z: number; yaw: number }[]; st: number; last: THREE.Vector3 }
const DELAY = 120;

/** Cône de vue posé au sol, découpé par les murs, les portes fermées et la fumée. */
class Cone {
  mesh: THREE.Mesh; private pos: Float32Array; private col: Float32Array;
  constructor(scene: THREE.Scene, private n = 26) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array((n + 2) * 3); this.col = new Float32Array((n + 2) * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx: number[] = []; for (let k = 0; k < n; k++) idx.push(0, k + 1, k + 2);
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.mesh.frustumCulled = false; this.mesh.layers.set(1); this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  set(ox: number, oz: number, yaw: number, half: number, range: number, closed: number[][], smokes: Smoke[], c: THREE.Color, a: number) {
    const P = this.pos, C = this.col, y = .07;
    P[0] = ox; P[1] = y; P[2] = oz;
    for (let k = 0; k <= this.n; k++) {
      const an = yaw - half + 2 * half * k / this.n, sx = Math.sin(an), sz = Math.cos(an);
      let r = .25;
      while (r < range && !blocked(ox + sx * r, oz + sz * r, closed, smokes)) r += .2;
      r = Math.min(range, Math.max(.2, r - .1));
      P.set([ox + sx * r, y, oz + sz * r], (k + 1) * 3);
    }
    for (let k = 0; k < this.n + 2; k++) C.set([c.r, c.g, c.b, k ? a * .12 : a], k * 4);
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

function iconTex(txt: string, color: string) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(8,6,6,.7)'; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.fill();
  x.strokeStyle = color; x.lineWidth = 6; x.stroke();
  x.fillStyle = color; x.font = `bold ${txt.length > 1 ? 50 : 76}px "Bebas Neue", Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Secu {
  private doors: { d: typeof DOORS[number]; pivot: THREE.Group; rect: number[]; open: boolean; a: number; led: THREE.Mesh }[] = [];
  private cams: { m: THREE.Object3D; led: THREE.Object3D; cone: Cone; yaw: number; want: number; st: number }[] = [];
  private guards: GView[] = [];
  private smokes: (Smoke & { until: number; g: THREE.Group; t0: number; ms: number })[] = [];
  private mask = 0;
  heist = { v: 0, n: 0, l: 0, t: 3, b: [] as [string, number][] };
  private packs = new Map<string, THREE.Mesh>(); private goalKey = '';
  private icons = { q: iconTex('?', '#ffd84a'), x: iconTex('!', '#ff3b2a'), z: iconTex('Zz', '#9ad0ff') };
  sus = { v: 0, c: 0, g: -1 }; tenue = 0;
  private mini: { kind: 'pick' | 'hack' | 'code'; done: (ok: boolean) => void; [k: string]: any } | null = null;

  constructor(private scene: THREE.Scene, solids: number[][], private c: Ctx) {
    preloadVoices(['vigile_hey', 'vigile_bruit']);
    // portes : un battant qui pivote sur ses gonds, et sa boîte à badge (voyant rouge / vert)
    const staff = new THREE.MeshStandardMaterial({ color: '#59615e', roughness: .45, metalness: .35 });
    const wood = new THREE.MeshStandardMaterial({ color: '#4a2818', roughness: .5 });
    const steel = new THREE.MeshStandardMaterial({ color: '#a9adb2', roughness: .3, metalness: .9 });
    for (const d of DOORS) {
      const pivot = new THREE.Group(), w = d.w - .04, h = d.h - .04;
      const along = d.ax === 'x';
      let leaf: THREE.Object3D;
      if (d.kind === 'vault') {
        const g = new THREE.Group();
        for (let i = 0; i <= Math.round(w / .16); i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, h, 8), steel); b.position.set(i * w / Math.round(w / .16), h / 2, 0); g.add(b); }
        for (const yy of [.12, h / 2, h - .1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, .06, .05), steel); b.position.set(w / 2, yy, 0); g.add(b); }
        leaf = g;
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .05), d.kind === 'office' ? wood : staff); m.position.set(w / 2, h / 2, 0);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(.14, .03, .09), steel); handle.position.set(w - .12, 1.05, 0);
        leaf = new THREE.Group(); leaf.add(m, handle);
      }
      if (!along) leaf.rotation.y = -Math.PI / 2;
      pivot.add(leaf);
      pivot.position.set(along ? d.x - d.w / 2 + .02 : d.x, 0, along ? d.z : d.z - d.w / 2 + .02);
      pivot.traverse(o => { o.layers.set(0); });
      scene.add(pivot);
      // boîtier à badge, côté verrouillé
      const n = along ? [0, d.out] : [d.out, 0];
      const box = new THREE.Mesh(new THREE.BoxGeometry(.12, .18, .12), new THREE.MeshStandardMaterial({ color: '#202226', roughness: .5 }));
      const bx = along ? d.x + d.w / 2 + .22 : d.x + n[0] * .12, bz = along ? d.z + n[1] * .12 : d.z + d.w / 2 + .22;
      box.position.set(bx, 1.25, bz); scene.add(box);
      const led = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }));
      led.position.set(bx + n[0] * .065, 1.3, bz + n[1] * .065); scene.add(led);
      const rect = doorRect(d, .1).slice(); solids.push(rect);
      this.doors.push({ d, pivot, rect, open: false, a: 0, led });
    }
    // caméras des zones privées
    CAMS.forEach(cd => {
      const m = model('security_camera_01'); m.position.set(cd.mx, 2.62, cd.mz); scene.add(m);
      const led = halo('#ff1a1a', 2.5, .16); led.position.set(cd.mx, 2.56, cd.mz); scene.add(led);
      this.cams.push({ m, led, cone: new Cone(scene, 22), yaw: cd.yaw, want: cd.yaw, st: 0 });
    });
    this.bindMini();
  }

  // ---------- réseau ----------
  snap(w: SecSnap | undefined) {
    if (!w) return;
    const t = performance.now();
    this.mask = w.d; this.heist = { v: w.v, n: w.n, l: w.l, t: w.t, b: w.b };
    w.g.forEach(([x, z, yaw, st], i) => {
      let g = this.guards[i];
      if (!g) {
        const body = new Body('Security_Male_01', 'Vigile', this.scene);
        const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.icons.q, transparent: true, toneMapped: false }));
        icon.scale.set(.42, .42, 1); icon.position.y = 2.45; icon.layers.set(1); icon.visible = false; body.holder.add(icon);
        g = this.guards[i] = { body, cone: new Cone(this.scene), icon, buf: [], st: 0, last: new THREE.Vector3(x, 0, z) };
        body.holder.position.set(x, 0, z);
      }
      g.buf.push({ t, x, z, yaw }); if (g.buf.length > 20) g.buf.shift();
      g.st = st;
    });
    w.c.forEach(([yaw, st], i) => { const c = this.cams[i]; if (c) { c.want = yaw; c.st = st; } });
  }
  onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'sus': this.sus = { v: m.v, c: m.c, g: m.g }; this.renderSus(); return true;
      case 'buff': this.tenue = performance.now() + m.ms; return true;
      case 'alarm':
        if (m.voice) voice(m.voice, { gain: 1 });
        this.c.toast(m.msg, m.big);
        return true;
      case 'smoke': this.addSmoke(m.x, m.z, m.ms); return true;
      case 'tp': if (this.mini) this.endMini(false, true); return false;
    }
    return false;
  }
  reset() {
    for (const g of this.guards) { g.body.dispose(); g.cone.dispose(); }
    this.guards = [];
    for (const s of this.smokes) this.scene.remove(s.g);
    for (const m of this.packs.values()) m.parent?.remove(m);
    this.packs.clear(); this.heist = { v: 0, n: 0, l: 0, t: 3, b: [] }; this.c.noRun(false); $('#p-goal').classList.add('hidden');
    this.smokes = []; this.mask = 0; this.sus = { v: 0, c: 0, g: -1 }; this.tenue = 0;
    if (this.mini) this.endMini(false, true);
    this.renderSus(); $('#p-zone').classList.add('hidden');
  }

  // ---------- chaque image ----------
  update(dt: number) {
    const now = performance.now(), me = this.c.pos();
    const closed = closedRects(i => !!(this.mask & (1 << i)));
    const smokes = this.smokes.filter(s => s.until > now);
    // portes
    for (const [i, D] of this.doors.entries()) {
      const open = !!(this.mask & (1 << i));
      if (open !== D.open) {
        D.open = open;
        const r = open ? [1e4, 1e4, 1e4, 1e4] : doorRect(D.d, .1);
        D.rect.splice(0, 4, ...r);
        (D.led.material as THREE.MeshBasicMaterial).color.set(open ? '#2aff6a' : '#ff2a1a');
      }
      const target = open ? (D.d.ax === 'x' ? D.d.out : -D.d.out) * Math.PI / 2 * .92 : 0;
      D.a += (target - D.a) * Math.min(1, dt * 7);
      D.pivot.rotation.y = D.a;
    }
    // vigiles (interpolés comme les joueurs)
    const rt = now - DELAY;
    const warm = new THREE.Color('#ffd84a'), hot = new THREE.Color('#ff4a1a');
    this.guards.forEach((g, gi) => {
      const b = g.buf; if (!b.length) return;
      let x = b[b.length - 1].x, z = b[b.length - 1].z, yaw = b[b.length - 1].yaw;
      for (let i = b.length - 2; i >= 0; i--) if (b[i].t <= rt) {
        const A = b[i], B = b[i + 1], k = Math.min(1, (rt - A.t) / Math.max(1, B.t - A.t));
        x = A.x + (B.x - A.x) * k; z = A.z + (B.z - A.z) * k; yaw = A.yaw + ang(B.yaw - A.yaw) * k; break;
      }
      const h = g.body.holder, asleep = g.st === 3;
      const v = dt > 0 ? Math.hypot(x - g.last.x, z - g.last.z) / dt : 0; g.last.set(x, 0, z);
      h.position.set(x, asleep ? .16 : 0, z);
      h.rotation.order = 'YXZ'; h.rotation.y = yaw; h.rotation.x = asleep ? -Math.PI / 2 : 0;
      g.body.animate(asleep ? 0 : Math.min(3, v), dt);
      const mine = this.sus.g === gi && this.sus.v > 0;
      g.icon.visible = asleep || g.st === 2 || mine || g.st === 1;
      g.icon.material.map = asleep ? this.icons.z : g.st === 2 ? this.icons.x : this.icons.q;
      g.icon.position.set(0, asleep ? 1.2 : 2.45, asleep ? .7 : 0); g.body.tagVisible(!asleep);
      g.cone.mesh.visible = !asleep && Math.abs(x - me.x) + Math.abs(z - me.z) < 40;
      if (g.cone.mesh.visible) g.cone.set(x, z, yaw, Math.acos(GUARD.cos), GUARD.range, closed, smokes, mine ? warm.clone().lerp(hot, this.sus.v) : warm, mine ? .42 : .3);
    });
    // caméras
    const red = new THREE.Color('#ff2a2a');
    CAMS.forEach((cd, i) => {
      const c = this.cams[i];
      c.yaw += ang(c.want - c.yaw) * Math.min(1, dt * 8);
      c.m.rotation.y = c.yaw + Math.PI;
      c.led.visible = c.st === 1 ? false : c.st === 2 ? Math.sin(now / 70) > 0 : Math.sin(now / 400 + i) > -.2;
      c.cone.mesh.visible = c.st !== 1 && Math.abs(cd.x - me.x) + Math.abs(cd.z - me.z) < 40;
      if (c.cone.mesh.visible) c.cone.set(cd.x, cd.z, c.yaw, CAM.half, CAM.range, closed, smokes, red, c.st === 2 ? .5 : .24);
    });
    // fumée
    for (const s of this.smokes) {
      const k = (now - s.t0) / s.ms, grow = Math.min(1, (now - s.t0) / 900), fade = Math.min(1, (s.until - now) / 2500);
      s.g.scale.setScalar(.4 + .6 * grow);
      s.g.children.forEach((o, j) => { const sp = o as THREE.Sprite; sp.material.opacity = .78 * fade; sp.position.y += Math.sin(now / 900 + j) * dt * .05; sp.material.rotation += dt * .1 * (j % 2 ? 1 : -1); });
      if (k >= 1) this.scene.remove(s.g);
    }
    this.smokes = this.smokes.filter(s => now < s.until);
    // bandeau « zone privée » (+ temps restant de la tenue)
    const priv = isPrivate(me.x, me.z) && !this.c.out(), z = $('#p-zone');
    z.classList.toggle('hidden', !priv);
    if (priv) { const tl = Math.ceil((this.tenue - now) / 1000); const t = tl > 0 ? `Zone privée · tenue de serveur ${tl} s` : 'Zone privée'; if (z.textContent !== t) z.textContent = t; }
    if (this.mini) this.stepMini(dt);
    // sacs de butin sur le dos de ceux qui en portent
    const carrying = new Map(this.heist.b);
    for (const [id, n] of carrying) {
      let m = this.packs.get(id); const body = this.c.bodyOf(id);
      if (!body) continue;
      if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(.42, .34, .24), new THREE.MeshStandardMaterial({ color: '#2c3a2a', roughness: .9 })); m.layers.set(1); this.packs.set(id, m); }
      if (m.parent !== body.holder) body.holder.add(m);
      m.position.set(0, 1.18, -.24); m.scale.set(1, n > 1 ? 1.7 : 1, 1);
    }
    for (const [id, m] of this.packs) if (!carrying.has(id)) { m.parent?.remove(m); this.packs.delete(id); }
    const mine = carrying.get(this.c.me()) ?? 0;
    this.c.noRun(mine > 0);
    this.renderGoal(me, mine);
  }

  /** L'objectif du moment, toujours à l'écran, avec une flèche vers l'endroit où aller. */
  private renderGoal(me: THREE.Vector3, mine: number) {
    const el = $('#p-goal'), H = this.heist, clues = this.c.clues(), inv = this.c.inv();
    el.classList.toggle('hidden', this.c.out());
    let step = 0, to = { x: 0, z: 0 }, hint = '';
    if (!H.v) {
      const miss = INTEL.map((I, i) => ({ I, i })).filter(q => !clues.has(q.i));
      if (miss.length) {
        const q = miss.sort((a, b) => (a.I.x - me.x) ** 2 + (a.I.z - me.z) ** 2 - (b.I.x - me.x) ** 2 - (b.I.z - me.z) ** 2)[0];
        to = q.I; hint = `${q.I.name}${q.I.game === 'pick' && !inv.crochet ? ' · achète un kit de crochetage' : ''}`;
        if (!isPrivate(me.x, me.z) && !inv.crochet && !inv.badge) hint = 'D\'abord la caisse : kit de crochetage ou faux badge', to = { x: 0, z: -11.45 };
      } else { step = 1; to = DOORS[GATES[0]]; hint = 'Tape le code à la grille'; }
    } else if (mine) { step = 2; to = VAN; hint = 'Porte le sac à la camionnette (entrée)'; }
    else { step = 2; to = { x: 3, z: -21 }; hint = H.n ? 'Prends un sac dans la chambre forte' : 'Plus de sacs : aidez les porteurs'; }
    const code = [0, 1, 2].map(i => clues.get(i)?.code ?? '··').join(' ');
    const key = `${step}|${code}|${H.l}|${H.t}|${hint}|${this.c.indic()}`;
    if (key !== this.goalKey) {
      this.goalKey = key;
      const li = (i: number, t: string) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}"><i>${i < step ? '✓' : i + 1}</i>${t}</li>`;
      el.innerHTML = `<ol>${li(0, `Trouver le code <b>${code}</b>`)}${li(1, 'Ouvrir la chambre forte')}${li(2, `Sortir les sacs <b>${Math.min(H.l, H.t)} / ${H.t}</b>`)}</ol>`
        + (this.c.indic() ? '<p class="ind">Toi, l\'indic : fais échouer le casse sans te faire griller.</p>' : '')
        + `<div class="way"><em>➤</em><span></span></div>`;
    }
    const dx = to.x - me.x, dz = to.z - me.z, d = Math.hypot(dx, dz), y = this.c.yaw();
    const sx = dx * Math.cos(y) - dz * Math.sin(y), sy = -dx * Math.sin(y) - dz * Math.cos(y);
    const arrow = el.querySelector('.way em') as HTMLElement, sp = el.querySelector('.way span') as HTMLElement;
    arrow.style.transform = `rotate(${Math.atan2(sx, sy) - Math.PI / 2}rad)`;
    const txt = `${hint} · ${Math.round(d)} m`;
    if (sp.textContent !== txt) sp.textContent = txt;
  }

  private addSmoke(x: number, z: number, ms: number) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const tex = smokeTex();
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color().setHSL(.08, .05, .38 + Math.random() * .22), transparent: true, depthWrite: false, opacity: .78, rotation: Math.random() * 6 }));
      const a = Math.random() * 6.28, r = Math.random() * SMOKE_R * .8, s = 1.6 + Math.random() * 1.6;
      sp.position.set(Math.cos(a) * r, .3 + Math.random() * 1.9, Math.sin(a) * r); sp.scale.set(s, s, 1); sp.layers.set(1);
      g.add(sp);
    }
    this.scene.add(g);
    const now = performance.now();
    this.smokes.push({ x, z, r: SMOKE_R, until: now + ms, g, t0: now, ms });
  }
  private renderSus() {
    const el = $('#p-sus'), v = Math.max(this.sus.v, this.sus.c);
    el.classList.toggle('hidden', v <= 0);
    if (v <= 0) return;
    (el.querySelector('i') as HTMLElement).style.width = Math.round(v * 100) + '%';
    (el.querySelector('span') as HTMLElement).textContent = this.sus.v >= this.sus.c ? 'Un vigile te voit !' : 'Une caméra te filme !';
    el.classList.toggle('cam', this.sus.c > this.sus.v);
  }

  // ---------- interactions ----------
  /** Ce qu'on peut faire ici : action principale et éventuelle action secondaire. */
  near(px: number, pz: number): { a: Action; b?: Action } | null {
    if (this.c.out() || this.mini) return null;
    const inv = this.c.inv();
    for (const [i, I] of INTEL.entries()) {
      if ((px - I.x) ** 2 + (pz - I.z) ** 2 > 1.5 ** 2) continue;
      if (I.game === 'hack') return { a: { label: 'Pirater', sub: I.name, fn: () => this.startHack(3, ok => ok ? this.c.send({ t: 'intel', i }) : this.c.send({ t: 'noise', kind: 'hack' })) } };
      if (!inv.crochet) return { a: { label: 'Fermé', sub: 'kit de crochetage', warn: true, fn: () => this.c.error(`${I.name} : il te faut un kit de crochetage.`) } };
      return { a: { label: 'Crocheter', sub: I.name, fn: () => this.startPick(3 + I.pins + this.c.lock(), ok => ok ? this.c.send({ t: 'intel', i }) : this.c.send({ t: 'noise', kind: 'pick' })) } };
    }
    const R = VAULT_RECT, mine = new Map(this.heist.b).get(this.c.me()) ?? 0;
    if (mine && (px - VAN.x) ** 2 + (pz - VAN.z) ** 2 < 3 ** 2) return { a: { label: 'Déposer', sub: 'dans la camionnette', fn: () => this.c.send({ t: 'drop' }) } };
    if (this.heist.v && this.heist.n > 0 && mine < (inv.sac ? 2 : 1) && px > R[0] && px < R[2] && pz > R[1] && pz < R[3]) return { a: { label: 'Prendre', sub: `un sac · reste ${this.heist.n}`, fn: () => this.c.send({ t: 'grab' }) } };
    if (inv.somni) {
      for (const [gi, g] of this.guards.entries()) {
        const h = g.body.holder.position;
        if (g.st !== 3 && (px - h.x) ** 2 + (pz - h.z) ** 2 < 1.6 ** 2) return { a: { label: 'Endormir', sub: 'somnifère', fn: () => this.c.send({ t: 'sleep', g: gi }) } };
      }
    }
    for (const [i, D] of this.doors.entries()) {
      const d = D.d;
      if (D.open || (px - d.x) ** 2 + (pz - d.z) ** 2 > 1.6 ** 2) continue;
      if (d.kind === 'vault') return { a: { label: 'Code', sub: 'chambre forte', fn: () => this.startCode() } };
      if (!outside(d, px, pz)) return { a: { label: 'Ouvrir', sub: d.name, fn: () => this.c.send({ t: 'door', d: i, how: 'push' }) } };
      const pick: Action = { label: 'Crocheter', sub: 'la serrure', fn: () => this.startPick(3 + this.c.lock(), ok => ok ? this.c.send({ t: 'door', d: i, how: 'pick' }) : this.c.send({ t: 'noise', kind: 'pick' })) };
      const badge: Action = { label: 'Badge', sub: `${inv.badge} passage${inv.badge > 1 ? 's' : ''}`, fn: () => this.c.send({ t: 'door', d: i, how: 'badge' }) };
      if (d.kind === 'staff' && inv.badge) return inv.crochet ? { a: badge, b: pick } : { a: badge };
      if (inv.crochet) return { a: pick };
      return { a: { label: 'Fermé', sub: d.kind === 'staff' ? 'badge ou crochet' : 'kit de crochetage', warn: true, fn: () => this.c.error(d.kind === 'staff' ? `${d.name} : il te faut un faux badge ou un kit de crochetage.` : `${d.name} : seul un kit de crochetage ouvre cette serrure.`) } };
    }
    return null;
  }

  // ---------- petits jeux ----------
  private bindMini() {
    $('#mi-body').addEventListener('pointerdown', e => {
      const m = this.mini; if (!m) return;
      if (m.kind === 'pick') { e.preventDefault(); if (performance.now() - m.t0 > 250) this.pickTap(); return; }
      if (m.kind === 'code') { const d = (e.target as HTMLElement).closest('[data-d]') as HTMLElement | null; if (d) this.codeTap(d.dataset.d!); return; }
      const b = (e.target as HTMLElement).closest('[data-k]') as HTMLElement | null;
      if (b) this.hackTap(+b.dataset.k!);
    });
    // (la touche qui a lancé le jeu ne compte pas comme un premier essai)
    addEventListener('keydown', e => { if (this.mini?.kind === 'pick' && performance.now() - this.mini.t0 > 250 && (e.key === ' ' || e.key === 'e')) { e.preventDefault(); this.pickTap(); } });
  }
  private startPick(pins: number, done: (ok: boolean) => void) {
    this.mini = { kind: 'pick', done, pins, set: 0, miss: 0, x: 0, dir: 1, zone: 0, w: 0, flash: 0, t0: performance.now() };
    $('#mi-title').textContent = 'Crochetage';
    $('#mi-help').innerHTML = 'Touche quand l\'aiguille passe dans la zone dorée. <b>2 ratés</b> et la serrure claque : les vigiles autour l\'entendent.';
    $('#mi-body').innerHTML = `<div class="pins">${'<i></i>'.repeat(pins)}</div><div class="track"><b></b><em></em></div><button class="pushpin">Pousser la goupille</button>`;
    this.newPin();
    this.c.openMini();
  }
  private newPin() {
    const m = this.mini!, lv = m.set + this.c.lock();
    m.w = Math.max(.08, .2 - lv * .025); m.zone = .1 + Math.random() * (.8 - m.w); m.speed = .8 + lv * .22;
    const zEl = $('#mi-body .track b'); zEl.style.left = m.zone * 100 + '%'; zEl.style.width = m.w * 100 + '%';
  }
  private pickTap() {
    const m = this.mini!;
    if (m.x >= m.zone && m.x <= m.zone + m.w) {
      m.set++;
      $('#mi-body .pins').children[m.set - 1]?.classList.add('on');
      if (m.set >= m.pins) { this.endMini(true); return; }
      this.newPin();
    } else {
      m.miss++; m.flash = .35;
      if (m.miss >= 2) { this.c.error('Clac ! La serrure a fait du bruit.'); this.endMini(false); }
    }
  }
  /** Clavier de la grille : pré-rempli avec les morceaux qu'on a lus soi-même. */
  private startCode() {
    const cl = this.c.clues();
    this.mini = { kind: 'code', done: () => {}, v: [0, 1, 2].map(i => cl.get(i)?.code ?? '').join('').length === 6 ? [0, 1, 2].map(i => cl.get(i)!.code).join('') : '' };
    $('#mi-title').textContent = 'Code de la chambre forte';
    $('#mi-help').innerHTML = '6 chiffres : les 3 morceaux dans l\'ordre (bureau du directeur, sécurité, comptage). Demande aux autres ceux qui te manquent. <b>Un mauvais code = +10 % de chaleur.</b>';
    $('#mi-body').innerHTML = `<div class="kp"><div class="kp-v"></div><div class="kp-g">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'x', 0, 'ok'].map(k => `<button data-d="${k}">${k === 'x' ? '⌫' : k === 'ok' ? 'Valider' : k}</button>`).join('')}</div></div>`;
    this.codeTap('');
    this.c.openMini();
  }
  private codeTap(k: string) {
    const m = this.mini!;
    if (k === 'x') m.v = m.v.slice(0, -1);
    else if (k === 'ok') { if (m.v.length === 6) { this.c.send({ t: 'code', code: m.v }); this.endMini(true, true); } return; }
    else if (k && m.v.length < 6) m.v += k;
    const cl = this.c.clues();
    $('#mi-body .kp-v').innerHTML = [0, 1, 2].map(i => `<span class="${cl.has(i) ? 'k' : ''}">${(m.v.slice(i * 2, i * 2 + 2) + '··').slice(0, 2)}</span>`).join('');
  }
  private startHack(rounds: number, done: (ok: boolean) => void) {
    const glyph = ['A3', '7F', 'C0', '19', 'E4', '5B', 'D2', '8E', '06'];
    this.mini = { kind: 'hack', done, rounds, round: 0, seq: [] as number[], input: 0, show: 0, t: 0 };
    $('#mi-title').textContent = 'Piratage';
    $('#mi-help').innerHTML = `Retiens les blocs qui s'allument, puis touche-les dans le même ordre. ${rounds} séquences. Une erreur déclenche l'alarme.`;
    $('#mi-body').innerHTML = `<div class="hk"><span class="hk-st">Connexion…</span><div class="hk-grid">${glyph.map((g, k) => `<button data-k="${k}">${g}</button>`).join('')}</div></div>`;
    this.nextSeq();
    this.c.openMini();
  }
  private nextSeq() {
    const m = this.mini!;
    m.seq = Array.from({ length: 3 + m.round }, () => Math.floor(Math.random() * 9));
    m.input = 0; m.show = 0; m.t = -.6;
    $('#mi-body .hk-st').textContent = `Séquence ${m.round + 1} / ${m.rounds} — regarde bien`;
    $('#mi-body .hk').classList.add('watch');
  }
  private hackTap(k: number) {
    const m = this.mini!;
    if (m.show < m.seq.length) return;
    const btn = $('#mi-body').querySelectorAll('[data-k]')[k] as HTMLElement;
    btn.classList.remove('lit'); void btn.offsetWidth; btn.classList.add('lit');
    if (m.seq[m.input] !== k) { this.c.error('Mauvais bloc : l\'alarme du poste se déclenche !'); this.endMini(false); return; }
    m.input++;
    if (m.input >= m.seq.length) {
      m.round++;
      if (m.round >= m.rounds) { this.endMini(true); return; }
      this.nextSeq();
    }
  }
  private stepMini(dt: number) {
    const m = this.mini!;
    if (m.kind === 'code') return;
    if (m.kind === 'pick') {
      m.x += m.dir * m.speed * dt;
      if (m.x > 1) { m.x = 1; m.dir = -1; } else if (m.x < 0) { m.x = 0; m.dir = 1; }
      ($('#mi-body .track em')).style.left = m.x * 100 + '%';
      m.flash = Math.max(0, m.flash - dt);
      $('#mi-body .track').classList.toggle('bad', m.flash > 0);
      return;
    }
    if (m.show >= m.seq.length) return;
    m.t += dt;
    if (m.t >= .55) {
      m.t = 0;
      const btn = $('#mi-body').querySelectorAll('[data-k]')[m.seq[m.show]] as HTMLElement;
      btn.classList.remove('lit'); void btn.offsetWidth; btn.classList.add('lit');
      m.show++;
      if (m.show >= m.seq.length) setTimeout(() => { if (this.mini === m) { $('#mi-body .hk').classList.remove('watch'); $('#mi-body .hk-st').textContent = `Séquence ${m.round + 1} / ${m.rounds} — à toi`; } }, 450);
    }
  }
  private endMini(ok: boolean, silent = false) {
    const m = this.mini; this.mini = null;
    if (!m) return;
    if (!silent) m.done(ok);
    this.c.closeMini();
  }
  /** Abandon (bouton du panneau) : rien ne se passe. */
  cancelMini() { this.mini = null; }
  get busy() { return !!this.mini; }
}

let _smoke: THREE.Texture | null = null;
function smokeTex() {
  if (_smoke) return _smoke;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 7; i++) {
    const cx = 40 + Math.random() * 48, cy = 40 + Math.random() * 48, r = 26 + Math.random() * 30;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
  _smoke = new THREE.CanvasTexture(c); _smoke.colorSpace = THREE.SRGBColorSpace;
  return _smoke;
}
