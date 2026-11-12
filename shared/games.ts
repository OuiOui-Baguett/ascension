// Règles des jeux du casino, calculées par le serveur (cotes de vrai casino : la banque gagne à la longue).

// ---------- machines à sous ----------
/** Symboles : 0 «7», 1 cerise, 2 BAR, 3 cloche, 4 diamant, 5 citron, 6 étoile, 7 dollar */
export const SYMBOLS = 8;
export const SLOT_BETS = [10, 50, 100];
const TABLE: { p: number; sym: number; mult: number; two?: boolean; jackpot?: boolean }[] = [
  { p: 1 / 800, sym: 4, mult: 0, jackpot: true },
  { p: 1 / 500, sym: 0, mult: 50 },
  { p: 1 / 160, sym: 2, mult: 20 },
  { p: 1 / 80, sym: 3, mult: 10 },
  { p: 1 / 30, sym: 5, mult: 5 },
  { p: 1 / 18, sym: 1, mult: 3 },
  { p: 1 / 11, sym: 1, mult: 2, two: true },
];
export const SLOT_PAYS = [['♦ ♦ ♦', 'JACKPOT'], ['7 7 7', '×50'], ['BAR ×3', '×20'], ['Cloches ×3', '×10'], ['Citrons ×3', '×5'], ['Cerises ×3', '×3'], ['2 cerises', '×2']];

export function slotSpin(bet: number, jackpot: number, rnd = Math.random): { reels: number[]; win: number; jackpot: boolean } {
  let r = rnd();
  for (const o of TABLE) {
    if (r < o.p) {
      if (o.jackpot) return { reels: [4, 4, 4], win: Math.round(jackpot * bet / 100), jackpot: true };
      if (o.two) { const other = pickNot([1], rnd), reels = [1, 1, other]; shuffle(reels, rnd); return { reels, win: bet * o.mult, jackpot: false }; }
      return { reels: [o.sym, o.sym, o.sym], win: bet * o.mult, jackpot: false };
    }
    r -= o.p;
  }
  // perdu : jamais trois symboles identiques ni deux cerises
  for (;;) {
    const reels = [0, 0, 0].map(() => Math.floor(rnd() * SYMBOLS));
    if (reels[0] === reels[1] && reels[1] === reels[2]) continue;
    if (reels.filter(s => s === 1).length >= 2) continue;
    return { reels, win: 0, jackpot: false };
  }
}
function pickNot(not: number[], rnd: () => number) { for (;;) { const s = Math.floor(rnd() * SYMBOLS); if (!not.includes(s)) return s; } }
function shuffle<T>(a: T[], rnd: () => number) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }

// ---------- roulette (européenne, un seul zéro) ----------
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Ordre des cases sur le cylindre */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export type BetKind = 'n' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'd1' | 'd2' | 'd3';
export const CHIPS = [10, 50, 100, 500];
/** Gain total rendu (mise comprise) pour une mise gagnante, 0 si perdue */
export function rouletteReturn(kind: BetKind, value: number, amount: number, n: number) {
  const win = (() => {
    switch (kind) {
      case 'n': return n === value;
      case 'red': return RED.has(n);
      case 'black': return n > 0 && !RED.has(n);
      case 'even': return n > 0 && n % 2 === 0;
      case 'odd': return n % 2 === 1;
      case 'low': return n >= 1 && n <= 18;
      case 'high': return n >= 19;
      case 'd1': return n >= 1 && n <= 12;
      case 'd2': return n >= 13 && n <= 24;
      case 'd3': return n >= 25;
    }
  })();
  if (!win) return 0;
  return amount * (kind === 'n' ? 36 : kind[0] === 'd' ? 3 : 2);
}
export const BET_LABEL: Record<BetKind, string> = { n: 'Numéro', red: 'Rouge', black: 'Noir', even: 'Pair', odd: 'Impair', low: '1 à 18', high: '19 à 36', d1: '1re douzaine', d2: '2e douzaine', d3: '3e douzaine' };
export const ROUL_PHASES = { bets: 16000, spin: 6500, result: 4500 };
