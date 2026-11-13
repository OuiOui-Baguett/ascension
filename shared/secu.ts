// ============================================================
// Zones privées, partagées entre le serveur (qui décide qui est repéré)
// et la page (qui dessine portes, vigiles, caméras et leurs cônes de vue).
// Convention d'orientation : yaw = direction (sin yaw, cos yaw), comme les corps.
// ============================================================

/** Tout ce qui est derrière le mur nord de la galerie, et le couloir derrière le bar. */
export const isPrivate = (x: number, z: number) => z < -15.05 || (x < -18.2 && z < -8.05);

/** Surfaces praticables des zones privées (les murs sont entre elles) : sert aux lignes de vue. */
export const PWALK: number[][] = [
  [9.95, -27.6, 12.05, -15.3], [10.5, -15.8, 11.5, -14.6],                       // couloir de service + porte
  [12, -22.1, 13, -20.9], [12.8, -25.6, 19.6, -17.4],                            // salle de surveillance
  [4.4, -21.8, 10.1, -20.2], [-4.6, -25.6, 4.6, -15.8],                          // passage + chambre forte
  [-23.4, -29, -21.6, -8.4], [-23.4, -29, 12, -27.4], [-22.9, -8.8, -22.1, -7.6], // couloirs ouest et nord
  [-21.9, -21.1, -20.6, -19.9], [-10.1, -27.6, -8.9, -26.4],
  [-13.6, -26.5, -5.6, -15.7], [-5.8, -21.7, -4.4, -20.3],                       // salle de comptage
  [-20.7, -26.5, -14.5, -15.8],                                                  // bureau du directeur
];

export interface DoorDef { x: number; z: number; ax: 'x' | 'z'; w: number; h: number; kind: 'staff' | 'office' | 'vault'; out: 1 | -1; name: string }
/** ax = sens du mur ; out = côté « dehors » (verrouillé) le long de la normale. */
export const DOORS: DoorDef[] = [
  { x: 11, z: -15, ax: 'x', w: 1.5, h: 2.5, kind: 'staff', out: 1, name: 'Porte du personnel' },
  { x: -22.5, z: -8, ax: 'x', w: 1.4, h: 2.4, kind: 'staff', out: 1, name: 'Porte de service du bar' },
  { x: -21.15, z: -20.5, ax: 'z', w: 1.4, h: 2.4, kind: 'office', out: -1, name: 'Bureau du directeur' },
  { x: -9.5, z: -27, ax: 'x', w: 1.4, h: 2.4, kind: 'staff', out: -1, name: 'Salle de comptage' },
  { x: 12.4, z: -21.5, ax: 'z', w: 1.4, h: 2.4, kind: 'staff', out: -1, name: 'Salle de surveillance' },
  { x: 5, z: -21, ax: 'z', w: 2, h: 2.6, kind: 'vault', out: 1, name: 'Grille de la chambre forte' },
  { x: -5, z: -21, ax: 'z', w: 1.4, h: 2.4, kind: 'vault', out: -1, name: 'Grille de la chambre forte' },
];
export const doorRect = (d: DoorDef, th = .1) => d.ax === 'x' ? [d.x - d.w / 2, d.z - th, d.x + d.w / 2, d.z + th] : [d.x - th, d.z - d.w / 2, d.x + th, d.z + d.w / 2];
export const outside = (d: DoorDef, x: number, z: number) => Math.sign(d.ax === 'x' ? z - d.z : x - d.x) === d.out;
export const DOOR_OPEN_MS = 4500;

/** Rondes des vigiles : [x, z, pause en ms]. */
export const ROUTES: [number, number, number][][] = [
  // est : couloir de service, salle de surveillance, passage de la chambre forte, couloir nord
  [[11, -16.3, 2500], [11, -21.5, 0], [13.6, -21.5, 0], [16.8, -18.4, 0], [16.8, -24.8, 2000], [13.6, -21.5, 0], [11, -21.5, 0],
    [6.6, -21, 2500], [11, -21.3, 0], [11, -28.2, 0], [1, -28.2, 2000], [11, -28.2, 0]],
  // ouest : couloir derrière le bar, bureau du directeur, couloir nord, salle de comptage
  [[-22.5, -9.6, 2500], [-22.5, -20.5, 0], [-20, -20.5, 0], [-15.3, -20.5, 0], [-15.3, -25.6, 1500], [-15.3, -16.6, 0], [-19.8, -16.6, 1500],
    [-20, -20.5, 0], [-22.5, -20.5, 0], [-22.5, -28.2, 0], [-9.5, -28.2, 0], [-9.5, -24.3, 0], [-13, -24.3, 0], [-13, -16.4, 1500],
    [-5.9, -16.4, 0], [-5.9, -22.6, 1500], [-9.5, -24.3, 0], [-9.5, -28.2, 0], [-22.5, -28.2, 0]],
  // renfort (« vigile prévenu ») : va-et-vient dans le couloir nord et le couloir de service
  [[-20, -28.2, 2000], [11, -28.2, 1500], [11, -16.3, 2500], [11, -28.2, 0]],
];
export const GUARD = { range: 6.5, cos: Math.cos(Math.PI / 4), speed: 1.25 };

export interface CamDef { x: number; z: number; yaw: number; amp: number; per: number; mx: number; mz: number }
/** x, z = point d'observation au sol ; mx, mz = où la caméra est accrochée au mur. */
export const CAMS: CamDef[] = [
  { x: 11.8, z: -15.7, yaw: Math.PI, amp: .45, per: 9, mx: 11.95, mz: -15.3 },
  { x: 2, z: -27.6, yaw: -Math.PI / 2, amp: .35, per: 11, mx: 2.2, mz: -27.15 },
  { x: -21.8, z: -8.8, yaw: Math.PI, amp: .3, per: 8, mx: -21.4, mz: -8.6 },
  { x: -5.8, z: -15.9, yaw: -2.356, amp: .5, per: 10, mx: -5.45, mz: -15.55 },
  { x: -14.7, z: -16, yaw: -2.356, amp: .45, per: 12, mx: -14.35, mz: -15.6 },
  { x: 4.4, z: -16.1, yaw: -2.356, amp: .5, per: 10, mx: 4.75, mz: -15.75 },
  { x: 9.9, z: -20.4, yaw: -Math.PI / 2, amp: .2, per: 7, mx: 10.1, mz: -20.1 },
];
export const CAM = { range: 8.5, half: .44 };
export const camYaw = (c: CamDef, tSec: number, i: number) => c.yaw + c.amp * Math.sin(tSec / c.per * Math.PI * 2 + i * 1.7);

/** Les trois morceaux du code de la chambre forte. */
export const INTEL = [
  { x: -14.8, z: -19, game: 'pick' as const, pins: 1, name: 'Coffre mural du directeur', where: 'Bureau du directeur' },
  { x: 17.4, z: -21.5, game: 'hack' as const, pins: 0, name: 'Ordinateur de la sécurité', where: 'Salle de surveillance' },
  { x: -6.1, z: -23.1, game: 'pick' as const, pins: 0, name: 'Tiroir du chef comptable', where: 'Salle de comptage' },
];
export const ORD = ['1er', '2e', '3e'];
/** Le casse : la chambre forte, ses sacs, et la camionnette où les déposer (devant l'entrée). */
export const VAULT_RECT = [-5, -26, 5, -15.3], VAN = { x: 0, z: 13.4 }, BAGS = 10, GATES = [5, 6];

export interface Smoke { x: number; z: number; r: number }
export const SMOKE_R = 2.8, SMOKE_MS = 15000;

const inR = (x: number, z: number, r: number[]) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
/** Un point bloque la vue : hors des surfaces praticables, dans une porte fermée ou dans la fumée. */
export function blocked(x: number, z: number, closed: number[][], smokes: Smoke[]) {
  if (!PWALK.some(r => inR(x, z, r))) return true;
  for (const r of closed) if (inR(x, z, r)) return true;
  for (const s of smokes) if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) return true;
  return false;
}
export function clearLine(ax: number, az: number, bx: number, bz: number, closed: number[][], smokes: Smoke[]) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / .22);
  for (let i = 1; i < n; i++) { const t = i / n; if (blocked(ax + (bx - ax) * t, az + (bz - az) * t, closed, smokes)) return false; }
  return true;
}
/** Portes fermées (rectangles épaissis pour qu'aucun pas d'échantillonnage ne les saute). */
export const closedRects = (open: (i: number) => boolean) => DOORS.flatMap((d, i) => open(i) ? [] : [doorRect(d, .16)]);
