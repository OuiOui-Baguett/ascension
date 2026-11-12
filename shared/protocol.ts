// Messages échangés entre les téléphones et le serveur de jeu.
import type { BetKind } from './games';
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
  | { t: 'ping'; c: number }
  // argent, caisse, jeux
  | { t: 'buy'; item: string }
  | { t: 'give'; to: string; amount: number }
  | { t: 'sit'; slot: number }
  | { t: 'stand' }
  | { t: 'spin'; bet: number }
  | { t: 'rjoin'; table: number }
  | { t: 'rleave' }
  | { t: 'bet'; kind: BetKind; value: number; amount: number }
  | { t: 'bclear' };

/** État d'une table de roulette tel que l'envoie le serveur */
export interface TableState { id: number; ph: 'idle' | 'bets' | 'spin' | 'result'; left: number; bets: [string, BetKind, number, number][]; res: number; hist: number[]; wins: [string, number][] }

export type ServerMsg =
  | { t: 'welcome'; id: string; token: string }
  | { t: 'lobby'; code: string; host: string; phase: 'lobby' | 'night'; players: PlayerInfo[]; settings: Settings; maxIndics: number }
  | { t: 'started'; seed: number; rejoin: boolean; elapsed: number; dur: number; players: PlayerInfo[]; pos: [string, number, number, number][] }
  /** positions : id, x, z, orientation, allure (0 immobile, 1 marche, 2 course), machine occupée (-1 si debout) */
  | { t: 'snap'; p: [string, number, number, number, number, number][] }
  | { t: 'me'; money: number; inv: Record<string, number> }
  | { t: 'shop'; prices: Record<string, number>; stock: Record<string, number> }
  | { t: 'fx'; k: 'env'; id: string; c: 'white' | 'red' }
  | { t: 'note'; msg: string }
  | { t: 'slot'; reels: number[]; win: number; jackpot: boolean; money: number }
  | { t: 'jack'; v: number; who?: string; amount?: number }
  | { t: 'rtab'; s: TableState }
  | { t: 'gone'; id: string }
  | { t: 'left' }
  | { t: 'error'; msg: string }
  | { t: 'pong'; c: number };
