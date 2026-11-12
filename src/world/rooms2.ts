// ============================================================
// Aile ouest et arrière-boutique : bar-lounge avec scène, toilettes, couloirs de
// service (une boucle complète autour du casino), salle de comptage, bureau du directeur.
// Plus de pièces = plus de chemins = on ne se croise plus par hasard.
// ============================================================
import * as THREE from 'three';
import { model, remapMaterials, pbr } from '../gfx/assets';
import { box, cyl, MAT, glowMat, canvasTex, rnd, damaskTex, carpetTex, neonTex, neonPlane, glows } from '../gfx/kit';
import { Mirror, wetMaterial } from '../gfx/mirror';
import { Kit, M, chair, lightPool } from './tables';
import { wallRun } from './rooms';
import type { LightDef } from '../gfx/lights';

type Rect = [number, number, number, number];

function sign(text: string, sub = '', w = 512, h = 128) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = '#140a06'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c99a45'; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#e6c27a'; c.textAlign = 'center'; c.font = `${sub ? 54 : 64}px "Playfair Display"`; (c as any).letterSpacing = '8px';
    c.fillText(text, w / 2, sub ? 66 : 86);
    if (sub) { c.font = 'italic 26px "Playfair Display"'; (c as any).letterSpacing = '2px'; c.fillText(sub, w / 2, 106); }
  });
}
function staffSign(text: string) {
  return canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8e2d0'; c.font = 'bold 34px "Bebas Neue"'; c.textAlign = 'center'; (c as any).letterSpacing = '4px'; c.fillText(text, w / 2, 58); });
}
function plane(parent: THREE.Object3D, tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number, glow = .4) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: '#fff', emissiveMap: tex, emissiveIntensity: glow, roughness: .4 }));
  p.position.set(x, y, z); p.rotation.y = ry; parent.add(p);
}

export function buildWest(root: THREE.Object3D, statics: THREE.Object3D, mirror: Mirror, solids: number[][]) {
  const k = new Kit();
  const walk: Rect[] = [];
  const paint = MAT.matte('#8d8a7e', .85), paintDark = MAT.matte('#3b3e44', .8), tube = glowMat('#e8f0ff', 3.2);
  const lino = wetMaterial(pbr('granite_tile', { color: '#6a6d70' }), mirror, { damp: .25, blur: 3, distort: .02, darken: 0, ripples: 0, f0: .04 });
  lino.roughness = .5;
  const wood = pbr('dark_paneled_wood', { color: '#8a5a40' });

  // ================= LE BAR (x −30→−18, z −8→8) =================
  {
    const x0 = -30, x1 = -18.15, z0 = -8, z1 = 8, H = 4.6;
    const carpet = new THREE.MeshStandardMaterial({ map: carpetTex({ base: '#2a0a12', a: '#4a1420', b: '#140608', gold: '#b88a3a' }), roughness: 1 });
    k.add(carpet, box(x1 - x0, .03, z1 - z0, (x0 + x1) / 2, .015, 0, 3.4));
    const plum = new THREE.MeshStandardMaterial({ map: damaskTex('#2a0a14'), roughness: .7 });
    wallRun(k, wood, 'z', x0, z0, z1, 0, 1.2, .2, 1.4); wallRun(k, plum, 'z', x0 + .05, z0, z1, 1.2, H, .1, 1.1);
    wallRun(k, wood, 'x', z0, x0, x1, 0, 1.2, .2, 1.4, [[-22.5, 1.4, 2.4]]); wallRun(k, plum, 'x', z0 + .05, x0, x1, 1.2, H, .1, 1.1, [[-22.5, 1.4, 2.4]]);
    wallRun(k, wood, 'x', z1, x0, x1, 0, 1.2, .2, 1.4, [[-27, 1.4, 2.4]]); wallRun(k, plum, 'x', z1 - .05, x0, x1, 1.2, H, .1, 1.1, [[-27, 1.4, 2.4]]);
    wallRun(k, plum, 'z', x1 - .05, z0, z1, 1.2, H, .06, 1.1, [[0, 2.8, 3.4]]); wallRun(k, wood, 'z', x1 - .08, z0, z1, 0, 1.2, .12, 1.4, [[0, 2.8, 3.4]]);
    k.add(pbr('dark_paneled_wood', { color: '#3a2418' }), box(x1 - x0, .2, z1 - z0, (x0 + x1) / 2, H + .1, 0, 1.6));
    for (let x = x0 + 2.4; x < x1; x += 2.4) k.add(M.gold, box(.1, .14, z1 - z0, x, H - .07, 0));
    // comptoir en L, étagères rétroéclairées, bouteilles, tabourets
    const bx = -27.3;
    k.add(wood, box(.8, 1.1, 9, bx, .55, -1, 1.2), box(3, 1.1, .8, bx + 1.1, .55, -5.9, 1.2));
    const top = pbr('granite_tile', { color: '#24221f' }); top.roughness = .18;
    k.add(top, box(1.05, .07, 9.3, bx, 1.13, -1, 1.5), box(3.2, .07, 1.05, bx + 1.1, 1.13, -5.9, 1.5));
    k.add(M.brass, cyl(.03, .03, 9, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(bx + .62, .25, -1));
    k.add(M.brass, box(.5, .05, 8, x0 + .4, 1.5, -1), box(.5, .05, 8, x0 + .4, 2.2, -1), box(.5, .05, 8, x0 + .4, 2.9, -1));
    const backT = canvasTex(64, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a0e04'); g.addColorStop(.5, '#d07a30'); g.addColorStop(1, '#4a1806'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.2), new THREE.MeshBasicMaterial({ map: backT, color: new THREE.Color(.62, .55, .48) })); back.rotation.y = Math.PI / 2; back.position.set(x0 + .16, 2.25, -1); statics.add(back);
    const prof = [[0, 0], [.038, 0], [.04, .02], [.04, .2], [.034, .235], [.014, .26], [.013, .33], [.016, .335], [0, .335]].map(([a, b]) => new THREE.Vector2(a, b));
    const bGeo = new THREE.LatheGeometry(prof, 10);
    const bMats = ['#1d4a22', '#6a3410', '#cfd8d0', '#3a0c12', '#a07020'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .08, metalness: .35 }));
    for (let s = 0; s < 3; s++) for (let i = 0; i < 18; i++) { const sc = .85 + rnd() * .4; k.add(bMats[Math.floor(rnd() * bMats.length)], bGeo.clone().scale(sc, sc * (.9 + rnd() * .3), sc).translate(x0 + .38 + rnd() * .1, 1.53 + s * .7, -4.8 + i * .43)); }
    for (let i = 0; i < 6; i++) {
      const z = -4.4 + i * 1.5, x = bx + 1.0;
      k.add(M.chrome, cyl(.03, .03, .78, x, .39, z, 10), cyl(.22, .24, .03, x, .015, z, 18));
      k.add(MAT.lacquer('#5a0c12', .5), cyl(.23, .21, .12, x, .82, z, 20));
    }
    solids.push([bx - .6, -6.4, bx + .6, 3.6], [bx - .6, -6.4, bx + 2.7, -5.4]);
    // salon : tables basses, fauteuils, lampes
    const burgundy = (m: THREE.MeshStandardMaterial) => { const c = m.clone(); c.color.set('#8a2a32'); return c; };
    const lampPts: THREE.Vector3[] = [];
    for (const [tx, tz] of [[-22.5, -4.6], [-22.5, -.4], [-20.2, 3.2]] as const) {
      k.add(M.woodLight, cyl(.45, .45, .04, tx, .58, tz, 24), cyl(.05, .05, .56, tx, .28, tz, 8), cyl(.28, .3, .03, tx, .015, tz, 16));
      k.add(M.brass, cyl(.01, .01, .3, tx, .75, tz, 6));
      k.add(glowMat('#ffcf8a', 2.2), new THREE.CylinderGeometry(.08, .13, .14, 14, 1, true).translate(tx, .95, tz));
      lampPts.push(new THREE.Vector3(tx, .95, tz));
      for (const s of [-1, 1]) { const a = model('ArmChair_01'); remapMaterials(a, burgundy); a.position.set(tx + s * 1.05, 0, tz); a.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; statics.add(a); }
      k.add(M.glassClear, cyl(.035, .03, .09, tx + .12, .64, tz + .1, 12)); k.add(MAT.matte('#c88a30', .2), cyl(.03, .026, .04, tx + .12, .62, tz + .1, 12));
      solids.push([tx - 1.6, tz - .7, tx + 1.6, tz + .7]);
      root.add(lightPool(1.8, 1.8, tx, .6, tz, .18));
    }
    root.add(glows(lampPts, '#ffc27a', .55, .5));
    // petite scène : rideau de velours, micro, piano droit
    const stageW = pbr('dark_paneled_wood', { color: '#5a3020' });
    k.add(stageW, box(4.6, .4, 3, -21.2, .2, 6.4, 1.2));
    k.add(M.gold, box(4.62, .05, .05, -21.2, .4, 4.92));
    const curtain = canvasTex(256, 256, (c, w, h) => { for (let x = 0; x < w; x++) { const v = .55 + .45 * Math.sin(x * .19) * Math.sin(x * .05 + 1); c.fillStyle = `rgb(${Math.round(120 * v + 20)},${Math.round(8 * v)},${Math.round(16 * v)})`; c.fillRect(x, 0, 1, h); } });
    const cm = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.6), new THREE.MeshStandardMaterial({ map: curtain, roughness: .7 })); cm.position.set(-21.2, 2.2, 7.85); cm.rotation.y = Math.PI; statics.add(cm);
    k.add(M.chrome, cyl(.012, .012, 1.4, -21.2, 1.1, 6, 6), cyl(.15, .17, .02, -21.2, .41, 6, 14), new THREE.SphereGeometry(.035, 10, 8).translate(-21.2, 1.82, 5.97));
    k.add(MAT.lacquer('#0c0a0a', .25), box(1.5, 1.25, .6, -23, 1.02, 7.3), box(1.4, .06, .35, -23, 1.15, 6.85));
    k.add(MAT.matte('#f2eee4', .4), box(1.3, .02, .14, -23, 1.19, 6.78));
    solids.push([-23.6, 4.9, -18.8, 8]);
    const barSign = neonPlane(neonTex('Le Bar', 'italic 170px "Playfair Display"', '#ffb54a', 1024, 256, { tube: 5 }), 3.2, .8, '#ffd08a', 2.6);
    barSign.position.set(x0 + .14, 3.7, -1); barSign.rotation.y = Math.PI / 2; root.add(barSign);
    const lounge = neonPlane(neonTex('LOUNGE', '140px Monoton', '#ff4fa0', 1024, 220, { tube: 5 }), 2.2, .48, '#ff8ac4', 2.2);
    lounge.position.set(-21.2, 4.1, 7.8); lounge.rotation.y = Math.PI; root.add(lounge);
    plane(statics, sign('LE BAR', 'Cocktails · Piano'), 2.4, .6, -18.0, 4.0, 0, -Math.PI / 2);
    plane(statics, staffSign('PRIVÉ'), .9, .34, -22.5, 2.75, -7.86, 0, .1);
    plane(statics, sign('TOILETTES'), 1.6, .4, -27, 2.75, 7.86, Math.PI, .4);
    walk.push([-18.9, -1.1, -17.2, 1.1], [-29.6, -7.6, -18.5, 7.6]);
  }

  // ================= TOILETTES (x −30→−24, z 8→14) =================
  {
    const x0 = -30, x1 = -24, z0 = 8.15, z1 = 14, H = 3;
    const tileT = canvasTex(128, 128, (c, w, h) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#e8e4dc' : '#151515'; c.fillRect(x * 32, y * 32, 32, 32); } }, { repeat: true });
    const tileM = wetMaterial(new THREE.MeshStandardMaterial({ map: tileT, roughness: .25 }), mirror, { damp: .5, blur: 1.5, distort: .01, darken: 0, ripples: 0, f0: .05 });
    k.add(tileM, box(x1 - x0, .03, z1 - z0, (x0 + x1) / 2, .015, (z0 + z1) / 2, 1.2));
    const wt = MAT.matte('#d8d2c6', .35);
    wallRun(k, wt, 'z', x0, z0, z1, 0, H, .16, 1.5); wallRun(k, wt, 'z', x1, z0, z1, 0, H, .16, 1.5); wallRun(k, wt, 'x', z1, x0, x1, 0, H, .16, 1.5);
    k.add(MAT.matte('#cfc9be', .6), box(x1 - x0, .2, z1 - z0, (x0 + x1) / 2, H + .1, (z0 + z1) / 2));
    const mirrorM = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: .03 });
    k.add(mirrorM, box(.03, 1, 3.6, x0 + .1, 1.7, 11));
    k.add(MAT.matte('#1a1a1a', .3), box(.55, .08, 3.8, x0 + .32, .85, 11));
    for (const z of [9.8, 11, 12.2]) { k.add(MAT.matte('#f4f2ee', .15), cyl(.2, .15, .1, x0 + .35, .92, z, 18)); k.add(M.chrome, cyl(.012, .012, .2, x0 + .18, 1.0, z, 6)); }
    k.add(glowMat('#fff2dc', 2.4), box(.04, .06, 3.6, x0 + .14, 2.32, 11));
    for (let i = 0; i < 3; i++) { const z = 9 + i * 1.6; k.add(MAT.matte('#3a2a24', .5), box(1.6, 2.1, .05, x1 - .9, 1.12, z + .8), box(.05, 2.1, 1.3, x1 - 1.7, 1.12, z + .15)); }
    k.add(tube, box(.12, .04, 1.2, -27, H - .03, 11));
    solids.push([x0, 8.6, x0 + .7, 13.4], [x1 - 1.75, 8.6, x1, 13.9]);
    walk.push([-27.6, 7.4, -26.4, 8.8], [-29.6, 8.5, -25.9, 13.6]);
  }

  // ================= COULOIR OUEST (x −23.8→−21.2, z −29.4→−8) + COULOIR NORD (z −29.4→−27) =================
  {
    k.add(lino, box(2.6, .04, 21.4, -22.5, .02, -18.7, 1.2), box(36.2, .04, 2.4, -5.6, .02, -28.2, 1.2));
    wallRun(k, paint, 'z', -23.8, -29.4, -8, 0, 3, .16, 2);
    wallRun(k, paint, 'z', -21.2, -27, -8.1, 0, 3, .16, 2, [[-20.5, 1.4, 2.4]]);
    wallRun(k, paint, 'x', -29.4, -23.8, 12.4, 0, 3, .16, 2);
    wallRun(k, paint, 'x', -27, -21.2, 9.6, 0, 3, .16, 2, [[-9.5, 1.4, 2.4]]);
    wallRun(k, paint, 'z', 12.4, -29.4, -27, 0, 3, .16, 2);
    k.add(paintDark, box(2.6, .2, 21.4, -22.5, 3.1, -18.7), box(36.2, .2, 2.4, -5.6, 3.1, -28.2));
    for (const z of [-11, -16, -21, -26]) k.add(tube, box(.18, .05, 1.2, -22.5, 2.97, z));
    for (let x = -20; x < 12; x += 5) k.add(tube, box(1.2, .05, .18, x, 2.97, -28.2));
    k.add(MAT.matte('#5a5c60', .6), cyl(.07, .07, 36, 0, 0, 0, 10).rotateZ(Math.PI / 2).translate(-5.6, 2.75, -29.1));
    k.add(MAT.lacquer('#b0141a', .3), cyl(.08, .08, .5, -23.55, .45, -14, 14), cyl(.08, .08, .5, 2, .45, -29.15, 14));
    const exitS = neonPlane(neonTex('SORTIE DE SECOURS', '72px "Bebas Neue"', '#3dff7a', 512, 128, { tube: 3 }), 1.2, .3, '#7dffa8', 1.6);
    exitS.position.set(-22.5, 2.6, -29.3); root.add(exitS);
    k.add(MAT.matte('#26282c', .5), box(1.1, 2.2, .06, -22.5, 1.1, -29.3));
    // casiers du personnel le long du couloir nord
    const locker = MAT.matte('#4a5560', .5);
    for (let i = 0; i < 10; i++) { k.add(locker, box(.5, 1.9, .45, -18 + i * .52, .95, -29.15)); k.add(M.chrome, box(.02, .14, .02, -17.85 + i * .52, 1.1, -28.92)); }
    solids.push([-18.3, -29.4, -12.8, -28.85]);
    walk.push([-23.4, -29, -21.6, -8.4], [-23.4, -29, 12, -27.4], [-22.9, -8.8, -22.1, -7.2], [-21.9, -21.1, -20.6, -19.9], [-10.1, -27.6, -8.9, -26.4]);
  }

  // ================= SALLE DE COMPTAGE (x −14→−5.2, z −27→−15.3) =================
  {
    const x0 = -14, x1 = -5.2, z0 = -26.9, z1 = -15.3, H = 3;
    k.add(lino, box(x1 - x0, .04, z1 - z0, (x0 + x1) / 2, .02, (z0 + z1) / 2, 1.2));
    const wallM = MAT.matte('#9a9c96', .8);
    wallRun(k, wallM, 'z', x0, z0, z1, 0, H, .16, 2); wallRun(k, wallM, 'x', z1, x0, x1, 0, H, .16, 2);
    k.add(paintDark, box(x1 - x0, .2, z1 - z0, (x0 + x1) / 2, H + .1, (z0 + z1) / 2));
    for (const [x, z] of [[-11.5, -19], [-7.5, -19], [-11.5, -24], [-7.5, -24]] as const) k.add(tube, box(1.2, .05, .18, x, H - .03, z));
    const steel = new THREE.MeshStandardMaterial({ color: '#8a8e93', metalness: .85, roughness: .4 });
    const bills = new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#7f9a6e'; c.fillRect(0, 0, w, h); c.fillStyle = '#c9c5a8'; c.fillRect(0, h * .38, w, h * .24); }), roughness: .85 });
    const screen = new THREE.MeshBasicMaterial({ map: canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#031a0c'; c.fillRect(0, 0, w, h); c.fillStyle = '#4dff8a'; c.font = 'bold 26px "Courier New"'; c.fillText(String(1000 + Math.floor(rnd() * 8999)), 10, 42); }), color: new THREE.Color(1.6, 1.6, 1.6) });
    for (const [tx, tz] of [[-11.2, -18.6], [-11.2, -22.6], [-7.6, -20.6]] as const) {
      k.add(steel, box(2.6, .06, 1.1, tx, .9, tz), ...[[-1.2, -.45], [1.2, -.45], [-1.2, .45], [1.2, .45]].map(([dx, dz]) => box(.05, .9, .05, tx + dx, .45, tz + dz)));
      for (const dx of [-.7, .7]) {
        k.add(MAT.matte('#202226', .45), box(.4, .3, .35, tx + dx, 1.08, tz - .2));
        k.add(screen, new THREE.PlaneGeometry(.22, .1).translate(tx + dx, 1.12, tz - .02));
      }
      for (let i = 0; i < 10; i++) k.add(bills, box(.16, .05 + rnd() * .1, .075, tx - 1 + rnd() * 2, .96, tz + .1 + rnd() * .3));
      chair(k, tx - .6, tz + .9, Math.PI, MAT.matte('#1a1c20', .6)); chair(k, tx + .6, tz + .9, Math.PI, MAT.matte('#1a1c20', .6));
      solids.push([tx - 1.4, tz - .7, tx + 1.4, tz + 1.3]);
    }
    const bag = new THREE.MeshStandardMaterial({ color: '#7a6a4a', roughness: .95 });
    for (let i = 0; i < 7; i++) { const x = -13.3 + (i % 4) * .6, z = -26.2 + Math.floor(i / 4) * .6; k.add(bag, new THREE.SphereGeometry(.3, 12, 9).scale(1, 1.1, 1).translate(x, .32, z), cyl(.05, .09, .12, x, .66, z, 10)); }
    solids.push([-13.8, -26.7, -11.2, -25.2]);
    for (const [cx, cz] of [[-6.2, -25.5], [-6.2, -24.4]] as const) { k.add(steel, box(1, .05, .6, cx, .9, cz), box(1, .05, .6, cx, .45, cz)); for (let i = 0; i < 6; i++) k.add(bills, box(.16, .1, .075, cx - .4 + (i % 3) * .3, .98, cz - .1 + Math.floor(i / 3) * .2)); }
    solids.push([-6.8, -26, -5.4, -23.9]);
    plane(statics, staffSign('COMPTAGE'), .9, .34, -9.5, 2.75, -27.14, 0, .1);
    walk.push([-13.6, -26.5, -5.6, -15.7], [-5.8, -21.7, -4.4, -20.3]);
  }

  // ================= BUREAU DU DIRECTEUR (x −21.2→−14, z −27→−15.3) =================
  {
    const x0 = -21.05, x1 = -14.1, z0 = -26.9, z1 = -15.3, H = 3.2;
    const rug = new THREE.MeshStandardMaterial({ map: carpetTex({ base: '#1a1030', a: '#2a1a48', b: '#3a0a10', gold: '#b88a3a' }), roughness: 1 });
    k.add(pbr('dark_paneled_wood', { color: '#6a4030' }), box(x1 - x0, .03, z1 - z0, (x0 + x1) / 2, .015, (z0 + z1) / 2, 1.6));
    k.add(rug, box(4.4, .02, 6, -17.6, .035, -21, 2));
    const pan = pbr('dark_paneled_wood', { color: '#7a4a34' });
    wallRun(k, pan, 'z', x1, z0, z1, 0, H, .14, 1.4); wallRun(k, pan, 'x', z1, x0, x1, 0, H, .14, 1.4); wallRun(k, pan, 'x', z0 + .1, x0, x1, 0, H, .1, 1.4);
    wallRun(k, pan, 'z', x0, z0, z1, 0, H, .1, 1.4, [[-20.5, 1.4, 2.4]]);
    k.add(pbr('dark_paneled_wood', { color: '#3a2418' }), box(x1 - x0, .2, z1 - z0, (x0 + x1) / 2, H + .1, (z0 + z1) / 2, 1.6));
    // bureau massif, fauteuil, lampe de banquier, écran de surveillance
    k.add(MAT.lacquer('#2a140a', .3), box(2.2, .08, 1.1, -17.6, .78, -24.2), box(.08, .74, 1.0, -18.6, .37, -24.2), box(.08, .74, 1.0, -16.6, .37, -24.2), box(2.0, .5, .06, -17.6, .5, -24.7));
    const dc = model('ArmChair_01'); remapMaterials(dc, (m) => { const c = m.clone(); c.color.set('#3a1a10'); return c; }); dc.position.set(-17.6, 0, -25.4); statics.add(dc);
    for (const x of [-18.3, -16.9]) chair(k, x, -22.8, Math.PI, MAT.lacquer('#4a1a14', .5));
    k.add(M.brass, cyl(.012, .012, .3, -18.3, .97, -24.4, 6), cyl(.07, .08, .02, -18.3, .83, -24.4, 12));
    k.add(glowMat('#5cff9c', 1.6), new THREE.CylinderGeometry(.09, .14, .09, 16, 1, true).rotateZ(Math.PI / 2).translate(-18.3, 1.13, -24.4));
    k.add(MAT.matte('#0c0c0e', .4), box(.5, .32, .04, -16.9, 1.0, -24.5));
    k.add(new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, .6, 1.2) }), new THREE.PlaneGeometry(.45, .27).translate(-16.9, 1.0, -24.47));
    k.add(MAT.matte('#e8e2d0', .7), box(.3, .01, .22, -17.5, .825, -24.1).rotateY(.2));
    k.add(MAT.matte('#3a2010', .6), cyl(.012, .012, .14, -17.2, .86, -23.9, 6).rotateZ(Math.PI / 2));
    solids.push([-19, -26.5, -16.2, -23.4]);
    // bibliothèque et coffre mural
    const bookT = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#1a0e08'; c.fillRect(0, 0, w, h); for (let s = 0; s < 4; s++) { let x = 4; while (x < w - 6) { const bw = 6 + rnd() * 10; c.fillStyle = ['#5a1a14', '#1a3a2a', '#2a2a4a', '#6a4a20', '#3a1a2a'][Math.floor(rnd() * 5)]; c.fillRect(x, s * 64 + 10 + rnd() * 8, bw, 52); x += bw + 1; } c.fillStyle = '#3a2010'; c.fillRect(0, s * 64 + 60, w, 4); } });
    const shelf = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshStandardMaterial({ map: bookT, roughness: .8 })); shelf.position.set(-17.6, 1.3, z1 - .12); shelf.rotation.y = Math.PI; statics.add(shelf);
    k.add(MAT.lacquer('#2a140a', .4), box(4.2, 2.6, .3, -17.6, 1.3, z1 - .3 + .12).translate(0, 0, .03));
    solids.push([-19.8, z1 - .5, -15.4, z1]);
    const safe = new THREE.MeshStandardMaterial({ color: '#2a2c30', metalness: .8, roughness: .35 });
    k.add(safe, box(.08, .8, .8, x1 - .1, 1.4, -19));
    k.add(M.chrome, cyl(.12, .12, .05, 0, 0, 0, 20).rotateZ(Math.PI / 2).translate(x1 - .16, 1.45, -19), box(.03, .2, .03, x1 - .18, 1.2, -18.8));
    const portrait = canvasTex(256, 320, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a2a1a'); g.addColorStop(1, '#120a06'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#0a0604'; c.beginPath(); c.ellipse(w / 2, h * .42, 46, 58, 0, 0, 7); c.fill(); c.beginPath(); c.moveTo(w * .2, h); c.quadraticCurveTo(w / 2, h * .5, w * .8, h); c.fill(); c.fillStyle = 'rgba(200,160,110,.25)'; c.beginPath(); c.ellipse(w / 2 + 10, h * .4, 30, 40, 0, 0, 7); c.fill(); });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.25), new THREE.MeshStandardMaterial({ map: portrait, roughness: .6 })); pm.position.set(-17.6, 1.9, z0 + .24); statics.add(pm);
    k.add(MAT.matte('#140c08', .8), box(1.04, 1.29, .03, -17.6, 1.9, z0 + .2));
    k.add(M.gold, box(1.16, .08, .08, -17.6, 2.56, z0 + .23), box(1.16, .08, .08, -17.6, 1.24, z0 + .23), box(.08, 1.4, .08, -18.14, 1.9, z0 + .23), box(.08, 1.4, .08, -17.06, 1.9, z0 + .23));
    plane(statics, staffSign('DIRECTION'), .9, .34, -21.32, 2.75, -20.5, -Math.PI / 2, .1);
    walk.push([-20.7, -26.5, -14.5, -15.8]);
  }
  k.flush(statics);

  const bar: LightDef[] = [
    { kind: 'point', pos: [-27.6, 3.8, -1], color: '#ffb468', intensity: 18, distance: 9 },
    { kind: 'point', pos: [-22, 3.8, -3.5], color: '#ffc080', intensity: 12, distance: 9 },
    { kind: 'point', pos: [-22, 3.8, 3], color: '#ffc080', intensity: 10, distance: 9 },
    { kind: 'point', pos: [-27, 2.6, 11], color: '#fff2dc', intensity: 10, distance: 7 },
    { kind: 'point', pos: [-12, 5.5, 0], color: '#ffc58a', intensity: 18, distance: 13 },
    { kind: 'spot', pos: [-21.2, 4.4, 3.4], target: [-21.2, .4, 6.4], color: '#ff9ad0', intensity: 40, distance: 9, angle: .5, penumbra: .6 },
    { kind: 'spot', pos: [-26.6, 4.4, -1], target: [-27.3, 1.1, -1], color: '#ffd9a6', intensity: 30, distance: 8, angle: .8, penumbra: .7 },
  ];
  const backW: LightDef[] = [
    { kind: 'point', pos: [-9.5, 2.7, -19], color: '#eaf2ff', intensity: 12, distance: 8 },
    { kind: 'point', pos: [-9.5, 2.7, -24], color: '#eaf2ff', intensity: 12, distance: 8 },
    { kind: 'point', pos: [-17.6, 2.8, -19.5], color: '#ffc58a', intensity: 16, distance: 9 },
    { kind: 'point', pos: [-17.6, 2.6, -24.8], color: '#ffb87a', intensity: 10, distance: 7 },
    { kind: 'point', pos: [-22.5, 2.7, -18], color: '#e4ecff', intensity: 9, distance: 10 },
    { kind: 'point', pos: [-8, 2.7, -28.2], color: '#e4ecff', intensity: 9, distance: 9 },
    { kind: 'spot', pos: [-18.3, 1.6, -24.4], target: [-17.6, .78, -24.2], color: '#a0ffc0', intensity: 4, distance: 3, angle: .9, penumbra: .8 },
    { kind: 'spot', pos: [-9.4, 2.9, -20.6], target: [-9.4, .9, -20.6], color: '#fff6e0', intensity: 22, distance: 6, angle: .9, penumbra: .6 },
  ];
  return { walk, zones: { bar, backW } };
}
