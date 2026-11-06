// ============================================================
// FISH & FURY — source de vérité du contenu (poissons, cannes, appâts,
// économie). Rien n'est codé en dur ailleurs : régler le jeu se fait ICI.
// ============================================================

export type Rarity = 'COMMUN' | 'PEU_COMMUN' | 'RARE' | 'EPIQUE' | 'LEGENDAIRE';

export const RARITY: Record<Rarity, { label: string; color: string; mult: number; weight: number }> = {
  COMMUN:      { label: 'Commun',      color: '#c9c2d6', mult: 1,    weight: 100 },
  PEU_COMMUN:  { label: 'Peu commun',  color: '#5cb46e', mult: 1.6,  weight: 46 },
  RARE:        { label: 'Rare',        color: '#4aa8dc', mult: 2.8,  weight: 17 },
  EPIQUE:      { label: 'Épique',      color: '#b07de0', mult: 5.5,  weight: 5 },
  LEGENDAIRE:  { label: 'Légendaire',  color: '#e6b64c', mult: 12,   weight: 1.1 },
};

/** Comportement au combat : c'est lui qui donne son caractère à chaque poisson. */
export type Behaviour = 'CALME' | 'NERVEUX' | 'LOURD' | 'RAPIDE' | 'PLONGEUR' | 'SAUTEUR' | 'TIREUR' | 'ELECTRIQUE';

export interface FishDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  icon: string;
  color: string;
  baseValue: number;        // valeur d'un spécimen au poids minimum
  weightMin: number;        // kg
  weightMax: number;
  strength: number;         // 0.5 (mollasson) → 2.4 (monstre) : vitesse de montée de la tension
  stamina: number;          // secondes de combat avant épuisement
  behaviour: Behaviour;
  depth: 'SURFACE' | 'MOYEN' | 'PROFOND';
  bestBait: string;         // appât qui double ses chances d'apparition
  weight: number;           // poids de tirage dans la zone
}

/** Variantes : rares, purement cosmétiques et monétaires. */
export const VARIANTS = [
  { id: 'normal',   name: '',            mult: 1,   weight: 100, color: '' },
  { id: 'albinos',  name: 'Albinos',     mult: 2.2, weight: 7,   color: '#f2eee6' },
  { id: 'lumineux', name: 'Luminescent', mult: 3.0, weight: 4,   color: '#7ef0d0' },
  { id: 'dore',     name: 'Doré',        mult: 6.0, weight: 1.2, color: '#e6b64c' },
];

export interface BaitDef { id: string; name: string; icon: string; price: number; desc: string; lure: number }
export const BAITS: BaitDef[] = [
  { id: 'vers',    name: 'Vers de vase',  icon: '🪱', price: 0,   lure: 1,    desc: 'Gratuit, fourni par la crique.' },
  { id: 'crevette',name: 'Crevette',      icon: '🦐', price: 45,  lure: 1.35, desc: 'Ça mord plus vite.' },
  { id: 'leurre',  name: 'Leurre brillant', icon: '✨', price: 160, lure: 1.8, desc: 'Attire les espèces rares.' },
];

export interface RodDef {
  id: string; name: string; icon: string; price: number; desc: string;
  power: number;       // portée du lancer
  lineMax: number;     // tension supportée avant rupture
  reelSpeed: number;   // vitesse de récupération
}
export const RODS: RodDef[] = [
  { id: 'bambou',  name: 'Canne en bambou', icon: '🎋', price: 0,    power: 1,    lineMax: 100, reelSpeed: 1,    desc: 'Celle du ponton. Elle a vu des choses.' },
  { id: 'fibre',   name: 'Canne fibre',     icon: '🎣', price: 320,  power: 1.25, lineMax: 145, reelSpeed: 1.2,  desc: 'Plus longue, plus solide.' },
  { id: 'acier',   name: 'Canne acier',     icon: '⚓', price: 1100, power: 1.5,  lineMax: 210, reelSpeed: 1.45, desc: 'Pour ce qui vit au fond.' },
  { id: 'abysse',  name: 'Canne des Abysses', icon: '🔱', price: 3800, power: 1.9, lineMax: 320, reelSpeed: 1.7, desc: 'On ne sait pas de quoi elle est faite.' },
];

export const FISHES: FishDef[] = [
  { id: 'gardon', name: 'Gardon pâle', icon: '🐟', color: '#9fc4d8', rarity: 'COMMUN', weight: 100,
    desc: 'Le premier poisson de tout le monde. On s’en souvient rarement.',
    baseValue: 18, weightMin: .2, weightMax: 1.4, strength: .55, stamina: 4, behaviour: 'CALME', depth: 'SURFACE', bestBait: 'vers' },
  { id: 'perche', name: 'Perche rayée', icon: '🐠', color: '#6fae78', rarity: 'COMMUN', weight: 78,
    desc: 'Nerveuse, elle part de côté dès qu’elle sent la ligne.',
    baseValue: 32, weightMin: .5, weightMax: 2.6, strength: .85, stamina: 5, behaviour: 'NERVEUX', depth: 'SURFACE', bestBait: 'vers' },
  { id: 'mudjaw', name: 'Gueule-de-Vase', icon: '🐡', color: '#8a7a4a', rarity: 'PEU_COMMUN', weight: 44,
    desc: 'Une masse qui vit dans la boue et qui n’a jamais couru de sa vie.',
    baseValue: 70, weightMin: 2, weightMax: 9, strength: 1.3, stamina: 8, behaviour: 'LOURD', depth: 'MOYEN', bestBait: 'crevette' },
  { id: 'boltfin', name: 'Boltfin', icon: '⚡', color: '#7ee0f0', rarity: 'RARE', weight: 17,
    desc: 'Décharge une secousse dans la canne. Vos doigts s’en souviennent.',
    baseValue: 180, weightMin: 1, weightMax: 4.5, strength: 1.5, stamina: 7, behaviour: 'ELECTRIQUE', depth: 'MOYEN', bestBait: 'leurre' },
  { id: 'glassback', name: 'Dos-de-Verre', icon: '🫧', color: '#cfe8f5', rarity: 'RARE', weight: 12,
    desc: 'Presque transparent. On le repère à son ombre, jamais à lui.',
    baseValue: 240, weightMin: .8, weightMax: 3.2, strength: 1.15, stamina: 6, behaviour: 'RAPIDE', depth: 'SURFACE', bestBait: 'leurre' },
  { id: 'cannoncarp', name: 'Carpe-Canon', icon: '💥', color: '#d8763c', rarity: 'EPIQUE', weight: 5,
    desc: 'Sort de l’eau tête la première. Tenez-vous à distance du ponton.',
    baseValue: 520, weightMin: 6, weightMax: 22, strength: 1.9, stamina: 11, behaviour: 'SAUTEUR', depth: 'MOYEN', bestBait: 'crevette' },
  { id: 'deepmaw', name: 'Gouffre', icon: '🌑', color: '#4a3f6b', rarity: 'LEGENDAIRE', weight: 1.1,
    desc: 'Remonte rarement. Quand il remonte, il emmène quelque chose avec lui.',
    baseValue: 2400, weightMin: 18, weightMax: 60, strength: 2.4, stamina: 18, behaviour: 'TIREUR', depth: 'PROFOND', bestBait: 'leurre' },
];

export const fishAt = (id: string) => FISHES.find(f => f.id === id);
export const rodAt = (id: string) => RODS.find(r => r.id === id) ?? RODS[0];
export const baitAt = (id: string) => BAITS.find(b => b.id === id) ?? BAITS[0];
export const variantAt = (id: string) => VARIANTS.find(v => v.id === id) ?? VARIANTS[0];

/** Valeur d'une prise : base × poids × variante.
 *  La rareté N'entre PAS dans la formule : elle est déjà payée deux fois — une fois dans
 *  la valeur de base de l'espèce, une fois dans sa probabilité d'apparition. La compter
 *  une troisième fois mettait le légendaire à 80 000 ⧗ pour une canne à 3 800. */
export function fishValue(fishId: string, kg: number, variantId = 'normal'): number {
  const f = fishAt(fishId);
  if (!f) return 0;
  const span = Math.max(.01, f.weightMax - f.weightMin);
  const wMult = 1 + ((kg - f.weightMin) / span) * 1.8;     // un spécimen au poids max vaut 2,8×
  return Math.max(1, Math.round(f.baseValue * wMult * variantAt(variantId).mult));
}

export const CAST_MS = 1100;          // durée d'un lancer avant que l'appât touche l'eau
export const BITE_MIN = 2200;         // attente minimale avant une touche
export const BITE_MAX = 11000;
export const HOOK_WINDOW = 1100;      // temps pour ferrer une fois que ça mord
export const TENSION_BREAK = 100;     // % de tension : au-delà, la ligne casse
export const START_SHELLS = 0;
export const fmtShells = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' 🐚';
