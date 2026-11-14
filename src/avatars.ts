// ============================================================
// Les combattants vus par les autres (personnage cartoon provisoire, en attendant
// les 6 persos) et nos propres poings à la première personne.
// ============================================================
import * as THREE from 'three';
import { toon, outline } from './world';

export const COLORS = ['#ff5a5f', '#2ec4b6', '#ffd23f', '#9b5de5', '#7bd63a', '#ff9f1c', '#ff6fb5', '#3a86ff'];
export const colorOf = (i: number) => new THREE.Color(COLORS[i % COLORS.length]);

function tag(text: string, sub: string, color: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d')!;
  x.font = 'bold 34px "Lilita One", system-ui, sans-serif'; x.textAlign = 'center'; x.lineJoin = 'round';
  x.lineWidth = 8; x.strokeStyle = '#1b1530'; x.strokeText(text, 128, 38); x.fillStyle = '#fff'; x.fillText(text, 128, 38);
  if (sub) { x.font = 'bold 36px "Lilita One", system-ui, sans-serif'; x.strokeText(sub, 128, 82); x.fillStyle = color; x.fillText(sub, 128, 82); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const pctColor = (p: number) => p < 40 ? '#ffffff' : p < 80 ? '#ffe066' : p < 120 ? '#ff9f43' : '#ff4d4d';

export class Fighter {
  root = new THREE.Group(); private body = new THREE.Group();
  private handL: THREE.Mesh; private handR: THREE.Mesh; private feet: THREE.Mesh[] = [];
  private label: THREE.Sprite; private shield: THREE.Mesh; private lastLabel = '';
  private walk = 0; private punchT = 0; private punchSide = 1; private blastT = 0; private tumble = 0;
  constructor(scene: THREE.Scene, public name: string, color: number) {
    const c = colorOf(color), mat = toon(c), belly = toon(c.clone().lerp(new THREE.Color('#fff4dc'), .55)), dark = toon('#1b1530');
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.42, .62, 6, 14), mat); torso.position.y = .95; outline(torso, .05); this.body.add(torso);
    const bel = new THREE.Mesh(new THREE.SphereGeometry(.34, 14, 10), belly); bel.scale.set(1, 1.15, .55); bel.position.set(0, .85, .2); this.body.add(bel);
    // grands yeux
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), toon('#ffffff')); eye.position.set(s * .15, 1.32, .33); eye.scale.z = .6; this.body.add(eye);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 8), dark); pu.position.set(s * .15, 1.32, .41); this.body.add(pu);
    }
    // bandeau de combat
    const band = new THREE.Mesh(new THREE.TorusGeometry(.4, .05, 6, 24), toon('#1b1530')); band.rotation.x = Math.PI / 2; band.position.y = 1.5; this.body.add(band);
    this.handL = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), mat); this.handR = this.handL.clone();
    outline(this.handL, .1); outline(this.handR, .1); this.body.add(this.handL, this.handR);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), dark); f.scale.set(1, .6, 1.4); f.position.set(s * .2, .08, .05); this.feet.push(f); this.body.add(f); }
    this.body.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    this.root.add(this.body);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); this.label.scale.set(1.5, .56, 1); this.label.position.y = 2.25; this.root.add(this.label);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.8, 2.4), transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.shield.position.y = .95; this.root.add(this.shield);
    scene.add(this.root);
    this.setLabel(0);
  }
  setLabel(pct: number) {
    const k = `${this.name}|${pct}`; if (k === this.lastLabel) return; this.lastLabel = k;
    this.label.material.map?.dispose(); this.label.material.map = tag(this.name, `${pct} %`, pctColor(pct)); this.label.material.needsUpdate = true;
  }
  attack(k: 'punch' | 'blast') { if (k === 'punch') { this.punchT = .22; this.punchSide *= -1; } else this.blastT = .35; }
  update(dt: number, speed: number, ground: boolean, stun: boolean, shield: boolean, visible: boolean) {
    this.root.visible = visible;
    if (!visible) return;
    this.walk += dt * speed * 2.2;
    const bob = ground ? Math.abs(Math.sin(this.walk)) * .08 * Math.min(1, speed / 3) : 0;
    this.body.position.y = bob;
    this.body.rotation.x = Math.min(.25, speed * .03);
    // en vol après un gros coup : on tourne sur soi-même
    this.tumble = stun ? this.tumble + dt * 14 : this.tumble * Math.exp(-dt * 10);
    this.body.rotation.z = stun ? this.tumble : 0;
    this.feet.forEach((f, i) => { f.position.z = .05 + (ground ? Math.sin(this.walk + i * Math.PI) * .18 * Math.min(1, speed / 3) : -.1); });
    this.punchT = Math.max(0, this.punchT - dt); this.blastT = Math.max(0, this.blastT - dt);
    const pk = Math.sin(Math.min(1, (.22 - this.punchT) / .22) * Math.PI) * (this.punchT > 0 ? 1 : 0), bk = this.blastT > 0 ? Math.sin((.35 - this.blastT) / .35 * Math.PI) : 0;
    const swing = Math.sin(this.walk) * .12 * Math.min(1, speed / 3);
    this.handL.position.set(-.52 + bk * .3, .9 + bk * .3, .1 + swing + (this.punchSide < 0 ? pk * .6 : 0) + bk * .5);
    this.handR.position.set(.52 - bk * .3, .9 + bk * .3, .1 - swing + (this.punchSide > 0 ? pk * .6 : 0) + bk * .5);
    this.shield.visible = shield;
    if (shield) (this.shield.material as THREE.MeshBasicMaterial).opacity = .18 + Math.sin(performance.now() / 90) * .08;
  }
  dispose() { this.root.parent?.remove(this.root); }
}

/** Nos poings à l'écran (vue à la première personne). */
export class Viewmodel {
  group = new THREE.Group(); private hands: THREE.Group[] = [];
  private t = 0; private punchT = [0, 0]; private side = 0; private blastT = 0; private charge: THREE.Mesh;
  constructor(camera: THREE.Camera, color: number) {
    const c = colorOf(color);
    // gants de boxe cartoon : gros poing, pouce, bande blanche
    for (const s of [-1, 1]) {
      const h = new THREE.Group();
      const fist = new THREE.Mesh(new THREE.SphereGeometry(.12, 18, 14), toon(c, { depthTest: false }));
      fist.scale.set(1.05, .92, 1.2);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), toon(c.clone().multiplyScalar(.85), { depthTest: false })); thumb.position.set(-s * .1, -.02, -.03);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.085, .09, .06, 14), toon('#ffffff', { depthTest: false })); band.rotation.x = Math.PI / 2; band.position.z = .14;
      const shine = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false })); shine.position.set(s * .04, .07, -.06);
      const ol = outline(fist, .08); (ol.material as THREE.Material).depthTest = false;
      for (const m of [fist, thumb, band, shine]) m.renderOrder = 1000;
      ol.renderOrder = 999;
      h.add(fist, thumb, band, shine); h.userData.s = s; h.scale.setScalar(.72);
      this.hands.push(h); this.group.add(h);
    }
    this.charge = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(4), depthTest: false, transparent: true }));
    this.charge.renderOrder = 1000; this.group.add(this.charge);
    camera.add(this.group);
  }
  punch() { this.side = 1 - this.side; this.punchT[this.side] = .26; }
  blast() { this.blastT = .4; }
  update(dt: number, speed: number, ground: boolean) {
    this.t += dt * (ground ? speed * 1.6 + 1 : 1);
    const bob = Math.sin(this.t * 2) * .012 * Math.min(1, speed / 4 + .2), sway = Math.cos(this.t) * .01;
    this.blastT = Math.max(0, this.blastT - dt);
    const bk = this.blastT > 0 ? Math.sin((.4 - this.blastT) / .4 * Math.PI) : 0;
    this.hands.forEach((h, i) => {
      this.punchT[i] = Math.max(0, this.punchT[i] - dt);
      const u = this.punchT[i] > 0 ? (.26 - this.punchT[i]) / .26 : 1;
      const k = u < .3 ? u / .3 : 1 - (u - .3) / .7;               // coup sec, retour plus lent
      const s = h.userData.s as number;
      h.position.set(s * (.31 - k * .2 - bk * .2) + sway, -.3 + bob + k * .13 + bk * .1, -.64 - k * .32 - bk * .15);
      h.rotation.set(-.15 - k * .25, s * (.35 - k * .3), s * -.25);
    });
    this.charge.visible = bk > 0;
    if (bk > 0) { this.charge.position.set(0, -.17, -.78); this.charge.scale.setScalar(.5 + bk * 2.2); }
  }
}
