// ============================================================
// LA CANOPÉE — un temple englouti par la jungle, transformé en casino.
// Cour dallée, enceinte en ruine, idole géante qui crache une cascade,
// arbres colossaux dont la canopée filtre le soleil en faisceaux.
// ============================================================
import * as THREE from 'three';
import { mergeGeometries as mergeRaw } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Fusion tolérante : tout en non indexé, mêmes attributs (position, normale, uv). */
function mergeGeometries(list: THREE.BufferGeometry[]) {
  const norm = list.map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
  return mergeRaw(norm)!;
}
import { parts, texRaw, cloneModel } from '../gfx/assets';
import {
  U, skyDome, leafify, groundMaterial, waterfallMaterial, waterNormals, shaftMaterial,
  flameMaterial, glowPoints, leafTexture, leafGeometry,
} from '../gfx/fx';
import { M, glow, stoneBlock, worldUv, taperTube, rbox } from './kit';

export interface World {
  group: THREE.Group;
  solids: { p: THREE.Vector3; r: number }[];
  update(dt: number, t: number): void;
  highOnly: THREE.Object3D[];
  sun: THREE.DirectionalLight;
  /** Perce le dallage (rectangle centré, demi-côtés, lacet) — pour une fosse. */
  punch(x: number, z: number, hx: number, hz: number, rot: number): void;
}

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
let seed = 7;
const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const sr = (a: number, b: number) => a + srand() * (b - a);

export const SUN_DIR = new THREE.Vector3(-.36, 1, -.5).normalize();
export const SUN_COLOR = new THREE.Color('#ffdcaa');

/** Zone que la caméra de jeu traverse (derrière le joueur, côté entrée) : rien de haut dedans. */
function inCameraLane(x: number, z: number) { return z > 3 && Math.abs(x) < 17 && z < 28; }

/** Pose des instances d'une variante de modèle. */
function instance(mesh: THREE.Mesh, list: THREE.Matrix4[], o: { shadow?: boolean; leaf?: number; sway?: number } = {}) {
  if (!list.length) return null;
  let mat = mesh.material as THREE.MeshStandardMaterial;
  if (o.leaf !== undefined) { mat = mat.clone(); leafify(mat, SUN_DIR, SUN_COLOR, o.leaf, o.sway ?? 0); }
  const im = new THREE.InstancedMesh(mesh.geometry, mat, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = !!o.shadow; im.receiveShadow = true;
  im.userData.noShadow = !o.shadow;
  im.computeBoundingSphere();
  return im;
}
const mtx = (x: number, y: number, z: number, s: number, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
function heightOf(g: THREE.BufferGeometry) { g.computeBoundingBox(); return g.boundingBox!.max.y - g.boundingBox!.min.y || 1; }

export function buildJungle(spots: THREE.Vector3[], shopPos: THREE.Vector3, radioPos: THREE.Vector3, arenaR: number, density = 1): World {
  const D = (n: number) => Math.max(1, Math.round(n * density));
  seed = 7;
  const g = new THREE.Group();
  const solids: World['solids'] = [];
  const highOnly: THREE.Object3D[] = [];
  const updaters: ((dt: number, t: number) => void)[] = [];
  const WALL_R = arenaR + 1.1;
  let groundMat: THREE.MeshStandardMaterial | null = null;

  // ---------- ciel, lumières ----------
  g.add(skyDome('#8fb8b0', '#9aa77c', SUN_DIR, '#fff0c8'));
  const hemi = new THREE.HemisphereLight('#cfe8da', '#2b3a1c', .55);
  const sun = new THREE.DirectionalLight(SUN_COLOR, 4.2);
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 5; sc.far = 90;
  sc.updateProjectionMatrix();
  // contre-jour froid côté caméra : les façades des machines ne tombent pas dans le noir
  const fill = new THREE.DirectionalLight('#9cc4ff', .55);
  fill.position.set(4, 9, 18);
  g.add(hemi, sun, sun.target, fill);

  // ---------- sol ----------
  {
    const geo = new THREE.CircleGeometry(80, 96);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3.2, -p.getZ(i) / 3.2);
    const stone = { diff: texRaw('monastery_stone_floor', 'diff')!, nor: texRaw('monastery_stone_floor', 'nor')!, arm: texRaw('monastery_stone_floor', 'arm')! };
    const forest = { diff: texRaw('forest_leaves_02', 'diff')!, nor: texRaw('forest_leaves_02', 'nor')!, arm: texRaw('forest_leaves_02', 'arm')! };
    groundMat = groundMaterial(stone, forest, arenaR - 1.4, arenaR + 2.4);
    const ground = new THREE.Mesh(geo, groundMat);
    ground.receiveShadow = true; ground.userData.noShadow = true;
    g.add(ground);
  }

  // médaillon central : calendrier sculpté, incrustations d'or
  {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d')!;
    x.translate(512, 512);
    x.strokeStyle = '#fff'; x.fillStyle = '#fff';
    for (const [r, w] of [[500, 14], [440, 6], [300, 10], [180, 6], [80, 12]] as [number, number][]) {
      x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke();
    }
    for (let i = 0; i < 20; i++) {         // glyphes de l'anneau extérieur
      x.save(); x.rotate((i / 20) * TAU);
      x.lineWidth = 8;
      x.beginPath(); x.moveTo(0, -440); x.lineTo(0, -300); x.stroke();
      x.strokeRect(-34, -420, 68, 60);
      x.beginPath(); x.arc(0, -330, 14, 0, TAU); x.fill();
      x.restore();
    }
    for (let i = 0; i < 8; i++) {          // rayons du soleil
      x.save(); x.rotate((i / 8) * TAU + .2);
      x.beginPath(); x.moveTo(-50, -180); x.lineTo(0, -290); x.lineTo(50, -180); x.closePath(); x.fill();
      x.restore();
    }
    x.beginPath(); x.arc(0, 0, 40, 0, TAU); x.fill();
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    const medal = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64), new THREE.MeshStandardMaterial({
      color: '#f0c260', metalness: 1, roughness: .32, alphaMap: t, transparent: true,
      emissive: '#7a5410', emissiveIntensity: .25, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    medal.rotation.x = -Math.PI / 2; medal.position.set(0, .012, -1.6);
    medal.receiveShadow = true; medal.userData.noShadow = true;
    g.add(medal);
  }

  // ---------- enceinte en ruine ----------
  const wallGeos: THREE.BufferGeometry[] = [], capGeos: THREE.BufferGeometry[] = [];
  const colGeos: THREE.BufferGeometry[] = [];
  const BACK_A0 = -Math.PI * .62, BACK_A1 = -Math.PI * .38;      // l'ouverture sur l'idole
  const wallTops: THREE.Vector3[] = [];
  for (let a = -Math.PI; a < Math.PI; a += .2) {
    const mid = a + .1;
    const cx = Math.cos(mid) * WALL_R, cz = Math.sin(mid) * WALL_R;
    const south = cz > 2.5;
    const back = mid > BACK_A0 && mid < BACK_A1;
    let h = back ? .95 : south ? sr(.35, 1.25) : sr(3.2, 5.6);
    if (!back && !south && srand() < .18) h = sr(1.2, 2.2);        // pan effondré
    const len = .2 * WALL_R * (srand() < .12 && !back ? .55 : 1.02);
    const geo = rbox(len, h, back ? .5 : .9, .07);
    worldUv(geo, .42);
    geo.translate(0, h / 2, 0);
    geo.rotateY(-mid + Math.PI / 2);
    geo.translate(cx, 0, cz);
    wallGeos.push(geo);
    // couvertine (pierre plus claire) sur les murs hauts et la balustrade
    if (h > 2.6 || back) {
      const cap = rbox(len + .12, .22, (back ? .5 : .9) + .16, .05);
      worldUv(cap, .5);
      cap.translate(0, h + .1, 0); cap.rotateY(-mid + Math.PI / 2); cap.translate(cx, 0, cz);
      capGeos.push(cap);
      wallTops.push(new THREE.Vector3(cx, h + .2, cz));
    }
    // éboulis au pied des murs hauts
    if (h > 2.5 && srand() < .6) {
      for (let k = 0; k < 2; k++) {
        const s = sr(.3, .7);
        const b = rbox(s * 1.4, s, s, .08);
        worldUv(b, .5);
        b.rotateY(sr(0, TAU)); b.rotateZ(sr(-.3, .3));
        b.translate(Math.cos(mid + sr(-.06, .06)) * (WALL_R + sr(.6, 1.6)), s / 2 - .05, Math.sin(mid + sr(-.06, .06)) * (WALL_R + sr(.6, 1.6)));
        wallGeos.push(b);
      }
    }
    // colonne à chaque jonction des pans hauts
    if (!south && !back && Math.round((a + Math.PI) / .2) % 2 === 0) {
      const ch = srand() < .3 ? sr(2, 3.5) : sr(5.6, 7.2);
      const col = new THREE.CylinderGeometry(.5, .58, ch, 14, 1);
      worldUv(col, .45);
      col.translate(Math.cos(a) * (WALL_R - .15), ch / 2, Math.sin(a) * (WALL_R - .15));
      colGeos.push(col);
      const capital = rbox(1.45, .42, 1.45, .06);
      worldUv(capital, .5);
      capital.translate(Math.cos(a) * (WALL_R - .15), ch + .2, Math.sin(a) * (WALL_R - .15));
      if (ch > 5) colGeos.push(capital);
      const base = rbox(1.35, .4, 1.35, .06);
      worldUv(base, .5);
      base.translate(Math.cos(a) * (WALL_R - .15), .2, Math.sin(a) * (WALL_R - .15));
      colGeos.push(base);
      if (ch > 5) wallTops.push(new THREE.Vector3(Math.cos(a) * (WALL_R - .15), ch + .42, Math.sin(a) * (WALL_R - .15)));
    }
  }
  const wall = new THREE.Mesh(mergeGeometries(wallGeos), M.ruin([1, 1]));
  const caps = new THREE.Mesh(mergeGeometries(capGeos), M.stone([1, 1]));
  const cols = new THREE.Mesh(mergeGeometries(colGeos), M.stoneDark([1, 1]));
  for (const m of [wall, caps, cols]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(wall, caps, cols);

  // ---------- l'idole et sa cascade ----------
  const IDOL_Z = -24.6;
  {
    const idol = new THREE.Group();
    idol.position.set(0, 0, IDOL_Z);
    const S = M.stone([1, 1]), SD = M.stoneDark([1, 1]), GOLD = M.gold();
    const add = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); idol.add(m); return m; };
    add(stoneBlock(11, 3.2, 4.2, SD, .2), 0, 1.6, -.8);                 // socle dans l'eau
    add(stoneBlock(8.6, 8.4, 3.4, S, .35), 0, 6.9, -.6);                // tête
    add(stoneBlock(9.4, 1.1, 1.2, SD, .2), 0, 9.3, 1.05);               // arcades sourcilières
    for (const sx of [-1, 1]) {
      add(stoneBlock(2.1, 1.5, .8, M.dark(), .2), sx * 2.1, 8.1, .95);  // orbites
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(.62, 24, 18), glow('#5dffb0', 5.5, { roughness: .1 })), sx * 2.1, 8.1, 1.25);
      eye.scale.z = .5; eye.userData.noShadow = true;
      eye.userData.eye = sx;
      add(new THREE.Mesh(new THREE.TorusGeometry(.78, .12, 10, 28), GOLD), sx * 2.1, 8.1, 1.32);
      // pendants d'oreilles : disques d'or
      const ear = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .3, 32), GOLD), sx * 4.75, 6.6, .1);
      ear.rotation.z = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .34, 24), glow('#ff8a3a', 1.8)), sx * 4.92, 6.6, .1).rotation.z = Math.PI / 2;
      // joues gravées
      for (let k = 0; k < 3; k++) add(stoneBlock(.9 - k * .2, .14, .2, GOLD, .04), sx * 3.1, 5.8 - k * .32, 1.12);
    }
    add(stoneBlock(1.5, 2.4, 1.3, S, .3), 0, 6.9, 1.4);                 // nez
    add(stoneBlock(4.6, 1.7, 1, M.dark(), .2), 0, 4.55, .72);           // bouche ouverte
    for (let k = 0; k < 6; k++) add(stoneBlock(.42, .55, .35, GOLD, .06), -1.6 + k * .64, 5.25, 1.1);   // dents
    add(stoneBlock(5.4, .5, 1.3, SD, .12), 0, 3.6, .95);                 // lèvre (la cascade en tombe)
    // coiffe à gradins + plaques d'or + plumes
    add(stoneBlock(10.2, 1.2, 3.8, SD, .2), 0, 11.6, -.6);
    add(stoneBlock(7.6, 1.1, 3.2, S, .2), 0, 12.75, -.7);
    add(stoneBlock(4.6, 1.4, 2.6, SD, .2), 0, 14, -.8);
    for (let k = -3; k <= 3; k++) add(stoneBlock(.8, .8, .14, GOLD, .05), k * 1.3, 11.6, 1.32);
    const featherMat = new THREE.MeshStandardMaterial({
      map: leafTexture('banana', -.12), alphaTest: .4, side: THREE.DoubleSide, roughness: .6, color: '#ff9a7a',
    });
    const fGeo = leafGeometry(1.3, 5.5, -.08, .2);
    for (let k = 0; k < 13; k++) {
      const a = -1 + (k / 12) * 2;
      const fm = new THREE.Mesh(fGeo, k % 3 === 1 ? featherMat.clone() : featherMat);
      if (k % 3 === 1) (fm.material as THREE.MeshStandardMaterial).color.set('#4fd8c8');
      fm.position.set(a * 3.6, 13.6, -1.2 - Math.abs(a) * .3);
      fm.rotation.set(-.12, 0, -a * .62);
      idol.add(fm);
    }
    idol.traverse(o => { if ((o as THREE.Mesh).isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(idol);

    // la cascade : ruban courbe qui sort de la bouche et plonge dans le bassin
    const fallCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 3.75, IDOL_Z + 1.5), new THREE.Vector3(0, 3.2, IDOL_Z + 2.2),
      new THREE.Vector3(0, 1.6, IDOL_Z + 2.75), new THREE.Vector3(0, .05, IDOL_Z + 3),
    ]);
    const W = 4.2, SEG = 24;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      const p = fallCurve.getPointAt(i / SEG);
      const spread = 1 + (i / SEG) * .18;
      for (let j = 0; j <= 6; j++) {
        const u = j / 6;
        pos.push((u - .5) * W * spread, p.y, p.z + Math.sin(u * Math.PI) * .2);
        uv.push(u, 1 - i / SEG);
      }
    }
    for (let i = 0; i < SEG; i++) for (let j = 0; j < 6; j++) {
      const a = i * 7 + j, b = a + 7;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    fg.setIndex(idx);
    const fall = new THREE.Mesh(fg, waterfallMaterial());
    fall.renderOrder = 2; fall.userData.noShadow = true;
    g.add(fall);

    // bassin : eau sombre qui reflète, vaguelettes qui bougent
    const nrm = waterNormals();
    nrm.repeat.set(3, 3);
    const water = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48), new THREE.MeshPhysicalMaterial({
      color: '#1b3b38', roughness: .06, metalness: 0, normalMap: nrm, normalScale: new THREE.Vector2(.35, .35),
      clearcoat: 1, clearcoatRoughness: .05, transparent: true, opacity: .93, envMapIntensity: 1.4,
    }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, .06, -20.4);
    water.scale.set(1.25, .9, 1);
    water.receiveShadow = true; water.userData.noShadow = true;
    g.add(water);
    updaters.push((dt) => { nrm.offset.x += dt * .02; nrm.offset.y -= dt * .035; });
    // margelle
    const rim = new THREE.Mesh(worldUv(new THREE.TorusGeometry(4.7, .32, 8, 40), .5), M.stoneDark([1, 1]));
    rim.rotation.x = Math.PI / 2; rim.position.set(0, .12, -20.4); rim.scale.set(1.25, .9, 1);
    rim.receiveShadow = true;
    g.add(rim);
    // écume au pied de la cascade
    const foam = glowPoints(140, () => [rnd(-2.2, 2.2), rnd(0, .4), IDOL_Z + 3 + rnd(-.4, .6)],
      { color: '#9fb8bc', size: .55, drift: .35, rise: .5, height: 1.6 });
    g.add(foam);
    // le bassin déborde sur la balustrade : pas de collision à gérer, il est hors de la cour
  }

  // ---------- arbres colosses + palmiers ----------
  const trunkGeos: THREE.BufferGeometry[] = [];
  const canopy: THREE.Matrix4[] = [], fronds: THREE.Matrix4[] = [];
  const treeTops: THREE.Vector3[] = [];
  const trees: [number, number][] = [];
  for (let i = 0; i < 90; i++) {
    const a = sr(-Math.PI, Math.PI), r = sr(WALL_R + 3, 48);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inCameraLane(x, z)) continue;
    if (Math.abs(x) < 7 && z < -19 && z > -30) continue;        // devant l'idole
    if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 5.2)) continue;
    trees.push([x, z]);
  }
  for (const [x, z] of trees) {
    const far = Math.hypot(x, z) > 30;
    const h = far ? sr(22, 32) : sr(17, 26), lean = new THREE.Vector3(-x, 0, -z).normalize().multiplyScalar(sr(1.5, 4));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -.4, z), new THREE.Vector3(x + lean.x * .2 + sr(-.6, .6), h * .35, z + lean.z * .2),
      new THREE.Vector3(x + lean.x * .6, h * .7, z + lean.z * .6), new THREE.Vector3(x + lean.x, h, z + lean.z),
    ]);
    const r0 = far ? sr(1.2, 1.9) : sr(.9, 1.5);
    trunkGeos.push(taperTube(curve, r0, r0 * .38, 20, 12, 6));
    // contreforts : racines-planches qui s'étalent au sol
    for (let k = 0; k < 5; k++) {
      const ra = sr(0, TAU), len = sr(2.2, 3.6);
      const root = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, h * .12, z),
        new THREE.Vector3(x + Math.cos(ra) * len * .45, sr(.6, 1.2), z + Math.sin(ra) * len * .45),
        new THREE.Vector3(x + Math.cos(ra) * len, -.15, z + Math.sin(ra) * len),
      ]);
      trunkGeos.push(taperTube(root, r0 * .45, .08, 10, 7, 2));
    }
    // branches maîtresses vers la cour, couronnées de feuillage
    const top = new THREE.Vector3(x + lean.x, h, z + lean.z);
    treeTops.push(top);
    const inward = new THREE.Vector3(-x, 0, -z).normalize();
    for (let b = 0; b < 4; b++) {
      const dir = inward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), sr(-1.4, 1.4));
      const len = sr(4, 8.5);
      const end = top.clone().add(dir.clone().multiplyScalar(len)).add(new THREE.Vector3(0, sr(-2.5, 1.5), 0));
      const br = new THREE.CatmullRomCurve3([top.clone().add(new THREE.Vector3(0, -2.5, 0)), top.clone().lerp(end, .5).add(new THREE.Vector3(0, 1, 0)), end]);
      trunkGeos.push(taperTube(br, r0 * .32, .1, 10, 7, 2));
      for (let k = 0; k < 16; k++) {
        const c = end.clone().add(new THREE.Vector3(sr(-3, 3), sr(-1.4, 1.8), sr(-3, 3)));
        canopy.push(mtx(c.x, c.y, c.z, sr(2.2, 3.6), sr(0, TAU), sr(-1.3, -.2), sr(-.4, .4)));
      }
    }
    for (let k = 0; k < 18; k++) {
      const c = top.clone().add(new THREE.Vector3(sr(-4, 4), sr(-1, 3), sr(-4, 4)));
      canopy.push(mtx(c.x, c.y, c.z, sr(2.4, 3.8), sr(0, TAU), sr(-1.3, -.2), sr(-.4, .4)));
    }
  }
  // palmiers plus bas, côté cour, pour le premier plan
  for (let i = 0; i < 9; i++) {
    const a = sr(-Math.PI, Math.PI), r = sr(WALL_R + 1.4, WALL_R + 6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inCameraLane(x, z) || (Math.abs(x) < 8 && z < -16)) continue;
    const h = sr(7, 11), bend = new THREE.Vector3(-x, 0, -z).normalize().multiplyScalar(sr(1.2, 2.6));
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -.2, z), new THREE.Vector3(x + bend.x * .2, h * .5, z + bend.z * .2), new THREE.Vector3(x + bend.x, h, z + bend.z),
    ]);
    trunkGeos.push(taperTube(curve, .32, .2, 14, 9, 8));
    for (let k = 0; k < 11; k++) {
      const fa = (k / 11) * TAU + sr(-.2, .2);
      fronds.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x + bend.x, h, z + bend.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(sr(.9, 1.5), fa, 0, 'YXZ')),
        new THREE.Vector3(1, 1, 1)));
    }
  }
  // canopée continue au-dessus de la cour : une seule trouée au centre, par où tombe le soleil
  for (let i = 0; i < D(1500); i++) {
    const a = sr(-Math.PI, Math.PI), r = 10 + Math.pow(srand(), .8) * 36;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = 13.5 + (r - 10) * .2 + sr(-1.5, 2.5);
    canopy.push(mtx(x, y, z, sr(2.6, 4.2), sr(0, TAU), sr(-1.4, -.3), sr(-.5, .5)));
  }
  const trunks = new THREE.Mesh(mergeGeometries(trunkGeos), M.bark([1, 1]));
  trunks.castShadow = true; trunks.receiveShadow = true;
  g.add(trunks);
  {
    const mat = leafify(new THREE.MeshStandardMaterial({ map: leafTexture('cluster'), roughness: .62, alphaTest: .45 }), SUN_DIR, SUN_COLOR, .75, .05);
    const im = new THREE.InstancedMesh(leafGeometry(1.6, 1.6, .25, .2), mat, canopy.length);
    canopy.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = false;
    g.add(im);
    const pm = leafify(new THREE.MeshStandardMaterial({ map: leafTexture('palm', .02), roughness: .55, alphaTest: .4 }), SUN_DIR, SUN_COLOR, .9, .06);
    const pf = new THREE.InstancedMesh(leafGeometry(1.8, 5.2, .55, .12), pm, fronds.length);
    fronds.forEach((m, i) => pf.setMatrixAt(i, m));
    pf.castShadow = true;
    g.add(pf);
    // massifs au-delà du mur : des buissons denses qui ferment l'horizon
    const bush: THREE.Matrix4[] = [];
    for (let i = 0; i < D(170); i++) {
      const a = sr(-Math.PI, Math.PI), r = sr(WALL_R + 1.2, 46);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 6 && z < -18 && z > -28) continue;
      const low = inCameraLane(x, z);
      const R = low ? sr(.7, 1.2) : sr(1.6, 3.4), H = low ? sr(.6, 1.1) : sr(1.4, 3.6);
      const n = low ? 6 : 16;
      for (let k = 0; k < n; k++) {
        const th = sr(0, TAU), ph = sr(0, Math.PI / 2);
        const px = x + Math.cos(th) * Math.cos(ph) * R, py = Math.sin(ph) * H, pz = z + Math.sin(th) * Math.cos(ph) * R;
        bush.push(mtx(px, py, pz, sr(1.4, 2.4) * (low ? .7 : 1), sr(0, TAU), sr(-1.4, -.2), sr(-.6, .6)));
      }
    }
    const bm = new THREE.InstancedMesh(leafGeometry(1.6, 1.6, .25, .2), mat, bush.length);
    bush.forEach((m, i) => bm.setMatrixAt(i, m));
    bm.userData.noShadow = true;
    g.add(bm);
  }
  // silhouettes lointaines : deux rideaux de jungle peints, noyés dans la brume
  for (const [R, H, hue] of [[64, 46, 0], [82, 60, .02]] as [number, number, number][]) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
    const x = c.getContext('2d')!;
    x.fillStyle = `hsl(${100 + hue * 200},30%,${20 + hue * 100}%)`;
    for (let i = 0; i < 70; i++) {               // houppiers
      const cx = Math.random() * 2048, cy = 120 + Math.random() * 160, r = 40 + Math.random() * 90;
      x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
      x.fillRect(cx - 6, cy, 12, 512);             // troncs
    }
    x.fillRect(0, 260, 2048, 252);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 3;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), new THREE.MeshBasicMaterial({
      map: t, transparent: true, alphaTest: .5, side: THREE.BackSide, fog: true,
    }));
    ring.position.y = H / 2 - 2; ring.userData.noShadow = true;
    g.add(ring);
  }

  // ---------- sous-bois : grandes feuilles, fougères, plantes, racines, rochers ----------
  {
    const broad: THREE.Matrix4[] = [], banana: THREE.Matrix4[] = [];
    const clump = (x: number, z: number, n: number, kind: 'broad' | 'banana', s = 1) => {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + sr(-.3, .3);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(sr(.25, .75), a, 0, 'YXZ')),
          new THREE.Vector3(s * sr(.8, 1.2), s * sr(.8, 1.2), s));
        (kind === 'broad' ? broad : banana).push(m);
      }
    };
    for (let i = 0; i < 70; i++) {
      const a = sr(-Math.PI, Math.PI);
      const r = srand() < .55 ? sr(WALL_R + .8, WALL_R + 4) : sr(WALL_R + 4, 30);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 6.5 && z < -16) continue;
      const small = inCameraLane(x, z);
      clump(x, z, small ? 4 : 7, srand() < .6 ? 'broad' : 'banana', small ? .7 : sr(1.1, 1.8));
    }
    // quelques touffes dans la cour, au pied du mur, entre les machines
    for (let i = 0; i < 16; i++) {
      const a = sr(-Math.PI, Math.PI), r = sr(arenaR - .9, arenaR + .6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 3.4)) continue;
      if (Math.hypot(shopPos.x - x, shopPos.z - z) < 3.2 || Math.hypot(radioPos.x - x, radioPos.z - z) < 3) continue;
      if (z > 6) continue;
      clump(x, z, 5, 'broad', .8);
    }
    const bm = leafify(new THREE.MeshStandardMaterial({ map: leafTexture('broad', -.01), roughness: .5, alphaTest: .45 }), SUN_DIR, SUN_COLOR, 1, .04);
    const bi = new THREE.InstancedMesh(leafGeometry(1.35, 1.9, .45, .25), bm, broad.length);
    broad.forEach((m, i) => bi.setMatrixAt(i, m));
    bi.castShadow = true;
    const nm = leafify(new THREE.MeshStandardMaterial({ map: leafTexture('banana', .03), roughness: .5, alphaTest: .45 }), SUN_DIR, SUN_COLOR, 1, .07);
    const ni = new THREE.InstancedMesh(leafGeometry(1.05, 3.4, .6, .2), nm, banana.length);
    banana.forEach((m, i) => ni.setMatrixAt(i, m));
    ni.castShadow = true;
    g.add(bi, ni);

    // modèles Poly Haven : fougères, calathéas, anthuriums, arbustes
    const scatter = (id: string, n: number, h: [number, number], ring: [number, number], o: { leaf?: number; shadow?: boolean; inside?: boolean } = {}) => {
      const vs = parts(id);
      const per: THREE.Matrix4[][] = vs.map(() => []);
      for (let i = 0; i < n; i++) {
        const a = sr(-Math.PI, Math.PI), r = sr(ring[0], ring[1]);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) < 6 && z < -16.5 && z > -26) continue;
        if (o.inside) {
          if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 3.1)) continue;
          if (Math.hypot(shopPos.x - x, shopPos.z - z) < 3 || Math.hypot(radioPos.x - x, radioPos.z - z) < 2.8) continue;
        }
        const v = Math.floor(srand() * vs.length);
        const s = sr(h[0], h[1]) / heightOf(vs[v].geometry);
        per[v].push(mtx(x, 0, z, s, sr(0, TAU)));
      }
      vs.forEach((v, i) => { const im = instance(v, per[i], { shadow: o.shadow, leaf: o.leaf, sway: .03 }); if (im) g.add(im); });
    };
    scatter('fern_02', D(85), [.9, 1.7], [arenaR - .6, 26], { leaf: .8, inside: true });
    scatter('calathea_orbifolia_01', D(24), [.6, 1.1], [arenaR + 1.5, 22], { leaf: .7 });
    scatter('anthurium_botany_01', D(18), [.6, 1.2], [arenaR - .4, arenaR + 5], { leaf: .7, inside: true });
    scatter('shrub_03', D(24), [1.2, 2.4], [WALL_R + 2, 28], { leaf: .6 });
    scatter('root_cluster_01', D(5), [.8, 1.4], [WALL_R + 1, 22], { shadow: true });
    scatter('rock_moss_set_01', D(16), [.6, 1.6], [WALL_R + .6, 28], { shadow: true });
    scatter('tree_stump_01', D(4), [.8, 1.2], [WALL_R + 2, 22], { shadow: true });
    // fougères sur le haut des murs : la jungle a repris la pierre
    const fv = parts('fern_02');
    const perTop: THREE.Matrix4[][] = fv.map(() => []);
    for (const t of wallTops) {
      const v = Math.floor(srand() * fv.length);
      perTop[v].push(mtx(t.x + sr(-.3, .3), t.y, t.z + sr(-.3, .3), sr(.9, 1.4) / heightOf(fv[v].geometry), sr(0, TAU)));
    }
    fv.forEach((v, i) => { const im = instance(v, perTop[i], { leaf: .8, sway: .04 }); if (im) g.add(im); });
  }

  // ---------- lianes ----------
  {
    const vineGeos: THREE.BufferGeometry[] = [];
    const leaves: THREE.Matrix4[] = [];
    const vine = (from: THREE.Vector3, to: THREE.Vector3, sag: number) => {
      const mid = from.clone().lerp(to, .5).add(new THREE.Vector3(0, -sag, 0));
      const c = new THREE.CatmullRomCurve3([from, from.clone().lerp(mid, .5).add(new THREE.Vector3(sr(-.3, .3), 0, sr(-.3, .3))), mid, to]);
      vineGeos.push(taperTube(c, .05, .035, 18, 5, 8));
      const n = Math.floor(c.getLength() * 2.2);
      for (let k = 0; k < n; k++) {
        const p = c.getPointAt(k / n);
        leaves.push(mtx(p.x, p.y, p.z, sr(.22, .38), sr(0, TAU), sr(-1, 1), sr(-1, 1)));
      }
    };
    // lianes qui tombent de la canopée dans la cour
    for (let i = 0; i < 22; i++) {
      const a = sr(-Math.PI, Math.PI), r = sr(arenaR - 3.5, arenaR + 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inCameraLane(x, z) && z > 6) continue;
      const top = new THREE.Vector3(x, sr(14, 17), z);
      const bot = new THREE.Vector3(x + sr(-.6, .6), sr(5.5, 9.5), z + sr(-.6, .6));
      vine(top, bot, 0);
    }
    // guirlandes entre les arbres et le haut des murs
    for (let i = 0; i < 6 && wallTops.length; i++) {
      const w = wallTops[Math.floor(srand() * wallTops.length)];
      // la tête d'arbre la plus proche de ce mur : la guirlande reste sur le pourtour
      const t = [...treeTops].sort((p, q) => p.distanceTo(w) - q.distanceTo(w))[0];
      if (!t || w.z > 0) continue;
      vine(w.clone(), t.clone().add(new THREE.Vector3(0, -sr(3, 6), 0)), sr(1.5, 3.5));
    }
    if (vineGeos.length) {
      const vm = new THREE.Mesh(mergeGeometries(vineGeos), new THREE.MeshStandardMaterial({ color: '#3d5a24', roughness: .85, map: M.bark().map }));
      vm.castShadow = true;
      g.add(vm);
      const lm = leafify(new THREE.MeshStandardMaterial({ map: leafTexture('heart', .02), roughness: .55, alphaTest: .45 }), SUN_DIR, SUN_COLOR, 1, .02);
      const li = new THREE.InstancedMesh(leafGeometry(1, 1.2, .2, .2), lm, leaves.length);
      leaves.forEach((m, i) => li.setMatrixAt(i, m));
      g.add(li);
    }
  }

  // ---------- braseros ----------
  const torches: { light: THREE.PointLight; base: number; ph: number }[] = [];
  const brazier = (x: number, z: number, solid: boolean) => {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    const ped = stoneBlock(.9, 1.05, .9, M.stoneDark(), .08); ped.position.y = .52;
    const neck = new THREE.Mesh(worldUv(new THREE.CylinderGeometry(.32, .45, .3, 10), .6), M.stone()); neck.position.y = 1.2;
    const pit = cloneModel('stone_fire_pit');
    pit.scale.setScalar(.42); pit.position.y = 1.3;
    const coals = new THREE.Mesh(new THREE.CircleGeometry(.42, 16), glow('#ff6a20', 4));
    coals.rotation.x = -Math.PI / 2; coals.position.y = 1.42; coals.userData.noShadow = true;
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flameMaterial());
    flame.scale.set(1.15, 1.9, 1); flame.position.y = 1.42; flame.userData.noShadow = true; flame.frustumCulled = false;
    const flame2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flameMaterial());
    flame2.scale.set(.75, 1.35, 1); flame2.position.set(.12, 1.42, .05); flame2.userData.noShadow = true; flame2.frustumCulled = false;
    const light = new THREE.PointLight('#ff9a4a', 18, 11, 1.8);
    light.position.y = 2.2;
    b.add(ped, neck, pit, coals, flame, flame2, light);
    b.traverse(o => { if ((o as THREE.Mesh).isMesh && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
    const embers = glowPoints(26, () => [rnd(-.3, .3), 1.5 + rnd(0, 1), rnd(-.3, .3)], { color: '#ffb060', size: .09, drift: .25, rise: .55, height: 2.6 });
    b.add(embers);
    g.add(b);
    torches.push({ light, base: 18, ph: Math.random() * 10 });
    if (solid) solids.push({ p: new THREE.Vector3(x, 0, z), r: .75 });
  };
  brazier(-5.6, 12.8, true); brazier(5.6, 12.8, true);
  brazier(-15.1, -8.6, false); brazier(15.1, -8.6, false);
  brazier(-3.1, -16.6, false); brazier(3.1, -16.6, false);
  updaters.push((_dt, t) => {
    for (const tc of torches) {
      tc.light.intensity = tc.base * (.82 + Math.sin(t * 11 + tc.ph) * .07 + Math.sin(t * 23.7 + tc.ph * 2) * .06 + Math.sin(t * 4.1 + tc.ph) * .05);
    }
  });

  // ---------- faisceaux de soleil sur chaque machine ----------
  {
    const L = 22;
    const targets = [...spots.map(s => s.clone().setY(1.6)), new THREE.Vector3(0, 0, 4), new THREE.Vector3(-6, 0, -4), new THREE.Vector3(7, 0, -2)];
    targets.forEach((tg, i) => {
      const from = tg.clone().add(SUN_DIR.clone().multiplyScalar(L));
      const main = i < spots.length;
      const geo = new THREE.CylinderGeometry(main ? 1.1 : .7, main ? 2.4 : 1.9, L, 24, 1, true);
      geo.translate(0, L / 2, 0);
      const shaft = new THREE.Mesh(geo, shaftMaterial('#ffe8b8', main ? 1 : .7));
      shaft.position.copy(tg);
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SUN_DIR);
      shaft.renderOrder = 4; shaft.userData.noShadow = true;
      g.add(shaft);
      if (main) {
        const sp = new THREE.SpotLight('#ffe4b0', 70, 30, .2, .6, 1.4);
        sp.position.copy(from); sp.target.position.copy(tg);
        g.add(sp, sp.target);
        highOnly.push(sp);
      }
    });
    // poussière en suspension dans la lumière
    const dust = glowPoints(500, () => {
      const tg = targets[Math.floor(Math.random() * targets.length)];
      const t = Math.random() * 14;
      const p = tg.clone().add(SUN_DIR.clone().multiplyScalar(t));
      return [p.x + rnd(-1.4, 1.4), p.y, p.z + rnd(-1.4, 1.4)];
    }, { color: '#fff2cc', size: .05, drift: .5 });
    g.add(dust);
  }

  // ---------- vie : lucioles, papillons morphos, feuilles qui tombent, brume ----------
  g.add(glowPoints(170, () => {
    const a = rnd(-Math.PI, Math.PI), r = rnd(arenaR - 2, 30);
    return [Math.cos(a) * r, rnd(.4, 4.5), Math.sin(a) * r];
  }, { color: '#d9ff7a', size: .13, blink: 1, drift: .9 }));

  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d')!;
    for (const s of [-1, 1]) {
      x.save(); x.translate(128, 64); x.scale(s, 1);
      const gr = x.createRadialGradient(10, 0, 4, 40, 0, 110);
      gr.addColorStop(0, '#9ff4ff'); gr.addColorStop(.45, '#1f7ae0'); gr.addColorStop(.8, '#0a2a7a'); gr.addColorStop(1, '#050510');
      x.fillStyle = gr;
      x.beginPath(); x.moveTo(4, 0); x.bezierCurveTo(30, -70, 120, -66, 118, -22); x.bezierCurveTo(110, 6, 60, 10, 4, 4);
      x.bezierCurveTo(50, 20, 96, 40, 70, 60); x.bezierCurveTo(46, 72, 14, 40, 4, 6); x.fill();
      x.fillStyle = '#ffffff';
      for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(98 - k * 8, -30 + k * 5, 3, 0, TAU); x.fill(); }
      x.restore();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const wm = new THREE.MeshStandardMaterial({ map: tex, alphaTest: .3, side: THREE.DoubleSide, roughness: .3, metalness: .4, emissive: '#1e5fd8', emissiveIntensity: .5 });
    const flies: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; c: THREE.Vector3; ph: number; s: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const bf = new THREE.Group();
      bf.scale.setScalar(.42);
      const half = (s: number) => {
        const geo = new THREE.PlaneGeometry(.5, .5);
        geo.translate(s * .25, 0, 0);
        const uv = geo.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setX(k, s > 0 ? .5 + uv.getX(k) * .5 : uv.getX(k) * .5);
        const m = new THREE.Mesh(geo, wm); m.rotation.x = -Math.PI / 2; m.userData.noShadow = true; m.userData.keep = true;
        return m;
      };
      const l = half(-1), r = half(1);
      const pl = new THREE.Group(); pl.add(l); const pr = new THREE.Group(); pr.add(r);
      bf.add(pl, pr);
      const a = rnd(-Math.PI, Math.PI), rr = rnd(5, 15);
      flies.push({ g: bf, l: pl as any, r: pr as any, c: new THREE.Vector3(Math.cos(a) * rr, rnd(2, 5), Math.sin(a) * rr), ph: rnd(0, 10), s: rnd(.6, 1.1) });
      g.add(bf);
    }
    updaters.push((_dt, t) => {
      for (const f of flies) {
        const k = t * .35 * f.s + f.ph;
        const p = new THREE.Vector3(f.c.x + Math.sin(k) * 3.2, f.c.y + Math.sin(k * 2.3) * .6, f.c.z + Math.sin(k * .7 + 1) * 3.2);
        const ahead = new THREE.Vector3(f.c.x + Math.sin(k + .05) * 3.2, p.y, f.c.z + Math.sin((k + .05) * .7 + 1) * 3.2);
        f.g.position.copy(p); f.g.lookAt(ahead);
        const flap = Math.sin(t * 16 * f.s + f.ph) * 1.1;
        f.l.rotation.z = flap; f.r.rotation.z = -flap;
      }
    });
  }

  {
    const n = 46;
    const lm = new THREE.MeshStandardMaterial({ map: leafTexture('heart', .08), alphaTest: .4, side: THREE.DoubleSide, roughness: .7, color: '#e8c870' });
    const fl = new THREE.InstancedMesh(leafGeometry(.32, .4, .1, .1), lm, n);
    fl.userData.noShadow = true;
    const st = Array.from({ length: n }, () => ({ x: rnd(-15, 15), y: rnd(0, 16), z: rnd(-16, 12), s: rnd(.5, 1.2), ph: rnd(0, 10) }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc3 = new THREE.Vector3(1, 1, 1);
    g.add(fl);
    updaters.push((dt, t) => {
      st.forEach((s, i) => {
        s.y -= dt * .55 * s.s;
        if (s.y < 0) { s.y = 16; s.x = rnd(-15, 15); s.z = rnd(-16, 12); }
        e.set(t * 1.7 * s.s + s.ph, t * .9 + s.ph, Math.sin(t * 2 + s.ph));
        q.setFromEuler(e);
        v.set(s.x + Math.sin(t * .8 + s.ph) * 1.2, s.y, s.z + Math.cos(t * .6 + s.ph) * .8);
        m4.compose(v, q, sc3); fl.setMatrixAt(i, m4);
      });
      fl.instanceMatrix.needsUpdate = true;
    });
  }

  {
    // brume au sol : grands voiles doux qui dérivent au pied des murs et autour du bassin
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d')!;
    for (let k = 0; k < 40; k++) {
      const gx = rnd(40, 216), gy = rnd(40, 216), gr = rnd(30, 90);
      const gg = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, 'rgba(255,255,255,.18)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gg; x.fillRect(0, 0, 256, 256);
    }
    const mt = new THREE.CanvasTexture(c);
    const mm = new THREE.MeshBasicMaterial({ map: mt, transparent: true, depthWrite: false, color: '#e6f0d8', opacity: .55 });
    const veils: THREE.Mesh[] = [];
    const add = (px: number, pz: number, s: number, y = .5) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mm);
      m.rotation.x = -Math.PI / 2; m.position.set(px, y, pz); m.userData.noShadow = true; m.userData.ph = Math.random() * 10;
      m.renderOrder = 3;
      veils.push(m); g.add(m);
    };
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; add(Math.cos(a) * (WALL_R + 1.5), Math.sin(a) * (WALL_R + 1.5), rnd(7, 11), rnd(.3, .8)); }
    for (let i = 0; i < 4; i++) add(rnd(-3, 3), -21 + rnd(-1, 1), rnd(6, 8), rnd(.5, 1.6));
    updaters.push((_dt, t) => { for (const v of veils) { v.rotation.z = t * .02 + v.userData.ph; } });
  }

  // les yeux de l'idole pulsent doucement
  const eyes: THREE.Mesh[] = [];
  g.traverse(o => { if (o.userData.eye) eyes.push(o as THREE.Mesh); });
  updaters.push((_dt, t) => {
    for (const e of eyes) (e.material as THREE.MeshStandardMaterial).emissiveIntensity = 4.5 + Math.sin(t * 1.4) * 1.5;
  });

  return {
    group: g, solids, highOnly, sun,
    punch(x, z, hx, hz, rot) {
      groundMat?.userData.hole.value.set(x, z, hx, hz);
      if (groundMat) groundMat.userData.holeRot.value = rot;
    },
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}
