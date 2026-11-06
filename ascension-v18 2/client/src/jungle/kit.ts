// ============================================================
// Kit de la Canopée : matières et pièces partagées par le décor et les machines.
// Une seule bibliothèque de matières = toute la salle parle la même langue.
// ============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { pbr } from '../gfx/assets';

export const FONT_DISPLAY = '"Lilita One", "Arial Black", system-ui, sans-serif';
export const FONT_UI = '"Outfit Variable", "Outfit", system-ui, sans-serif';

const cache = new Map<string, THREE.Material>();
const once = <T extends THREE.Material>(k: string, f: () => T): T => {
  if (!cache.has(k)) { const m = f(); m.userData.shared = true; cache.set(k, m); }
  return cache.get(k) as T;
};
const share = <T extends THREE.Material>(m: T): T => { m.userData.shared = true; return m; };

/** Matières. Toutes mutualisées : ne jamais les modifier en place, cloner d'abord. */
export const M = {
  stone: (rep: [number, number] = [1, 1]) => share(pbr('mossy_sandstone', { repeat: rep })),
  stoneDark: (rep: [number, number] = [1, 1]) => share(pbr('mossy_sandstone', { repeat: rep, color: '#8f8676' })),
  ruin: (rep: [number, number] = [1, 1]) => share(pbr('rabdentse_ruins_wall', { repeat: rep, color: '#e2dacb' })),
  floor: (rep: [number, number] = [1, 1]) => share(pbr('monastery_stone_floor', { repeat: rep })),
  wood: (rep: [number, number] = [1, 1]) => share(pbr('worn_planks', { repeat: rep })),
  woodDark: (rep: [number, number] = [1, 1]) => share(pbr('weathered_planks', { repeat: rep, color: '#a58a72' })),
  carved: (rep: [number, number] = [1, 1]) => share(pbr('weathered_planks', { repeat: rep, color: '#c79a6a' })),
  carvedLight: (rep: [number, number] = [1, 1]) => share(pbr('worn_planks', { repeat: rep, color: '#e8c49a' })),
  bark: (rep: [number, number] = [1, 1]) => share(pbr('palm_bark', { repeat: rep, color: '#b9a58f' })),
  bamboo: (rep: [number, number] = [1, 1]) => share(pbr('bamboo_wall', { repeat: rep })),
  rock: (rep: [number, number] = [1, 1]) => share(pbr('rock_pitted_mossy', { repeat: rep })),
  gold: () => once('gold', () => new THREE.MeshPhysicalMaterial({
    color: '#f2c15a', metalness: 1, roughness: .26, clearcoat: .3, clearcoatRoughness: .2,
  })),
  goldWorn: () => once('goldWorn', () => new THREE.MeshPhysicalMaterial({
    color: '#c99a3c', metalness: 1, roughness: .42,
  })),
  jade: () => once('jade', () => new THREE.MeshPhysicalMaterial({
    color: '#2f9e74', roughness: .22, metalness: .05, clearcoat: 1, clearcoatRoughness: .08, sheen: .3, sheenColor: '#7fffd0',
  })),
  obsidian: () => once('obsidian', () => new THREE.MeshPhysicalMaterial({
    color: '#16121a', roughness: .12, metalness: .2, clearcoat: 1, clearcoatRoughness: .04,
  })),
  coral: () => once('coral', () => new THREE.MeshPhysicalMaterial({
    color: '#d2553d', roughness: .35, clearcoat: .6, clearcoatRoughness: .2,
  })),
  turquoise: () => once('turq', () => new THREE.MeshPhysicalMaterial({
    color: '#2fb8c4', roughness: .3, clearcoat: .8, clearcoatRoughness: .15,
  })),
  rope: () => once('rope', () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const x = c.getContext('2d')!;
    x.fillStyle = '#7a5a34'; x.fillRect(0, 0, 64, 256);
    for (let i = -8; i < 40; i++) {
      x.strokeStyle = i % 2 ? '#a07a48' : '#5a4022'; x.lineWidth = 7;
      x.beginPath(); x.moveTo(0, i * 9); x.lineTo(64, i * 9 + 26); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6);
    return new THREE.MeshStandardMaterial({ map: t, roughness: .95 });
  }),
  dark: () => once('dark', () => new THREE.MeshStandardMaterial({ color: '#07060a', roughness: 1 })),
};

/** Émissif réglable : chaque appel crée son matériau (on l'anime). */
export const glow = (color: string, intensity = 3, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .4, ...o });

export function rbox(w: number, h: number, d: number, r = .06, seg = 1) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
}

/** Bloc de pierre : chanfreins + UV à l'échelle du monde (la texture ne s'étire pas). */
export function stoneBlock(w: number, h: number, d: number, mat?: THREE.Material, r = .08) {
  const g = rbox(w, h, d, r);
  worldUv(g, .55);
  return new THREE.Mesh(g, mat ?? M.stone());
}

/** UV « triplanaires » figées : projection selon la normale dominante, échelle en mètres. */
export function worldUv(g: THREE.BufferGeometry, scale = .5) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Tube effilé le long d'une courbe (troncs, racines, lianes, cornes). */
export function taperTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, seg = 24, radial = 10, vRep = 1) {
  const frames = curve.computeFrenetFrames(seg, false);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t), N = frames.normals[i], B = frames.binormals[i];
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 3 + t * 9) * .04;
      pos.push(c.x + (Math.cos(a) * N.x + Math.sin(a) * B.x) * r * wob,
        c.y + (Math.cos(a) * N.y + Math.sin(a) * B.y) * r * wob,
        c.z + (Math.cos(a) * N.z + Math.sin(a) * B.z) * r * wob);
      uv.push(j / radial, t * vRep);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Texte peint sur un canvas (enseignes, numéros, multiplicateurs). */
export function textTexture(text: string, o: {
  w?: number; h?: number; color?: string; size?: number; font?: string; stroke?: string; strokeW?: number;
  bg?: string | null; glow?: string; weight?: number;
} = {}) {
  const W = o.w ?? 512, H = o.h ?? 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, W, H); }
  let px = o.size ?? H * .62;
  const font = () => `${o.weight ?? 400} ${px}px ${o.font ?? FONT_DISPLAY}`;
  x.font = font();
  while (x.measureText(text).width > W * .9 && px > 8) { px *= .92; x.font = font(); }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (o.glow) { x.shadowColor = o.glow; x.shadowBlur = px * .35; }
  if (o.stroke) { x.lineJoin = 'round'; x.lineWidth = o.strokeW ?? px * .14; x.strokeStyle = o.stroke; x.strokeText(text, W / 2, H / 2 + px * .04); }
  x.shadowBlur = 0;
  x.fillStyle = o.color ?? '#fff';
  x.fillText(text, W / 2, H / 2 + px * .04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Enseigne de machine : planche peinte suspendue à une traverse de bambou, deux lanternes. */
export function jungleSign(text: string, accent: string, y = 4.7, width = 2.9) {
  const g = new THREE.Group();
  // traverse + montants en bambou
  const bamboo = M.bamboo([1, 1]);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .085, y + .5, 10), bamboo);
    post.position.set(sx * (width / 2 + .12), (y + .5) / 2, -.05);
    g.add(post);
    // nœuds du bambou
    for (let k = 1; k < 5; k++) {
      const knot = new THREE.Mesh(new THREE.TorusGeometry(.082, .018, 6, 14), bamboo);
      knot.rotation.x = Math.PI / 2; knot.position.set(sx * (width / 2 + .12), (y + .5) * k / 5, -.05);
      g.add(knot);
    }
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, width + .55, 10), bamboo);
  bar.rotation.z = Math.PI / 2; bar.position.set(0, y + .42, -.05);
  g.add(bar);
  // planche peinte
  const board = stoneBlock(width, .7, .09, M.woodDark([1.4, .5]), .03);
  board.position.set(0, y, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width * .94, .6), new THREE.MeshStandardMaterial({
    map: textTexture(text, { color: '#ffe8b8', stroke: '#2a1608', strokeW: 14, glow: accent, w: 1024, h: 210 }),
    transparent: true, roughness: .7, emissive: '#ffd890', emissiveIntensity: .35,
  }));
  (face.material as THREE.MeshStandardMaterial).emissiveMap = (face.material as THREE.MeshStandardMaterial).map;
  face.position.set(0, y, .052);
  face.userData.noShadow = true;
  // cordes
  for (const sx of [-1, 1]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .38, 6), M.rope());
    rope.position.set(sx * width * .38, y + .5, 0);
    g.add(rope);
  }
  g.add(board, face);
  // deux petites lanternes de papier qui pendent aux coins
  for (const sx of [-1, 1]) {
    const lan = new THREE.Mesh(new THREE.SphereGeometry(.13, 14, 10), glow('#ffb35c', 2.4));
    lan.scale.y = 1.25;
    lan.position.set(sx * (width / 2 + .12), y + .12, .14);
    lan.userData.noShadow = true;
    g.add(lan);
  }
  return g;
}

/** Estrade de pierre à gradins : socle commun aux six machines de l'étage. */
export function dais(r = 2, accent = '#5cdc8e') {
  const g = new THREE.Group();
  const tiers = [[r + .45, .16], [r + .18, .16], [r, .14]];
  let y = 0;
  tiers.forEach(([rr, h], i) => {
    const geo = new THREE.CylinderGeometry(rr, rr + .06, h, 8, 1);
    worldUv(geo, .5);
    const t = new THREE.Mesh(geo, i === 2 ? M.stone([1, 1]) : M.stoneDark([1, 1]));
    t.rotation.y = Math.PI / 8;
    t.position.y = y + h / 2; y += h;
    g.add(t);
  });
  // liseré d'or et rainure lumineuse de jade
  const gold = new THREE.Mesh(new THREE.TorusGeometry(r + .02, .035, 6, 8), M.gold());
  gold.rotation.x = Math.PI / 2; gold.rotation.z = Math.PI / 8; gold.position.y = y + .005;
  const line = new THREE.Mesh(new THREE.TorusGeometry(r - .2, .022, 6, 8), glow(accent, 2.2));
  line.rotation.x = Math.PI / 2; line.rotation.z = Math.PI / 8; line.position.y = y + .006;
  line.userData.noShadow = true;
  g.add(gold, line);
  g.userData.top = y;
  return g;
}
