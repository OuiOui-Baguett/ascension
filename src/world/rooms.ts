// ============================================================
// Les autres pièces : salon privé (poker, cheminée), couloir de service,
// salle de surveillance (vrais flux vidéo des caméras), chambre forte.
// ============================================================
import * as THREE from 'three';
import { model, remapMaterials, pbr } from '../gfx/assets';
import { box, cyl, MAT, glowMat, canvasTex, onTick, rnd, U, damaskTex, carpetTex, plaqueTex, halo, neonTex, neonPlane } from '../gfx/kit';
import { Mirror, wetMaterial } from '../gfx/mirror';
import { Kit, M, chair, pendant, poker, lightPool } from './tables';
import type { LightDef } from '../gfx/lights';

type Rect = [number, number, number, number];
/** Mur droit le long de x (à z fixe) ou de z (à x fixe), percé d'ouvertures [centre, largeur, hauteur]. */
export function wallRun(k: Kit, mat: THREE.Material, axis: 'x' | 'z', fixed: number, a0: number, a1: number, y0: number, y1: number,
  th: number, tile: number, holes: [number, number, number][] = []) {
  const seg = (b0: number, b1: number, c0: number, c1: number) => {
    if (b1 - b0 < .01 || c1 - c0 < .01) return;
    const len = b1 - b0, mid = (b0 + b1) / 2, h = c1 - c0, cy = (c0 + c1) / 2;
    k.add(mat, axis === 'x' ? box(len, h, th, mid, cy, fixed, tile) : box(th, h, len, fixed, cy, mid, tile));
  };
  const hs = [...holes].sort((a, b) => a[0] - b[0]);
  let cur = a0;
  for (const [c, w, hh] of hs) {
    seg(cur, c - w / 2, y0, y1);
    seg(c - w / 2, c + w / 2, Math.max(y0, hh), y1);
    cur = c + w / 2;
  }
  seg(cur, a1, y0, y1);
}

export interface RoomsOut { walk: Rect[]; zones: { vip: LightDef[]; back: LightDef[] }; feedsHook: (r: THREE.WebGLRenderer, applyFeed: (i: number) => void, restore: () => void) => void; feedCams: THREE.PerspectiveCamera[] }

export function buildRooms(root: THREE.Object3D, statics: THREE.Object3D, mirror: Mirror, solids: number[][]): RoomsOut {
  const k = new Kit();
  const walk: Rect[] = [];

  // ================= SALON PRIVÉ (x 18→30, z −7→7) =================
  {
    const x0 = 18.1, x1 = 30, z0 = -7, z1 = 7, H = 4.4;
    const carpet = new THREE.MeshStandardMaterial({ map: carpetTex({ base: '#0b2a20', a: '#123f33', b: '#2a0c10', gold: '#c9a24a' }), roughness: 1 });
    k.add(carpet, box(x1 - x0, .03, z1 - z0, (x0 + x1) / 2, .015, 0, 3.2));
    const wood = pbr('dark_paneled_wood', { color: '#8a5a40' });
    const green = new THREE.MeshStandardMaterial({ map: damaskTex('#0d2a22'), roughness: .75 });
    wallRun(k, wood, 'z', x0 + .08, z0, z1, 0, 1.2, .12, 1.4, [[0, 3.2, 3.4]]);
    wallRun(k, green, 'z', x0 + .05, z0, z1, 1.2, H, .06, 1.1, [[0, 3.2, 3.4]]);
    wallRun(k, wood, 'z', x1, z0, z1, 0, 1.2, .2, 1.4); wallRun(k, green, 'z', x1 - .05, z0, z1, 1.2, H, .1, 1.1);
    for (const z of [z0, z1]) { wallRun(k, wood, 'x', z, x0, x1, 0, 1.2, .2, 1.4); wallRun(k, green, 'x', z + (z < 0 ? .05 : -.05), x0, x1, 1.2, H, .1, 1.1); }
    const ceil = pbr('dark_paneled_wood', { color: '#4a2e20' });
    k.add(ceil, box(x1 - x0, .2, z1 - z0, (x0 + x1) / 2, H + .1, 0, 1.6));
    for (let x = x0 + 2; x < x1; x += 2.4) k.add(M.gold, box(.1, .14, z1 - z0, x, H - .07, 0));
    for (const z of [-4.5, -1.5, 1.5, 4.5]) k.add(M.gold, box(x1 - x0, .14, .1, (x0 + x1) / 2, H - .07, z));
    k.add(M.gold, box(x1 - x0, .06, .06, (x0 + x1) / 2, 1.2, z0 + .14), box(x1 - x0, .06, .06, (x0 + x1) / 2, 1.2, z1 - .14), box(.06, .06, z1 - z0, x1 - .14, 1.2, 0));
    // table de poker et sa lampe
    poker(k, root, 23.6, 0, solids);
    pendant(k, root, 23.6, 0, 2.4, 1.1, 0, 2.25, H, .8);
    // cheminée en marbre, feu animé
    const marble = pbr('marble_01', { color: '#e8dccb' }); marble.roughness = .35;
    // encadrement ouvert : deux jambages, un linteau, une tablette, un âtre — et un vrai foyer en retrait
    k.add(marble, box(.45, 1.35, .42, x1 - .32, .675, -1.06, 1), box(.45, 1.35, .42, x1 - .32, .675, 1.06, 1),
      box(.48, .3, 2.55, x1 - .33, 1.2, 0, 1), box(.62, .08, 2.9, x1 - .38, 1.39, 0, 1), box(.9, .05, 2.5, x1 - .5, .025, 0, 1));
    k.add(MAT.matte('#0b0806', .95), box(.06, 1.05, 1.72, x1 - .12, .53, 0), box(.36, 1.05, .05, x1 - .3, .53, -.86), box(.36, 1.05, .05, x1 - .3, .53, .86), box(.36, .05, 1.72, x1 - .3, 1.03, 0));
    k.add(M.black, ...[-.6, -.3, 0, .3, .6].map(z2 => box(.3, .025, .025, x1 - .3, .09, z2)));
    const fireT = canvasTex(128, 256, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h, 4, w / 2, h * .7, h * .7);
      g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(.3, 'rgba(255,150,40,.9)'); g.addColorStop(.7, 'rgba(200,40,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    const fireM = new THREE.MeshBasicMaterial({ map: fireT, color: new THREE.Color(3, 2.2, 1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const flames: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(.42, .6), fireM); f.rotation.y = -Math.PI / 2;
      f.position.set(x1 - .26 - i * .012, .4, -.44 + i * .22); root.add(f); flames.push(f);
    }
    onTick((t) => flames.forEach((f, i) => { f.scale.y = .75 + .35 * Math.abs(Math.sin(t * (5 + i) + i * 1.7)); f.position.y = .12 + f.scale.y * .3; }));
    k.add(MAT.matte('#2a1408', .9), cyl(.07, .07, 1.1, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(x1 - .3, .16, 0).scale(1, 1, .7), cyl(.06, .06, .8, 0, 0, 0, 8).rotateX(Math.PI / 2).rotateY(.3).translate(x1 - .3, .27, 0));
    // fauteuils devant le feu, guéridon, verres
    const leatherGreen = (m: THREE.MeshStandardMaterial) => { const c = m.clone(); c.color.set('#3a6a52'); return c; };
    for (const z of [-1.6, 1.6]) {
      const a = model('ArmChair_01'); remapMaterials(a, leatherGreen); a.position.set(x1 - 2.4, 0, z); a.rotation.y = Math.PI / 2 + (z < 0 ? .5 : -.5); statics.add(a);
    }
    k.add(M.woodLight, cyl(.35, .35, .04, x1 - 2.2, .55, 0, 24), cyl(.04, .04, .53, x1 - 2.2, .27, 0, 8));
    k.add(M.glassClear, cyl(.035, .03, .08, x1 - 2.15, .61, .1, 12), cyl(.035, .03, .08, x1 - 2.3, .61, -.08, 12));
    solids.push([x1 - 3.4, -2.6, x1, 2.6]);
    // tableaux encadrés
    const painting = (seed: number) => canvasTex(512, 320, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, seed ? '#2a3a4a' : '#4a2a1a'); g.addColorStop(.6, seed ? '#8a6a3a' : '#c08040'); g.addColorStop(1, '#1a120a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${200 + rnd() * 55},${150 + rnd() * 80},${80 + rnd() * 60},${rnd() * .08})`; c.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 30, 2 + rnd() * 6); }
      c.fillStyle = 'rgba(10,6,4,.85)'; c.beginPath(); c.moveTo(0, h * .78); for (let x = 0; x <= w; x += 16) c.lineTo(x, h * (.7 + Math.sin(x * .02 + seed) * .05 + rnd() * .02)); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    });
    for (const [z, rot, s] of [[z0 + .12, 0, 0], [z1 - .12, Math.PI, 1]] as const) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ map: painting(s), roughness: .6 }));
      const out = rot ? -1 : 1;
      p.position.set(25, 2.6, z + out * .07); p.rotation.y = rot; statics.add(p);
      k.add(MAT.matte('#140c08', .8), box(2.5, 1.6, .04, 25, 2.6, z + out * .03));
      k.add(M.gold, box(2.64, .1, .1, 25, 3.37, z + out * .06), box(2.64, .1, .1, 25, 1.83, z + out * .06), box(.1, 1.64, .1, 23.73, 2.6, z + out * .06), box(.1, 1.64, .1, 26.27, 2.6, z + out * .06));
      root.add(lightPool(2.8, 2.8, 25, .02, z + (rot ? -1.2 : 1.2), .08));
    }
    // enseigne au-dessus de l'entrée, côté hall
    const pl = plaqueTex('SALON PRIVÉ', 'Membres · Hautes mises');
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .8), new THREE.MeshStandardMaterial({ map: pl, emissive: '#ffffff', emissiveMap: pl, emissiveIntensity: .5, roughness: .35, metalness: .3 }));
    plaque.position.set(17.85, 4.1, 0); plaque.rotation.y = -Math.PI / 2; statics.add(plaque);
    k.add(M.gold, box(.14, 3.5, .14, 17.85, 1.75, -1.68), box(.14, 3.5, .14, 17.85, 1.75, 1.68), box(.16, .16, 3.5, 17.85, 3.48, 0));
    walk.push([17.2, -1.2, 18.9, 1.2], [18.5, -6.6, 29.6, 6.6]);
  }

  // ================= COULOIR DE SERVICE (x 9.6→12.4, z −27→−15) =================
  const paint = MAT.matte('#8d8a7e', .85), paintDark = MAT.matte('#3b3e44', .8);
  const lino = wetMaterial(pbr('granite_tile', { color: '#6a6d70' }), mirror, { damp: .25, blur: 3, distort: .02, darken: 0, ripples: 0, f0: .04 });
  lino.roughness = .5;
  const tube = glowMat('#e8f0ff', 3.2);
  {
    const x0 = 9.6, x1 = 12.4, z0 = -27, z1 = -15.1, H = 3;
    k.add(lino, box(x1 - x0, .04, z1 - z0, (x0 + x1) / 2, .02, (z0 + z1) / 2, 1.2));
    wallRun(k, paint, 'z', x0, z0, z1, 0, H, .16, 2, [[-21, 2, 2.6]]);
    wallRun(k, paint, 'z', x1, z0, z1, 0, H, .16, 2, [[-21.5, 1.4, 2.4]]);
    k.add(paintDark, box(x1 - x0, .2, z1 - z0, (x0 + x1) / 2, H + .1, (z0 + z1) / 2));
    for (const z of [-17, -20.5, -24.5]) k.add(tube, box(.18, .05, 1.3, 11, H - .03, z));
    k.add(MAT.matte('#5a5c60', .6), cyl(.07, .07, z1 - z0, 0, 0, 0, 10).rotateX(Math.PI / 2).translate(x0 + .25, H - .25, (z0 + z1) / 2), cyl(.04, .04, z1 - z0, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(x0 + .45, H - .2, (z0 + z1) / 2));
    k.add(MAT.lacquer('#b0141a', .3), cyl(.08, .08, .5, x1 - .2, .45, -18, 14)); k.add(M.black, cyl(.02, .02, .12, x1 - .2, .76, -18, 8));
    // porte « Personnel » côté hall
    const sign = canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8e2d0'; c.font = 'bold 30px "Bebas Neue"'; c.textAlign = 'center'; (c as any).letterSpacing = '4px'; c.fillText('PERSONNEL AUTORISÉ', w / 2, 44); c.font = '20px "Special Elite"'; c.fillStyle = '#c33'; c.fillText('Accès réservé', w / 2, 76); });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .41), new THREE.MeshStandardMaterial({ map: sign, roughness: .5 })); sp.position.set(11, 2.75, -14.86); statics.add(sp);
    k.add(M.brass, box(.08, 2.5, .1, 10.25, 1.25, -14.9), box(.08, 2.5, .1, 11.75, 1.25, -14.9), box(1.58, .08, .1, 11, 2.5, -14.9));
    walk.push([10.5, -15.8, 11.5, -14.2], [9.95, -27.6, 12.05, -15.3]);
  }

  // ================= SALLE DE SURVEILLANCE (x 12.4→20, z −26→−17) =================
  const feedCams: THREE.PerspectiveCamera[] = [];
  const feeds: THREE.WebGLRenderTarget[] = [];
  {
    const x0 = 12.4, x1 = 20, z0 = -26, z1 = -17, H = 3;
    const tiles = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#23262c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#15171b'; c.lineWidth = 3; c.strokeRect(0, 0, w, h); for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * .04})`; c.fillRect(rnd() * w, rnd() * h, 2, 2); } }, { repeat: true }), roughness: .95 });
    k.add(tiles, box(x1 - x0, .03, z1 - z0, (x0 + x1) / 2, .015, (z0 + z1) / 2, .6));
    const wallM = MAT.matte('#2a2d33', .85);
    wallRun(k, wallM, 'z', x1, z0, z1, 0, H, .16, 2);
    for (const z of [z0, z1]) wallRun(k, wallM, 'x', z, x0, x1, 0, H, .16, 2);
    k.add(paintDark, box(x1 - x0, .2, z1 - z0, (x0 + x1) / 2, H + .1, (z0 + z1) / 2));
    k.add(tube, box(.12, .04, 1.0, 15, H - .03, -21.5));
    // 4 caméras réelles filmant le casino, rendues en basse définition
    const camDefs: [number, number, number, number, number, number][] = [
      [17.3, 6.3, -14.3, 2, 1, 2], [-17.3, 6.3, 14.3, 0, 1.2, -3], [0, 4.2, -11.4, 0, 1.4, 8], [29.4, 3.9, 6.4, 23, .8, -1],
    ];
    for (const [x, y, z, tx, ty, tz] of camDefs) {
      const c = new THREE.PerspectiveCamera(72, 16 / 9, .1, 60); c.position.set(x, y, z); c.lookAt(tx, ty, tz); c.layers.set(0); feedCams.push(c);
      feeds.push(new THREE.WebGLRenderTarget(256, 144, { generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType }));
    }
    const labels = canvasTex(512, 512, (c) => {
      c.font = 'bold 22px "Courier New", monospace';
      for (let i = 0; i < 12; i++) {
        const x = (i % 4) * 128, y = Math.floor(i / 4) * 128;
        c.fillStyle = '#ffffff'; c.fillText(`CAM ${String(i + 1).padStart(2, '0')}`, x + 6, y + 24);
        c.fillStyle = '#ff4040'; c.beginPath(); c.arc(x + 116, y + 16, 6, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,.85)'; c.font = '16px "Courier New", monospace'; c.fillText(`23:47:${String(10 + i * 4).padStart(2, '0')}`, x + 6, y + 120); c.font = 'bold 22px "Courier New", monospace';
      }
    });
    const lblGeo: THREE.BufferGeometry[] = [];
    const bezel = MAT.matte('#0b0c0e', .5);
    const monMats = feeds.map((rt, i) => {
      const m = new THREE.MeshBasicMaterial({ map: rt.texture, color: new THREE.Color(1.5, 1.6, 1.7) });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = U.time; sh.uniforms.uK = { value: i };
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime, uK;')
          .replace('#include <map_fragment>', `
            vec2 muv = vMapUv;
            vec4 sc = texture2D(map, muv);
            float l = dot(sc.rgb, vec3(.3, .55, .15));
            vec3 col = mix(vec3(l), sc.rgb, .35) * vec3(.85, 1.0, .95);
            col *= .9 + .1 * sin(muv.y * 420.0 + uTime * 9.0);
            col *= 1.0 - .55 * pow(length(muv - .5) * 1.25, 2.0);
            col += (fract(sin(dot(muv * (uTime + uK), vec2(12.9898, 78.233))) * 43758.5453) - .5) * .035;
            diffuseColor.rgb *= col;`);
      };
      return m;
    });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const i = r * 4 + c, z = -24 + c * 1.02 + .5, y = 1.25 + (2 - r) * .62;
      k.add(bezel, box(.08, .58, .98, x1 - .14, y, z));
      const scr = new THREE.PlaneGeometry(.92, .52); scr.rotateY(-Math.PI / 2); scr.translate(x1 - .19, y, z);
      if (i % 3 !== 0 || i === 0) {
        // ré-utilise un des 4 flux, recadré différemment pour varier les écrans
        const uv = scr.attributes.uv as THREE.BufferAttribute, f = [1, .8, .7][i % 3], ox = rnd() * (1 - f), oy = rnd() * (1 - f);
        for (let q = 0; q < uv.count; q++) uv.setXY(q, ox + uv.getX(q) * f, oy + uv.getY(q) * f);
      }
      k.add(monMats[i % 4], scr);
      const lg = new THREE.PlaneGeometry(.92, .52); lg.rotateY(-Math.PI / 2); lg.translate(x1 - .195, y, z);
      const uv = lg.attributes.uv as THREE.BufferAttribute, u0 = (i % 4) / 4, v1 = 1 - Math.floor(i / 4) / 4;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, u0 + uv.getX(q) * .25, v1 - .25 + uv.getY(q) * .25);
      lblGeo.push(lg);
    }
    k.add(new THREE.MeshBasicMaterial({ map: labels, transparent: true, depthWrite: false }), ...lblGeo);
    // pupitre, claviers, chaises, café
    k.add(MAT.lacquer('#1a1b1f', .5), box(1.1, .08, 4.6, x1 - 1.3, .78, -21.5), box(1.0, .76, .06, x1 - 1.3, .38, -23.7), box(1.0, .76, .06, x1 - 1.3, .38, -19.3));
    for (const z of [-23, -21.5, -20]) {
      k.add(MAT.matte('#0c0c0e', .6), box(.18, .02, .45, x1 - 1.5, .83, z), box(.3, .25, .4, x1 - 1.0, .95, z).rotateZ(0));
      k.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, .55, 1.4) }), new THREE.PlaneGeometry(.36, .2).rotateY(-Math.PI / 2).translate(x1 - 1.16, 1.0, z));
    }
    k.add(MAT.matte('#e8e2d4', .7), cyl(.04, .035, .1, x1 - 1.6, .87, -22.3, 12));
    k.add(MAT.matte('#d8d2c4', .8), box(.3, .01, .22, x1 - 1.55, .825, -20.6).rotateY(.3));
    for (const z of [-22.6, -20.4]) chair(k, x1 - 2.3, z, Math.PI / 2, MAT.matte('#141418', .6));
    solids.push([x1 - 1.9, -24, x1, -19]);
    walk.push([12, -22.1, 13, -20.9], [12.8, -25.6, 19.6, -17.4]);
  }

  // ================= CHAMBRE FORTE (x −5→5, z −26→−15.3) + passage =================
  {
    const x0 = -5, x1 = 5, z0 = -26, z1 = -15.3, H = 3.4;
    const concrete = wetMaterial(pbr('concrete_pavement', { color: '#7a7a7a' }), mirror, { damp: .55, blur: 1.8, distort: .015, darken: 0, ripples: 0, f0: .05 });
    concrete.roughness = .35;
    k.add(concrete, box(x1 - x0, .04, z1 - z0, 0, .02, (z0 + z1) / 2, 2.2), box(4.6, .04, 2, 7.3, .02, -21, 2.2));
    // murs de coffres individuels
    const boxesT = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#4a4d52'; c.fillRect(0, 0, w, h);
      const n = 8, s = w / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const px = x * s + 3, py = y * s + 3, g = c.createLinearGradient(px, py, px + s, py + s);
        g.addColorStop(0, '#b9bec4'); g.addColorStop(.5, '#8e939a'); g.addColorStop(1, '#6d7278');
        c.fillStyle = g; c.fillRect(px, py, s - 6, s - 6);
        c.fillStyle = '#c9a24a'; c.beginPath(); c.arc(px + s * .5, py + s * .55, 5, 0, 7); c.fill();
        c.fillStyle = '#222'; c.fillRect(px + s * .5 - 1, py + s * .55 - 3, 2, 6);
        c.fillStyle = '#2a2a2a'; c.font = 'bold 11px "Courier New"'; c.fillText(String(100 + y * n + x), px + 6, py + 16);
      }
    });
    const boxesM = new THREE.MeshStandardMaterial({ map: boxesT, metalness: .55, roughness: .38, color: '#ffffff' });
    const steelWall = new THREE.MeshStandardMaterial({ color: '#6e7277', metalness: .9, roughness: .45 });
    wallRun(k, boxesM, 'x', z0, x0, x1, 0, H, .2, 2.4);
    wallRun(k, boxesM, 'z', x0, z0, z1, 0, H, .2, 2.4, [[-21, 1.4, 2.4]]);
    wallRun(k, boxesM, 'z', x1, z0, z1, 0, H, .2, 2.4, [[-21, 2, 2.6]]);
    wallRun(k, steelWall, 'x', z1, x0, x1, 0, H, .25, 2);
    k.add(steelWall, box(x1 - x0, .2, z1 - z0, 0, H + .1, (z0 + z1) / 2));
    // passage blindé vers le couloir
    wallRun(k, paint, 'x', -22, 5, 9.6, 0, 2.6, .16, 2); wallRun(k, paint, 'x', -20, 5, 9.6, 0, 2.6, .16, 2);
    k.add(paintDark, box(4.6, .16, 2.2, 7.3, 2.68, -21));
    const gate: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) gate.push(cyl(.02, .02, 2.4, 0, 1.2, i * .11, 6));
    gate.push(box(.05, .05, .95, 0, .1, .45), box(.05, .05, .95, 0, 2.35, .45));
    for (const g of gate) k.add(M.black, g.rotateY(-1.2).translate(5.1, 0, -20.05));
    // éclairage : caissons grillagés au plafond
    const cage = glowMat('#eef4ff', 3.4);
    for (const [x, z] of [[-2.5, -18.5], [2.5, -18.5], [-2.5, -23], [2.5, -23]] as const) k.add(cage, box(.9, .04, .5, x, H - .03, z));
    // table d'inventaire : liasses de billets, lingots, sacs
    k.add(steelWall, box(3.2, .06, 1.4, 0, .9, -21), ...[[-1.5, -.6], [1.5, -.6], [-1.5, .6], [1.5, .6]].map(([dx, dz]) => box(.06, .9, .06, dx, .45, -21 + dz)));
    const bills = new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#7f9a6e'; c.fillRect(0, 0, w, h); c.fillStyle = '#c9c5a8'; c.fillRect(0, h * .38, w, h * .24); c.fillStyle = '#5a7050'; c.font = 'bold 22px Georgia'; c.fillText('500', 8, 26); }), roughness: .85 });
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) for (let l = 0; l < 3 + (i + j) % 3; l++) k.add(bills, box(.16, .05, .075, -1.2 + i * .19, .955 + l * .052, -21.45 + j * .09));
    const goldBar = new THREE.CylinderGeometry(.06, .085, .05, 4, 1).rotateY(Math.PI / 4).scale(1.6, 1, .75);
    for (let l = 0; l < 4; l++) for (let i = 0; i < 5 - l; i++) for (let j = 0; j < 3 - Math.min(l, 2); j++) k.add(M.gold, goldBar.clone().translate(.35 + i * .2 + l * .1, .955 + l * .052, -20.85 + j * .13 + (l > 1 ? .06 : 0)));
    const bag = new THREE.MeshStandardMaterial({ color: '#8a7a5a', roughness: .95 });
    for (const [x, z, s] of [[-3.8, -24.8, 1], [-3.2, -25, .85], [-4.1, -24.1, .9], [3.9, -16.4, 1]] as const) {
      k.add(bag, new THREE.SphereGeometry(.32 * s, 14, 10).scale(1, 1.15, 1).translate(x, .34 * s, z));
      k.add(bag, cyl(.06 * s, .1 * s, .14 * s, x, .72 * s, z, 10));
    }
    // palettes de billets filmées
    const brick = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#7f9a6e' : '#8aa678'; c.fillRect(x * 64, y * 32, 63, 31); c.fillStyle = '#c9c5a8'; c.fillRect(x * 64 + 26, y * 32, 12, 31); } c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, 0, w, h); }, { repeat: true }), roughness: .3, metalness: .05 });
    for (const [px, pz] of [[-3.3, -17.2], [-3.3, -18.6], [3.4, -18.6]] as const) {
      k.add(M.woodLight, box(1.1, .14, 1.1, px, .07, pz));
      k.add(brick, box(1.0, .9, 1.0, px, .6, pz, .5));
    }
    solids.push([-3.9, -19.2, -2.7, -16.6], [2.8, -19.2, 4, -18]);
    // chariot de transport de fonds
    k.add(steelWall, box(1.2, .05, .7, 3, .45, -24.2), box(1.2, .05, .7, 3, .9, -24.2));
    for (const [dx, dz] of [[-.55, -.3], [.55, -.3], [-.55, .3], [.55, .3]]) k.add(M.black, box(.04, .9, .04, 3 + dx, .45, -24.2 + dz), cyl(.06, .06, .04, 3 + dx, .06, -24.2 + dz, 10).rotateX(0));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) k.add(bills, box(.16, .1, .075, 2.6 + i * .2, .97, -24.35 + j * .3));
    // dos de la porte ronde (côté caisse)
    const back = new THREE.Group();
    back.add(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, .3, 48).rotateX(Math.PI / 2), steelWall));
    const mech: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; mech.push(box(.9, .07, .07, Math.cos(a) * 1.1, Math.sin(a) * 1.1, -.2).rotateZ(0)); }
    mech.push(new THREE.TorusGeometry(.5, .07, 8, 32).translate(0, 0, -.22), cyl(.25, .25, .2, 0, 0, 0, 20).rotateX(Math.PI / 2).translate(0, 0, -.25));
    back.add(new THREE.Mesh(mergeG(mech), M.chrome));
    back.position.set(0, 2.05, z1 - .2); root.add(back);
    solids.push([-1.8, -22, 1.8, -20], [2.3, -24.7, 3.7, -23.7], [-4.6, -25.6, -2.8, -23.6]);
    walk.push([4.4, -21.8, 10.1, -20.2], [-4.6, -25.6, 4.6, -15.8]);
  }
  k.flush(statics);

  // ---------- lumières des zones ----------
  const vip: LightDef[] = [
    { kind: 'spot', pos: [23.6, 4.3, 0], target: [23.6, .8, 0], color: '#ffd9a6', intensity: 55, distance: 9, angle: .62, penumbra: .6 },
    { kind: 'point', pos: [28.9, .9, 0], color: '#ff8a3a', intensity: 14, distance: 9, decay: 1.6, flicker: .18 },
    { kind: 'point', pos: [21, 3.4, -4.5], color: '#ffc58a', intensity: 9, distance: 9 },
    { kind: 'point', pos: [21, 3.4, 4.5], color: '#ffc58a', intensity: 9, distance: 9 },
  ];
  const back: LightDef[] = [
    { kind: 'point', pos: [11, 2.7, -18], color: '#e4ecff', intensity: 9, distance: 7 },
    { kind: 'point', pos: [11, 2.7, -24], color: '#e4ecff', intensity: 9, distance: 7 },
    { kind: 'point', pos: [18.4, 1.9, -21.5], color: '#6fa4ff', intensity: 10, distance: 7, flicker: .05 },
    { kind: 'point', pos: [0, 3, -18.5], color: '#eaf2ff', intensity: 16, distance: 9 },
    { kind: 'point', pos: [0, 3, -23.5], color: '#eaf2ff', intensity: 14, distance: 9 },
    { kind: 'point', pos: [7.3, 2.4, -21], color: '#e4ecff', intensity: 5, distance: 5 },
    { kind: 'spot', pos: [0, 3.3, -19.6], target: [.3, .9, -21], color: '#fff2d8', intensity: 40, distance: 7, angle: .55, penumbra: .5 },
    { kind: 'spot', pos: [17.2, 2.6, -21.5], target: [19.4, .8, -21.5], color: '#ffd9a6', intensity: 8, distance: 4, angle: .7, penumbra: .8 },
  ];

  // ---------- flux vidéo : un rendu basse définition par image, chacun son tour ----------
  let turn = 0;
  const feedsHook = (r: THREE.WebGLRenderer, applyFeed: (i: number) => void, restore: () => void) => {
    const i = turn++ % feeds.length;
    applyFeed(i);
    const prev = r.getRenderTarget();
    r.setRenderTarget(feeds[i]); r.clear();
    r.render(root.parent as THREE.Scene, feedCams[i]);
    r.setRenderTarget(prev);
    restore();
  };
  return { walk, zones: { vip, back }, feedsHook, feedCams };
}

function mergeG(gs: THREE.BufferGeometry[]) {
  const k = new Kit(); const tmp = new THREE.Group(); const m = new THREE.MeshBasicMaterial();
  k.add(m, ...gs); k.flush(tmp, false);
  return (tmp.children[0] as THREE.Mesh).geometry;
}

export const _r = { halo, mirrorType: null as unknown as Mirror };
