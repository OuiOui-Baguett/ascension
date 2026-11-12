// ============================================================
// La rue, de nuit, sous la pluie : façade du Grand Casino, marquise à ampoules,
// néons, bitume mouillé qui reflète tout, la camionnette de l'équipe garée en face.
// ============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { model, remapMaterials, pbr, getHDR, texRaw } from '../gfx/assets';
import {
  box, cyl, mesh, MAT, glowMat, neonTex, neonPlane, halo, bulbs, windowsTex, archWindowTex, canvasTex, onTick, U, rnd, damaskTex, plaqueTex,
} from '../gfx/kit';
import { Mirror, wetMaterial } from '../gfx/mirror';
import { makeRain, makeSplashes, makeSteam, type RainLight } from '../gfx/rain';
import { bakeStatic } from '../gfx/bake';
import type { World } from './world';

export function buildStreet(renderer: THREE.WebGLRenderer, quality: string): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06070c');
  scene.fog = new THREE.FogExp2('#0d0f18', .021);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 260);
  camera.layers.enable(1);

  // éclairage d'ambiance : HDRI de rue nocturne (sodium), très bas
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = getHDR();
  if (hdr) { scene.environment = pmrem.fromEquirectangular(hdr).texture; }
  scene.environmentIntensity = .14;
  scene.add(new THREE.HemisphereLight('#25304f', '#0b0907', .16));

  const mirror = new Mirror(scene, .02, quality === 'high' ? .5 : .38);
  const statics = new THREE.Group(); scene.add(statics);
  const dyn: THREE.Object3D[] = [];
  const rainLights: RainLight[] = [];

  // ---------- sol : chaussée, trottoirs, bordures ----------
  const road = wetMaterial(pbr('asphalt_02', { repeat: [1, 1], normalScale: 1.2 }), mirror,
    { puddles: .9, damp: .5, blur: 3.2, distort: .06, darken: .55, ripples: 1, paint: true });
  const roadM = new THREE.Mesh(box(200, .1, 12, 0, -.05, 0, 3.2), road);
  roadM.receiveShadow = true; scene.add(roadM);
  const walk = wetMaterial(pbr('concrete_pavement', { normalScale: 1 }), mirror,
    { puddles: .45, damp: .42, blur: 3.5, distort: .05, darken: .45, ripples: .8 });
  const walks = mesh([box(200, .15, 7, 0, .075, -9.5, 2.4), box(200, .15, 6, 0, .075, 9, 2.4)], walk);
  walks.receiveShadow = true; scene.add(walks);
  mirror.hidden.push(roadM, walks);
  const curbM = pbr('granite_tile', { roughness: .8, color: '#8a8a8a' });
  statics.add(mesh([box(200, .17, .25, 0, .085, -6.05, 1), box(200, .17, .25, 0, .085, 6.05, 1)], curbM));

  // ---------- façade du Grand Casino ----------
  const stone = pbr('marble_01', { repeat: [1, 1], color: '#e9dcc4', roughness: 1, normalScale: .6 });
  const granite = pbr('granite_tile', { color: '#7a7470' });
  const gold = MAT.gold();
  const S: THREE.BufferGeometry[] = [], G: THREE.BufferGeometry[] = [], Au: THREE.BufferGeometry[] = [];
  // corps principal
  S.push(box(16.5, 18, 1.2, -15.75, 9, -13.6, 2.5), box(16.5, 18, 1.2, 15.75, 9, -13.6, 2.5), box(15, 11.8, 1.2, 0, 12.1, -13.6, 2.5));
  G.push(box(48.2, 1.3, .5, 0, .65, -12.85, 1.5));
  for (const y of [6.7, 12.7]) { S.push(box(48.6, .45, .7, 0, y, -12.75, 1.5)); Au.push(box(48.6, .07, .72, 0, y - .3, -12.74)); }
  S.push(box(49.2, .9, 1.5, 0, 18.1, -12.85, 1.5)); Au.push(box(49.2, .08, 1.52, 0, 17.6, -12.84));
  // pilastres et fenêtres cintrées (hors pavillon central)
  const archT = archWindowTex();
  const winMat = new THREE.MeshStandardMaterial({ color: '#0a0806', roughness: .12, metalness: .4, emissive: '#ffffff', emissiveMap: archT, emissiveIntensity: 1.25, map: archT });
  const winGeos: THREE.BufferGeometry[] = [];
  for (let x = -22.2; x <= 22.2; x += 3.7) {
    if (Math.abs(x) < 8.5) continue;
    S.push(box(.55, 17, .35, x - 1.85, 9, -12.85, 2));
    for (const [y0, hh] of [[1.7, 4.2], [7.6, 4.0], [13.6, 3.2]] as const) {
      const pw = new THREE.PlaneGeometry(1.7, hh); pw.translate(x, y0 + hh / 2, -12.97); winGeos.push(pw);
      S.push(box(2.1, .16, .4, x, y0 - .08, -12.82, 1));          // appui
      S.push(box(.16, hh, .22, x - .93, y0 + hh / 2, -12.88, 1), box(.16, hh, .22, x + .93, y0 + hh / 2, -12.88, 1));
      S.push(box(.42, .5, .3, x, y0 + hh + .1, -12.84, 1));         // clef de voûte
      Au.push(box(2.05, .05, .24, x, y0 + hh + .42, -12.86));
    }
  }
  const wins = mesh(winGeos, winMat, false);
  // pavillon central
  S.push(box(17, 16.8, 2.2, 0, 13.6, -12.1, 2.5));
  for (const [a, b] of [[-8.5, -6.2], [-3.0, -1.6], [1.6, 3.0], [6.2, 8.5]]) { S.push(box(b - a, 5.2, 2.2, (a + b) / 2, 2.6, -12.1, 2.5)); G.push(box(b - a + .1, 1.3, .3, (a + b) / 2, .65, -10.9, 1.5)); }
  S.push(box(17.8, 1, 1, 0, 21.9, -10.9, 1.5)); Au.push(box(17.8, .1, 1.02, 0, 21.35, -10.9));
  S.push(box(17.6, .55, .7, 0, 7.6, -10.8, 1.5)); Au.push(box(17.6, .08, .72, 0, 7.28, -10.8));
  // fronton triangulaire
  {
    const sh = new THREE.Shape(); sh.moveTo(-9, 0); sh.lineTo(9, 0); sh.lineTo(0, 3.6); sh.closePath();
    const pg = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false }); pg.translate(0, 22.4, -11.6);
    const pos = pg.attributes.position, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 2.5; uv[i * 2 + 1] = pos.getY(i) / 2.5; }
    pg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); S.push(pg);
  }
  // colonnes
  for (const x of [-6.9, -2.3, 2.3, 6.9]) {
    S.push(cyl(.42, .48, 6.6, x, 3.3, -10.45, 20));
    Au.push(cyl(.62, .62, .28, x, 6.75, -10.45, 20), cyl(.6, .6, .25, x, .13, -10.45, 20));
  }
  // grande baie du pavillon + deux petites
  const bigWin = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 8.5), winMat);
  bigWin.position.set(0, 12.75, -10.98);
  const smallWins = [-5.6, 5.6].map(x => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 6), winMat); m.position.set(x, 11.6, -10.98); return m; });
  S.push(box(5.8, .3, .5, 0, 8.4, -10.85, 1), box(.3, 8.6, .4, -2.75, 12.8, -10.9, 1), box(.3, 8.6, .4, 2.75, 12.8, -10.9, 1));
  statics.add(bigWin, ...smallWins);

  // portes vitrées (battants à charnières, ceux du centre s'ouvrent pendant la cinématique)
  const brass = MAT.brass();
  const Br: THREE.BufferGeometry[] = [];
  const glassM = new THREE.MeshStandardMaterial({ color: '#10141a', metalness: .9, roughness: .05, transparent: true, opacity: .3, depthWrite: false });
  const leaves: THREE.Group[] = [];
  for (const x of [-4.6, 0, 4.6]) {
    for (const y of [5.15]) Br.push(box(3.3, .1, .14, x, y, -11.55));
    for (const s2 of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(x + s2 * 1.6, 0, -11.55);
      const lw = 1.58, dir = -s2;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(lw - .1, 5.0), glassM); glass.position.set(dir * lw / 2, 2.6, 0); pivot.add(glass);
      const fr = [box(.07, 5.1, .07, dir * .04, 2.55, 0), box(.07, 5.1, .07, dir * (lw - .04), 2.55, 0), box(lw, .09, .07, dir * lw / 2, .06, 0), box(lw, .07, .07, dir * lw / 2, 5.08, 0),
        box(lw, .05, .06, dir * lw / 2, 1.0, 0), cyl(.022, .022, .9, dir * (lw - .22), 1.25, .07, 8)];
      pivot.add(mesh(fr, brass));
      scene.add(pivot);
      if (x === 0) leaves.push(pivot);
    }
  }
  const enterTick = (k: number) => {
    const o = Math.min(1, Math.max(0, (k - .5) / .22)), e = o * o * (3 - 2 * o);
    leaves.forEach((l, i) => { l.rotation.y = (i === 0 ? 1 : -1) * 1.75 * e; });
  };

  // ---------- le foyer derrière les portes : vraie profondeur, vrai volume ----------
  {
    const fx0 = -7.5, fx1 = 7.5, fz0 = -21, fz1 = -13.2, fy = .15, FH = 6.2;
    const fk: [THREE.BufferGeometry, THREE.Material][] = [];
    const marbleF = wetMaterial(pbr('marble_01', { color: '#d9ccb6', normalScale: .25 }), mirror, { damp: .8, blur: 1.2, distort: .01, darken: 0, ripples: 0, f0: .07, checker: texRaw('granite_tile', 'diff') });
    marbleF.roughness = .5;
    const fl = new THREE.Mesh(box(fx1 - fx0, .1, fz1 - fz0, 0, fy - .05, (fz0 + fz1) / 2, 2.4), marbleF); scene.add(fl); mirror.hidden.push(fl);
    const woodF = pbr('dark_paneled_wood', { color: '#a07058' });
    const damF = new THREE.MeshStandardMaterial({ map: damaskTex(), roughness: .72 });
    for (const [a, b, c2, axis] of [[fx0, fz0, fz1, 'z'], [fx1, fz0, fz1, 'z']] as const) {
      fk.push([box(.2, 1.3, c2 - b, a, fy + .65, (b + c2) / 2, 1.6), woodF], [box(.1, FH - 1.3, c2 - b, a + (a < 0 ? -.05 : .05), fy + 1.3 + (FH - 1.3) / 2, (b + c2) / 2, 1.1), damF]);
      void axis;
    }
    fk.push([box(fx1 - fx0, 1.3, .2, 0, fy + .65, fz0, 1.6), woodF], [box(fx1 - fx0, FH - 1.3, .1, 0, fy + 1.3 + (FH - 1.3) / 2, fz0 - .05, 1.1), damF]);
    fk.push([box(fx1 - fx0, .2, fz1 - fz0, 0, fy + FH + .1, (fz0 + fz1) / 2, 2), pbr('dark_paneled_wood', { color: '#5a3a28' })]);
    for (let x = fx0 + 2.5; x < fx1; x += 2.5) fk.push([box(.12, .18, fz1 - fz0, x, fy + FH - .09, (fz0 + fz1) / 2), gold]);
    for (let z = fz0 + 2.6; z < fz1; z += 2.6) fk.push([box(fx1 - fx0, .18, .12, 0, fy + FH - .09, z), gold]);
    fk.push([box(fx1 - fx0, .08, .1, 0, fy + 1.32, fz0 + .11), gold], [box(.1, .08, fz1 - fz0, fx0 + .11, fy + 1.32, (fz0 + fz1) / 2), gold], [box(.1, .08, fz1 - fz0, fx1 - .11, fy + 1.32, (fz0 + fz1) / 2), gold]);
    // portes intérieures vers la salle de jeux : verre dépoli doré, très lumineux
    const frostT = canvasTex(256, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6dcb0'); g.addColorStop(.55, '#d8954e'); g.addColorStop(1, '#7a3a16'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      // silhouettes floues de joueurs derrière le verre dépoli
      c.filter = 'blur(6px)';
      for (let i = 0; i < 5; i++) { const s3 = .7 + rnd() * .5, x = w * rnd(), y = h * (.7 + rnd() * .08); c.fillStyle = `rgba(40,16,6,${.35 + rnd() * .25})`; c.beginPath(); c.arc(x, y - 150 * s3, 20 * s3, 0, 7); c.fill(); c.fillRect(x - 38 * s3, y - 125 * s3, 76 * s3, h); }
      c.filter = 'none';
      // verre gravé art déco
      c.strokeStyle = 'rgba(255,240,210,.55)'; c.lineWidth = 2;
      for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(w / 2, h * .12); c.lineTo(w * (i / 8), h * .45); c.stroke(); }
      c.beginPath(); c.arc(w / 2, h * .12, 40, 0, Math.PI); c.stroke(); c.beginPath(); c.arc(w / 2, h * .12, 60, 0, Math.PI); c.stroke();
      for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * .07})`; c.fillRect(rnd() * w, rnd() * h, 1, 1); }
    });
    const frost = new THREE.MeshBasicMaterial({ map: frostT, color: new THREE.Color(1.05, .95, .85) });
    for (const x of [-3.6, 0, 3.6]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4.2), frost); d.position.set(x, fy + 2.1, fz0 + .12); scene.add(d);
      for (const dx of [-1.4, 0, 1.4]) fk.push([box(.08, 4.2, .1, x + dx, fy + 2.1, fz0 + .16), brass]);
      for (const y of [.05, 2.1, 4.2]) fk.push([box(2.8, .08, .1, x, fy + y, fz0 + .16), brass]);
    }
    const pl = plaqueTex('SALLE DE JEUX', 'Tenue correcte exigée');
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: pl, emissive: '#ffffff', emissiveMap: pl, emissiveIntensity: .6, roughness: .35, metalness: .3 }));
    plaque.position.set(0, fy + 5, fz0 + .14); scene.add(plaque);
    // vestiaire à gauche
    const vw = pbr('dark_paneled_wood', { color: '#8a5a40' });
    fk.push([box(.7, 1.1, 4.2, fx0 + 1.5, fy + .55, -17.4, 1.2), vw], [box(.85, .07, 4.4, fx0 + 1.5, fy + 1.13, -17.4, 1.5), pbr('granite_tile', { color: '#2d2b2a' })]);
    for (let i = 0; i < 9; i++) fk.push([box(.04, .9, .5, fx0 + .35, fy + 1.9, -19.2 + i * .45), MAT.matte(['#1a1a1e', '#3a2a20', '#2a2e3a'][i % 3], .9)]);
    fk.push([cyl(.02, .02, 4.4, 0, 0, 0, 6).rotateX(Math.PI / 2).translate(fx0 + .35, fy + 2.4, -17.4), brass]);
    fk.push([new THREE.SphereGeometry(.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(fx0 + 1.5, fy + 1.17, -16), brass]);
    const vt = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#140a06'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c99a45'; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16); c.fillStyle = '#e6c27a'; c.font = '64px "Playfair Display"'; c.textAlign = 'center'; (c as any).letterSpacing = '10px'; c.fillText('VESTIAIRE', w / 2, 86); });
    const vs = new THREE.Mesh(new THREE.PlaneGeometry(2, .5), new THREE.MeshStandardMaterial({ map: vt, emissive: '#fff', emissiveMap: vt, emissiveIntensity: .4 }));
    vs.rotation.y = Math.PI / 2; vs.position.set(fx0 + .14, fy + 3.3, -17.4); scene.add(vs);
    // lustre, plantes, tapis rouge jusqu'aux portes intérieures
    const ch = model('Chandelier_03'); remapMaterials(ch, m => m.name.includes('glass') ? glowMat('#ffd6a0', 3.2, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }) : null);
    ch.scale.setScalar(2.1); ch.position.set(0, fy + FH + 1.25 - 2.2 - .3, -17.1); scene.add(ch);
    const hh = halo('#ffcf8a', 1.1, 3.4); hh.position.set(0, fy + FH - 1.5, -17.1); scene.add(hh);
    for (const [x, z] of [[fx1 - .7, -20.3], [fx1 - .7, -14], [fx0 + .7, -14]] as const) { const p = model('potted_plant_04'); p.scale.setScalar(4); p.position.set(x, fy, z); statics.add(p); }
    fk.push([box(3.2, .03, 7.6, 0, fy + .015, -17.1, 1), pbr('velour_velvet', { color: '#b0101c' })]);
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const [g, m] of fk) { if (!groups.has(m)) groups.set(m, []); groups.get(m)!.push(g); }
    for (const [m, gs] of groups) statics.add(mesh(gs, m));
  }

  statics.add(mesh(S, stone), mesh(G, granite), mesh(Au, gold), mesh(Br, brass), wins);

  // ---------- marquise ----------
  const marq = new THREE.Group();
  const mq: THREE.BufferGeometry[] = [box(17.4, .95, 5.2, 0, 6.1, -8.5)];
  const mqGold = [box(17.5, .08, 5.25, 0, 6.6, -8.5), box(17.5, .08, 5.25, 0, 5.6, -8.5)];
  marq.add(mesh(mq, MAT.lacquer('#140b0a', .4)), mesh(mqGold, gold));
  for (const x of [-7.8, 7.8]) marq.add(mesh([cyl(.035, .035, 6.4, 0, 0, 0, 8).rotateX(.95).translate(x, 8.5, -9.7)], MAT.blackMetal()));
  const sign = neonPlane(neonTex('GRAND   CASINO', '138px Monoton', '#ff9a3c', 2048, 256, { tube: 7 }), 13.5, 1.7, '#ffd29a', 3.2);
  sign.position.set(0, 6.12, -5.88); marq.add(sign);
  const bulbPts: THREE.Vector3[] = [];
  for (let x = -8.6; x <= 8.6; x += .3) { bulbPts.push(new THREE.Vector3(x, 6.72, -5.86), new THREE.Vector3(x, 5.5, -5.86)); }
  for (let z = -10.9; z <= -5.9; z += .3) for (const x of [-8.72, 8.72]) bulbPts.push(new THREE.Vector3(x, 6.72, z), new THREE.Vector3(x, 5.5, z));
  marq.add(bulbs(bulbPts, '#ffcf8a', { size: .055, speed: 6, period: 3, power: 7 }));
  const under: THREE.Vector3[] = [];
  for (let x = -7.8; x <= 7.8; x += .8) for (let z = -10.4; z <= -6.4; z += .8) under.push(new THREE.Vector3(x, 5.6, z));
  marq.add(bulbs(under, '#ffd9a0', { size: .07, speed: .4, period: 23, power: 6 }));
  scene.add(marq);
  const spot = new THREE.SpotLight('#ffc27a', 70, 14, .9, .6, 1.7);
  spot.position.set(0, 5.4, -8.6); spot.target.position.set(0, 0, -7.6);
  spot.castShadow = quality === 'high';
  spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -.0004; spot.shadow.camera.near = .5;
  scene.add(spot, spot.target);
  const doorLight = new THREE.PointLight('#ffb460', 42, 17, 1.5); doorLight.position.set(0, 4.4, -16.8); scene.add(doorLight);
  rainLights.push({ pos: new THREE.Vector3(0, 5.5, -7), color: new THREE.Color('#ffb066'), radius: 7 });

  // néon CASINO sur le fronton + grosses lettres qui grésillent
  const casinoSign = neonPlane(neonTex('CASINO', '210px Monoton', '#ff2d6f', 2048, 320, { tube: 9 }), 14, 2.2, '#ff5c8f', 3.6);
  casinoSign.position.set(0, 19.6, -10.9); scene.add(casinoSign);
  const casinoGlow = new THREE.PointLight('#ff3a7a', 26, 14, 1.4); casinoGlow.position.set(0, 18.6, -8.8); scene.add(casinoGlow);
  rainLights.push({ pos: new THREE.Vector3(0, 19, -9), color: new THREE.Color('#ff3a7a'), radius: 9 });
  onTick((t) => {
    // grésillement irrégulier : de longues périodes stables, de brèves coupures
    const k = Math.sin(t * 13.1) * Math.sin(t * 7.7 + 1.3) > .93 ? .25 : 1;
    (casinoSign.material as THREE.MeshBasicMaterial).color.set('#ff5c8f').multiplyScalar(3.6 * k);
    casinoGlow.intensity = 26 * k;
  });
  // enseigne verticale « HÔTEL » au coin du bâtiment voisin
  const blade = new THREE.Group();
  blade.add(new THREE.Mesh(new RoundedBoxGeometry(.5, 7.5, 1.6, 2, .1), MAT.lacquer('#0c0b10', .5)));
  const hotel = neonPlane(neonTex('BAR', '230px Monoton', '#36d6ff', 512, 300, { tube: 9 }), 1.4, .82, '#7fe8ff', 3);
  for (const s of [1, -1]) {
    const v = new THREE.Group();
    const word = ['B', 'A', 'R', '·', '2', '4', 'H'];
    word.forEach((ch, i) => {
      const p = neonPlane(neonTex(ch, '200px Monoton', i < 3 ? '#36d6ff' : '#ffd36b', 256, 256, { tube: 9 }), 1.05, 1.05, i < 3 ? '#8ff0ff' : '#ffe2a0', 3.2);
      p.position.set(0, 3.1 - i * 1.02, 0); v.add(p);
    });
    v.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; v.position.x = s * .26; blade.add(v);
  }
  void hotel;
  blade.position.set(-26.6, 9.5, -11.2); scene.add(blade);
  rainLights.push({ pos: new THREE.Vector3(-26.6, 9, -10.5), color: new THREE.Color('#36d6ff'), radius: 6 });

  // projecteurs de cinéma qui balaient le ciel pluvieux
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color('#ffe9c8') } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float e = pow(abs(dot(vN, vV)), 1.6); float a = e * pow(vY, 2.2) * .22; gl_FragColor = vec4(uCol * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beams = [-1, 1].map(s => {
    const g = new THREE.CylinderGeometry(.35, 7, 90, 24, 1, true); g.translate(0, 45, 0);
    const b = new THREE.Mesh(g, beamMat); b.position.set(s * 13, 18.5, -15); b.layers.set(1); scene.add(b);
    return b;
  });
  onTick((t) => beams.forEach((b, i) => { b.rotation.z = Math.sin(t * .23 + i * 2.1) * .55 + (i ? -.25 : .25); b.rotation.x = -.25 + Math.sin(t * .17 + i) * .12; }));

  // éclairage de façade (projecteurs au sol)
  for (const x of [-6.9, 6.9]) {
    const up = new THREE.SpotLight('#ffd7a3', 26, 22, .22, .85, 1.6);
    up.position.set(x * 1.05, .3, -7.2); up.target.position.set(x * .9, 16, -11.6); scene.add(up, up.target);
  }

  // ---------- immeubles voisins ----------
  const brick = pbr('brick_wall_10', { color: '#9a8a80' });
  const B: THREE.BufferGeometry[] = [];
  const winPlanes: THREE.Mesh[] = [];
  const addBuilding = (x0: number, x1: number, h: number, zf: number, face: 1 | -1, seed: number) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    B.push(box(w, h, 10, cx, h / 2, zf - face * 5, 3));
    B.push(box(w + .3, .5, .5, cx, h - .25, zf + face * .1, 2));
    const t = windowsTex(Math.round(w / 3), Math.round(h / 3.4), .38, seed);
    const m = new THREE.MeshStandardMaterial({ map: t, color: '#202630', roughness: .15, metalness: .6, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.5, alphaTest: .5 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w - .6, h - 4.8), m);
    p.position.set(cx, 4.6 + (h - 4.8) / 2, zf + face * .02); if (face < 0) p.rotation.y = Math.PI;
    winPlanes.push(p);
  };
  addBuilding(-48, -25, 24, -12.4, 1, 7); addBuilding(-70, -48, 30, -12.2, 1, 11);
  addBuilding(25, 44, 21, -12.4, 1, 13); addBuilding(44, 70, 28, -12.2, 1, 17);
  addBuilding(-60, -22, 20, 11.6, -1, 23); addBuilding(-22, 12, 26, 11.6, -1, 29); addBuilding(12, 60, 22, 11.6, -1, 31);
  statics.add(mesh(B, brick));
  for (const p of winPlanes) statics.add(p);
  // rez-de-chaussée des voisins : rideaux métalliques et vitrines
  const shopT = canvasTex(512, 128, (c, w, h) => {
    c.fillStyle = '#1b1c1f'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { c.fillStyle = y % 12 ? '#2a2b2f' : '#121315'; c.fillRect(0, y, w, 3); }
    c.fillStyle = 'rgba(200,60,60,.5)'; c.font = 'bold 40px Arial'; c.fillText('A LOUER', 30, 70);
  });
  const shopM = new THREE.MeshStandardMaterial({ map: shopT, roughness: .6, metalness: .6 });
  for (const [x, z, r] of [[-36, -12.35, 0], [34, -12.35, 0], [-4, 11.55, Math.PI], [26, 11.55, Math.PI]] as const) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), shopM); s.position.set(x, 1.8, z); s.rotation.y = r; statics.add(s);
  }
  // silhouettes lointaines
  const far: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) { const x = -140 + i * 11 + rnd() * 6, h = 30 + rnd() * 50; far.push(box(9 + rnd() * 6, h, 9, x, h / 2, -60 - rnd() * 30)); }
  const farM = new THREE.MeshBasicMaterial({ color: '#0a0c14' });
  statics.add(mesh(far, farM, false));
  const farWin: THREE.Vector3[] = [];
  for (let i = 0; i < 260; i++) farWin.push(new THREE.Vector3(-140 + rnd() * 290, 4 + rnd() * 60, -56 - rnd() * 4));
  const fw = bulbs(farWin, '#ffcf96', { size: .25, speed: 0, period: 1, power: 2.2 }); scene.add(fw);

  // ciel : dégradé violet-sodium, halo urbain à l'horizon
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vD; void main(){ float y = max(vD.y, 0.0);
      vec3 c = mix(vec3(.16,.09,.08), vec3(.035,.04,.08), pow(y, .45)); c = mix(c, vec3(.012,.014,.03), smoothstep(.3,.9,y));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  scene.add(sky);

  // ---------- mobilier urbain ----------
  const lampGlass = glowMat('#ffd59a', 5);
  const addLamp = (x: number, z: number, light: boolean) => {
    const l = model('street_lamp_01');
    remapMaterials(l, m => m.name.includes('glass') ? lampGlass : null);
    l.position.set(x, .15, z); statics.add(l);
    const h = halo('#ffbe70', 1.4, 3.2); h.position.set(x, 3.75, z); scene.add(h);
    if (light) { const p = new THREE.PointLight('#ffb35c', 22, 13, 1.5); p.position.set(x, 3.6, z); scene.add(p); }
    rainLights.push({ pos: new THREE.Vector3(x, 3.6, z), color: new THREE.Color('#ffa850'), radius: 4 });
  };
  addLamp(-14, -6.6, true); addLamp(14, -6.6, true); addLamp(-30, -6.6, false); addLamp(30, -6.6, false);
  addLamp(-6, 6.6, true); addLamp(22, 6.6, false);
  for (const x of [-8.1, 8.1]) {
    const l = model('street_lamp_02');
    remapMaterials(l, m => m.name.includes('glass') ? lampGlass : null);
    l.rotation.y = Math.PI; l.position.set(x, 2.6, -10.9); statics.add(l);
    const h = halo('#ffc27a', 1.2, 1.6); h.position.set(x, 3.3, -10.4); scene.add(h);
  }
  const hyd = model('fire_hydrant', { only: ['fire_hydrant', 'fire_hydrant_cap_01', 'fire_hydrant_cap_02', 'fire_hydrant_cap_03', 'fire_hydrant_chain'] });
  hyd.position.set(10.5, .15, -6.8); hyd.rotation.y = -.6; statics.add(hyd);
  const can = model('metal_trash_can', { skip: ['metal_trash_can_rust'] });
  can.position.set(-11.4, .15, -7); statics.add(can);
  for (const [x, z] of [[-9, 2.6], [17, -2.4], [-24, 1.5]] as const) {
    const mh = model('water_manhole_cover'); mh.position.set(x, .005, z); statics.add(mh);
  }
  const steam = makeSteam(new THREE.Vector3(-9, .05, 2.6), '#8f8aa0');
  scene.add(steam); dyn.push(steam);
  onTick((t) => steam.userData.tick(t));
  const car = model('covered_car'); car.rotation.y = Math.PI / 2; car.position.set(14, 0, -4.4); statics.add(car);

  // tapis rouge, potelets laiton et cordons de velours
  const velvet = pbr('velour_velvet', { color: '#b0101c', repeat: [1, 1] });
  statics.add(mesh([box(3.4, .03, 4.9, 0, .165, -8.5, 1)], velvet));
  const posts: THREE.BufferGeometry[] = [], ropes: THREE.BufferGeometry[] = [];
  for (const sx of [-2.1, 2.1]) {
    for (let i = 0; i < 4; i++) {
      const z = -10.3 + i * 1.35;
      posts.push(cyl(.035, .035, .95, sx, .62, z, 10), new THREE.SphereGeometry(.07, 12, 8).translate(sx, 1.12, z), cyl(.16, .18, .05, sx, .18, z, 16));
      if (i < 3) {
        const a = new THREE.Vector3(sx, 1.02, z), b = new THREE.Vector3(sx, 1.02, z + 1.35);
        const mid = a.clone().lerp(b, .5); mid.y -= .26;
        ropes.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 12, .028, 6));
      }
    }
  }
  statics.add(mesh(posts, gold), mesh(ropes, new THREE.MeshStandardMaterial({ color: '#7a0a12', roughness: .55 })));

  // ---------- la camionnette de l'équipe ----------
  const van = makeVan();
  van.position.set(-3, 0, 4.35); van.rotation.y = Math.PI;
  scene.add(van);
  rainLights.push({ pos: new THREE.Vector3(-5.4, .8, 4.35), color: new THREE.Color('#ff2a1a'), radius: 2.2 });

  // ---------- pluie ----------
  const rain = makeRain(quality === 'low' ? 1800 : quality === 'medium' ? 3200 : 5200, rainLights);
  const splash = makeSplashes(quality === 'low' ? 120 : 320, .03, { x0: -14, x1: 18, z0: -11, z1: 10 });
  scene.add(rain, splash);

  bakeStatic(statics, dyn);

  return {
    scene, camera, hooks: [mirror.update],
    look: { tone: 'agx', exposure: 1.0, bloom: { intensity: 1.0, threshold: .9, smoothing: .3, radius: .8 },
      ao: { radius: 1.2, intensity: 1.8, falloff: 1, color: '#05060a' }, saturation: .12, contrast: .1, vignette: .52, grain: .05 },
    // plans de l'écran d'accueil (boucle lente) : [position, cible, focale]
    shots: [
      { from: [19, 1.0, 10.2], to: [15.5, 1.2, 10.0], look: [-1, 7.2, -11], look2: [0, 7.8, -11], fov: 50, dur: 16, focus: 22 },
      { from: [-9, .55, 3.2], to: [-6.5, .7, 1.2], look: [0, 4.2, -11], look2: [1, 5, -11], fov: 36, dur: 14, focus: 13 },
      { from: [3, 9, 8], to: [1.5, 7.5, 5], look: [0, 6, -11], look2: [0, 5, -11], fov: 44, dur: 14, focus: 16 },
    ],
    enter: [[5.2, 1.5, 9.0], [2.5, 1.6, 2], [.4, 1.65, -6], [0, 1.7, -10.2], [0, 1.75, -14.2], [0, 1.85, -17.2]],
    enterTick,
    focus: 20,
    tick: () => { /* animé via onTick */ },
    mirror,
  };
}

/** Camionnette des années 70, carrosserie bicolore vernie, faux lettrage d'artisan. */
function makeVan() {
  const g = new THREE.Group();
  const green = MAT.lacquer('#2c4638', .38), cream = MAT.lacquer('#d9cfb2', .34), chrome = MAT.chrome(), glass = MAT.glass();
  const tire = MAT.matte('#0c0c0c', .85);
  const low = new THREE.Mesh(new RoundedBoxGeometry(4.7, 1.0, 1.95, 3, .17), green); low.position.y = .97;
  const up = new THREE.Mesh(new RoundedBoxGeometry(4.62, .66, 1.9, 3, .2), cream); up.position.y = 1.72;
  g.add(low, up);
  const parts: [THREE.BufferGeometry, THREE.Material][] = [];
  parts.push([box(4.72, .05, 1.97, 0, 1.43, 0), chrome]);
  parts.push([box(.14, .2, 2.02, 2.36, .62, 0), chrome], [box(.14, .2, 2.02, -2.36, .62, 0), chrome]);
  parts.push([box(.04, .46, 1.6, 2.32, 1.74, 0), glass]);
  for (const z of [-.955, .955]) for (const x of [1.55, .35, -.85, -1.85]) parts.push([box(x > 1 ? .8 : 1.0, .44, .02, x, 1.74, z), glass]);
  parts.push([box(.04, .32, .9, 2.36, .98, 0), chrome]);
  for (const [x, z] of [[1.5, .86], [1.5, -.86], [-1.5, .86], [-1.5, -.86]] as const) {
    parts.push([new THREE.CylinderGeometry(.36, .36, .26, 22).rotateX(Math.PI / 2).translate(x, .36, z), tire]);
    parts.push([new THREE.CylinderGeometry(.2, .2, .28, 18).rotateX(Math.PI / 2).translate(x, .36, z), chrome]);
  }
  for (const [mt, ms] of groupBy(parts)) { const m = mesh(ms, mt); g.add(m); }
  // phares (veilleuses) et feux arrière rouges, pour les reflets sur le bitume
  const head = glowMat('#fff1d0', 3.5), tail = glowMat('#ff2414', 6);
  for (const z of [-.66, .66]) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(.12, 18), head); h.rotation.y = Math.PI / 2; h.position.set(2.37, .98, z); g.add(h);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(.1, .3), tail); t.rotation.y = -Math.PI / 2; t.position.set(-2.37, 1.0, z); g.add(t);
  }
  const hl = halo('#fff0d0', .6, .7); hl.position.set(2.45, .98, .66); g.add(hl);
  const hl2 = hl.clone(); hl2.position.z = -.66; g.add(hl2);
  const tl = halo('#ff2a14', 1.1, .8); tl.position.set(-2.45, 1, .66); g.add(tl);
  const tl2 = tl.clone(); tl2.position.z = -.66; g.add(tl2);
  // lettrage de façade (couverture de l'équipe)
  const letT = canvasTex(1024, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.textAlign = 'center'; c.fillStyle = '#e8dfc4';
    c.font = 'italic 92px "Playfair Display"'; c.fillText('Marcel & Fils', w / 2, 110);
    c.font = '46px "Bebas Neue"'; (c as any).letterSpacing = '8px'; c.fillText('PLOMBERIE · DÉPANNAGE 24H/24', w / 2, 190);
  });
  const letM = new THREE.MeshStandardMaterial({ map: letT, transparent: true, roughness: .35, metalness: .1 });
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .8), letM); p.position.set(-.2, .98, s * .985); if (s < 0) p.rotation.y = Math.PI; g.add(p); }
  // lueur discrète dans l'habitacle : quelqu'un attend
  const dome = new THREE.PointLight('#ffb070', 1.4, 3, 2); dome.position.set(1.4, 1.8, 0); g.add(dome);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function groupBy(parts: [THREE.BufferGeometry, THREE.Material][]) {
  const m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [g, mt] of parts) { if (!m.has(mt)) m.set(mt, []); m.get(mt)!.push(g); }
  return m;
}

export const _unused = U;
