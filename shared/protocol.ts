// Messages échangés entre les téléphones et le serveur de jeu.
export const MAX_PLAYERS = 8;
export const TICK_MS = 66;   // ~15 positions par seconde
/** Personnages tirés au sort pour les joueurs (Microsoft Rocketbox, MIT). */
export const PLAYER_AVATARS = ['Business_Male_01', 'Business_Male_02', 'Business_Male_03', 'Business_Male_05',
  'Business_Female_01', 'Business_Female_02', 'Female_Party_02'];

export interface Settings { indics: number; duree: 'courte' | 'normale' | 'longue' }
export interface PlayerInfo { id: string; name: string; avatar: string; online: boolean; bot: boolean }

export type ClientMsg =
  | { t: 'hello'; token?: string; name: string }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'name'; name: string }
  | { t: 'settings'; indics?: number; duree?: Settings['duree'] }
  | { t: 'bot' }
  | { t: 'start' }
  | { t: 'input'; x: number; z: number; yaw: number; mv: number }
  | { t: 'leave' }
  | { t: 'ping'; c: number };

export type ServerMsg =
  | { t: 'welcome'; id: string; token: string }
  | { t: 'lobby'; code: string; host: string; phase: 'lobby' | 'night'; players: PlayerInfo[]; settings: Settings; maxIndics: number }
  | { t: 'started'; seed: number; rejoin: boolean; elapsed: number; players: PlayerInfo[]; pos: [string, number, number, number][] }
  | { t: 'snap'; p: [string, number, number, number, number][] }
  | { t: 'gone'; id: string }
  | { t: 'left' }
  | { t: 'error'; msg: string }
  | { t: 'pong'; c: number };
