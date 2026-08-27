// ============================================================
// Monde 3D — 4 machines par étage : roue, crash, slots, cartes.
// On s'y déplace, on mise en s'approchant.
// ============================================================
import * as THREE from 'three';
import { FLOORS, floorAt, CARD_NAMES, type FloorDef } from '../../shared/content';

const ARENA_R = 8.6;
const NEAR_DIST = 3.0;
const SPEED = 4.2;
export const AVATAR_COLORS = ['#e6b64c', '#4aa8dc', '#e05c5c', '#5cb46e'];

// ordre du contenu : [WHEEL, CRASH, SLOTS, HILO]
const SPOTS = [
  new THREE.Vector3(-4.8, 0, -1.0),
  new THREE.Vector3(-1.7, 0, -3.6),
  new THREE.Vector3(1.7, 0, -3.6),
  new THREE.Vector3(4.8, 0, -1.0),
];
const YAWS = [0.55, 0.15, -0.15, -0.55]; // légère orientation vers le centre

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let ground: THREE.Mesh;
let accentLight: THREE.PointLight;
let keyLight: THREE.DirectionalLight;
let flashLight: THREE.PointLight;
let propsGroup: THREE.Group;
let promptMarker: THREE.Mesh;
let machineRoots: THREE.Group[] = [];

let currentFloor = 0;
let shake = 0;
let tNow = 0;

// état des machines
let segMults: number[] = [];
let wheelDisc: THREE.Group;
let spin = { active: false, from: 0, to: 0, start: 0, dur: 0 };

let crashTrack: THREE.Group;
let runner: THREE.Group;
let crashMult: number | null = null;
let runnerX = 0;
let bustAnim = 0;

interface Drum { g: THREE.Group; stopAt: number; target: number; spinning: boolean }
let drums: Drum[] = [];

let cardMesh: THREE.Mesh | null = null;
let cardCtx: CanvasRenderingContext2D;
let cardTex: THREE.CanvasTexture;
let cardFlip = 0;
let pendingCard: number | null = null;

// roulette
let rouletteDisc: THREE.Group | null = null;
let rouletteBall: THREE.Mesh | null = null;
const ROUL_SEGS = 25; // 0 = vert, puis rouge/noir alternés
let roul = { active: false, start: 0, dur: 0, target: 0 };

// blackjack
let bjPlayerTex: THREE.CanvasTexture | null = null;
let bjDealerTex: THREE.CanvasTexture | null = null;
let bjPlayerCtx: CanvasRenderingContext2D;
let bjDealerCtx: CanvasRenderingContext2D;

// craps
let dice: THREE.Mesh[] = [];
let diceRoll = { active: false, stopAt: 0, d1: 1, d2: 1 };
const DICE_EULER: Record<number, [number, number, number]> = {
  1: [0, 0, Math.PI / 2], 6: [0, 0, -Math.PI / 2], 2: [0, 0, 0],
  5: [Math.PI, 0, 0], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0],
};

// ---------- avatars ----------
interface Avatar { g: THREE.Group; target: THREE.Vector3; mine: boolean; moving: number }
const avatars = new Map<string, Avatar>();
let myId = '';
const input = new THREE.Vector2(0, 0);

export function setMoveInput(x: number, z: number) { input.set(x, z); }
export function getMyPos(): { x: number; z: number } | null {
  const a = avatars.get(myId);
  return a ? { x: a.g.position.x, z: a.g.position.z } : null;
}
export function nearMachine(): number | null {
  const a = avatars.get(myId);
  if (!a) return null;
  let best = -1, bestD = NEAR_DIST;
  SPOTS.forEach((s, i) => {
    const d = a.g.position.distanceTo(s);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best >= 0 ? best : null;
}

const mat = (color: string | number, opts: any = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts });

function textSprite(text: string, color = '#ffffff', size = 42): THREE.Sprite {
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
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(2.2, 0.55, 1);
  return sp;
}

function buildAvatar(name: string, color: string, mine: boolean): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.34, 6, 14), mat(color, { roughness: 0.45 }));
  body.position.y = 0.62;
  body.name = 'body';
  g.add(body);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat('#ffffff', { emissive: '#bbbbbb' }));
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.1, 0.78, -0.2);
  eyeR.position.set(0.1, 0.78, -0.2);
  g.add(eyeL, eyeR);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);
  const tag = textSprite(mine ? `⭐ ${name}` : name, mine ? '#ffe9a8' : '#ffffff', 38);
  tag.scale.set(1.5, 0.38, 1);
  tag.position.y = 1.45;
  g.add(tag);
  return g;
}

export function setPlayers(players: { id: string; name: string; connected: boolean; x: number; z: number }[], youId: string) {
  myId = youId;
  const alive = new Set(players.map(p => p.id));
  for (const [id, a] of avatars) {
    if (!alive.has(id)) { scene.remove(a.g); avatars.delete(id); }
  }
  players.forEach((p, i) => {
    let a = avatars.get(p.id);
    if (!a) {
      const mine = p.id === youId;
      a = { g: buildAvatar(p.name, AVATAR_COLORS[i % 4], mine), target: new THREE.Vector3(p.x, 0, p.z), mine, moving: 0 };
      a.g.position.set(p.x, 0, p.z);
      scene.add(a.g);
      avatars.set(p.id, a);
    }
    a.g.visible = p.connected || p.id === youId;
    if (p.id !== youId) a.target.set(p.x, 0, p.z);
  });
}
export function setRemotePos(id: string, x: number, z: number) {
  const a = avatars.get(id);
  if (a && !a.mine) a.target.set(x, 0, z);
}

// ---------- FX ----------
interface Floater { sp: THREE.Sprite; born: number; vy: number }
let floaters: Floater[] = [];
export function floatText(idx: number, text: string, color = '#ffffff', big = false) {
  const sp = textSprite(text, color, big ? 54 : 42);
  const base = SPOTS[idx] ?? SPOTS[0];
  sp.position.set(base.x, 3.7, base.z + 1);
  if (big) sp.scale.set(3.2, 0.8, 1);
  scene.add(sp);
  floaters.push({ sp, born: tNow, vy: 0.9 });
}

interface Coin { m: THREE.Mesh; vel: THREE.Vector3; spinv: THREE.Vector3; life: number }
let coins: Coin[] = [];
let coinPool: THREE.Mesh[] = [];
export function coinBurst(idx: number, n = 22) {
  const base = SPOTS[idx] ?? SPOTS[0];
  for (let i = 0; i < n; i++) {
    const m = coinPool.pop() ?? new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12),
      mat('#e6b64c', { metalness: 0.8, roughness: 0.25, emissive: '#5a4310' }),
    );
    m.position.set(base.x, 2.2, base.z + 0.6);
    m.visible = true;
    scene.add(m);
    coins.push({
      m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 4, 2.5 + Math.random() * 3, (Math.random() - 0.2) * 3),
      spinv: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0),
      life: 1.1 + Math.random() * 0.4,
    });
  }
}
export function bumpShake(v = 1) { shake = Math.min(2.2, shake + v); }

// ---------- machines ----------
function segColor(mult: number, f: FloorDef): THREE.Color {
  if (mult === 0) return new THREE.Color('#2b1f2e');
  if (mult >= 20) return new THREE.Color('#e6b64c');
  if (mult >= 5) return new THREE.Color(f.theme.light);
  const c = new THREE.Color(f.theme.accent);
  if (mult < 2) c.offsetHSL(0, -0.25, -0.12);
  return c;
}

function nameSprite(text: string, f: FloorDef): THREE.Sprite {
  const s = textSprite(text, f.theme.light, 40);
  s.scale.set(1.9, 0.47, 1);
  s.position.set(0, 4.4, 0);
  return s;
}

function buildWheel(f: FloorDef, def: any): THREE.Group {
  const g = new THREE.Group();
  const segs = def.wheel.segments;
  segMults = segs.map(s => s.mult);
  const N = segs.length;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.1, 8), mat('#241c28'));
  base.position.y = 0.55;
  g.add(base);
  wheelDisc = new THREE.Group();
  for (let i = 0; i < N; i++) {
    const geo = new THREE.CircleGeometry(1.5, 20, (i / N) * Math.PI * 2, (Math.PI * 2) / N);
    wheelDisc.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: segColor(segs[i].mult, f), side: THREE.DoubleSide, roughness: 0.55,
    })));
    const ang = ((i + 0.5) / N) * Math.PI * 2;
    const lab = textSprite('×' + segs[i].mult, segs[i].mult === 0 ? '#8a7f92' : '#ffffff', 46);
    lab.scale.set(0.9, 0.22, 1);
    lab.material.depthTest = true;
    lab.position.set(Math.cos(ang) * 1.02, Math.sin(ang) * 1.02, 0.03);
    wheelDisc.add(lab);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 20), mat('#e6b64c', { metalness: 0.8, roughness: 0.3 }));
  hub.rotation.x = Math.PI / 2;
  wheelDisc.add(hub);
  wheelDisc.add(new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.07, 10, 40), mat('#241c28', { metalness: 0.4 })));
  wheelDisc.position.y = 2.1;
  g.add(wheelDisc);
  const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 4), mat('#ffffff', { emissive: '#666666' }));
  ptr.position.set(0, 3.85, 0.12);
  ptr.rotation.x = Math.PI;
  g.add(ptr, nameSprite(def.name, f));
  return g;
}

function buildCrash(f: FloorDef, def: any): THREE.Group {
  const g = new THREE.Group();
  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.6, 0.18), mat('#241c28'));
  pillarL.position.set(-0.7, 1.8, 0.4);
  const pillarR = pillarL.clone(); pillarR.position.x = 0.7;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.18), mat('#241c28'));
  beam.position.set(0, 3.55, 0.4);
  g.add(pillarL, pillarR, beam);
  crashTrack = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.09, 0.42), mat(f.theme.accent, { roughness: 0.85 }));
    (plank.material as THREE.MeshStandardMaterial).color.offsetHSL(0, -0.15, -0.12 - i * 0.015);
    plank.position.set(0, 1.35, -0.1 - i * 0.55);
    crashTrack.add(plank);
  }
  g.add(crashTrack);
  runner = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.25, 6, 12), mat(f.theme.accent, { roughness: 0.5 }));
  body.position.y = 0.42;
  runner.add(body);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), mat('#ffffff', { emissive: '#aaaaaa' }));
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.09, 0.55, -0.17);
  eyeR.position.set(0.09, 0.55, -0.17);
  runner.add(eyeL, eyeR);
  runner.position.set(0, 1.4, 0.2);
  g.add(runner, nameSprite(def.name, f));
  return g;
}

function buildSlots(f: FloorDef, def: any): THREE.Group {
  const g = new THREE.Group();
  const symbols = def.slots.symbols;
  // meuble
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.6, 0.9), mat('#241c28'));
  cab.position.y = 1.6;
  g.add(cab);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.8), mat('#191320'));
  foot.position.y = 0.2;
  g.add(foot);
  const topLight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: 0.6 }));
  topLight.position.y = 3.1;
  g.add(topLight);
  // 3 tambours pentagonaux
  drums = [];
  for (let d = 0; d < 3; d++) {
    const drum = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.05), mat(symbols[i].color, { roughness: 0.4 }));
      const a = (i / 5) * Math.PI * 2;
      face.position.set(0, Math.sin(a) * 0.34, Math.cos(a) * 0.34);
      face.rotation.x = -a;
      drum.add(face);
    }
    drum.position.set(-0.62 + d * 0.62, 2.0, 0.45);
    g.add(drum);
    drums.push({ g: drum, stopAt: 0, target: 0, spinning: false });
  }
  // cadre de la fenêtre
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.1), mat('#e6b64c', { metalness: 0.6 }));
  frame.position.set(0, 2.32, 0.72);
  const frame2 = frame.clone(); frame2.position.y = 1.68;
  g.add(frame, frame2, nameSprite(def.name, f));
  return g;
}

function buildHilo(f: FloorDef, def: any): THREE.Group {
  const g = new THREE.Group();
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.0, 8), mat('#241c28'));
  table.position.y = 0.5;
  g.add(table);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.9, 0.12, 8), mat(f.theme.accent, { roughness: 0.9 }));
  felt.position.y = 1.05;
  g.add(felt);
  // la grande carte
  const c = document.createElement('canvas');
  c.width = 256; c.height = 356;
  cardCtx = c.getContext('2d')!;
  cardTex = new THREE.CanvasTexture(c);
  drawCard('?');
  cardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.53),
    new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.5, side: THREE.DoubleSide }),
  );
  cardMesh.position.set(0, 2.35, 0);
  cardMesh.rotation.x = -0.12;
  g.add(cardMesh, nameSprite(def.name, f));
  return g;
}

function buildRoulette(f: FloorDef, def: any): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.0, 10), mat('#241c28'));
  base.position.y = 0.5;
  g.add(base);
  rouletteDisc = new THREE.Group();
  for (let i = 0; i < ROUL_SEGS; i++) {
    const color = i === 0 ? '#1f8a4c' : (i % 2 ? '#b33636' : '#1c1520');
    const seg = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 10, (i / ROUL_SEGS) * Math.PI * 2, (Math.PI * 2) / ROUL_SEGS),
      new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.5 }),
    );
    rouletteDisc.add(seg);
  }
  rouletteDisc.rotation.x = -Math.PI / 2;
  rouletteDisc.position.y = 1.05;
  g.add(rouletteDisc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.1, 10, 40), mat('#e6b64c', { metalness: 0.7, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.05;
  g.add(rim);
  rouletteBall = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), mat('#f5f0e6', { roughness: 0.2 }));
  rouletteBall.position.set(1.1, 1.16, 0);
  g.add(rouletteBall);
  g.add(nameSprite(def.name, f));
  return g;
}

function bjCanvas(): [CanvasRenderingContext2D, THREE.CanvasTexture] {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 356;
  const ctx = c.getContext('2d')!;
  return [ctx, new THREE.CanvasTexture(c)];
}
function bjDraw(ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture, label: string, sub: string) {
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(0, 0, 256, 356);
  ctx.strokeStyle = '#b9a86a'; ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 236, 336);
  ctx.fillStyle = '#221d2c';
  ctx.font = '800 130px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 160);
  ctx.font = '700 44px -apple-system, system-ui, sans-serif';
  ctx.fillStyle = '#8a7f92';
  ctx.fillText(sub, 128, 290);
  tex.needsUpdate = true;
}
export function bjShow(playerLabel: string, dealerLabel: string) {
  if (bjPlayerTex) bjDraw(bjPlayerCtx, bjPlayerTex, playerLabel, 'VOUS');
  if (bjDealerTex) bjDraw(bjDealerCtx, bjDealerTex, dealerLabel, 'CROUPIER');
}

function buildBJ(f: FloorDef, def: any): THREE.Group {
  const g = new THREE.Group();
  const table = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 1.0, 8), mat('#241c28'));
  table.position.y = 0.5;
  g.add(table);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 0.12, 8), mat('#1f6b45', { roughness: 0.9 }));
  felt.position.y = 1.05;
  g.add(felt);
  [bjPlayerCtx, bjPlayerTex] = bjCanvas();
  [bjDealerCtx, bjDealerTex] = bjCanvas();
  const pCard = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.32),
    new THREE.MeshStandardMaterial({ map: bjPlayerTex, roughness: 0.5, side: THREE.DoubleSide }));
  pCard.position.set(-0.55, 2.2, 0);
  pCard.rotation.x = -0.12;
  const dCard = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.08),
    new THREE.MeshStandardMaterial({ map: bjDealerTex, roughness: 0.5, side: THREE.DoubleSide }));
  dCard.position.set(0.6, 2.1, 0);
  dCard.rotation.x = -0.12;
  g.add(pCard, dCard, nameSprite(def.name, f));
  bjShow('—', '—');
  return g;
}

function diceFace(n: number): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#221d2c';
  const P: Record<number, [number, number][]> = {
    1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[32, 32], [64, 64], [96, 96]],
    4: [[36, 36], [92, 36], [36, 92], [92, 92]],
    5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]],
    6: [[36, 32], [92, 32], [36, 64], [92, 64], [36, 96], [92, 96]],
  };
  for (const [x, y] of P[n]) { ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); }
  return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.35 });
}

function buildCraps(f: FloorDef, def: any): THREE.Group {
  const g = new THREE.Group();
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.5), mat('#241c28'));
  table.position.y = 0.5;
  g.add(table);
  const felt = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.3), mat('#1f6b45', { roughness: 0.9 }));
  felt.position.y = 1.05;
  g.add(felt);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 1.3), mat('#e6b64c', { metalness: 0.5 }));
    wall.position.set(s * 1.05, 1.2, 0);
    g.add(wall);
  }
  // faces dans l'ordre three.js : +x,-x,+y,-y,+z,-z → valeurs 1,6,2,5,3,4
  const mats = [1, 6, 2, 5, 3, 4].map(diceFace);
  dice = [-0.35, 0.35].map(x => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mats);
    d.position.set(x, 1.35, 0);
    g.add(d);
    return d;
  });
  g.add(nameSprite(def.name, f));
  return g;
}

function drawCard(label: string) {
  const ctx = cardCtx;
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(0, 0, 256, 356);
  ctx.strokeStyle = '#b9a86a'; ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 236, 336);
  ctx.fillStyle = label === '?' ? '#8a7f92' : '#221d2c';
  ctx.font = '800 150px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 178);
  cardTex.needsUpdate = true;
}

// ---------- décor ----------
function buildProps(f: FloorDef): THREE.Group {
  const g = new THREE.Group();
  const spot = () => {
    const a = Math.random() * Math.PI * 2;
    const r = ARENA_R + 1 + Math.random() * 4;
    return [Math.cos(a) * r, Math.sin(a) * r - 2];
  };
  if (f.index === 1) {
    for (let i = 0; i < 14; i++) {
      const [x, z] = spot();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 6), mat('#4a3520'));
      trunk.position.set(x, 0.8, z);
      const h = 2.4 + Math.random() * 1.8;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1 + Math.random(), h, 7), mat('#2e6b3a'));
      crown.position.set(x, 1.6 + h / 2, z);
      g.add(trunk, crown);
    }
  } else if (f.index === 2) {
    for (let i = 0; i < 10; i++) {
      const [x, z] = spot();
      const coral = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5 + Math.random(), 5), mat(i % 2 ? '#c95f8a' : '#3fa8d8', { roughness: 0.5 }));
      coral.position.set(x, 0.7, z);
      g.add(coral);
    }
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.07, 8, 8),
        mat('#9fd8f5', { transparent: true, opacity: 0.5, roughness: 0.2 }));
      b.position.set((Math.random() - 0.5) * 16, Math.random() * 5, (Math.random() - 0.7) * 10);
      b.userData.bubble = 0.3 + Math.random() * 0.6;
      g.add(b);
    }
  } else if (f.index === 3) {
    for (let i = 0; i < 10; i++) {
      const [x, z] = spot();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + Math.random() * 0.7), mat('#1c1210', { roughness: 1 }));
      rock.position.set(x, 0.5, z);
      g.add(rock);
    }
    for (let i = 0; i < 16; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff7a30' }));
      e.position.set((Math.random() - 0.5) * 16, Math.random() * 4, (Math.random() - 0.7) * 10);
      e.userData.ember = Math.random() * Math.PI * 2;
      g.add(e);
    }
  } else if (f.index === 4) {
    const n = 300;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 20 - 2;
      pos[i * 3 + 2] = (Math.random() - 0.6) * 40;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfd4ff', size: 0.07, fog: false })));
    for (let i = 0; i < 4; i++) {
      const ring3 = new THREE.Mesh(new THREE.TorusGeometry(1 + i * 0.4, 0.04, 8, 40),
        mat('#9282f2', { emissive: '#2a2260', metalness: 0.6 }));
      const [x, z] = spot();
      ring3.position.set(x, 3 + i, z);
      ring3.userData.floaty = i;
      g.add(ring3);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.4, 0.12, 60, 8),
        mat(i % 2 ? '#e6b64c' : '#9282f2', { metalness: 0.7, roughness: 0.3 }));
      const [x, z] = spot();
      knot.position.set(x, 2 + Math.random() * 3, z);
      knot.userData.floaty = i;
      g.add(knot);
    }
  }
  return g;
}

// ---------- init ----------
export function initScene(canvas: HTMLCanvasElement) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 140);
  camera.position.set(0, 5, 10);

  keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(3, 7, 4);
  scene.add(keyLight, new THREE.AmbientLight(0xffffff, 0.4));
  accentLight = new THREE.PointLight(0xffffff, 50, 30);
  accentLight.position.set(0, 5, 0);
  scene.add(accentLight);
  flashLight = new THREE.PointLight('#ff3020', 0, 18);
  scene.add(flashLight);

  ground = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.6, ARENA_R + 0.6, 0.3, 48), mat('#222222', { roughness: 0.95 }));
  ground.position.y = -0.15;
  scene.add(ground);

  promptMarker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), mat('#e6b64c', { emissive: '#8a6a1e' }));
  promptMarker.rotation.x = Math.PI;
  promptMarker.visible = false;
  scene.add(promptMarker);

  setFloor(1);
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(tick);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerHeight > innerWidth ? 66 : 55;
  camera.updateProjectionMatrix();
}

export function setFloor(index: number) {
  if (index === currentFloor) return;
  currentFloor = index;
  const f = floorAt(index) ?? FLOORS[0];
  const t = f.theme;
  scene.background = new THREE.Color(t.bg);
  scene.fog = new THREE.Fog(t.fog, 10, 40);
  (ground.material as THREE.MeshStandardMaterial).color.set(t.ground);
  accentLight.color.set(t.accent);
  keyLight.color.set(t.light);
  for (const old of machineRoots) scene.remove(old);
  if (propsGroup) scene.remove(propsGroup);
  // remise à zéro des références (les machines varient selon l'étage)
  wheelDisc = null; crashTrack = null as any; runner = null as any;
  drums = []; cardMesh = null; rouletteDisc = null; rouletteBall = null;
  bjPlayerTex = null; bjDealerTex = null; dice = [];
  crashMult = null; runnerX = 0; bustAnim = 0; pendingCard = null; cardFlip = 0;
  roul.active = false; diceRoll.active = false;

  const BUILDERS: Record<string, (f: FloorDef, def: any) => THREE.Group> = {
    WHEEL: buildWheel, CRASH: buildCrash, SLOTS: buildSlots, HILO: buildHilo,
    ROULETTE: buildRoulette, BLACKJACK: buildBJ, CRAPS: buildCraps,
  };
  machineRoots = f.machines.map((def, i) => {
    const g = BUILDERS[def.archetype](f, def);
    g.position.copy(SPOTS[i]);
    g.rotation.y = YAWS[i];
    scene.add(g);
    if (def.archetype === 'CRASH') flashLight.position.copy(SPOTS[i]).setY(3);
    return g;
  });
  propsGroup = buildProps(f);
  scene.add(propsGroup);
}

// ---------- actions ----------
export function wheelSpinTo(mult: number, spinMs: number) {
  const candidates = segMults.map((m, i) => ({ m, i })).filter(s => s.m === mult);
  const seg = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].i : 0;
  const N = segMults.length;
  const center = ((seg + 0.5) / N) * Math.PI * 2;
  const current = wheelDisc.rotation.z % (Math.PI * 2);
  spin = { active: true, from: current, to: Math.PI / 2 - center + Math.PI * 2 * 4, start: performance.now(), dur: spinMs };
}

export function slotsSpinTo(symbols: number[], spinMs: number) {
  const now = performance.now();
  drums.forEach((d, i) => {
    d.spinning = true;
    d.stopAt = now + spinMs * (0.5 + i * 0.25);
    d.target = -(symbols[i] / 5) * Math.PI * 2;
  });
}

export function hiloShowCard(card: number) {
  pendingCard = card;
  cardFlip = 1; // déclenche l'animation de flip
}

export function rouletteSpinTo(color: string, spinMs: number) {
  // choisit un segment de la bonne couleur (0 = vert, impairs = rouge, pairs = noir)
  let idx = 0;
  if (color !== 'GREEN') {
    const pool: number[] = [];
    for (let i = 1; i < ROUL_SEGS; i++) if ((i % 2 === 1) === (color === 'RED')) pool.push(i);
    idx = pool[Math.floor(Math.random() * pool.length)];
  }
  roul = { active: true, start: performance.now(), dur: spinMs, target: -((idx + 0.5) / ROUL_SEGS) * Math.PI * 2 };
}

export function crapsRollTo(d1: number, d2: number, rollMs: number) {
  diceRoll = { active: true, stopAt: performance.now() + rollMs * 0.85, d1, d2 };
}

export function setCrashMult(mult: number | null) { crashMult = mult; }
export function crashCashFx(idx = 1) { crashMult = null; coinBurst(idx); runnerX = 0; }
export function crashBustFx() {
  crashMult = null; bustAnim = 1;
  flashLight.intensity = 260;
  bumpShake(1.6);
}

// ---------- boucle ----------
let lastT = 0;
function tick(now: number) {
  tNow = now;
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;

  // mon avatar
  const me = avatars.get(myId);
  if (me) {
    const len = input.length();
    if (len > 0.05) {
      const v = input.clone().normalize().multiplyScalar(SPEED * Math.min(1, len) * dt);
      me.g.position.x += v.x;
      me.g.position.z += v.y;
      const d = Math.hypot(me.g.position.x, me.g.position.z);
      if (d > ARENA_R) {
        me.g.position.x *= ARENA_R / d;
        me.g.position.z *= ARENA_R / d;
      }
      for (const mp of SPOTS) {
        const dx = me.g.position.x - mp.x, dz = me.g.position.z - mp.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.5 && dist > 0.001) {
          me.g.position.x = mp.x + (dx / dist) * 1.5;
          me.g.position.z = mp.z + (dz / dist) * 1.5;
        }
      }
      me.g.rotation.y = Math.atan2(v.x, v.y) + Math.PI;
      me.moving = 1;
    } else me.moving = Math.max(0, me.moving - dt * 4);
  }

  for (const a of avatars.values()) {
    if (!a.mine) {
      const d = a.g.position.distanceTo(a.target);
      if (d > 0.01) {
        a.g.position.lerp(a.target, Math.min(1, dt * 8));
        a.g.rotation.y = Math.atan2(a.target.x - a.g.position.x, a.target.z - a.g.position.z) + Math.PI;
        a.moving = Math.min(1, d * 2);
      } else a.moving = Math.max(0, a.moving - dt * 4);
    }
    const body = a.g.getObjectByName('body');
    if (body) body.position.y = 0.62 + Math.abs(Math.sin(now / 100)) * 0.07 * a.moving;
  }

  // caméra
  const focusPos = me ? me.g.position : new THREE.Vector3(0, 0, 2);
  const wantPos = new THREE.Vector3(focusPos.x * 0.85, 5.1, focusPos.z + 6.8);
  const wantAim = new THREE.Vector3(focusPos.x, 1.1, focusPos.z - 1.5);
  camera.position.lerp(wantPos, 1 - Math.pow(0.002, dt));
  if (shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * 0.16 * shake;
    camera.position.y += (Math.random() - 0.5) * 0.1 * shake;
    shake *= Math.pow(0.02, dt);
  }
  camera.lookAt(wantAim);

  // marqueur
  const near = nearMachine();
  promptMarker.visible = near !== null;
  if (near !== null) {
    const mp = SPOTS[near];
    promptMarker.position.set(mp.x, 4.9 + Math.sin(now / 250) * 0.15, mp.z);
  }

  // roue
  if (wheelDisc && spin.active) {
    const t = Math.min(1, (now - spin.start) / spin.dur);
    wheelDisc.rotation.z = spin.from + (spin.to - spin.from) * (1 - Math.pow(1 - t, 3));
    if (t >= 1) spin.active = false;
  }

  // roulette : la bille orbite puis se pose
  if (rouletteBall && roul.active) {
    const t = Math.min(1, (now - roul.start) / roul.dur);
    const ease = 1 - Math.pow(1 - t, 3);
    const ang = roul.target + (1 - ease) * Math.PI * 6;
    const r = 1.2 - ease * 0.35;
    rouletteBall.position.set(Math.cos(ang) * r, 1.16, Math.sin(ang) * r);
    if (t >= 1) roul.active = false;
  }

  // craps : les dés tourbillonnent puis se figent
  if (dice.length && diceRoll.active) {
    if (now < diceRoll.stopAt) {
      for (const d of dice) {
        d.rotation.x += dt * 12;
        d.rotation.y += dt * 9;
        d.position.y = 1.35 + Math.abs(Math.sin(now / 70)) * 0.25;
      }
    } else {
      [diceRoll.d1, diceRoll.d2].forEach((v, i) => {
        const [rx, ry, rz] = DICE_EULER[v];
        dice[i].rotation.set(rx, ry, rz);
        dice[i].rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (i ? -1 : 1) * 0.4);
        dice[i].position.y = 1.35;
      });
      diceRoll.active = false;
    }
  }

  // slots
  for (const d of drums) {
    if (d.spinning) {
      if (now < d.stopAt) d.g.rotation.x += dt * 16;
      else { d.g.rotation.x = d.target; d.spinning = false; }
    }
  }

  // hilo : flip de carte
  if (cardFlip > 0 && cardMesh) {
    cardFlip -= dt * 4;
    const s = Math.abs(cardFlip * 2 - 1); // 1 → 0 → 1
    cardMesh.scale.x = Math.max(0.02, s);
    if (cardFlip <= 0.5 && pendingCard !== null) {
      drawCard(CARD_NAMES[pendingCard]);
      pendingCard = null;
    }
    if (cardFlip <= 0) { cardFlip = 0; cardMesh.scale.x = 1; }
  }

  // crash
  if (runner) {
    if (crashMult !== null) {
      const target = Math.min(1, Math.log(crashMult) / Math.log(20));
      runnerX += (target - runnerX) * Math.min(1, dt * 6);
      runner.position.z = 0.2 - runnerX * 4.4;
      runner.position.y = 1.4 + Math.abs(Math.sin(now / 90)) * 0.08;
    } else if (bustAnim > 0) {
      bustAnim -= dt * 0.8;
      crashTrack.rotation.x = -(1 - bustAnim) * 0.5;
      runner.position.y -= dt * 6;
      runner.rotation.x += dt * 5;
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 500);
      if (bustAnim <= 0) {
        crashTrack.rotation.x = 0;
        runner.position.set(0, 1.4, 0.2);
        runner.rotation.set(0, 0, 0);
        runnerX = 0;
        flashLight.intensity = 0;
      }
    } else {
      runner.position.z += (0.2 - runner.position.z) * Math.min(1, dt * 4);
      runner.position.y = 1.4;
    }
  }

  // décor animé
  if (propsGroup) {
    for (const o of propsGroup.children) {
      if (o.userData.bubble) {
        o.position.y += o.userData.bubble * dt;
        if (o.position.y > 6) o.position.y = 0;
      } else if (o.userData.ember !== undefined) {
        o.position.y += dt * 0.5;
        const s = 0.7 + Math.sin(now / 200 + o.userData.ember) * 0.5;
        o.scale.setScalar(Math.max(0.2, s));
        if (o.position.y > 5) o.position.y = 0;
      } else if (o.userData.floaty !== undefined) {
        o.rotation.x += dt * 0.4; o.rotation.y += dt * 0.6;
        o.position.y += Math.sin(now / 700 + o.userData.floaty * 2) * dt * 0.3;
      }
    }
  }

  floaters = floaters.filter(fl => {
    const age = (now - fl.born) / 1000;
    fl.sp.position.y += fl.vy * dt;
    (fl.sp.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - age / 1.4);
    if (age > 1.4) { scene.remove(fl.sp); return false; }
    return true;
  });

  coins = coins.filter(c => {
    c.life -= dt;
    c.vel.y -= dt * 9;
    c.m.position.addScaledVector(c.vel, dt);
    c.m.rotation.x += c.spinv.x * dt;
    c.m.rotation.y += c.spinv.y * dt;
    if (c.life <= 0 || c.m.position.y < 0) {
      c.m.visible = false;
      scene.remove(c.m);
      coinPool.push(c.m);
      return false;
    }
    return true;
  });

  renderer.render(scene, camera);
}
