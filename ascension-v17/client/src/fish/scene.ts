// ============================================================
// FISH & FURY — la crique. Mer animée, ponton, étals, avatars,
// lignes de pêche et bouchons. Rendu monté sur son PROPRE canvas :
// chaque jeu possède son contexte WebGL et le libère en partant.
// ============================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SKIN_COLORS } from '../../../shared/content';

let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera;
let sea: THREE.Mesh, seaGeo: THREE.PlaneGeometry;
let composer: EffectComposer | null = null, bloom: UnrealBloomPass | null = null;
let gulls: THREE.Group, foam: THREE.Mesh;
let canvas: HTMLCanvasElement | null = null;
let quality: 'high' | 'low' = 'high';
let fpsFrames = 0, fpsStart = 0, qualityLocked = false;
let tNow = 0, lastT = 0, shake = 0;
let faceX = 0, faceZ = -1, camYaw = Math.PI;   // cap de la caméra, lissé en angle

const WALK = 5.2;
let walkScale = 1;      // on marche au ralenti quand on a une canne pliée en deux
export function setWalkScale(k: number) { walkScale = k; }
export const DOCK_Z = 1.0;             // jonction plateforme / avancée sur l'eau
export const MARKET_POS = new THREE.Vector3(-7.4, 0, 8.4);
export const SHOP_POS = new THREE.Vector3(7.2, 0, 8.4);
const WORLD_R = 25;

const input = new THREE.Vector2(0, 0);
let myId = '';
interface Avatar { g: THREE.Group; target: THREE.Vector3; mine: boolean; moving: number; soaked?: boolean; bob?: THREE.Mesh; line?: THREE.Line }
const avatars = new Map<string, Avatar>();
let floaters: { sp: THREE.Sprite; born: number; from: THREE.Vector3 }[] = [];
let splashes: { m: THREE.Mesh; born: number }[] = [];

const mat = (c: string | number, o: any = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o });
const GOLD = { metalness: .85, roughness: .25 };

// ---------- textures procédurales ----------
const texCache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, size: number, draw: (c: CanvasRenderingContext2D, S: number) => void, rep: [number, number] = [1, 1]) {
  const hit = texCache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.userData.shared = true; texCache.set(key, t);
  return t;
}
const woodTex = (base = '#6b4a2a', dark = '#3a2413') => tex(`w:${base}`, 256, (c, S) => {
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    c.strokeStyle = dark; c.globalAlpha = .08 + Math.random() * .3; c.lineWidth = .5 + Math.random() * 2.4;
    c.beginPath(); let y = Math.random() * S; c.moveTo(0, y);
    for (let x = 0; x <= S; x += 24) { y += (Math.random() - .5) * 6; c.lineTo(x, y); }
    c.stroke();
  }
  c.globalAlpha = 1;
}, [2, 2]);
const sandTex = () => tex('sand', 256, (c, S) => {
  c.fillStyle = '#d8c48d'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    c.fillStyle = ['#c9b47a', '#e6d6a8', '#b8a169'][i % 3];
    c.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
}, [14, 14]);
const waterTex = () => tex('water', 1024, (c, S) => {
  // Le dégradé vertical EST la profondeur : turquoise près de la plage (bas de la
  // texture = devant la caméra), bleu de nuit vers le large. Non répétée, exprès.
  const g = c.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#0a2c44'); g.addColorStop(.34, '#0f4a68');
  g.addColorStop(.62, '#177a97'); g.addColorStop(.85, '#2aa6b4'); g.addColorStop(1, '#63cfc6');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 520; i++) {
    const y = Math.random() * S;
    c.strokeStyle = `rgba(210,248,255,${.05 + (y / S) * .18})`;
    c.lineWidth = 1 + Math.random() * 3;
    const w = 30 + Math.random() * 150, x = Math.random() * S;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - 7, x + w, y); c.stroke();
  }
});
const waterNorm = () => {
  const t = tex('wnorm', 512, (c, S) => {
    c.fillStyle = '#8080ff'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 2 + Math.random() * 9;
      const a = Math.random() * Math.PI * 2;
      const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, `rgba(${128 + Math.cos(a) * 90 | 0},${128 + Math.sin(a) * 90 | 0},255,.55)`);
      g.addColorStop(1, `rgba(${128 - Math.cos(a) * 90 | 0},${128 - Math.sin(a) * 90 | 0},255,.55)`);
      c.fillStyle = g;
      c.beginPath(); c.ellipse(x, y, r * 2.2, r, a, 0, Math.PI * 2); c.fill();
    }
  });
  t.colorSpace = THREE.NoColorSpace;      // une normal map n'est pas une couleur
  return t;
};
const foamTex = () => tex('foam', 512, (c, S) => {
  c.clearRect(0, 0, S, S);
  const g = c.createRadialGradient(S / 2, S / 2, S * .40, S / 2, S / 2, S * .5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(.62, 'rgba(255,255,255,.85)');
  g.addColorStop(.82, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  // dentelle d'écume : sans ça, l'anneau fait « cercle de PowerPoint »
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, r = S * (.40 + Math.random() * .10);
    c.beginPath();
    c.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 2 + Math.random() * 9, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = 'source-over';
});

function textSprite(txt: string, color = '#fff', px = 40) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d')!;
  x.font = `800 ${px}px -apple-system, system-ui, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(txt, 256, 64);
  x.fillStyle = color; x.fillText(txt, 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  sp.scale.set(2.6, .65, 1);
  return sp;
}

// ---------- décor ----------
function buildSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 40, 24),
    new THREE.MeshBasicMaterial({
      side: THREE.BackSide, fog: false,
      map: tex('sky', 1024, (c, S) => {
        const g = c.createLinearGradient(0, 0, 0, S);
        g.addColorStop(0, '#0d2b52'); g.addColorStop(.30, '#2f6ea2');
        g.addColorStop(.52, '#7fb6d6'); g.addColorStop(.66, '#c9dfe4');
        g.addColorStop(.74, '#f4d9a4'); g.addColorStop(1, '#e8a86b');
        c.fillStyle = g; c.fillRect(0, 0, S, S);
        // halo chaud autour du soleil (il est droit devant, côté large)
        const sx = S * .5, sy = S * .70;
        const h = c.createRadialGradient(sx, sy, 0, sx, sy, S * .38);
        h.addColorStop(0, 'rgba(255,243,208,.95)');
        h.addColorStop(.18, 'rgba(255,225,160,.55)');
        h.addColorStop(.55, 'rgba(255,205,140,.14)');
        h.addColorStop(1, 'rgba(255,205,140,0)');
        c.fillStyle = h; c.fillRect(0, 0, S, S);
        // nuages en bandes, plus fins près de l'horizon
        for (let i = 0; i < 90; i++) {
          const y = 60 + Math.random() * (S * .52);
          const t = 1 - y / (S * .62);
          c.globalAlpha = .10 + Math.random() * .30 * t;
          c.fillStyle = y > S * .42 ? '#ffd9ad' : '#ffffff';
          const x = Math.random() * S, w = 40 + Math.random() * 230, hh = 4 + Math.random() * 16 * t;
          c.beginPath(); c.ellipse(x, y, w, hh, 0, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
      }),
    }));
  sky.renderOrder = -1;
  return sky;
}

/** Le disque solaire, posé loin devant : c'est lui qui allume le bloom sur l'eau. */
function buildSun() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40),
    new THREE.MeshBasicMaterial({ color: '#ffeec4', fog: false, transparent: true }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex('halo', 256, (c, S) => {
      const r = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      r.addColorStop(0, 'rgba(255,240,200,.75)'); r.addColorStop(.22, 'rgba(255,214,150,.30)');
      r.addColorStop(1, 'rgba(255,200,130,0)');
      c.fillStyle = r; c.fillRect(0, 0, S, S);
    }),
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  halo.scale.set(22, 22, 1);
  g.add(disc, halo);
  g.position.set(-46, 26, -172);   // DERRIÈRE la nappe d'eau, sinon il se reflète en pleine mer
  return g;
}

/** Îlots à l'horizon : la crique cesse d'être un bassin quand il y a quelque chose au loin. */
function buildHorizon() {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#3d5a6b', roughness: 1, metalness: 0 });
  const isles: [number, number, number][] = [[-52, -96, 7], [-34, -108, 4.4], [46, -92, 8.5], [66, -104, 5], [12, -128, 5.6]];
  for (const [x, z, r] of isles) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, r * (.7 + Math.random() * .6), 6, 1), rockMat);
    m.position.set(x, r * .28, z);
    m.rotation.y = Math.random() * 3;
    m.scale.set(1 + Math.random() * .7, 1, .8);
    g.add(m);
    const top = new THREE.Mesh(new THREE.SphereGeometry(r * .32, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#2f5a44', roughness: 1 }));
    top.position.set(x, r * .62, z); top.scale.y = .5;
    g.add(top);
  }
  // le phare : un point de repère, et une lueur qui accroche le bloom
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 11, 10), mat('#e9e3d6', { roughness: .9 }));
  base.position.set(-40, 5.5, -88);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.9, 2.6, 10), mat('#c4483f', { roughness: .9 }));
  band.position.set(-40, 6.4, -88);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#ffe8a8', fog: false }));
  lamp.position.set(-40, 11.6, -88);
  lamp.name = 'lamp';
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.8, 10), mat('#3a4a55', { roughness: .8 }));
  roof.position.set(-40, 13.2, -88);
  g.add(base, band, lamp, roof);
  return g;
}

/** Mouettes : trois sprites qui tournent, c'est ce qui fait « ça vit » pour trois lignes. */
function buildGulls() {
  const t = tex('gull', 128, (c, S) => {
    c.clearRect(0, 0, S, S);
    c.strokeStyle = '#f4f7fa'; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(14, 78); c.quadraticCurveTo(40, 44, 64, 70);
    c.quadraticCurveTo(88, 44, 114, 78);
    c.stroke();
  });
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false, opacity: .9 }));
    sp.scale.setScalar(1.6 + Math.random() * 1.2);
    sp.userData = { a: Math.random() * 6.28, r: 16 + Math.random() * 22, y: 12 + Math.random() * 9, sp: .12 + Math.random() * .1 };
    g.add(sp);
  }
  g.name = 'gulls';
  return g;
}

// --- menuiserie du ponton -------------------------------------------------
const PLANK_SHADES = ['#6b4a2a', '#74512f', '#5f4124', '#7b5836', '#674628'];
function plankMat(i: number) {
  const c = PLANK_SHADES[i % PLANK_SHADES.length];
  return new THREE.MeshStandardMaterial({ map: woodTex(c, '#2e1c0d'), roughness: .78, metalness: .04, color: '#ffffff' });
}

function buildCrate(size = 1) {
  const g = new THREE.Group();
  const w = new THREE.MeshStandardMaterial({ map: woodTex('#7a5936', '#3a2413'), roughness: .75 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.1 * size, 1 * size, 1.1 * size), w);
  box.position.y = .5 * size; box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  const slat = mat('#4e3319', { roughness: .8 });
  for (const sy of [.22, .78]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.14 * size, .1 * size, 1.14 * size), slat);
    b.position.y = sy * size; g.add(b);
  }
  return g;
}

function buildBarrel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.46, .40, 1.25, 14),
    new THREE.MeshStandardMaterial({ map: woodTex('#6d472a', '#331f0e'), roughness: .75 }));
  body.position.y = .63; body.castShadow = true;
  g.add(body);
  for (const y of [.28, .98]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(.455, .045, 6, 18), mat('#5a5f66', { metalness: .7, roughness: .4 }));
    hoop.rotation.x = Math.PI / 2; hoop.position.y = y; g.add(hoop);
  }
  return g;
}

function buildBuoy(color: string) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.34, 14, 12), mat(color, { roughness: .55 }));
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.345, .06, 6, 18), mat('#f2ece0', { roughness: .7 }));
  belt.rotation.x = Math.PI / 2;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .55, 5), mat('#c9ad74', { roughness: 1 }));
  rope.position.y = .58;
  g.add(ball, belt, rope);
  ball.castShadow = true;
  return g;
}

/** Filet de pêche tendu entre deux piquets : un plan quadrillé, transparent. */
function buildNet() {
  const t = tex('net', 256, (c, S) => {
    c.clearRect(0, 0, S, S);
    c.strokeStyle = 'rgba(232,224,198,.92)'; c.lineWidth = 3;
    for (let i = 0; i <= 12; i++) {
      const p = (i / 12) * S;
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, S); c.stroke();
      c.beginPath(); c.moveTo(0, p); c.lineTo(S, p); c.stroke();
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.9),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, roughness: 1 }));
  return m;
}

/** Lanterne : la seule source chaude du ponton, elle donne le point de bloom du premier plan. */
function buildLantern() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, 2.6, 8), mat('#3a2f26', { roughness: .8 }));
  post.position.y = 1.3;
  const cage = new THREE.Mesh(new THREE.BoxGeometry(.42, .5, .42), mat('#2b2a28', { roughness: .6, metalness: .4 }));
  cage.position.y = 2.75;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(.3, .38, .3),
    new THREE.MeshBasicMaterial({ color: '#e8ae4e', fog: false }));
  glass.position.y = 2.75; glass.name = 'lamp';
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.34, .26, 4), mat('#2b2a28', { roughness: .6, metalness: .4 }));
  cap.position.y = 3.08; cap.rotation.y = Math.PI / 4;
  g.add(post, cage, glass, cap);
  return g;
}

function buildDock() {
  const g = new THREE.Group();
  // Tablier plein juste sous les planches : sans lui, l'eau turquoise passe entre
  // chaque latte et le ponton se lit comme un néon. Là, l'interstice fait de l'ombre.
  const under = new THREE.MeshStandardMaterial({ color: '#241606', roughness: 1 });
  const deckA = new THREE.Mesh(new THREE.BoxGeometry(15.1, .14, 11.1), under);
  deckA.position.set(0, .43, 6.6);
  const deckB = new THREE.Mesh(new THREE.BoxGeometry(5.1, .14, 9.5), under);
  deckB.position.set(0, .43, -3.6);
  g.add(deckA, deckB);
  // plateforme le long de la plage — planches dans la longueur, teintes mélangées
  for (let i = 0; i < 15; i++) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(.94, .2, 11), plankMat(i * 3 + 1));
    pl.position.set(-7 + i * 1.0, .5, 6.6);
    pl.rotation.z = (Math.random() - .5) * .006;
    pl.castShadow = true; pl.receiveShadow = true;
    g.add(pl);
  }
  // l'avancée sur l'eau — plus longue qu'avant : on se sent VRAIMENT au-dessus du bleu
  for (let i = 0; i < 5; i++) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(.94, .2, 9.4), plankMat(i * 2));
    pl.position.set(-2 + i * 1.0, .5, -3.6);
    pl.castShadow = true; pl.receiveShadow = true;
    g.add(pl);
  }
  // poutres transversales sous le tablier : sans elles, le ponton flotte en l'air
  const beam = new THREE.MeshStandardMaterial({ map: woodTex('#4a3018', '#241206'), roughness: .85 });
  for (const [x, z, w] of [[0, 1.8, 15], [0, 6.6, 15], [0, 11.3, 15], [0, -.6, 5.2], [0, -5, 5.2], [0, -8, 5.2]] as [number, number, number][]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, .26, .5), beam);
    b.position.set(x, .3, z); b.castShadow = true; g.add(b);
  }
  const dark = new THREE.MeshStandardMaterial({ map: woodTex('#4a3018', '#241206'), roughness: .85 });
  const posts: [number, number][] = [
    [-7.1, 1.7], [7.1, 1.7], [-7.1, 6.6], [7.1, 6.6], [-7.1, 11.4], [7.1, 11.4],
    [-2.4, -.6], [2.4, -.6], [-2.4, -4.6], [2.4, -4.6], [-2.4, -8], [2.4, -8],
  ];
  for (const [x, z] of posts) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.21, .27, 4.2, 10), dark);
    post.position.set(x, -1.1, z); post.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.245, .225, .18, 10), dark);
    cap.position.set(x, .99, z);
    // collier de corde en haut du pieu
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.27, .05, 6, 14), mat('#c9ad74', { roughness: 1 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, .84, z);
    g.add(post, cap, ring);
  }
  // corde de garde le long de l'avancée
  const ropeMat = mat('#cbb07a', { roughness: 1 });
  for (const sx of [-2.4, 2.4]) {
    for (const [z0, z1] of [[-.6, -4.6], [-4.6, -8]] as [number, number][]) {
      const len = Math.abs(z1 - z0);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, len, 6), ropeMat);
      r.rotation.x = Math.PI / 2;
      r.position.set(sx, .78, (z0 + z1) / 2);
      g.add(r);
    }
  }
  // bouées accrochées aux pieux du bord
  for (const [x, z, c] of [[-2.4, -2.4, '#e05c5c'], [2.4, -6.2, '#e6b64c'], [-2.4, -6.2, '#3fa8d8']] as [number, number, string][]) {
    const b = buildBuoy(c); b.position.set(x, .35, z); g.add(b);
  }
  // le bazar du pêcheur : caisses, tonneaux, filet, lanternes
  const c1 = buildCrate(1); c1.position.set(-5.6, .6, 3.2); c1.rotation.y = .3;
  const c2 = buildCrate(.8); c2.position.set(-5.2, .6, 4.1); c2.rotation.y = -.5;
  const c3 = buildCrate(1); c3.position.set(5.9, .6, 10.1); c3.rotation.y = .9;
  const b1 = buildBarrel(); b1.position.set(6.1, .6, 3.4);
  const b2 = buildBarrel(); b2.position.set(-6.2, .6, 10.4); b2.rotation.y = 1.1;
  const net = buildNet(); net.position.set(-6.4, 1.7, 7.6); net.rotation.y = Math.PI / 2;
  const l1 = buildLantern(); l1.position.set(-2.4, .6, -.6);
  const l2 = buildLantern(); l2.position.set(2.4, .6, -8);
  g.add(c1, c2, c3, b1, b2, net, l1, l2);
  return g;
}

function buildStall(title: string, color: string, icon: string) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTex('#5c3d1f', '#2b1a0b'), roughness: .65 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.15, 1.4), wood);
  counter.position.y = .58; counter.castShadow = true; counter.receiveShadow = true;
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.5, .14, 1.7), mat('#d9c9a6', { roughness: .6 }));
  top.position.y = 1.2; top.castShadow = true;
  for (const sx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 2.9, 8), wood);
    pole.position.set(sx * 1.62, 1.45, -.5); pole.castShadow = true; g.add(pole);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 2.4, 8), wood);
    back.position.set(sx * 1.62, 1.2, .62); g.add(back);
  }
  // bâche : un vrai auvent incliné, rayé, au lieu de sept barres flottantes
  const stripes = tex(`awn:${color}`, 256, (c, S) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? color : '#f7f1e4';
      c.fillRect((i / 8) * S, 0, S / 8, S);
    }
  });
  const awn = new THREE.Mesh(new THREE.BoxGeometry(3.9, .1, 2.6),
    new THREE.MeshStandardMaterial({ map: stripes, roughness: .92 }));
  awn.position.set(0, 2.82, .05); awn.rotation.x = .2; awn.castShadow = true;
  // frise dentelée au bord de l'auvent
  const frill = new THREE.Mesh(new THREE.BoxGeometry(3.9, .34, .06),
    new THREE.MeshStandardMaterial({ map: stripes, roughness: .92 }));
  frill.position.set(0, 2.66, -1.22);
  const sign = textSprite(`${icon} ${title}`, '#fff6dc', 44);
  sign.scale.set(3.2, .8, 1); sign.position.set(0, 3.5, 0);
  g.add(counter, top, awn, frill, sign);
  return g;
}

function buildBoat() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTex('#7a5230', '#3d2412'), roughness: .6 });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(.85, 3.1, 6, 14), wood);
  hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, .6);
  hull.position.y = .15; hull.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.9, .09, 8, 22), mat('#e6b64c', GOLD));
  rim.rotation.x = Math.PI / 2; rim.position.y = .5; rim.scale.set(2.3, 1, 1);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, .8, 1), mat('#f2ece0', { roughness: .7 }));
  cabin.position.set(-.9, .78, 0); cabin.castShadow = true;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 2.6, 8), wood);
  mast.position.set(.5, 1.5, 0);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(.7, .42), mat('#e05c5c', { side: THREE.DoubleSide, roughness: .9 }));
  flag.position.set(.86, 2.5, 0);
  g.add(hull, rim, cabin, mast, flag);
  g.position.set(5.9, 0, -3.4);
  g.rotation.y = -.35;
  g.name = 'boat';
  return g;
}

// La plage : un disque loin derrière, dont le bord avant dessine la courbe de la crique.
const BEACH_C = 30, BEACH_R = 27;          // centre en z, rayon → rive à z = 3
// Le sable est PLUS HAUT que la mer : à hauteur zéro, la houle passait par-dessus
// et la crique ressemblait à une plage inondée.
const SAND_Y = .34, DECK_Y = .6;
export const SHORE_Z = BEACH_C - BEACH_R;  // 3 : au-delà, c'est l'eau

function buildShore() {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.CircleGeometry(BEACH_R, 64),
    new THREE.MeshStandardMaterial({ map: sandTex(), roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, SAND_Y, BEACH_C);
  sand.receiveShadow = true;
  g.add(sand);
  // sable mouillé : un liseré sombre juste avant l'eau
  const wet = new THREE.Mesh(new THREE.RingGeometry(BEACH_R - 1.7, BEACH_R, 64),
    new THREE.MeshStandardMaterial({ color: '#a8905e', roughness: 1, transparent: true, opacity: .55 }));
  wet.rotation.x = -Math.PI / 2; wet.position.set(0, SAND_Y + .01, BEACH_C);
  g.add(wet);
  // écume : anneau animé posé sur l'eau, à la limite du sable
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(BEACH_R * 2.24, BEACH_R * 2.24),
    new THREE.MeshBasicMaterial({ map: foamTex(), transparent: true, depthWrite: false, opacity: .8 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, SAND_Y - .13, BEACH_C);
  foam.name = 'foam';
  g.add(foam);

  // rochers et palmiers, plantés sur le sable uniquement, jamais sur le ponton
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, r = 6 + rnd() * (BEACH_R - 8);
    const x = Math.cos(a) * r, z = BEACH_C + Math.sin(a) * r;
    if (z < SHORE_Z + 3) continue;                    // pas les pieds dans l'eau
    if (Math.abs(x) < 8.6 && z < 13.6) continue;      // pas sur le ponton
    if (Math.hypot(x - MARKET_POS.x, z - MARKET_POS.z) < 4) continue;
    if (Math.hypot(x - SHOP_POS.x, z - SHOP_POS.z) < 4) continue;
    if (i % 4 === 0) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.5 + rnd() * 1.2),
        mat('#8a8071', { roughness: 1, flatShading: true }));
      rock.position.set(x, SAND_Y + .3, z);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rock.castShadow = true; g.add(rock);
      continue;
    }
    if (i % 7 === 3) {
      // parasol : de la couleur au milieu du sable
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.4, 6), mat('#c9ad74'));
      pole.position.set(x, SAND_Y + 1.2, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, .7, 12),
        new THREE.MeshStandardMaterial({ map: tex('para', 128, (c, S) => {
          for (let k = 0; k < 10; k++) { c.fillStyle = k % 2 ? '#e05c5c' : '#f7f1e4'; c.fillRect((k / 10) * S, 0, S / 10, S); }
        }), roughness: .9 }));
      top.position.set(x, SAND_Y + 2.5, z); top.castShadow = true;
      g.add(pole, top);
      continue;
    }
    const lean = (rnd() - .5) * .3;
    const h = 3.4 + rnd() * 2.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.15, .26, h, 8), mat('#6b4a2a', { roughness: .95 }));
    trunk.position.set(x, SAND_Y + h / 2, z); trunk.rotation.z = lean;
    trunk.castShadow = true;
    g.add(trunk);
    const tipX = x + Math.sin(lean) * -h * .5, tipY = h;
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.40, 2.6, 4), mat(k % 2 ? '#3f8a4a' : '#357a41', { roughness: .85 }));
      const la = (k / 7) * Math.PI * 2 + rnd();
      leaf.position.set(tipX + Math.cos(la) * 1.0, SAND_Y + tipY - .1, z + Math.sin(la) * 1.0);
      leaf.rotation.set(Math.PI / 2.25, 0, -la);
      leaf.castShadow = true;
      g.add(leaf);
    }
    const coco = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), mat('#4a3520'));
    coco.position.set(tipX + .2, SAND_Y + tipY - .25, z + .1);
    g.add(coco);
  }
  // --- le fond de la crique : falaises et cocoteraie, sinon le sable finit dans le ciel
  const cliff = new THREE.MeshStandardMaterial({ color: '#7e7363', roughness: 1, flatShading: true });
  const cliffTop = new THREE.MeshStandardMaterial({ color: '#3d7a4a', roughness: 1, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * (.08 + (i / 17) * .84);          // arc arrière uniquement
    const r = BEACH_R - 2 + rnd() * 3;
    const x = Math.cos(a) * r, z = BEACH_C + Math.sin(a) * r;
    const h = 6 + rnd() * 7;
    const m = new THREE.Mesh(new THREE.ConeGeometry(3.4 + rnd() * 2.6, h, 6, 1), cliff);
    m.position.set(x, SAND_Y + h * .34, z);
    m.rotation.y = rnd() * 3; m.scale.set(1, 1, .75);
    g.add(m);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.1 + rnd(), 8, 6), cliffTop);
    cap.position.set(x, SAND_Y + h * .64, z); cap.scale.y = .45;
    g.add(cap);
  }
  return g;
}

// ---------- avatars ----------
function buildAvatar(name: string, color: string, hat: number, mine: boolean) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.25, .3, 6, 14), mat(color, { roughness: .5 }));
  body.position.y = .52; body.name = 'body'; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.26, 16, 14), mat('#f0d9b5', { roughness: .65 }));
  head.position.y = 1.02; head.name = 'head'; head.castShadow = true;
  g.add(body, head);
  if (hat) {
    const h = new THREE.Group();
    const col = hat === 2 ? '#e6b64c' : hat === 5 ? '#ffe9a8' : '#2c2438';
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .05, 14), mat(col, { roughness: .6 }));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.2, .22, .26, 14), mat(col, { roughness: .6 }));
    top.position.y = .15;
    h.add(brim, top); h.position.y = 1.24; h.name = 'hat';
    g.add(h);
  }
  // canne à pêche tenue devant
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.02, .035, 1.7, 6), mat('#8a6a3a', { roughness: .7 }));
  rod.position.set(.3, .95, .28); rod.rotation.set(-.9, 0, -.35); rod.name = 'rod';
  g.add(rod);
  const tag = textSprite((mine ? '★ ' : '') + name, mine ? '#ffe9a8' : '#fff');
  tag.position.y = 1.85; tag.scale.set(2, .5, 1);
  g.add(tag);
  return g;
}

export function setPlayers(players: any[], youId: string) {
  myId = youId;
  const seen = new Set<string>();
  for (const p of players) {
    seen.add(p.id);
    let a = avatars.get(p.id);
    if (!a) {
      const mine = p.id === youId;
      a = { g: buildAvatar(p.name, SKIN_COLORS[(p.color ?? 0) % 8], p.hat ?? 0, mine), target: new THREE.Vector3(p.x, 0, p.z), mine, moving: 0 };
      a.g.position.set(p.x, 0, p.z);
      scene.add(a.g); avatars.set(p.id, a);
    }
    if (!a.mine) a.target.set(p.x, 0, p.z);
    a.g.visible = p.connected !== false;
  }
  for (const [id, a] of avatars) if (!seen.has(id)) { scene.remove(a.g); avatars.delete(id); }
}
/** Position IMPOSÉE par le serveur, y compris pour soi : c'est lui qui décide
 *  quand on se fait arracher et quand on tombe. Le client ne discute pas. */
export function forcePos(id: string, x: number, z: number, splashy = false) {
  const a = avatars.get(id); if (!a) return;
  a.target.set(x, a.target.y, z);
  if (a.mine) {
    if (splashy) a.g.position.set(x, a.g.position.y, z);
    else a.g.position.lerp(new THREE.Vector3(x, a.g.position.y, z), .6);
  }
  if (splashy) splash(new THREE.Vector3(x, .2, z), true);
}

/** À l'eau : l'avatar flotte, penché, jusqu'à ce qu'on le repêche. */
export function setSoaked(id: string, on: boolean) {
  const a = avatars.get(id); if (!a) return;
  a.soaked = on;
  a.g.rotation.z = on ? .5 : 0;
}

export function setRemotePos(id: string, x: number, z: number) {
  const a = avatars.get(id); if (a && !a.mine) a.target.set(x, 0, z);
}
export function setMoveInput(x: number, z: number) { input.set(x, z); }
export function getMyPos() {
  const a = avatars.get(myId);
  return a ? { x: a.g.position.x, z: a.g.position.z } : null;
}
/** Le joueur est-il au bord de l'eau ? On ne pêche pas depuis la plage. */
export function atWater() {
  const p = getMyPos();
  return !!p && p.z < DOCK_Z - .2;     // il faut être sur l'avancée, au-dessus du bleu
}
export function nearMarket() {
  const p = getMyPos(); if (!p) return false;
  return Math.hypot(p.x - MARKET_POS.x, p.z - MARKET_POS.z) < 3.2;
}
export function nearShop() {
  const p = getMyPos(); if (!p) return false;
  return Math.hypot(p.x - SHOP_POS.x, p.z - SHOP_POS.z) < 3.2;
}

// ---------- ligne et bouchon ----------
const BOB_GEO = new THREE.SphereGeometry(.14, 12, 10);
function ensureLine(a: Avatar) {
  if (a.bob) return;
  const bob = new THREE.Mesh(BOB_GEO, mat('#e05c5c', { emissive: '#e05c5c', emissiveIntensity: .6 }));
  const top = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), mat('#f5f0e6'));
  top.position.y = .12; bob.add(top);
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#e9f4ff', transparent: true, opacity: .75 }));
  a.bob = bob; a.line = line;
  scene.add(bob, line);
}
function dropLine(a: Avatar) {
  if (a.bob) { scene.remove(a.bob); a.bob = undefined; }
  if (a.line) { scene.remove(a.line); a.line = undefined; }
}

/** Position du bouchon : distance du lancer, puis tension du combat. */
const bobState = new Map<string, { dist: number; target: number; fighting: boolean; jerk: number }>();
export function castTo(id: string, dist: number) {
  bobState.set(id, { dist: 1, target: 4 + dist * 12, fighting: false, jerk: 0 });
  const a = avatars.get(id); if (a) ensureLine(a);
}
export function setFight(id: string, tension: number, distance: number, surge: number) {
  const b = bobState.get(id);
  if (!b) { bobState.set(id, { dist: 8, target: 2 + distance * .14, fighting: true, jerk: surge }); return; }
  b.fighting = true; b.target = 2 + distance * .14; b.jerk = surge;
}
export function endLine(id: string) {
  bobState.delete(id);
  const a = avatars.get(id); if (a) dropLine(a);
}

// ---------- effets ----------
export function splash(at: THREE.Vector3, big = false) {
  const m = new THREE.Mesh(new THREE.RingGeometry(.1, .3, 18),
    new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.copy(at).setY(.08);
  m.userData.big = big ? 3.4 : 1.6;
  scene.add(m); splashes.push({ m, born: tNow });
}
export function floatText(at: THREE.Vector3, text: string, color = '#fff') {
  const sp = textSprite(text, color, 46);
  sp.position.copy(at).add(new THREE.Vector3(0, 1.8, 0));
  scene.add(sp);
  floaters.push({ sp, born: tNow, from: sp.position.clone() });
}
export function bump(v = 1) { shake = Math.min(2.4, shake + v); }
export function bobberAt(id: string): THREE.Vector3 | null {
  const a = avatars.get(id);
  return a?.bob ? a.bob.position.clone() : null;
}

/** Hauteur du sol : le tablier du ponton, ou le sable. Sans ça, les joueurs
 *  marchent les genoux dans les planches. */
export function groundY(x: number, z: number) {
  if (Math.abs(x) <= 2.5 && z >= -8.2 && z <= DOCK_Z + .3) return DECK_Y;
  if (Math.abs(x) <= 7.4 && z >= DOCK_Z - .3 && z <= 12.1) return DECK_Y;
  return SAND_Y;
}

/** Sol praticable : l'avancée, la plateforme du ponton, ou le sable de la crique.
 *  Tout le reste, c'est de l'eau — et on ne marche pas sur l'eau. */
export function walkable(x: number, z: number) {
  if (Math.abs(x) > WORLD_R || z > WORLD_R) return false;
  if (Math.abs(x) <= 2.4 && z >= -8.0 && z <= DOCK_Z + .2) return true;      // l'avancée
  if (Math.abs(x) <= 7.3 && z >= DOCK_Z - .2 && z <= 12.0) return true;      // la plateforme
  return Math.hypot(x, z - BEACH_C) <= BEACH_R - .6;                         // le sable
}

// ---------- boucle ----------
export function initFishScene(cv: HTMLCanvasElement) {
  canvas = cv;
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .5;
  pmrem.dispose();
  // la brume porte la couleur de l'horizon : c'est elle qui efface le bord de la nappe d'eau
  scene.fog = new THREE.Fog('#bcd4dd', 40, 132);

  camera = new THREE.PerspectiveCamera(58, 1, .1, 400);

  const sun = new THREE.DirectionalLight('#ffeac2', 2.5);
  sun.position.set(-16, 24, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 80;
  sc.updateProjectionMatrix();
  scene.add(sun, new THREE.AmbientLight('#c8dcf2', .55));
  // contre-jour venu du soleil : c'est lui qui découpe les silhouettes sur l'eau
  const rim = new THREE.DirectionalLight('#ffd08a', .5);
  rim.position.set(-6, 6, -60);
  scene.add(rim);

  scene.add(buildSky(), buildSun(), buildHorizon());
  gulls = buildGulls();
  scene.add(gulls);

  // La nappe : large en x, profonde jusqu'à l'horizon, le dégradé de la texture
  // fait la profondeur (turquoise devant la plage → bleu de nuit au large).
  const wt = waterTex(); wt.repeat.set(6, 1); wt.wrapT = THREE.ClampToEdgeWrapping;
  seaGeo = new THREE.PlaneGeometry(420, 170, 60, 70);
  const wn = waterNorm(); wn.repeat.set(44, 18);
  sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({
    // Le relief fin casse le reflet du soleil : sans lui, la nappe est un miroir
    // parfait et le soleil s'y imprime en grosse tache blanche.
    map: wt, normalMap: wn, normalScale: new THREE.Vector2(.45, .45),
    roughness: .42, metalness: .25,
  }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0, -55);
  sea.receiveShadow = true;
  scene.add(sea);

  scene.add(buildShore(), buildDock(), buildBoat());
  const market = buildStall('MARCHÉ', '#e05c5c', '🐟'); market.position.copy(MARKET_POS); market.position.y = SAND_Y; market.rotation.y = .5;
  const shop = buildStall('ÉQUIPEMENT', '#3fa8d8', '🎣'); shop.position.copy(SHOP_POS); shop.position.y = SAND_Y; shop.rotation.y = -.5;
  scene.add(market, shop);
  foam = scene.getObjectByName('foam') as THREE.Mesh;

  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'low' || q === 'high') { quality = q; qualityLocked = true; }
  if (quality === 'low') applyLow(); else buildComposer();

  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(tick);
}

function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // seuil haut : seuls le soleil, la lanterne et le phare débordent
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .22, .40, .985);
  composer.addPass(bloom);
  composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  composer.setSize(innerWidth, innerHeight);
}

function applyLow() {
  quality = 'low';
  composer = null; bloom = null;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(1);
  scene.traverse(o => { const m = o as THREE.Mesh; if ((m as any).isMesh) { m.castShadow = false; m.receiveShadow = false; } });
}
function watchFps(now: number) {
  if (qualityLocked || quality === 'low') return;
  if (!fpsStart) { fpsStart = now; fpsFrames = 0; return; }
  fpsFrames++;
  const el = now - fpsStart;
  if (el > 2000) { qualityLocked = true; if (fpsFrames / (el / 1000) < 24) applyLow(); }
}
export function fishQuality() { return quality; }

/** Sonde de mise au point : position, cap de la caméra, nombre d'objets. */
export function fishDebug() {
  const me = avatars.get(myId);
  const d = new THREE.Vector3(); camera?.getWorldDirection(d);
  return {
    pos: me ? { x: +me.g.position.x.toFixed(2), z: +me.g.position.z.toFixed(2) } : null,
    face: { x: +faceX.toFixed(2), z: +faceZ.toFixed(2) },
    cam: { x: +camera.position.x.toFixed(2), z: +camera.position.z.toFixed(2) },
    look: { x: +d.x.toFixed(2), z: +d.z.toFixed(2) },
    moving: me ? +me.moving.toFixed(2) : null, rot: me ? +me.g.rotation.y.toFixed(2) : null,
    quality, objets: scene.children.length,
  };
}

function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerHeight > innerWidth ? 66 : 56;
  camera.updateProjectionMatrix();
  composer?.setSize(innerWidth, innerHeight);
}

function tick(now: number) {
  tNow = now;
  watchFps(now);
  const dt = Math.min(.12, (now - lastT) / 1000 || .016);
  lastT = now;

  // --- houle : on déforme la nappe, c'est ce qui donne vie à toute la scène ---
  // La nappe est immense (420 × 170) : à fréquence constante, les vagues du large
  // tomberaient entre deux sommets et scintilleraient. On calme donc la houle avec
  // la distance, et on n'en met vraiment que devant le ponton.
  const pos = seaGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const wz = -55 - y;                                   // y local → z monde
    const near = Math.max(0, 1 - Math.abs(wz - 2) / 55);  // 1 devant le ponton, 0 au large
    const amp = .07 + near * near * .26;   // plafonnée sous SAND_Y
    const h = Math.sin(x * .09 + now / 900) * amp
            + Math.sin(y * .13 - now / 1150) * amp * .8
            + Math.sin((x + y) * .05 + now / 1600) * amp * .55;
    pos.setZ(i, h);
  }
  pos.needsUpdate = true;
  seaGeo.computeVertexNormals();

  // écume du rivage : elle respire, la crique n'est plus un décollage de gommettes
  if (foam) {
    const b = 1 + Math.sin(now / 1500) * .012;
    foam.scale.set(b, b, 1);
    (foam.material as THREE.MeshBasicMaterial).opacity = .62 + Math.sin(now / 1100) * .16;
  }
  // mouettes
  if (gulls) for (const sp of gulls.children) {
    const u = sp.userData as any;
    u.a += u.sp * dt;
    sp.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(u.a * 2.3) * 1.2, -6 + Math.sin(u.a) * u.r * .8);
  }

  // --- déplacement du joueur ---
  const me = avatars.get(myId);
  if (me && !me.soaked) {
    const len = input.length();
    if (len > .05) {
      const dir = input.clone().normalize();
      const total = WALK * walkScale * Math.min(1, len) * dt;
      const p = me.g.position;
      // On glisse le long des obstacles au lieu de se bloquer net : si la diagonale
      // tombe à l'eau, on tente chaque axe séparément.
      const nx = p.x + dir.x * total, nz = p.z + dir.y * total;
      if (walkable(nx, nz)) { p.x = nx; p.z = nz; }
      else if (walkable(nx, p.z)) p.x = nx;
      else if (walkable(p.x, nz)) p.z = nz;
      me.g.rotation.y = Math.atan2(dir.x, dir.y) + Math.PI;
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
    const gy = a.soaked ? -.28 + Math.sin(now / 420) * .09 : groundY(a.g.position.x, a.g.position.z);
    a.g.position.y += (gy - a.g.position.y) * Math.min(1, dt * 12);
    if (a.soaked) a.g.position.lerp(a.target, Math.min(1, dt * 3));
    const b = a.g.getObjectByName('body'), h = a.g.getObjectByName('head'), ht = a.g.getObjectByName('hat');
    const bob = Math.abs(Math.sin(now / 100)) * .07 * a.moving;
    if (b) b.position.y = .52 + bob;
    if (h) h.position.y = 1.02 + bob;
    if (ht) ht.position.y = 1.24 + bob;
  }

  // --- bouchons et lignes ---
  for (const [id, st] of bobState) {
    const a = avatars.get(id);
    if (!a || !a.bob || !a.line) continue;
    st.dist += (st.target - st.dist) * Math.min(1, dt * (st.fighting ? 3.2 : 2.2));
    const fwd = new THREE.Vector3(Math.sin(a.g.rotation.y + Math.PI), 0, Math.cos(a.g.rotation.y + Math.PI));
    const p = a.g.position.clone().addScaledVector(fwd, st.dist);
    const wob = st.fighting ? Math.sin(now / 90) * .12 * (1 + st.jerk) : Math.sin(now / 420 + st.dist) * .06;
    a.bob.position.set(p.x, .12 + wob, p.z);
    const tip = a.g.position.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(fwd, .9);
    (a.line.geometry as THREE.BufferGeometry).setFromPoints([tip, a.bob.position]);
    (a.line.material as THREE.LineBasicMaterial).color.set(st.fighting && st.jerk > .8 ? '#ffd0d0' : '#e9f4ff');
  }

  // --- éclaboussures et textes flottants ---
  splashes = splashes.filter(s => {
    const age = (now - s.born) / 1000;
    const k = age / .9;
    if (k >= 1) { scene.remove(s.m); return false; }
    s.m.scale.setScalar(1 + k * s.m.userData.big);
    (s.m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    return true;
  });
  floaters = floaters.filter(f => {
    const age = (now - f.born) / 1000;
    if (age > 1.6) { scene.remove(f.sp); return false; }
    f.sp.position.copy(f.from).add(new THREE.Vector3(0, age * .9, 0));
    (f.sp.material as THREE.SpriteMaterial).opacity = age > 1 ? 1 - (age - 1) / .6 : 1;
    return true;
  });

  // --- caméra : derrière le joueur, dans SON dos ---
  // Elle regardait toujours le large : en marchant vers la plage on ne voyait plus
  // que la nuque du bonhomme et les étals passaient hors champ. Elle pivote donc
  // doucement derrière la direction de marche.
  const fp = me ? me.g.position : new THREE.Vector3(0, 0, 6);
  if (me && me.moving > .2) {
    // On interpole l'ANGLE, pas le vecteur : en lissant deux vecteurs opposés puis
    // en renormalisant, la caméra restait collée à son cap d'origine (demi-tour = 0).
    let d = (me.g.rotation.y + Math.PI) - camYaw;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    camYaw += d * (1 - Math.pow(.02, dt));
  }
  faceX = Math.sin(camYaw); faceZ = Math.cos(camYaw);
  const want = new THREE.Vector3(fp.x - faceX * 8.5, 5.4, fp.z - faceZ * 8.5);
  camera.position.lerp(want, 1 - Math.pow(.002, dt));
  if (shake > .01) {
    camera.position.x += (Math.random() - .5) * .18 * shake;
    camera.position.y += (Math.random() - .5) * .12 * shake;
    shake *= Math.pow(.02, dt);
  }
  camera.lookAt(new THREE.Vector3(fp.x + faceX * 4, 1.1, fp.z + faceZ * 4));

  if (composer) composer.render(); else renderer.render(scene, camera);
}

/** Libère tout : contexte WebGL compris. Appelé en quittant le jeu. */
export function teardownFish() {
  if (!renderer) return;
  renderer.setAnimationLoop(null);
  removeEventListener('resize', resize);
  scene.traverse(o => {
    const m = o as THREE.Mesh & { material?: any; geometry?: any };
    m.geometry?.dispose?.();
    const mm = m.material;
    const drop = (x: any) => { if (x?.map && !x.map.userData?.shared) x.map.dispose?.(); x?.dispose?.(); };
    if (Array.isArray(mm)) mm.forEach(drop); else if (mm) drop(mm);
  });
  renderer.dispose();
  composer = null; bloom = null;
  avatars.clear(); bobState.clear(); floaters = []; splashes = [];
  canvas = null;
}
