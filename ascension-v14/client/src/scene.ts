// ============================================================
// Monde 3D — boutique, 4 machines par étage, avatars
// personnalisables. La 3D EST l'interface.
// ============================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FLOORS, floorAt, CARD_NAMES, SKIN_COLORS, type FloorDef, type MachineDef } from '../../shared/content';

const ARENA_R = 16.5;
const NEAR_M = 3.5;      // machines
const NEAR_S = 3.6;      // boutique
const WALK = 5.9;      // la salle est grande : on marche plus vite

export const MACHINE_SPOTS = [
  new THREE.Vector3(-11.08, 0, -3.08),
  new THREE.Vector3(-8.09, 0, -8.18),
  new THREE.Vector3(-2.96, 0, -11.11),
  new THREE.Vector3(2.96, 0, -11.11),
  new THREE.Vector3(8.09, 0, -8.18),
  new THREE.Vector3(11.08, 0, -3.08),
];
export const SHOP_POS = new THREE.Vector3(-10.6, 0, 2.2);
const YAWS = [0.45, 0.27, 0.09, -0.09, -0.27, -0.45];

export type Spot = { kind: 'MACHINE'; index: number } | { kind: 'SHOP' };

let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera;
let composer: EffectComposer | null = null, bloom: UnrealBloomPass | null = null;
let ground: THREE.Mesh, accentLight: THREE.PointLight, keyLight: THREE.DirectionalLight, flashLight: THREE.PointLight;
let propsGroup: THREE.Group, marker: THREE.Mesh;
let propSolids: { p: THREE.Vector3; r: number }[] = [];   // obstacles du décor (bar, colonnes, canapés)
let machineRoots: THREE.Group[] = [];
let shopRoot: THREE.Group;
let currentFloor = 0, shake = 0, tNow = 0;
let cine = false;          // caméra de l'écran-titre : travelling lent autour du casino

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
let mineTiles: THREE.Mesh[] = [];
let mineFx: { i: number; bomb: boolean; at: number }[] = [];
let racePawns: THREE.Group[] = [];
let raceRun = { active: false, start: 0, dur: 0, order: [] as number[] };
let plinkoBalls: THREE.Mesh[] = [];
interface PDrop { path: number[]; slot: number; start: number; dur: number; done: boolean }
let plinkoDrops: PDrop[] = [];

// ---------- avatars ----------
interface Avatar { g: THREE.Group; target: THREE.Vector3; mine: boolean; moving: number }
const avatars = new Map<string, Avatar>();
let myId = '';
const input = new THREE.Vector2(0, 0);

export function setMoveInput(x: number, z: number) { input.set(x, z); }
/** Écran-titre : caméra en orbite, pas de marqueur de proximité. */
export function setCinematic(on: boolean) { cine = on; }
/** Sonde de performance. On compte la SCÈNE et non renderer.info : depuis l'ajout du halo,
 *  la dernière passe est un simple rectangle plein écran et masquerait tout le reste. */
export function gfxInfo() {
  let meshes = 0, triangles = 0;
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (!(m as any).isMesh || !m.visible) return;
    meshes++;
    const gg: any = m.geometry;
    const n = gg?.index ? gg.index.count : (gg?.attributes?.position?.count ?? 0);
    triangles += Math.round(n / 3);
  });
  return { meshes, triangles, mem: { ...renderer.info.memory } };
}
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

/** Active les ombres portées sur tout un décor. Le mur et le plafond ne PROJETTENT pas :
 *  la lumière-clé vient du dessus, un plafond opaque plongerait la salle dans le noir. */
function shade(root: THREE.Object3D) {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!(m as any).isMesh) return;
    m.receiveShadow = true;
    m.castShadow = !m.userData.noShadow;
  });
}

/** Libère la mémoire GPU d'un décor retiré (aucun matériau n'est partagé : mat() en crée un par appel). */
function disposeTree(root: THREE.Object3D) {
  const drop = (x: any) => {
    // les textures procédurales sont MUTUALISÉES entre les étages : les libérer ici
    // les rendrait noires au prochain changement d'étage.
    if (x?.map && !x.map.userData?.shared) x.map.dispose?.();
    if (x?.alphaMap && !x.alphaMap.userData?.shared) x.alphaMap.dispose?.();
    x?.dispose?.();
  };
  root.traverse(o => {
    const m = o as THREE.Mesh & { material?: any; geometry?: any };
    m.geometry?.dispose?.();
    const mm = m.material;
    if (Array.isArray(mm)) mm.forEach(drop); else if (mm) drop(mm);
  });
}

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

// ---------- vocabulaire visuel commun à TOUTES les machines ----------
// ============================================================
//  TEXTURES PROCÉDURALES — dessinées au canvas, aucun fichier à charger.
//  C'est ce qui sépare une maquette de cubes colorés d'une vraie salle.
// ============================================================
const texCache = new Map<string, THREE.CanvasTexture>();

function canvasTex(key: string, size: number, draw: (c: CanvasRenderingContext2D, S: number) => void,
                   repeat: [number, number] = [1, 1], srgb = true): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;          // mutualisée : ne jamais la libérer au changement d'étage
  texCache.set(key, t);
  return t;
}

/** Moquette de casino : fond profond, damier losangé et fleurons, grain de laine. */
function carpetTex(base: string, accent: string, gold = '#a8842f') {
  return canvasTex(`carpet:${base}:${accent}`, 512, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    // losanges
    c.strokeStyle = gold; c.lineWidth = S * .008; c.globalAlpha = .22;
    for (let i = -1; i < 3; i++) {
      c.beginPath();
      c.moveTo(S * i * .5, 0); c.lineTo(S * (i * .5 + .5), S);
      c.moveTo(S * (i * .5 + .5), 0); c.lineTo(S * i * .5, S);
      c.stroke();
    }
    // fleurons aux croisements
    c.globalAlpha = .34;
    for (const [fx, fy] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75], [.5, .5], [0, 0], [1, 0], [0, 1], [1, 1]]) {
      const x = fx * S, y = fy * S, r = S * .042;
      c.fillStyle = accent;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        c.beginPath();
        c.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * .5, r * .19, a, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = .5; c.fillStyle = gold;
      c.beginPath(); c.arc(x, y, r * .3, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .34;
    }
    // grain de laine
    c.globalAlpha = .12;
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = i % 2 ? '#000' : '#fff';
      c.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
    }
    c.globalAlpha = 1;
  }, [26, 26]);
}

/** Tenture murale : bandes verticales, motif damassé, dégradé du sol au plafond. */
function wallTex(base: string, accent: string) {
  return canvasTex(`wall:${base}:${accent}`, 512, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    // bandes larges alternées
    c.globalAlpha = .07; c.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i += 2) c.fillRect((i / 8) * S, 0, S / 16, S);
    // damas : petits motifs en quinconce
    c.globalAlpha = .12; c.fillStyle = accent;
    for (let ry = 0; ry < 8; ry++) {
      for (let rx = 0; rx < 8; rx++) {
        const x = (rx + (ry % 2 ? .5 : 0)) * (S / 8), y = ry * (S / 8), r = S / 34;
        c.beginPath();
        c.moveTo(x, y - r * 1.7);
        c.quadraticCurveTo(x + r * 1.5, y, x, y + r * 1.7);
        c.quadraticCurveTo(x - r * 1.5, y, x, y - r * 1.7);
        c.fill();
      }
    }
    // salissure douce
    c.globalAlpha = .1;
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = i % 3 ? '#000' : '#fff';
      c.fillRect(Math.random() * S, Math.random() * S, 2.4, 2.4);
    }
    c.globalAlpha = 1;
  }, [9, 2]);
}

/** Marbre veiné : plans de bar, socles, bordure de piste. */
function marbleTex(base: string, vein: string) {
  return canvasTex(`marble:${base}:${vein}`, 512, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = vein;
      c.globalAlpha = .1 + Math.random() * .3;
      c.lineWidth = .4 + Math.random() * 2.4;
      c.beginPath();
      let x = Math.random() * S, y = -10;
      c.moveTo(x, y);
      while (y < S + 10) { x += (Math.random() - .5) * 46; y += 14 + Math.random() * 20; c.lineTo(x, y); }
      c.stroke();
    }
    c.globalAlpha = .07;
    for (let i = 0; i < 4000; i++) { c.fillStyle = '#000'; c.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6); }
    c.globalAlpha = 1;
  }, [3, 3]);
}

/** Bois verni : mobilier, comptoirs, caissons de machines. */
function woodTex(base = '#4a2f1c', dark = '#2c1a0e') {
  return canvasTex(`wood:${base}`, 512, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = dark;
      c.globalAlpha = .06 + Math.random() * .22;
      c.lineWidth = .5 + Math.random() * 2.6;
      c.beginPath();
      let y = Math.random() * S;
      c.moveTo(0, y);
      for (let x = 0; x <= S; x += 26) { y += (Math.random() - .5) * 7; c.lineTo(x, y); }
      c.stroke();
    }
    c.globalAlpha = 1;
  }, [2, 2]);
}

/** Dégradé vertical : opaque en haut, transparent en bas — masque d'opacité des faisceaux. */
function beamAlpha() {
  return canvasTex('beam', 128, (c, S) => {
    const grd = c.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#ffffff');       // près de la source : dense
    grd.addColorStop(.5, '#3a3a3a');
    grd.addColorStop(1, '#000000');       // au sol : le faisceau s'est dissous
    c.fillStyle = grd; c.fillRect(0, 0, S, S);
  }, [1, 1], false);
}

/** Velours : rugueux, avec un moiré léger — pour les banquettes et les cordons. */
function velvetTex(base: string) {
  return canvasTex(`velvet:${base}`, 256, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 12000; i++) {
      c.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)';
      c.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    }
  }, [3, 3]);
}

const GOLD = { metalness: .88, roughness: .2 };
const CHROME = { metalness: .95, roughness: .12 };

/** Podium : estrade de marbre, plinthe dorée et liseré néon. Partagé par les 30 machines,
 *  c'est la pièce qui donne à toute la salle son unité de matière. */
function podium(f: FloorDef, r = 1.9, h = .34): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r + .22, h, 32),
    new THREE.MeshStandardMaterial({ map: marbleTex('#171320', '#8a7ba8'), roughness: .18, metalness: .45 }));
  base.position.y = h / 2;
  // dessus : marbre poli, il attrape le projecteur
  const top = new THREE.Mesh(new THREE.CircleGeometry(r, 32),
    new THREE.MeshStandardMaterial({ map: marbleTex('#1d1728', '#a394c4'), roughness: .1, metalness: .6 }));
  top.rotation.x = -Math.PI / 2; top.position.y = h + .002;
  // plinthe dorée
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(r + .19, .07, 10, 40), mat('#e6b64c', GOLD));
  skirt.rotation.x = Math.PI / 2; skirt.position.y = .07;
  const trim = new THREE.Mesh(new THREE.TorusGeometry(r + .02, .05, 10, 40),
    mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: 2.4, metalness: .5 }));
  trim.rotation.x = Math.PI / 2; trim.position.y = h + .02; trim.userData.noShadow = true;
  // tapis d'approche autour de l'estrade
  const rug = new THREE.Mesh(new THREE.RingGeometry(r + .24, r + .95, 40),
    new THREE.MeshStandardMaterial({ map: velvetTex('#4a1622'), roughness: .98 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = .014;
  g.add(rug, base, top, skirt, trim);
  return g;
}

/** Enseigne lumineuse : panneau + montants, au-dessus de la machine. */
function signPost(text: string, f: FloorDef, y = 4.5): THREE.Group {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, .62, .12),
    mat('#0e0c15', { emissive: f.theme.accent, emissiveIntensity: .1, metalness: .3, roughness: .5 }));
  panel.position.y = y;
  // cadre doré : l'enseigne devient un objet, pas une étiquette flottante
  for (const [w, h2, dy] of [[2.72, .1, .38], [2.72, .1, -.38]] as [number, number, number][]) {
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(w, h2, .18), mat('#e6b64c', GOLD));
    bar2.position.y = y + dy; g.add(bar2);
  }
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(.1, .86, .18), mat('#e6b64c', GOLD));
    side.position.set(sx * 1.31, y, 0); g.add(side);
  }
  // ampoules de chapiteau, comme un fronton de music-hall
  for (let i = 0; i < 9; i++) {
    const bx = -1.16 + i * .29;
    for (const dy of [.38, -.38]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6),
        mat('#fff3cf', { emissive: '#ffe9a8', emissiveIntensity: 4.2 }));
      bulb.position.set(bx, y + dy, .12); bulb.userData.noShadow = true;
      g.add(bulb);
    }
  }
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, y - 3.4, 10), mat('#c9a24a', GOLD));
    post.position.set(sx * 1.1, 3.4 + (y - 3.4) / 2, 0);
    g.add(post);
  }
  const label = textSprite(text, f.theme.light, 40);
  label.scale.set(2.25, .56, 1);
  label.position.set(0, y, .1);
  g.add(panel, label);
  return g;
}

function nameSprite(t: string, f: FloorDef, y = 4.4) {
  return signPost(t, f, y);
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
      a = { g: buildAvatar(p.name, SKIN_COLORS[(p.color ?? 0) % 8], p.hat ?? 0, mine), target: new THREE.Vector3(p.x, 0, p.z), mine, moving: 0 };
      a.g.position.set(p.x, 0, p.z);
      shade(a.g); scene.add(a.g); avatars.set(p.id, a);
    }
    a.g.visible = p.connected || p.id === youId;
    if (p.id !== youId) a.target.set(p.x, 0, p.z);
  }
}
export function setRemotePos(id: string, x: number, z: number) {
  const a = avatars.get(id);
  if (a && !a.mine) a.target.set(x, 0, z);
}

/** Bulle de réaction au-dessus d'un joueur (2 s, suit l'avatar). */
export function showEmote(id: string, emoji: string) {
  const a = avatars.get(id);
  if (!a) return;
  const old = a.g.getObjectByName('emote');
  if (old) a.g.remove(old);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const x = c.getContext('2d')!;
  x.beginPath(); x.arc(64, 60, 52, 0, Math.PI * 2);
  x.fillStyle = 'rgba(20,17,26,.88)'; x.fill();
  x.lineWidth = 5; x.strokeStyle = '#e6b64c'; x.stroke();
  x.font = '58px -apple-system, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emoji, 64, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, depthTest: false,
  }));
  sp.name = 'emote';
  sp.scale.set(.8, .8, 1);
  sp.position.set(0, 2.25, 0);
  sp.userData.born = tNow;
  a.g.add(sp);
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
  g.add(podium(f, 1.8));
  const segs = d.wheel!.segments; segMults = segs.map(s => s.mult);
  const N = segs.length;
  // colonne sculptée + contreforts
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.42, .72, 1.5, 10), mat('#241c28', { roughness: .6 }));
  base.position.y = 1.05;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .16, 12), mat('#e6b64c', GOLD));
  collar.position.y = 1.78;
  g.add(base, collar);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + .5;
    const strut = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.1, .12), mat('#1c1520'));
    strut.position.set(Math.cos(a) * .6, .75, Math.sin(a) * .6);
    strut.rotation.z = Math.cos(a) * .22; strut.rotation.x = -Math.sin(a) * .22;
    g.add(strut);
  }
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
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, .34, 20), mat('#e6b64c', GOLD));
  hub.rotation.x = Math.PI / 2; wheelDisc.add(hub);
  // rayons métalliques entre le moyeu et la jante
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.45, .045, .04), mat('#cfd4dd', CHROME));
    spoke.position.set(Math.cos(a) * .76, Math.sin(a) * .76, .05);
    spoke.rotation.z = a;
    wheelDisc.add(spoke);
  }
  wheelDisc.add(new THREE.Mesh(new THREE.TorusGeometry(1.54, .1, 12, 44), mat('#e6b64c', GOLD)));
  wheelDisc.add(new THREE.Mesh(new THREE.TorusGeometry(1.3, .035, 8, 40), mat('#241c28', { metalness: .5 })));
  // picots entre chaque segment (le repère les frappe en tournant)
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const peg = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 8), mat('#ffe9a8', CHROME));
    peg.position.set(Math.cos(a) * 1.48, Math.sin(a) * 1.48, .1);
    wheelDisc.add(peg);
  }
  wheelDisc.position.y = 2.35; g.add(wheelDisc);
  // repère articulé + potence
  const arm = new THREE.Mesh(new THREE.BoxGeometry(.09, .55, .09), mat('#2a2436', CHROME));
  arm.position.set(0, 4.28, .12);
  const ptr = new THREE.Mesh(new THREE.ConeGeometry(.17, .5, 4), mat('#ffe9a8', { emissive: '#8a6a1e', emissiveIntensity: .6 }));
  ptr.position.set(0, 3.95, .12); ptr.rotation.x = Math.PI;
  const spot = new THREE.PointLight(f.theme.light, 22, 7);
  spot.position.set(0, 4.4, 1.2);
  g.add(arm, ptr, spot, nameSprite(d.name, f, 5.1));
  return g;
}

function buildCrash(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  // le gouffre sous les planches : un trou noir qui fait peur
  const pit = new THREE.Mesh(new THREE.BoxGeometry(1.9, .06, 5.6),
    new THREE.MeshBasicMaterial({ color: '#040306' }));
  pit.position.set(0, .03, -2.2);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, .09, 8, 24),
    mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: .35 }));
  rim.rotation.x = -Math.PI / 2; rim.position.set(0, .05, -2.2);
  rim.scale.set(.72, 1.9, 1);
  g.add(pit, rim);
  // portique massif + haubans
  const pL = new THREE.Mesh(new THREE.BoxGeometry(.22, 3.8, .22), mat('#241c28', CHROME));
  pL.position.set(-.8, 1.9, .5);
  const pR = pL.clone(); pR.position.x = .8;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, .22, .22), mat('#241c28', CHROME));
  beam.position.set(0, 3.75, .5);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 10),
    mat('#e05c5c', { emissive: '#e05c5c', emissiveIntensity: .9 }));
  lamp.position.set(0, 3.95, .5);
  g.add(pL, pR, beam, lamp);
  for (const sx of [-1, 1]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 3.4, 6), mat('#5a5468'));
    cable.position.set(sx * .8, 2.1, -1.2);
    cable.rotation.x = .42;
    g.add(cable);
  }
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
  // petit sac à dos : on voit ce qu'il transporte
  const pack = new THREE.Mesh(new THREE.BoxGeometry(.22, .22, .14), mat('#e6b64c', GOLD));
  pack.position.set(0, .45, .17);
  runner.add(body, eL, eR, pack); runner.position.set(0, 1.4, .2);
  g.add(runner, nameSprite(d.name, f, 5.1));
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

  g.add(podium(f, 1.75));
  // meuble : socle évasé + corps + fronton
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.95, 1.15, .5, 12), mat('#191320'));
  foot.position.y = .55;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 1.05), mat('#2a1f33', { roughness: .55 }));
  body.position.y = 1.9;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.26, .5, 1.1), mat(f.theme.accent, { roughness: .5 }));
  belly.position.y = 1.08;
  // moulures dorées sur les flancs
  for (const sx of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 2.2, 10), mat('#e6b64c', GOLD));
    pil.position.set(sx * 1.14, 1.9, .5);
    g.add(pil);
  }
  const crown = new THREE.Mesh(new THREE.BoxGeometry(2.4, .75, 1.15), mat('#1c1520'));
  crown.position.y = 3.35;
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(1.9, .42, .06), mat(f.theme.light, { emissive: f.theme.accent, emissiveIntensity: .5 }));
  marquee.position.set(0, 3.35, .59);
  g.add(foot, body, belly, crown, marquee);

  // ampoules du fronton (clignotent à la victoire)
  slotBulbs = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 10),
      mat('#ffe9a8', { emissive: '#8a6a1e', emissiveIntensity: .5 }));
    b.position.set(-.85 + i * .283, 3.8, .35);
    g.add(b); slotBulbs.push(b);
  }

  // vitre + cadre doré autour des rouleaux
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.15, .04),
    new THREE.MeshStandardMaterial({ color: '#0b0910', transparent: true, opacity: .35, roughness: .1 }));
  glass.position.set(0, 2.35, .56);
  const frameT = new THREE.Mesh(new THREE.BoxGeometry(2.05, .1, .12), mat('#e6b64c', gold));
  frameT.position.set(0, 2.96, .58);
  const frameB = frameT.clone(); frameB.position.y = 1.74;
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.32, .12), mat('#e6b64c', gold));
  frameL.position.set(-1, 2.35, .58);
  const frameR = frameL.clone(); frameR.position.x = 1;
  g.add(glass, frameT, frameB, frameL, frameR);

  // ligne de paiement
  const payline = new THREE.Mesh(new THREE.BoxGeometry(2.1, .03, .02), mat('#e05c5c', { emissive: '#e05c5c', emissiveIntensity: .7 }));
  payline.position.set(0, 2.35, .62);
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
    drum.position.set(-.6 + dd * .6, 2.35, .3);
    g.add(drum);
    drums.push({ g: drum, stopAt: 0, target: 0, spinning: false, vel: 0 });
  }

  // bras latéral
  const armBase = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 10), mat('#e6b64c', gold));
  armBase.position.set(1.22, 2.2, 0);
  slotLever = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .8, 8), mat('#cfd4dd', { metalness: .7, roughness: .3 }));
  rod.position.y = .4;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 12), mat('#e05c5c', { roughness: .35 }));
  knob.position.y = .82;
  slotLever.add(rod, knob);
  slotLever.position.set(1.22, 2.2, 0);
  g.add(armBase, slotLever);

  // bac à monnaie
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.5, .14, .55), mat('#1c1520'));
  tray.position.set(0, .9, .72);
  const trayLip = new THREE.Mesh(new THREE.BoxGeometry(1.55, .1, .08), mat('#e6b64c', GOLD));
  trayLip.position.set(0, .98, .98);
  g.add(tray, trayLip, nameSprite(d.name, f, 5.1));
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
  g.add(podium(f, 1.85));
  // table en fer à cheval, tapis feutré, boudin de cuir
  const table = new THREE.Mesh(new THREE.CylinderGeometry(1.05, .8, 1, 16, 1, false, -Math.PI * .1, Math.PI * 1.2),
    mat('#241c28', { roughness: .6 }));
  table.position.y = .85;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.05, .12, 20, 1, false, -Math.PI * .1, Math.PI * 1.2),
    mat('#1f6b45', { roughness: .95 }));
  felt.position.y = 1.4;
  const bumper = new THREE.Mesh(new THREE.TorusGeometry(1.18, .09, 10, 26, Math.PI * 1.2), mat('#3a2a20', { roughness: .5 }));
  bumper.rotation.x = Math.PI / 2; bumper.rotation.z = -Math.PI * .1; bumper.position.y = 1.46;
  g.add(table, felt, bumper);
  // sabot à cartes
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(.42, .3, .58), mat('#2a2436', CHROME));
  shoe.position.set(.78, 1.6, .18); shoe.rotation.z = -.22;
  g.add(shoe);
  // jetons empilés sur le tapis
  for (let k = 0; k < 5; k++) {
    const chip = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .035, 16),
      mat(k % 2 ? '#e05c5c' : '#f5f0e6', { roughness: .4 }));
    chip.position.set(-.72, 1.48 + k * .036, .3);
    g.add(chip);
  }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 356;
  cardCtx = cv.getContext('2d')!; cardTex = new THREE.CanvasTexture(cv); drawCard('?');
  cardMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.53),
    new THREE.MeshStandardMaterial({ map: cardTex, roughness: .5, side: THREE.DoubleSide }));
  cardMesh.position.set(0, 2.7, 0); cardMesh.rotation.x = -.12;
  const glow = new THREE.PointLight(f.theme.light, 16, 5);
  glow.position.set(0, 2.7, 1);
  g.add(cardMesh, glow, nameSprite(d.name, f, 5.1));
  return g;
}

function buildRoulette(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  g.add(podium(f, 2.0));
  // cuvette en bois + pied tourné
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(.34, .62, 1.1, 12), mat('#3a2a20', { roughness: .55 }));
  foot.position.y = .9;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.2, .5, 28), mat('#3a2a20', { roughness: .5 }));
  bowl.position.y = 1.65;
  g.add(foot, bowl);

  const N = 25;
  const disc = new THREE.Group();
  for (let i = 0; i < N; i++) {
    const col = i === 0 ? '#1f8a4c' : (i % 2 ? '#b33636' : '#15111c');
    const seg = new THREE.Mesh(new THREE.CircleGeometry(1.3, 10, (i / N) * Math.PI * 2, Math.PI * 2 / N),
      new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: .45 }));
    disc.add(seg);
    // séparateur métallique entre chaque case
    const a = (i / N) * Math.PI * 2;
    const fret = new THREE.Mesh(new THREE.BoxGeometry(1.28, .028, .07), mat('#cfd4dd', CHROME));
    fret.position.set(Math.cos(a) * .66, Math.sin(a) * .66, .04);
    fret.rotation.z = a;
    disc.add(fret);
  }
  // tourelle centrale à croisillons
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(.16, .3, .5, 12), mat('#e6b64c', GOLD));
  turret.rotation.x = Math.PI / 2; turret.position.z = .2;
  disc.add(turret);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.9, .05, .05), mat('#e6b64c', GOLD));
    bar.rotation.z = (i / 4) * Math.PI; bar.position.z = .32;
    disc.add(bar);
  }
  disc.rotation.x = -Math.PI / 2; disc.position.y = 1.95; g.add(disc);

  // piste extérieure + déflecteurs en losange
  const track = new THREE.Mesh(new THREE.TorusGeometry(1.46, .12, 12, 44), mat('#e6b64c', GOLD));
  track.rotation.x = Math.PI / 2; track.position.y = 1.98; g.add(track);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const def = new THREE.Mesh(new THREE.OctahedronGeometry(.09), mat('#cfd4dd', CHROME));
    def.position.set(Math.cos(a) * 1.05, 2.02, Math.sin(a) * 1.05);
    g.add(def);
  }
  rouletteBall = new THREE.Mesh(new THREE.SphereGeometry(.085, 12, 12), mat('#f5f0e6', { roughness: .12, metalness: .3 }));
  rouletteBall.position.set(1.1, 2.06, 0); g.add(rouletteBall);

  // petit tapis de mise devant, rouge / noir / vert
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.1, .05, .9), mat('#1f6b45', { roughness: .95 }));
  cloth.position.set(0, .38, 1.75); cloth.rotation.x = -.12;
  g.add(cloth);
  ['#b33636', '#15111c', '#1f8a4c'].forEach((c, i) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(.6, .03, .62), mat(c, { roughness: .6 }));
    box.position.set(-.68 + i * .68, .42, 1.75); box.rotation.x = -.12;
    g.add(box);
  });
  const lamp = new THREE.PointLight(f.theme.light, 20, 6);
  lamp.position.set(0, 3.1, .6);
  g.add(lamp, nameSprite(d.name, f, 5.1));
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
  g.add(podium(f, 1.95));
  // table demi-lune, tapis vert, boudin de cuir, sabot et râtelier
  const table = new THREE.Mesh(new THREE.CylinderGeometry(1.25, .95, 1, 22, 1, false, 0, Math.PI),
    mat('#241c28', { roughness: .6 }));
  table.position.y = .85; table.rotation.y = -Math.PI / 2;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.25, .12, 24, 1, false, 0, Math.PI),
    mat('#1f6b45', { roughness: .95 }));
  felt.position.y = 1.4; felt.rotation.y = -Math.PI / 2;
  const bump = new THREE.Mesh(new THREE.TorusGeometry(1.4, .1, 10, 28, Math.PI), mat('#3a2a20', { roughness: .5 }));
  bump.rotation.x = Math.PI / 2; bump.rotation.z = Math.PI / 2; bump.position.y = 1.46;
  g.add(table, felt, bump);
  // arc « le croupier tire à 17 » peint sur le tapis
  const arc = new THREE.Mesh(new THREE.TorusGeometry(.92, .022, 8, 28, Math.PI), mat('#ffe9a8', { emissive: '#5a4310', emissiveIntensity: .3 }));
  arc.rotation.x = -Math.PI / 2; arc.rotation.z = Math.PI / 2; arc.position.y = 1.47;
  g.add(arc);
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(.44, .32, .6), mat('#2a2436', CHROME));
  shoe.position.set(-.95, 1.62, -.35); shoe.rotation.z = .2;
  const rack = new THREE.Mesh(new THREE.BoxGeometry(.9, .1, .34), mat('#1c1520'));
  rack.position.set(.9, 1.5, -.35);
  g.add(shoe, rack);
  for (let k = 0; k < 6; k++) {
    const chip = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .03, 16),
      mat(['#e05c5c', '#4aa8dc', '#f5f0e6'][k % 3], { roughness: .4 }));
    chip.position.set(.62 + (k % 3) * .28, 1.57 + Math.floor(k / 3) * .032, -.35);
    g.add(chip);
  }
  [bjPCtx, bjPTex] = bjCanvas(); [bjDCtx, bjDTex] = bjCanvas();
  const pc = new THREE.Mesh(new THREE.PlaneGeometry(.95, 1.32),
    new THREE.MeshStandardMaterial({ map: bjPTex, roughness: .5, side: THREE.DoubleSide }));
  pc.position.set(-.62, 2.55, .1); pc.rotation.x = -.14;
  const dc = new THREE.Mesh(new THREE.PlaneGeometry(.78, 1.08),
    new THREE.MeshStandardMaterial({ map: bjDTex, roughness: .5, side: THREE.DoubleSide }));
  dc.position.set(.66, 2.42, .1); dc.rotation.x = -.14;
  const lamp2 = new THREE.PointLight(f.theme.light, 16, 5.5);
  lamp2.position.set(0, 3, 1);
  g.add(pc, dc, lamp2, nameSprite(d.name, f, 5.1));
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
  g.add(podium(f, 1.9));
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.7), mat('#241c28', { roughness: .6 }));
  table.position.y = .9;
  const felt = new THREE.Mesh(new THREE.BoxGeometry(2.2, .1, 1.5), mat('#1f6b45', { roughness: .95 }));
  felt.position.y = 1.5;
  g.add(table, felt);
  // parois hautes façon craps (les dés rebondissent dedans)
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(.12, .5, 1.5), mat('#3a2a20', { roughness: .5 }));
    w.position.set(sx * 1.16, 1.75, 0);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(.16, .08, 1.55), mat('#e6b64c', GOLD));
    cap.position.set(sx * 1.16, 2.02, 0);
    g.add(w, cap);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, .5, .12), mat('#3a2a20', { roughness: .5 }));
  back.position.set(0, 1.75, -.79);
  const backCap = new THREE.Mesh(new THREE.BoxGeometry(2.45, .08, .16), mat('#e6b64c', GOLD));
  backCap.position.set(0, 2.02, -.79);
  g.add(back, backCap);
  // zones de pari peintes : SOUS 7 / 7 / SUR 7
  [['#4aa8dc', -.72], ['#e6b64c', 0], ['#c95f8a', .72]].forEach(([c, x]) => {
    const zone = new THREE.Mesh(new THREE.BoxGeometry(.62, .03, .5), mat(c as string, { roughness: .7 }));
    zone.position.set(x as number, 1.56, .42);
    g.add(zone);
  });
  const mats = [1, 6, 2, 5, 3, 4].map(diceFace);
  dice = [-.35, .35].map(x => {
    const dd = new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .42), mats);
    dd.position.set(x, 1.78, -.2); g.add(dd); return dd;
  });
  const lamp3 = new THREE.PointLight(f.theme.light, 16, 5.5);
  lamp3.position.set(0, 3, .8);
  g.add(lamp3, nameSprite(d.name, f, 5.1));
  return g;
}

/** MINES — une console à 25 dalles inclinée vers le joueur. */
function buildMines(f: FloorDef, d: MachineDef): THREE.Group {
  const g = new THREE.Group();
  g.add(podium(f, 2.05));
  // caisson incliné
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, .55, 2.5), mat('#221c2e', { roughness: .6 }));
  body.position.set(0, 1.35, 0); body.rotation.x = -.34;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(3.34, .12, 2.64), mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: .5, metalness: .6 }));
  rim.position.set(0, 1.08, .05); rim.rotation.x = -.34;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.1), mat('#171320'));
  pillar.position.y = .82;
  g.add(pillar, rim, body);

  mineTiles = [];
  const tile = new THREE.BoxGeometry(.44, .12, .44);
  for (let i = 0; i < 25; i++) {
    const col = i % 5, row = Math.floor(i / 5);
    const t = new THREE.Mesh(tile, mat('#3b3350', { roughness: .55, metalness: .25 }));
    // les rangs du fond montent : la grille entière reste lisible depuis la caméra
    t.position.set((col - 2) * .55, 1.72 + (2 - row) * .17, .82 - row * .46);
    t.rotation.x = -.34;
    t.userData.base = t.position.y;
    mineTiles.push(t); g.add(t);
  }
  // trois charges factices posées sur le rebord, pour dire le danger
  for (let k = 0; k < 3; k++) {
    const bomb = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), mat('#15121c', { metalness: .7, roughness: .3 }));
    bomb.position.set(-1.85 + k * .01, 1.62, 1.05 + k * .34);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .18, 6), mat('#e05c5c', { emissive: '#e05c5c', emissiveIntensity: .8 }));
    fuse.position.copy(bomb.position).add(new THREE.Vector3(0, .16, 0));
    g.add(bomb, fuse);
  }
  g.add(signPost(d.name, f, 4.6));
  return g;
}

/** COURSE — une piste à 4 couloirs, portique d'arrivée et 4 pions. */
function buildRace(f: FloorDef, d: MachineDef): THREE.Group {
  const g = new THREE.Group();
  g.add(podium(f, 2.05));
  // la piste est un plateau incliné vers la caméra : sinon les pions se chevauchent
  const track = new THREE.Group();
  track.position.set(0, 1.45, .1);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.5, .3, 2.3), mat('#1d1828', { roughness: .8 }));
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.3), mat('#171320'));
  legs.position.y = .75;
  g.add(legs, track); track.add(deck);

  const LANES = [-.78, -.26, .26, .78];
  for (let l = 0; l < 4; l++) {
    const lane = new THREE.Mesh(new THREE.BoxGeometry(3.2, .04, .4),
      mat(l % 2 ? '#2a2338' : '#332b44', { roughness: .9 }));
    lane.position.set(0, .17, LANES[l]);
    track.add(lane);
  }
  // ligne de départ et portique d'arrivée
  const start = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, 1.9), mat('#f0edf5'));
  start.position.set(-1.5, .21, 0);
  const finish = new THREE.Mesh(new THREE.BoxGeometry(.08, .06, 1.9), mat('#e6b64c', { emissive: '#e6b64c', emissiveIntensity: .6 }));
  finish.position.set(1.5, .21, 0);
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1.1, 8), mat('#e6b64c', GOLD));
    post.position.set(1.5, .74, sz * .98);
    track.add(post);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(.14, .14, 2.1), mat('#e6b64c', GOLD));
  arch.position.set(1.5, 1.28, 0);
  track.add(start, finish, arch);

  racePawns = [];
  const cols = ['#e6b64c', '#4aa8dc', '#e05c5c', '#5cb46e'];
  for (let l = 0; l < 4; l++) {
    const pawn = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.17, .26, 6, 10), mat(cols[l], { roughness: .45 }));
    body.position.y = .3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), mat('#f4e6c8'));
    head.position.y = .66;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .06, 10), mat(cols[l], { emissive: cols[l], emissiveIntensity: .4 }));
    cap.position.y = .78;
    pawn.add(body, head, cap);
    pawn.position.set(-1.5, .19, LANES[l]);
    pawn.userData.lane = LANES[l];
    racePawns.push(pawn); track.add(pawn);
  }
  g.add(signPost(d.name, f, 4.6));
  return g;
}

function buildChests(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  g.add(podium(f, 2.05));
  // établi d'orfèvre incliné vers le joueur
  const table = new THREE.Mesh(new THREE.BoxGeometry(3.1, .5, 2.3), mat('#3a2a20', { roughness: .55 }));
  table.position.set(0, 1.3, 0);
  table.rotation.x = -.32;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(3.2, .1, 2.4), mat('#e6b64c', GOLD));
  edge.position.set(0, 1.06, .04); edge.rotation.x = -.32;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 1), mat('#191320'));
  legs.position.y = .8;
  g.add(legs, table, edge);
  // outils posés sur le côté : marteau et burin
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(.34, .1, .1), mat('#5a5468', CHROME));
  hammer.position.set(-1.32, 1.62, .62); hammer.rotation.set(-.32, .3, 0);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .42, 8), mat('#6b4a2a'));
  handle.position.set(-1.1, 1.55, .72); handle.rotation.set(-.32, 0, 1.35);
  g.add(hammer, handle);

  chestMeshes = []; chestLids = []; chestGems = [];
  for (let i = 0; i < 9; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const holder = new THREE.Group();
    // le rang du fond est plus haut : la grille se lit en entier depuis la caméra
    holder.position.set((col - 1) * .82, 1.65 + (1 - row) * .30, .55 - row * .62);

    const box = new THREE.Mesh(new THREE.BoxGeometry(.6, .34, .46), mat(f.theme.accent, { roughness: .7 }));
    (box.material as THREE.MeshStandardMaterial).color.offsetHSL(0, -.08, -.14);
    box.position.y = .17;
    const band = new THREE.Mesh(new THREE.BoxGeometry(.63, .07, .49), mat('#e6b64c', { metalness: .8, roughness: .25 }));
    band.position.y = .17;
    // ferrures aux quatre coins + serrure
    for (const [cx, cz] of [[-.26, -.19], [.26, -.19], [-.26, .19], [.26, .19]]) {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 8), mat('#e6b64c', GOLD));
      stud.position.set(cx, .3, cz);
      holder.add(stud);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(.1, .12, .05), mat('#e6b64c', GOLD));
    lock.position.set(0, .2, .24);
    holder.add(lock);
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
  chestBeam.position.set(0, 2.8, 0);
  g.add(chestBeam, nameSprite(d.name, f, 5.1));
  return g;
}

function buildPlinko(f: FloorDef, d: MachineDef) {
  const g = new THREE.Group();
  g.add(podium(f, 2.0));
  const mults = d.plinko!.mults;

  // caisson : fond sombre, cadre doré, vitre
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.9, .16), mat('#0f0d16', { roughness: .9 }));
  board.position.y = 2.55;
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(.14, 4, .3), mat('#e6b64c', GOLD));
  frameL.position.set(-1.6, 2.55, .06);
  const frameR = frameL.clone(); frameR.position.x = 1.6;
  const frameT = new THREE.Mesh(new THREE.BoxGeometry(3.35, .14, .3), mat('#e6b64c', GOLD));
  frameT.position.set(0, 4.5, .06);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.8, .03),
    new THREE.MeshStandardMaterial({ color: '#8fd8ff', transparent: true, opacity: .1, roughness: .05 }));
  glass.position.set(0, 2.55, .2);
  g.add(board, frameL, frameR, frameT, glass);

  // entonnoir de lâcher, en haut
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(.34, .16, .4, 14, 1, true),
    mat('#cfd4dd', { ...CHROME, side: THREE.DoubleSide }));
  funnel.position.set(0, 4.3, .12);
  g.add(funnel);

  // picots : rangées en quinconce, légèrement lumineux
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c <= r; c++) {
      const peg = new THREE.Mesh(new THREE.SphereGeometry(.062, 10, 10),
        mat(f.theme.light, { emissive: f.theme.accent, emissiveIntensity: .45, metalness: .4 }));
      peg.position.set((c - r / 2) * .36, 3.85 - r * .37, .13);
      g.add(peg);
    }
  }

  // cases de réception : couleur et hauteur selon le gain
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * .36;
    const m = mults[i];
    const hot = m >= 4, mid = m >= 1;
    const col = hot ? '#e6b64c' : mid ? f.theme.accent : '#3a3145';
    const slot = new THREE.Mesh(new THREE.BoxGeometry(.33, hot ? .34 : .24, .3),
      mat(col, hot ? { emissive: '#5a4310', emissiveIntensity: .6, metalness: .5 } : { roughness: .7 }));
    slot.position.set(x, .82, .13);
    // séparateurs entre les cases
    const sep = new THREE.Mesh(new THREE.BoxGeometry(.035, .42, .32), mat('#cfd4dd', CHROME));
    sep.position.set(x - .18, .9, .13);
    const lab = textSprite('×' + m, hot ? '#ffe9a8' : '#c9c2d6', 42);
    lab.scale.set(.34, .11, 1); lab.material.depthTest = true;
    lab.position.set(x, .55, .3);
    g.add(slot, sep, lab);
  }
  const lastSep = new THREE.Mesh(new THREE.BoxGeometry(.035, .42, .32), mat('#cfd4dd', CHROME));
  lastSep.position.set(4 * .36 + .18, .9, .13);
  g.add(lastSep);

  // pool de billes : jusqu'à 5 en vol simultané
  plinkoBalls = [];
  for (let b = 0; b < 5; b++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.115, 14, 14),
      mat('#f5f0e6', { roughness: .12, metalness: .35, emissive: '#2a2436' }));
    ball.visible = false;
    g.add(ball);
    plinkoBalls.push(ball);
  }
  const lamp = new THREE.PointLight(f.theme.light, 20, 7);
  lamp.position.set(0, 3.4, 1.2);
  g.add(lamp, nameSprite(d.name, f, 5.4));
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
// ============================================================
//  DÉCOR — la salle est un vrai casino : moquette, colonnes, bar,
//  salon, cordons de velours, lustre, puis l'ambiance de l'étage.
// ============================================================

/** Projecteur de plafond braqué sur une machine, avec son faisceau visible.
 *  C'est ce qui crée les flaques de lumière : sans elles, tout est uniformément éclairé. */
function spotOver(f: FloorDef, p: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const y = 9.2;
  const light = new THREE.SpotLight(f.theme.light, 260, 22, 0.44, 0.55, 1.7);
  light.position.set(p.x, y, p.z);
  light.target.position.set(p.x, 1.2, p.z);
  g.add(light, light.target);
  // corps du projecteur
  const can = new THREE.Mesh(new THREE.CylinderGeometry(.26, .34, .55, 12), mat('#1a1622', { metalness: .6, roughness: .35 }));
  can.position.set(p.x, y + .3, p.z);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(.26, 16),
    mat(f.theme.light, { emissive: f.theme.light, emissiveIntensity: 5 }));
  lens.rotation.x = -Math.PI / 2; lens.position.set(p.x, y, p.z); lens.userData.noShadow = true;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.4, 6), mat('#2a2436'));
  rod.position.set(p.x, y + 1.2, p.z);
  // faisceau : cône translucide, additif — il donne l'atmosphère enfumée
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.9, y - 1, 28, 1, true),
    new THREE.MeshBasicMaterial({
      color: f.theme.light, transparent: true, opacity: .11,
      alphaMap: beamAlpha(),
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
    }));
  beam.renderOrder = 3;
  beam.position.set(p.x, 1 + (y - 1) / 2, p.z);
  beam.userData.noShadow = true;
  g.add(can, lens, rod, beam);
  return g;
}

/** Colonne cannelée à chapiteau lumineux. */
function column(f: FloorDef, x: number, z: number, h = 7.4): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.42, .48, h, 16),
    new THREE.MeshStandardMaterial({ map: marbleTex('#2b2437', '#9d8fc0'), roughness: .22, metalness: .3 }));
  shaft.position.y = h / 2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.62, .7, .5, 12), mat('#1d1828'));
  base.position.y = .25;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.7, .58, .45, 12), mat('#e6b64c', GOLD));
  cap.position.y = h - .2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.55, .06, 8, 20),
    mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: .8 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = h - .75;
  g.add(shaft, base, cap, ring);
  g.position.set(x, 0, z);
  return g;
}

/** Comptoir de bar : plan de travail, arrière-bar garni, tabourets. */
function bar(f: FloorDef, x: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.15, 1.3),
    new THREE.MeshStandardMaterial({ map: woodTex('#3d2617', '#1d1108'), roughness: .4, metalness: .15 }));
  body.position.y = .58;
  const top = new THREE.Mesh(new THREE.BoxGeometry(6.8, .16, 1.6),
    new THREE.MeshStandardMaterial({ map: marbleTex('#1d1826', '#b9a7d8'), roughness: .1, metalness: .55 }));
  top.position.y = 1.22;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(6.4, .08, .1), mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: .6 }));
  foot.position.set(0, .18, .72);
  const back = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, .3),
    new THREE.MeshStandardMaterial({ map: woodTex('#2e1c11', '#160c06'), roughness: .35, metalness: .2 }));
  back.position.set(0, 1.6, -1.1);
  // panneau lumineux derrière les bouteilles : le bar devient le point chaud de la salle
  const glowBack = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.5, .06),
    mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: 3.2 }));
  glowBack.position.set(0, 2.5, -.99); glowBack.userData.noShadow = true;
  g.add(glowBack);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(6, .1, .5), mat('#3a3145'));
  shelf.position.set(0, 2.1, -.9);
  const shelf2 = shelf.clone(); shelf2.position.y = 2.75;
  g.add(body, top, foot, back, shelf, shelf2);
  // bouteilles : deux rangées, couleurs de l'étage
  for (let i = 0; i < 16; i++) {
    const h = .26 + Math.random() * .22;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.045, .075, h, 7),
      mat(i % 3 === 0 ? f.theme.accent : i % 3 === 1 ? '#8ad6b0' : '#d98a5a',
        { roughness: .25, metalness: .3, emissive: f.theme.accent, emissiveIntensity: .12 }));
    b.position.set(-2.7 + (i % 8) * .72, (i < 8 ? 2.15 : 2.8) + h / 2, -.9);
    g.add(b);
  }
  // tabourets côté salle
  for (let i = 0; i < 4; i++) {
    const st = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .16, 14),
      new THREE.MeshStandardMaterial({ map: velvetTex('#7c2530'), roughness: .95 }));
    seat.position.y = .82;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, .82, 8), mat('#4a4358', CHROME));
    pole.position.y = .41;
    st.add(seat, pole);
    st.position.set(-2.3 + i * 1.55, 0, 1.5);
    g.add(st);
  }
  g.position.set(x, 0, z); g.rotation.y = yaw;
  propSolids.push({ p: new THREE.Vector3(x, 0, z), r: 2.4 });
  return g;
}

/** Coin salon : banquette d'angle et table basse éclairée. */
function lounge(f: FloorDef, x: number, z: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  const velvet = new THREE.MeshStandardMaterial({ map: velvetTex('#7a2b38'), roughness: .96, metalness: .02 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, .45, 1.2), velvet);
  seat.position.y = .45;
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, .9, .3), velvet);
  back.position.set(0, .9, -.6);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(3.2, .25, 1), mat('#1d1828'));
  legs.position.y = .13;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(.62, .5, .12, 16),
    new THREE.MeshStandardMaterial({ map: marbleTex('#241d2e', '#c0aee0'), roughness: .1, metalness: .5 }));
  table.position.set(0, .55, 1.5);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.1, .22, .5, 10), mat('#2b2437'));
  stem.position.set(0, .28, 1.5);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10),
    mat(f.theme.light, { emissive: f.theme.light, emissiveIntensity: 1.1 }));
  lamp.position.set(0, .78, 1.5);
  g.add(legs, seat, back, stem, table, lamp);
  g.position.set(x, 0, z); g.rotation.y = yaw;
  propSolids.push({ p: new THREE.Vector3(x, 0, z), r: 1.7 });
  return g;
}

/** Cordon de velours entre deux poteaux : balise l'allée centrale. */
function ropeLine(f: FloorDef, x1: number, z1: number, x2: number, z2: number, n = 3): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, 1, 8), mat('#e6b64c', GOLD));
    post.position.set(x, .5, z);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.11, 10, 8), mat('#e6b64c', GOLD));
    knob.position.set(x, 1.05, z);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.26, .3, .08, 12), mat('#2b2437'));
    foot.position.set(x, .04, z);
    g.add(post, knob, foot);
    pts.push(new THREE.Vector3(x, .82, z));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, len, 8),
      new THREE.MeshStandardMaterial({ map: velvetTex('#8c2f3a'), roughness: .95 }));
    rope.position.copy(a).lerp(b, .5).setY(.76);
    rope.rotation.z = Math.PI / 2;
    rope.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    g.add(rope);
  }
  return g;
}

/** Lustre central : anneau doré et bougies lumineuses. */
function chandelier(f: FloorDef): THREE.Group {
  const g = new THREE.Group();
  for (const [r, y] of [[2.6, 8.2], [1.7, 9.0]] as [number, number][]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .07, 8, 34), mat('#e6b64c', GOLD));
    ring.rotation.x = Math.PI / 2; ring.position.y = y;
    g.add(ring);
    const n = Math.round(r * 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8),
        mat(f.theme.light, { emissive: f.theme.light, emissiveIntensity: 1.4 }));
      bulb.position.set(Math.cos(a) * r, y + .2, Math.sin(a) * r);
      g.add(bulb);
    }
  }
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 3, 6), mat('#3a3145'));
  cord.position.y = 10.5;
  g.add(cord);
  g.position.set(0, 0, -2);
  return g;
}

/** Enceinte de la salle : mur circulaire + plinthe lumineuse. */
function walls(f: FloorDef): THREE.Group {
  const g = new THREE.Group();
  const R = ARENA_R + 1.6;
  const wc = new THREE.Color(f.theme.fog); wc.offsetHSL(0, -.22, .045);
  const ac = new THREE.Color(f.theme.accent); ac.offsetHSL(0, -.1, -.05);
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex('#' + wc.getHexString(), '#' + ac.getHexString()),
    roughness: .92, metalness: .04, side: THREE.BackSide,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 11, 56, 1, true), wallMat);
  wall.userData.noShadow = true;
  wall.position.y = 5.5;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R - .05, R - .05, .5, 56, 1, true),
    mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: .8, side: THREE.BackSide }));
  skirt.position.y = .25; skirt.userData.noShadow = true;
  const crown = new THREE.Mesh(new THREE.TorusGeometry(R - .1, .12, 8, 60), mat('#e6b64c', GOLD));
  crown.rotation.x = Math.PI / 2; crown.position.y = 8.2;
  g.add(wall, skirt, crown);

  // soubassement de marbre : le bas du mur ne doit pas être la même matière que le haut
  const wainscot = new THREE.Mesh(new THREE.CylinderGeometry(R - .12, R - .12, 2.2, 56, 1, true),
    new THREE.MeshStandardMaterial({
      map: marbleTex('#221a2c', '#6d5f86'), roughness: .28, metalness: .25, side: THREE.BackSide,
    }));
  wainscot.position.y = 1.1; wainscot.userData.noShadow = true;
  const wainTop = new THREE.Mesh(new THREE.TorusGeometry(R - .14, .1, 8, 60), mat('#e6b64c', GOLD));
  wainTop.rotation.x = Math.PI / 2; wainTop.position.y = 2.2;
  g.add(wainscot, wainTop);

  // pilastres de bois verni + applique lumineuse : c'est la lumière qui donne l'échelle
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: .45, metalness: .12 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const cx = Math.cos(a) * (R - .18), cz = Math.sin(a) * (R - .18);
    const pil = new THREE.Mesh(new THREE.BoxGeometry(.7, 8.6, .26), woodMat);
    pil.position.set(cx, 4.3, cz); pil.rotation.y = -a;
    g.add(pil);
    // applique : coupe dorée + halo (le bloom s'en charge)
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(.3, .12, .42, 12, 1, true), mat('#e6b64c', GOLD));
    cup.position.set(Math.cos(a) * (R - .55), 4.6, Math.sin(a) * (R - .55));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 10),
      mat(f.theme.light, { emissive: f.theme.light, emissiveIntensity: 6 }));
    glow.position.copy(cup.position).setY(4.78);
    glow.userData.noShadow = true;
    g.add(cup, glow);
  }
  // plafond : la salle doit être fermée pour ressembler à une salle
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(R, 56), mat('#15111d', { roughness: 1, side: THREE.DoubleSide }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 11;
  ceil.userData.noShadow = true;
  const ceilRing = new THREE.Mesh(new THREE.TorusGeometry(R * .55, .1, 8, 50), mat('#e6b64c', GOLD));
  ceilRing.rotation.x = Math.PI / 2; ceilRing.position.y = 10.9;
  g.add(ceil, ceilRing);
  return g;
}

/** Moquette : médaillon central et anneaux, aux couleurs de l'étage. */
function carpet(f: FloorDef): THREE.Group {
  const g = new THREE.Group();
  const cb = new THREE.Color('#3d101c').lerp(new THREE.Color(f.theme.ground), .28);
  const ca = new THREE.Color(f.theme.accent).offsetHSL(0, -.3, -.26);
  const base = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R - 2.2, 64),
    new THREE.MeshStandardMaterial({
      map: carpetTex('#' + cb.getHexString(), '#' + ca.getHexString()),
      roughness: .99, metalness: 0,
    }));
  base.rotation.x = -Math.PI / 2; base.position.y = .02; base.receiveShadow = true;
  // anneau de marbre poli entre la moquette et le mur : il reflète les néons
  const border = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 2.2, ARENA_R + 1.4, 72),
    new THREE.MeshStandardMaterial({
      map: marbleTex('#2a2233', '#8d7fae'), roughness: .12, metalness: .5,
    }));
  border.rotation.x = -Math.PI / 2; border.position.y = .015; border.receiveShadow = true;
  g.add(border, base);
  for (const [r, w] of [[7.2, .5], [5.4, .3], [3.2, .22]] as [number, number][]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 60), mat('#7a5a24', { roughness: .95 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .03;
    g.add(ring);
  }
  // médaillon central : un disque doré cerclé de la couleur de l'étage
  // médaillon : marbre noir incrusté, double cerclage doré, liseré à la couleur de l'étage
  const medal = new THREE.Mesh(new THREE.CircleGeometry(2.55, 48),
    new THREE.MeshStandardMaterial({ map: marbleTex('#151120', '#a08b52'), roughness: .1, metalness: .65 }));
  medal.rotation.x = -Math.PI / 2; medal.position.y = .034; medal.receiveShadow = true;
  const ring1 = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.75, 48), mat('#e6b64c', GOLD));
  ring1.rotation.x = -Math.PI / 2; ring1.position.y = .036;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.9, 2.98, 48),
    mat(f.theme.accent, { emissive: f.theme.accent, emissiveIntensity: 1.4 }));
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = .036; ring2.userData.noShadow = true;
  // rayons dorés incrustés dans le marbre
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(.09, 1.9), mat('#c9a24a', GOLD));
    ray.rotation.x = -Math.PI / 2; ray.rotation.z = -a;
    ray.position.set(Math.cos(a) * 1.5, .037, Math.sin(a) * 1.5);
    g.add(ray);
  }
  g.add(medal, ring1, ring2);
  return g;
}

/** Texture en bandes verticales qui défile : cascade d'eau ou coulée de lave. */
function fallTex(key: string, a: string, b: string) {
  return canvasTex('fall:' + key, 256, (c, S) => {
    c.fillStyle = a; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = b; c.globalAlpha = .1 + Math.random() * .5;
      c.lineWidth = 1 + Math.random() * 7;
      const x = Math.random() * S;
      c.beginPath(); c.moveTo(x, -20); c.lineTo(x + (Math.random() - .5) * 12, S + 20); c.stroke();
    }
    c.globalAlpha = 1;
  }, [2, 1]);
}

/** PIÈCE MAÎTRESSE — l'image que le joueur gardera de l'étage. Placée au fond,
 *  pile dans l'axe de la caméra quand on avance vers les machines. */
function hero(f: FloorDef): THREE.Group {
  const g = new THREE.Group();
  const Z = -(ARENA_R + 1.3);

  if (f.index === 1) {
    // idole de pierre adossée à une cascade
    const water = new THREE.Mesh(new THREE.PlaneGeometry(11, 9),
      new THREE.MeshStandardMaterial({
        map: fallTex('eau', '#1d5c62', '#9fe8f0'), emissive: '#2b8f9a', emissiveIntensity: .55,
        roughness: .25, metalness: .1, transparent: true, opacity: .93,
      }));
    water.position.set(0, 4.6, Z + .3); water.userData.scroll = .35; water.userData.noShadow = true;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 6, .5, 32),
      new THREE.MeshStandardMaterial({ map: marbleTex('#1e3b2a', '#7fd0a0'), roughness: .2, metalness: .3 }));
    basin.position.set(0, .25, Z + 3.4);
    const idol = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4, 3), mat('#5a5548', { roughness: .95 }));
    head.position.y = 3.2;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 3.2), mat('#4e4a3e', { roughness: .95 }));
    jaw.position.y = 1.1;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.42, 14, 12),
        mat('#7ef0a0', { emissive: '#5cb46e', emissiveIntensity: 5 }));
      eye.position.set(sx * .85, 3.9, 1.5); eye.userData.noShadow = true;
      idol.add(eye);
    }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 8), mat('#c9a24a', GOLD));
    crown.position.y = 5.8;
    idol.add(head, jaw, crown);
    idol.position.set(0, 0, Z + 2.6);
    g.add(water, basin, idol);
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(.1 + Math.random() * .12, 8, 6),
        mat('#cfeee8', { transparent: true, opacity: .34, emissive: '#9fe8f0', emissiveIntensity: .6 }));
      m.position.set((Math.random() - .5) * 10, Math.random() * 3, Z + 2 + Math.random() * 2);
      m.userData.bubble = .2 + Math.random() * .4; m.userData.noShadow = true;
      g.add(m);
    }
  } else if (f.index === 2) {
    // baie vitrée sur la fosse : poissons et rai de lumière
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(13, 7.4),
      new THREE.MeshPhysicalMaterial({
        color: '#0a2f4a', roughness: .05, metalness: 0, transmission: .55,
        transparent: true, opacity: .8, emissive: '#0d4a72', emissiveIntensity: .8,
      }));
    glass.position.set(0, 4.2, Z + .25); glass.userData.noShadow = true;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(6.9, .28, 10, 6), mat('#7b8aa0', CHROME));
    frame.position.set(0, 4.2, Z + .35); frame.rotation.z = Math.PI / 6; frame.scale.set(1, .58, 1);
    g.add(glass, frame);
    for (let i = 0; i < 16; i++) {
      const fish = new THREE.Mesh(new THREE.ConeGeometry(.22, .8, 6),
        mat(i % 3 ? '#8fd8f0' : '#f0c58f', { emissive: '#4aa8dc', emissiveIntensity: .5 }));
      fish.rotation.z = Math.PI / 2;
      fish.position.set(-6 + Math.random() * 12, 1.6 + Math.random() * 5.6, Z + .6);
      fish.userData.swim = .5 + Math.random() * 1.3; fish.userData.noShadow = true;
      g.add(fish);
    }
  } else if (f.index === 3) {
    // chute de lave et bassin en fusion
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 9),
      new THREE.MeshStandardMaterial({
        map: fallTex('lave', '#7a1c05', '#ffb14a'), emissive: '#ff5a18', emissiveIntensity: 1.5, roughness: .6,
      }));
    lava.position.set(0, 4.6, Z + .3); lava.userData.scroll = .5; lava.userData.noShadow = true;
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, .4, 32),
      mat('#ff5a18', { emissive: '#ff6a24', emissiveIntensity: 2.2, roughness: .8 }));
    pool.position.set(0, .2, Z + 3.2); pool.userData.noShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.5, .45, 10, 36), mat('#241009', { roughness: 1 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(0, .3, Z + 3.2);
    // enclume et marteau géants au-dessus du bassin
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 1.8), mat('#3a3540', { metalness: .8, roughness: .35 }));
    anvil.position.set(0, 2.4, Z + 3.2);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(.6, 1.8, 10), mat('#3a3540', { metalness: .8, roughness: .35 }));
    horn.rotation.z = Math.PI / 2; horn.position.set(-2.4, 2.4, Z + 3.2);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(.7, 1, 1.8, 12), mat('#241009', { roughness: 1 }));
    stand.position.set(0, 1, Z + 3.2);
    g.add(lava, rim, pool, stand, anvil, horn);
    for (let i = 0; i < 26; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 6), new THREE.MeshBasicMaterial({ color: '#ffb14a' }));
      e.position.set((Math.random() - .5) * 11, Math.random() * 4, Z + 2 + Math.random() * 3);
      e.userData.ember = Math.random() * Math.PI * 2; e.userData.noShadow = true;
      g.add(e);
    }
  } else if (f.index === 4) {
    // immense baie sur la Terre
    const port = new THREE.Mesh(new THREE.CircleGeometry(6.2, 48),
      mat('#04060f', { emissive: '#050a18', emissiveIntensity: .4 }));
    port.position.set(0, 5, Z + .25); port.userData.noShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6.3, .38, 12, 48), mat('#aab3d8', CHROME));
    rim.position.set(0, 5, Z + .35);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(3.5, 40, 32),
      new THREE.MeshStandardMaterial({
        map: canvasTex('terre', 512, (c, S) => {
          const grd = c.createLinearGradient(0, 0, 0, S);
          grd.addColorStop(0, '#0b2a6b'); grd.addColorStop(.5, '#14509c'); grd.addColorStop(1, '#0a2050');
          c.fillStyle = grd; c.fillRect(0, 0, S, S);
          c.fillStyle = '#2f7a4a';
          for (let i = 0; i < 26; i++) {
            c.beginPath();
            c.ellipse(Math.random() * S, Math.random() * S, 18 + Math.random() * 62, 12 + Math.random() * 40,
              Math.random() * 3, 0, Math.PI * 2);
            c.fill();
          }
          c.globalAlpha = .3; c.fillStyle = '#ffffff';
          for (let i = 0; i < 40; i++) {
            c.beginPath();
            c.ellipse(Math.random() * S, Math.random() * S, 20 + Math.random() * 55, 7 + Math.random() * 16, 0, 0, Math.PI * 2);
            c.fill();
          }
          c.globalAlpha = 1;
        }, [1, 1]),
        roughness: .85, metalness: .05, emissive: '#1a3a7a', emissiveIntensity: .22,
      }));
    earth.position.set(-1.4, 4.4, Z - 3.6);
    earth.userData.spin = .05; earth.userData.noShadow = true;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(3.75, 32, 24),
      new THREE.MeshBasicMaterial({ color: '#6fa8ff', transparent: true, opacity: .12, side: THREE.BackSide }));
    halo.position.copy(earth.position); halo.userData.noShadow = true;
    g.add(port, earth, halo, rim);
  } else {
    // porte du Paradoxe : anneaux d'or en lévitation et escalier qui se referme
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2 + i * .9, .18, 12, 60), mat('#e6b64c', GOLD));
      ring.position.set(0, 5, Z + 2.4);
      ring.rotation.set(Math.random() * 1.2, Math.random() * 1.2, Math.random() * 1.2);
      ring.userData.floaty = i;
      g.add(ring);
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1),
      mat('#f0e6ff', { emissive: '#c9b0ff', emissiveIntensity: 3.4, metalness: .6, roughness: .15 }));
    core.position.set(0, 5, Z + 2.4); core.userData.floaty = 9; core.userData.noShadow = true;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(6, .3, 12, 48, Math.PI), mat('#c9a24a', GOLD));
    arch.position.set(0, .2, Z + 1.2);
    g.add(core, arch);
    for (let i = 0; i < 14; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, .24, 1.1),
        new THREE.MeshStandardMaterial({ map: marbleTex('#3a2f52', '#c9b0ff'), roughness: .2, metalness: .5 }));
      const a = i * .45;
      st.position.set(Math.cos(a) * 7, .6 + i * .78, Z + 4 + Math.sin(a) * 3);
      st.rotation.y = -a;
      g.add(st);
    }
  }
  return g;
}

function buildProps(f: FloorDef) {
  const g = new THREE.Group();
  propSolids = [];
  g.add(walls(f), carpet(f), chandelier(f));
  g.add(hero(f));
  for (const sp of MACHINE_SPOTS) g.add(spotOver(f, sp));
  g.add(spotOver(f, SHOP_POS));

  // colonnes tout autour, sauf devant les machines
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + .26;
    const x = Math.cos(a) * (ARENA_R - .6), z = Math.sin(a) * (ARENA_R - .6);
    if (MACHINE_SPOTS.some(sp => sp.distanceTo(new THREE.Vector3(x, 0, z)) < 3.4)) continue;
    g.add(column(f, x, z));
    propSolids.push({ p: new THREE.Vector3(x, 0, z), r: .8 });
  }

  // mobilier : le bar à droite, deux salons, l'allée d'entrée balisée
  g.add(bar(f, 11.2, 4.6, -0.9));
  g.add(lounge(f, -6.6, 6.4, 0.35));
  g.add(lounge(f, 5.4, 7.6, -0.3));
  g.add(ropeLine(f, -3.1, 8.6, -3.1, 3.4, 3));
  g.add(ropeLine(f, 3.1, 8.6, 3.1, 3.4, 3));

  const spot = () => {
    const a = Math.random() * Math.PI * 2, r = ARENA_R + 3 + Math.random() * 7;
    return [Math.cos(a) * r, Math.sin(a) * r - 2];
  };
  // décor d'ambiance propre à l'étage, au-delà des murs et au plafond
  if (f.index === 1) {
    for (let i = 0; i < 18; i++) {
      const [x, z] = spot();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.2, .28, 2.4, 6), mat('#4a3520'));
      t.position.set(x, 1.2, z);
      const h = 3.4 + Math.random() * 2.6;
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.5 + Math.random() * 1.2, h, 7), mat('#2e6b3a'));
      c.position.set(x, 2.4 + h / 2, z);
      g.add(t, c);
    }
    // lianes qui pendent du plafond dans la salle
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * (ARENA_R - 6);
      const len = 1.4 + Math.random() * 2.6;
      const v = new THREE.Mesh(new THREE.CylinderGeometry(.05, .03, len, 5), mat('#3f7a45'));
      v.position.set(Math.cos(a) * r, 9.6 - len / 2, Math.sin(a) * r);
      g.add(v);
    }
  } else if (f.index === 2) {
    for (let i = 0; i < 16; i++) {
      const [x, z] = spot();
      const c = new THREE.Mesh(new THREE.ConeGeometry(.7, 2 + Math.random() * 1.6, 5),
        mat(i % 2 ? '#c95f8a' : '#3fa8d8', { roughness: .5 }));
      c.position.set(x, 1, z); g.add(c);
    }
    for (let i = 0; i < 34; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(.07 + Math.random() * .09, 8, 8),
        mat('#9fd8f5', { transparent: true, opacity: .5, roughness: .2 }));
      b.position.set((Math.random() - .5) * 28, Math.random() * 8, (Math.random() - .7) * 22);
      b.userData.bubble = .3 + Math.random() * .6; g.add(b);
    }
  } else if (f.index === 3) {
    for (let i = 0; i < 16; i++) {
      const [x, z] = spot();
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 1.1), mat('#1c1210', { roughness: 1 }));
      r.position.set(x, .6, z); g.add(r);
    }
    // coulées de lave le long du mur
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(.5, 5.5, .18),
        mat('#ff6a24', { emissive: '#ff5a18', emissiveIntensity: 1.1 }));
      fl.position.set(Math.cos(a) * (ARENA_R + 1.4), 3.4, Math.sin(a) * (ARENA_R + 1.4));
      fl.rotation.y = -a; g.add(fl);
    }
    for (let i = 0; i < 30; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(.06, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff7a30' }));
      e.position.set((Math.random() - .5) * 28, Math.random() * 7, (Math.random() - .7) * 22);
      e.userData.ember = Math.random() * Math.PI * 2; g.add(e);
    }
  } else if (f.index === 4) {
    const n = 600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - .5) * 90;
      pos[i * 3 + 1] = Math.random() * 34 - 4;
      pos[i * 3 + 2] = (Math.random() - .6) * 75;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfd4ff', size: .09, fog: false })));
    // hublots sur le mur : on voit la Terre défiler
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const hub = new THREE.Mesh(new THREE.CircleGeometry(1.5, 26),
        mat('#1b3a7a', { emissive: '#2a5ac0', emissiveIntensity: .5 }));
      hub.position.set(Math.cos(a) * (ARENA_R + 1.45), 4.4, Math.sin(a) * (ARENA_R + 1.45));
      hub.lookAt(0, 4.4, 0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, .13, 8, 26), mat('#9aa2c8', CHROME));
      rim.position.copy(hub.position); rim.lookAt(0, 4.4, 0);
      g.add(hub, rim);
    }
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.4 + i * .5, .05, 8, 40), mat('#9282f2', { emissive: '#2a2260', metalness: .6 }));
      const [x, z] = spot(); r.position.set(x, 4 + i, z); r.userData.floaty = i; g.add(r);
    }
  } else {
    // Le Paradoxe : miroirs, escaliers impossibles, objets en lévitation
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + .4;
      const mir = new THREE.Mesh(new THREE.BoxGeometry(2.6, 6, .2),
        mat('#2a2340', { metalness: .95, roughness: .06, emissive: '#5a4a9a', emissiveIntensity: .18 }));
      mir.position.set(Math.cos(a) * (ARENA_R + 1.3), 3.4, Math.sin(a) * (ARENA_R + 1.3));
      mir.lookAt(0, 3.4, 0); g.add(mir);
    }
    for (let i = 0; i < 12; i++) {
      const k = new THREE.Mesh(new THREE.TorusKnotGeometry(.5, .14, 60, 8),
        mat(i % 2 ? '#e6b64c' : '#9282f2', { metalness: .7, roughness: .3 }));
      const [x, z] = spot(); k.position.set(x, 3 + Math.random() * 5, z); k.userData.floaty = i; g.add(k);
    }
    // marches suspendues qui ne mènent nulle part
    for (let i = 0; i < 9; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(2, .22, .9), mat('#3a2f52', { metalness: .4 }));
      st.position.set(-9 + i * .9, 1.2 + i * .85, -13 - i * .5);
      st.rotation.z = .06 * (i % 2 ? 1 : -1);
      g.add(st);
    }
  }
  return g;
}

export function initScene(canvas: HTMLCanvasElement) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // Étalonnage : sans courbe filmique, les couleurs saturées s'écrasent et tout paraît plastique.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  // Carte d'environnement : c'est elle qui fait que l'or a l'air d'être de l'or
  // et non du jaune mat. Générée en mémoire, aucun fichier à charger.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.30;      // les reflets servent les métaux, pas à éclairer la pièce
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(60, 1, .1, 220);
  camera.position.set(0, 5, 10);

  keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
  keyLight.position.set(9, 17, 11);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.bias = -0.0006;
  keyLight.shadow.normalBias = 0.03;
  const sc = keyLight.shadow.camera as THREE.OrthographicCamera;
  sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 60;
  sc.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0xffffff, .35);
  fill.position.set(-8, 7, -10);
  scene.add(keyLight, fill, new THREE.AmbientLight(0xffffff, .13));

  accentLight = new THREE.PointLight(0xffffff, 60, 34, 1.9);
  accentLight.position.set(0, 8.2, -2);
  flashLight = new THREE.PointLight('#ff3020', 0, 22);
  scene.add(accentLight, flashLight);

  ground = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 1.6, ARENA_R + 1.6, .3, 56), mat('#1a1620', { roughness: .95 }));
  ground.position.y = -.15; ground.receiveShadow = true; scene.add(ground);

  marker = new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 4),
    mat('#e6b64c', { emissive: '#e6b64c', emissiveIntensity: 2.2 }));
  marker.rotation.x = Math.PI; marker.visible = false; scene.add(marker);

  setFloor(1);
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(tick);
}

/** Halo lumineux : les néons, l'or et les jackpots doivent déborder, c'est ce qui fait « casino ». */
function buildComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // seuil haut : seuls les néons et l'or éclairé débordent, pas les murs
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.98);
  composer.addPass(bloom);
  composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));   // le halo coûte cher : demi-résolution
  composer.setSize(innerWidth, innerHeight);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerHeight > innerWidth ? 68 : 56;
  camera.updateProjectionMatrix();
  if (!composer) buildComposer(); else composer.setSize(innerWidth, innerHeight);
}

const BUILDERS: Record<string, (f: FloorDef, d: MachineDef) => THREE.Group> = {
  WHEEL: buildWheel, CRASH: buildCrash, SLOTS: buildSlots, HILO: buildHilo,
  ROULETTE: buildRoulette, BLACKJACK: buildBJ, CRAPS: buildCraps,
  CHESTS: buildChests, PLINKO: buildPlinko, MINES: buildMines, RACE: buildRace,
};

export function setFloor(index: number) {
  if (index === currentFloor) return;
  currentFloor = index;
  const f = floorAt(index) ?? FLOORS[0];
  const t = f.theme;
  scene.background = new THREE.Color(t.bg);
  scene.fog = new THREE.Fog(t.fog, 18, 78);
  (ground.material as THREE.MeshStandardMaterial).color.set(t.ground);
  accentLight.color.set(t.accent);
  keyLight.color.set(t.light);
  for (const o of machineRoots) { scene.remove(o); disposeTree(o); }
  if (propsGroup) { scene.remove(propsGroup); disposeTree(propsGroup); }
  if (shopRoot) { scene.remove(shopRoot); disposeTree(shopRoot); }
  wheelDisc = null; crashTrack = null; runner = null; drums = []; cardMesh = null;
  mineTiles = []; mineFx = []; racePawns = []; raceRun.active = false;
  slotBulbs = []; slotLever = null; slotFlash = 0; leverPull = 0; chestLids = []; chestGems = []; chestBeam = null;
  rouletteBall = null; bjPTex = null; bjDTex = null; dice = []; chestMeshes = []; plinkoBalls = []; plinkoDrops = [];
  crashMult = null; runnerX = 0; bustAnim = 0; pendingCard = null; cardFlip = 0;
  roul.active = false; diceRoll.active = false; chestAnim.active = false;

  machineRoots = f.machines.map((d, i) => {
    const g = BUILDERS[d.archetype](f, d);
    g.position.copy(MACHINE_SPOTS[i]);
    g.rotation.y = YAWS[i];
    shade(g);
    scene.add(g);
    if (d.archetype === 'CRASH') flashLight.position.copy(MACHINE_SPOTS[i]).setY(3);
    return g;
  });
  shopRoot = buildShop(f);
  propsGroup = buildProps(f);
  shade(shopRoot); shade(propsGroup);
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
/** Lâche une ou plusieurs billes, décalées dans le temps. */
export function plinkoDropTo(drops: { path: number[]; slot: number }[], dropMs: number, stagger = 0) {
  const now = performance.now();
  plinkoDrops = drops.slice(0, plinkoBalls.length).map((d, i) => ({
    path: d.path, slot: d.slot, start: now + i * stagger, dur: dropMs, done: false,
  }));
  plinkoBalls.forEach((b, i) => { b.visible = i < plinkoDrops.length; });
}
export function minesReveal(cell: number, bomb: boolean) { mineFx.push({ i: cell, bomb, at: tNow }); }
export function minesReset() { mineFx = []; for (const t of mineTiles) resetTile(t); }
function resetTile(t: THREE.Mesh) {
  const mm = t.material as THREE.MeshStandardMaterial;
  mm.color.set('#3b3350'); mm.emissive.set('#000000'); mm.emissiveIntensity = 0;
  t.position.y = t.userData.base; t.scale.setScalar(1);
}
export function raceRunTo(order: number[], raceMs: number) {
  raceRun = { active: true, start: tNow, dur: raceMs, order };
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
      const solids = [...MACHINE_SPOTS.map(s => ({ p: s, r: 2.05 })), { p: SHOP_POS, r: 1.7 }, ...propSolids];
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
    // bulle de réaction : monte, puis s'efface au bout de 2 s
    const em = a.g.getObjectByName('emote') as THREE.Sprite | undefined;
    if (em) {
      const age = (now - em.userData.born) / 1000;
      em.position.y = 2.25 + Math.min(.35, age * .5);
      const pop = age < .18 ? age / .18 : 1;
      em.scale.setScalar(.8 * (pop * (1 + Math.sin(age * 9) * .06 * Math.max(0, 1 - age))));
      (em.material as THREE.SpriteMaterial).opacity = age > 1.6 ? Math.max(0, (2 - age) / .4) : 1;
      if (age > 2) a.g.remove(em);
    }
  }

  if (cine) {
    // Écran-titre : orbite lente autour de la salle, léger mouvement vertical.
    const a = now / 11000;
    camera.position.set(Math.sin(a) * 12.5, 6.4 + Math.sin(now / 5200) * .9, Math.cos(a) * 9 + 2);
    camera.lookAt(new THREE.Vector3(0, 1.6, -2.4));
  } else {
    const fp = me ? me.g.position : new THREE.Vector3(0, 0, 3);
    camera.position.lerp(new THREE.Vector3(fp.x * .85, 5.3, fp.z + 7), 1 - Math.pow(.002, dt));
    if (shake > .01) {
      camera.position.x += (Math.random() - .5) * .16 * shake;
      camera.position.y += (Math.random() - .5) * .1 * shake;
      shake *= Math.pow(.02, dt);
    }
    camera.lookAt(new THREE.Vector3(fp.x, 1.2, fp.z - 1.6));
  }

  const sp = cine ? null : nearestSpot();
  marker.visible = !!sp;
  if (sp) {
    const p = sp.kind === 'MACHINE' ? MACHINE_SPOTS[sp.index] : SHOP_POS;
    marker.position.set(p.x, (sp.kind === 'MACHINE' ? 4.9 : 3.8) + Math.sin(now / 250) * .15, p.z);
  }

  // --- MINES : la dalle touchée s'allume (verte) ou explose (rouge) ---
  for (const fx of mineFx) {
    const t = mineTiles[fx.i];
    if (!t) continue;
    const age = (now - fx.at) / 1000;
    const mm = t.material as THREE.MeshStandardMaterial;
    if (fx.bomb) {
      mm.color.set('#e03a2a'); mm.emissive.set('#ff4020');
      mm.emissiveIntensity = Math.max(0, 2.4 - age * 1.2);
      t.position.y = t.userData.base + Math.min(.5, age * 1.6);
      t.scale.setScalar(1 + Math.min(.8, age * 1.4));
    } else {
      mm.color.set('#5cb46e'); mm.emissive.set('#5cb46e');
      mm.emissiveIntensity = .5 + Math.max(0, .8 - age * 2);
      t.position.y = t.userData.base + Math.min(.09, age * .5);
    }
  }

  // --- COURSE : chaque pion rejoint l'arrivée, le vainqueur en tête ---
  if (raceRun.active && racePawns.length === 4) {
    const el = now - raceRun.start;
    let done = true;
    for (let l = 0; l < 4; l++) {
      const rank = raceRun.order.indexOf(l);
      const dur = raceRun.dur * (1 + rank * 0.07);      // les suivants franchissent après
      const t = Math.min(1, el / dur);
      if (t < 1) done = false;
      // course irrégulière : petite oscillation, sinon les pions semblent glisser
      const wobble = Math.sin(el / 90 + l * 1.7) * .05 * (1 - t);
      const pawn = racePawns[l];
      pawn.position.x = -1.5 + (3 + rank * .2) * Math.min(1, t + wobble);
      pawn.position.y = .19 + Math.abs(Math.sin(el / 70 + l)) * (t < 1 ? .09 : 0);
    }
    if (done && el > raceRun.dur * 1.6) raceRun.active = false;
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
        d.position.y = 1.78 + Math.abs(Math.sin(now / 70)) * .28;
      }
    } else {
      [diceRoll.d1, diceRoll.d2].forEach((v, i) => {
        const [rx, ry, rz] = DICE_EULER[v];
        dice[i].rotation.set(rx, ry, rz);
        dice[i].rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (i ? -1 : 1) * .4);
        dice[i].position.y = 1.78;
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

  if (plinkoBalls.length && plinkoDrops.length) {
    plinkoDrops.forEach((d, bi) => {
      const ball = plinkoBalls[bi];
      if (!ball) return;
      const t0 = (now - d.start) / d.dur;
      if (t0 < 0) { ball.visible = false; return; }
      ball.visible = true;
      const t = Math.min(1, t0);
      const row = Math.min(7, Math.floor(t * 8));
      let x = 0;
      for (let i = 0; i < row; i++) x += d.path[i] ? .18 : -.18;
      const frac = (t * 8) % 1;
      x += (d.path[row] ? .18 : -.18) * frac;
      // chute accélérée + petit rebond latéral sur chaque picot
      ball.position.set(x, 4.05 - t * 3.1, .2 + Math.sin(t * 26) * .015);
      ball.rotation.z -= dt * 6;
      if (t >= 1 && !d.done) {
        d.done = true;
        ball.position.x = (d.slot - 4) * .36;
        ball.position.y = .95;
        bumpShake(.18);
      }
    });
    // les billes disparaissent une fois toutes arrivées
    if (plinkoDrops.every(d => d.done) && now - Math.max(...plinkoDrops.map(d => d.start + d.dur)) > 1400) {
      plinkoBalls.forEach(b => { b.visible = false; });
      plinkoDrops = [];
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
      // pièces maîtresses : l'eau et la lave coulent, les poissons passent, la Terre tourne
      if (o.userData.scroll) {
        const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mm?.map) mm.map.offset.y -= o.userData.scroll * dt;
      }
      if (o.userData.swim) {
        o.position.x += o.userData.swim * dt;
        if (o.position.x > 7) { o.position.x = -7; o.position.y = 1.6 + Math.random() * 5.6; }
      }
      if (o.userData.spin) o.rotation.y += o.userData.spin * dt;
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
  if (composer) composer.render(); else renderer.render(scene, camera);
}
