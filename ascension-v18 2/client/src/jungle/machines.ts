// ============================================================
// Les six machines de la Canopée + le comptoir et le tam-tam (radio).
// Chaque constructeur rend un « rig » : la racine 3D et les pièces que la
// boucle d'animation pilote (mêmes conventions que les machines des autres étages).
// ============================================================
import * as THREE from 'three';
import type { FloorDef, MachineDef } from '../../../shared/content';
import { cloneModel, parts } from '../gfx/assets';
import { leafTexture, leafGeometry, leafify } from '../gfx/fx';
import { M, glow, stoneBlock, worldUv, taperTube, textTexture, jungleSign, dais, rbox, FONT_DISPLAY } from './kit';
import { capybara, RACERS, walk, type Critter } from './critters';
import { SUN_DIR, SUN_COLOR } from './world';
import { bakeStatic } from '../gfx/bake';

export interface Rig {
  root: THREE.Group;
  wheelDisc?: THREE.Group; segMults?: number[];
  crashTrack?: THREE.Group; runner?: THREE.Group;
  drums?: { g: THREE.Group; stopAt: number; target: number; spinning: boolean; vel: number }[];
  slotBulbs?: THREE.Mesh[]; slotLever?: THREE.Group;
  chestMeshes?: THREE.Group[]; chestLids?: THREE.Group[]; chestGems?: THREE.Mesh[]; chestBeam?: THREE.PointLight;
  mineTiles?: THREE.Mesh[];
  racePawns?: THREE.Group[];
  jukeBars?: THREE.Mesh[];
  update?: (dt: number, t: number) => void;
}

const ACC = '#5cdc8e';
const TAU = Math.PI * 2;

function label(text: string, w: number, h: number, color = '#fff', o: Parameters<typeof textTexture>[1] = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: textTexture(text, { color, stroke: '#1a0f06', w: 256, h: 128, ...o }), transparent: true, roughness: .6,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
  }));
  m.userData.noShadow = true;
  return m;
}

/** Une bestiole : corps et tête deviennent chacun quelques maillages, les pattes restent libres. */
function bakeCritter(c: Critter) {
  bakeStatic(c.userData.head);
  bakeStatic(c.userData.body, [c.userData.head]);
}

// ---------- ROUE DES ANCÊTRES ----------
const SEG_MATS = (m: number) => m === 0 ? M.obsidian() : m >= 20 ? M.gold() : m >= 5 ? M.coral() : m >= 2 ? M.turquoise() : M.jade();
export function wheel(f: FloorDef, d: MachineDef): Rig {
  const g = new THREE.Group();
  g.add(dais(1.9, ACC));
  const segs = d.wheel!.segments, N = segs.length;
  // deux piliers sculptés + linteau
  for (const sx of [-1, 1]) {
    const p = stoneBlock(.62, 4.1, .7, M.stone(), .06); p.position.set(sx * 1.95, 2.05 + .46, -.15); g.add(p);
    const capital = stoneBlock(.95, .36, .95, M.stoneDark(), .05); capital.position.set(sx * 1.95, 4.6, -.15); g.add(capital);
    for (let k = 0; k < 4; k++) {                                         // glyphes incrustés
      const gl = stoneBlock(.34, .1, .06, M.goldWorn(), .02); gl.position.set(sx * 1.95, 1.2 + k * .78, .21); g.add(gl);
    }
  }
  const lintel = stoneBlock(4.7, .55, .9, M.stoneDark(), .07); lintel.position.set(0, 5.02, -.15); g.add(lintel);
  // tête de serpent d'or : c'est le repère (en haut de la roue)
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(.28, 20, 14), M.gold()); skull.scale.set(1, .8, 1.25);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(.2, .5, 12), M.gold()); jaw.rotation.x = Math.PI; jaw.position.y = -.32;
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), glow('#ff3b2a', 5)); e.position.set(s * .15, .06, .22); e.userData.noShadow = true; head.add(e); }
  head.add(skull, jaw);
  head.position.set(0, 4.42, .35);
  g.add(head);

  const disc = new THREE.Group();
  const stoneDisc = new THREE.Mesh(worldUv(new THREE.CylinderGeometry(1.62, 1.62, .32, 48), .7), M.stone());
  stoneDisc.rotation.x = Math.PI / 2; stoneDisc.position.z = -.1;
  disc.add(stoneDisc);
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 1.46, a0 + .012, a1 - .012, false);
    shape.absarc(0, 0, .38, a1 - .03, a0 + .03, true);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 1, curveSegments: 6 });
    const seg = new THREE.Mesh(geo, SEG_MATS(segs[i].mult));
    seg.position.z = .06;
    disc.add(seg);
    const a = ((i + .5) / N) * TAU;
    const lab = label('×' + segs[i].mult, .78, .39, segs[i].mult === 0 ? '#b4aebf' : '#fffaf0', { size: 96, strokeW: 16 });
    lab.position.set(Math.cos(a) * .95, Math.sin(a) * .95, .17);
    lab.rotation.z = a - Math.PI / 2;
    disc.add(lab);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.56, .08, 10, 64), M.gold()); rim.position.z = .08; disc.add(rim);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const peg = new THREE.Mesh(new THREE.SphereGeometry(.055, 10, 8), M.gold());
    peg.position.set(Math.cos(a) * 1.56, Math.sin(a) * 1.56, .14); disc.add(peg);
  }
  // soleil d'or au centre
  const sunHub = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .14, 28), M.gold()); sunHub.rotation.x = Math.PI / 2; sunHub.position.z = .14;
  disc.add(sunHub);
  const face = label('☀', .5, .5, '#fff4c0', { w: 128, h: 128, size: 100 });
  face.position.z = .225; disc.add(face);
  for (let i = 0; i < 12; i++) {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(.05, .18, 4), M.gold());
    const a = (i / 12) * TAU; ray.position.set(Math.cos(a) * .44, Math.sin(a) * .44, .14); ray.rotation.z = a - Math.PI / 2; disc.add(ray);
  }
  disc.position.set(0, 2.45, .1);
  bakeStatic(disc);
  g.add(disc);
  // liane-tirette sur le côté
  const lianaCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(1.7, 4.8, .3), new THREE.Vector3(1.9, 3.4, .55), new THREE.Vector3(1.75, 2, .5)]);
  g.add(new THREE.Mesh(taperTube(lianaCurve, .04, .03, 14, 6, 6), new THREE.MeshStandardMaterial({ color: '#45652a', roughness: .8 })));
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(.08, .22, 4, 10), M.carved()); grip.position.set(1.75, 1.82, .5); g.add(grip);
  g.add(jungleSign(d.name, ACC, 5.85, 3.2));
  return { root: g, wheelDisc: disc, segMults: segs.map(s => s.mult) };
}

// ---------- PIERRES À SCARABÉES ----------
function scarab(mat: THREE.Material) {
  const s = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(.1, 14, 10), mat); shell.scale.set(1, .55, 1.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), mat); head.position.z = .14; head.scale.y = .6;
  s.add(shell, head);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .12, 4), mat);
    leg.position.set(sx * .1, -.01, -.06 + k * .07); leg.rotation.z = sx * 1.2; s.add(leg);
  }
  return s;
}
export function chests(f: FloorDef, d: MachineDef): Rig {
  const g = new THREE.Group();
  g.add(dais(2.05, ACC));
  // autel incliné vers le joueur
  const altar = stoneBlock(3.4, .55, 2.6, M.stone(), .08); altar.position.set(0, 1.3, 0); altar.rotation.x = .32; g.add(altar);
  const legs = stoneBlock(2.6, 1, 1.2, M.stone(), .06); legs.position.y = .85; g.add(legs);
  const trim = new THREE.Mesh(rbox(3.28, .08, 2.48, .03), M.goldWorn()); trim.position.set(0, 1.04, -.04); trim.rotation.x = .32; g.add(trim);
  const chestMeshes: THREE.Group[] = [], chestLids: THREE.Group[] = [], chestGems: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const holder = new THREE.Group();
    // l'autel penche VERS le joueur : le rang du fond est plus haut, toute la grille se lit
    const hz = .62 - row * .72;
    holder.position.set((col - 1) * .98, 1.6 - hz * .331, hz);
    holder.rotation.x = .32;
    holder.scale.setScalar(1.22);
    const box = stoneBlock(.62, .34, .48, M.ruin(), .05); box.position.y = .17;
    const band = new THREE.Mesh(rbox(.645, .06, .505, .02), M.gold()); band.position.y = .22;
    const front = scarab(M.gold()); front.position.set(0, .15, .255); front.rotation.x = Math.PI / 2; front.scale.setScalar(1.25);
    const num = label(String(i + 1), .3, .15, '#ffe9b8', { w: 128, h: 64 });
    num.position.set(.22, .07, .247);
    const lid = new THREE.Group();
    const slab = stoneBlock(.66, .12, .5, M.stoneDark(), .04); slab.position.z = .25;
    const topScarab = scarab(M.gold()); topScarab.position.set(0, .08, .25);
    lid.add(slab, topScarab);
    lid.position.set(0, .4, -.25);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.13, 0), new THREE.MeshStandardMaterial({
      color: '#7ee08a', metalness: .3, roughness: .1, emissive: '#1d5c2a', emissiveIntensity: .7,
    }));
    gem.position.y = .3; gem.visible = false; gem.userData.noShadow = true;
    holder.add(box, band, front, num, lid, gem);
    bakeStatic(lid);
    bakeStatic(holder, [lid, gem]);
    holder.userData = { lid, gem, box, home: holder.position.clone() };
    g.add(holder);
    chestMeshes.push(holder); chestLids.push(lid); chestGems.push(gem);
  }
  // offrandes autour de l'autel
  const vase = cloneModel('brass_vase_01'); vase.scale.setScalar(1.4); vase.position.set(-1.7, .48, .6); g.add(vase);
  const bananas = cloneModel('bananas'); bananas.scale.setScalar(1.6); bananas.position.set(1.55, .5, .9); bananas.rotation.y = .6; g.add(bananas);
  const beam = new THREE.PointLight('#ffe9a8', 0, 6);
  beam.position.set(0, 2.8, .4);
  g.add(beam, jungleSign(d.name, ACC, 5.0, 3.3));
  return { root: g, chestMeshes, chestLids, chestGems, chestBeam: beam };
}

// ---------- LE PONT POURRI ----------
export function crash(f: FloorDef, d: MachineDef): Rig {
  const g = new THREE.Group();
  // le gouffre : une fosse taillée dans le dallage, cadre de pierre, fond invisible
  const PZ = -2.3, PL = 5.5, PW = 1.75;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(PW, 4, PL), new THREE.MeshStandardMaterial({
    map: M.rock([1, 2]).map, normalMap: M.rock([1, 2]).normalMap, color: '#3a3428', roughness: 1, side: THREE.BackSide,
  }));
  walls.position.set(0, -2, PZ); walls.userData.noShadow = true;
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(PW, PL), new THREE.MeshBasicMaterial({ color: '#000000' }));
  hole.rotation.x = -Math.PI / 2; hole.position.set(0, -3.9, PZ);
  g.add(walls, hole);
  const frame: [number, number, number, number, number][] = [
    [-(PW / 2 + .28), PZ, .56, PL + 1.1, .38], [(PW / 2 + .28), PZ, .56, PL + 1.1, .38],
    [0, PZ + PL / 2 + .28, PW, .56, .38], [0, PZ - PL / 2 - .28, PW, .56, .38],
  ];
  for (const [x, z, w, d, h] of frame) { const b2 = stoneBlock(w, h, d, M.stone(), .06); b2.position.set(x, h / 2, z); g.add(b2); }
  const rocks = parts('rock_moss_set_01');
  [[-1.55, -.4, .32], [1.6, -1.6, .36], [-1.5, -4.2, .4], [1.55, -4.6, .3]].forEach(([x, z, sc], i) => {
    const r = rocks[i % rocks.length]?.clone();
    if (!r) return;
    r.scale.setScalar(sc); r.position.set(x, .1, z); r.rotation.y = i * 1.7; g.add(r);
  });
  const fernP = parts('fern_02');
  [[-1.35, -2.8], [1.4, -3.2], [1.3, .1]].forEach(([x, z], i) => {
    const f2 = fernP[i % fernP.length]?.clone(); if (!f2) return;
    f2.scale.setScalar(.7); f2.position.set(x, .36, z); f2.rotation.y = i * 2.1; g.add(f2);
  });
  // brume qui remonte du gouffre
  const mistMat = new THREE.MeshBasicMaterial({ color: '#d8e8d0', transparent: true, opacity: .14, depthWrite: false });
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(PW * .95, PL * .95), mistMat);
  mist.rotation.x = -Math.PI / 2; mist.position.set(0, -.5, PZ); mist.userData.noShadow = true; g.add(mist);

  // poteaux de bois (quatre rondins) et cordes-main courantes
  const posts: [number, number, number][] = [[-.72, .25, 2.2], [.72, .25, 2.2], [-.72, -4.75, 1.9], [.72, -4.75, 1.9]];
  for (const [x, z, h] of posts) {
    const p = new THREE.Mesh(worldUv(new THREE.CylinderGeometry(.13, .16, h, 10), .9), M.wood());
    p.position.set(x, h / 2 + (z < 0 ? .1 : 0), z); g.add(p);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(.15, .04, 6, 12), M.rope()); cap.rotation.x = Math.PI / 2; cap.position.set(x, h * .82, z); g.add(cap);
  }
  // le tablier, articulé au pied du joueur : il bascule quand ça casse
  const track = new THREE.Group();
  track.position.set(0, 1.35, .2);
  const plankVs = [M.wood(), M.woodDark()];
  for (let i = 0; i < 9; i++) {
    const pk = stoneBlock(1.25, .08, .42, plankVs[i % 2], .02);
    pk.position.set((Math.random() - .5) * .06, 0, -.3 - i * .52);
    pk.rotation.set((Math.random() - .5) * .05, (Math.random() - .5) * .12, (Math.random() - .5) * .06);
    if (i === 5) { pk.scale.x = .62; pk.position.x = -.28; }          // une planche cassée…
    track.add(pk);
  }
  const ropeMat = M.rope();
  for (const sx of [-.64, .64]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sx, .9, 0), new THREE.Vector3(sx, .55, -2.4), new THREE.Vector3(sx, .9, -4.9)]);
    track.add(new THREE.Mesh(taperTube(c, .028, .028, 20, 6, 10), ropeMat));
    const low = new THREE.CatmullRomCurve3([new THREE.Vector3(sx, .02, 0), new THREE.Vector3(sx, -.06, -2.4), new THREE.Vector3(sx, .02, -4.9)]);
    track.add(new THREE.Mesh(taperTube(low, .025, .025, 20, 6, 10), ropeMat));
    for (let k = 1; k < 9; k++) {                                     // suspentes
      const z = -k * .55;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .62, 4), ropeMat);
      s.position.set(sx, .32, z); track.add(s);
    }
  }
  bakeStatic(track);
  g.add(track);
  // la lanterne rouge qui s'allume quand le pont craque
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.14, 14, 10), glow('#ff5a3a', 1.2)); lamp.position.set(-.72, 2.38, .25); lamp.userData.noShadow = true;
  g.add(lamp);
  const runner = new THREE.Group();
  const capy = capybara(1.15, true);
  bakeCritter(capy);
  capy.rotation.y = Math.PI / 2;           // regarde vers -Z (le bout du pont)
  runner.add(capy);
  runner.position.set(0, 1.4, .2);
  g.add(runner, jungleSign(d.name, ACC, 4.6, 3.1));
  let lastZ = runner.position.z;
  return {
    root: g, crashTrack: track, runner,
    update(dt, t) {
      const v = Math.abs(runner.position.z - lastZ) / Math.max(dt, .001);
      lastZ = runner.position.z;
      walk(capy, t, Math.min(1, v * .8));
      (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.max(0, -runner.position.z - 1) * 1.2 + Math.sin(t * 9) * .3;
      mist.rotation.z = t * .05;
    },
  };
}

// ---------- LE TOTEM BAVARD ----------
function symbolFace(emoji: string): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(128, 118, 20, 128, 128, 140);
  gr.addColorStop(0, '#f4e2bc'); gr.addColorStop(1, '#b08a58');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#6a4420'; x.lineWidth = 10; x.strokeRect(8, 8, 240, 240);
  x.strokeStyle = '#e8b84a'; x.lineWidth = 4; x.strokeRect(20, 20, 216, 216);
  x.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 10; x.shadowOffsetY = 5;
  x.fillText(emoji, 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: .55 });
}
export function slots(f: FloorDef, d: MachineDef): Rig {
  const g = new THREE.Group();
  g.add(dais(1.8, ACC));
  const sym = d.slots!.symbols;
  const W = M.carvedLight([1, 2]), WD = M.carved([1, 2]);
  // fût du totem : trois étages sculptés
  const base = new THREE.Mesh(worldUv(new THREE.CylinderGeometry(1.05, 1.2, 1.1, 10), .6), WD); base.position.y = 1;
  g.add(base);
  // masque du bas : bouche grimaçante (le bac à monnaie)
  const mouth = stoneBlock(1.2, .36, .4, M.dark(), .06); mouth.position.set(0, .95, .95); g.add(mouth);
  for (let k = 0; k < 5; k++) { const tooth = stoneBlock(.16, .2, .1, M.gold(), .02); tooth.position.set(-.48 + k * .24, 1.08, 1.12); g.add(tooth); }
  const body = stoneBlock(2.3, 1.7, 1, W, .18); body.position.set(0, 2.38, -.25); g.add(body);
  // bandes peintes (turquoise / corail) autour du fût
  for (const [y, m] of [[1.58, M.turquoise()], [3.18, M.coral()]] as [number, THREE.Material][]) {
    const band = stoneBlock(2.36, .14, 1.06, m, .04); band.position.set(0, y, -.25); g.add(band);
  }
  // niche des rouleaux : fond sombre, rouleaux en saillie, cadre d'or devant
  const back = stoneBlock(1.95, 1.05, .1, M.dark(), .03); back.position.set(0, 2.38, .27); g.add(back);
  for (const sx of [-1, 1]) { const cheek = stoneBlock(.16, 1.1, .6, WD, .04); cheek.position.set(sx * 1.05, 2.38, .5); g.add(cheek); }
  for (const [w, h, x, y] of [[2.1, .1, 0, 2.95], [2.1, .1, 0, 1.81], [.1, 1.2, -1.02, 2.38], [.1, 1.2, 1.02, 2.38]] as number[][]) {
    const fr = stoneBlock(w, h, .14, M.gold(), .03); fr.position.set(x, y, .86); g.add(fr);
  }
  const payline = new THREE.Mesh(new THREE.BoxGeometry(2, .025, .02), glow('#ff5a3a', 2.5)); payline.position.set(0, 2.38, .87); payline.userData.noShadow = true; g.add(payline);
  const drums: Rig['drums'] = [];
  for (let k = 0; k < 3; k++) {
    const drum = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.37, .37, .52, 20), WD); hub.rotation.z = Math.PI / 2; drum.add(hub);
    for (let i = 0; i < 5; i++) {
      const fc = new THREE.Mesh(new THREE.PlaneGeometry(.52, .44), symbolFace(sym[i].e));
      const a = (i / 5) * TAU;
      fc.position.set(0, Math.sin(a) * .38, Math.cos(a) * .38); fc.rotation.x = -a;
      drum.add(fc);
    }
    drum.position.set(-.6 + k * .6, 2.38, .42);
    g.add(drum);
    drums.push({ g: drum, stopAt: 0, target: 0, spinning: false, vel: 0 });
  }
  // tête d'oiseau-tonnerre au sommet : ailes déployées, yeux = voyants de gain
  const head = stoneBlock(1.8, 1.3, 1.3, W, .2); head.position.y = 3.9; g.add(head);
  const brow = stoneBlock(2, .26, .3, M.goldWorn(), .05); brow.position.set(0, 4.3, .62); g.add(brow);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.28, .9, 4), M.gold()); beak.rotation.x = Math.PI / 2 + .35; beak.position.set(0, 3.7, .95); g.add(beak);
  const slotBulbs: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#ffb030', emissiveIntensity: .5, roughness: .2 }));
    eye.position.set(sx * .45, 4.05, .66); eye.userData.noShadow = true; g.add(eye); slotBulbs.push(eye);
    const wing = stoneBlock(1.5, .7, .18, W, .08); wing.position.set(sx * 1.55, 4.05, -.1); wing.rotation.z = sx * .38; g.add(wing);
    for (let k = 0; k < 4; k++) {
      const fe = stoneBlock(.18, .55, .1, k % 2 ? M.turquoise() : M.coral(), .03);
      fe.position.set(sx * (1.05 + k * .3), 3.72 - k * .1, .02); fe.rotation.z = sx * (.38 + k * .06); g.add(fe);
    }
  }
  // ampoules-graines le long des ailes (clignotent au jackpot)
  for (let i = 0; i < 6; i++) {
    const sx = i < 3 ? -1 : 1, k = i % 3;
    const b = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#ffb030', emissiveIntensity: .5 }));
    b.position.set(sx * (1.05 + k * .38), 4.2 + k * .14, .1); b.userData.noShadow = true; g.add(b); slotBulbs.push(b);
  }
  // levier : une liane terminée par une poignée sculptée
  const lever = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .9, 8), new THREE.MeshStandardMaterial({ color: '#45652a', roughness: .8 }));
  rod.position.y = .45;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.15, 14, 12), M.coral()); knob.position.y = .92;
  lever.add(rod, knob);
  lever.position.set(1.3, 2.2, .1);
  const pivot = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), M.gold()); pivot.position.copy(lever.position);
  g.add(lever, pivot, jungleSign(d.name, ACC, 5.55, 3.1));
  return { root: g, drums, slotBulbs, slotLever: lever };
}

// ---------- LE CHAMP DE FOURMIS ----------
export function mines(f: FloorDef, d: MachineDef): Rig {
  const g = new THREE.Group();
  g.add(dais(2.05, ACC));
  const TILT = .36;
  const slab = stoneBlock(3.25, .5, 2.5, M.stone(), .1); slab.position.set(0, 1.5, -.1); slab.rotation.x = TILT; g.add(slab);
  const moss = new THREE.Mesh(new THREE.BoxGeometry(3.05, .04, 2.3), new THREE.MeshStandardMaterial({ map: M.ruin().map, color: '#4a6a2a', roughness: 1 }));
  moss.position.set(0, 1.5 + .26 * Math.cos(TILT), -.1 + .26 * Math.sin(TILT)); moss.rotation.x = TILT; g.add(moss);
  const ped = stoneBlock(2.3, 1.3, 1.1, M.stoneDark(), .06); ped.position.y = .78; g.add(ped);
  // fourmilières aux coins : le danger se voit
  for (const [x, z] of [[-1.85, .3], [1.85, -.2], [-1.6, -1.3]]) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(.3, .42, 12), new THREE.MeshStandardMaterial({ map: M.ruin().map, color: '#8a5a32', roughness: 1 }));
    hill.position.set(x, 1.6 + z * -.3, z); g.add(hill);
  }
  const leafMat = (hue: number) => {
    const m = new THREE.MeshStandardMaterial({ map: leafTexture('broad', hue), alphaTest: .45, roughness: .55, side: THREE.DoubleSide, color: '#ffffff' });
    return m;
  };
  const CY = 1.5, CZ = -.1, CS = Math.cos(TILT), SN = Math.sin(TILT);
  const onPlane = (h: number, dz: number) => ({ y: CY + h * CS - dz * SN, z: CZ + h * SN + dz * CS });
  const tileGeo = new THREE.PlaneGeometry(.52, .5);
  tileGeo.rotateX(-Math.PI / 2);
  const mineTiles: THREE.Mesh[] = [];
  for (let i = 0; i < 25; i++) {
    const col = i % 5, row = Math.floor(i / 5);
    const dz = .92 - row * .46, x = (col - 2) * .56;
    const p = onPlane(.31, dz);
    const t = new THREE.Mesh(tileGeo, leafMat((i % 3) * .015));
    t.position.set(x, p.y, p.z); t.rotation.x = TILT;
    t.rotation.order = 'XYZ';
    t.userData.base = p.y; t.userData.color = '#ffffff';
    t.userData.noShadow = true;
    mineTiles.push(t); g.add(t);
  }
  g.add(jungleSign(d.name, ACC, 4.6, 3.2));
  return { root: g, mineTiles };
}

// ---------- LA COURSE DES CAPYBARAS ----------
export function race(f: FloorDef, d: MachineDef): Rig {
  const g = new THREE.Group();
  g.add(dais(2.05, ACC));
  const track = new THREE.Group();
  track.position.set(0, 1.45, .1);
  const deck = stoneBlock(3.6, .3, 2.35, M.wood([2, 1]), .05);
  const legs = stoneBlock(2.6, 1.5, 1.3, M.stoneDark(), .06); legs.position.y = .75;
  g.add(legs, track); track.add(deck);
  const LANES = [-.78, -.26, .26, .78];
  const dirt = new THREE.MeshStandardMaterial({ map: M.ruin([2, .3]).map, color: '#9a7048', roughness: 1 });
  LANES.forEach(z => {
    const lane = new THREE.Mesh(new THREE.BoxGeometry(3.3, .04, .42), dirt); lane.position.set(0, .17, z); track.add(lane);
  });
  // haies de bambou entre les couloirs
  for (const z of [-1.04, -.52, 0, .52, 1.04]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 3.3, 6), M.bamboo()); rail.rotation.z = Math.PI / 2; rail.position.set(0, .26, z); track.add(rail);
  }
  // portique d'arrivée en bambou avec bannière à damier
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 1.3, 8), M.bamboo()); post.position.set(1.55, .82, sz * 1.08); track.add(post);
  }
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 16, j * 16, 16, 16); }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.1, .26), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide, roughness: .8 }));
  flag.position.set(1.55, 1.38, 0); flag.rotation.y = Math.PI / 2; track.add(flag);
  const line = new THREE.Mesh(new THREE.BoxGeometry(.08, .05, 2.1), glow('#ffd36a', 1.4)); line.position.set(1.5, .2, 0); track.add(line);
  const start = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 2.1), new THREE.MeshStandardMaterial({ color: '#f0ead8' })); start.position.set(-1.5, .2, 0); track.add(start);
  // petites fougères au bord de la piste
  const fern = parts('fern_02')[0];
  if (fern) for (const [fx, fz] of [[-1.7, -1.25], [-.6, 1.3], [.5, -1.3], [1.75, 1.3]]) {
    const m = fern.clone(); m.scale.setScalar(.35); m.position.set(fx, .15, fz); track.add(m);
  }
  const racePawns: THREE.Group[] = [];
  const critters: Critter[] = [];
  for (let l = 0; l < 4; l++) {
    const pawn = new THREE.Group();
    const cr = RACERS[l](.78);
    bakeCritter(cr);
    pawn.add(cr);
    pawn.position.set(-1.5, .19, LANES[l]);
    pawn.userData.lane = LANES[l];
    racePawns.push(pawn); critters.push(cr); track.add(pawn);
  }
  g.add(jungleSign(d.name, ACC, 4.6, 3.4));
  const last = racePawns.map(p => p.position.x);
  return {
    root: g, racePawns,
    update(dt, t) {
      racePawns.forEach((p, i) => {
        const v = Math.abs(p.position.x - last[i]) / Math.max(dt, .001);
        last[i] = p.position.x;
        walk(critters[i], t + i, Math.min(1, v * 1.5));
      });
    },
  };
}

// ---------- COMPTOIR DU MARCHAND ----------
export function shop(f: FloorDef, pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const deck = stoneBlock(3.6, .2, 2.4, M.woodDark([2, 1.4]), .04); deck.position.y = .1; g.add(deck);
  const counter = stoneBlock(2.8, 1.05, .8, M.bamboo([2, .8]), .05); counter.position.set(0, .72, .45); g.add(counter);
  const top = stoneBlock(3, .1, 1, M.wood([1.6, .6]), .03); top.position.set(0, 1.28, .45); g.add(top);
  // toit de palmes sur quatre bambous
  for (const [x, z] of [[-1.55, -.95], [1.55, -.95], [-1.55, 1], [1.55, 1]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.08, .09, 3.2, 8), M.bamboo()); p.position.set(x, 1.6, z); g.add(p);
  }
  const thatchMat = leafify(new THREE.MeshStandardMaterial({ map: leafTexture('palm', .06), alphaTest: .4, roughness: .7, color: '#d8c080' }), SUN_DIR, SUN_COLOR, .6);
  const thatchGeo = leafGeometry(1.1, 2.6, .25, .1);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU;
    const t = new THREE.Mesh(thatchGeo, thatchMat);
    t.position.set(0, 4.55, 0);
    t.rotation.set(2.25, a, 0, 'YXZ');
    t.scale.set(1.5, 1.15, 1);
    g.add(t);
  }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.7, 12, 1, true), new THREE.MeshStandardMaterial({ map: M.bamboo([4, 1]).map, color: '#b08a50', roughness: 1, side: THREE.DoubleSide }));
  cone.position.y = 3.95; g.add(cone);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.22, .5, 8), M.gold()); tip.position.y = 4.95; g.add(tip);
  // marchandises
  const chest = cloneModel('treasure_chest'); chest.scale.setScalar(1.1); chest.position.set(-.85, 1.33, .4); chest.rotation.y = .25; g.add(chest);
  const crate = cloneModel('wooden_crate_02'); crate.scale.setScalar(1.2); crate.position.set(1.35, .2, -.4); crate.rotation.y = -.4; g.add(crate);
  const crate2 = cloneModel('wooden_crate_02'); crate2.scale.setScalar(1); crate2.position.set(1.2, .72, -.35); crate2.rotation.y = .3; g.add(crate2);
  const ban = cloneModel('bananas'); ban.scale.setScalar(2.2); ban.position.set(.5, 1.33, .5); g.add(ban);
  const vase = cloneModel('brass_vase_01'); vase.scale.setScalar(1.5); vase.position.set(1.05, 1.33, .35); g.add(vase);
  const plant = cloneModel('potted_plant_02'); plant.scale.setScalar(1.6); plant.position.set(-1.75, .2, 1.3); g.add(plant);
  for (const sx of [-1.35, 1.35]) {
    const lan = cloneModel('wooden_lantern_01'); lan.scale.setScalar(1.5); lan.position.set(sx, 2.9, 1.05); g.add(lan);
    lan.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m && /glass/i.test(m.name)) { const c2 = m.clone(); c2.emissive.set('#ffb060'); c2.emissiveIntensity = 3; (o as THREE.Mesh).material = c2; }
    });
  }
  const light = new THREE.PointLight('#ffb870', 14, 8, 1.8); light.position.set(0, 2.6, 1.2); g.add(light);
  const sign = jungleSign('BOUTIQUE', '#ffc860', 3.25, 2.2);
  sign.position.z = 1.15; g.add(sign);
  g.position.copy(pos);
  g.rotation.y = .5;          // tourné vers la cour et la caméra
  return g;
}

// ---------- LE TAM-TAM (la radio) ----------
export function jukebox(f: FloorDef, pos: THREE.Vector3): Rig {
  const g = new THREE.Group();
  const plinth = stoneBlock(2.5, .3, 1.5, M.stoneDark(), .05); plinth.position.y = .15; g.add(plinth);
  const cab = stoneBlock(2.2, 1.9, 1.1, M.carved([1, 1.2]), .14); cab.position.y = 1.25; g.add(cab);
  // trois tambours sur le dessus
  const skin = new THREE.MeshStandardMaterial({ color: '#e8d6b0', roughness: .7 });
  const drumsGroup = new THREE.Group();
  [[-.62, .5, .42], [.02, .62, .5], [.66, .44, .38]].forEach(([x, h, r]) => {
    const body = new THREE.Mesh(worldUv(new THREE.CylinderGeometry(r, r * .82, h, 18), .8), M.woodDark()); body.position.set(x, 2.2 + h / 2, 0);
    const top = new THREE.Mesh(new THREE.CircleGeometry(r * .98, 24), skin); top.rotation.x = -Math.PI / 2; top.position.set(x, 2.2 + h + .005, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .03, 6, 24), M.gold()); ring.rotation.x = Math.PI / 2; ring.position.set(x, 2.2 + h, 0);
    drumsGroup.add(body, top, ring);
  });
  drumsGroup.name = 'disc';           // la boucle fait vibrer ce groupe quand la radio joue
  g.add(drumsGroup);
  // façade : tuyaux de bambou qui s'allument au rythme (l'égaliseur)
  const jukeBars: THREE.Mesh[] = [];
  for (let i = 0; i < 11; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, 1, 10), new THREE.MeshStandardMaterial({ color: '#ffd890', emissive: '#ffb050', emissiveIntensity: 2.6 }));
    bar.position.set(-.75 + i * .15, 1.0, .58);
    bar.scale.y = .1; bar.userData.noShadow = true; bar.userData.y0 = .55;
    jukeBars.push(bar); g.add(bar);
  }
  const grille = stoneBlock(1.85, .2, .06, M.gold(), .02); grille.position.set(0, .52, .58); g.add(grille);
  const sign = jungleSign('RADIO', '#ffc860', 3.75, 2);
  sign.position.z = .3; g.add(sign);
  g.position.copy(pos);
  g.rotation.y = -.55;
  return {
    root: g, jukeBars,
    update(dt, t) { /* les tambours dansent via la boucle commune */ },
  };
}

export const JUNGLE_BUILDERS: Record<string, (f: FloorDef, d: MachineDef) => Rig> = {
  WHEEL: wheel, CHESTS: chests, CRASH: crash, SLOTS: slots, MINES: mines, RACE: race,
};
export { FONT_DISPLAY };
