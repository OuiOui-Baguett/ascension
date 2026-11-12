// ============================================================
// Boîte à outils : géométries à UV en mètres, matériaux nobles, textures peintes
// sur canvas (néons, fenêtres, moquette, tapis de jeu, rouleaux de machines…).
// ============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const U = { time: { value: 0 } };
const tickers: ((t: number, dt: number) => void)[] = [];
export function onTick(f: (t: number, dt: number) => void) { tickers.push(f); return f; }
export function clearTicks() { tickers.length = 0; }
export function tickAll(t: number, dt: number) { U.time.value = t; for (const f of tickers) f(t, dt); }

export const rnd = (() => { let s = 20240611; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

// ---------- géométrie ----------
/** UV planaires en coordonnées monde : une texture de `tile` mètres se répète sans étirement. */
export function worldUV(g: THREE.BufferGeometry, tile = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, tile = 0, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  if (tile) worldUV(g, tile);
  return g;
}
export function cyl(rt: number, rb: number, h: number, x = 0, y = 0, z = 0, seg = 24) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}
const strip = (g: THREE.BufferGeometry) => {
  const keep = ['position', 'normal', 'uv'];
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
};
/** Fusionne des géométries en un seul maillage (un seul appel de rendu). */
export function mesh(geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) {
  const g = mergeGeometries(geos.map(strip), false)!;
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = shadow;
  return m;
}

// ---------- matériaux ----------
export const MAT = {
  gold: () => new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 1, roughness: .26 }),
  brass: () => new THREE.MeshStandardMaterial({ color: '#b58a46', metalness: 1, roughness: .34 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: '#e8e8ec', metalness: 1, roughness: .1 }),
  blackMetal: () => new THREE.MeshStandardMaterial({ color: '#121214', metalness: .8, roughness: .45 }),
  glass: () => new THREE.MeshStandardMaterial({ color: '#06080c', metalness: .95, roughness: .04 }),
  lacquer: (c: string, rough = .32) => new THREE.MeshPhysicalMaterial({ color: c, metalness: .25, roughness: rough, clearcoat: 1, clearcoatRoughness: .08 }),
  matte: (c: string, rough = .9) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }),
};

/** Matériau lumineux HDR (dépasse 1 → capté par le halo). */
export function glowMat(color: string, power: number, o: Partial<THREE.MeshBasicMaterialParameters> = {}) {
  const c = new THREE.Color(color).multiplyScalar(power);
  return new THREE.MeshBasicMaterial({ color: c, ...o });
}

// ---------- textures canvas ----------
export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
  o: { srgb?: boolean; repeat?: boolean; mip?: boolean } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Texte néon : tube blanc chaud au centre, halo coloré autour, fond transparent. */
export function neonTex(text: string, font: string, color: string, w = 1024, h = 256, o: { tube?: number; spacing?: number; script?: boolean } = {}) {
  return canvasTex(w, h, (c) => {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = font;
    if (o.spacing) (c as any).letterSpacing = o.spacing + 'px';
    const lw = o.tube ?? 6;
    for (const [blur, width, col, a] of [[40, lw * 3, color, .55], [16, lw * 1.6, color, .9], [4, lw * .6, '#fff6ea', 1]] as const) {
      c.shadowColor = col; c.shadowBlur = blur; c.globalAlpha = a;
      c.strokeStyle = col; c.lineWidth = width; c.lineJoin = 'round';
      c.strokeText(text, w / 2, h / 2 + 4);
    }
    c.globalAlpha = .25; c.fillStyle = color; c.shadowBlur = 0;
    c.fillText(text, w / 2, h / 2 + 4);
  }, { mip: true });
}

export function neonPlane(tex: THREE.Texture, width: number, height: number, color: string, power: number) {
  const m = new THREE.MeshBasicMaterial({
    map: tex, color: new THREE.Color(color).multiplyScalar(power), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(width, height), m);
  p.userData.base = power; p.userData.color = color;
  return p;
}

/** Halo doux (texture radiale) — sert aux ampoules, réverbères, bokeh. */
let glowT: THREE.Texture | null = null;
export function glowTex() {
  return glowT ??= canvasTex(128, 128, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.55)');
    g.addColorStop(.45, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
  });
}
export function halo(color: string, power: number, size: number) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color: new THREE.Color(color).multiplyScalar(power), blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, fog: false,
  }));
  s.scale.setScalar(size);
  return s;
}

/** Halos en nombre, un seul appel de rendu (billboards instanciés). */
export function glows(points: THREE.Vector3[], color: string, size: number, power: number) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const a = new Float32Array(points.length * 3);
  points.forEach((p, i) => p.toArray(a, i * 3));
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 3));
  g.instanceCount = points.length;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { map: { value: glowTex() }, uCol: { value: new THREE.Color(color).multiplyScalar(power) }, uS: { value: size } },
    vertexShader: `attribute vec3 aP; uniform float uS; varying vec2 vUv;
      void main(){ vUv = uv; vec4 c = viewMatrix * vec4(aP, 1.0); c.xy += position.xy * uS; gl_Position = projectionMatrix * c; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uCol; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).r; gl_FragColor = vec4(uCol * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  m.frustumCulled = false;
  return m;
}

/** Guirlande d'ampoules à chenillard : un seul appel de rendu pour des centaines d'ampoules. */
export function bulbs(points: THREE.Vector3[], color: string, o: { size?: number; speed?: number; period?: number; power?: number } = {}) {
  const g = new THREE.IcosahedronGeometry(o.size ?? .07, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uCol: { value: new THREE.Color(color) }, uSpeed: { value: o.speed ?? 3 },
      uPer: { value: o.period ?? 4 }, uPow: { value: o.power ?? 9 } },
    vertexShader: /* glsl */`
      varying float vOn; varying vec3 vN;
      uniform float uTime, uSpeed, uPer;
      void main(){
        float i = float(gl_InstanceID);
        vOn = step(.5, fract((i - uTime * uSpeed) / uPer)) * .85 + .15;
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vOn; varying vec3 vN; uniform vec3 uCol; uniform float uPow;
      void main(){ float rim = .55 + .45 * abs(vN.z); gl_FragColor = vec4(uCol * uPow * vOn * rim, 1.0); }`,
  });
  const im = new THREE.InstancedMesh(g, mat, points.length);
  const m4 = new THREE.Matrix4();
  points.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  im.frustumCulled = false;
  return im;
}

/** Fenêtres d'immeuble : vitre sombre + intérieurs éclairés au hasard (chaud, froid, télé). */
export function windowsTex(cols: number, rows: number, litRatio: number, seed: number) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return canvasTex(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const px = x * cw + cw * .2, py = y * ch + ch * .18, ww = cw * .6, hh = ch * .62;
      const lit = r() < litRatio;
      if (lit) {
        const k = r();
        const col = k < .62 ? ['#ffcf8a', '#c97a32'] : k < .82 ? ['#ffe6c4', '#b49270'] : ['#8fb3ff', '#2a3c86'];
        const g = c.createLinearGradient(0, py, 0, py + hh);
        g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
        c.fillStyle = g; c.fillRect(px, py, ww, hh);
        // rideaux, silhouettes de meubles
        c.fillStyle = 'rgba(40,10,5,.55)';
        if (r() < .7) { c.fillRect(px, py, ww * (.12 + r() * .2), hh); c.fillRect(px + ww * (.78 - r() * .15), py, ww, hh); }
        if (r() < .3) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(px + ww * .35, py + hh * .45, ww * .18, hh * .55); }
      } else {
        c.fillStyle = `rgb(${6 + r() * 6},${8 + r() * 6},${12 + r() * 8})`; c.fillRect(px, py, ww, hh);
      }
      c.fillStyle = '#0a0a0a'; c.fillRect(px + ww / 2 - 1.5, py, 3, hh); c.fillRect(px, py + hh * .4, ww, 3);
      c.strokeStyle = '#1a1714'; c.lineWidth = 4; c.strokeRect(px - 2, py - 2, ww + 4, hh + 4);
    }
  });
}

/** Grande fenêtre cintrée du casino : salle dorée, lustre, rideaux de velours. */
export function archWindowTex() {
  return canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.save();
    c.beginPath(); c.moveTo(0, h); c.lineTo(0, w / 2); c.arc(w / 2, w / 2, w / 2, Math.PI, 0); c.lineTo(w, h); c.closePath(); c.clip();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffd9a0'); g.addColorStop(.45, '#e09040'); g.addColorStop(1, '#5a2410');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const rg = c.createRadialGradient(w / 2, h * .28, 4, w / 2, h * .28, w * .55);
    rg.addColorStop(0, 'rgba(255,250,230,1)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
    // rideaux drapés
    for (const side of [0, 1]) {
      const cg = c.createLinearGradient(side ? w : 0, 0, side ? w * .62 : w * .38, 0);
      cg.addColorStop(0, '#2a0306'); cg.addColorStop(.7, '#7a0d14'); cg.addColorStop(1, 'rgba(120,10,20,0)');
      c.fillStyle = cg;
      c.beginPath();
      if (!side) { c.moveTo(0, 0); c.lineTo(w * .4, 0); c.quadraticCurveTo(w * .12, h * .45, w * .3, h); c.lineTo(0, h); }
      else { c.moveTo(w, 0); c.lineTo(w * .6, 0); c.quadraticCurveTo(w * .88, h * .45, w * .7, h); c.lineTo(w, h); }
      c.fill();
    }
    // croisillons
    c.fillStyle = '#1a0f06';
    for (let i = 1; i < 3; i++) c.fillRect(w * i / 3 - 3, 0, 6, h);
    for (let i = 1; i < 5; i++) c.fillRect(0, h * i / 5 - 3, w, 6);
    c.restore();
  });
}

/** Papier peint damassé bordeaux et or. */
export function damaskTex(base = '#3d0a10') {
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(214,160,80,.32)'; c.fillStyle = 'rgba(214,160,80,.16)'; c.lineWidth = 2.5;
    const motif = (x: number, y: number, s: number) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      for (const m of [1, -1]) {
        c.save(); c.scale(m, 1);
        c.beginPath(); c.moveTo(0, -60); c.bezierCurveTo(30, -40, 40, -10, 12, 8); c.bezierCurveTo(36, 20, 30, 50, 0, 62);
        c.stroke(); c.fill();
        c.beginPath(); c.arc(22, -18, 7, 0, 7); c.stroke();
        c.restore();
      }
      c.beginPath(); c.ellipse(0, 0, 6, 16, 0, 0, 7); c.fill();
      c.restore();
    };
    motif(w / 2, h / 2, 1); motif(0, 0, .8); motif(w, 0, .8); motif(0, h, .8); motif(w, h, .8);
  }, { repeat: true });
}

/** Moquette de casino : fond pourpre, médaillons or et sarcelle, motif dense. */
export function carpetTex(p = { base: '#4a0b16', a: '#1d4d4f', b: '#6e1020', gold: '#d6a542' }) {
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = p.base; c.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const cx = x * s + s / 2, cy = y * s + s / 2;
      c.save(); c.translate(cx, cy);
      c.fillStyle = p.a; c.beginPath(); c.moveTo(0, -s * .46); c.lineTo(s * .46, 0); c.lineTo(0, s * .46); c.lineTo(-s * .46, 0); c.fill();
      c.fillStyle = p.b; c.beginPath(); c.moveTo(0, -s * .36); c.lineTo(s * .36, 0); c.lineTo(0, s * .36); c.lineTo(-s * .36, 0); c.fill();
      c.strokeStyle = p.gold; c.lineWidth = 3;
      for (let k = 0; k < 8; k++) {
        c.rotate(Math.PI / 4);
        c.beginPath(); c.ellipse(0, -s * .2, s * .05, s * .13, 0, 0, 7); c.stroke();
      }
      c.fillStyle = '#e8b851'; c.beginPath(); c.arc(0, 0, s * .07, 0, 7); c.fill();
      c.fillStyle = p.gold;
      for (const [dx, dy] of [[.5, 0], [-.5, 0], [0, .5], [0, -.5]]) { c.beginPath(); c.arc(dx * s, dy * s, s * .05, 0, 7); c.fill(); }
      c.restore();
    }
    // grain de laine
    const img = c.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) { const k = (Math.random() - .5) * 26; img.data[i] += k; img.data[i + 1] += k; img.data[i + 2] += k; }
    c.putImageData(img, 0, 0);
  }, { repeat: true });
}

function feltBase(c: CanvasRenderingContext2D, w: number, h: number, col = '#0f5a34') {
  c.fillStyle = col; c.fillRect(0, 0, w, h);
  const img = c.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) { const k = (Math.random() - .5) * 14; img.data[i] += k; img.data[i + 1] += k; img.data[i + 2] += k; }
  c.putImageData(img, 0, 0);
  const v = c.createRadialGradient(w / 2, h / 2, h * .1, w / 2, h / 2, w * .7);
  v.addColorStop(0, 'rgba(255,255,255,.06)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
}

/** Tapis de roulette : grille 3×12, zéro, mises extérieures. */
export function rouletteFeltTex() {
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  return canvasTex(1024, 512, (c, w, h) => {
    feltBase(c, w, h);
    const x0 = 150, y0 = 90, cw = 60, ch = 80;
    c.strokeStyle = 'rgba(240,235,220,.9)'; c.lineWidth = 3; c.font = 'bold 30px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 - 70, y0 + ch * 1.5); c.lineTo(x0, y0 + ch * 3); c.stroke();
    c.fillStyle = '#e8e4d8'; c.fillText('0', x0 - 30, y0 + ch * 1.5);
    for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      const x = x0 + col * cw, y = y0 + row * ch;
      c.strokeRect(x, y, cw, ch);
      c.fillStyle = RED.has(n) ? '#b3121e' : '#141414';
      c.beginPath(); c.ellipse(x + cw / 2, y + ch / 2, 22, 28, 0, 0, 7); c.fill();
      c.fillStyle = '#f2ede0'; c.fillText(String(n), x + cw / 2, y + ch / 2 + 1);
    }
    c.font = 'bold 26px Georgia';
    const labels = ['1–18', 'PAIR', '◆', '◆', 'IMPAIR', '19–36'];
    labels.forEach((l, i) => {
      const x = x0 + i * cw * 2, y = y0 + ch * 3;
      c.strokeRect(x, y, cw * 2, 70);
      if (l === '◆') { c.fillStyle = i === 2 ? '#b3121e' : '#141414'; c.beginPath(); c.moveTo(x + cw, y + 12); c.lineTo(x + cw + 30, y + 35); c.lineTo(x + cw, y + 58); c.lineTo(x + cw - 30, y + 35); c.fill(); }
      else { c.fillStyle = '#f2ede0'; c.fillText(l, x + cw, y + 36); }
    });
    c.font = 'italic 22px Georgia'; c.fillStyle = 'rgba(240,220,170,.7)'; c.fillText('GRAND CASINO', w / 2 + 60, 46);
  });
}

/** Tapis de blackjack demi-lune. */
export function blackjackFeltTex() {
  return canvasTex(1024, 512, (c, w, h) => {
    feltBase(c, w, h, '#0d4f5a');
    c.strokeStyle = 'rgba(240,220,170,.85)'; c.lineWidth = 3;
    c.fillStyle = 'rgba(240,220,170,.9)'; c.textAlign = 'center';
    const cx = w / 2, cy = 0;
    const arc = (r: number, txt: string, size: number) => {
      c.save(); c.font = `bold ${size}px Georgia`; c.translate(cx, cy);
      const chars = txt.split(''); const total = chars.length * size * .62 / r;
      chars.forEach((ch, i) => { c.save(); c.rotate(Math.PI / 2 + total / 2 - (i + .5) * total / chars.length); c.translate(r, 0); c.rotate(-Math.PI / 2); c.fillText(ch, 0, 0); c.restore(); });
      c.restore();
    };
    c.save(); c.scale(1, 1);
    arc(250, 'BLACKJACK PAYE 3 POUR 2', 30);
    arc(205, 'LA BANQUE TIRE À 16 ET RESTE À 17', 18);
    c.restore();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (.18 + i * .16);
      const x = cx + Math.cos(a) * 380, y = cy + Math.sin(a) * 380;
      c.beginPath(); c.arc(x, y, 34, 0, 7); c.stroke();
    }
    c.font = 'italic 22px Georgia'; c.fillText('Assurance paye 2 pour 1', cx, 330);
  });
}

/** Cylindre de roulette vu de dessus : 37 cases. */
export function wheelTex() {
  const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  return canvasTex(1024, 1024, (c, w) => {
    const R = w / 2, n = ORDER.length, a = Math.PI * 2 / n;
    c.translate(R, R);
    // jante en bois verni
    const rim = c.createRadialGradient(0, 0, R * .8, 0, 0, R);
    rim.addColorStop(0, '#6b3a18'); rim.addColorStop(.6, '#8f5326'); rim.addColorStop(1, '#3a1d0c');
    c.fillStyle = rim; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
    // bande des numéros (extérieur) puis cases (intérieur), couleurs franches
    const col = (num: number, i: number) => num === 0 ? '#11a84f' : (i % 2 ? '#1c1c1c' : '#e0182a');
    ORDER.forEach((num, i) => {
      c.fillStyle = col(num, i);
      c.beginPath(); c.arc(0, 0, R * .93, i * a, (i + 1) * a); c.arc(0, 0, R * .5, (i + 1) * a, i * a, true); c.closePath(); c.fill();
      // reflet doux au centre de chaque case
      const g = c.createRadialGradient(Math.cos((i + .5) * a) * R * .66, Math.sin((i + .5) * a) * R * .66, 2, Math.cos((i + .5) * a) * R * .66, Math.sin((i + .5) * a) * R * .66, R * .12);
      g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fill();
      c.save(); c.rotate((i + .5) * a + Math.PI / 2); c.fillStyle = '#fff8e6'; c.font = 'bold 40px Georgia'; c.textAlign = 'center';
      c.fillText(String(num), 0, -R * .815); c.restore();
    });
    // séparateurs dorés et anneaux
    c.strokeStyle = '#f2c96a'; c.lineWidth = 5;
    for (let i = 0; i < n; i++) { c.beginPath(); c.moveTo(Math.cos(i * a) * R * .5, Math.sin(i * a) * R * .5); c.lineTo(Math.cos(i * a) * R * .93, Math.sin(i * a) * R * .93); c.stroke(); }
    for (const k of [.5, .755, .93]) { c.lineWidth = k === .755 ? 4 : 7; c.beginPath(); c.arc(0, 0, R * k, 0, 7); c.stroke(); }
    // cône central
    const cone = c.createRadialGradient(-R * .08, -R * .08, 4, 0, 0, R * .5);
    cone.addColorStop(0, '#c98a44'); cone.addColorStop(.7, '#6b3a18'); cone.addColorStop(1, '#3a1d0c');
    c.fillStyle = cone; c.beginPath(); c.arc(0, 0, R * .49, 0, 7); c.fill();
  });
}

/** Bande de rouleau de machine à sous : 8 symboles empilés. */
export function reelTex() {
  const sym = ['7', '🍒', 'BAR', '🔔', '♦', '🍋', '★', '$'];
  return canvasTex(128, 1024, (c, w, h) => {
    const s = h / sym.length;
    sym.forEach((k, i) => {
      const g = c.createLinearGradient(0, i * s, 0, i * s + s);
      g.addColorStop(0, '#f6f1e4'); g.addColorStop(.5, '#ffffff'); g.addColorStop(1, '#d9d2c0');
      c.fillStyle = g; c.fillRect(0, i * s, w, s);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (k === '7') { c.font = 'bold 96px Georgia'; c.fillStyle = '#c4101d'; c.fillText('7', w / 2, i * s + s / 2 + 6); }
      else if (k === 'BAR') { c.fillStyle = '#111'; c.fillRect(14, i * s + 40, 100, 48); c.fillStyle = '#f6f1e4'; c.font = 'bold 34px Arial'; c.fillText('BAR', w / 2, i * s + 65); }
      else if (k === '♦') { c.font = '90px Georgia'; c.fillStyle = '#1b5fd1'; c.fillText('♦', w / 2, i * s + s / 2 + 4); }
      else if (k === '★') { c.font = '86px Georgia'; c.fillStyle = '#d4a020'; c.fillText('★', w / 2, i * s + s / 2 + 4); }
      else if (k === '$') { c.font = 'bold 88px Georgia'; c.fillStyle = '#138a3c'; c.fillText('$', w / 2, i * s + s / 2 + 6); }
      else { c.font = '74px serif'; c.fillText(k, w / 2, i * s + s / 2 + 6); }
    });
  }, { repeat: true });
}

/** Fronton lumineux d'une machine à sous. */
export function topperTex(title: string, c1: string, c2: string) {
  return canvasTex(512, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c2); g.addColorStop(1, '#050208');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '92px Monoton'; c.shadowColor = c1; c.shadowBlur = 24; c.fillStyle = c1;
    c.fillText(title, w / 2, h * .46);
    c.shadowBlur = 0; c.font = 'bold 30px Georgia'; c.fillStyle = '#ffe9b0';
    c.fillText('★  MISE MAX 100 €  ★', w / 2, h * .82);
  });
}

/** Lettres dorées gravées sur plaque sombre (enseigne de la caisse). */
export function plaqueTex(title: string, sub: string) {
  return canvasTex(1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d0f08'); g.addColorStop(1, '#0b0503');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c99a45'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28);
    c.lineWidth = 2; c.strokeRect(26, 26, w - 52, h - 52);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const gg = c.createLinearGradient(0, 50, 0, 170);
    gg.addColorStop(0, '#fff2c4'); gg.addColorStop(.5, '#d9a441'); gg.addColorStop(1, '#8a5a1c');
    c.fillStyle = gg; c.font = '120px "Playfair Display"';
    (c as any).letterSpacing = '22px';
    c.fillText(title, w / 2 + 11, 112);
    (c as any).letterSpacing = '6px';
    c.font = 'italic 34px "Playfair Display"'; c.fillStyle = '#d9b46a'; c.fillText(sub, w / 2, 200);
  });
}

export function chipTex() {
  return canvasTex(256, 32, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.0)';
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e8e0d0'; c.fillRect(i * w / 8, 0, w / 16, h); }
  }, { repeat: true });
}
