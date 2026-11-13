// ============================================================
// Caméra : réalisateur (plans de cinéma enchaînés, travelling sur courbe) et
// marche libre (joystick à gauche, glisser n'importe où à droite pour regarder).
// ============================================================
import * as THREE from 'three';
import type { Shot, V3, World } from './world/world';

const ease = (x: number) => .5 - .5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
const v = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);

/** En portrait, on élargit la focale pour garder l'essentiel du cadre (sans fish-eye). */
export function fitFov(fov: number, aspect: number) {
  if (aspect >= 1.2) return fov;
  const hf = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * 1.6) * .62;
  return Math.min(82, Math.max(fov, 2 * Math.atan(Math.tan(hf / 2) / aspect) * 180 / Math.PI));
}

export class Director {
  shots: Shot[] = [];
  i = 0; t = 0; loop = false; active = false;
  onShot: ((s: Shot, i: number) => void) | null = null;
  onDone: (() => void) | null = null;
  focus = 18;
  constructor(public cam: THREE.PerspectiveCamera) {}

  play(shots: Shot[], loop: boolean, onDone?: () => void) {
    this.shots = shots; this.i = 0; this.t = 0; this.loop = loop; this.active = true;
    this.onDone = onDone ?? null;
    this.onShot?.(shots[0], 0);
  }
  stop() { this.active = false; }

  update(dt: number, time: number) {
    if (!this.active) return;
    const s = this.shots[this.i];
    this.t += dt;
    const k = ease(this.t / s.dur);
    const pos = v(s.from).lerp(v(s.to), k);
    const look = v(s.look).lerp(v(s.look2), k);
    // caméra portée : un léger flottement, jamais immobile
    pos.x += Math.sin(time * .7) * .03; pos.y += Math.sin(time * 1.1) * .02;
    this.cam.position.copy(pos);
    this.cam.lookAt(look);
    this.cam.rotateZ(Math.sin(time * .5) * .006);
    const f = fitFov(s.fov, this.cam.aspect);
    if (this.cam.fov !== f) { this.cam.fov = f; this.cam.updateProjectionMatrix(); }
    this.focus = s.focus ?? pos.distanceTo(look);
    if (this.t >= s.dur) {
      this.t = 0; this.i++;
      if (this.i >= this.shots.length) {
        if (this.loop) this.i = 0;
        else { this.active = false; this.onDone?.(); return; }
      }
      this.onShot?.(this.shots[this.i], this.i);
    }
  }
}

/** Travelling continu sur une courbe (de la rue jusqu'aux portes du casino). */
export class Rail {
  curve: THREE.CatmullRomCurve3; t = 0; active = false; progress = 0; hold = false; onDone: (() => void) | null = null;
  constructor(public cam: THREE.PerspectiveCamera, pts: V3[], public dur: number, public lookAt: V3) {
    this.curve = new THREE.CatmullRomCurve3(pts.map(v), false, 'centripetal');
  }
  start(onDone: () => void) {
    // la courbe part de la position actuelle de la caméra
    this.curve.points[0].copy(this.cam.position);
    this.t = 0; this.active = true; this.onDone = onDone;
  }
  update(dt: number) {
    if (!this.active) return;
    if (!this.hold) this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    this.progress = e;
    const p = this.curve.getPointAt(e);
    const ahead = this.curve.getPointAt(Math.min(1, e + .08));
    this.cam.position.copy(p);
    const target = v(this.lookAt).lerp(ahead.setY(ahead.y + .1), e * .6);
    this.cam.lookAt(target);
    if (k >= 1) { this.active = false; this.onDone?.(); }
  }
}

/** Vue à l'épaule : joystick à gauche (à fond = course), glisser à droite pour tourner
 *  la caméra. Le personnage avance dans la direction de la caméra et se tourne vers
 *  où il va ; la caméra se rapproche quand un mur ou un meuble est derrière. */
export class Walker {
  pos = new THREE.Vector3(); yaw = 0; pitch = .2; bodyYaw = Math.PI;
  move = new THREE.Vector2(); keys = new Set<string>();
  active = false; speed = 0; dist = 2.6;
  /** on ne court pas avec un sac de butin sur le dos */
  noRun = false;
  body: { holder: THREE.Object3D; animate(v: number, dt: number): void } | null = null;
  private joyId: number | null = null; private lookId: number | null = null;
  private joyOrigin = new THREE.Vector2(); private last = new THREE.Vector2();
  constructor(public cam: THREE.PerspectiveCamera, public el: HTMLElement, public joyUi: { base: HTMLElement; knob: HTMLElement }) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.moveH);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    addEventListener('keydown', e => { if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.key.toLowerCase()); });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }
  /** Place le joueur (pieds au sol) ; la caméra démarre dans son dos. */
  place(x: number, z: number, faceYaw: number) {
    this.pos.set(x, 0, z); this.bodyYaw = faceYaw; this.yaw = faceYaw + Math.PI; this.pitch = .2; this.speed = 0;
    this.move.set(0, 0); this.joyId = this.lookId = null; this.joyUi.base.classList.remove('on');
  }
  private down = (e: PointerEvent) => {
    if (!this.active) return;
    this.el.setPointerCapture(e.pointerId);
    if (e.clientX < innerWidth * .45 && e.pointerType !== 'mouse' && this.joyId === null) {
      this.joyId = e.pointerId; this.joyOrigin.set(e.clientX, e.clientY);
      const b = this.joyUi.base; b.style.left = e.clientX + 'px'; b.style.top = e.clientY + 'px'; b.classList.add('on');
      this.joyUi.knob.style.transform = 'translate(-50%,-50%)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId; this.last.set(e.clientX, e.clientY);
    }
  };
  private moveH = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) {
      const d = new THREE.Vector2(e.clientX, e.clientY).sub(this.joyOrigin);
      const r = 50; if (d.length() > r) d.setLength(r);
      this.move.set(d.x / r, d.y / r);
      this.joyUi.knob.style.transform = `translate(calc(-50% + ${d.x}px), calc(-50% + ${d.y}px))`;
      this.joyUi.base.classList.toggle('run', this.move.length() > .9);
    } else if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y;
      this.last.set(e.clientX, e.clientY);
      const s = e.pointerType === 'mouse' ? .0034 : .0058;
      this.yaw -= dx * s; this.pitch = Math.max(-.3, Math.min(.85, this.pitch + dy * s * .8));
    }
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) { this.joyId = null; this.move.set(0, 0); this.joyUi.base.classList.remove('on', 'run'); }
    if (e.pointerId === this.lookId) this.lookId = null;
  };

  update(dt: number, w: World) {
    if (!this.active) return;
    const k = this.keys;
    const mv = this.move.clone();
    let kb = false;
    if (k.has('z') || k.has('w') || k.has('arrowup')) { mv.y -= 1; kb = true; }
    if (k.has('s') || k.has('arrowdown')) { mv.y += 1; kb = true; }
    if (k.has('q') || k.has('a') || k.has('arrowleft')) { mv.x -= 1; kb = true; }
    if (k.has('d') || k.has('arrowright')) { mv.x += 1; kb = true; }
    let mag = Math.min(1, mv.length());
    if (mag > 0) mv.normalize();
    // joystick : à moitié = marche, à fond = course · clavier : Maj = course
    const running = !this.noRun && (kb ? k.has('shift') : mag > .9);
    if (kb) mag = running ? 1 : .8;
    const target = mag < .12 ? 0 : running ? 4.2 : 1.9 * Math.min(1, mag / .8);
    this.speed += (target - this.speed) * Math.min(1, dt * (target > this.speed ? 6 : 10));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const dir = fwd.multiplyScalar(-mv.y).add(right.multiplyScalar(mv.x));
    if (mag >= .12) {
      const want = Math.atan2(dir.x, dir.z);
      const d = Math.atan2(Math.sin(want - this.bodyYaw), Math.cos(want - this.bodyYaw));
      this.bodyYaw += d * Math.min(1, dt * 11);
    }
    // on avance surtout dans la direction du corps (virages naturels)
    const face = new THREE.Vector3(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw));
    const step = face.multiplyScalar(this.speed * dt);
    const x0 = this.pos.x, z0 = this.pos.z;
    this.tryMove(step.x, 0, w); this.tryMove(0, step.z, w);
    const real = dt > 0 ? Math.hypot(this.pos.x - x0, this.pos.z - z0) / dt : 0;
    if (real < this.speed * .3) this.speed = Math.max(real, this.speed * .5);
    if (this.body) {
      this.body.holder.position.copy(this.pos);
      this.body.holder.rotation.y = this.bodyYaw;
      this.body.animate(real, dt);
    }
    this.placeCamera(dt, w);
  }

  private placeCamera(dt: number, w: World) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const look = new THREE.Vector3(-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const head = new THREE.Vector3(this.pos.x, 1.58, this.pos.z);
    // épaule droite, puis recul jusqu'au premier obstacle
    const sh = this.march(head, right, .42, w);
    const shoulder = head.clone().addScaledVector(right, sh);
    const want = this.march(shoulder, look.clone().negate(), 2.6, w);
    this.dist += (want - this.dist) * Math.min(1, dt * (want < this.dist ? 18 : 4));
    const c = shoulder.clone().addScaledVector(look, -this.dist);
    c.y = Math.max(.35, Math.min(2.85, c.y));
    this.cam.position.copy(c);
    this.cam.lookAt(shoulder.addScaledVector(look, 3).setY(shoulder.y + .3));
    const f = fitFov(60, this.cam.aspect);
    if (this.cam.fov !== f) { this.cam.fov = f; this.cam.updateProjectionMatrix(); }
  }
  /** Distance libre depuis o dans la direction d (murs = hors des zones praticables, meubles). */
  private march(o: THREE.Vector3, d: THREE.Vector3, max: number, w: World) {
    const m = .28;
    for (let t = .1; t <= max + 1e-6; t += .1) {
      const x = o.x + d.x * t, z = o.z + d.z * t;
      const inside = w.walk ? w.walk.some(b => x >= b[0] - m && x <= b[2] + m && z >= b[1] - m && z <= b[3] + m) : true;
      const y = o.y + d.y * t;
      const hit = y < 2.6 && (w.solids ?? []).some(s => x > s[0] + .05 && x < s[2] - .05 && z > s[1] + .05 && z < s[3] - .05);
      if (!inside || hit) return Math.max(.15, t - .25);
    }
    return max;
  }
  private tryMove(dx: number, dz: number, w: World) {
    const r = .3, nx = this.pos.x + dx, nz = this.pos.z + dz;
    const blocked = (x: number, z: number) => {
      if (w.walk) { if (!w.walk.some(b => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3])) return true; }
      else { const b = w.bounds; if (b && (x < b[0] || x > b[2] || z < b[1] || z > b[3])) return true; }
      for (const s of w.solids ?? []) if (x > s[0] - r && x < s[2] + r && z > s[1] - r && z < s[3] + r) return true;
      return false;
    };
    // si l'on est déjà coincé (apparition dans un meuble), on laisse sortir
    if (blocked(nx, nz) && !blocked(this.pos.x, this.pos.z)) return;
    this.pos.x = nx; this.pos.z = nz;
  }
}
