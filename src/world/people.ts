// ============================================================
// Les gens : avatars Microsoft Rocketbox (licence MIT) animés par capture de mouvement.
// Joueurs assis aux tables et aux machines, croupiers, barman, vigiles, passants.
// Chaque personnage n'est animé que s'il est visible (le téléphone dit merci).
// ============================================================
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getGLTF } from '../gfx/assets';
import { onTick } from '../gfx/kit';
import type { V3 } from './world';

export interface Seat { x: number; z: number; yaw: number; y: number }
/** Places assises enregistrées par le mobilier (chaises de casino, tabourets). */
export const SEATS: Seat[] = [];
/** Postes de croupier (debout, face aux joueurs). */
export const DEALERS: Seat[] = [];

const clips = new Map<string, THREE.AnimationClip>();
function clip(id: string) {
  if (!clips.has(id)) {
    const c = getGLTF(id)?.animations[0];
    if (c) clips.set(id, c);
  }
  return clips.get(id);
}

interface NPC { holder: THREE.Group; mixer: THREE.AnimationMixer; path?: THREE.Vector3[]; seg: number; speed: number; acc: number }
interface Opts { seat?: number; path?: V3[]; speed?: number; phase?: number }

export const MALES = ['Business_Male_01', 'Business_Male_02', 'Business_Male_03', 'Business_Male_05'];
export const FEMALES = ['Business_Female_01', 'Business_Female_02', 'Female_Party_02'];

export class Crowd {
  list: NPC[] = [];
  private frustum = new THREE.Frustum(); private m4 = new THREE.Matrix4(); private sph = new THREE.Sphere();
  private frame = 0;
  constructor(public parent: THREE.Object3D, public camera: THREE.PerspectiveCamera, public reflect: boolean) {
    onTick((_t, dt) => this.update(dt));
  }

  spawn(avatar: string, anim: string, x: number, y: number, z: number, yaw: number, o: Opts = {}) {
    const g = getGLTF(avatar), c = clip(anim);
    if (!g || !c) return null;
    const root = SkeletonUtils.clone(g.scene);
    root.traverse(n => {
      const m = n as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
      if (!this.reflect) m.layers.set(1);
    });
    const holder = new THREE.Group(); holder.add(root);
    holder.rotation.y = yaw;
    const mixer = new THREE.AnimationMixer(root);
    const a = mixer.clipAction(c); a.play();
    a.time = (o.phase ?? Math.random()) * c.duration; a.timeScale = .92 + Math.random() * .16;
    mixer.update(0);
    holder.position.set(x, y, z);
    if (o.seat !== undefined) {
      // on cale le bassin au-dessus de l'assise, quelle que soit la pose de l'animation
      holder.position.set(0, 0, 0); holder.updateMatrixWorld(true);
      const pelvis = root.getObjectByName('Bip01_Pelvis') ?? root.getObjectByName('Bip01');
      const p = new THREE.Vector3(); pelvis?.getWorldPosition(p);
      const back = new THREE.Vector3(0, 0, -.06).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      holder.position.set(x - p.x + back.x, o.seat - p.y + .11, z - p.z + back.z);
    }
    this.parent.add(holder);
    const npc: NPC = { holder, mixer, seg: 0, speed: o.speed ?? 1.2, acc: 0 };
    if (o.path) {
      npc.path = o.path.map(v => new THREE.Vector3(...v));
      // départ réparti le long du parcours
      const total = npc.path.length, start = Math.floor((o.phase ?? 0) * total) % total;
      npc.seg = start; holder.position.copy(npc.path[start]);
    }
    this.list.push(npc);
    return npc;
  }

  private update(dt: number) {
    const cam = this.camera;
    this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m4);
    this.frame++;
    for (let i = 0; i < this.list.length; i++) {
      const n = this.list[i], h = n.holder;
      if (n.path) {
        const target = n.path[(n.seg + 1) % n.path.length];
        const d = target.clone().sub(h.position); d.y = 0;
        const step = n.speed * dt;
        if (d.length() <= step) { h.position.x = target.x; h.position.z = target.z; n.seg = (n.seg + 1) % n.path.length; if (n.seg === n.path.length - 1 && n.path.length > 2 && n.path[0].distanceTo(n.path[n.path.length - 1]) > 3) { n.seg = 0; h.position.copy(n.path[0]); } }
        else {
          d.normalize(); h.position.addScaledVector(d, step);
          const want = Math.atan2(d.x, d.z);
          let diff = want - h.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          h.rotation.y += diff * Math.min(1, dt * 6);
        }
      }
      this.sph.center.set(h.position.x, h.position.y + .9, h.position.z); this.sph.radius = 1.1;
      const dist = cam.position.distanceTo(this.sph.center);
      const vis = dist < 42 && this.frustum.intersectsSphere(this.sph);
      h.visible = vis || dist < 3;
      if (!h.visible) { n.acc += dt; continue; }
      // les personnages lointains sont animés un peu moins souvent
      n.acc += dt;
      if (dist > 16 && (this.frame + i) % 2) continue;
      n.mixer.update(n.acc); n.acc = 0;
    }
  }
}

/** Remplit le casino : joueurs, croupiers, personnel, vigiles, passants. */
export function populateHall(c: Crowd, low: boolean) {
  const keep = (i: number, pct: number) => ((i * 7919) % 100) < pct * (low ? .6 : 1);
  const pick = (i: number, female: boolean) => female ? FEMALES[i % FEMALES.length] : MALES[i % MALES.length];
  const inR = (s: Seat, r: number[]) => s.x >= r[0] && s.x <= r[2] && s.z >= r[1] && s.z <= r[3];
  SEATS.forEach((s, i) => {
    const female = (i * 13) % 5 < 2;
    const sitAnim = female ? 'f_sit_table_idle_neutral_01' : (i % 2 ? 'm_sit_table_idle_neutral_02' : 'm_sit_table_idle_neutral_01');
    let pct = 0;
    if (inR(s, [-18, -15, -6.2, 15])) pct = 52;               // salle des jeux de table
    else if (inR(s, [6.2, -15, 18.2, 15])) pct = 22;          // tabourets des machines
    else if (inR(s, [18.4, -7, 30, 7])) pct = 70;             // salon privé
    else if (inR(s, [12.4, -26, 20, -17])) pct = i % 2 ? 0 : 100;  // salle de surveillance : un vigile
    else if (inR(s, [-14, -27, -5.2, -15.3])) pct = 40;       // salle de comptage
    if (!pct || !keep(i, pct)) return;
    const staff = inR(s, [-14, -27, 20, -15.3]);
    c.spawn(staff ? (inR(s, [12.4, -26, 20, -17]) ? 'Security_Male_01' : 'Business_Male_06') : pick(i, female), staff ? 'm_sit_table_idle_neutral_01' : sitAnim, s.x, 0, s.z, s.yaw, { seat: s.y });
  });
  DEALERS.forEach((d, i) => c.spawn(i % 3 === 2 ? 'Business_Female_01' : 'Business_Male_06', i % 3 === 2 ? 'f_idle_neutral_01' : (i % 2 ? 'm_idle_neutral_02' : 'm_gestic_talk_neutral_01'), d.x, 0, d.z, d.yaw));
  // caisse, vigiles
  c.spawn('Business_Female_01', 'f_idle_neutral_01', 1.3, 0, -13.25, 0);
  c.spawn('Business_Male_06', 'm_idle_neutral_02', -2.7, 0, -13.25, 0);
  c.spawn('Security_Male_01', 'm_idle_neutral_01', 4.2, 0, -11, -.5);
  c.spawn('Security_Male_01', 'm_idle_neutral_02', 17.15, 0, 2.3, -Math.PI / 2);
  // bar : barman, clients accoudés, salon, chanteuse
  c.spawn('Business_Male_06', 'm_idle_neutral_02', -28.4, 0, -1.6, Math.PI / 2);
  c.spawn('Business_Male_02', 'm_drink_idle', -26.2, 0, -2.6, -Math.PI / 2);
  c.spawn('Female_Party_02', 'f_drink_drinking', -26.2, 0, .5, -Math.PI / 2);
  c.spawn('Business_Female_02', 'f_sit_chair_idle_neutral_01', -23.55, 0, -4.6, Math.PI / 2, { seat: .46 });
  c.spawn('Business_Male_05', 'm_sit_chair_idle_neutral_01', -21.45, 0, -4.6, -Math.PI / 2, { seat: .46 });
  if (!low) c.spawn('Business_Male_03', 'm_sit_chair_idle_neutral_01', -21.15, 0, 3.2, -Math.PI / 2, { seat: .46 });
  c.spawn('Female_Party_02', 'f_gestic_talk_neutral_01', -21.2, .4, 6.4, Math.PI);
  // salon des machines : on discute
  c.spawn('Business_Male_02', 'm_gestic_talk_neutral_01', 11.6, 0, 11, Math.PI / 2 + .3);
  c.spawn('Business_Female_02', 'f_idle_neutral_01', 12.8, 0, 10.7, -Math.PI / 2 - .2);
  // bureau du directeur
  c.spawn('Business_Male_05', 'm_sit_chair_idle_neutral_01', -17.6, 0, -25.35, 0, { seat: .46 });
  // passants dans la galerie, autour de la Grande Roue
  const loop: V3[] = [[-.9, 0, 13], [-.9, 0, 3.2], [-3.2, 0, 0], [-.9, 0, -3.2], [-.9, 0, -10.5], [.9, 0, -10.5], [.9, 0, -3.2], [3.2, 0, 0], [.9, 0, 3.2], [.9, 0, 13]];
  c.spawn('Business_Male_03', 'm_walk_stroll_01', 0, 0, 0, 0, { path: loop, speed: .95, phase: 0 });
  c.spawn('Business_Female_02', 'f_walk_neutral_01', 0, 0, 0, 0, { path: loop, speed: 1.15, phase: .35 });
  if (!low) c.spawn('Business_Male_01', 'm_walk_neutral_01', 0, 0, 0, 0, { path: loop, speed: 1.2, phase: .7 });
  // couloir de service : un employé fait sa ronde
  c.spawn('Business_Male_06', 'm_walk_neutral_01', 0, 0, 0, 0, { path: [[11, 0, -16], [11, 0, -28.2], [-22.5, 0, -28.2], [-22.5, 0, -9], [-22.5, 0, -28.2], [11, 0, -28.2], [11, 0, -16.2]], speed: 1.1, phase: .2 });
}

/** La rue : le portier sous la marquise, des passants pressés sous la pluie. */
export function populateStreet(c: Crowd) {
  c.spawn('Security_Male_01', 'm_idle_neutral_01', 2.75, .15, -9.7, .15);
  c.spawn('Business_Male_02', 'm_walk_neutral_01', 0, .15, 0, 0, { path: [[-24, .15, -7.4], [-3, .15, -7.4], [0, .15, -9.4], [0, .15, -11.3]], speed: 1.25, phase: 0 });
  c.spawn('Female_Party_02', 'f_walk_neutral_01', 0, .15, 0, 0, { path: [[-26, .15, -6.8], [-3.6, .15, -6.8], [-.6, .15, -9.4], [-.6, .15, -11.3]], speed: 1.25, phase: .5 });
  c.spawn('Business_Male_05', 'm_walk_neutral_01', 0, .15, 0, 0, { path: [[30, .15, 8.6], [-30, .15, 8.6]], speed: 1.4, phase: .3 });
}
