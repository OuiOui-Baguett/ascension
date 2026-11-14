// Messages échangés entre la page et le serveur.
export const MAX_PLAYERS = 8;
export const TICK_MS = 33;

export interface Settings { lives: number }
export interface PlayerInfo { id: string; name: string; color: number; bot: boolean; host: boolean }

export type ClientMsg =
  | { t: 'hello'; token?: string; name: string }
  | { t: 'name'; name: string }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'bot'; add: boolean }
  | { t: 'settings'; lives: number }
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
  | { t: 'end'; winner: string | null; ranking: string[] }
  | { t: 'error'; msg: string }
  | { t: 'pong'; c: number };
