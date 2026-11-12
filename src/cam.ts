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
  curve: THREE.CatmullRomCurve3; t = 0; active = false; onDone: (() => void) | null = null;
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
    this.t += dt;
    const k = Math.min(1, this.t / this.dur);
    const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const p = this.curve.getPointAt(e);
    const ahead = this.curve.getPointAt(Math.min(1, e + .08));
    this.cam.position.copy(p);
    const target = v(this.lookAt).lerp(ahead.setY(ahead.y + .1), e * .6);
    this.cam.lookAt(target);
    if (k >= 1) { this.active = false; this.onDone?.(); }
  }
}

export class Walker {
  pos = new THREE.Vector3(); yaw = 0; pitch = 0;
  move = new THREE.Vector2(); keys = new Set<string>();
  active = false; bob = 0;
  private joyId: number | null = null; private lookId: number | null = null;
  private joyOrigin = new THREE.Vector2(); private last = new THREE.Vector2();
  constructor(public cam: THREE.PerspectiveCamera, public el: HTMLElement, public joyUi: { base: HTMLElement; knob: HTMLElement }) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.moveH);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    addEventListener('keydown', e => this.keys.add(e.key.toLowerCase()));
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
  }
  place(w: World) {
    const s = w.spawn!;
    this.pos.set(...s.pos); this.yaw = s.yaw; this.pitch = 0;
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
      const r = 46; if (d.length() > r) d.setLength(r);
      this.move.set(d.x / r, d.y / r);
      this.joyUi.knob.style.transform = `translate(calc(-50% + ${d.x}px), calc(-50% + ${d.y}px))`;
    } else if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y;
      this.last.set(e.clientX, e.clientY);
      const s = e.pointerType === 'mouse' ? .0032 : .0052;
      this.yaw -= dx * s; this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - dy * s));
    }
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) { this.joyId = null; this.move.set(0, 0); this.joyUi.base.classList.remove('on'); }
    if (e.pointerId === this.lookId) this.lookId = null;
  };

  update(dt: number, w: World) {
    if (!this.active) return;
    const k = this.keys;
    const mv = this.move.clone();
    if (k.has('z') || k.has('w') || k.has('arrowup')) mv.y -= 1;
    if (k.has('s') || k.has('arrowdown')) mv.y += 1;
    if (k.has('q') || k.has('a') || k.has('arrowleft')) mv.x -= 1;
    if (k.has('d') || k.has('arrowright')) mv.x += 1;
    if (mv.length() > 1) mv.normalize();
    const speed = 3.2 * (k.has('shift') ? 1.7 : 1);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const step = fwd.multiplyScalar(-mv.y * speed * dt).add(right.multiplyScalar(mv.x * speed * dt));
    this.tryMove(step.x, 0, w); this.tryMove(0, step.z, w);
    const moving = step.length() > 1e-4;
    this.bob += moving ? dt * 7.5 : 0;
    this.cam.position.set(this.pos.x, this.pos.y + (moving ? Math.sin(this.bob) * .025 : 0), this.pos.z);
    const f = fitFov(62, this.cam.aspect);
    if (this.cam.fov !== f) { this.cam.fov = f; this.cam.updateProjectionMatrix(); }
    this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
  private tryMove(dx: number, dz: number, w: World) {
    const r = .32, nx = this.pos.x + dx, nz = this.pos.z + dz;
    const b = w.bounds;
    if (b && (nx < b[0] || nx > b[2] || nz < b[1] || nz > b[3])) return;
    for (const s of w.solids ?? []) if (nx > s[0] - r && nx < s[2] + r && nz > s[1] - r && nz < s[3] + r) return;
    this.pos.x = nx; this.pos.z = nz;
  }
}
