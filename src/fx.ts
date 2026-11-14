// ============================================================
// Effets : particules lumineuses (elles « brillent » grâce au halo du rendu),
// orbe d'énergie avec traînée, explosion avec onde de choc, étoile d'impact,
// gerbe d'eau, rayon d'apparition, traînée de ruée.
// ============================================================
import * as THREE from 'three';

const MAXP = 1600;
const tex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); return t;
})();
const ringTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 3; i++) {
    const g = x.createRadialGradient(128, 128, 60 + i * 8, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.75, `rgba(255,255,255,${.9 - i * .25})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  // ruptures dans l'anneau, style dessin animé
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + Math.random() * .3; x.beginPath(); x.moveTo(128, 128); x.arc(128, 128, 130, a, a + .12); x.fill(); }
  return new THREE.CanvasTexture(c);
})();
const starTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const star = (r1: number, r2: number, n: number, fill: string) => {
    x.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r2 : r1 * (.8 + Math.random() * .4); x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); }
    x.closePath(); x.fillStyle = fill; x.fill();
  };
  star(124, 46, 9, 'rgba(255,255,255,.9)'); star(86, 34, 9, '#fff');
  return new THREE.CanvasTexture(c);
})();

class Pool {
  geo = new THREE.BufferGeometry(); pts: THREE.Points;
  pos = new Float32Array(MAXP * 3); col = new Float32Array(MAXP * 3); size = new Float32Array(MAXP); alpha = new Float32Array(MAXP);
  vel = new Float32Array(MAXP * 3); life = new Float32Array(MAXP); max = new Float32Array(MAXP); grav = new Float32Array(MAXP); drag = new Float32Array(MAXP); grow = new Float32Array(MAXP); s0 = new Float32Array(MAXP);
  n = 0;
  constructor(scene: THREE.Scene, additive: boolean) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: innerHeight * .9 }, amax: { value: additive ? 1 : .75 } },
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; uniform float scale; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * scale / max(.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; uniform float amax;
        void main(){ float a = texture2D(map, gl_PointCoord).a * vA * amax; if (a < .01) discard; gl_FragColor = vec4(vC, a); }`,
    });
    this.pts = new THREE.Points(this.geo, mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 5 : 4;
    scene.add(this.pts);
  }
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color, size: number, life: number, grav = 0, drag = 1, grow = 0) {
    if (this.n >= MAXP) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([c.r, c.g, c.b], i * 3);
    this.s0[i] = this.size[i] = size; this.life[i] = this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.alpha[i] = 1;
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {        // on remplace par le dernier
        const j = --this.n;
        if (i !== j) {
          for (const a of [this.pos, this.vel, this.col]) a.copyWithin(i * 3, j * 3, j * 3 + 3);
          for (const a of [this.size, this.life, this.max, this.grav, this.drag, this.grow, this.s0, this.alpha]) a[i] = a[j];
        }
        i--; continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const u = this.life[i] / this.max[i];
      this.alpha[i] = Math.min(1, u * 2.2);
      this.size[i] = this.s0[i] * (1 + this.grow[i] * (1 - u));
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'alpha']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }
}

interface Live { o: THREE.Object3D; t: number; life: number; step(u: number, o: THREE.Object3D, dt: number): void }

export class FX {
  glow: Pool; soft: Pool;
  private live: Live[] = [];
  private lights: THREE.PointLight[] = [];
  constructor(private scene: THREE.Scene) {
    this.glow = new Pool(scene, true); this.soft = new Pool(scene, false);
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight('#88e8ff', 0, 12, 1.5); scene.add(l); this.lights.push(l); }
  }
  private sprite(map: THREE.Texture, color: THREE.Color, additive = true) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.renderOrder = 6; return s;
  }
  private keep(o: THREE.Object3D, life: number, step: Live['step']) { this.scene.add(o); this.live.push({ o, t: 0, life, step }); }
  private flash(x: number, y: number, z: number, color: string, power: number) {
    const l = this.lights.find(l => l.intensity < .5) ?? this.lights[0];
    l.color.set(color); l.position.set(x, y, z); l.intensity = power;
  }

  /** Orbe d'énergie (le projectile) : cœur blanc, halo, anneau qui tourne, traînée. */
  orb(color: THREE.Color) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) }));
    const halo = this.sprite(tex, color.clone().multiplyScalar(2.2)); halo.scale.setScalar(1.6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.42, .035, 6, 32), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ring2 = ring.clone(); ring2.scale.setScalar(.75);
    g.add(core, halo, ring, ring2); this.scene.add(g);
    let t = 0;
    return {
      obj: g,
      update: (x: number, y: number, z: number, dt: number) => {
        t += dt; g.position.set(x, y, z);
        ring.rotation.set(t * 9, t * 5, 0); ring2.rotation.set(-t * 7, 0, t * 11);
        halo.scale.setScalar(1.5 + Math.sin(t * 40) * .15);
        for (let i = 0; i < 3; i++) this.glow.add(x + (Math.random() - .5) * .25, y + (Math.random() - .5) * .25, z + (Math.random() - .5) * .25,
          (Math.random() - .5) * 1.2, (Math.random() - .5) * 1.2, (Math.random() - .5) * 1.2, color.clone().multiplyScalar(1.6 + Math.random()), .22 + Math.random() * .2, .38, 0, 2, -.6);
      },
      dispose: () => { this.scene.remove(g); },
    };
  }

  /** Explosion de l'orbe : éclair, onde de choc, étincelles, nuage. */
  boom(x: number, y: number, z: number, color: THREE.Color) {
    const fl = this.sprite(tex, new THREE.Color(5, 5, 5)); fl.position.set(x, y, z);
    this.keep(fl, .22, (u, o) => { o.scale.setScalar(.4 + u * 3.2); (o as THREE.Sprite).material.opacity = 1 - u; });
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, color: color.clone().multiplyScalar(k ? 2 : 3.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(x, y, z);
      if (k) ring.rotation.x = -Math.PI / 2; else ring.lookAt(x + Math.random(), y + 1, z + Math.random());
      ring.renderOrder = 6;
      this.keep(ring, .45 + k * .1, (u, o) => { o.scale.setScalar(.6 + Math.pow(u, .5) * (k ? 7 : 5)); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - u; o.rotation.z += .05; });
    }
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * 6.28, b = Math.random() * 3.14 - 1.2, s = 5 + Math.random() * 9;
      this.glow.add(x, y, z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 2, Math.sin(a) * Math.cos(b) * s, (i % 3 ? color : new THREE.Color(1, 1, 1)).clone().multiplyScalar(2 + Math.random() * 2), .16 + Math.random() * .16, .45 + Math.random() * .35, 9, 2.5);
    }
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 6.28, s = 1.5 + Math.random() * 2;
      this.soft.add(x, y, z, Math.cos(a) * s, .8 + Math.random(), Math.sin(a) * s, new THREE.Color(.92, .95, 1), .45 + Math.random() * .3, .5 + Math.random() * .3, -.5, 2.5, 1.1);
    }
    this.flash(x, y + .3, z, '#' + color.clone().multiplyScalar(.5).getHexString(), 30);
  }

  /** Coup de poing qui porte : étoile de BD, étincelles. */
  punch(x: number, y: number, z: number, big: boolean) {
    const s = this.sprite(starTex, big ? new THREE.Color(4, 2.6, .6) : new THREE.Color(3, 2.6, 1.4)); s.position.set(x, y, z); s.material.rotation = Math.random() * 6;
    const S = big ? 1.9 : 1.1;
    this.keep(s, big ? .3 : .2, (u, o) => { o.scale.setScalar(S * (u < .3 ? u / .3 : 1 + (u - .3) * .4)); (o as THREE.Sprite).material.opacity = 1 - Math.max(0, u - .4) / .6; });
    for (let i = 0; i < (big ? 26 : 12); i++) {
      const a = Math.random() * 6.28, b = (Math.random() - .3) * 2, sp = 4 + Math.random() * 6;
      this.glow.add(x, y, z, Math.cos(a) * sp, b * sp * .6, Math.sin(a) * sp, new THREE.Color(3, 2.2, .7), .12 + Math.random() * .1, .3 + Math.random() * .2, 12, 3);
    }
    if (big) this.flash(x, y, z, '#ffcc66', 14);
  }

  /** Gerbe d'eau quand quelqu'un tombe à la mer. */
  splash(x: number, z: number) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 6.28, r = Math.random() * .8, up = 5 + Math.random() * 8;
      this.soft.add(x + Math.cos(a) * r, .1, z + Math.sin(a) * r, Math.cos(a) * (1 + Math.random() * 2.5), up, Math.sin(a) * (1 + Math.random() * 2.5),
        i % 4 ? new THREE.Color(.85, .97, 1) : new THREE.Color(.45, .9, .95), .35 + Math.random() * .4, .9 + Math.random() * .5, 16, .6, .8);
    }
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, .12, z);
      this.keep(ring, 1.4, (u, o) => { const s = .6 + (u + k * .25) * 5; o.scale.setScalar(s); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - u) * .9; });
    }
  }

  /** Rayon doré : quelqu'un revient dans l'arène. */
  beam(x: number, y: number, z: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 30, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, .9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(x, y + 10, z);
    this.keep(m, 1, (u, o) => { o.scale.set(1 - u * .9, 1, 1 - u * .9); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - u) * .7; });
    for (let i = 0; i < 30; i++) this.glow.add(x + (Math.random() - .5) * 1.4, y + Math.random() * 2, z + (Math.random() - .5) * 1.4, 0, 2 + Math.random() * 4, 0, new THREE.Color(3, 2.5, 1), .18, 1, -1, 1);
  }

  /** Traînée de la ruée. */
  dash(x: number, y: number, z: number, color: THREE.Color) {
    for (let i = 0; i < 10; i++) this.glow.add(x + (Math.random() - .5) * .6, y + .3 + Math.random() * 1.2, z + (Math.random() - .5) * .6, 0, 0, 0, color.clone().multiplyScalar(1.4), .3, .35, 0, 1, 1);
  }

  /** Charge des mains avant de lancer l'orbe (vue à la 1re personne). */
  sparkle(x: number, y: number, z: number, color: THREE.Color) {
    this.glow.add(x, y, z, (Math.random() - .5) * 2, Math.random() * 2, (Math.random() - .5) * 2, color.clone().multiplyScalar(2), .1, .3, 0, 3);
  }

  update(dt: number) {
    this.glow.update(dt); this.soft.update(dt);
    for (const l of this.lights) l.intensity *= Math.exp(-dt * 9);
    this.live = this.live.filter(L => {
      L.t += dt; const u = Math.min(1, L.t / L.life);
      L.step(u, L.o, dt);
      if (u >= 1) { this.scene.remove(L.o); return false; }
      return true;
    });
  }
}
