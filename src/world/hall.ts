// ============================================================
// Le hall du Grand Casino : marbre ciré en damier, nef voûtée, lustres de cristal,
// machines à sous, roulettes, blackjack, bar, et au fond… la caisse et sa chambre forte.
// ============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { model, remapMaterials, pbr, texRaw } from '../gfx/assets';
import {
  box, cyl, mesh, MAT, glowMat, neonTex, neonPlane, halo, bulbs, canvasTex, onTick, U, rnd,
  glows, damaskTex, carpetTex, rouletteFeltTex, blackjackFeltTex, wheelTex, reelTex, topperTex, plaqueTex,
} from '../gfx/kit';
import { Mirror, wetMaterial } from '../gfx/mirror';
import { bakeStatic } from '../gfx/bake';
import { LightPool, zoneAt, type LightDef, type Zone } from '../gfx/lights';
import { Kit, blackjack, roulette, pendant } from './tables';
import { buildRooms, wallRun } from './rooms';
import { buildWest } from './rooms2';
import { Crowd, populateHall, SEATS, SLOT_SEAT } from './people';
import { SLOT_LIST } from '../../shared/layout';
import type { World } from './world';

const W = 18, D = 15, H = 8.6;          // demi-largeur, demi-profondeur, hauteur des bas-côtés

/** Met à jour le tableau du jackpot progressif (valeur envoyée par le serveur). */
export let setJackpotBoard: (v: number) => void = () => {};

export function buildHall(renderer: THREE.WebGLRenderer, quality: string): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0605');
  scene.fog = new THREE.FogExp2('#1c120c', .014);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .08, 120);
  camera.layers.enable(1);
  const root = new THREE.Group(); scene.add(root);
  const statics = new THREE.Group(); root.add(statics);
  const dyn: THREE.Object3D[] = [];
  const solids: number[][] = [];
  const mirror = new Mirror(scene, 0, quality === 'high' ? .5 : .36);

  root.add(new THREE.HemisphereLight('#7a5638', '#1a0e08', .9));

  // ---------- sol : damier marbre crème / granit noir, ciré ----------
  const floorMat = wetMaterial(pbr('marble_01', { roughness: 1, normalScale: .25, color: '#d9ccb6' }), mirror,
    { damp: .85, blur: 1.7, distort: .008, darken: 0, ripples: 0, f0: .07, checker: texRaw('granite_tile', 'diff') });
  floorMat.roughness = .55;
  const floor = new THREE.Mesh(box(2 * W, .1, 2 * D, 0, -.05, 0, 2.4), floorMat);
  floor.receiveShadow = true; root.add(floor);
  mirror.hidden.push(floor);
  // moquettes des zones de jeu
  const carpet = new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 1, color: '#d8c8c8' });
  carpet.map!.repeat.set(1, 1);
  statics.add(mesh([box(11.6, .025, 25, 11.4, .012, -.5, 4), box(11.6, .025, 27, -11.4, .012, -.5, 4)], carpet));

  // ---------- murs ----------
  const wood = pbr('dark_paneled_wood', { color: '#a07058' });
  const damask = new THREE.MeshStandardMaterial({ map: damaskTex(), roughness: .72, color: '#ffffff' });
  const gold = MAT.gold();
  const Au: THREE.BufferGeometry[] = [];
  // lambris bas + tenture, percés : salon privé (mur est) et porte du personnel (mur nord)
  const wk = new Kit();
  const holesN: [number, number, number][] = [[11, 1.5, 2.5]], holesE: [number, number, number][] = [[0, 3.2, 3.4]], holesW: [number, number, number][] = [[0, 2.8, 3.4]];
  wallRun(wk, wood, 'x', -D, -W, W, 0, 1.5, .2, 1.6, holesN); wallRun(wk, wood, 'x', D, -W, W, 0, 1.5, .2, 1.6);
  wallRun(wk, wood, 'z', -W, -D, D, 0, 1.5, .2, 1.6, holesW); wallRun(wk, wood, 'z', W, -D, D, 0, 1.5, .2, 1.6, holesE);
  wallRun(wk, damask, 'x', -D - .05, -W, W, 1.5, H, .1, 1.1, holesN); wallRun(wk, damask, 'x', D + .05, -W, W, 1.5, H, .1, 1.1);
  wallRun(wk, damask, 'z', -W - .05, -D, D, 1.5, H, .1, 1.1, holesW); wallRun(wk, damask, 'z', W + .05, -D, D, 1.5, H, .1, 1.1, holesE);
  wk.flush(statics);
  const gap = (a: number, holes: [number, number, number][]) => holes.some(([c, w]) => Math.abs(a - c) < w / 2 + .3);
  for (const [x0, x1, z, along] of [[-W, W, -D + .11, 'x'], [-W, W, D - .11, 'x'], [-D, D, -W + .11, 'z'], [-D, D, W - .11, 'z']] as const) {
    const holes = along === 'x' ? (z < 0 ? holesN : []) : (z > 0 ? holesE : holesW);
    for (let a = x0; a < x1; a += .5) {
      if (gap(a + .25, holes)) continue;
      Au.push(along === 'x' ? box(.5, .08, .1, a + .25, 1.52, z) : box(.1, .08, .5, z, 1.52, a + .25));
    }
    Au.push(along === 'x' ? box(x1 - x0, .14, .12, 0, H - .9, z) : box(.12, .14, x1 - x0, z, H - .9, 0));
    for (let a = x0 + 2; a < x1; a += 4) if (!gap(a, holes)) Au.push(along === 'x' ? box(.35, H - 1.6, .08, a, 1.55 + (H - 1.6) / 2, z) : box(.08, H - 1.6, .35, z, 1.55 + (H - 1.6) / 2, a));
  }
  // plafonds à caissons des bas-côtés (bois sombre) et nef voûtée
  const ceilWood = pbr('dark_paneled_wood', { color: '#6a4632' });
  const C: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    C.push(box(W - 4.6, .3, 2 * D, sx * (4.6 + (W - 4.6) / 2), H + .15, 0, 2.2));
    for (let z = -D + 2.5; z < D; z += 2.5) Au.push(box(W - 4.6, .22, .14, sx * (4.6 + (W - 4.6) / 2), H - .1, z));
    for (let x = 4.6 + 2.2; x < W; x += 2.2) Au.push(box(.14, .22, 2 * D, sx * x, H - .1, 0));
  }
  {
    const v = new THREE.CylinderGeometry(4.6, 4.6, 2 * D, 32, 1, true, -Math.PI / 2, Math.PI);
    v.rotateX(-Math.PI / 2); v.translate(0, H, 0);
    const vault = new THREE.Mesh(v, new THREE.MeshStandardMaterial({ color: '#3a1c14', roughness: .55, side: THREE.DoubleSide, metalness: .25 }));
    statics.add(vault);
    for (let z = -D + 1.5; z < D; z += 3) {
      const rib = new THREE.TorusGeometry(4.5, .1, 8, 40, Math.PI); rib.translate(0, H, z); Au.push(rib);
      Au.push(box(.5, .3, .5, -4.45, H + .05, z), box(.5, .3, .5, 4.45, H + .05, z));
    }
  }
  // corniche lumineuse le long de la nef (lumière indirecte chaude)
  const cove = glowMat('#ffb766', 2.2);
  statics.add(mesh([box(.08, .05, 2 * D, -4.45, H - .02, 0), box(.08, .05, 2 * D, 4.45, H - .02, 0)], cove, false));
  // colonnes de marbre
  const colMarble = pbr('marble_01', { roughness: 1, color: '#efe4d2', normalScale: .2 });
  colMarble.roughness = .3;
  const Cm: THREE.BufferGeometry[] = [];
  for (const x of [-4.6, 4.6]) for (const z of [-10.5, -4.5, 1.5, 7.5]) {
    Cm.push(cyl(.42, .46, H - 1, x, (H - 1) / 2 + .35, z, 24));
    Au.push(cyl(.6, .6, .35, x, .17, z, 24), cyl(.62, .5, .5, x, H - .4, z, 24), box(1.3, .18, 1.3, x, H - .1, z));
    solids.push([x - .6, z - .6, x + .6, z + .6]);
  }
  statics.add(mesh(C, ceilWood), mesh(Cm, colMarble), mesh(Au, gold));

  // appliques murales : tulipes lumineuses entre les pilastres
  {
    const shade = glowMat('#ffd29a', 2.6), sc: THREE.BufferGeometry[] = [], arms: THREE.BufferGeometry[] = [], glowPts: THREE.Vector3[] = [];
    const add = (x: number, z: number, nx: number, nz: number) => {
      sc.push(new THREE.CylinderGeometry(.09, .05, .2, 12).translate(x + nx * .28, 3.35, z + nz * .28));
      arms.push(box(Math.abs(nx) > 0 ? .3 : .04, .04, Math.abs(nz) > 0 ? .3 : .04, x + nx * .15, 3.2, z + nz * .15), cyl(.07, .07, .3, x + nx * .02, 3.2, z + nz * .02, 10));
      glowPts.push(new THREE.Vector3(x + nx * .3, 3.4, z + nz * .3));
    };
    for (let x = -W + 4; x < W; x += 4) { if (Math.abs(x) > 5) { if (Math.abs(x - 11) > 1.2) add(x, -D + .12, 0, 1); add(x, D - .12, 0, -1); } }
    for (let z = -D + 4; z < D; z += 4) { if (Math.abs(z) > 2.5) add(W - .12, z, -1, 0); if (Math.abs(z) > 2.5) add(-W + .12, z, 1, 0); }
    statics.add(mesh(sc, shade, false), mesh(arms, gold));
    root.add(glows(glowPts, '#ffc27a', .5, .55));
  }

  // ---------- lustres de cristal ----------
  const crystal = glowMat('#ffd6a0', 3.2, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const z of [-9, -3, 3, 9]) {
    const ch = model('Chandelier_03');
    remapMaterials(ch, m => m.name.includes('glass') ? crystal : null);
    ch.scale.setScalar(2.3); ch.position.set(0, H + 1.3 - 2.4, z); root.add(ch); dyn.push(ch);
    const h = halo('#ffcf8a', 1.1, 3.6); h.position.set(0, H + .2 - 2.3 + .9, z); root.add(h);
    statics.add(mesh([cyl(.02, .02, 2.2, 0, H + 3.2, z, 6)], gold));
  }

  // ---------- la caisse (fond de salle) ----------
  {
    const zc = -D + 2.6;
    const counterWood = pbr('dark_paneled_wood', { color: '#8a5a40' });
    const granite = pbr('granite_tile', { color: '#3a3836' }); granite.roughness = .25;
    statics.add(mesh([box(12.4, 1.1, .7, 0, .55, zc, 1.2), box(.7, 1.1, 2.6, -6.2, .55, zc - 1.3, 1.2), box(.7, 1.1, 2.6, 6.2, .55, zc - 1.3, 1.2)], counterWood));
    statics.add(mesh([box(12.7, .07, .85, 0, 1.13, zc, 1.5)], granite));
    solids.push([-6.6, -D, 6.6, zc + .45]);
    const bars: THREE.BufferGeometry[] = [];
    for (let x = -6.1; x <= 6.1; x += .13) {
      const win = [-3.6, 0, 3.6].some(w => Math.abs(x - w) < .55);
      bars.push(cyl(.014, .014, win ? .55 : 1.9, x, win ? 2.85 : 2.12, zc, 6));
    }
    for (const y of [1.17, 2.55, 3.1]) bars.push(box(12.4, .06, .06, 0, y, zc));
    for (const w of [-3.6, 0, 3.6]) { bars.push(box(1.12, .05, .06, w, 2.55, zc), new THREE.TorusGeometry(.56, .025, 6, 20, Math.PI).translate(w, 2.55, zc)); }
    statics.add(mesh(bars, MAT.brass()));
    statics.add(mesh([box(13, .9, .3, 0, 3.6, zc - .05, 1.2)], counterWood));
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: plaqueTex('CAISSE', 'Change · Jetons · Retraits'), roughness: .35, metalness: .3, emissive: '#ffffff', emissiveMap: plaqueTex('CAISSE', 'Change · Jetons · Retraits'), emissiveIntensity: .55 }));
    plaque.position.set(0, 3.62, zc + .11); statics.add(plaque);
    // caisse enregistreuse + lampes de banquier
    const reg = model('CashRegister_01'); reg.scale.setScalar(1); reg.position.set(-1.4, 1.17, zc - .1); reg.rotation.y = 0; statics.add(reg);
    const lampShade = glowMat('#5cff9c', 1.6);
    for (const x of [-4.6, 1.6, 4.8]) {
      statics.add(mesh([cyl(.012, .012, .35, x, 1.34, zc - .15, 6), cyl(.08, .09, .025, x, 1.18, zc - .15, 12)], MAT.brass()));
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(.1, .16, .1, 16, 1, true).rotateZ(Math.PI / 2), lampShade); sh.position.set(x, 1.52, zc - .15); statics.add(sh);
      const hh = halo('#7dffb0', .5, .5); hh.position.copy(sh.position); root.add(hh);
    }
    // liasses de billets sur le comptoir intérieur
    const bills = new THREE.MeshStandardMaterial({ map: canvasTex(64, 32, (c, w, h) => { c.fillStyle = '#9fb58a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8e2c8'; c.fillRect(0, h * .4, w, h * .2); }), roughness: .9 });
    const bl: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 18; i++) bl.push(box(.16, .05, .08, -5.6 + (i % 6) * .2, 1.15 + .05 * Math.floor(i / 6) + .025, zc - 1.6 - (i % 2) * .12));
    statics.add(mesh(bl, bills));
    statics.add(mesh([box(11.6, .9, .6, 0, .45, zc - 1.6, 1.2)], counterWood));
    // chambre forte au fond
    const steel = new THREE.MeshStandardMaterial({ color: '#8d9196', metalness: 1, roughness: .32 });
    const vault = new THREE.Group();
    vault.add(mesh([cyl(1.75, 1.75, .45, 0, 0, 0, 48).rotateX(Math.PI / 2)], steel));
    vault.add(mesh([new THREE.TorusGeometry(1.9, .16, 10, 48)], MAT.blackMetal()));
    const bolts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; bolts.push(cyl(.06, .06, .1, Math.cos(a) * 1.5, Math.sin(a) * 1.5, .26, 10).rotateX(0)); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; bolts.push(box(.06, .9, .06, 0, 0, 0).rotateZ(a).translate(Math.sin(-a) * .45, Math.cos(a) * .45, .45)); }
    bolts.push(new THREE.TorusGeometry(.75, .05, 8, 32).translate(0, 0, .45), cyl(.16, .16, .25, 0, 0, .35, 16).rotateX(0));
    vault.add(mesh(bolts.map(g => g), MAT.chrome()));
    vault.position.set(0, 2.05, -D + .35); root.add(vault);
    statics.add(mesh([box(4.6, 4.6, .3, 0, 2.3, -D + .12, 1.5)], new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: .6, roughness: .5 })));
    // file d'attente : potelets
    const q: THREE.BufferGeometry[] = [];
    for (const x of [-1.6, 1.6]) for (let i = 0; i < 4; i++) q.push(cyl(.03, .03, .9, x, .45, zc + 1.6 + i * 1.2, 10), new THREE.SphereGeometry(.06, 10, 8).translate(x, .92, zc + 1.6 + i * 1.2), cyl(.15, .17, .04, x, .02, zc + 1.6 + i * 1.2, 14));
    statics.add(mesh(q, gold));
    const rp: THREE.BufferGeometry[] = [];
    for (const x of [-1.6, 1.6]) for (let i = 0; i < 3; i++) {
      const a = new THREE.Vector3(x, .86, zc + 1.6 + i * 1.2), b = new THREE.Vector3(x, .86, zc + 2.8 + i * 1.2), m = a.clone().lerp(b, .5); m.y -= .22;
      rp.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 10, .022, 6));
    }
    statics.add(mesh(rp, new THREE.MeshStandardMaterial({ color: '#7a0a12', roughness: .55 })));
  }

  // ---------- machines à sous (côté est) ----------
  const reel = reelTex();
  const screenMat = new THREE.MeshBasicMaterial({ map: reel, color: new THREE.Color(1.8, 1.8, 1.7) });
  screenMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform float uTime;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.7); }`)
      .replace('#include <map_fragment>', `
      vec2 suv = vMapUv; float col = floor(suv.x * 3.0); float sx = fract(suv.x * 3.0);
      float seed = hh(floor(vWP.xz * 1.7));
      float cyc = uTime * .16 + seed * 9.0; float k = fract(cyc); float idx = floor(cyc);
      float spin = smoothstep(0.0, .18 + col * .07, k);
      float a = floor(hh(vec2(idx, seed)) * 8.0), b = floor(hh(vec2(idx + 1.0, seed)) * 8.0);
      float off = (a + spin * (16.0 + b - a)) / 8.0;
      vec4 sc = texture2D(map, vec2(sx, suv.y * .375 + off - .0625 * 1.0));
      sc.rgb *= (smoothstep(0.0, .05, sx) * smoothstep(1.0, .95, sx)) * .85 + .15;
      sc.rgb *= .55 + .45 * sin(suv.y * 3.14159);
      sc.rgb = mix(sc.rgb, vec3(1.0, .15, .1), smoothstep(.012, .0, abs(suv.y - .5)) * .7);
      diffuseColor *= sc;`);
  };
  const toppers = [topperTex('JACKPOT', '#ffcc33', '#5a0710'), topperTex('DIAMANT', '#5ce1ff', '#071a4a'), topperTex('FORTUNE', '#ff5fd2', '#3a0745')];
  const topMats = toppers.map(t => new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(2.2, 2.2, 2.2) }));
  const cabMats = [MAT.lacquer('#6d0a12', .3), MAT.lacquer('#0b1c4a', .3), MAT.lacquer('#3a0a3e', .3)];
  const chrome = MAT.chrome(), black = MAT.blackMetal();
  const deck = MAT.lacquer('#111015', .4);
  const stoolSeat = MAT.lacquer('#5a0c12', .5);
  const slotGeo = { cab: [] as THREE.BufferGeometry[][], scr: [] as THREE.BufferGeometry[], top: [[], [], []] as THREE.BufferGeometry[][], chr: [] as THREE.BufferGeometry[], blk: [] as THREE.BufferGeometry[], deck: [] as THREE.BufferGeometry[], seat: [] as THREE.BufferGeometry[] };
  slotGeo.cab = [[], [], []];
  const candlePts: THREE.Vector3[] = [];
  const addSlot = (x: number, z: number, face: number, v: number) => {
    // face = direction vers le joueur (+1 = +x, -1 = -x)
    const m = new THREE.Matrix4().makeRotationY(face > 0 ? Math.PI / 2 : -Math.PI / 2).setPosition(x, 0, z);
    const T = (g: THREE.BufferGeometry) => g.applyMatrix4(m);
    slotGeo.cab[v].push(T(new RoundedBoxGeometry(.78, 1.0, .7, 2, .05).translate(0, .5, 0)), T(new RoundedBoxGeometry(.78, 1.05, .5, 2, .06).translate(0, 1.5, -.08)));
    slotGeo.scr.push(T(new THREE.PlaneGeometry(.58, .42).translate(0, 1.55, .175)));
    slotGeo.top[v].push(T(new THREE.PlaneGeometry(.74, .37).translate(0, 2.3, .1)));
    slotGeo.blk.push(T(box(.78, .42, .42, 0, 2.3, -.12)), T(box(.66, .5, .02, 0, 1.55, .16)));
    slotGeo.deck.push(T(box(.78, .1, .32, 0, 1.03, .38).rotateX(0)));
    slotGeo.chr.push(T(box(.03, 2.5, .03, -.4, 1.25, .34)), T(box(.03, 2.5, .03, .4, 1.25, .34)), T(box(.8, .03, .03, 0, 2.5, .1)), T(cyl(.02, .02, .4, .44, 1.35, .1, 8)), T(new THREE.SphereGeometry(.05, 10, 8).translate(.44, 1.57, .1)));
    // tabouret
    slotGeo.chr.push(T(cyl(.025, .025, .62, 0, .31, .95, 8)), T(cyl(.2, .22, .03, 0, .015, .95, 16)));
    slotGeo.seat.push(T(cyl(.21, .2, .1, 0, .68, .95, 18)));
    candlePts.push(new THREE.Vector3(0, 2.62, -.05).applyMatrix4(m));
    const sp = new THREE.Vector3(0, 0, .95).applyMatrix4(m);
    SEATS.push({ x: sp.x, z: sp.z, yaw: (face > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI, y: .73 });
    slotGeo.chr.push(T(cyl(.04, .04, .1, 0, 2.55, -.05, 10)));
  };
  // deux îlots dos à dos + une rangée contre le mur est (plan partagé avec le serveur)
  for (const sl of SLOT_LIST) { SLOT_SEAT.push(SEATS.length); addSlot(sl.x, sl.z, sl.face, sl.v); }
  solids.push([7.9, -10.6, 10.8, -4.4], [7.9, 2, 10.8, 8.2], [12.1, -10.6, 15, -4.4], [12.1, 2, 15, 8.2]);
  solids.push([W - 2, -12.8, W, -4.6], [W - 2, 2.6, W, 9.8]);
  for (let v = 0; v < 3; v++) { statics.add(mesh(slotGeo.cab[v], cabMats[v])); statics.add(mesh(slotGeo.top[v], topMats[v], false)); }
  const scr = mesh(slotGeo.scr, screenMat, false); scr.userData.keep = true; root.add(scr);
  statics.add(mesh(slotGeo.chr, chrome), mesh(slotGeo.blk, black), mesh(slotGeo.deck, deck), mesh(slotGeo.seat, stoolSeat));
  root.add(bulbs(candlePts, '#ff4a3a', { size: .045, speed: .7, period: 2.3, power: 8 }));
  // néon « MACHINES À SOUS » au-dessus des îlots
  const slotSign = neonPlane(neonTex('MACHINES  À  SOUS', '112px Monoton', '#ff46b4', 2048, 256, { tube: 6 }), 7, .9, '#ff86d0', 2.6);
  slotSign.position.set(W - .14, 5.6, -8.7); slotSign.rotation.y = -Math.PI / 2; root.add(slotSign);

  // ---------- tables de jeu « comme au vrai casino » ----------
  const tk = new Kit();
  roulette(tk, root, -12, -9.6, 0, solids); roulette(tk, root, -12, -3.6, 0, solids);
  pendant(tk, root, -12.6, -9.6, 2.6, .9, 0, 3.0, H, .79); pendant(tk, root, -12.6, -3.6, 2.6, .9, 0, 3.0, H, .79);
  blackjack(tk, root, -12, 3.6, 0, solids); blackjack(tk, root, -12, 10.2, 0, solids);
  pendant(tk, root, -12, 4.1, 1.7, .7, 0, 2.9, H, .83); pendant(tk, root, -12, 10.7, 1.7, .7, 0, 2.9, H, .83);
  tk.flush(statics);

  // ---------- salon près de l'entrée ----------
  {
    const velvetRed = (m: THREE.MeshStandardMaterial) => { const c = m.clone(); c.color.set('#b0303a'); return c; };
    const sofa = model('Sofa_01'); remapMaterials(sofa, velvetRed); sofa.position.set(13, 0, 13.6); sofa.rotation.y = Math.PI; statics.add(sofa);
    for (const [x, z, r] of [[10.6, 11.6, Math.PI / 2 + .4], [15.4, 11.6, -Math.PI / 2 - .4]] as const) {
      const a = model('ArmChair_01'); remapMaterials(a, velvetRed); a.position.set(x, 0, z); a.rotation.y = r; statics.add(a);
    }
    const ot = model('Ottoman_01'); ot.position.set(13, 0, 11.4); statics.add(ot);
    solids.push([9.8, 10.4, 16.4, 14.6]);
    for (const [x, z] of [[-16.8, 13.6], [16.8, -13.6], [-16.8, -13.6], [5.3, 13.9], [-5.3, 13.9]] as const) {
      const p = model('potted_plant_04'); p.scale.setScalar(4); p.position.set(x, 0, z); statics.add(p);
    }
    for (const x of [-8.5, 8.5]) {
      statics.add(mesh([box(.8, 1.2, .8, x, .6, -D + 1.2, 1)], colMarble));
      const b = model('marble_bust_01'); b.scale.setScalar(1.4); b.position.set(x, 1.2, -D + 1.2); statics.add(b);
    }
  }

  // ---------- caméras de surveillance (clin d'œil au jeu) ----------
  for (const [x, z, r] of [[-W + .4, -D + .4, Math.PI * .25], [W - .4, -D + .4, -Math.PI * .25], [-W + .4, D - .4, Math.PI * .75], [W - .4, D - .4, -Math.PI * .75], [0, -D + 3.4, 0]] as const) {
    const c = model('security_camera_01'); c.scale.setScalar(1.2);
    c.position.set(x, x === 0 ? 4.4 : 6.6, z); c.rotation.y = r + Math.PI; root.add(c); dyn.push(c);
    const led = halo('#ff1a1a', 2.5, .18); led.position.set(x, (x === 0 ? 4.4 : 6.6) - .05, z); root.add(led);
    onTick((t) => { led.visible = Math.sin(t * 3 + x) > .2; });
  }

  // ---------- entrée (mur sud) : portes vitrées sur la nuit pluvieuse ----------
  {
    const nightT = canvasTex(256, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1020'); g.addColorStop(1, '#1d1410'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { c.strokeStyle = `rgba(160,180,220,${.08 + rnd() * .12})`; c.beginPath(); const x = rnd() * w, y = rnd() * h; c.moveTo(x, y); c.lineTo(x - 3, y + 14 + rnd() * 20); c.stroke(); }
      for (let i = 0; i < 6; i++) { const rg = c.createRadialGradient(rnd() * w, h * (.5 + rnd() * .3), 1, 0, 0, 0); void rg; c.fillStyle = 'rgba(255,170,80,.5)'; c.beginPath(); c.arc(rnd() * w, h * (.55 + rnd() * .3), 3 + rnd() * 6, 0, 7); c.fill(); }
    });
    void nightT;
    const frost = canvasTex(128, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe2b0'); g.addColorStop(.6, '#d08a40'); g.addColorStop(1, '#6a3412'); c.fillStyle = g; c.fillRect(0, 0, w, h); for (let i = 0; i < 2000; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * .08})`; c.fillRect(rnd() * w, rnd() * h, 1, 1); } });
    const nm = new THREE.MeshBasicMaterial({ map: frost, color: new THREE.Color(1.1, 1.0, .9) });
    const fr: THREE.BufferGeometry[] = [];
    for (const x of [-3.4, 0, 3.4]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 5), nm); d.rotation.y = Math.PI; d.position.set(x, 2.5, D - .02); statics.add(d);
      for (const dx of [-1.55, 0, 1.55]) fr.push(box(.08, 5, .1, x + dx, 2.5, D - .06));
      for (const y of [.05, 2.5, 5]) fr.push(box(3.1, .08, .1, x, y, D - .06));
    }
    statics.add(mesh(fr, MAT.brass()));
    const exitSign = neonPlane(neonTex('SORTIE', '150px "Bebas Neue"', '#3dff7a', 512, 200, { tube: 4 }), 1.4, .55, '#7dffa8', 2);
    exitSign.position.set(0, 5.8, D - .14); exitSign.rotation.y = Math.PI; root.add(exitSign);
  }

  // ---------- animations ----------
  // ---------- cloisons : la nef devient une galerie, les ailes deviennent des salles ----------
  {
    const pk = new Kit();
    const doors: [number, number, number][] = [[-5, 2.8, 3.6], [7, 2.8, 3.6]];
    for (const x of [-6.2, 6.2]) {
      wallRun(pk, wood, 'z', x, -12.3, D, 0, 1.5, .34, 1.6, doors);
      wallRun(pk, damask, 'z', x, -12.3, D, 1.5, H, .28, 1.1, doors);
      for (const fx of [x - .17, x + .17]) {
        for (let a = -12.3; a < D; a += .5) if (!doors.some(([c, w]) => Math.abs(a + .25 - c) < w / 2 + .2)) pk.add(gold, box(.04, .08, .5, fx, 1.52, a + .25));
        pk.add(gold, box(.05, .14, D + 12.3, fx, H - .9, (D - 12.3) / 2));
        for (const [c, w, h] of doors) pk.add(gold, box(.06, h + .2, .16, fx, (h + .2) / 2, c - w / 2 - .08), box(.06, h + .2, .16, fx, (h + .2) / 2, c + w / 2 + .08), box(.06, .2, w + .32, fx, h + .1, c));
      }
      let cur = -12.3;
      for (const [c, w] of doors) { solids.push([x - .25, cur, x + .25, c - w / 2]); cur = c + w / 2; }
      solids.push([x - .25, cur, x + .25, D]);
    }
    const pT = plaqueTex('JEUX DE TABLE', 'Roulette · Blackjack'), mT = plaqueTex('MACHINES À SOUS', 'Jackpots progressifs');
    for (const [x, t] of [[-6.04, pT], [6.04, mT]] as const) for (const z of [-5, 7]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .65), new THREE.MeshStandardMaterial({ map: t, emissive: '#fff', emissiveMap: t, emissiveIntensity: .5, roughness: .35, metalness: .3 }));
      p.position.set(x, 4.25, z); p.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; statics.add(p);
    }
    // tapis rouge, bustes et palmiers entre les colonnes
    pk.add(pbr('velour_velvet', { color: '#a80e1a' }), box(3, .02, 26, 0, .012, 2, 1));
    pk.add(gold, box(.05, .03, 26, -1.52, .02, 2), box(.05, .03, 26, 1.52, .02, 2));
    for (const z of [-7.5, 4.5, 10.5]) for (const x of [-4.6, 4.6]) {
      pk.add(colMarble, box(.6, 1.1, .6, x, .55, z, 1));
      const b = model('marble_bust_01'); b.scale.setScalar(1.25); b.position.set(x, 1.1, z); b.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; statics.add(b);
      solids.push([x - .4, z - .4, x + .4, z + .4]);
    }
    pk.flush(statics);
  }
  // ---------- la Grande Roue de la fortune, au milieu de la galerie ----------
  {
    const g = new THREE.Group(); g.position.set(0, 0, 0); root.add(g);
    const wk2 = new Kit();
    wk2.add(MAT.lacquer('#2a140a', .35), cyl(1.9, 2.0, .3, 0, .15, 0, 8));
    wk2.add(pbr('velour_velvet', { color: '#a80e1a' }), cyl(1.82, 1.82, .02, 0, .31, 0, 8));
    wk2.add(gold, new THREE.TorusGeometry(1.95, .04, 6, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8).translate(0, .3, 0));
    for (const sx of [-1, 1]) wk2.add(MAT.lacquer('#1a0c06', .35), box(.16, 3.6, .16, 0, 0, 0).rotateZ(sx * .2).translate(sx * .5, 1.95, -.3));
    wk2.add(gold, new THREE.TorusGeometry(1.86, .07, 10, 64).translate(0, 2.55, .02), cyl(.1, .1, .5, 0, 0, 0, 16).rotateX(Math.PI / 2).translate(0, 2.55, -.1));
    wk2.add(MAT.lacquer('#b0141a', .3), new THREE.ConeGeometry(.12, .3, 4).rotateZ(Math.PI).translate(0, 4.5, .12));
    wk2.flush(g);
    const VALS = ['1', '2', '5', '1', '10', '2', '1', '20', '1', '5', '2', 'JOKER', '1', '2', '5', '1', '10', '2', '1', '40', '1', '5', '2', 'CASINO'];
    const wt = canvasTex(1024, 1024, (c, w) => {
      const R = w / 2; c.translate(R, R);
      const n = VALS.length, a = Math.PI * 2 / n;
      VALS.forEach((v, i) => {
        c.fillStyle = v === 'JOKER' ? '#1a1a1a' : v === 'CASINO' ? '#0f6a3a' : ['#b3121e', '#f2e6c8', '#1a3fbf', '#d9a441'][i % 4];
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, i * a - Math.PI / 2, (i + 1) * a - Math.PI / 2); c.closePath(); c.fill();
        c.save(); c.rotate((i + .5) * a); c.fillStyle = (i % 4 === 1 && v.length < 3) ? '#2a1a0a' : '#fff6e0'; c.textAlign = 'center';
        c.font = v.length > 2 ? 'bold 40px "Bebas Neue"' : 'bold 84px "Bebas Neue"'; c.fillText(v.length > 2 ? v : '×' + v, 0, -R * .72); c.restore();
      });
      c.strokeStyle = '#d4a64a'; c.lineWidth = 5;
      for (let i = 0; i < n; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(i * a - Math.PI / 2) * R, Math.sin(i * a - Math.PI / 2) * R); c.stroke(); }
      c.fillStyle = '#2a140a'; c.beginPath(); c.arc(0, 0, R * .26, 0, 7); c.fill();
      c.fillStyle = '#d4a64a'; c.font = 'italic 48px "Playfair Display"'; c.textAlign = 'center'; c.fillText('Fortune', 0, 16);
    });
    // la roue a une épaisseur et un dos décoré : elle se regarde sous tous les angles
    const disc = new THREE.Group(); disc.position.set(0, 2.55, 0); g.add(disc);
    disc.add(new THREE.Mesh(new THREE.CircleGeometry(1.8, 72), new THREE.MeshStandardMaterial({ map: wt, roughness: .35, metalness: .15 })));
    disc.add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, .16, 72, 1, true).rotateX(Math.PI / 2).translate(0, 0, -.081), MAT.lacquer('#2a140a', .35)));
    const backT = canvasTex(512, 512, (c, w) => {
      const R = w / 2; c.translate(R, R);
      c.fillStyle = '#1e0e06'; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
      c.strokeStyle = '#c99a45'; c.lineWidth = 3;
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * R * .3, Math.sin(a) * R * .3); c.lineTo(Math.cos(a) * R * .94, Math.sin(a) * R * .94); c.stroke(); }
      for (const r of [.3, .62, .94]) { c.beginPath(); c.arc(0, 0, R * r, 0, 7); c.stroke(); }
      c.fillStyle = '#d9a441'; c.textAlign = 'center'; c.font = 'italic 54px "Playfair Display"'; c.fillText('Grand', 0, -6); c.font = '30px "Bebas Neue"'; (c as any).letterSpacing = '8px'; c.fillText('CASINO', 0, 34);
    });
    const back = new THREE.Mesh(new THREE.CircleGeometry(1.8, 72), new THREE.MeshStandardMaterial({ map: backT, roughness: .4, metalness: .3 }));
    back.rotation.y = Math.PI; back.position.z = -.162; disc.add(back);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 1.98, 2.55 + Math.sin(a) * 1.98, .04)); }
    g.add(bulbs(pts, '#ffd9a0', { size: .05, speed: 9, period: 4, power: 7 }));
    const ws = neonPlane(neonTex('LA GRANDE ROUE', '120px Monoton', '#ffcf5a', 2048, 220, { tube: 6 }), 4.2, .45, '#ffe2a0', 2.6);
    ws.position.set(0, 4.95, 0); g.add(ws);
    const ws2 = ws.clone(); ws2.rotation.y = Math.PI; ws2.position.z = -.02; g.add(ws2);
    let spin = .25;
    onTick((t, dt) => { if (Math.sin(t * .11) > .985) spin = 3.5; spin += (.25 - spin) * dt * .35; disc.rotation.z -= spin * dt; });
    solids.push([-2.1, -2.1, 2.1, 2.1]);
  }
  // ---------- tableau du jackpot progressif au-dessus des machines ----------
  {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 224;
    const jt = new THREE.CanvasTexture(cv); jt.colorSpace = THREE.SRGBColorSpace;
    let amount = 0;
    const draw = () => {
      const c = cv.getContext('2d')!;
      c.fillStyle = '#07020a'; c.fillRect(0, 0, 1024, 224);
      c.textAlign = 'center'; c.fillStyle = '#ff4fb0'; c.shadowColor = '#ff4fb0'; c.shadowBlur = 18; c.font = '64px Monoton'; c.fillText('MÉGA JACKPOT', 512, 80);
      c.fillStyle = '#ffd25a'; c.shadowColor = '#ffb020'; c.font = 'bold 96px "Courier New", monospace';
      c.fillText(amount ? amount.toLocaleString('fr-FR') + ' €' : '— — —', 512, 186);
      jt.needsUpdate = true;
    };
    draw();
    setJackpotBoard = (v: number) => { if (v !== amount) { amount = v; draw(); } };
    const jm = new THREE.MeshBasicMaterial({ map: jt, color: new THREE.Color(1.8, 1.8, 1.8) });
    const jk = new Kit();
    jk.add(MAT.blackMetal(), box(5.2, 1.25, .22, 11.4, 4.45, -1), cyl(.015, .015, 3.6, 9.4, 6.8, -1, 6), cyl(.015, .015, 3.6, 13.4, 6.8, -1, 6));
    jk.flush(statics);
    for (const [z, r] of [[-.88, 0], [-1.12, Math.PI]] as const) { const p = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), jm); p.position.set(11.4, 4.45, z); p.rotation.y = r; root.add(p); }
  }

  // ---------- autres pièces ----------
  const rooms = buildRooms(root, statics, mirror, solids);
  const west = buildWest(root, statics, mirror, solids);

  // ---------- lumières par zone (nombre fixe de lampes) ----------
  const pool = new LightPool(root, 6, 2);
  const ch = (z: number): LightDef => ({ kind: 'point', pos: [0, H - 2.2, z], color: '#ffbf73', intensity: 30, distance: 15, decay: 1.4, flicker: .02 });
  const warm = (x: number, y: number, z: number, i: number, d = 13, c = '#ffc58a'): LightDef => ({ kind: 'point', pos: [x, y, z], color: c, intensity: i, distance: d });
  const down = (x: number, z: number, i: number, a = .8): LightDef => ({ kind: 'spot', pos: [x, 7.6, z], target: [x, 0, z], color: '#ffd8a8', intensity: i, distance: 14, angle: a, penumbra: .7 });
  const vaultSpot: LightDef = { kind: 'spot', pos: [0, 5.6, -D + 4], target: [0, 2.05, -D + .35], color: '#ffe1b0', intensity: 60, distance: 10, angle: .5, penumbra: .6 };
  const zones: Zone[] = [
    { name: 'vip', rects: [[18.4, -7, 30, 7]], lights: rooms.zones.vip },
    { name: 'bar', rects: [[-30.2, -8, -18.1, 14]], lights: west.zones.bar },
    { name: 'backW', rects: [[-24, -29.6, -5, -15.15], [-24, -15.15, -21, -8]], lights: west.zones.backW },
    { name: 'backE', rects: [[-5, -29.6, 20, -15.15]], lights: rooms.zones.back },
    { name: 'tables', rects: [[-18.2, -15.15, -6.2, 15]], lights: [warm(-12, 5.5, -7, 22), warm(-12, 5.5, 6, 22), ch(-3), ch(3), warm(-24, 3.6, 0, 10, 10, '#ffb468'), warm(-12, 3, 13.5, 8, 8), down(-12, -6.4, 60), down(-12, 6.4, 60)] },
    { name: 'slots', rects: [[6.2, -15.15, 18.4, 15]], lights: [warm(11.3, 3, -7, 16, 10, '#ff5fae'), warm(11.3, 3, 5.5, 12, 10, '#5fd0ff'), warm(13, 4, 12.5, 14, 10), ch(-3), ch(3), warm(23.6, 3.4, 0, 8, 9, '#ffd9a6'), down(11.3, -1, 50, .9), { kind: 'spot', pos: [11, 4, -12.5], target: [11, 1, -15], color: '#ffd8a8', intensity: 10, distance: 6, angle: .6, penumbra: .7 }] },
    { name: 'gallery', rects: [[-6.2, -15.15, 6.2, 15.3]], lights: [ch(-9), ch(-3), ch(3), ch(9), warm(-12, 5.5, 0, 14), warm(11.3, 3.2, -1, 10, 10, '#ff5fae'), vaultSpot, { kind: 'spot', pos: [0, 7.8, 5], target: [0, 2.4, 0], color: '#fff0d8', intensity: 70, distance: 14, angle: .36, penumbra: .5 }] },
  ];
  const zoneByName = (n: string) => zones.find(z => z.name === n)!;
  // reflets diffus : une sonde d'environnement capturée dans chaque zone
  const pm = new THREE.PMREMGenerator(renderer);
  for (const u of mirror.users) u.uOn.value = 0;
  const probes: Record<string, [number, number, number]> = { gallery: [0, 2.4, 6], tables: [-12, 1.8, 0.3], slots: [11.3, 1.8, -1], vip: [24, 1.8, 0], bar: [-23, 1.6, -2], backE: [3, 1.6, -21], backW: [-10, 1.5, -21] };
  for (const zn of zones) {
    pool.apply(zn.lights);
    const c = probes[zn.name];
    root.position.set(-c[0], -c[1], -c[2]); scene.updateMatrixWorld(true);
    zn.env = pm.fromScene(scene, .03, .1, 60).texture;
    zn.envIntensity = ['gallery', 'tables', 'slots'].includes(zn.name) ? 1.2 : 1;
  }
  root.position.set(0, 0, 0); scene.updateMatrixWorld(true);
  for (const u of mirror.users) u.uOn.value = 1;
  // les gens arrivent après la capture des sondes (elles ne doivent pas les contenir)
  const crowd = new Crowd(root, camera, quality === 'high');
  populateHall(crowd, quality === 'low');
  let current: Zone | null = null;
  const setZone = (zn: Zone) => {
    current = zn; pool.apply(zn.lights);
    scene.environment = zn.env!; scene.environmentIntensity = zn.envIntensity ?? 1;
  };
  setZone(zoneByName('gallery'));
  onTick((t) => {
    const p = camera.position, zn = zoneAt(zones, p.x, p.z) ?? zoneByName('gallery');
    if (zn !== current) setZone(zn);
    pool.tick(t);
  });
  // flux vidéo de la salle de surveillance : seulement quand on peut les voir
  const feedZone = [zoneByName('slots'), zoneByName('tables'), zoneByName('gallery'), zoneByName('vip')];
  const feedsHook = (r: THREE.WebGLRenderer) => {
    if (current?.name !== 'backE' || camera.position.x < 9) return;
    rooms.feedsHook(r, (i) => {
      const zn = feedZone[i]; pool.apply(zn.lights); scene.environment = zn.env!;
      for (const u of mirror.users) u.uOn.value = 0;
    }, () => { setZone(current!); for (const u of mirror.users) u.uOn.value = 1; });
  };

  return {
    scene, camera, hooks: [feedsHook, mirror.update], mirror,
    look: { tone: 'agx', exposure: 1.0, bloom: { intensity: 1.05, threshold: .85, smoothing: .25, radius: .75 },
      ao: { radius: 1.4, intensity: 2.2, falloff: 1, color: '#0a0503' }, saturation: .14, contrast: .08, vignette: .45, grain: .04 },
    shots: [
      { from: [0, 6.4, 14.2], to: [0, 3.0, 7], look: [0, 2.6, 0], look2: [0, 2.3, -4], fov: 50, dur: 8, focus: 8, text: '23 h 47 — Grand Casino. Trois heures avant la fermeture.' },
      { from: [-8.1, 1.2, 8.4], to: [-8.3, 1.3, -1.2], look: [-12, .95, 3.6], look2: [-12, .9, -6.8], fov: 40, dur: 6, focus: 4.5, text: 'Ce soir, des millions changent de mains sous les lustres.' },
      { from: [-19.6, 1.6, -3.2], to: [-21.4, 1.5, -1.6], look: [-27.3, 1.4, -1], look2: [-26.5, 1.3, 2.5], fov: 44, dur: 6, focus: 5, text: 'Au bar, on parle trop. Et les murs écoutent.' },
      { from: [19.3, 1.55, 2.8], to: [21.2, 1.35, 1.5], look: [23.6, .9, 0], look2: [24.2, .85, -.2], fov: 42, dur: 6, focus: 3.5, text: 'Au salon privé, les gros joueurs misent sans compter.' },
      { from: [14.6, 1.55, -19.6], to: [16.8, 1.45, -21.2], look: [20, 1.9, -21.5], look2: [20, 1.9, -21.5], fov: 44, dur: 6, focus: 3.4, text: 'Douze caméras. Six vigiles. Aucun angle mort… en théorie.' },
      { from: [8.2, 1.5, -21], to: [3.4, 1.45, -21.2], look: [0, 1.0, -21.4], look2: [-1.4, .9, -21.6], fov: 46, dur: 6, focus: 3.4, text: 'Et au bout du couloir : la chambre forte.' },
      { from: [-2.6, 1.3, -5.5], to: [-1.0, 1.65, -9], look: [0, 1.8, -14], look2: [0, 2.1, -15], fov: 38, dur: 7, focus: 5, text: 'Parmi vous, quelqu\'un a déjà parlé aux flics.' },
    ],
    focus: 14,
    tick: () => {},
    spawn: { pos: [0, 1.65, 12.4], yaw: 0 },
    solids: solids as [number, number, number, number][], walk: [[-W + .6, -D + .6, W - .6, D - .6], ...rooms.walk, ...west.walk],
  };
}

const chipCols = ['#c4141e', '#1a3fbf', '#111111', '#178a3a', '#e8e0cc', '#7a1aa8'];
function addChips(parent: THREE.Object3D, x: number, z: number, stacks: number) {
  const g = new THREE.CylinderGeometry(.02, .02, .006, 14);
  const n = stacks * 8;
  const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: .45 }), n);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  let k = 0;
  for (let s = 0; s < stacks; s++) {
    const sx = x + (s % 7) * .05 - .15, sz = z + Math.floor(s / 7) * .05;
    const h = 3 + Math.floor(rnd() * 6), col = chipCols[s % chipCols.length];
    for (let i = 0; i < h && k < n; i++, k++) {
      m.makeTranslation(sx, .835 + i * .0062, sz); im.setMatrixAt(k, m); im.setColorAt(k, c.set(col));
    }
  }
  im.count = k;
  parent.add(im);
}

export const _u = { box, rnd };
