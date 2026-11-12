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
import type { World } from './world';

const W = 18, D = 15, H = 8.6;          // demi-largeur, demi-profondeur, hauteur des bas-côtés

export function buildHall(renderer: THREE.WebGLRenderer, quality: string): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0605');
  scene.fog = new THREE.FogExp2('#1c120c', .014);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .08, 120);
  camera.layers.enable(1);
  const root = new THREE.Group(); scene.add(root);
  const statics = new THREE.Group(); root.add(statics);
  const dyn: THREE.Object3D[] = [];
  const solids: [number, number, number, number][] = [];
  const mirror = new Mirror(scene, 0, quality === 'high' ? .5 : .36);

  root.add(new THREE.HemisphereLight('#7a5638', '#1a0e08', .9));

  // ---------- sol : damier marbre crème / granit noir, ciré ----------
  const floorMat = wetMaterial(pbr('marble_01', { roughness: 1, normalScale: .25, color: '#d9ccb6' }), mirror,
    { damp: .85, blur: 1.1, distort: .01, darken: 0, ripples: 0, f0: .07, checker: texRaw('granite_tile', 'diff') });
  floorMat.roughness = .55;
  const floor = new THREE.Mesh(box(2 * W, .1, 2 * D, 0, -.05, 0, 2.4), floorMat);
  floor.receiveShadow = true; root.add(floor);
  mirror.hidden.push(floor);
  // moquettes des zones de jeu
  const carpet = new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: 1, color: '#d8c8c8' });
  carpet.map!.repeat.set(1, 1);
  statics.add(mesh([box(11.6, .025, 25, 11.4, .012, -.5, 4), box(11.6, .025, 19, -11.4, .012, -3.5, 4)], carpet));

  // ---------- murs ----------
  const wood = pbr('dark_paneled_wood', { color: '#a07058' });
  const damask = new THREE.MeshStandardMaterial({ map: damaskTex(), roughness: .72, color: '#ffffff' });
  const gold = MAT.gold();
  const Wd: THREE.BufferGeometry[] = [], Dm: THREE.BufferGeometry[] = [], Au: THREE.BufferGeometry[] = [];
  // lambris bas + tenture
  Wd.push(box(2 * W, 1.5, .2, 0, .75, -D, 1.6), box(2 * W, 1.5, .2, 0, .75, D, 1.6), box(.2, 1.5, 2 * D, -W, .75, 0, 1.6), box(.2, 1.5, 2 * D, W, .75, 0, 1.6));
  Dm.push(box(2 * W, H - 1.5, .1, 0, 1.5 + (H - 1.5) / 2, -D - .05, 1.1), box(2 * W, H - 1.5, .1, 0, 1.5 + (H - 1.5) / 2, D + .05, 1.1));
  Dm.push(box(.1, H - 1.5, 2 * D, -W - .05, 1.5 + (H - 1.5) / 2, 0, 1.1), box(.1, H - 1.5, 2 * D, W + .05, 1.5 + (H - 1.5) / 2, 0, 1.1));
  for (const [x0, x1, z, along] of [[-W, W, -D + .11, 'x'], [-W, W, D - .11, 'x'], [-D, D, -W + .11, 'z'], [-D, D, W - .11, 'z']] as const) {
    if (along === 'x') {
      Au.push(box(x1 - x0, .08, .1, 0, 1.52, z), box(x1 - x0, .14, .12, 0, H - .9, z));
      for (let x = x0 + 2; x < x1; x += 4) Au.push(box(.35, H - 1.6, .08, x, 1.55 + (H - 1.6) / 2, z));
    } else {
      Au.push(box(.1, .08, x1 - x0, z, 1.52, 0), box(.12, .14, x1 - x0, z, H - .9, 0));
      for (let x = x0 + 2; x < x1; x += 4) Au.push(box(.08, H - 1.6, .35, z, 1.55 + (H - 1.6) / 2, x));
    }
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
    v.rotateX(Math.PI / 2); v.translate(0, H, 0);
    const vault = new THREE.Mesh(v, new THREE.MeshStandardMaterial({ color: '#2a1410', roughness: .6, side: THREE.BackSide, metalness: .2 }));
    statics.add(vault);
    for (let z = -D + 1.5; z < D; z += 3) {
      const rib = new THREE.TorusGeometry(4.5, .09, 6, 32, Math.PI); rib.translate(0, H, z); Au.push(rib);
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
  statics.add(mesh(Wd, wood), mesh(Dm, damask), mesh(C, ceilWood), mesh(Cm, colMarble));

  // appliques murales : tulipes lumineuses entre les pilastres
  {
    const shade = glowMat('#ffd29a', 2.6), sc: THREE.BufferGeometry[] = [], arms: THREE.BufferGeometry[] = [], glowPts: THREE.Vector3[] = [];
    const add = (x: number, z: number, nx: number, nz: number) => {
      sc.push(new THREE.CylinderGeometry(.09, .05, .2, 12).translate(x + nx * .28, 3.35, z + nz * .28));
      arms.push(box(Math.abs(nx) > 0 ? .3 : .04, .04, Math.abs(nz) > 0 ? .3 : .04, x + nx * .15, 3.2, z + nz * .15), cyl(.07, .07, .3, x + nx * .02, 3.2, z + nz * .02, 10));
      glowPts.push(new THREE.Vector3(x + nx * .3, 3.4, z + nz * .3));
    };
    for (let x = -W + 4; x < W; x += 4) { if (Math.abs(x) > 5) { add(x, -D + .12, 0, 1); add(x, D - .12, 0, -1); } }
    for (let z = -D + 4; z < D; z += 4) { add(W - .12, z, -1, 0); if (z > 6 || z < -8) add(-W + .12, z, 1, 0); }
    statics.add(mesh(sc, shade, false), mesh(arms, gold));
    root.add(glows(glowPts, '#ffc27a', 1.1, .55));
  }

  // ---------- lustres de cristal ----------
  const crystal = glowMat('#ffd6a0', 3.2, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lights: THREE.PointLight[] = [];
  for (const z of [-9, -3, 3, 9]) {
    const ch = model('Chandelier_03');
    remapMaterials(ch, m => m.name.includes('glass') ? crystal : null);
    ch.scale.setScalar(2.3); ch.position.set(0, H + 1.3 - 2.4, z); root.add(ch); dyn.push(ch);
    const h = halo('#ffcf8a', 1.1, 3.6); h.position.set(0, H + .2 - 2.3 + .9, z); root.add(h);
    const pl = new THREE.PointLight('#ffbf73', 30, 15, 1.4); pl.position.set(0, H - 2.2, z); root.add(pl); lights.push(pl);
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
    const vs = new THREE.SpotLight('#ffe1b0', 60, 10, .5, .6, 1.5); vs.position.set(0, 5.6, -D + 4); vs.target = vault; root.add(vs);
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
    slotGeo.chr.push(T(cyl(.04, .04, .1, 0, 2.55, -.05, 10)));
  };
  // deux îlots dos à dos + une rangée contre le mur est
  for (const z0 of [-10, 2.6]) for (let i = 0; i < 6; i++) {
    const z = z0 + i * 1.0, v = (i + (z0 > 0 ? 1 : 0)) % 3;
    addSlot(9.0, z, -1, v); addSlot(9.72, z, 1, (v + 1) % 3);
  }
  solids.push([7.9, -10.6, 10.8, -4.4], [7.9, 2, 10.8, 8.2]);
  for (let i = 0; i < 12; i++) { const z = -11 + i * 1.0 + (i >= 6 ? 4 : 0); addSlot(W - .55, z, -1, i % 3); }
  solids.push([W - 2, -12, W, 7.2]);
  for (let v = 0; v < 3; v++) { statics.add(mesh(slotGeo.cab[v], cabMats[v])); statics.add(mesh(slotGeo.top[v], topMats[v], false)); }
  const scr = mesh(slotGeo.scr, screenMat, false); scr.userData.keep = true; root.add(scr);
  statics.add(mesh(slotGeo.chr, chrome), mesh(slotGeo.blk, black), mesh(slotGeo.deck, deck), mesh(slotGeo.seat, stoolSeat));
  root.add(bulbs(candlePts, '#ff4a3a', { size: .045, speed: .7, period: 2.3, power: 8 }));
  const slotLight = new THREE.PointLight('#ff5fae', 18, 10, 1.4); slotLight.position.set(12.5, 3, -1); root.add(slotLight);
  // néon « MACHINES À SOUS » au-dessus des îlots
  const slotSign = neonPlane(neonTex('MACHINES  À  SOUS', '112px Monoton', '#ff46b4', 2048, 256, { tube: 6 }), 7, .9, '#ff86d0', 2.6);
  slotSign.position.set(W - .14, 5.6, -4); slotSign.rotation.y = -Math.PI / 2; root.add(slotSign);

  // ---------- tables de roulette (côté ouest) ----------
  const feltR = new THREE.MeshStandardMaterial({ map: rouletteFeltTex(), roughness: .95 });
  const rail = MAT.lacquer('#3a1a0c', .45);
  const leather = new THREE.MeshStandardMaterial({ color: '#1c0c08', roughness: .5 });
  const wheels: THREE.Mesh[] = [];
  const wheelMat = new THREE.MeshStandardMaterial({ map: wheelTex(), roughness: .35, metalness: .2 });
  for (const z of [-8.5, -2]) {
    const x = -10.5;
    statics.add(mesh([new RoundedBoxGeometry(5.0, .82, 2.1, 3, .12).translate(x, .41, z)], rail));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 1.8).rotateX(-Math.PI / 2), feltR); top.position.set(x + .45, .825, z); statics.add(top);
    statics.add(mesh([box(5.1, .1, .14, x, .86, z - 1.05), box(5.1, .1, .14, x, .86, z + 1.05), box(.14, .1, 2.2, x + 2.52, .86, z), box(.14, .1, 2.2, x - 2.52, .86, z)], leather));
    // cylindre
    statics.add(mesh([cyl(.72, .62, .22, x - 1.85, .93, z, 32)], rail));
    const wh = new THREE.Mesh(new THREE.CircleGeometry(.6, 40).rotateX(-Math.PI / 2), wheelMat); wh.position.set(x - 1.85, 1.045, z); root.add(wh); wheels.push(wh);
    const tur = mesh([cyl(.02, .12, .18, 0, .09, 0, 12), new THREE.SphereGeometry(.04, 10, 8).translate(0, .2, 0)], gold); tur.position.copy(wh.position); root.add(tur); wheels.push(tur);
    solids.push([x - 2.8, z - 1.4, x + 2.8, z + 1.4]);
    // piles de jetons
    addChips(root, x + .6, z, 14);
    const sp = new THREE.SpotLight('#ffe0b0', 34, 9, .55, .5, 1.5); sp.position.set(x, 6.5, z); sp.target.position.set(x, 0, z); root.add(sp, sp.target);
  }

  // ---------- blackjack (près de la nef) ----------
  const feltB = new THREE.MeshStandardMaterial({ map: blackjackFeltTex(), roughness: .95 });
  for (const [x, z, r] of [[-10.5, 4.2, 0], [6.6, -1.1, Math.PI / 2], [-7, 9.5, Math.PI]] as const) {
    const g = new THREE.Group();
    const top = new THREE.Shape(); top.moveTo(-1.7, 0); top.absarc(0, 0, 1.7, Math.PI, 0, true); top.lineTo(-1.7, 0);
    const tg = new THREE.ShapeGeometry(top, 32);
    const p = tg.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 3.4 + .5; uv[i * 2 + 1] = 1 + p.getY(i) / 1.7; }
    tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); tg.rotateX(-Math.PI / 2);
    const tm = new THREE.Mesh(tg, feltB); tm.position.y = .83; g.add(tm);
    const ext = new THREE.ExtrudeGeometry(top, { depth: .8, bevelEnabled: false, curveSegments: 32 }); ext.rotateX(-Math.PI / 2); ext.translate(0, .02, 0);
    g.add(mesh([ext], rail));
    g.add(mesh([new THREE.TorusGeometry(1.72, .07, 8, 40, Math.PI).rotateX(Math.PI / 2).translate(0, .86, 0), box(3.5, .08, .14, 0, .86, .04)], leather));
    addChips(g, 0, .32, 6);
    g.rotation.y = r; g.position.set(x, 0, z); statics.add(g);
    solids.push([x - 2, z - 2, x + 2, z + 2]);
  }

  // ---------- le bar (mur ouest) ----------
  {
    const bx = -W + 2.8;
    statics.add(mesh([box(.8, 1.1, 13, bx, .55, -1, 1.2)], pbr('dark_paneled_wood', { color: '#7a4a34' })));
    const top = pbr('granite_tile', { color: '#2d2b2a' }); top.roughness = .2;
    statics.add(mesh([box(1.05, .07, 13.3, bx, 1.13, -1, 1.5)], top));
    statics.add(mesh([cyl(.03, .03, 13, bx + .62, .25, -1, 8).rotateX(Math.PI / 2).translate(0, 0, 0)].map(g => { g.translate(0, 0, 0); return g; }), MAT.brass()));
    solids.push([bx - .6, -7.8, bx + .6, 5.8]);
    // étagères rétroéclairées et bouteilles
    statics.add(mesh([box(.5, .05, 11, -W + .4, 1.6, -1), box(.5, .05, 11, -W + .4, 2.3, -1), box(.5, .05, 11, -W + .4, 3.0, -1)], MAT.brass()));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.2), new THREE.MeshBasicMaterial({ map: canvasTex(64, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a1406'); g.addColorStop(.5, '#d07a30'); g.addColorStop(1, '#5a2008'); c.fillStyle = g; c.fillRect(0, 0, w, h); for (let y = 0; y < 3; y++) { c.fillStyle = 'rgba(255,220,160,.9)'; c.fillRect(0, h * (.18 + y * .32), w, 3); } }), color: new THREE.Color(1.1, 1, .9) })); back.rotation.y = Math.PI / 2; back.position.set(-W + .16, 2.35, -1); statics.add(back);
    // bouteilles (tour de potier procédural, fusionnées par couleur) et tabourets
    const prof = [[0, 0], [.038, 0], [.04, .02], [.04, .2], [.034, .235], [.014, .26], [.013, .33], [.016, .335], [0, .335]].map(([x, y]) => new THREE.Vector2(x, y));
    const bGeo = new THREE.LatheGeometry(prof, 10);
    const bCols = ['#1d4a22', '#6a3410', '#cfd8d0', '#3a0c12'];
    const bG: THREE.BufferGeometry[][] = bCols.map(() => []);
    for (let s2 = 0; s2 < 3; s2++) for (let i = 0; i < 26; i++) {
      const sc = .85 + rnd() * .4;
      bG[Math.floor(rnd() * bCols.length)].push(bGeo.clone().scale(sc, sc * (.9 + rnd() * .3), sc).translate(-W + .38 + rnd() * .1, 1.63 + s2 * .7, -6.2 + i * .45 + rnd() * .1));
    }
    bCols.forEach((c, i) => statics.add(mesh(bG[i], new THREE.MeshStandardMaterial({ color: c, roughness: .08, metalness: .35 }), false)));
    const stC: THREE.BufferGeometry[] = [], stS: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const z = -6.6 + i * 1.8, x = bx + 1.0;
      stC.push(cyl(.03, .03, .78, x, .39, z, 10), cyl(.22, .24, .03, x, .015, z, 18), new THREE.TorusGeometry(.17, .012, 6, 18).rotateX(Math.PI / 2).translate(x, .32, z));
      stS.push(cyl(.23, .21, .12, x, .82, z, 20));
    }
    statics.add(mesh(stC, MAT.chrome()), mesh(stS, MAT.lacquer('#5a0c12', .5)));
    for (const z of [-5, 3]) {
      const c = model('Chandelier_01'); remapMaterials(c, m => m.name.includes('lamps') ? glowMat('#ffe2b8', 2.2) : null);
      c.scale.setScalar(1.6); c.position.set(bx - .2, H - 1.8, z); root.add(c); dyn.push(c);
      statics.add(mesh([cyl(.015, .015, 1.0, bx - .2, H - .5, z, 6)], gold));
    }
    const bl = new THREE.PointLight('#ffb468', 26, 11, 1.5); bl.position.set(bx, 4.5, -1); root.add(bl);
    const barSign = neonPlane(neonTex('Le Bar', 'italic 170px "Playfair Display"', '#ffb54a', 1024, 256, { tube: 5 }), 4, 1, '#ffd08a', 2.6);
    barSign.position.set(-W + .14, 5.2, -1); barSign.rotation.y = Math.PI / 2; root.add(barSign);
  }

  // ---------- salon près de l'entrée ----------
  {
    const velvetRed = (m: THREE.MeshStandardMaterial) => { const c = m.clone(); c.color.set('#b0303a'); return c; };
    const sofa = model('Sofa_01'); remapMaterials(sofa, velvetRed); sofa.position.set(13, 0, 13.6); sofa.rotation.y = Math.PI; statics.add(sofa);
    for (const [x, z, r] of [[10.6, 11.6, Math.PI / 2 + .4], [15.4, 11.6, -Math.PI / 2 - .4]] as const) {
      const a = model('ArmChair_01'); remapMaterials(a, velvetRed); a.position.set(x, 0, z); a.rotation.y = r; statics.add(a);
    }
    const ot = model('Ottoman_01'); ot.position.set(13, 0, 11.4); statics.add(ot);
    solids.push([9.8, 10.4, 16.4, 14.6]);
    for (const [x, z] of [[-16.8, 13.6], [16.8, -13.6], [-16.8, -13.6], [6, 13.8], [-6, 13.8]] as const) {
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
    const nm = new THREE.MeshBasicMaterial({ map: nightT, color: new THREE.Color(1.2, 1.2, 1.3) });
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
  onTick((t, dt) => { for (const w of wheels) w.rotation.y += dt * .9; });
  onTick((t) => { for (let i = 0; i < lights.length; i++) lights[i].intensity = 30 * (1 + Math.sin(t * 9.1 + i * 2) * Math.sin(t * 5.3 + i) * .02); });

  bakeStatic(statics, dyn);

  // reflets diffus des lustres et des machines : on capture la salle dans une sonde
  const pm = new THREE.PMREMGenerator(renderer);
  (floorMat.userData.wet as any).uOn.value = 0;
  root.position.y = -2.4;
  scene.updateMatrixWorld(true);
  const env = pm.fromScene(scene, .03, .1, 60);
  root.position.y = 0;
  scene.updateMatrixWorld(true);
  (floorMat.userData.wet as any).uOn.value = 1;
  scene.environment = env.texture;
  scene.environmentIntensity = 1.2;

  return {
    scene, camera, hooks: [mirror.update], mirror,
    look: { tone: 'agx', exposure: 1.0, bloom: { intensity: 1.05, threshold: .85, smoothing: .25, radius: .75 },
      ao: { radius: 1.4, intensity: 2.2, falloff: 1, color: '#0a0503' }, saturation: .14, contrast: .08, vignette: .45, grain: .04 },
    shots: [
      { from: [0, 6.2, 14], to: [0, 3.4, 4], look: [0, 2.4, -14], look2: [0, 2.2, -14], fov: 46, dur: 9, focus: 18, text: '23 h 47 — Grand Casino. Trois heures avant la fermeture.' },
      { from: [12.5, 1.5, 9.5], to: [11.8, 1.6, -9], look: [9.4, 1.6, 0], look2: [9.4, 1.8, -9], fov: 40, dur: 7, focus: 3, text: 'Douze caméras. Six vigiles. Une seule caisse.' },
      { from: [-2.6, 1.3, -6], to: [-1.0, 1.7, -9.4], look: [0, 1.8, -14], look2: [0, 2.1, -15], fov: 38, dur: 7, focus: 5, text: 'Et parmi vous… quelqu\'un a déjà parlé aux flics.' },
    ],
    focus: 14,
    tick: () => {},
    spawn: { pos: [0, 1.65, 12.4], yaw: 0 },
    solids, bounds: [-W + .6, -D + .6, W - .6, D - .6],
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
