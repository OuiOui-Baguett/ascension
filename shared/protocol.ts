// Messages échangés entre la page et le serveur.
export const MAX_PLAYERS = 8;
export const TICK_MS = 33;

/** ffa : chacun pour soi · duo : équipes de 2 · coop : tous les humains contre les bots */
export type Mode = 'ffa' | 'duo' | 'coop';
export interface Settings { lives: number; mode: Mode }
export interface PlayerInfo { id: string; name: string; color: number; bot: boolean; host: boolean; team: number }
/** Répartition des équipes : les humains d'abord, pour que les potes jouent ensemble. */
export function teamsFor(players: { bot: unknown }[], mode: Mode): number[] {
  if (mode === 'ffa') return players.map((_, i) => i);
  if (mode === 'coop') return players.map(p => p.bot ? 1 : 0);
  const order = players.map((p, i) => ({ p, i })).sort((a, b) => (a.p.bot ? 1 : 0) - (b.p.bot ? 1 : 0) || a.i - b.i);
  const t: number[] = []; order.forEach(({ i }, k) => { t[i] = Math.floor(k / 2); }); return t;
}

export type ClientMsg =
  | { t: 'hello'; token?: string; name: string }
  | { t: 'name'; name: string }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'bot'; add: boolean }
  | { t: 'settings'; lives?: number; mode?: Mode }
  | { t: 'start' }
  /** position de son propre corps (la page fait sa physique) */
  | { t: 'in'; x: number; y: number; z: number; yaw: number; pitch: number; st: number }
  /** un coup : origine, direction de visée, numéro (pour relier le projectile prévu dans la page) */
  | { t: 'atk'; k: 'punch' | 'blast'; x: number; y: number; z: number; yaw: number; pitch: number; s: number }
  | { t: 'fell' }
  | { t: 'ping'; c: number };

/** [id, x, y, z, yaw, pitch, état (bits : 1 au sol, 2 ruée, 4 vol, 8 bouclier, 16 hors jeu)] */
export type SnapRow = [string, number, number, number, number, number, number];

export type ServerMsg =
  | { t: 'welcome'; id: string; token: string }
  | { t: 'lobby'; code: string; players: PlayerInfo[]; settings: Settings; phase: 'lobby' | 'play' }
  | { t: 'start'; players: PlayerInfo[]; lives: number; spawn: { x: number; y: number; z: number; yaw: number }; /** ms avant le top départ */ at: number }
  | { t: 'snap'; p: SnapRow[] }
  | { t: 'stats'; s: [string, number, number][] }            // [id, jauge %, vies]
  | { t: 'atk'; id: string; k: 'punch' | 'blast'; n: number } // pour animer les autres
  | { t: 'proj'; pid: number; owner: string; s: number; x: number; y: number; z: number; dx: number; dy: number; dz: number }
  | { t: 'boom'; pid: number; x: number; y: number; z: number }
  | { t: 'hit'; id: string; by: string; k: 'punch' | 'blast'; pct: number; ix: number; iy: number; iz: number; stun: number; x: number; y: number; z: number; big: boolean }
  | { t: 'ko'; id: string; by: string | null; lives: number; x: number; z: number }
  | { t: 'spawn'; id: string; x: number; y: number; z: number; yaw: number }
  | { t: 'end'; winner: string | null; winners: string[]; ranking: string[] }
  | { t: 'error'; msg: string }
  | { t: 'pong'; c: number };
