// Plan du casino partagé entre le serveur (vérifie qu'on est bien sur place) et la page.
export const W = 18, D = 15;
/** Guichet de la caisse (où se tient le joueur) */
export const CAISSE = { x: 0, z: -11.45 };
/** Tables de roulette (centre de la table, grand axe selon x) */
export const ROULETTES: { x: number; z: number }[] = [{ x: -12, z: -9.6 }, { x: -12, z: -3.6 }];
export interface SlotDef { x: number; z: number; face: number; v: number }
/** Machines à sous : face = côté du joueur (+1 = vers +x, -1 = vers -x) */
export const SLOT_LIST: SlotDef[] = [];
for (const z0 of [-10, 2.6]) for (let i = 0; i < 6; i++) {
  const z = z0 + i * 1.0, v = (i + (z0 > 0 ? 1 : 0)) % 3;
  SLOT_LIST.push({ x: 9.0, z, face: -1, v }, { x: 9.72, z, face: 1, v: (v + 1) % 3 });
}
for (const z0 of [-10, 2.6]) for (let i = 0; i < 6; i++) {
  const z = z0 + i * 1.0, v = (i + 2) % 3;
  SLOT_LIST.push({ x: 13.2, z, face: -1, v }, { x: 13.92, z, face: 1, v: (v + 1) % 3 });
}
for (let i = 0; i < 15; i++) { const z = i < 8 ? -12.2 + i : 3.2 + (i - 8); SLOT_LIST.push({ x: W - .55, z, face: -1, v: i % 3 }); }
/** Place du tabouret devant une machine */
export const slotSeat = (s: SlotDef) => ({ x: s.x + s.face * .95, z: s.z, yaw: s.face > 0 ? -Math.PI / 2 : Math.PI / 2 });
export const dist2 = (ax: number, az: number, bx: number, bz: number) => (ax - bx) ** 2 + (az - bz) ** 2;
/** Heure du jeu : 23 h 47 → 3 h pendant le repérage */
export const REPERAGE_MS = { courte: 8 * 60000, normale: 12 * 60000, longue: 18 * 60000 } as const;
export function clockText(elapsed: number, dur: number) {
  const m = Math.min(193, Math.floor(elapsed / dur * 193)) + 23 * 60 + 47;
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h} h ${String(mm).padStart(2, '0')}`;
}

// ---------- lignes de vue (témoins) ----------
/** La galerie principale : un témoin doit s'y trouver pour voir la caisse. */
export const HALL_RECT = [-18, -15, 18, 15];
/** Ce qui coupe la vue dans la galerie : colonnes, cloisons, Grande Roue, bustes, îlots de machines. */
export const OCCLUDERS: number[][] = [
  [-2.1, -2.1, 2.1, 2.1],
  ...[-4.6, 4.6].flatMap(x => [-10.5, -4.5, 1.5, 7.5].map(z => [x - .46, z - .46, x + .46, z + .46])),
  ...[-4.6, 4.6].flatMap(x => [-7.5, 4.5, 10.5].map(z => [x - .32, z - .32, x + .32, z + .32])),
  ...[-6.2, 6.2].flatMap(x => [[-12.3, -6.4], [-3.6, 5.6], [8.4, 15]].map(([a, b]) => [x - .25, a, x + .25, b])),
  [8.44, -10.42, 10.28, -4.58], [8.44, 2.18, 10.28, 8.02], [12.64, -10.42, 14.48, -4.58], [12.64, 2.18, 14.48, 8.02],
];
const segHitsRect = (ax: number, az: number, bx: number, bz: number, r: number[]) => {
  // Liang-Barsky
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - r[0]], [dx, r[2] - ax], [-dz, az - r[1]], [dz, r[3] - az]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
};
export function losClear(ax: number, az: number, bx: number, bz: number, extra: number[][] = []) {
  for (const r of [...OCCLUDERS, ...extra]) if (segHitsRect(ax, az, bx, bz, r)) return false;
  return true;
}
export const inRect = (x: number, z: number, r: number[]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

// ---------- réunions de crise ----------
export const MEET_SPOTS = [{ x: -27.8, z: 11, label: 'Toilettes' }, { x: 0, z: 14, label: 'Radio de la camionnette' }];
export const MEET_MS = { talk: 75000, vote: 30000, reveal: 9000 };
