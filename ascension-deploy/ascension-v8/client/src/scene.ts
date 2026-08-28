// ============================================================
// Monde 3D — boutique, 4 machines par étage, avatars
// personnalisables. La 3D EST l'interface.
// ============================================================
import * as THREE from 'three';
import { FLOORS, floorAt, CARD_NAMES, SKIN_COLORS, type FloorDef, type MachineDef } from '../../shared/content';

const ARENA_R = 9.6;
const NEAR_M = 3.5;      // machines
const NEAR_S = 3.6;      // boutique
const WALK = 4.4;

export const MACHINE_SPOTS = [
  new THREE.Vector3(-6.4, 0, -2.4),
  new THREE.Vector3(-2.5, 0, -5.4),
  new THREE.Vector3(2.5, 0, -5.4),
  new THREE.Vector3(6.4, 0, -2.4),
];
export const SHOP_POS = new THREE.Vector3(-6.6, 0, 3.6);
const YAWS = [0.6, 0.2, -0.2, -0.6];

export type Spot = { kind: 'MACHINE'; index: number } | { kind: 'SHOP' };

let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera;
let ground: THREE.Mesh, accentLight: THREE.PointLight, keyLight: THREE.DirectionalLight, flashLight: THREE.PointLight;
let propsGroup: THREE.Group, marker: THREE.Mesh;
let machineRoots: THREE.Group[] = [];
let shopRoot: THREE.Group;
let currentFloor = 0, shake = 0, tNow = 0;

// --- états d'animation par machine ---
let wheelDisc: THREE.Group | null = null;
let segMults: number[] = [];
let spin = { active: false, from: 0, to: 0, start: 0, dur: 0 };
let crashTrack: THREE.Group | null = null, runner: THREE.Group | null = null;
let crashMult: number | null = null, runnerX = 0, bustAnim = 0;
let drums: { g: THREE.Group; stopAt: number; target: number; spinning: boolean; vel: number }[] = [];
let slotBulbs: THREE.Mesh[] = [];
let slotLever: THREE.Group | null = null;
let slotFlash = 0, leverPull = 0;
let cardMesh: THREE.Mesh | null = null, cardCtx: CanvasRenderingContext2D, cardTex: THREE.CanvasTexture;
let cardFlip = 0, pendingCard: number | null = null;
let rouletteBall: THREE.Mesh | null = null;
let roul = { active: false, start: 0, dur: 0, target: 0 };
let bjPTex: THREE.CanvasTexture | null = null, bjDTex: THREE.CanvasTexture | null = null;
let bjPCtx: CanvasRenderingContext2D, bjDCtx: CanvasRenderingContext2D;
let dice: THREE.Mesh[] = [];
let diceRoll = { active: false, stopAt: 0, d1: 1, d2: 1 };
const DICE_EULER: Record<number, [number, number, number]> = {
  1: [0, 0, Math.PI / 2], 6: [0, 0, -Math.PI / 2], 2: [0, 0, 0],
  5: [Math.PI, 0, 0], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0],
};
let chestMeshes: THREE.Mesh[] = [];
let chestLids: THREE.Group[] = [], chestGems: THREE.Mesh[] = [];
let chestBeam: THREE.PointLight | null = null;
let chestAnim = { active: false, at: 0, pick: -1, reveal: [] as number[], phase: 0 };
let plinkoBall: THREE.Mesh | null = null;
let plinkoDrop = { active: false, start: 0, dur: 0, path: [] as number[], slot: 0 };

// ---------- avatars ----------
interface Avatar { g: THREE.Group; target: THREE.Vector3; mine: boolean; moving: number }
const avatars = new Map<string, Avatar>();
let myId = '';
const input = new THREE.Vector2(0, 0);

export function setMoveInput(x: number, z: number) { input.set(x, z); }
export function getMyPos() {
  const a = avatars.get(myId);
  return a ? { x: a.g.position.x, z: a.g.position.z } : null;
}
export function nearestSpot(): Spot | null {
  const a = avatars.get(myId);
  if (!a) return null;
  // on compare la distance RELATIVE à chaque zone : le plus "dedans" gagne
  let best: Spot | null = null, bestR = 1;
  MACHINE_SPOTS.forEach((s, i) => {
    const r = a.g.position.distanceTo(s) / NEAR_M;
    if (r < bestR) { bestR = r; best = { kind: 'MACHINE', index: i }; }
  });
  const rs = a.g.position.distanceTo(SHOP_POS) / NEAR_S;
  if (rs < bestR) { bestR = rs; best = { kind: 'SHOP' }; }
  return best;
}

const mat = (c: string | number, o: any = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });

function textSprite(text: string, color = '#fff', size = 42): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d')!;
  let px = size * 2;
  ctx.font = `800 ${px}px -apple-system, system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  if (w > 480) { px = Math.floor(px * 480 / w); ctx.font = `800 ${px}px -apple-system, system-ui, sans-serif`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(text, 256, 64);
  ctx.fillStyle = color; ctx.fillText(text, 256, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(2.2, 0.55, 1);
  return sp;
}
function nameSprite(t: string, f: FloorDef, y = 4.4) {
  const s = textSprite(t, f.theme.light, 40);
  s.scale.set(2.0, 0.5, 1); s.position.set(0, y, 0);
  return s;
}

function buildHat(hat: number, color: string): THREE.Object3D | null {
  const g = new THREE.Group();
  if (hat === 1) {                                   // casquette
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2a2436'));
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.26), mat('#2a2436'));
    visor.position.set(0, 0.02, -0.26);
    g.add(cap, visor);
  } else if (hat === 2) {                            // couronne
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 10), mat('#e6b64c', { metalness: .8, roughness: .25 }));
    g.add(band);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), mat('#e6b64c', { metalness: .8, roughness: .25 }));
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.24, 0.14, Math.sin(a) * 0.24);
      g.add(s);
    }
  } else if (hat === 3) {                            // haut-de-forme
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 16), mat('#1c1520'));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.42, 16), mat('#1c1520'));
    top.position.y = 0.23;
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.08, 16), mat(color));
    ribbon.position.y = 0.06;
    g.add(brim, top, ribbon);
  } else if (hat === 4) {                            // antennes
    for (const s of [-1, 1]) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), mat('#2a2436'));
      stem.position.set(s * 0.12, 0.15, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(color, { emissive: color, emissiveIntensity: .5 }));
      ball.position.set(s * 0.12, 0.32, 0);
      g.add(stem, ball);
    }
  } else if (hat === 5) {                            // auréole
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), mat('#ffe9a8', { emissive: '#e6b64c', emissiveIntensity: .8 }));
    halo.rotation.x = Math.PI / 2; halo.position.y = 0.3;
    g.add(halo);
  } else return null;
  return g;
}

function buildAvatar(name: string, color: string, hat: number, mine: boolean): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.3, 6, 14), mat(color, { roughness: .45 }));
  body.position.y = 0.52; body.name = 'body';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 14), mat('#f0d9b5', { roughness: .6 }));
  head.position.y = 1.02; head.name = 'head';
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat('#1c1520'));
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.09, 1.06, -0.22); eyeR.position.set(0.09, 1.06, -0.22);
  const scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), mat(color, { roughness: .5 }));
  scarf.position.y = 0.82;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16),
    new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .3 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  g.add(shadow, body, scarf, head, eyeL, eyeR);
  const h = buildHat(hat, color);
  if (h) { h.position.y = 1.24; h.name = 'hat'; g.add(h); }
  const tag = textSprite(mine ? `⭐ ${name}` : name, mine ? '#ffe9a8' : '#fff', 38);
  tag.scale.set(1.5, 0.38, 1); tag.position.y = 1.85;
  g.add(tag);
  return g;
}

export function setPlayers(players: any[], youId: string) {
  myId = youId;
  const alive = new Set(players.map(p => p.id));
  for (const [id, a] of avatars) if (!alive.has(id)) { scene.remove(a.g); avatars.delete(id); }
  for (const p of players) {
    let a = avatars.get(p.id);
    if (!a) {
      const mine = p.id === youId;
      a = { g: buildAvatar(p.name, SKIN_COLORS[(p.color ?? 0) % 6], p.hat ?? 0, mine), target: new THREE.Vector3(p.x, 0, p.z), mine, moving: 0 };
      a.g.position.set(p.x, 0, p.z);
      scene.add(a.g); avatars.set(p.id, a);
    }
    a.g.visible = p.connected || p.id === youId;
    if (p.id !== youId) a.target.set(p.x, 0, p.z);
  }
}
export function setRemotePos(id: string, x: number, z: number) {
  const a = avatars.get(id);
  if (a && !a.mine) a.target.set(x, 0, z);
}

// ---------- FX ----------
interface Floater { sp: THREE.Sprite; born: number }
let floaters: Floater[] = [];
function spotPos(i: number) { return MACHINE_SPOTS[i] ?? MACHINE_SPOTS[0]; }
export function floatText(i: number, text: string, color = '#fff', big = false) {
  const sp = textSprite(text, color, big ? 54 : 42);
  const b = spotPos(i);
  sp.position.set(b.x, 3.8, b.z + 1);
  if (big) sp.scale.set(3.2, 0.8, 1);
  scene.add(sp); floaters.push({ sp, born: tNow });
}
interface Coin { m: THREE.Mesh; vel: THREE.Vector3; sp: THREE.Vector3; life: number }
let coins: Coin[] = [], coinPool: THREE.Mesh[] = [];
export function coinBurst(i: number, n = 22, at?: THREE.Vector3) {
  const b = at ?? spotPos(i);
  for (let k = 0; k < n; k++) {
    const m = coinPool.pop() ?? new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12),
      mat('#e6b64c', { metalness: .8, roughness: .25, emissive: '#5a4310' }));
    m.position.set(b.x, 2.2, b.z + 0.6); m.visible = true; scene.add(m);
    coins.push({
      m, vel: new THREE.Vector3((Math.random() - .5) * 4, 2.5 + Math.random() * 3, (Math.random() - .2) * 3),
      sp: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), life: 1.1 + Math.random() * .4,
    });
  }
}
export function bumpShake(v = 1) { shake = Math.min(2.2, shake + v); }
export function slotWinFx() { slotFlash = 2.4; }

// ---------- machines ----------
function segColor(m: number, f: FloorDef) {
  if (m === 0) return new THREE.Color('#2b1f2e');
  if (m >= 20) return new THREE.Color('#e6b64c');
  if (m >= 5) return new THREE.Color(f.theme.light);
  const c = new THREE.Color(f.theme.accent);
  if (m < 2) c.offsetHSL(0, -.25, -.12);
  return c;
}

function buildWheel(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  const segs = d.wheel!.segments; segMults = segs.map(s => s.mult);
  const N = segs.length;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.55, .8, 1.1, 8), mat('#241c28'));
  base.position.y = .55; g.add(base);
  wheelDisc = new THREE.Group();
  for (let i = 0; i < N; i++) {
    wheelDisc.add(new THREE.Mesh(new THREE.CircleGeometry(1.5, 20, (i / N) * Math.PI * 2, Math.PI * 2 / N),
      new THREE.MeshStandardMaterial({ color: segColor(segs[i].mult, f), side: THREE.DoubleSide, roughness: .55 })));
    const a = ((i + .5) / N) * Math.PI * 2;
    const lab = textSprite('×' + segs[i].mult, segs[i].mult === 0 ? '#8a7f92' : '#fff', 46);
    lab.scale.set(.9, .22, 1); lab.material.depthTest = true;
    lab.position.set(Math.cos(a) * 1.02, Math.sin(a) * 1.02, .03);
    wheelDisc.add(lab);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .3, 20), mat('#e6b64c', { metalness: .8, roughness: .3 }));
  hub.rotation.x = Math.PI / 2; wheelDisc.add(hub);
  wheelDisc.add(new THREE.Mesh(new THREE.TorusGeometry(1.52, .07, 10, 40), mat('#241c28', { metalness: .4 })));
  wheelDisc.position.y = 2.1; g.add(wheelDisc);
  const ptr = new THREE.Mesh(new THREE.ConeGeometry(.15, .45, 4), mat('#fff', { emissive: '#666' }));
  ptr.position.set(0, 3.85, .12); ptr.rotation.x = Math.PI;
  g.add(ptr, nameSprite(d.name, f));
  return g;
}

function buildCrash(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  const pL = new THREE.Mesh(new THREE.BoxGeometry(.18, 3.6, .18), mat('#241c28'));
  pL.position.set(-.7, 1.8, .4);
  const pR = pL.clone(); pR.position.x = .7;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, .18, .18), mat('#241c28'));
  beam.position.set(0, 3.55, .4);
  g.add(pL, pR, beam);
  crashTrack = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const pk = new THREE.Mesh(new THREE.BoxGeometry(1, .09, .42), mat(f.theme.accent, { roughness: .85 }));
    (pk.material as THREE.MeshStandardMaterial).color.offsetHSL(0, -.15, -.12 - i * .015);
    pk.position.set(0, 1.35, -.1 - i * .55);
    crashTrack.add(pk);
  }
  g.add(crashTrack);
  runner = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .25, 6, 12), mat(f.theme.accent, { roughness: .5 }));
  body.position.y = .42;
  const eL = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 8), mat('#fff', { emissive: '#aaa' }));
  const eR = eL.clone();
  eL.position.set(-.09, .55, -.17); eR.position.set(.09, .55, -.17);
  runner.add(body, eL, eR); runner.position.set(0, 1.4, .2);
  g.add(runner, nameSprite(d.name, f));
  return g;
}

function symbolTexture(emoji: string, bg: string): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#fbf7ef'); g.addColorStop(1, '#ddd4c4');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = bg; x.lineWidth = 7; x.strokeRect(4, 4, 120, 120);
  x.font = '76px -apple-system, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 64, 70);
  return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: .45 });
}

function buildSlots(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  const sym = d.slots!.symbols;
  const gold = { metalness: .85, roughness: .22 };

  // meuble : socle évasé + corps + fronton
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.95, 1.15, .5, 12), mat('#191320'));
  foot.position.y = .25;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 1.05), mat('#2a1f33', { roughness: .55 }));
  body.position.y = 1.6;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.26, .5, 1.1), mat(f.theme.accent, { roughness: .5 }));
  belly.position.y = .78;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(2.4, .75, 1.15), mat('#1c1520'));
  crown.position.y = 3.05;
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(1.9, .42, .06), mat(f.theme.light, { emissive: f.theme.accent, emissiveIntensity: .5 }));
  marquee.position.set(0, 3.05, .59);
  g.add(foot, body, belly, crown, marquee);

  // ampoules du fronton (clignotent à la victoire)
  slotBulbs = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 10),
      mat('#ffe9a8', { emissive: '#8a6a1e', emissiveIntensity: .5 }));
    b.position.set(-.85 + i * .283, 3.5, .35);
    g.add(b); slotBulbs.push(b);
  }

  // vitre + cadre doré autour des rouleaux
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.15, .04),
    new THREE.MeshStandardMaterial({ color: '#0b0910', transparent: true, opacity: .35, roughness: .1 }));
  glass.position.set(0, 2.05, .56);
  const frameT = new THREE.Mesh(new THREE.BoxGeometry(2.05, .1, .12), mat('#e6b64c', gold));
  frameT.position.set(0, 2.66, .58);
  const frameB = frameT.clone(); frameB.position.y = 1.44;
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.32, .12), mat('#e6b64c', gold));
  frameL.position.set(-1, 2.05, .58);
  const frameR = frameL.clone(); frameR.position.x = 1;
  g.add(glass, frameT, frameB, frameL, frameR);

  // ligne de paiement
  const payline = new THREE.Mesh(new THREE.BoxGeometry(2.1, .03, .02), mat('#e05c5c', { emissive: '#e05c5c', emissiveIntensity: .7 }));
  payline.position.set(0, 2.05, .62);
  g.add(payline);

  // 3 rouleaux : cylindres à 5 faces texturées (emoji lisible)
  drums = [];
  for (let dd = 0; dd < 3; dd++) {
    const drum = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .5, 20), mat('#15111c', { roughness: .9 }));
    hub.rotation.z = Math.PI / 2;
    drum.add(hub);
    for (let i = 0; i < 5; i++) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(.5, .46), symbolTexture(sym[i].e, sym[i].color));
      const a = (i / 5) * Math.PI * 2;
      face.position.set(0, Math.sin(a) * .37, Math.cos(a) * .37);
      face.rotation.x = -a;
      drum.add(face);
    }
    drum.position.set(-.6 + dd * .6, 2.05, .3);
    g.add(drum);
    drums.push({ g: drum, stopAt: 0, target: 0, spinning: false, vel: 0 });
  }

  // bras latéral
  const armBase = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 10), mat('#e6b64c', gold));
  armBase.position.set(1.22, 1.9, 0);
  slotLever = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .8, 8), mat('#cfd4dd', { metalness: .7, roughness: .3 }));
  rod.position.y = .4;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 12), mat('#e05c5c', { roughness: .35 }));
  knob.position.y = .82;
  slotLever.add(rod, knob);
  slotLever.position.set(1.22, 1.9, 0);
  g.add(armBase, slotLever);

  // bac à monnaie
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.5, .12, .5), mat('#1c1520'));
  tray.position.set(0, .6, .68);
  g.add(tray, nameSprite(d.name, f, 4.15));
  return g;
}

function drawCard(label: string) {
  const c = cardCtx;
  c.fillStyle = '#f5f0e6'; c.fillRect(0, 0, 256, 356);
  c.strokeStyle = '#b9a86a'; c.lineWidth = 10; c.strokeRect(10, 10, 236, 336);
  c.fillStyle = label === '?' ? '#8a7f92' : '#221d2c';
  c.font = '800 150px -apple-system, system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, 128, 178);
  cardTex.needsUpdate = true;
}
function buildHilo(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  const table = new THREE.Mesh(new THREE.CylinderGeometry(.9, .7, 1, 8), mat('#241c28'));
  table.position.y = .5;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(1, .9, .12, 8), mat(f.theme.accent, { roughness: .9 }));
  felt.position.y = 1.05;
  g.add(table, felt);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 356;
  cardCtx = cv.getContext('2d')!; cardTex = new THREE.CanvasTexture(cv); drawCard('?');
  cardMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.53),
    new THREE.MeshStandardMaterial({ map: cardTex, roughness: .5, side: THREE.DoubleSide }));
  cardMesh.position.set(0, 2.35, 0); cardMesh.rotation.x = -.12;
  g.add(cardMesh, nameSprite(d.name, f));
  return g;
}

function buildRoulette(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.7, .9, 1, 10), mat('#241c28'));
  base.position.y = .5; g.add(base);
  const disc = new THREE.Group();
  const N = 25;
  for (let i = 0; i < N; i++) {
    const col = i === 0 ? '#1f8a4c' : (i % 2 ? '#b33636' : '#1c1520');
    disc.add(new THREE.Mesh(new THREE.CircleGeometry(1.35, 10, (i / N) * Math.PI * 2, Math.PI * 2 / N),
      new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: .5 })));
  }
  disc.rotation.x = -Math.PI / 2; disc.position.y = 1.05; g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.4, .1, 10, 40), mat('#e6b64c', { metalness: .7, roughness: .3 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.05; g.add(rim);
  rouletteBall = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 10), mat('#f5f0e6', { roughness: .2 }));
  rouletteBall.position.set(1.1, 1.16, 0); g.add(rouletteBall);
  g.add(nameSprite(d.name, f));
  return g;
}

function bjCanvas(): [CanvasRenderingContext2D, THREE.CanvasTexture] {
  const c = document.createElement('canvas'); c.width = 256; c.height = 356;
  return [c.getContext('2d')!, new THREE.CanvasTexture(c)];
}
function bjDraw(ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture, label: string, sub: string) {
  ctx.fillStyle = '#f5f0e6'; ctx.fillRect(0, 0, 256, 356);
  ctx.strokeStyle = '#b9a86a'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, 236, 336);
  ctx.fillStyle = '#221d2c'; ctx.font = '800 130px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 128, 160);
  ctx.font = '700 44px -apple-system, system-ui, sans-serif'; ctx.fillStyle = '#8a7f92';
  ctx.fillText(sub, 128, 290);
  tex.needsUpdate = true;
}
export function bjShow(pl: string, dl: string) {
  if (bjPTex) bjDraw(bjPCtx, bjPTex, pl, 'VOUS');
  if (bjDTex) bjDraw(bjDCtx, bjDTex, dl, 'CROUPIER');
}
function buildBJ(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  const table = new THREE.Mesh(new THREE.CylinderGeometry(1.1, .8, 1, 8), mat('#241c28'));
  table.position.y = .5;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, .12, 8), mat('#1f6b45', { roughness: .9 }));
  felt.position.y = 1.05;
  g.add(table, felt);
  [bjPCtx, bjPTex] = bjCanvas(); [bjDCtx, bjDTex] = bjCanvas();
  const pc = new THREE.Mesh(new THREE.PlaneGeometry(.95, 1.32),
    new THREE.MeshStandardMaterial({ map: bjPTex, roughness: .5, side: THREE.DoubleSide }));
  pc.position.set(-.55, 2.2, 0); pc.rotation.x = -.12;
  const dc = new THREE.Mesh(new THREE.PlaneGeometry(.78, 1.08),
    new THREE.MeshStandardMaterial({ map: bjDTex, roughness: .5, side: THREE.DoubleSide }));
  dc.position.set(.6, 2.1, 0); dc.rotation.x = -.12;
  g.add(pc, dc, nameSprite(d.name, f));
  bjShow('—', '—');
  return g;
}

function diceFace(n: number) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f5f0e6'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#221d2c';
  const P: Record<number, [number, number][]> = {
    1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[32, 32], [64, 64], [96, 96]],
    4: [[36, 36], [92, 36], [36, 92], [92, 92]],
    5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]],
    6: [[36, 32], [92, 32], [36, 64], [92, 64], [36, 96], [92, 96]],
  };
  for (const [px, py] of P[n]) { x.beginPath(); x.arc(px, py, 11, 0, Math.PI * 2); x.fill(); }
  return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: .35 });
}
function buildCraps(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.5), mat('#241c28'));
  table.position.y = .5;
  const felt = new THREE.Mesh(new THREE.BoxGeometry(2, .1, 1.3), mat('#1f6b45', { roughness: .9 }));
  felt.position.y = 1.05;
  g.add(table, felt);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(.1, .35, 1.3), mat('#e6b64c', { metalness: .5 }));
    w.position.set(s * 1.05, 1.2, 0); g.add(w);
  }
  const mats = [1, 6, 2, 5, 3, 4].map(diceFace);
  dice = [-.35, .35].map(x => {
    const dd = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), mats);
    dd.position.set(x, 1.35, 0); g.add(dd); return dd;
  });
  g.add(nameSprite(d.name, f));
  return g;
}

function buildChests(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  // établi incliné vers le joueur pour bien voir les 9 cases
  const table = new THREE.Mesh(new THREE.BoxGeometry(3, .5, 2.2), mat('#241c28'));
  table.position.set(0, 1, 0);
  table.rotation.x = -.32;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, .9), mat('#191320'));
  legs.position.y = .5;
  g.add(legs, table);

  chestMeshes = []; chestLids = []; chestGems = [];
  for (let i = 0; i < 9; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const holder = new THREE.Group();
    // le rang du fond est plus haut : la grille se lit en entier depuis la caméra
    holder.position.set((col - 1) * .82, 1.35 + (1 - row) * .30, .55 - row * .62);

    const box = new THREE.Mesh(new THREE.BoxGeometry(.6, .34, .46), mat(f.theme.accent, { roughness: .7 }));
    (box.material as THREE.MeshStandardMaterial).color.offsetHSL(0, -.08, -.14);
    box.position.y = .17;
    const band = new THREE.Mesh(new THREE.BoxGeometry(.63, .07, .49), mat('#e6b64c', { metalness: .8, roughness: .25 }));
    band.position.y = .17;
    // couvercle articulé (pivot à l'arrière)
    const lid = new THREE.Group();
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(.62, .12, .48), mat('#e6b64c', { metalness: .7, roughness: .3 }));
    lidMesh.position.z = .24;
    lid.add(lidMesh);
    lid.position.set(0, .36, -.24);
    // contenu caché : gemme
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.13),
      mat('#7ee08a', { metalness: .5, roughness: .15, emissive: '#1d5c2a', emissiveIntensity: .7 }));
    gem.position.y = .2; gem.visible = false;

    const num = textSprite(String(i + 1), '#ffffff', 46);
    num.scale.set(.34, .1, 1);
    num.position.set(0, .62, 0);

    holder.add(box, band, lid, gem, num);
    holder.userData = { lid, gem, box, home: holder.position.clone() };
    g.add(holder);
    chestMeshes.push(holder as unknown as THREE.Mesh);
    chestLids.push(lid); chestGems.push(gem);
  }
  chestBeam = new THREE.PointLight('#ffe9a8', 0, 6);
  chestBeam.position.set(0, 2.4, 0);
  g.add(chestBeam, nameSprite(d.name, f, 3.4));
  return g;
}

function buildPlinko(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(3, 3.6, .12), mat('#1c1520', { roughness: .9 }));
  board.position.y = 2.1; g.add(board);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c <= r; c++) {
      const peg = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 8), mat(f.theme.light, { emissive: f.theme.accent, emissiveIntensity: .3 }));
      peg.position.set((c - r / 2) * .33, 3.5 - r * .34, .1);
      g.add(peg);
    }
  }
  const mults = d.plinko!.mults;
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * .33;
    const hot = mults[i] >= 4;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(.3, .22, .2),
      mat(hot ? '#e6b64c' : '#3a3145', hot ? { emissive: '#5a4310' } : {}));
    slot.position.set(x, .72, .1); g.add(slot);
    const lab = textSprite('×' + mults[i], hot ? '#ffe9a8' : '#b9b2c7', 40);
    lab.scale.set(.3, .1, 1); lab.material.depthTest = true;
    lab.position.set(x, .5, .18); g.add(lab);
  }
  plinkoBall = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 12), mat('#f5f0e6', { roughness: .2, emissive: '#555' }));
  plinkoBall.position.set(0, 3.85, .18); plinkoBall.visible = false;
  g.add(plinkoBall, nameSprite(d.name, f, 4.5));
  return g;
}

// ---------- boutique ----------
function buildShop(f: FloorDef) {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1), mat('#241c28'));
  counter.position.y = .55;
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, .12, 1.2), mat(f.theme.accent, { roughness: .6 }));
  top.position.y = 1.16;
  const awn = new THREE.Mesh(new THREE.BoxGeometry(2.8, .12, 1.4), mat('#b33636'));
  awn.position.y = 2.6; awn.rotation.x = .18;
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 2.6, 8), mat('#3a3145'));
    pole.position.set(s * 1.25, 1.3, .5); g.add(pole);
  }
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .4), mat('#6b4a2a', { roughness: .9 }));
    crate.position.set(-.7 + i * .7, 1.42, 0);
    crate.rotation.y = i * .3;
    g.add(crate);
  }
  const label = textSprite('🛒 BOUTIQUE', '#ffe9a8', 42);
  label.scale.set(2.2, .55, 1); label.position.y = 3.2;
  g.add(counter, top, awn, label);
  g.position.copy(SHOP_POS);
  g.rotation.y = -0.5;
  return g;
}

// ---------- décor ----------
function buildProps(f: FloorDef) {
  const g = new THREE.Group();
  const spot = () => {
    const a = Math.random() * Math.PI * 2, r = ARENA_R + 1 + Math.random() * 4;
    return [Math.cos(a) * r, Math.sin(a) * r - 2];
  };
  if (f.index === 1) {
    for (let i = 0; i < 14; i++) {
      const [x, z] = spot();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.16, .22, 1.6, 6), mat('#4a3520'));
      t.position.set(x, .8, z);
      const h = 2.4 + Math.random() * 1.8;
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.1 + Math.random(), h, 7), mat('#2e6b3a'));
      c.position.set(x, 1.6 + h / 2, z);
      g.add(t, c);
    }
  } else if (f.index === 2) {
    for (let i = 0; i < 10; i++) {
      const [x, z] = spot();
      const c = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.5 + Math.random(), 5), mat(i % 2 ? '#c95f8a' : '#3fa8d8', { roughness: .5 }));
      c.position.set(x, .7, z); g.add(c);
    }
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(.06 + Math.random() * .07, 8, 8),
        mat('#9fd8f5', { transparent: true, opacity: .5, roughness: .2 }));
      b.position.set((Math.random() - .5) * 18, Math.random() * 5, (Math.random() - .7) * 12);
      b.userData.bubble = .3 + Math.random() * .6; g.add(b);
    }
  } else if (f.index === 3) {
    for (let i = 0; i < 10; i++) {
      const [x, z] = spot();
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.8 + Math.random() * .7), mat('#1c1210', { roughness: 1 }));
      r.position.set(x, .5, z); g.add(r);
    }
    for (let i = 0; i < 16; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff7a30' }));
      e.position.set((Math.random() - .5) * 18, Math.random() * 4, (Math.random() - .7) * 12);
      e.userData.ember = Math.random() * Math.PI * 2; g.add(e);
    }
  } else if (f.index === 4) {
    const n = 300, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - .5) * 55;
      pos[i * 3 + 1] = Math.random() * 20 - 2;
      pos[i * 3 + 2] = (Math.random() - .6) * 45;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfd4ff', size: .07, fog: false })));
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1 + i * .4, .04, 8, 40), mat('#9282f2', { emissive: '#2a2260', metalness: .6 }));
      const [x, z] = spot(); r.position.set(x, 3 + i, z); r.userData.floaty = i; g.add(r);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const k = new THREE.Mesh(new THREE.TorusKnotGeometry(.4, .12, 60, 8),
        mat(i % 2 ? '#e6b64c' : '#9282f2', { metalness: .7, roughness: .3 }));
      const [x, z] = spot(); k.position.set(x, 2 + Math.random() * 3, z); k.userData.floaty = i; g.add(k);
    }
  }
  return g;
}

// ---------- init ----------
export function initScene(canvas: HTMLCanvasElement) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, .1, 150);
  camera.position.set(0, 5, 10);
  keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(3, 7, 4);
  scene.add(keyLight, new THREE.AmbientLight(0xffffff, .4));
  accentLight = new THREE.PointLight(0xffffff, 50, 34);
  accentLight.position.set(0, 5, 0);
  flashLight = new THREE.PointLight('#ff3020', 0, 18);
  scene.add(accentLight, flashLight);
  ground = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + .8, ARENA_R + .8, .3, 48), mat('#222', { roughness: .95 }));
  ground.position.y = -.15; scene.add(ground);
  marker = new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 4), mat('#e6b64c', { emissive: '#8a6a1e' }));
  marker.rotation.x = Math.PI; marker.visible = false; scene.add(marker);
  setFloor(1);
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(tick);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerHeight > innerWidth ? 68 : 56;
  camera.updateProjectionMatrix();
}

const BUILDERS: Record<string, (f: FloorDef, d: MachineDef) => THREE.Group> = {
  WHEEL: buildWheel, CRASH: buildCrash, SLOTS: buildSlots, HILO: buildHilo,
  ROULETTE: buildRoulette, BLACKJACK: buildBJ, CRAPS: buildCraps,
  CHESTS: buildChests, PLINKO: buildPlinko,
};

export function setFloor(index: number) {
  if (index === currentFloor) return;
  currentFloor = index;
  const f = floorAt(index) ?? FLOORS[0];
  const t = f.theme;
  scene.background = new THREE.Color(t.bg);
  scene.fog = new THREE.Fog(t.fog, 11, 44);
  (ground.material as THREE.MeshStandardMaterial).color.set(t.ground);
  accentLight.color.set(t.accent);
  keyLight.color.set(t.light);
  for (const o of machineRoots) scene.remove(o);
  if (propsGroup) scene.remove(propsGroup);
  if (shopRoot) scene.remove(shopRoot);
  wheelDisc = null; crashTrack = null; runner = null; drums = []; cardMesh = null;
  rouletteBall = null; bjPTex = null; bjDTex = null; dice = []; chestMeshes = []; plinkoBall = null;
  crashMult = null; runnerX = 0; bustAnim = 0; pendingCard = null; cardFlip = 0;
  roul.active = false; diceRoll.active = false; chestAnim.active = false; plinkoDrop.active = false;

  machineRoots = f.machines.map((d, i) => {
    const g = BUILDERS[d.archetype](f, d);
    g.position.copy(MACHINE_SPOTS[i]);
    g.rotation.y = YAWS[i];
    scene.add(g);
    if (d.archetype === 'CRASH') flashLight.position.copy(MACHINE_SPOTS[i]).setY(3);
    return g;
  });
  shopRoot = buildShop(f);
  propsGroup = buildProps(f);
  scene.add(shopRoot, propsGroup);
}

// ---------- actions ----------
export function wheelSpinTo(mult: number, spinMs: number) {
  if (!wheelDisc) return;
  const cand = segMults.map((m, i) => ({ m, i })).filter(s => s.m === mult);
  const seg = cand.length ? cand[Math.floor(Math.random() * cand.length)].i : 0;
  const N = segMults.length;
  const center = ((seg + .5) / N) * Math.PI * 2;
  spin = { active: true, from: wheelDisc.rotation.z % (Math.PI * 2), to: Math.PI / 2 - center + Math.PI * 8, start: performance.now(), dur: spinMs };
}
export function slotsSpinTo(symbols: number[], spinMs: number) {
  const now = performance.now();
  leverPull = 1;
  drums.forEach((d, i) => {
    d.spinning = true;
    d.stopAt = now + spinMs * (.5 + i * .25);
    d.target = -(symbols[i] / 5) * Math.PI * 2;
  });
}
export function hiloShowCard(card: number) { pendingCard = card; cardFlip = 1; }
export function rouletteSpinTo(color: string, spinMs: number) {
  const N = 25;
  let idx = 0;
  if (color !== 'GREEN') {
    const pool: number[] = [];
    for (let i = 1; i < N; i++) if ((i % 2 === 1) === (color === 'RED')) pool.push(i);
    idx = pool[Math.floor(Math.random() * pool.length)];
  }
  roul = { active: true, start: performance.now(), dur: spinMs, target: -((idx + .5) / N) * Math.PI * 2 };
}
export function crapsRollTo(d1: number, d2: number, rollMs: number) {
  diceRoll = { active: true, stopAt: performance.now() + rollMs * .85, d1, d2 };
}
export function chestsOpen(pick: number, reveal: number[], openMs: number) {
  chestAnim = { active: true, at: performance.now() + openMs * .55, pick, reveal, phase: 0 };
  // toutes les caisses se referment avant le nouveau tirage
  chestLids.forEach(l => l.rotation.x = 0);
  chestGems.forEach(gm => gm.visible = false);
}
export function plinkoDropTo(path: number[], slot: number, dropMs: number) {
  if (!plinkoBall) return;
  plinkoBall.visible = true;
  plinkoDrop = { active: true, start: performance.now(), dur: dropMs, path, slot };
}
export function setCrashMult(m: number | null) { crashMult = m; }
export function crashCashFx(i = 1) { crashMult = null; coinBurst(i); runnerX = 0; }
export function crashBustFx() { crashMult = null; bustAnim = 1; flashLight.intensity = 260; bumpShake(1.6); }

// ---------- boucle ----------
let lastT = 0;
function tick(now: number) {
  tNow = now;
  const dt = Math.min(.05, (now - lastT) / 1000 || .016);
  lastT = now;

  const me = avatars.get(myId);
  if (me) {
    const len = input.length();
    if (len > .05) {
      const v = input.clone().normalize().multiplyScalar(WALK * Math.min(1, len) * dt);
      me.g.position.x += v.x; me.g.position.z += v.y;
      const d = Math.hypot(me.g.position.x, me.g.position.z);
      if (d > ARENA_R) { me.g.position.x *= ARENA_R / d; me.g.position.z *= ARENA_R / d; }
      const solids = [...MACHINE_SPOTS.map(s => ({ p: s, r: 1.6 })), { p: SHOP_POS, r: 1.6 }];
      for (const s of solids) {
        const dx = me.g.position.x - s.p.x, dz = me.g.position.z - s.p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < s.r && dist > .001) {
          me.g.position.x = s.p.x + (dx / dist) * s.r;
          me.g.position.z = s.p.z + (dz / dist) * s.r;
        }
      }
      me.g.rotation.y = Math.atan2(v.x, v.y) + Math.PI;
      me.moving = 1;
    } else me.moving = Math.max(0, me.moving - dt * 4);
  }
  for (const a of avatars.values()) {
    if (!a.mine) {
      const d = a.g.position.distanceTo(a.target);
      if (d > .01) {
        a.g.position.lerp(a.target, Math.min(1, dt * 8));
        a.g.rotation.y = Math.atan2(a.target.x - a.g.position.x, a.target.z - a.g.position.z) + Math.PI;
        a.moving = Math.min(1, d * 2);
      } else a.moving = Math.max(0, a.moving - dt * 4);
    }
    const b = a.g.getObjectByName('body'), h = a.g.getObjectByName('head'), ht = a.g.getObjectByName('hat');
    const bob = Math.abs(Math.sin(now / 100)) * .07 * a.moving;
    if (b) b.position.y = .52 + bob;
    if (h) h.position.y = 1.02 + bob;
    if (ht) ht.position.y = 1.24 + bob;
  }

  const fp = me ? me.g.position : new THREE.Vector3(0, 0, 3);
  camera.position.lerp(new THREE.Vector3(fp.x * .85, 5.3, fp.z + 7), 1 - Math.pow(.002, dt));
  if (shake > .01) {
    camera.position.x += (Math.random() - .5) * .16 * shake;
    camera.position.y += (Math.random() - .5) * .1 * shake;
    shake *= Math.pow(.02, dt);
  }
  camera.lookAt(new THREE.Vector3(fp.x, 1.2, fp.z - 1.6));

  const sp = nearestSpot();
  marker.visible = !!sp;
  if (sp) {
    const p = sp.kind === 'MACHINE' ? MACHINE_SPOTS[sp.index] : SHOP_POS;
    marker.position.set(p.x, (sp.kind === 'MACHINE' ? 4.9 : 3.8) + Math.sin(now / 250) * .15, p.z);
  }

  if (wheelDisc && spin.active) {
    const t = Math.min(1, (now - spin.start) / spin.dur);
    wheelDisc.rotation.z = spin.from + (spin.to - spin.from) * (1 - Math.pow(1 - t, 3));
    if (t >= 1) spin.active = false;
  }
  if (rouletteBall && roul.active) {
    const t = Math.min(1, (now - roul.start) / roul.dur);
    const e = 1 - Math.pow(1 - t, 3);
    const a = roul.target + (1 - e) * Math.PI * 6, r = 1.2 - e * .35;
    rouletteBall.position.set(Math.cos(a) * r, 1.16, Math.sin(a) * r);
    if (t >= 1) roul.active = false;
  }
  for (const d of drums) {
    if (d.spinning) {
      if (now < d.stopAt) {
        d.vel = 22;
        d.g.rotation.x += dt * d.vel;
      } else {
        // freinage puis calage net sur le symbole, avec un petit rebond
        const diff = ((d.target - d.g.rotation.x) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (diff > .02) d.g.rotation.x += Math.min(diff, dt * Math.max(2.5, d.vel));
        else { d.g.rotation.x = d.target; d.spinning = false; d.vel = 0; bumpShake(.12); }
        d.vel = Math.max(2.5, d.vel - dt * 26);
      }
    }
  }
  if (slotLever) {
    if (leverPull > 0) leverPull -= dt * 2.2;
    slotLever.rotation.x = Math.max(0, leverPull) * 1.1;
  }
  if (slotBulbs.length) {
    if (slotFlash > 0) slotFlash -= dt;
    slotBulbs.forEach((b, i) => {
      const on = slotFlash > 0
        ? Math.sin(now / 70 + i) > 0
        : Math.sin(now / 420 + i * .8) > .4;
      (b.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.6 : .25;
    });
  }
  if (dice.length && diceRoll.active) {
    if (now < diceRoll.stopAt) {
      for (const d of dice) {
        d.rotation.x += dt * 12; d.rotation.y += dt * 9;
        d.position.y = 1.35 + Math.abs(Math.sin(now / 70)) * .25;
      }
    } else {
      [diceRoll.d1, diceRoll.d2].forEach((v, i) => {
        const [rx, ry, rz] = DICE_EULER[v];
        dice[i].rotation.set(rx, ry, rz);
        dice[i].rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (i ? -1 : 1) * .4);
        dice[i].position.y = 1.35;
      });
      diceRoll.active = false;
    }
  }
  if (chestMeshes.length && chestAnim.active) {
    const pick = chestAnim.pick;
    // 1) la caisse choisie tressaute avant l'ouverture
    if (now < chestAnim.at) {
      const h = chestMeshes[pick] as unknown as THREE.Group;
      if (h) h.position.y = h.userData.home.y + Math.abs(Math.sin(now / 60)) * .09;
    } else {
      const h = chestMeshes[pick] as unknown as THREE.Group;
      if (h) h.position.y = h.userData.home.y;
      // 2) ouverture : la choisie en grand, les autres entrouvertes
      chestAnim.phase = Math.min(1, chestAnim.phase + dt * 2.6);
      const e = 1 - Math.pow(1 - chestAnim.phase, 3);
      chestLids.forEach((lid, i) => {
        lid.rotation.x = -e * (i === pick ? 2.1 : 1.1);
        const gm = chestGems[i], m = chestAnim.reveal[i] ?? 0;
        if (gm) {
          gm.visible = m > 0;
          const c = m >= 3 ? '#e6b64c' : m >= 1.5 ? '#7ee08a' : '#9fd8f5';
          (gm.material as THREE.MeshStandardMaterial).color.set(c);
          (gm.material as THREE.MeshStandardMaterial).emissive.set(i === pick ? c : '#000');
          gm.scale.setScalar(i === pick ? 1 + Math.sin(now / 140) * .12 : .55);
          gm.rotation.y += dt * (i === pick ? 3 : 1);
        }
      });
      if (chestBeam) chestBeam.intensity = (chestAnim.reveal[pick] > 0 ? 55 : 0) * e;
      if (chestAnim.phase >= 1) {
        chestAnim.active = false;
        setTimeout(() => {
          chestLids.forEach(l => l.rotation.x = 0);
          chestGems.forEach(gm => gm.visible = false);
          if (chestBeam) chestBeam.intensity = 0;
        }, 2200);
      }
    }
  }

  if (plinkoBall && plinkoDrop.active) {
    const t = Math.min(1, (now - plinkoDrop.start) / plinkoDrop.dur);
    const row = Math.min(7, Math.floor(t * 8));
    let x = 0;
    for (let i = 0; i < row; i++) x += plinkoDrop.path[i] ? .165 : -.165;
    const frac = (t * 8) % 1;
    x += (plinkoDrop.path[row] ? .165 : -.165) * frac;
    plinkoBall.position.set(x, 3.85 - t * 3.05, .18 + Math.sin(t * 20) * .02);
    if (t >= 1) {
      plinkoDrop.active = false;
      plinkoBall.position.x = (plinkoDrop.slot - 4) * .33;
      plinkoBall.position.y = .85;
    }
  }
  if (runner) {
    if (crashMult !== null) {
      const target = Math.min(1, Math.log(crashMult) / Math.log(20));
      runnerX += (target - runnerX) * Math.min(1, dt * 6);
      runner.position.z = .2 - runnerX * 4.4;
      runner.position.y = 1.4 + Math.abs(Math.sin(now / 90)) * .08;
    } else if (bustAnim > 0) {
      bustAnim -= dt * .8;
      if (crashTrack) crashTrack.rotation.x = -(1 - bustAnim) * .5;
      runner.position.y -= dt * 6; runner.rotation.x += dt * 5;
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 500);
      if (bustAnim <= 0) {
        if (crashTrack) crashTrack.rotation.x = 0;
        runner.position.set(0, 1.4, .2); runner.rotation.set(0, 0, 0);
        runnerX = 0; flashLight.intensity = 0;
      }
    } else {
      runner.position.z += (.2 - runner.position.z) * Math.min(1, dt * 4);
      runner.position.y = 1.4;
    }
  }
  if (propsGroup) {
    for (const o of propsGroup.children) {
      if (o.userData.bubble) { o.position.y += o.userData.bubble * dt; if (o.position.y > 6) o.position.y = 0; }
      else if (o.userData.ember !== undefined) {
        o.position.y += dt * .5;
        o.scale.setScalar(Math.max(.2, .7 + Math.sin(now / 200 + o.userData.ember) * .5));
        if (o.position.y > 5) o.position.y = 0;
      } else if (o.userData.floaty !== undefined) {
        o.rotation.x += dt * .4; o.rotation.y += dt * .6;
        o.position.y += Math.sin(now / 700 + o.userData.floaty * 2) * dt * .3;
      }
    }
  }
  floaters = floaters.filter(fl => {
    const age = (now - fl.born) / 1000;
    fl.sp.position.y += .9 * dt;
    (fl.sp.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - age / 1.4);
    if (age > 1.4) { scene.remove(fl.sp); return false; }
    return true;
  });
  coins = coins.filter(c => {
    c.life -= dt; c.vel.y -= dt * 9;
    c.m.position.addScaledVector(c.vel, dt);
    c.m.rotation.x += c.sp.x * dt; c.m.rotation.y += c.sp.y * dt;
    if (c.life <= 0 || c.m.position.y < 0) { c.m.visible = false; scene.remove(c.m); coinPool.push(c.m); return false; }
    return true;
  });
  renderer.render(scene, camera);
}
