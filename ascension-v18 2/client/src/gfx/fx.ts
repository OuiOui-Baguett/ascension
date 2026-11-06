// ============================================================
// Shaders maison : eau, cascade, faisceaux de lumière, flammes,
// particules, sol mélangé, ciel, feuillage translucide.
// Tous respectent le brouillard de la scène.
// ============================================================
import * as THREE from 'three';

export const U = { time: { value: 0 } };            // horloge partagée par tous les shaders
export function tickFx(t: number) { U.time.value = t; }

const NOISE = /* glsl */`
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
`;

// ---------- ciel ----------
/** Dôme de ciel : zénith lumineux, horizon brumeux, halo du soleil. Pas de photo : on maîtrise la couleur. */
export function skyDome(top: string, horizon: string, sunDir: THREE.Vector3, sunColor: string) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) },
      sunDir: { value: sunDir.clone().normalize() }, sunColor: { value: new THREE.Color(sunColor) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, horizon, sunDir, sunColor; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0., 1.);
        vec3 c = mix(horizon, top, pow(h, .55));
        float s = max(dot(normalize(vDir), sunDir), 0.);
        c += sunColor * (pow(s, 7.) * .55 + pow(s, 90.) * 3.);
        gl_FragColor = vec4(c, 1.); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// ---------- feuillage ----------
/** Translucidité : une feuille vue à contre-jour s'illumine. C'est ce qui rend une jungle vivante. */
export function leafify(m: THREE.MeshStandardMaterial, sunDirWorld: THREE.Vector3, sunColor: THREE.Color, amount = .9, sway = 0) {
  m.alphaTest = m.alphaTest || .42;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDir = { value: sunDirWorld };
    sh.uniforms.uSunCol = { value: sunColor };
    sh.uniforms.uTrans = { value: amount };
    sh.uniforms.uTime = U.time;
    sh.uniforms.uSway = { value: sway };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.);
        #endif
        float sw = sin(uTime*1.3 + ip.x*.37 + ip.z*.23) * uSway * (position.y + 1.);
        transformed.x += sw; transformed.z += sw*.6;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uTrans;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.)).xyz);
        float tr = pow(max(dot(-geometryViewDir, Lv), 0.), 3.) * .85 + .15;
        float facing = abs(dot(normal, Lv));
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * tr * uTrans * (.35 + .65*facing);`);
  };
  m.customProgramCacheKey = () => 'leaf' + amount + sway;
  return m;
}

// ---------- sol ----------
/** Sol de la cour : dalles de pierre au centre qui se perdent dans l'humus sur les bords,
 *  avec des plaques de mousse. Deux jeux de textures mélangés dans le shader. */
export function groundMaterial(stone: { diff: THREE.Texture; nor: THREE.Texture; arm: THREE.Texture },
  forest: { diff: THREE.Texture; nor: THREE.Texture; arm: THREE.Texture }, innerR: number, outerR: number) {
  const m = new THREE.MeshStandardMaterial({
    map: stone.diff, normalMap: stone.nor, roughnessMap: stone.arm, roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(1.2, 1.2),
  });
  // une ouverture rectangulaire dans le dallage (le gouffre du Pont Pourri)
  m.userData.hole = { value: new THREE.Vector4(0, 0, 0, 0) };
  m.userData.holeRot = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHole = m.userData.hole;
    sh.uniforms.uHoleRot = m.userData.holeRot;
    sh.uniforms.uMapB = { value: forest.diff };
    sh.uniforms.uNorB = { value: forest.nor };
    sh.uniforms.uArmB = { value: forest.arm };
    sh.uniforms.uIn = { value: innerR };
    sh.uniforms.uOut = { value: outerR };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec2 vWXZ;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWXZ = (modelMatrix * vec4(transformed, 1.)).xz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uMapB, uNorB, uArmB; uniform float uIn, uOut; varying vec2 vWXZ;
        uniform vec4 uHole; uniform float uHoleRot;
        ${NOISE}
        float gMask;`)
      .replace('#include <map_fragment>', `
        vec2 hd = vWXZ - uHole.xy; float hc = cos(uHoleRot), hs = sin(uHoleRot);
        vec2 hl = vec2(hc*hd.x - hs*hd.y, hs*hd.x + hc*hd.y);
        if (uHole.z > 0. && abs(hl.x) < uHole.z && abs(hl.y) < uHole.w) discard;
        float rr = length(vWXZ);
        float nz = fbm(vWXZ*.18) * 3.2 + fbm(vWXZ*.9) * .8;
        gMask = smoothstep(uIn, uOut, rr + nz - 1.6);
        // plaques de mousse dans les joints, même au centre
        float moss = smoothstep(.62, .78, fbm(vWXZ*.32 + 7.)) * .55;
        gMask = max(gMask, moss * smoothstep(5., 14., rr));
        vec2 uvB = vWXZ * .22;
        vec4 cA = texture2D(map, vMapUv);
        vec4 cB = texture2D(uMapB, uvB);
        // assombrit et réchauffe légèrement la pierre au contact de l'humus (humidité)
        cA.rgb *= mix(1., .72, smoothstep(.0, .5, gMask));
        diffuseColor *= mix(cA, cB, gMask);`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        vec4 texelRoughness = mix(texture2D(roughnessMap, vRoughnessMapUv), texture2D(uArmB, uvB), gMask);
        roughnessFactor *= texelRoughness.g;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nA = texture2D(normalMap, vNormalMapUv).xyz * 2. - 1.;
        vec3 nB = texture2D(uNorB, uvB).xyz * 2. - 1.;
        vec3 mapN = normalize(mix(nA, nB, gMask));
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);`);
  };
  m.customProgramCacheKey = () => 'ground';
  return m;
}

// ---------- eau ----------
/** Cascade : ruban d'eau qui défile, écume blanche, bords effilochés. */
export function waterfallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: U.time }]),
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        float x = vUv.x, y = vUv.y;
        float speed = uTime * 1.6;
        float streaks = fbm(vec2(x*18., y*2.2 + speed*1.8));
        float fine = vnoise(vec2(x*60., y*7. + speed*3.2));
        float edge = smoothstep(0., .16, x) * smoothstep(1., .84, x);
        edge *= smoothstep(-.2, .5, fbm(vec2(x*6., y*1.5 + speed)) - abs(x-.5)*.9);
        float foam = smoothstep(.45, .85, streaks*.8 + fine*.35) + smoothstep(.12, 0., y) * .8;
        vec3 deep = vec3(.32, .55, .58), white = vec3(.92, .97, 1.);
        vec3 col = mix(deep, white, clamp(foam, 0., 1.));
        float a = edge * (.55 + foam * .45);
        gl_FragColor = vec4(col * 1.25, a);
        #include <fog_fragment>
      }`,
  });
}

/** Normale d'eau tuilable générée au canvas (aucun fichier). */
export function waterNormals(): THREE.CanvasTexture {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!, img = x.createImageData(S, S);
  const h = new Float32Array(S * S);
  for (let k = 0; k < 9; k++) {
    const fx = 1 + Math.floor(Math.random() * 5), fy = 1 + Math.floor(Math.random() * 5), ph = Math.random() * 6.28, a = 1 / (1 + k * .6);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) h[j * S + i] += Math.sin((i / S * fx + j / S * fy) * Math.PI * 2 + ph) * a;
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = h[j * S + (i + 1) % S] - h[j * S + (i + S - 1) % S];
    const dy = h[((j + 1) % S) * S + i] - h[((j + S - 1) % S) * S + i];
    const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
    const o = (j * S + i) * 4;
    img.data[o] = (n.x * .5 + .5) * 255; img.data[o + 1] = (n.y * .5 + .5) * 255; img.data[o + 2] = (n.z * .5 + .5) * 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- lumière ----------
/** Faisceau de soleil à travers la canopée : volume additif, poussière qui bouge, bords doux. */
export function shaftMaterial(color: string, strength = 1) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: U.time, uCol: { value: new THREE.Color(color) }, uStr: { value: strength } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime, uStr; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main(){
        float rim = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float len = smoothstep(0., .25, vUv.y) * smoothstep(1., .55, vUv.y);
        float dust = .65 + .35 * fbm(vec2(vUv.x*7. + uTime*.05, vUv.y*3. - uTime*.12));
        gl_FragColor = vec4(uCol * rim * len * dust * .16 * uStr, 1.);
      }`,
  });
}

/** Flamme : billboard procédural, langues de feu qui montent, cœur blanc. */
export function flameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: U.time, uSeed: { value: Math.random() * 10 } },
    vertexShader: `varying vec2 vUv;
      void main(){ vUv = uv;
        vec4 c = modelViewMatrix * vec4(0.,0.,0.,1.);
        vec2 s = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        c.xy += (uv - vec2(.5, .1)) * s;
        gl_Position = projectionMatrix * c; }`,
    fragmentShader: `uniform float uTime, uSeed; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 p = vUv; float t = uTime*2.4 + uSeed;
        float n = fbm(vec2(p.x*4., p.y*3. - t)) ;
        float shape = 1. - smoothstep(.0, .42 - p.y*.32 + n*.16, abs(p.x - .5 + (n-.5)*.18*p.y));
        shape *= smoothstep(1., .25, p.y + n*.25) * smoothstep(0., .08, p.y);
        vec3 col = mix(vec3(1., .32, .05), vec3(1., .78, .32), smoothstep(.15, .7, shape));
        col = mix(col, vec3(1., .97, .85), smoothstep(.75, 1., shape));
        gl_FragColor = vec4(col * shape * 2.6, 1.);
      }`,
  });
}

// ---------- particules ----------
/** Nuage de points lumineux (lucioles, poussière dans les rayons, braises).
 *  Chaque point a sa phase : il clignote et dérive à son rythme. */
export function glowPoints(n: number, place: (i: number) => [number, number, number], o: {
  color: string; size: number; blink?: number; drift?: number; rise?: number; height?: number;
}) {
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = place(i); pos.set(p, i * 3); ph[i] = Math.random() * 100; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: U.time, uCol: { value: new THREE.Color(o.color) }, uSize: { value: o.size },
      uBlink: { value: o.blink ?? 0 }, uDrift: { value: o.drift ?? .3 }, uRise: { value: o.rise ?? 0 }, uH: { value: o.height ?? 8 },
      uPR: { value: Math.min(devicePixelRatio, 2) },
    },
    vertexShader: `attribute float phase; uniform float uTime, uSize, uBlink, uDrift, uRise, uH, uPR; varying float vA;
      void main(){
        vec3 p = position; float t = uTime + phase;
        p.x += sin(t*.7)*uDrift; p.z += cos(t*.53)*uDrift;
        if (uRise > 0.) p.y = position.y + mod(t*uRise, uH);
        else p.y += sin(t*.9)*uDrift*.5;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        gl_Position = projectionMatrix*mv;
        float b = mix(1., pow(max(sin(t*2.1),0.), 6.), uBlink);
        vA = b * (uRise > 0. ? (1. - mod(t*uRise, uH)/uH) : 1.);
        gl_PointSize = uSize * uPR * (300. / -mv.z) * (.6 + .4*b);
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d); a *= a;
        gl_FragColor = vec4(uCol * a * vA * 1.6, 1.); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

// ---------- textures de feuilles dessinées ----------
type LeafKind = 'broad' | 'palm' | 'cluster' | 'heart' | 'banana';
const leafCache = new Map<string, THREE.CanvasTexture>();

/** Feuilles peintes au canvas : nervures, dégradé, bords. Le canal alpha fait la découpe. */
export function leafTexture(kind: LeafKind, hue = 0): THREE.CanvasTexture {
  const key = kind + hue;
  const hit = leafCache.get(key);
  if (hit) return hit;
  const W = 512, H = kind === 'palm' || kind === 'banana' ? 1024 : 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const base = new THREE.Color().setHSL(.27 + hue, .62, .26), light = new THREE.Color().setHSL(.24 + hue, .6, .42);
  const col = (cc: THREE.Color, a = 1) => `rgba(${cc.r * 255 | 0},${cc.g * 255 | 0},${cc.b * 255 | 0},${a})`;
  const R = () => Math.random();

  const blade = (cx: number, cy: number, len: number, wid: number, ang: number, tear = 0) => {
    x.save(); x.translate(cx, cy); x.rotate(ang);
    const g = x.createLinearGradient(-wid, 0, wid, 0);
    g.addColorStop(0, col(base)); g.addColorStop(.5, col(light)); g.addColorStop(1, col(base));
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, 0);
    x.bezierCurveTo(wid, -len * .25, wid * .8, -len * .75, 0, -len);
    x.bezierCurveTo(-wid * .8, -len * .75, -wid, -len * .25, 0, 0);
    x.fill();
    // nervure centrale + secondaires
    x.strokeStyle = col(new THREE.Color().setHSL(.2 + hue, .45, .55), .55); x.lineWidth = Math.max(1.2, wid * .06);
    x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -len); x.stroke();
    x.lineWidth = Math.max(.6, wid * .025); x.globalAlpha = .4;
    for (let k = 1; k < 9; k++) {
      const yy = -len * k / 10, w = wid * Math.sin(Math.PI * k / 10) * .9;
      x.beginPath(); x.moveTo(0, yy); x.quadraticCurveTo(w * .5, yy - len * .03, w, yy - len * .07); x.stroke();
      x.beginPath(); x.moveTo(0, yy); x.quadraticCurveTo(-w * .5, yy - len * .03, -w, yy - len * .07); x.stroke();
    }
    x.globalAlpha = 1;
    if (tear) {                     // déchirures (bananier, monstera)
      x.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < tear; k++) {
        const yy = -len * (.15 + R() * .7), side = R() < .5 ? -1 : 1;
        x.beginPath(); x.moveTo(side * wid * 1.1, yy); x.lineTo(side * wid * .12, yy - len * .02); x.lineTo(side * wid * 1.1, yy - len * .045); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
    }
    x.restore();
  };

  if (kind === 'broad') {
    blade(W / 2, H * .98, H * .95, W * .42, 0, 7);
    // trous de monstera
    x.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1, yy = H * (.3 + (k >> 1) * .2);
      x.beginPath(); x.ellipse(W / 2 + side * W * .2, yy, W * .045, H * .028, side * .5, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  } else if (kind === 'banana') {
    blade(W / 2, H * .99, H * .97, W * .3, 0, 14);
  } else if (kind === 'heart') {
    for (let k = 0; k < 1; k++) blade(W / 2, H * .95, H * .9, W * .45, 0);
  } else if (kind === 'palm') {
    // palme : rachis + folioles tombantes
    x.strokeStyle = col(new THREE.Color().setHSL(.15 + hue, .4, .32)); x.lineWidth = 10;
    x.beginPath(); x.moveTo(W / 2, H); x.quadraticCurveTo(W / 2 + 10, H * .5, W / 2, 0); x.stroke();
    for (let k = 0; k < 34; k++) {
      const t = k / 34, yy = H * (1 - t * .97), L = W * .48 * Math.sin(Math.PI * Math.min(1, t * 1.1 + .05));
      for (const s of [-1, 1]) blade(W / 2, yy, L, 13, s * (1.15 - t * .35) + (R() - .5) * .12);
    }
  } else {
    // grappe de feuilles pour la canopée : beaucoup de petites feuilles superposées
    for (let k = 0; k < 46; k++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * W * .36;
      const cx = W / 2 + Math.cos(a) * r, cy = H / 2 + Math.sin(a) * r;
      base.setHSL(.25 + hue + (R() - .5) * .05, .55 + R() * .15, .17 + R() * .14);
      light.setHSL(.24 + hue, .6, base.getHSL({ h: 0, s: 0, l: 0 }).l + .14);
      blade(cx, cy, 70 + R() * 70, 20 + R() * 16, a + Math.PI / 2 + (R() - .5));
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  leafCache.set(key, t);
  return t;
}

/** Plan de feuille courbé (la feuille ploie sous son poids) — base en bas, pointe en haut. */
export function leafGeometry(w: number, h: number, droop = .35, curl = .15) {
  const g = new THREE.PlaneGeometry(w, h, 2, 6);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h, xx = p.getX(i) / (w / 2);
    p.setZ(i, droop * h * y * y + curl * w * xx * xx);
  }
  g.computeVertexNormals();
  return g;
}
