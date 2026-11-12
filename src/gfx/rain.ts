// ============================================================
// Pluie : traînées en GPU autour de la caméra (teintées par les lumières proches),
// éclaboussures au sol, vapeur des plaques d'égout. Tout est animé dans les shaders.
// ============================================================
import * as THREE from 'three';
import { U, glowTex } from './kit';

export interface RainLight { pos: THREE.Vector3; color: THREE.Color; radius: number }

export function makeRain(count: number, lights: RainLight[]) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    off[i * 4] = Math.random() * 30; off[i * 4 + 1] = Math.random() * 16; off[i * 4 + 2] = Math.random() * 30; off[i * 4 + 3] = .8 + Math.random() * .5;
  }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  g.instanceCount = count;
  const L = Math.min(6, lights.length);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.time, uCam: { value: new THREE.Vector3() }, uOpacity: { value: .5 },
      uLP: { value: Array.from({ length: 6 }, (_, i) => lights[i]?.pos ?? new THREE.Vector3(0, -99, 0)) },
      uLC: { value: Array.from({ length: 6 }, (_, i) => lights[i]?.color ?? new THREE.Color(0)) },
      uLR: { value: Array.from({ length: 6 }, (_, i) => lights[i]?.radius ?? 1) },
    },
    defines: { NL: L || 1 },
    vertexShader: /* glsl */`
      attribute vec4 aOff; uniform float uTime; uniform vec3 uCam;
      uniform vec3 uLP[6]; uniform vec3 uLC[6]; uniform float uLR[6];
      varying vec2 vUv; varying vec3 vCol; varying float vFade;
      const vec3 BOX = vec3(30.0, 16.0, 30.0);
      void main(){
        vec3 vel = vec3(-1.2, -11.0, .6) * aOff.w;
        vec3 p = aOff.xyz + vel * uTime;
        vec3 wp = uCam + mod(p - uCam + BOX * .5, BOX) - BOX * .5;
        wp.y = mod(p.y, BOX.y) - 1.0;
        vec4 c = viewMatrix * vec4(wp, 1.0);
        vec3 dir = normalize((viewMatrix * vec4(vel, 0.0)).xyz);
        vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
        float len = .55 * aOff.w, wid = .012;
        c.xyz += dir * (position.y) * len + side * position.x * wid * (1.0 + max(0.0, -c.z) * .04);
        gl_Position = projectionMatrix * c;
        vUv = uv;
        vec3 col = vec3(.35, .4, .5);
        for (int i = 0; i < NL; i++) { float d = distance(wp, uLP[i]); col += uLC[i] * pow(max(0.0, 1.0 - d / uLR[i]), 2.0) * 2.2; }
        vCol = col;
        vFade = smoothstep(.5, 2.5, -c.z) * (1.0 - smoothstep(12.0, 15.0, -c.z));
        float dry = step(wp.z, -11.2) * step(abs(wp.x), 26.0) + step(abs(wp.x), 8.7) * step(wp.z, -5.9) * step(wp.y, 5.5);
        vFade *= 1.0 - min(dry, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying vec2 vUv; varying vec3 vCol; varying float vFade;
      void main(){
        float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, .4, vUv.y) * smoothstep(1.0, .6, vUv.y);
        gl_FragColor = vec4(vCol, a * uOpacity * vFade);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 10;
  m.layers.set(1);
  m.onBeforeRender = (_r, _s, cam) => { mat.uniforms.uCam.value.copy(cam.position); };
  return m;
}

/** Éclaboussures : anneaux qui naissent et s'effacent au sol, réparties autour de la caméra. */
export function makeSplashes(count: number, y: number, area: { x0: number; x1: number; z0: number; z1: number }) {
  const base = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const ph = new Float32Array(count);
  for (let i = 0; i < count; i++) ph[i] = Math.random();
  g.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uY: { value: y }, uA: { value: new THREE.Vector4(area.x0, area.x1, area.z0, area.z1) } },
    vertexShader: /* glsl */`
      attribute float aPh; uniform float uTime, uY; uniform vec4 uA;
      varying vec2 vUv; varying float vT;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float t = uTime * 1.6 + aPh * 13.0;
        float cyc = floor(t); vT = fract(t);
        float s = cyc * 1.37 + aPh * 91.0;
        vec3 wp = vec3(mix(uA.x, uA.y, h(s)), uY, mix(uA.z, uA.w, h(s + 3.1)));
        float dry = step(abs(wp.x), 8.7) * step(wp.z, -5.9);
        wp.xz += position.xz * (.05 + vT * .22) * (1.0 - dry);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vT;
      void main(){
        float r = length(vUv - .5) * 2.0;
        float ring = smoothstep(.16, .0, abs(r - .8)) * (1.0 - vT);
        float dot0 = smoothstep(.35, .0, r) * smoothstep(.25, 0.0, vT) * 1.5;
        gl_FragColor = vec4(vec3(.75, .8, .9), (ring * .35 + dot0 * .4));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.layers.set(1); m.renderOrder = 9;
  return m;
}

/** Vapeur qui monte d'une bouche d'égout : quelques grands sprites doux. */
export function makeSteam(pos: THREE.Vector3, tint: string) {
  const grp = new THREE.Group();
  const tex = glowTex();
  const n = 9;
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: tint, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData.ph = i / n;
    sprites.push(s); grp.add(s);
  }
  grp.position.copy(pos);
  grp.userData.tick = (t: number) => {
    for (const s of sprites) {
      const k = (t * .12 + s.userData.ph) % 1;
      s.position.set(Math.sin(k * 6 + s.userData.ph * 9) * .4 + k * 1.2, k * 4.5, Math.cos(k * 5) * .3);
      s.scale.setScalar(.8 + k * 4.5);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI) * .16;
      s.material.rotation = k * 2 + s.userData.ph * 6;
    }
  };
  return grp;
}
