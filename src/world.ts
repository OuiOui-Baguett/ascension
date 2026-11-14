// ============================================================
// L'île à l'écran : ciel, mer (vagues, écume sur le rivage, reflets), sable,
// palmiers, cabane, ponton, épave, feu de camp. Style cartoon : ombrage en
// aplats, couleurs franches, contours sombres sur les objets.
// ============================================================
import * as THREE from 'three';
import { shoreR, terrainH, SOLIDS, PALMS, PIER, HILL, type Solid } from '../shared/island';

const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

/** Dégradé d'ombrage en 3 paliers : le rendu « dessin animé ». */
export const TOON = (() => {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
export function toon(color: THREE.ColorRepresentation, o: THREE.MeshToonMaterialParameters & { flatShading?: boolean } = {}) {
  const { flatShading, ...rest } = o;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: TOON, ...rest });
  if (flatShading) (m as any).flatShading = true;      // facettes (le shader toon le gère)
  return m;
}

/** Contour sombre : une copie retournée, un peu plus grande (marche bien pour les formes bombées). */
export function outline(m: THREE.Mesh, k = .05, color = '#1b1530') {
  const o = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  o.scale.setScalar(1 + k); o.castShadow = false; o.receiveShadow = false;
  m.add(o); return o;
}
function shade(m: THREE.Object3D) { m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; }

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const planks = (base: string, dark: string, n: number, vertical = true) => canvasTex(256, 256, x => {
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) {
    const p = i * 256 / n;
    x.fillStyle = `rgba(0,0,0,${.04 + (i % 3) * .035})`;
    vertical ? x.fillRect(p, 0, 256 / n, 256) : x.fillRect(0, p, 256, 256 / n);
    x.fillStyle = dark; vertical ? x.fillRect(p, 0, 5, 256) : x.fillRect(0, p, 256, 5);
    x.fillStyle = 'rgba(0,0,0,.35)';
    for (let k = 0; k < 2; k++) { const q = (i * 97 + k * 131) % 256; vertical ? x.fillRect(p + 256 / n * .5, q, 4, 4) : x.fillRect(q, p + 256 / n * .5, 4, 4); }
  }
});

// ---------------------------------------------------------------
export interface World { update(t: number, dt: number): void; sun: THREE.DirectionalLight }

export function buildWorld(scene: THREE.Scene, quality: string): World {
  const anim: ((t: number, dt: number) => void)[] = [];
  const HORIZON = new THREE.Color('#bff3ff');
  scene.background = HORIZON.clone();
  scene.fog = new THREE.Fog(HORIZON, 70, 260);

  // ---------- ciel ----------
  const SUN = new THREE.Vector3(.55, .62, .35).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 sun; varying vec3 vD;
      void main(){
        float h = max(vD.y, 0.);
        vec3 c = mix(vec3(.75,.95,1.), vec3(.16,.52,.95), pow(h, .55));
        float s = max(dot(vD, sun), 0.);
        c += vec3(1.,.85,.55) * pow(s, 24.) * .55 + vec3(1.,.95,.8) * smoothstep(.9985, .9992, s) * 2.5;
        if (vD.y < 0.) c = vec3(.75,.95,1.);
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  scene.add(sky);

  // ---------- lumières ----------
  scene.add(new THREE.HemisphereLight('#c8f0ff', '#f2d29a', 1.25));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.copy(SUN).multiplyScalar(60);
  sun.castShadow = quality !== 'low';
  const sm = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 10, far: 130 });
  sun.shadow.bias = -.0006; sun.shadow.normalBias = .04;
  scene.add(sun, sun.target);

  // ---------- le sol de l'île (maillage polaire, facettes) ----------
  {
    const A = 120, RINGS = 46, pos: number[] = [], col: number[] = [];
    const ring = (i: number) => { const u = i / RINGS; return u < .75 ? u / .75 * .8 : .8 + (u - .75) / .25 * .62; };   // plus serré près du rivage
    const P: THREE.Vector3[][] = [], C: THREE.Color[][] = [];
    const sand = new THREE.Color('#f7dca4'), sand2 = new THREE.Color('#efcc8c'), wet = new THREE.Color('#d9b378'), grass = new THREE.Color('#79cf4b'), grass2 = new THREE.Color('#5cb33f'), rock = new THREE.Color('#a59a8e');
    for (let i = 0; i <= RINGS; i++) {
      P.push([]); C.push([]);
      for (let j = 0; j < A; j++) {
        const a = j / A * Math.PI * 2, R = shoreR(a), r = i === 0 ? 0 : R * ring(i) + (i < RINGS ? (rnd() - .5) * .25 : 0);
        const x = Math.cos(a) * r, z = Math.sin(a) * r, h = terrainH(x, z), d = r / R;
        P[i].push(new THREE.Vector3(x, h + (d < .95 && d > .05 ? (rnd() - .5) * .05 : 0), z));
        const hd = Math.hypot(x - HILL.x, z - HILL.z);
        let c = (rnd() < .5 ? sand : sand2).clone();
        if (d > .93) c = wet.clone().lerp(sand, Math.max(0, (1 - d) * 8));
        const g = Math.sin(x * .9 + 1) * Math.cos(z * .8) * .08;
        if (d < .6 + g || hd < 4.4) c = (rnd() < .5 ? grass : grass2).clone();
        if (hd < 4.6 && hd > 1.7) c = rock.clone().lerp(grass, rnd() * .25);
        C[i].push(c);
      }
    }
    for (let i = 0; i < RINGS; i++) for (let j = 0; j < A; j++) {
      const j2 = (j + 1) % A, a = P[i][j], b = P[i][j2], c = P[i + 1][j], d = P[i + 1][j2];
      const quad = [[a, c, b, C[i][j]], [b, c, d, C[i + 1][j2]]] as const;
      for (const [p1, p2, p3, cc] of quad) { for (const p of [p1, p2, p3]) { pos.push(p.x, p.y, p.z); col.push(cc.r, cc.g, cc.b); } }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon('#ffffff', { vertexColors: true, flatShading: true }));
    m.receiveShadow = true; scene.add(m);
  }

  // ---------- la mer ----------
  {
    const seg = quality === 'high' ? 220 : quality === 'medium' ? 150 : 90;
    const geo = new THREE.PlaneGeometry(520, 520, seg, seg); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, sun: { value: SUN }, fogC: { value: HORIZON } },
      vertexShader: `uniform float t; varying vec3 vW; varying float vH;
        void main(){
          vec3 p = position;
          float r = length(p.xz);
          float amp = .09 + .05 * smoothstep(20., 60., r);
          float h = sin(p.x*.35 + t*1.3)*amp + sin(p.z*.42 - t*1.1)*amp + sin((p.x+p.z)*.9 + t*2.2)*amp*.45;
          p.y += h; vH = h; vW = (modelMatrix * vec4(p,1.)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.);
        }`,
      fragmentShader: `uniform float t; uniform vec3 sun; uniform vec3 fogC; varying vec3 vW; varying float vH;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float a = atan(vW.z, vW.x), r = length(vW.xz);
          float R = 15.5 + 2.0*sin(3.*a+1.2) + 1.1*sin(5.*a+.4) + .6*sin(9.*a+2.);
          float d = r - R * .985;                       // distance au rivage (m)
          vec3 lagoon = vec3(.25,.92,.86), mid = vec3(.08,.66,.84), deep = vec3(.06,.38,.72), far = vec3(.05,.3,.62);
          vec3 c = mix(lagoon, mid, smoothstep(0., 4., d));
          c = mix(c, deep, smoothstep(4., 16., d));
          c = mix(c, far, smoothstep(30., 120., r));
          // motif de lumière au fond (eau claire près de l'île)
          float ca = noise(vW.xz*1.3 + vec2(t*.4, t*.3)) * noise(vW.xz*1.7 - vec2(t*.3, -t*.2));
          c += vec3(.6,1.,.9) * smoothstep(.32, .5, ca) * .22 * (1. - smoothstep(1., 7., d));
          // écume du rivage, qui respire
          float br = noise(vW.xz*2.2 + t*.6);
          float foam = smoothstep(.95, .2, d + .35*sin(t*1.6 + a*11.) + br*.55);
          // vagues qui arrivent vers la plage
          float wl = smoothstep(.93, 1., sin(d*1.5 + t*2.0 + br*1.5)) * (1. - smoothstep(1., 7., d)) * step(.0, d);
          c = mix(c, vec3(1.), clamp(max(foam, wl*.55), 0., 1.));
          // crêtes et éclats de soleil
          c += vec3(.9,1.,1.) * smoothstep(.13, .19, vH) * .25;
          float sp = step(.985, noise(vW.xz*6. + vec2(t*1.5, -t)) ) * smoothstep(60., 10., r);
          c += vec3(2.) * sp * .6;
          float f = smoothstep(70., 260., length(vW - cameraPosition));
          gl_FragColor = vec4(mix(c, fogC, f), 1.);
        }`,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = 0;
    scene.add(water);
    anim.push(t => { mat.uniforms.t.value = t; });
  }

  // ---------- palmiers ----------
  const trunkM = toon('#a8743f', { flatShading: true }), trunk2 = toon('#8b5d31', { flatShading: true });
  const leafM = toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  const nutM = toon('#6b4424');
  function frond(len: number) {
    const N = 9, pos: number[] = [], col: number[] = [], dark = new THREE.Color('#3f9e2c'), light = new THREE.Color('#8fe05a');
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push(new THREE.Vector3(u * len, Math.sin(u * 2.3) * .55 - u * u * 1.5, 0)); }
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, w0 = Math.sin(Math.PI * Math.min(1, u0 * 1.15)) * .5, w1 = Math.sin(Math.PI * Math.min(1, u1 * 1.15)) * .5;
      const a = pts[i], b = pts[i + 1];
      const tri = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3, cc: THREE.Color) => { for (const v of [p, q, s]) { pos.push(v.x, v.y, v.z); col.push(cc.r, cc.g, cc.b); } };
      const sp0 = a.clone().add(new THREE.Vector3(0, .07, 0)), sp1 = b.clone().add(new THREE.Vector3(0, .07, 0));
      const l0 = a.clone().add(new THREE.Vector3(0, -.05, w0)), l1 = b.clone().add(new THREE.Vector3(0, -.05, w1));
      const r0 = a.clone().add(new THREE.Vector3(0, -.05, -w0)), r1 = b.clone().add(new THREE.Vector3(0, -.05, -w1));
      const c = dark.clone().lerp(light, u0);
      tri(sp0, l0, sp1, c); tri(sp1, l0, l1, c); tri(sp0, sp1, r0, c.clone().multiplyScalar(.85)); tri(sp1, r1, r0, c.clone().multiplyScalar(.85));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); return g;
  }
  const frondG = [frond(2.6), frond(3.1), frond(2.2)];
  for (const [x, z, seed] of PALMS) {
    const g = terrainH(x, z), group = new THREE.Group(); group.position.set(x, g, z);
    const lean = new THREE.Vector3(Math.cos(seed), 0, Math.sin(seed));
    const H = 5.6, S = 9; let prev = new THREE.Vector3(0, 0, 0);
    for (let i = 1; i <= S; i++) {
      const u = i / S, p = new THREE.Vector3(lean.x * u * u * 1.6, u * H, lean.z * u * u * 1.6);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(.24 - u * .08, .3 - u * .08, p.distanceTo(prev) * 1.05, 7), i % 2 ? trunkM : trunk2);
      seg.position.copy(prev).add(p).multiplyScalar(.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(prev).normalize());
      group.add(seg); prev = p;
    }
    const crown = new THREE.Group(); crown.position.copy(prev); group.add(crown);
    for (let k = 0; k < 8; k++) {
      const f = new THREE.Mesh(frondG[k % 3], leafM); f.rotation.set(0, k / 8 * Math.PI * 2 + seed, (rnd() - .5) * .3); crown.add(f);
    }
    for (let k = 0; k < 3; k++) { const n = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), nutM); n.position.set(Math.cos(k * 2.1) * .22, -.2, Math.sin(k * 2.1) * .22); crown.add(n); }
    shade(group); scene.add(group);
    anim.push(t => { crown.rotation.z = Math.sin(t * .8 + seed) * .05; crown.rotation.x = Math.cos(t * .65 + seed) * .04; });
  }

  // ---------- rochers ----------
  const rockM = toon('#ffffff', { vertexColors: true, flatShading: true });
  function rockGeo(seed: number) {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position as THREE.BufferAttribute, cols: number[] = [];
    const k = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!k.has(key)) k.set(key, .82 + ((Math.sin(i * 12.9898 + seed) * 43758.5453) % 1 + 1) % 1 * .32);
      const s = k.get(key)!; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal as THREE.BufferAttribute, gray = new THREE.Color('#a49b92'), moss = new THREE.Color('#86b84c');
    for (let i = 0; i < p.count; i++) { const c = n.getY(i) > .75 ? moss : gray.clone().multiplyScalar(.85 + (i % 3) * .08); cols.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }
  for (const s of SOLIDS) {
    if (s.tag !== 'rocher' || s.k !== 'c') continue;
    const g = terrainH(s.x, s.z), m = new THREE.Mesh(rockGeo(s.x * 3 + s.z), rockM);
    m.scale.set(s.r * 1.05, s.top - g, s.r * 1.05); m.position.set(s.x, g, s.z); m.rotation.y = s.x;
    outline(m, .045); shade(m); scene.add(m);
  }
  // quelques galets au pied de la colline
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.28, r = 4.6 + rnd() * 1.2, x = HILL.x + Math.cos(a) * r, z = HILL.z + Math.sin(a) * r;
    const m = new THREE.Mesh(rockGeo(i), rockM); const s = .25 + rnd() * .35;
    m.scale.set(s, s * .7, s); m.position.set(x, terrainH(x, z), z); shade(m); scene.add(m);
  }

  // ---------- cabane, caisses ----------
  const woodTex = planks('#c98b4e', '#7a4a22', 7), deckTex = planks('#d9a066', '#86562b', 9, false), crateTex = canvasTex(128, 128, x => {
    x.fillStyle = '#d29a5a'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#7e4f24'; x.lineWidth = 12; x.strokeRect(6, 6, 116, 116);
    x.lineWidth = 10; x.beginPath(); x.moveTo(10, 10); x.lineTo(118, 118); x.stroke();
    x.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 4; i++) x.fillRect(12, 12 + i * 28, 104, 3);
  });
  const isBox = (s: Solid): s is Extract<Solid, { k: 'b' }> => s.k === 'b';
  for (const s of SOLIDS.filter(isBox)) {
    const w = s.x1 - s.x0, d = s.z1 - s.z0, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    if (s.tag === 'cabane') {
      const g = terrainH(cx, cz) - .3, h = s.top - g;
      const hut = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(w - .2, h - .15, d - .2), toon('#ffffff', { map: woodTex }));
      walls.position.set(cx, g + (h - .15) / 2, cz); outline(walls, .02); hut.add(walls);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + .3, .18, d + .3), toon('#ffffff', { map: deckTex }));
      roof.position.set(cx, s.top - .09, cz); outline(roof, .02); hut.add(roof);
      // porte et fenêtre (face au centre de l'île)
      const door = new THREE.Mesh(new THREE.PlaneGeometry(.9, 1.6), new THREE.MeshBasicMaterial({ color: '#3b2414' }));
      door.position.set(cx + w / 2 - .09, g + .95, cz + .4); door.rotation.y = Math.PI / 2; hut.add(door);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(.7, .55), new THREE.MeshBasicMaterial({ color: '#2a1a10' }));
      win.position.set(cx + w / 2 - .09, g + 1.55, cz - .8); win.rotation.y = Math.PI / 2; hut.add(win);
      // piquets et torches sur le toit
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .7, 6), trunk2);
        post.position.set(cx + ox * (w / 2 + .05), s.top + .35, cz + oz * (d / 2 + .05)); hut.add(post);
      }
      const torch = new THREE.Mesh(new THREE.ConeGeometry(.12, .3, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, .3) }));
      torch.position.set(cx + w / 2 + .05, s.top + .85, cz + d / 2 + .05); hut.add(torch);
      anim.push(t => { torch.scale.set(1, 1 + Math.sin(t * 17) * .2, 1); });
      shade(hut); scene.add(hut);
    } else if (s.tag.startsWith('caisse')) {
      const g = terrainH(cx, cz) - .2, h = s.top - g;
      const n = Math.round(h / 1);
      for (let i = 0; i < Math.max(1, s.tag === 'caisse2' ? 2 : 1); i++) {
        const hh = h / Math.max(1, s.tag === 'caisse2' ? 2 : 1);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), toon('#ffffff', { map: crateTex }));
        m.position.set(cx, g + hh * (i + .5), cz); m.rotation.y = i * .12; outline(m, .03); shade(m); scene.add(m);
      }
      void n;
    } else if (s.tag === 'ponton') {
      const deck = new THREE.Group(), N = Math.round(d / .45);
      for (let i = 0; i < N; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(w, .12, .4), toon(i % 2 ? '#c88d55' : '#b77d48'));
        p.position.set(cx + (rnd() - .5) * .05, s.top - .06, s.z0 + (i + .5) * d / N); p.rotation.y = (rnd() - .5) * .04; deck.add(p);
      }
      for (let i = 0; i <= Math.floor(d / 2.2); i++) for (const ox of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, 3.6, 7), trunk2);
        post.position.set(cx + ox * (w / 2 - .05), s.top - 1.75, s.z0 + .3 + i * 2.2); deck.add(post);
      }
      // lanterne au bout
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1.6, 6), trunk2); pole.position.set(cx + w / 2 - .15, s.top + .8, s.z0 + .3); deck.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.4, 1) }));
      lamp.position.set(cx + w / 2 - .15, s.top + 1.65, s.z0 + .3); deck.add(lamp);
      shade(deck); scene.add(deck);
    }
  }

  // ---------- feu de camp ----------
  {
    const f = SOLIDS.find(s => s.tag === 'feu')! as Extract<Solid, { k: 'c' }>, g = terrainH(f.x, f.z), grp = new THREE.Group();
    grp.position.set(f.x, g, f.z);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, st = new THREE.Mesh(new THREE.DodecahedronGeometry(.17), toon('#8d8580', { flatShading: true }));
      st.position.set(Math.cos(a) * .62, .08, Math.sin(a) * .62); st.rotation.set(rnd(), rnd(), rnd()); grp.add(st);
    }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .9, 6), trunk2); l.rotation.set(Math.PI / 2 - .25, i * 2.1, 0); l.position.y = .15; grp.add(l); }
    const flames: THREE.Mesh[] = [];
    [[new THREE.Color(4, 1.3, .2), .28, .9], [new THREE.Color(4.5, 2.6, .5), .18, .62], [new THREE.Color(5, 4, 2), .09, .36]].forEach(([c, r, h]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r as number, h as number, 8, 1, true), new THREE.MeshBasicMaterial({ color: c as THREE.Color, transparent: true, opacity: .92, depthWrite: false, side: THREE.DoubleSide }));
      m.position.y = .2 + (h as number) / 2; grp.add(m); flames.push(m);
    });
    const light = new THREE.PointLight('#ff9a3c', 5, 9, 1.6); light.position.y = .8; grp.add(light);
    anim.push(t => {
      flames.forEach((m, i) => { m.scale.set(1 + Math.sin(t * 13 + i) * .1, 1 + Math.sin(t * 19 + i * 2) * .18, 1 + Math.cos(t * 11 + i) * .1); m.rotation.y = t * (1 + i); });
      light.intensity = 4.5 + Math.sin(t * 23) * .8 + Math.sin(t * 7) * .5;
    });
    shade(grp); flames.forEach(m => { m.castShadow = false; }); scene.add(grp);
  }

  // ---------- drapeau au sommet de la colline ----------
  {
    const g = terrainH(HILL.x, HILL.z), pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 3.2, 6), toon('#e8e2d0'));
    pole.position.set(HILL.x + .8, g + 1.6, HILL.z + .5); shade(pole); scene.add(pole);
    const fg = new THREE.PlaneGeometry(1.4, .85, 10, 1), flag = new THREE.Mesh(fg, toon('#ff4d5a', { side: THREE.DoubleSide }));
    flag.position.set(HILL.x + .8 + .7, g + 2.75, HILL.z + .5); scene.add(flag);
    const base = (fg.attributes.position.array as Float32Array).slice();
    anim.push(t => {
      const p = fg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setZ(i, Math.sin(x * 4 - t * 6) * .12 * (x + .7)); }
      p.needsUpdate = true;
    });
  }

  // ---------- buissons, coquillages, étoiles de mer ----------
  const bushM = toon('#5fbf3e', { flatShading: true }), bush2 = toon('#4aa534', { flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.28, r = 2 + rnd() * 8, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (SOLIDS.some(s => s.k === 'c' ? Math.hypot(s.x - x, s.z - z) < s.r + 1 : x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1)) continue;
    if (Math.hypot(x - HILL.x, z - HILL.z) < 5) continue;
    const grp = new THREE.Group(); grp.position.set(x, terrainH(x, z), z);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.35 + rnd() * .2, 0), k % 2 ? bushM : bush2); b.position.set((rnd() - .5) * .6, .25, (rnd() - .5) * .6); grp.add(b); }
    shade(grp); scene.add(grp);
  }
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? .07 : .18; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(r, 0); }
  const starG = new THREE.ShapeGeometry(starShape); starG.rotateX(-Math.PI / 2);
  for (let i = 0; i < 10; i++) {
    const a = rnd() * 6.28, R = shoreR(a) * (.84 + rnd() * .1), x = Math.cos(a) * R, z = Math.sin(a) * R;
    const m = new THREE.Mesh(starG, toon(i % 2 ? '#ff7a59' : '#ffb347', { side: THREE.DoubleSide }));
    m.position.set(x, terrainH(x, z) + .02, z); m.rotation.y = rnd() * 6; m.scale.setScalar(.8 + rnd() * .6); scene.add(m);
  }

  // ---------- l'épave au large ----------
  {
    const a = .75, r = shoreR(a) + 11, grp = new THREE.Group();
    grp.position.set(Math.cos(a) * r, -.6, Math.sin(a) * r); grp.rotation.set(.18, -a + 1.2, .32);
    const hullG = new THREE.CylinderGeometry(1.6, 1.6, 7, 12, 1, true, 0, Math.PI); hullG.rotateZ(Math.PI / 2); hullG.rotateX(Math.PI);
    const hull = new THREE.Mesh(hullG, toon('#6e4526', { side: THREE.DoubleSide, flatShading: true })); grp.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, .12, 2.8), toon('#8a5a33')); deck.position.y = .05; grp.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.13, .16, 5, 7), trunk2); mast.position.set(.6, 2.4, 0); mast.rotation.z = -.35; grp.add(mast);
    const sailG = new THREE.PlaneGeometry(2.2, 2.4, 6, 6), sp = sailG.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) < -.8) sp.setY(i, sp.getY(i) + Math.sin(sp.getX(i) * 7) * .3);
    const sail = new THREE.Mesh(sailG, toon('#f3ead2', { side: THREE.DoubleSide })); sail.position.set(1.2, 3, .1); sail.rotation.z = -.35; grp.add(sail);
    shade(grp); scene.add(grp);
    anim.push(t => { grp.position.y = -.6 + Math.sin(t * .7) * .06; });
  }

  // ---------- îlots lointains et nuages ----------
  for (let i = 0; i < 4; i++) {
    const a = 1.2 + i * 1.55 + rnd(), r = 110 + rnd() * 60, grp = new THREE.Group();
    grp.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(8 + rnd() * 8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon('#5fae4a', { flatShading: true }));
    hill.scale.y = .35 + rnd() * .3; grp.add(hill);
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(hill.geometry.parameters.radius * 1.15, hill.geometry.parameters.radius * 1.2, .6, 14), toon('#f2d59e')); grp.add(beach);
    scene.add(grp);
  }
  const cloudM = toon('#ffffff', { flatShading: true });
  for (let i = 0; i < 12; i++) {
    const grp = new THREE.Group(), a = rnd() * 6.28, r = 130 + rnd() * 110;
    grp.position.set(Math.cos(a) * r, 34 + rnd() * 36, Math.sin(a) * r);
    for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + rnd() * 5, 1), cloudM); c.position.set((k - 2) * 5.5 + rnd() * 2, rnd() * 3, rnd() * 4); c.scale.y = .7; grp.add(c); }
    scene.add(grp);
    const sp = .004 + rnd() * .004;
    anim.push((_t, dt) => { grp.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), sp * dt); });
  }

  return { sun, update: (t, dt) => { for (const f of anim) f(t, dt); } };
}
