// ============================================================
// L'île : relief, obstacles, points d'apparition. Partagé entre le serveur
// (physique, chute dans l'eau) et la page (dessin) : les deux voient la même île.
// ============================================================

/** Sous cette hauteur des pieds, on est dans l'eau profonde : éjecté. */
export const DROWN_Y = -0.9;

/** Rayon du rivage selon l'angle (côte découpée). */
export function shoreR(a: number) {
  return 15.5 + 2.0 * Math.sin(3 * a + 1.2) + 1.1 * Math.sin(5 * a + 0.4) + 0.6 * Math.sin(9 * a + 2);
}
const ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** La colline rocheuse (point haut de l'île). */
export const HILL = { x: 6, z: -5.5, h: 2.7 };

/** Hauteur du sol (sable, dune, colline ; sous l'eau au-delà du rivage). */
export function terrainH(x: number, z: number) {
  const r = Math.hypot(x, z), R = shoreR(Math.atan2(z, x)), d = r / R;
  let h: number;
  if (d < 0.8) h = 0.55;
  else if (d < 1) h = 0.55 - (d - 0.8) / 0.2 * 0.75;            // la plage descend jusqu'à l'eau
  else h = Math.max(-6, -0.2 - (r - R) * 0.95);                // puis ça plonge vite
  h += 0.35 * ss(0.62, 0.2, d) * (1 + 0.4 * Math.sin(x * .7) * Math.cos(z * .6));   // dune herbeuse au centre
  h += HILL.h * ss(5.2, 1.8, Math.hypot(x - HILL.x, z - HILL.z));                 // colline
  return h;
}

/** Obstacles : cylindres (palmiers, rochers) et boîtes (cabane, caisses, ponton). top = hauteur absolue. */
export type Solid =
  | { k: 'c'; x: number; z: number; r: number; base: number; top: number; tag: string }
  | { k: 'b'; x0: number; z0: number; x1: number; z1: number; base: number; top: number; tag: string };

const cyl = (x: number, z: number, r: number, h: number, tag: string): Solid => {
  const g = terrainH(x, z); return { k: 'c', x, z, r, base: g - 1, top: g + h, tag };
};
const box = (cx: number, cz: number, w: number, d: number, h: number, tag: string, top?: number): Solid => {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const g = Math.min(terrainH(x0, z0), terrainH(x1, z0), terrainH(x0, z1), terrainH(x1, z1), terrainH(cx, cz));
  const gm = Math.max(terrainH(x0, z0), terrainH(x1, z0), terrainH(x0, z1), terrainH(x1, z1), terrainH(cx, cz));
  return { k: 'b', x0, z0, x1, z1, base: g - 1, top: top ?? gm + h, tag };
};

export const PALMS: [number, number, number][] = [[-9.5, -2.5, .2], [3.5, 8.5, 2.1], [-2.5, -11, 4.1], [11.5, 3.5, 1.2], [-11.2, 6.8, 5.3], [9.8, -11, 3.3]];
const PIER_A = -Math.PI / 2;
const pierR = shoreR(PIER_A);
export const PIER = { a: PIER_A, r0: pierR - 2.5, r1: pierR + 7, w: 2.2, top: 0.8 };

export const SOLIDS: Solid[] = [
  // la cabane (toit plat praticable) et ses caisses pour y grimper
  box(-6, 4.2, 3.4, 3.0, 2.45, 'cabane'),
  box(-3.75, 5.3, 1, 1, .95, 'caisse'),
  box(-3.75, 6.35, 1, 1, 1.75, 'caisse2'),
  box(-6.6, 1.95, 1, 1, .95, 'caisse'),
  // rochers
  cyl(8.2, 6.4, 1.5, 1.15, 'rocher'), cyl(-9.4, -7, 1.25, .95, 'rocher'), cyl(1.6, 11.2, 1, .75, 'rocher'),
  cyl(-12.4, 1.2, 1.05, .85, 'rocher'), cyl(4.2, -1.8, .8, .6, 'rocher'),
  // feu de camp au centre
  cyl(-1.2, 1.4, .75, .35, 'feu'),
  // palmiers
  ...PALMS.map(([x, z]) => cyl(x, z, .3, 6, 'palmier')),
];
// le ponton qui avance au-dessus de l'eau
{
  const c = Math.cos(PIER.a), s = Math.sin(PIER.a), mid = (PIER.r0 + PIER.r1) / 2, len = PIER.r1 - PIER.r0;
  // plein sud, aligné sur l'axe z
  const cx = c * mid, cz = s * mid;
  SOLIDS.push({ k: 'b', x0: cx - PIER.w / 2, x1: cx + PIER.w / 2, z0: cz - len / 2, z1: cz + len / 2, base: -3, top: PIER.top, tag: 'ponton' });
}

/** Points d'apparition (cercle autour du centre), décalés s'ils tombent dans un obstacle. */
export const SPAWNS = Array.from({ length: 8 }, (_, i) => {
  for (let k = 0; k < 40; k++) {
    const a = i / 8 * Math.PI * 2 + .3 + k * .05 * (k % 2 ? 1 : -1), r = 7.5 - (k % 5) * .4, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const free = SOLIDS.every(s => s.k === 'c' ? Math.hypot(x - s.x, z - s.z) > s.r + 1.2 : x < s.x0 - 1.2 || x > s.x1 + 1.2 || z < s.z0 - 1.2 || z > s.z1 + 1.2);
    if (free && Math.hypot(x - HILL.x, z - HILL.z) > 4) return { x, z };
  }
  return { x: 0, z: 0 };
});

const inBox = (s: Extract<Solid, { k: 'b' }>, x: number, z: number, m = 0) => x >= s.x0 - m && x <= s.x1 + m && z >= s.z0 - m && z <= s.z1 + m;

/** Hauteur du sol sous (x, z) pour quelqu'un dont les pieds sont à y (on monte une marche de `step`). */
export function groundAt(x: number, z: number, y: number, step = 0.45) {
  let g = terrainH(x, z);
  for (const s of SOLIDS) {
    if (s.top > y + step || s.top <= g) continue;
    if (s.k === 'c' ? (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r : inBox(s, x, z)) g = s.top;
  }
  return g;
}

/** Repousse un corps (rayon r, pieds y, taille h) hors des obstacles plus hauts qu'une marche. */
export function pushOut(p: { x: number; z: number }, y: number, r: number, h: number, step = 0.45) {
  let hit = false;
  for (const s of SOLIDS) {
    if (s.top <= y + step || s.base >= y + h) continue;
    if (s.k === 'c') {
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), m = s.r + r;
      if (d < m && d > 1e-4) { p.x = s.x + dx / d * m; p.z = s.z + dz / d * m; hit = true; }
    } else if (inBox(s, p.x, p.z, r)) {
      const l = p.x - (s.x0 - r), ri = (s.x1 + r) - p.x, f = p.z - (s.z0 - r), b = (s.z1 + r) - p.z, m = Math.min(l, ri, f, b);
      if (m === l) p.x = s.x0 - r; else if (m === ri) p.x = s.x1 + r; else if (m === f) p.z = s.z0 - r; else p.z = s.z1 + r;
      hit = true;
    }
  }
  return hit;
}

/** Un segment touche-t-il un obstacle ou le relief ? (projectiles, lignes de tir des bots) */
export function segBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / .3);
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (y < terrainH(x, z)) return true;
    for (const s of SOLIDS) {
      if (y > s.top || y < s.base) continue;
      if (s.k === 'c' ? (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r : inBox(s, x, z)) return true;
    }
  }
  return false;
}
