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
