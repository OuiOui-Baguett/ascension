// ============================================================
// Les joueurs : un corps Rocketbox animé (immobile / marche / course mélangés
// selon la vitesse réelle), une étiquette avec le pseudo, et pour les autres
// joueurs une interpolation des positions reçues du serveur (~15 par seconde).
// ============================================================
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getGLTF } from './gfx/assets';
import type { PlayerInfo } from '../shared/protocol';
import { SLOT_LIST, slotSeat } from '../shared/layout';

/** Surnoms des personnages tirés au sort. */
export const CHARACTER: Record<string, string> = {
  Business_Male_01: 'le Comptable', Business_Male_02: 'le Dandy', Business_Male_03: 'le Flambeur', Business_Male_05: 'le Notaire',
  Business_Female_01: 'la Banquière', Business_Female_02: "l'Héritière", Female_Party_02: 'la Diva',
};

const isF = (a: string) => /Female/.test(a);
const nominal = new Map<string, number>();
/** Vitesse « naturelle » d'une animation de marche/course, mesurée sur le pied
 *  (amplitude d'un appui / durée d'appui) : les pieds ne glissent pas. */
function measure(avatar: string, clipId: string, stance: number, lo: number, hi: number, fallback: number) {
  if (nominal.has(clipId)) return nominal.get(clipId)!;
  let v = fallback;
  const g = getGLTF(avatar), c = getGLTF(clipId)?.animations[0];
  if (g && c) {
    const root = SkeletonUtils.clone(g.scene), mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(c).play();
    const foot = root.getObjectByName('Bip01_L_Foot'), p = new THREE.Vector3();
    let min = Infinity, max = -Infinity;
    for (let i = 0; i <= 40 && foot; i++) {
      mixer.setTime(c.duration * i / 40); root.updateMatrixWorld(true);
      foot.getWorldPosition(p); min = Math.min(min, p.z); max = Math.max(max, p.z);
    }
    if (foot && max > min) v = Math.min(hi, Math.max(lo, (max - min) / (c.duration * stance)));
  }
  nominal.set(clipId, v);
  return v;
}

export const WALK_MAX = 1.9, RUN_SPEED = 4.2;

export class Body {
  holder = new THREE.Group();
  speed = 0;
  private mixer: THREE.AnimationMixer;
  private acts: THREE.AnimationAction[] = [];
  private nWalk = 1.4; private nRun = 3.2;
  private tag: THREE.Sprite | null = null;
  private root: THREE.Object3D;
  seated = false;
  private fx: { m: THREE.Mesh; t: number } | null = null;

  constructor(public avatar: string, name: string | null, parent: THREE.Object3D) {
    const g = getGLTF(avatar)!;
    const root = SkeletonUtils.clone(g.scene);
    root.traverse(n => { const m = n as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; m.layers.set(1); } });
    this.holder.add(root); this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    const f = isF(avatar) ? 'f' : 'm';
    const ids = [`${f}_idle_neutral_01`, `${f}_walk_neutral_01`, `${f}_run_slow_01`, `${f}_sit_table_idle_neutral_01`];
    this.nWalk = measure(avatar, ids[1], .62, 1.0, 1.9, 1.4);
    this.nRun = measure(avatar, ids[2], .4, 2.4, 4.8, 3.2);
    for (const id of ids) {
      const c = getGLTF(id)?.animations[0];
      const a = c ? this.mixer.clipAction(c) : null;
      if (a) { a.play(); a.setEffectiveWeight(id === ids[0] ? 1 : 0); a.time = Math.random() * c!.duration; }
      this.acts.push(a!);
    }
    if (name) this.setName(name);
    parent.add(this.holder);
  }

  setName(name: string, dim = false) {
    if (this.tag) { this.holder.remove(this.tag); (this.tag.material as THREE.SpriteMaterial).map?.dispose(); this.tag.material.dispose(); }
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d')!;
    x.font = '30px "Special Elite", monospace';
    const w = Math.min(244, x.measureText(name).width + 28);
    x.fillStyle = 'rgba(8,6,6,.62)'; x.beginPath(); x.roundRect(128 - w / 2, 10, w, 44, 22); x.fill();
    x.fillStyle = dim ? '#9a8f80' : '#f1e3c4'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 128, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    this.tag.scale.set(.82, .205, 1); this.tag.position.y = 2.08; this.tag.layers.set(1);
    this.holder.add(this.tag);
  }

  /** S'asseoir sur un tabouret : le bassin est calé au-dessus de l'assise. */
  sit(x: number, z: number, yaw: number, seatY = .73) {
    const [a0, a1, a2, a3] = this.acts;
    if (!a3) return;
    a0?.setEffectiveWeight(0); a1?.setEffectiveWeight(0); a2?.setEffectiveWeight(0); a3.setEffectiveWeight(1);
    this.mixer.update(0);
    const h = this.holder;
    h.position.set(0, 0, 0); h.rotation.y = yaw; h.updateMatrixWorld(true);
    const pelvis = this.root.getObjectByName('Bip01_Pelvis') ?? this.root.getObjectByName('Bip01');
    const p = new THREE.Vector3(); pelvis?.getWorldPosition(p);
    const back = new THREE.Vector3(0, 0, -.06).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    h.position.set(x - p.x + back.x, seatY - p.y + .11, z - p.z + back.z);
    this.seated = true; this.speed = 0;
  }
  stand() {
    if (!this.seated) return;
    this.seated = false; this.acts[3]?.setEffectiveWeight(0); this.holder.position.y = 0;
  }
  /** Enveloppe remise par la caissière (blanche : achat normal ; rouge : achat piégé). */
  envelope(color: 'white' | 'red') {
    if (this.fx) this.holder.remove(this.fx.m);
    const m = new THREE.Mesh(new THREE.BoxGeometry(.22, .13, .012), new THREE.MeshBasicMaterial({ color: color === 'red' ? '#d0121c' : '#f4efe4', toneMapped: false, transparent: true }));
    m.position.set(.18, 1.12, .32); m.rotation.set(-.4, .2, 0); m.layers.set(1);
    this.holder.add(m); this.fx = { m, t: 0 };
  }

  /** v en m/s (vitesse réelle au sol) */
  animate(v: number, dt: number) {
    if (this.fx) {
      const f = this.fx; f.t += dt;
      f.m.position.y = 1.12 + Math.min(1, f.t / 1.4) * .12;
      (f.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, 3 - f.t));
      if (f.t > 3) { this.holder.remove(f.m); f.m.geometry.dispose(); this.fx = null; }
    }
    if (this.seated) { this.mixer.update(dt); return; }
    this.speed += (v - this.speed) * Math.min(1, dt * 10);
    const s = this.speed;
    const idle = Math.max(0, Math.min(1, 1 - s / .55));
    const run = Math.max(0, Math.min(1, (s - 2.1) / 1.3));
    const [a0, a1, a2] = this.acts;
    a0?.setEffectiveWeight(idle);
    a1?.setEffectiveWeight((1 - idle) * (1 - run));
    a2?.setEffectiveWeight((1 - idle) * run);
    if (a1) a1.timeScale = Math.max(.7, Math.min(1.5, s / this.nWalk));
    if (a2) a2.timeScale = Math.max(.75, Math.min(1.45, s / this.nRun));
    this.mixer.update(dt);
  }

  dispose() {
    this.holder.parent?.remove(this.holder);
    this.mixer.stopAllAction();
  }
}

interface Sample { t: number; x: number; z: number; yaw: number; seat: number }
const DELAY = 120; // ms de retard volontaire pour interpoler en douceur

/** Les autres joueurs, tels que le serveur les voit. */
export class Remotes {
  map = new Map<string, { body: Body; buf: Sample[]; last: THREE.Vector3; seat: number }>();
  /** Machines occupées par les autres joueurs */
  busySlots = new Set<number>();
  constructor(public parent: THREE.Object3D) {}

  sync(players: PlayerInfo[], me: string) {
    for (const p of players) {
      if (p.id === me || !p.avatar) continue;
      let r = this.map.get(p.id);
      if (!r) { r = { body: new Body(p.avatar, p.name, this.parent), buf: [], last: new THREE.Vector3(), seat: -1 }; this.map.set(p.id, r); }
      r.body.setName(p.online ? p.name : `${p.name} · déco`, !p.online);
    }
    for (const [id, r] of this.map) if (!players.some(p => p.id === id)) { r.body.dispose(); this.map.delete(id); }
  }
  place(id: string, x: number, z: number, yaw: number) {
    const r = this.map.get(id); if (!r) return;
    r.buf = [{ t: performance.now() - DELAY, x, z, yaw, seat: -1 }];
    r.body.holder.position.set(x, 0, z); r.body.holder.rotation.y = yaw; r.last.set(x, 0, z);
  }
  snap(p: [string, number, number, number, number, number][], me: string) {
    const t = performance.now();
    this.busySlots.clear();
    for (const [id, x, z, yaw, , seat] of p) {
      if (id === me) continue;
      if (seat >= 0) this.busySlots.add(seat);
      const r = this.map.get(id); if (!r) continue;
      r.buf.push({ t, x, z, yaw, seat: seat ?? -1 });
      if (r.buf.length > 30) r.buf.shift();
    }
  }
  /** Joueurs écartés au vote : ils ne sont plus visibles des autres. */
  setHidden(ids: Set<string>) { for (const [id, r] of this.map) r.body.holder.visible = !ids.has(id); }
  remove(id: string) { const r = this.map.get(id); if (r) { r.body.dispose(); this.map.delete(id); } }
  clear() { for (const r of this.map.values()) r.body.dispose(); this.map.clear(); }

  update(dt: number) {
    const rt = performance.now() - DELAY;
    for (const r of this.map.values()) {
      const b = r.buf; if (!b.length) continue;
      const seat = b[b.length - 1].seat;
      if (seat !== r.seat) {
        r.seat = seat;
        if (seat >= 0 && SLOT_LIST[seat]) { const q = slotSeat(SLOT_LIST[seat]); r.body.sit(q.x, q.z, q.yaw); }
        else { r.body.stand(); }
      }
      if (r.body.seated) { r.body.animate(0, dt); continue; }
      let x = b[b.length - 1].x, z = b[b.length - 1].z, yaw = b[b.length - 1].yaw;
      for (let i = b.length - 2; i >= 0; i--) {
        if (b[i].t <= rt) {
          const A = b[i], B = b[i + 1], k = Math.min(1, (rt - A.t) / Math.max(1, B.t - A.t));
          x = A.x + (B.x - A.x) * k; z = A.z + (B.z - A.z) * k;
          const d = Math.atan2(Math.sin(B.yaw - A.yaw), Math.cos(B.yaw - A.yaw)); yaw = A.yaw + d * k;
          break;
        }
      }
      const h = r.body.holder;
      const v = dt > 0 ? Math.hypot(x - r.last.x, z - r.last.z) / dt : 0;
      h.position.set(x, 0, z); r.last.set(x, 0, z);
      const d = Math.atan2(Math.sin(yaw - h.rotation.y), Math.cos(yaw - h.rotation.y));
      h.rotation.y += d * Math.min(1, dt * 12);
      r.body.animate(Math.min(6, v), dt);
    }
  }
}
