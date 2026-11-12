// ============================================================
// Reflets planaires : la scène est re-rendue depuis une caméra symétrique sous le sol,
// en demi-résolution, avec mipmaps pour flouter les zones mates. Sert au bitume mouillé
// (flaques nettes + reflets diffus + gouttes) et au marbre ciré du hall.
// ============================================================
import * as THREE from 'three';
import { U } from './kit';

export class Mirror {
  rt: THREE.WebGLRenderTarget;
  cam = new THREE.PerspectiveCamera();
  texMatrix = new THREE.Matrix4();
  hidden: THREE.Object3D[] = [];
  enabled = true;
  users: { uOn: { value: number } }[] = [];
  setEnabled(on: boolean) { this.enabled = on; for (const u of this.users) u.uOn.value = on ? 1 : 0; }
  private clip = new THREE.Vector4();
  constructor(public scene: THREE.Scene, public y: number, public scale: number) {
    this.rt = new THREE.WebGLRenderTarget(16, 16, {
      type: THREE.HalfFloatType, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    this.cam.layers.set(0);
  }

  update = (r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera) => {
    if (!this.enabled) return;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.round(size.x * this.scale)), h = Math.max(64, Math.round(size.y * this.scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);

    cam.updateMatrixWorld();
    const p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    if (p.y < this.y) return;
    const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).applyMatrix4(rot);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(rot);
    const v = this.cam;
    v.position.set(p.x, 2 * this.y - p.y, p.z);
    fwd.y = -fwd.y; up.y = -up.y;
    v.up.copy(up);
    v.lookAt(v.position.clone().add(fwd));
    v.far = cam.far; v.near = cam.near;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(cam.projectionMatrix);

    this.texMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
    this.texMatrix.multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);

    // plan de coupe oblique : ce qui est sous le miroir n'apparaît pas dans le reflet
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, this.y, 0));
    plane.applyMatrix4(v.matrixWorldInverse);
    const c = this.clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = v.projectionMatrix.elements;
    const q = new THREE.Vector4(
      (Math.sign(c.x) + pm[8]) / pm[0], (Math.sign(c.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    c.multiplyScalar(2 / c.dot(q));
    pm[2] = c.x; pm[6] = c.y; pm[10] = c.z + 1 - .003; pm[14] = c.w;

    const vis = this.hidden.map(o => o.visible);
    for (const o of this.hidden) o.visible = false;
    const prevRT = r.getRenderTarget(), prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, v);
    r.setRenderTarget(prevRT);
    r.shadowMap.autoUpdate = prevShadow;
    this.hidden.forEach((o, i) => (o.visible = vis[i]));
  };
}


export interface WetOpts {
  puddles?: number;      // 0 = aucune flaque, 1 = beaucoup
  damp?: number;         // force du reflet hors flaque (0..1)
  blur?: number;         // flou du reflet hors flaque (niveau de mip)
  distort?: number;      // distorsion par la normale
  darken?: number;       // assombrissement du mouillé
  ripples?: number;      // gouttes de pluie dans les flaques
  f0?: number;           // réflectance à incidence normale
  paint?: boolean;       // marquages au sol (route)
  checker?: THREE.Texture | null; // 2e texture en damier (marbre noir/crème)
}

const NOISE = /* glsl */`
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
vec2 ripple(vec2 p, float t){
  vec2 acc = vec2(0.0);
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    vec2 q = p * (1.3 + fl * .7) + fl * 7.31;
    vec2 cell = floor(q); vec2 f = fract(q) - .5;
    float h = h21(cell + fl * 3.17);
    vec2 off = (vec2(h21(cell + 1.7), h21(cell + 4.3)) - .5) * .5;
    vec2 d = f - off; float r = length(d);
    float ph = fract(t * (.7 + h * .5) + h);
    float ring = r - ph * .45;
    float w = sin(ring * 70.0) * smoothstep(.05, .0, abs(ring)) * (1.0 - ph);
    acc += d / (r + 1e-3) * w;
  }
  return acc * .5;
}`;

/** Branche un Mirror sur un MeshStandardMaterial (le matériau garde tout son PBR). */
export function wetMaterial(mat: THREE.MeshStandardMaterial, mirror: Mirror, o: WetOpts = {}) {
  const uni = {
    tRefl: { value: mirror.rt.texture }, uTexM: { value: mirror.texMatrix }, uTime: U.time,
    uPud: { value: o.puddles ?? 0 }, uDamp: { value: o.damp ?? .35 }, uBlur: { value: o.blur ?? 2.5 },
    uDist: { value: o.distort ?? .05 }, uDark: { value: o.darken ?? .5 }, uRip: { value: o.ripples ?? 1 },
    uF0: { value: o.f0 ?? .04 }, uOn: { value: 1 }, tCheck: { value: o.checker ?? null },
  };
  mat.userData.wet = uni;
  mirror.users.push(uni);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    if (o.checker) sh.defines = { ...(sh.defines ?? {}), USE_CHECK: '' };
    if (o.paint) sh.defines = { ...(sh.defines ?? {}), USE_PAINT: '' };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWW;
uniform sampler2D tRefl; uniform mat4 uTexM; uniform float uTime, uPud, uDamp, uBlur, uDist, uDark, uRip, uF0, uOn;
#ifdef USE_CHECK
uniform sampler2D tCheck;
#endif
${NOISE}
float pudM; float paintM;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_CHECK
{ vec2 cq = floor(vWW.xz / 1.2); float ck = mod(cq.x + cq.y, 2.0);
  vec4 c2 = texture2D(tCheck, vMapUv * 1.3 + .37);
  diffuseColor.rgb = mix(diffuseColor.rgb, c2.rgb * vec3(.16, .15, .15), ck);
  // joint doré fin entre les dalles
  vec2 gq = abs(fract(vWW.xz / 1.2) - .5);
  float joint = smoothstep(.492, .498, max(gq.x, gq.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.55, .38, .16), joint * .8); }
#endif
paintM = 0.0;
#ifdef USE_PAINT
{ float cl = step(abs(vWW.z), .09) * step(.5, fract(vWW.x / 6.0));          // ligne centrale pointillée
  float cw = step(abs(vWW.x - 0.0), 4.2) * step(abs(vWW.z), 5.2) * step(.5, fract(vWW.x / 1.1)); // passage piéton
  float ed = step(abs(abs(vWW.z) - 5.55), .07);                                  // lignes de rive
  paintM = clamp(cl + cw + ed, 0.0, 1.0) * (.75 + .25 * vn(vWW.xz * 9.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .6, .55), paintM); }
#endif
float n = vn(vWW.xz * .16) * .62 + vn(vWW.xz * .55) * .28 + vn(vWW.xz * 2.1) * .1;
pudM = uPud > 0.0 ? smoothstep(.72 - uPud * .3, .78 - uPud * .3, n) * (1.0 - paintM * .8) : 0.0;
diffuseColor.rgb *= mix(1.0 - uDark * .6, 1.0 - uDark, pudM);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor * (1.0 - uDamp * .5), .04, pudM);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec2 rp = uRip > 0.0 ? ripple(vWW.xz, uTime) * uRip : vec2(0.0);
  vec3 rn = normalize((viewMatrix * vec4(rp.x, 1.0, rp.y, 0.0)).xyz);
  normal = normalize(mix(normal, rn, pudM)); }`)
      .replace('#include <opaque_fragment>', `
if (uOn > .5) {
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec4 rp4 = uTexM * vec4(vWW, 1.0);
  vec2 ruv = rp4.xy / rp4.w + nW.xz * uDist * (1.0 - pudM * .6);
  vec3 refl = textureLod(tRefl, ruv, mix(uBlur, 0.0, pudM)).rgb;
  vec3 V = normalize(cameraPosition - vWW);
  float ndv = clamp(dot(nW, V), 0.0, 1.0);
  float F = uF0 + (1.0 - uF0) * pow(1.0 - ndv, 5.0);
  float k = clamp(mix(uDamp, 1.0, pudM) * F, 0.0, 1.0);
  outgoingLight = outgoingLight * (1.0 - k * .5) + refl * k;
}
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'wet' + (o.checker ? 'c' : '') + (o.paint ? 'p' : '');
  return mat;
}
