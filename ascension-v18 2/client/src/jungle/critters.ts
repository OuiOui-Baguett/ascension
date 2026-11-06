// ============================================================
// Les bestioles de la Canopée : capybara, sanglier, paresseux, tortue.
// Modelées en volumes doux, pelage en « sheen » ; chacune sait marcher.
// Origine aux pieds, regard vers +X (sens de la course).
// ============================================================
import * as THREE from 'three';
import { M } from './kit';

export type Critter = THREE.Group & { userData: { legs: THREE.Object3D[]; body: THREE.Object3D; head: THREE.Object3D; gait: number } };

const fur = (color: string, sheen = '#ffe8c8') => new THREE.MeshPhysicalMaterial({
  color, roughness: .78, sheen: 1, sheenRoughness: .5, sheenColor: new THREE.Color(sheen),
});
const shiny = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: .15, clearcoat: 1, clearcoatRoughness: .05 });
const ell = (rx: number, ry: number, rz: number, m: THREE.Material, seg = 22) => {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * .7));
  g.scale(rx, ry, rz);
  return new THREE.Mesh(g, m);
};

function eyes(head: THREE.Object3D, x: number, y: number, z: number, r = .045) {
  const white = shiny('#111014');
  const spec = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), white);
    e.position.set(x, y, s * z);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(r * .32, 8, 6), spec);
    hl.position.set(x + r * .62, y + r * .45, s * z + s * r * .2);
    head.add(e, hl);
  }
}

function legsOf(g: THREE.Group, m: THREE.Material, xs: number[], zs: number[], len: number, r: number, _y: number) {
  const legs: THREE.Object3D[] = [];
  const y = len + r;            // le bas de la patte touche exactement le sol (y = 0)
  for (const x of xs) for (const z of zs) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
    leg.position.y = -len / 2;
    pivot.add(leg);
    g.add(pivot); legs.push(pivot);
  }
  return legs;
}

export function capybara(scale = 1, pack = false): Critter {
  const g = new THREE.Group() as Critter;
  const coat = fur('#9a6436'), dark = fur('#5a3a20');
  const body = new THREE.Group(); body.position.y = .36;
  body.add(ell(.42, .27, .27, coat));
  const rump = ell(.24, .22, .25, coat); rump.position.set(-.26, .02, 0); body.add(rump);
  const head = new THREE.Group(); head.position.set(.36, .1, 0);
  const skull = ell(.22, .17, .15, coat); skull.position.x = .08; head.add(skull);
  const snout = ell(.13, .12, .13, dark); snout.position.set(.25, -.03, 0); head.add(snout);
  const nose = ell(.05, .03, .07, shiny('#2a1810')); nose.position.set(.36, 0, 0); head.add(nose);
  for (const s of [-1, 1]) {
    const ear = ell(.04, .05, .03, dark); ear.position.set(-.02, .16, s * .1); head.add(ear);
  }
  eyes(head, .12, .07, .13, .035);
  body.add(head);
  g.add(body);
  const legs = legsOf(g, dark, [.24, -.24], [.15, -.15], .12, .065, .26);
  if (pack) {                         // le sac d'or du Pont Pourri : on voit ce qu'il risque
    const sack = ell(.18, .2, .18, new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: .9 }));
    sack.position.set(-.08, .3, 0); body.add(sack);
    const knot = new THREE.Mesh(new THREE.TorusGeometry(.06, .02, 6, 12), M.rope()); knot.position.set(-.08, .48, 0); knot.rotation.x = Math.PI / 2; body.add(knot);
    for (let k = 0; k < 4; k++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .015, 14), M.gold());
      coin.position.set(-.1 + (k % 2) * .08, .5 + k * .012, (k - 1.5) * .03); coin.rotation.set(.4 * k, 0, .6); body.add(coin);
    }
  }
  g.userData = { legs, body, head, gait: 1 };
  g.scale.setScalar(scale);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

export function boar(scale = 1): Critter {
  const g = new THREE.Group() as Critter;
  const coat = fur('#4a3a32', '#c8a890'), dark = fur('#2a201c');
  const body = new THREE.Group(); body.position.y = .4;
  body.add(ell(.44, .3, .26, coat));
  // crinière en dents de scie
  for (let k = 0; k < 7; k++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(.05, .16, 5), dark);
    sp.position.set(.25 - k * .08, .3 - Math.abs(k - 2) * .01, 0); sp.rotation.z = -.4;
    body.add(sp);
  }
  const head = new THREE.Group(); head.position.set(.4, .02, 0);
  head.add(ell(.22, .19, .17, coat));
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, .18, 16), coat);
  snout.rotation.z = Math.PI / 2; snout.position.set(.24, -.05, 0); head.add(snout);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .02, 18), shiny('#d88a8a'));
  disc.rotation.z = Math.PI / 2; disc.position.set(.34, -.05, 0); head.add(disc);
  for (const s of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(.025, .14, 8), shiny('#f2ead8'));
    tusk.position.set(.26, -.04, s * .09); tusk.rotation.set(s * .3, 0, -.9); head.add(tusk);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.06, .13, 6), dark);
    ear.position.set(-.02, .17, s * .1); ear.rotation.x = s * .5; head.add(ear);
  }
  eyes(head, .14, .07, .12, .03);
  body.add(head); g.add(body);
  const legs = legsOf(g, dark, [.26, -.26], [.14, -.14], .14, .055, .26);
  g.userData = { legs, body, head, gait: 1.2 };
  g.scale.setScalar(scale);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

export function sloth(scale = 1): Critter {
  const g = new THREE.Group() as Critter;
  const coat = fur('#a8936e', '#fff2d0'), mask = fur('#4a3a28'), face = fur('#e8dcc0');
  const body = new THREE.Group(); body.position.y = .38;
  body.add(ell(.34, .3, .26, coat));
  const head = new THREE.Group(); head.position.set(.32, .16, 0);
  head.add(ell(.19, .18, .18, coat));
  const f = ell(.06, .13, .14, face); f.position.set(.14, 0, 0); head.add(f);
  for (const s of [-1, 1]) {
    const patch = ell(.03, .05, .07, mask); patch.position.set(.18, .03, s * .07); patch.rotation.x = s * .6; head.add(patch);
  }
  eyes(head, .2, .035, .075, .026);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.045, .008, 6, 14, Math.PI), mask);
  smile.position.set(.2, -.06, 0); smile.rotation.set(0, Math.PI / 2, Math.PI); head.add(smile);
  body.add(head); g.add(body);
  const legs = legsOf(g, coat, [.2, -.2], [.18, -.18], .16, .06, .3);
  for (const l of legs) {          // griffes
    const claw = new THREE.Mesh(new THREE.ConeGeometry(.02, .08, 5), shiny('#2a2018'));
    claw.position.set(.04, -.27, 0); claw.rotation.z = -1.2; l.add(claw);
  }
  g.userData = { legs, body, head, gait: .55 };
  g.scale.setScalar(scale);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

let shellTex: THREE.CanvasTexture | null = null;
function shellTexture() {
  if (shellTex) return shellTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#3c6a2a'; x.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const cx = i * 46 + (j % 2) * 23, cy = j * 42;
    x.beginPath();
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; x.lineTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); }
    x.closePath();
    x.fillStyle = `hsl(${95 + Math.random() * 15},45%,${28 + Math.random() * 10}%)`; x.fill();
    x.strokeStyle = '#d8c070'; x.lineWidth = 4; x.stroke();
  }
  shellTex = new THREE.CanvasTexture(c); shellTex.colorSpace = THREE.SRGBColorSpace;
  return shellTex;
}

export function turtle(scale = 1): Critter {
  const g = new THREE.Group() as Critter;
  const skin = fur('#8aa868', '#e8ffd0');
  const body = new THREE.Group(); body.position.y = .2;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(.36, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ map: shellTexture(), roughness: .35, clearcoat: .8, clearcoatRoughness: .2 }));
  shell.scale.y = .75;
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(.36, .33, .06, 24), fur('#d8c48a'));
  belly.position.y = -.02;
  body.add(shell, belly);
  const head = new THREE.Group(); head.position.set(.38, .06, 0);
  head.add(ell(.13, .1, .1, skin));
  eyes(head, .08, .045, .065, .025);
  body.add(head); g.add(body);
  const legs = legsOf(g, skin, [.2, -.2], [.2, -.2], .06, .06, .16);
  g.userData = { legs, body, head, gait: .7 };
  g.scale.setScalar(scale);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

/** Anime la marche : jambes en diagonale, petit roulis du corps, tête qui dodeline. */
export function walk(c: Critter, t: number, amount: number) {
  const { legs, body, head, gait } = c.userData;
  const f = t * 14 * gait;
  legs.forEach((l, i) => { l.rotation.z = Math.sin(f + (i === 0 || i === 3 ? 0 : Math.PI)) * .7 * amount; });
  body.position.y = (body.userData.y0 ??= body.position.y) + Math.abs(Math.sin(f)) * .03 * amount;
  body.rotation.x = Math.sin(f) * .06 * amount;
  head.rotation.z = Math.sin(f * .5) * .08 * amount + Math.sin(t * 1.3) * .05;
}

export const RACERS = [capybara, boar, sloth, turtle];
