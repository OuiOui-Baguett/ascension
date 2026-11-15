// ============================================================
// L'île : relief, obstacles, points d'apparition. Partagé entre le serveur
// (physique, chute dans l'eau) et la page (dessin) : les deux voient la même île.
// Zones : camp au centre, colline au nord-est, ruines à l'est, palmeraie à l'ouest,
// docks et ponton au sud, et l'îlot du phare au nord, relié par un pont de corde.
// ============================================================

/** Sous cette hauteur des pieds, on est dans l'eau profonde : éjecté. */
export const DROWN_Y = -0.9;

/** Taille de l'île principale (1 = première version). */
export const ISLE = 1.9;
const S = ISLE;
/** Rayon du rivage selon l'angle (côte découpée). La mer à l'écran utilise la même formule. */
export function shoreR(a: number) {
  return S * (15.5 + 2.0 * Math.sin(3 * a + 1.2) + 1.1 * Math.sin(5 * a + 0.4) + 0.6 * Math.sin(9 * a + 2));
}
/** L'îlot du phare, au nord. */
export const ISLET = { x: 0, z: 46, r: 9 };
export function isletR(a: number) { return ISLET.r + .7 * Math.sin(4 * a) + .35 * Math.sin(7 * a + 1); }
const ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** La colline rocheuse (point haut de l'île). */
export const HILL = { x: 6 * S, z: -5.5 * S, h: 3.6 };

function beach(r: number, R: number) {
  const d = r / R;
  if (d < 0.8) return 0.55;
  if (d < 1) return 0.55 - (d - 0.8) / 0.2 * 0.75;            // la plage descend jusqu'à l'eau
  return Math.max(-6, -0.2 - (r - R) * 0.95);                 // puis ça plonge vite
}
/** Relief de l'île principale seule. */
export function mainH(x: number, z: number) {
  const r = Math.hypot(x, z), R = shoreR(Math.atan2(z, x)), d = r / R;
  let h = beach(r, R);
  h += 0.45 * ss(0.62, 0.15, d) * (1 + 0.4 * Math.sin(x * .45) * Math.cos(z * .4));  // dune herbeuse au centre
  h += HILL.h * ss(7.5, 2.4, Math.hypot(x - HILL.x, z - HILL.z));                  // colline
  return h;
}
/** Relief de l'îlot seul. */
export function isletH(x: number, z: number) {
  const ix = x - ISLET.x, iz = z - ISLET.z, ir = Math.hypot(ix, iz);
  return beach(ir, isletR(Math.atan2(iz, ix))) + .5 * ss(5, 1, ir);
}
/** Hauteur du sol (sable, dune, colline ; sous l'eau au-delà du rivage). */
export function terrainH(x: number, z: number) {
  const h = mainH(x, z);
  return Math.hypot(x - ISLET.x, z - ISLET.z) < ISLET.r + 9 ? Math.max(h, isletH(x, z)) : h;
}
/** Le centre de la terre la plus proche (île ou îlot) et à quel point on est près du bord (1 = rivage). */
export function nearestLand(x: number, z: number) {
  const dm = Math.hypot(x, z) / shoreR(Math.atan2(z, x));
  const di = Math.hypot(x - ISLET.x, z - ISLET.z) / isletR(Math.atan2(z - ISLET.z, x - ISLET.x));
  return di < dm ? { x: ISLET.x, z: ISLET.z, edge: di } : { x: 0, z: 0, edge: dm };
}

/** Obstacles : cylindres (palmiers, rochers, colonnes) et boîtes (cabane, caisses, ponton, pont). top = hauteur absolue. */
export type Solid =
  | { k: 'c'; x: number; z: number; r: number; base: number; top: number; tag: string }
  | { k: 'b'; x0: number; z0: number; x1: number; z1: number; base: number; top: number; tag: string };

const cyl = (x: number, z: number, r: number, h: number, tag: string): Solid => {
  const g = terrainH(x, z); return { k: 'c', x, z, r, base: g - 1, top: g + h, tag };
};
const box = (cx: number, cz: number, w: number, d: number, h: number, tag: string, top?: number): Solid => {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const pts = [terrainH(x0, z0), terrainH(x1, z0), terrainH(x0, z1), terrainH(x1, z1), terrainH(cx, cz)];
  return { k: 'b', x0, z0, x1, z1, base: Math.min(...pts) - 1, top: top ?? Math.max(...pts) + h, tag };
};

export const PALMS: [number, number, number][] = [
  // palmeraie à l'ouest
  [-19, -5, .2], [-22.5, -1, 1.7], [-17, 1.5, 3.1], [-21, 5, 4.4], [-24.5, -6.5, 5.2], [-18.5, -10, .7],
  // ailleurs
  [6.5, 16, 2.1], [-4.8, -21, 4.1], [21.8, 6.6, 1.2], [-11.5, -24, .9], [25, -6.8, 2.6], [-1.9, 25.2, 4.6], [14, 20, 3.4],
  // îlot
  [ISLET.x - 4.5, ISLET.z + 1.5, 1.4], [ISLET.x + 5, ISLET.z - 2.5, 3.9],
];
const PIER_A = -Math.PI / 2;
const pierR = shoreR(PIER_A);
export const PIER = { a: PIER_A, r0: pierR - 2.5, r1: pierR + 8, w: 2.4, top: 0.8 };
/** Le pont de corde vers l'îlot (axe z, x = 0). */
export const BRIDGE = { x: 0, z0: shoreR(Math.PI / 2) - 2.5, z1: ISLET.z - isletR(-Math.PI / 2) + 2.2, w: 2.2, top: .9 };
export const LIGHTHOUSE = { x: ISLET.x + 1.5, z: ISLET.z + 2.5, r: 1.8, h: 10 };
export const CABIN = { x: -11.4, z: 8 };

export const SOLIDS: Solid[] = [
  // le camp : cabane (toit plat praticable) et caisses pour y grimper
  box(CABIN.x, CABIN.z, 3.4, 3.0, 2.45, 'cabane'),
  box(CABIN.x + 2.25, CABIN.z + 1.1, 1, 1, .95, 'caisse'),
  box(CABIN.x + 2.25, CABIN.z + 2.15, 1, 1, 1.75, 'caisse2'),
  box(CABIN.x - .6, CABIN.z - 2.25, 1, 1, .95, 'caisse'),
  cyl(-1.2, 1.4, .75, .35, 'feu'),
  // docks au sud
  box(2.2, -pierR + 4.5, 1, 1, .95, 'caisse'), box(3.3, -pierR + 4.2, 1, 1, .95, 'caisse'), box(2.7, -pierR + 5.4, 1, 1, 1.75, 'caisse2'),
  box(-3.2, -pierR + 4, 1, 1, .95, 'caisse'),
  // ruines du temple, à l'est
  box(17.5, 3.4, .7, 3.6, 1.25, 'muret'), box(21.5, -1.2, 3.6, .7, 1.25, 'muret'), box(22.8, 6.2, 2.6, .7, 1.05, 'muret'),
  cyl(19.4, -3.4, .55, 3.2, 'colonne'), cyl(24.2, 1.8, .55, 3.2, 'colonne'), cyl(19.6, 8.4, .55, 1.3, 'colonne'), cyl(24.6, -3.6, .55, .9, 'colonne'),
  // murets épars
  box(-7.6, -14.4, 3.4, .7, 1.25, 'muret'), box(-23.4, -3.4, .7, 2.6, 1.05, 'muret'), box(4, 13.5, 3, .7, 1.1, 'muret'),
  // rochers
  cyl(15.6, 12.2, 1.6, 1.25, 'rocher'), cyl(-17.9, -13.3, 1.3, 1, 'rocher'), cyl(3, 21.3, 1.1, .8, 'rocher'),
  cyl(8, -3.4, .9, .65, 'rocher'), cyl(-9.5, 20.1, 1.4, 1.05, 'rocher'), cyl(24, -14.8, 1.2, .9, 'rocher'),
  cyl(-26.3, 10.5, 1.2, .9, 'rocher'), cyl(9.6, -21.5, 1.5, 1.1, 'rocher'), cyl(-4, 7.5, .8, .55, 'rocher'),
  // îlot : phare et coffre
  cyl(LIGHTHOUSE.x, LIGHTHOUSE.z, LIGHTHOUSE.r, LIGHTHOUSE.h, 'phare'),
  box(ISLET.x - 3, ISLET.z - 3.5, 1.2, .8, .8, 'coffre'),
  // palmiers
  ...PALMS.map(([x, z]) => cyl(x, z, .3, 6, 'palmier')),
];
{ // le ponton qui avance au-dessus de l'eau, plein sud
  const mid = (PIER.r0 + PIER.r1) / 2, len = PIER.r1 - PIER.r0;
  SOLIDS.push({ k: 'b', x0: -PIER.w / 2, x1: PIER.w / 2, z0: -mid - len / 2, z1: -mid + len / 2, base: -3, top: PIER.top, tag: 'ponton' });
  SOLIDS.push({ k: 'b', x0: BRIDGE.x - BRIDGE.w / 2, x1: BRIDGE.x + BRIDGE.w / 2, z0: BRIDGE.z0, z1: BRIDGE.z1, base: -3, top: BRIDGE.top, tag: 'pont' });
}

/** Obstacles temporaires (murs de roche du Colosse) : ajoutés et retirés pendant la manche. */
export const DYN: Solid[] = [];

/** Points d'apparition (cercle autour du centre), décalés s'ils tombent dans un obstacle. */
export const SPAWNS = Array.from({ length: 8 }, (_, i) => {
  for (let k = 0; k < 60; k++) {
    const a = i / 8 * Math.PI * 2 + .3 + k * .05 * (k % 2 ? 1 : -1), r = 13 - (k % 5) * .6, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const free = SOLIDS.every(s => s.k === 'c' ? Math.hypot(x - s.x, z - s.z) > s.r + 1.4 : x < s.x0 - 1.4 || x > s.x1 + 1.4 || z < s.z0 - 1.4 || z > s.z1 + 1.4);
    if (free && Math.hypot(x - HILL.x, z - HILL.z) > 6) return { x, z };
  }
  return { x: 0, z: 0 };
});

const inBox = (s: Extract<Solid, { k: 'b' }>, x: number, z: number, m = 0) => x >= s.x0 - m && x <= s.x1 + m && z >= s.z0 - m && z <= s.z1 + m;
const inside = (s: Solid, x: number, z: number) => s.k === 'c' ? (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r : inBox(s, x, z);

/** Hauteur du sol sous (x, z) pour quelqu'un dont les pieds sont à y (on monte une marche de `step`). */
export function groundAt(x: number, z: number, y: number, step = 0.45) {
  let g = terrainH(x, z);
  for (const L of [SOLIDS, DYN]) for (const s of L) {
    if (s.top > y + step || s.top <= g) continue;
    if (inside(s, x, z)) g = s.top;
  }
  return g;
}

/** Repousse un corps (rayon r, pieds y, taille h) hors des obstacles plus hauts qu'une marche. */
export function pushOut(p: { x: number; z: number }, y: number, r: number, h: number, step = 0.45) {
  let hit = false;
  for (const L of [SOLIDS, DYN]) for (const s of L) {
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

/** Un point est-il dans le relief ou un obstacle ? */
export function solidAt(x: number, y: number, z: number) {
  if (y < terrainH(x, z)) return true;
  for (const L of [SOLIDS, DYN]) for (const s of L) if (y <= s.top && y >= s.base && inside(s, x, z)) return true;
  return false;
}
/** Un segment touche-t-il un obstacle ou le relief ? (projectiles, lignes de tir des bots) */
export function segBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / .3);
  for (let i = 1; i <= n; i++) { const t = i / n; if (solidAt(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return true; }
  return false;
}
/** Le point visé : là où la ligne de visée touche le sol ou un obstacle (au plus loin `max`), posé au sol. */
export function aimPoint(ex: number, ey: number, ez: number, dx: number, dy: number, dz: number, max: number) {
  let x = ex, y = ey, z = ez;
  for (let t = .3; t <= max; t += .3) {
    x = ex + dx * t; y = ey + dy * t; z = ez + dz * t;
    if (solidAt(x, y, z)) break;
  }
  const g = groundAt(x, z, y + .5, 1);
  return { x, y: g, z };
}
