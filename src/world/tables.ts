// ============================================================
// Mobilier de jeu « comme au vrai casino » : tables de blackjack en haricot à
// boudin de cuir, roulette avec cylindre encastré et tableau des derniers numéros,
// poker ovale, chaises de casino, cartes, sabot, panneau de mises, lampes de table.
// ============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { box, cyl, mesh, MAT, glowMat, canvasTex, onTick, rnd, glowTex, wheelTex, rouletteFeltTex, blackjackFeltTex } from '../gfx/kit';

/** Regroupe des géométries par matériau, puis les fusionne (un appel de rendu par matériau). */
export class Kit {
  m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, ...g: THREE.BufferGeometry[]) { if (!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat)!.push(...g); }
  flush(parent: THREE.Object3D, shadow = true) { for (const [mt, gs] of this.m) if (gs.length) parent.add(mesh(gs, mt, shadow && !(mt as any).isMeshBasicMaterial)); this.m.clear(); }
}
const T = (g: THREE.BufferGeometry, x: number, z: number, r: number, y = 0) => g.applyMatrix4(new THREE.Matrix4().makeRotationY(r).setPosition(x, y, z));

// ---------- matériaux partagés ----------
export const M = {
  wood: MAT.lacquer('#2a140a', .38),
  woodLight: MAT.lacquer('#5a2e16', .35),
  leather: new THREE.MeshStandardMaterial({ color: '#160a07', roughness: .42 }),
  seat: new THREE.MeshPhysicalMaterial({ color: '#6a1018', roughness: .55, sheen: 1, sheenColor: new THREE.Color('#ff8090'), sheenRoughness: .5 }),
  seatGreen: new THREE.MeshPhysicalMaterial({ color: '#0f3a2a', roughness: .5, sheen: 1, sheenColor: new THREE.Color('#80ffc0'), sheenRoughness: .5 }),
  brass: MAT.brass(), gold: MAT.gold(), chrome: MAT.chrome(), black: MAT.blackMetal(),
  glassClear: new THREE.MeshStandardMaterial({ color: '#cfe0ea', roughness: .05, metalness: .2, transparent: true, opacity: .25 }),
};

// ---------- textures ----------
const SUITS: [string, string, string][] = [['A', '♠', '#111'], ['K', '♥', '#c4101d'], ['Q', '♦', '#c4101d'], ['10', '♣', '#111'], ['7', '♥', '#c4101d'], ['9', '♠', '#111'], ['J', '♦', '#c4101d']];
let cardsT: THREE.Texture | null = null;
function cardsTex() {
  return cardsT ??= canvasTex(512, 256, (c) => {
    for (let i = 0; i < 8; i++) {
      const x = (i % 4) * 128, y = Math.floor(i / 4) * 128;
      c.save(); c.translate(x + 18, y + 4);
      c.fillStyle = '#fbf8f0'; c.beginPath(); c.roundRect(0, 0, 92, 120, 8); c.fill();
      if (i === 7) {
        c.fillStyle = '#8a1020'; c.beginPath(); c.roundRect(5, 5, 82, 110, 6); c.fill();
        c.strokeStyle = 'rgba(255,220,180,.6)'; c.lineWidth = 1.5;
        for (let k = -120; k < 120; k += 9) { c.beginPath(); c.moveTo(5 + k, 5); c.lineTo(5 + k + 110, 115); c.stroke(); c.beginPath(); c.moveTo(87 - k, 5); c.lineTo(87 - k - 110, 115); c.stroke(); }
      } else {
        const [r, s, col] = SUITS[i];
        c.fillStyle = col; c.font = 'bold 26px Georgia'; c.textAlign = 'left'; c.fillText(r, 8, 28);
        c.font = '22px Georgia'; c.fillText(s, 9, 50);
        c.font = '58px Georgia'; c.textAlign = 'center'; c.fillText(s, 46, 88);
      }
      c.restore();
    }
  });
}
/** Carte posée à plat ; `i` = 0..6 face visible, 7 = dos. */
function cardGeo(i: number, x: number, z: number, rot: number, y: number) {
  const g = new THREE.PlaneGeometry(.063, .088).rotateX(-Math.PI / 2);
  const u0 = (i % 4) / 4 + 18 / 512, v1 = 1 - Math.floor(i / 4) / 2 - 4 / 256, u1 = u0 + 92 / 512, v0 = v1 - 120 / 256;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
  return g.rotateY(rot).translate(x, y, z);
}
let cardMat: THREE.MeshStandardMaterial | null = null;
const cards = () => cardMat ??= new THREE.MeshStandardMaterial({ map: cardsTex(), roughness: .5 });

function ledTex(lines: string[], col = '#ff3322') {
  return canvasTex(256, 160, (c, w, h) => {
    c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 10; c.textAlign = 'center';
    c.font = 'bold 40px "Courier New", monospace';
    lines.forEach((l, i) => c.fillText(l, w / 2, 58 + i * 58));
  });
}
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Tableau lumineux des derniers numéros sortis (colonne à côté de la roulette). */
function marqueeTex() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const nums = Array.from({ length: 10 }, () => Math.floor(rnd() * 37));
  const draw = () => {
    const c = cv.getContext('2d')!;
    c.fillStyle = '#060606'; c.fillRect(0, 0, 128, 512);
    c.fillStyle = '#d9a441'; c.font = 'bold 18px Georgia'; c.textAlign = 'center'; c.fillText('DERNIERS', 64, 26); c.fillText('NUMÉROS', 64, 46);
    nums.forEach((n, i) => {
      const col = n === 0 ? '#28d26a' : RED.has(n) ? '#ff3a3a' : '#f2f2f2';
      c.font = `bold ${i === 0 ? 56 : 38}px "Courier New", monospace`; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = i === 0 ? 14 : 6;
      const xx = n === 0 ? 64 : RED.has(n) ? 40 : 88;
      c.fillText(String(n), xx, 108 + i * 41 + (i ? 14 : 0));
      c.shadowBlur = 0;
    });
    t.needsUpdate = true;
  };
  draw();
  let next = 7 + rnd() * 10;
  onTick((time) => { if (time > next) { next = time + 12 + rnd() * 10; nums.unshift(Math.floor(Math.random() * 37)); nums.pop(); draw(); } });
  return t;
}
function trayTex() {
  return canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#0a0806'; c.fillRect(0, 0, w, h);
    const cols = ['#c4141e', '#c4141e', '#1a3fbf', '#1a3fbf', '#111', '#111', '#178a3a', '#e8e0cc', '#e8e0cc', '#7a1aa8', '#d4a020', '#d4a020'];
    cols.forEach((col, i) => {
      const x = 4 + i * 20.6;
      c.fillStyle = col; c.fillRect(x, 4, 17, h - 8);
      c.fillStyle = 'rgba(255,255,255,.55)'; for (let y = 6; y < h - 6; y += 5) c.fillRect(x, y, 17, 1);
    });
  });
}
function pokerFeltTex() {
  return canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#0c3b3a'; c.fillRect(0, 0, w, h);
    const img = c.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) { const k = (Math.random() - .5) * 12; img.data[i] += k; img.data[i + 1] += k; img.data[i + 2] += k; }
    c.putImageData(img, 0, 0);
    const v = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * .6); v.addColorStop(0, 'rgba(255,255,255,.08)'); v.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = v; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(217,164,65,.55)'; c.lineWidth = 3; c.beginPath(); c.roundRect(150, 110, w - 300, h - 220, 140); c.stroke();
    c.fillStyle = 'rgba(217,164,65,.6)'; c.textAlign = 'center'; c.font = 'italic 46px "Playfair Display"'; c.fillText('Grand Casino', w / 2, h / 2 - 6);
    c.font = '20px "Bebas Neue"'; (c as any).letterSpacing = '8px'; c.fillText('SALON PRIVÉ', w / 2, h / 2 + 30);
  });
}
let poolT: THREE.Texture | null = null;
/** Flaque de lumière d'une lampe de table : ellipse additive posée sur le tapis. */
export function lightPool(w: number, d: number, x: number, y: number, z: number, power: number, rot = 0) {
  poolT ??= glowTex();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: poolT, color: new THREE.Color('#ffd9a6').multiplyScalar(power), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  m.position.set(x, y, z); m.rotation.y = rot; m.renderOrder = 2;
  m.layers.set(1);   // inutile dans le reflet du sol : on économise un appel de rendu
  return m;
}

// ---------- chaise de casino (dossier rembourré, pied central) ----------
export function chair(k: Kit, x: number, z: number, r: number, seatMat: THREE.Material = M.seat) {
  k.add(seatMat,
    T(new RoundedBoxGeometry(.5, .11, .48, 2, .045).translate(0, .63, 0), x, z, r),
    T(new RoundedBoxGeometry(.48, .5, .09, 2, .04).rotateX(-.12).translate(0, .97, -.22), x, z, r));
  k.add(M.wood, T(box(.52, .06, .1, 0, 1.23, -.255), x, z, r), T(box(.5, .05, .46, 0, .565, 0), x, z, r));
  k.add(M.brass, T(cyl(.028, .028, .5, 0, .3, 0, 8), x, z, r), T(cyl(.22, .25, .035, 0, .018, 0, 18), x, z, r),
    T(new THREE.TorusGeometry(.17, .012, 6, 18).rotateX(Math.PI / 2).translate(0, .25, 0), x, z, r));
}

// ---------- lampe suspendue au-dessus d'une table ----------
export function pendant(k: Kit, parent: THREE.Object3D, x: number, z: number, w: number, d: number, r: number, y: number, ceil: number, feltY: number) {
  const shade = MAT.lacquer('#0d2a1d', .35);
  k.add(shade, T(box(w, .26, d, 0, y + .13, 0), x, z, r));
  k.add(M.brass, T(box(w + .04, .04, d + .04, 0, y, 0), x, z, r), T(box(w + .04, .03, d + .04, 0, y + .27, 0), x, z, r),
    T(cyl(.012, .012, ceil - y - .27, -w * .35, (ceil + y + .27) / 2, 0, 6), x, z, r), T(cyl(.012, .012, ceil - y - .27, w * .35, (ceil + y + .27) / 2, 0, 6), x, z, r));
  k.add(glowMat('#ffe2b5', 3.2), T(new THREE.PlaneGeometry(w - .06, d - .06).rotateX(Math.PI / 2).translate(0, y - .005, 0), x, z, r));
  parent.add(lightPool(w * 2.1, d * 2.6, x, feltY + .004, z, .32, r));
  parent.add(lightPool(w * 3.6, d * 5, x, .02, z, .1, r));
}

// ---------- blackjack ----------
let bjFelt: THREE.MeshStandardMaterial | null = null;
export function blackjack(k: Kit, parent: THREE.Object3D, x: number, z: number, r: number, solids: number[][]) {
  const R = 1.62;
  bjFelt ??= new THREE.MeshStandardMaterial({ map: blackjackFeltTex(), roughness: .95 });
  const sh = new THREE.Shape(); sh.moveTo(-R, 0); sh.absarc(0, 0, R, Math.PI, 0, true); sh.lineTo(-R, 0);
  const top = new THREE.ShapeGeometry(sh, 40);
  const p = top.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / (2 * R) + .5; uv[i * 2 + 1] = 1 + p.getY(i) / R; }
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); top.rotateX(-Math.PI / 2);
  k.add(bjFelt, T(top.translate(0, .83, 0), x, z, r));
  const body = new THREE.ExtrudeGeometry(sh, { depth: .17, bevelEnabled: false, curveSegments: 40 }); body.rotateX(-Math.PI / 2);
  k.add(M.wood, T(body.translate(0, .655, 0), x, z, r));
  // piétement en retrait : on voit les jambes des joueurs sous la table, comme au vrai casino
  k.add(M.wood, T(box(1.5, .62, .5, 0, .34, .55), x, z, r), T(box(1.7, .05, .7, 0, .025, .55), x, z, r));
  k.add(M.brass, T(new THREE.TorusGeometry(R - .2, .018, 6, 40, Math.PI).rotateX(Math.PI / 2).translate(0, .22, 0), x, z, r));
  const arc = (rad: number, y: number) => new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => { const a = Math.PI + i / 32 * Math.PI; return new THREE.Vector3(Math.cos(a) * rad, y, -Math.sin(a) * rad); }));
  k.add(M.leather, T(new THREE.TubeGeometry(arc(R + .02, .875), 48, .085, 10), x, z, r));
  k.add(M.woodLight, T(new THREE.TubeGeometry(arc(R + .06, .79), 48, .035, 6), x, z, r), T(box(2 * R + .1, .1, .12, 0, .84, .02), x, z, r));
  // plateau du croupier, sabot, défausse, panneau de mises
  k.add(new THREE.MeshStandardMaterial({ map: trayTex(), roughness: .5 }), T(new THREE.PlaneGeometry(.9, .2).rotateX(-Math.PI / 2).translate(0, .838, .17), x, z, r));
  k.add(M.black, T(box(.94, .02, .24, 0, .826, .17), x, z, r), T(box(.17, .11, .3, 0, 0, 0).rotateY(.5).translate(-1.0, .89, .3), x, z, r));
  k.add(M.glassClear, T(box(.12, .14, .16, .98, .9, .26), x, z, r));
  const led = new THREE.MeshBasicMaterial({ map: ledTex(['MIN 25 €', 'MAX 2 500']), color: new THREE.Color(1.6, 1.6, 1.6) });
  k.add(M.black, T(box(.26, .18, .05, .62, 1.02, .07), x, z, r), T(cyl(.012, .012, .1, .62, .88, .07, 6), x, z, r));
  k.add(led, T(new THREE.PlaneGeometry(.23, .15).translate(.62, 1.02, .096), x, z, r));
  // cartes et jetons : 6 places, mains en cours
  const cg: THREE.BufferGeometry[] = [];
  const chips: [number, number][] = [];
  for (let s = 0; s < 6; s++) {
    const a = Math.PI + .38 + s / 5 * (Math.PI - .76);
    const cx = Math.cos(a) * 1.05, cz = -Math.sin(a) * 1.05;
    const rot = -a - Math.PI / 2;
    if (s !== 2) { cg.push(cardGeo(Math.floor(rnd() * 7), cx - .02, cz, rot, .835), cardGeo(Math.floor(rnd() * 7), cx + .025, cz + .02, rot, .836)); }
    chips.push([Math.cos(a) * 1.3, -Math.sin(a) * 1.3]);
  }
  cg.push(cardGeo(0, -.04, .45, 0, .835), cardGeo(7, .04, .45, 0, .836));
  for (const g of cg) k.add(cards(), T(g, x, z, r));
  for (const [cx, cz] of chips) addStack(k, cx, cz, x, z, r, .835, 3 + Math.floor(rnd() * 5));
  for (let s = 0; s < 6; s++) {
    const a = Math.PI + .3 + s / 5 * (Math.PI - .6);
    const cx = Math.cos(a) * (R + .62), cz = -Math.sin(a) * (R + .62);
    const w = new THREE.Vector3(cx, 0, cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
    chair(k, x + w.x, z + w.z, Math.atan2(-cx, -cz) + r);
  }
  const ext = R + 1.0;
  solids.push([x - ext, z - ext, x + ext, z + ext]);
}

const chipMats = ['#c4141e', '#1a3fbf', '#111111', '#178a3a', '#ece4d0', '#7a1aa8'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .4 }));
const chipEdge = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .4 });
function addStack(k: Kit, cx: number, cz: number, x: number, z: number, r: number, y: number, n: number) {
  const mt = chipMats[Math.floor(rnd() * chipMats.length)];
  for (let i = 0; i < n; i++) k.add(i % 3 === 2 ? chipEdge : mt, T(cyl(.02, .02, .0034, cx + (rnd() - .5) * .003, y + .0017 + i * .0036, cz, 14), x, z, r));
}

// ---------- roulette ----------
let rlFelt: THREE.MeshStandardMaterial | null = null, wheelM: THREE.MeshStandardMaterial | null = null;
export function roulette(k: Kit, parent: THREE.Object3D, x: number, z: number, r: number, solids: number[][]) {
  rlFelt ??= new THREE.MeshStandardMaterial({ map: rouletteFeltTex(), roughness: .95 });
  wheelM ??= new THREE.MeshStandardMaterial({ map: wheelTex(), roughness: .3, metalness: .25 });
  k.add(M.wood, T(new RoundedBoxGeometry(4.7, .2, 1.75, 3, .06).translate(0, .68, 0), x, z, r));
  for (const px of [-1.5, 1.3]) k.add(M.wood, T(box(.7, .6, 1.0, px, .3, 0), x, z, r), T(box(.9, .04, 1.2, px, .02, 0), x, z, r));
  k.add(M.brass, T(cyl(.02, .02, 4.2, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(-.1, .2, .62), x, z, r), T(cyl(.02, .02, 4.2, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(-.1, .2, -.62), x, z, r));
  k.add(rlFelt, T(new THREE.PlaneGeometry(3.25, 1.5).rotateX(-Math.PI / 2).translate(-.6, .785, 0), x, z, r));
  const rect = new THREE.CatmullRomCurve3([
    [-2.35, .86], [0, .86], [2.35, .86], [2.38, 0], [2.35, -.86], [0, -.86], [-2.35, -.86], [-2.38, 0],
  ].map(([a, b]) => new THREE.Vector3(a, .83, b)), true, 'catmullrom', .08);
  k.add(M.leather, T(new THREE.TubeGeometry(rect, 80, .07, 8, true), x, z, r));
  // cuvette du cylindre
  k.add(M.woodLight, T(cyl(.66, .6, .16, 1.62, .86, 0, 40), x, z, r));
  k.add(M.wood, T(new THREE.TorusGeometry(.56, .045, 8, 40).rotateX(Math.PI / 2).translate(1.62, .935, 0), x, z, r));
  const wpos = new THREE.Vector3(1.62, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), r).add(new THREE.Vector3(x, 0, z));
  const wheel = new THREE.Group(); wheel.position.set(wpos.x, .925, wpos.z);
  wheel.add(new THREE.Mesh(new THREE.CircleGeometry(.5, 48).rotateX(-Math.PI / 2), wheelM));
  wheel.add(mesh([cyl(.02, .1, .16, 0, .08, 0, 12), new THREE.SphereGeometry(.035, 10, 8).translate(0, .18, 0),
    ...[0, 1, 2, 3].map(i => box(.32, .015, .015, 0, .13, 0).rotateY(i * Math.PI / 4))], M.gold, false));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.016, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff', roughness: .2 }));
  parent.add(wheel, ball);
  onTick((t, dt) => {
    wheel.rotation.y += dt * .8;
    const a = -t * 2.6, rr = .53 - .06 * (.5 + .5 * Math.sin(t * .4));
    ball.position.set(wpos.x + Math.cos(a) * rr, .945, wpos.z + Math.sin(a) * rr);
  });
  // tableau des derniers numéros
  const mq = new THREE.MeshBasicMaterial({ map: marqueeTex(), color: new THREE.Color(1.5, 1.5, 1.5) });
  k.add(M.black, T(cyl(.035, .035, 1.3, 2.25, .65, -1.05, 10), x, z, r), T(box(.32, 1.08, .14, 2.25, 1.85, -1.05), x, z, r), T(cyl(.2, .22, .04, 2.25, .02, -1.05, 16), x, z, r));
  k.add(mq, T(new THREE.PlaneGeometry(.27, 1.0).translate(2.25, 1.85, -.979), x, z, r), T(new THREE.PlaneGeometry(.27, 1.0).rotateY(Math.PI).translate(2.25, 1.85, -1.121), x, z, r));
  // mises posées et chaises
  for (let i = 0; i < 9; i++) addStack(k, -1.6 + rnd() * 2.6, -.5 + rnd() * 1.0, x, z, r, .786, 2 + Math.floor(rnd() * 6));
  k.add(M.gold, T(cyl(.025, .03, .07, -.4, .82, .12, 10), x, z, r));
  for (const [cx, cz, cr] of [[-1.6, 1.45, Math.PI], [-.6, 1.45, Math.PI], [.4, 1.45, Math.PI], [-1.6, -1.45, 0], [-.6, -1.45, 0], [-2.95, 0, Math.PI / 2]] as const) {
    const w = new THREE.Vector3(cx, 0, cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
    chair(k, x + w.x, z + w.z, cr + r);
  }
  const hw = r % Math.PI === 0 ? [3.4, 2.1] : [2.1, 3.4];
  solids.push([x - hw[0], z - hw[1], x + hw[0], z + hw[1]]);
}

// ---------- poker (salon privé) ----------
export function poker(k: Kit, parent: THREE.Object3D, x: number, z: number, solids: number[][]) {
  const L = 1.0, Wd = .95;
  const sh = new THREE.Shape();
  sh.moveTo(-L, -Wd); sh.lineTo(L, -Wd); sh.absarc(L, 0, Wd, -Math.PI / 2, Math.PI / 2, false); sh.lineTo(-L, Wd); sh.absarc(-L, 0, Wd, Math.PI / 2, Math.PI * 1.5, false);
  const top = new THREE.ShapeGeometry(sh, 32);
  const p = top.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / (2 * (L + Wd)) + .5; uv[i * 2 + 1] = p.getY(i) / (2 * Wd) + .5; }
  top.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); top.rotateX(-Math.PI / 2);
  k.add(new THREE.MeshStandardMaterial({ map: pokerFeltTex(), roughness: .95 }), top.translate(x, .8, z));
  const body = new THREE.ExtrudeGeometry(sh, { depth: .18, bevelEnabled: false, curveSegments: 32 }); body.rotateX(-Math.PI / 2);
  k.add(M.wood, body.translate(x, .615, z));
  for (const px of [-.9, .9]) k.add(M.wood, box(.5, .6, .7, x + px, .3, z), box(.7, .04, .9, x + px, .02, z));
  const pts = sh.getSpacedPoints(80).map(v => new THREE.Vector3(v.x * 1.03 + x, .84, -v.y * 1.06 + z));
  k.add(M.leather, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 100, .085, 10, true));
  const pts2 = sh.getSpacedPoints(80).map(v => new THREE.Vector3(v.x * 1.1 + x, .76, -v.y * 1.13 + z));
  k.add(M.woodLight, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2, true), 100, .03, 6, true));
  const seats: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    seats.push([Math.cos(a) * (L + Wd * .7), Math.sin(a) * Wd * .7]);
  }
  for (const [sx, sz] of seats) {
    const cx = sx * 1.0, cz = sz;
    k.add(cards(), cardGeo(7, x + cx * .78 - .02, z + cz * .78, Math.atan2(cx, cz), .805), cardGeo(7, x + cx * .78 + .02, z + cz * .78 + .01, Math.atan2(cx, cz) + .2, .806));
    addStack(k, cx * .62, cz * .62, x, z, 0, .802, 4 + Math.floor(rnd() * 10));
    addStack(k, cx * .62 + .05, cz * .62, x, z, 0, .802, 3 + Math.floor(rnd() * 6));
    const ax = sx * 1.55 + Math.sign(sx) * .1, az = sz * 1.75;
    chair(k, x + ax, z + az, Math.atan2(-ax, -az), M.seatGreen);
  }
  for (let i = 0; i < 5; i++) k.add(cards(), cardGeo([0, 1, 4, 5, 6][i], x - .2 + i * .1, z, 0, .805));
  k.add(chipEdge, cyl(.035, .035, .008, x + .5, .806, z - .25, 16));
  solids.push([x - 2.9, z - 2.4, x + 2.9, z + 2.4]);
}
