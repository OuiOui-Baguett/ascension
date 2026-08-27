// ============================================================
// ASCENSION — contenu partagé client / serveur / simulateur
// Source de vérité du game design. Aucune logique réseau ici.
// ============================================================

export type Archetype = 'WHEEL' | 'CRASH' | 'SLOTS' | 'HILO' | 'ROULETTE' | 'BLACKJACK' | 'CRAPS';

export interface WheelSegment { mult: number; weight: number }
export interface SlotSymbol { e: string; color: string; weight: number; pair: number; triple: number }

export interface MachineDef {
  id: string;
  name: string;
  archetype: Archetype;
  desc: string;
  wheel?: { segments: WheelSegment[]; spinMs: number };
  crash?: { growth: number; tickMs: number; edge: number };
  slots?: { symbols: SlotSymbol[]; spinMs: number };
  hilo?: { edge: number; maxSteps: number; decideMs: number };
  roulette?: { spinMs: number; colorMult: number; greenMult: number };
  bj?: { decideMs: number; winMult: number; naturalMult: number };
  craps?: { rollMs: number; sideMult: number; sevenMult: number };
}

export interface FloorTheme {
  bg: string; fog: string; ground: string; accent: string; light: string; emoji: string;
}

export interface FloorDef {
  index: number;
  id: string;
  name: string;
  sub: string;
  mult: number;
  theme: FloorTheme;
  machines: MachineDef[]; // ordre fixe : [WHEEL, CRASH, SLOTS, HILO]
}

// ---- Économie ----
export const START_BANK = 1000;
export const FLOOR_MS = 180_000; // 3 minutes par étage
export const betMin = (f: FloorDef) => 10 * f.mult;
export const betMax = (f: FloorDef) => 500 * f.mult;
export const floorFloat = (f: FloorDef) => 1000 * f.mult;
export const tollOf = (f: FloorDef) => 2000 * f.mult;

export const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' $';
export const CARD_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Roue : EV ≈ 0.985
const WHEEL_BASE: WheelSegment[] = [
  { mult: 0, weight: 48 }, { mult: 0.5, weight: 20 }, { mult: 1, weight: 12 },
  { mult: 2, weight: 9 }, { mult: 3, weight: 5 }, { mult: 5, weight: 3.5 },
  { mult: 8, weight: 2 }, { mult: 20, weight: 0.5 },
];

// Slots : EV ≈ 0.95 (pairs + triples, jackpot ×100)
const slotSet = (e: [string, string, string, string, string]): SlotSymbol[] => [
  { e: e[0], color: '#7ec98a', weight: 40, pair: 0.5, triple: 3 },
  { e: e[1], color: '#4aa8dc', weight: 30, pair: 1, triple: 5 },
  { e: e[2], color: '#c95f8a', weight: 18, pair: 1.5, triple: 10 },
  { e: e[3], color: '#e8703e', weight: 9, pair: 3, triple: 25 },
  { e: e[4], color: '#e6b64c', weight: 3, pair: 8, triple: 100 },
];

const wheel = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'WHEEL', desc, wheel: { segments: WHEEL_BASE, spinMs: 3800 } });
const crash = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'CRASH', desc, crash: { growth: 1.07, tickMs: 300, edge: 0.03 } });
const slots = (id: string, name: string, desc: string, e: [string, string, string, string, string]): MachineDef =>
  ({ id, name, archetype: 'SLOTS', desc, slots: { symbols: slotSet(e), spinMs: 2800 } });
const hilo = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'HILO', desc, hilo: { edge: 0.03, maxSteps: 5, decideMs: 12_000 } });
// Roulette européenne simplifiée : rouge/noir ×2 (18/37), vert ×36 (1/37) — EV ≈ 0.973
const roulette = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'ROULETTE', desc, roulette: { spinMs: 3500, colorMult: 2, greenMult: 36 } });
// Blackjack express : gagner ×2, blackjack naturel ×2.5, égalité remboursée
const bj = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'BLACKJACK', desc, bj: { decideMs: 15_000, winMult: 2, naturalMult: 2.5 } });
// Craps une lancée : sous/sur 7 ×2.3 (15/36), pile 7 ×5.8 (6/36) — EV ≈ 0.96
const craps = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'CRAPS', desc, craps: { rollMs: 2200, sideMult: 2.3, sevenMult: 5.8 } });

export const FLOORS: FloorDef[] = [
  {
    index: 1, id: 'canopee', name: 'La Canopée', sub: 'Un casino englouti par la jungle',
    mult: 1,
    theme: { bg: '#0e2416', fog: '#183a22', ground: '#1e4a2a', accent: '#5cb46e', light: '#ffe9b0', emoji: '🌴' },
    machines: [
      wheel('roue_ancetres', 'La Roue des Ancêtres', 'Tire la liane, la roue tribale décide.'),
      crash('pont_pourri', 'Le Pont Pourri', 'Rappelle le capybara avant que les planches cèdent.'),
      slots('totem_bavard', 'Le Totem Bavard', '3 tambours sculptés. Deux pareils = gain, trois = gros gain.', ['🌺', '🐒', '🐍', '🗿', '👑']),
      hilo('cartes_chaman', 'Les Cartes du Chaman', 'Plus haut ou plus bas ? Enchaîne et encaisse avant de te tromper.'),
    ],
  },
  {
    index: 2, id: 'abysses', name: 'Les Abysses', sub: 'Une salle de jeu pressurisée au fond de la fosse',
    mult: 10,
    theme: { bg: '#06131f', fog: '#0a2033', ground: '#0e2a42', accent: '#4aa8dc', light: '#bfe8ff', emoji: '🌊' },
    machines: [
      roulette('roulette_marees', 'Roulette des Marées', 'Rouge, noir… ou la perle verte des profondeurs.'),
      crash('palier_deco', 'Palier de Décompression', 'Remonte le plongeur avant l’implosion.'),
      slots('triple_coquillage', 'Le Triple Coquillage', 'Trois coquilles, un trésor peut-être.', ['🐚', '🐠', '🦑', '⚓', '👑']),
      bj('bj_epave', 'Blackjack de l’Épave', 'Le croupier-poulpe tire à 17. Bats-le sans dépasser 21.'),
    ],
  },
  {
    index: 3, id: 'fournaise', name: 'La Fournaise', sub: 'La forge démoniaque de la tour',
    mult: 100,
    theme: { bg: '#1a0d08', fog: '#33140a', ground: '#3d1a0c', accent: '#e8703e', light: '#ffb36b', emoji: '🌋' },
    machines: [
      wheel('roue_magma', 'Roue de Magma', 'Les segments fondent, la roue n’attend personne.'),
      craps('des_braise', 'Les Dés de Braise', 'Deux dés forgés dans la lave. Sous 7, sur 7, ou pile 7.'),
      slots('forge_lingots', 'La Forge à Lingots', 'Trois frappes, un lingot ou des cendres.', ['🪨', '🔥', '⚒️', '💀', '👑']),
      bj('bj_demon', 'Le 21 du Démon', 'Le démon tire à 17. Il ne sourit jamais.'),
    ],
  },
  {
    index: 4, id: 'zenith', name: 'Station Zénith', sub: 'Un casino orbital au-dessus de la Terre',
    mult: 1000,
    theme: { bg: '#070812', fog: '#0d1024', ground: '#131735', accent: '#9282f2', light: '#cfd4ff', emoji: '🚀' },
    machines: [
      roulette('roulette_grav', 'Roulette Gravitationnelle', 'La bille orbite autour d’un puits de gravité.'),
      crash('convoyeur', 'Convoyeur de Drones', 'Rappelle le drone avant l’impact.'),
      craps('des_quantiques', 'Les Dés Quantiques', 'Deux dés en superposition. L’observation décide.'),
      hilo('cartes_quantiques', 'Les Cartes Quantiques', 'La carte n’existe que quand tu la regardes.'),
    ],
  },
  {
    index: 5, id: 'paradoxe', name: 'Le Paradoxe', sub: 'Le sommet. Rien n’obéit plus à rien.',
    mult: 10000,
    theme: { bg: '#120c1c', fog: '#241536', ground: '#2e1a45', accent: '#e6b64c', light: '#fff3cf', emoji: '🌌' },
    machines: [
      wheel('miroir', 'Le Miroir', 'Toutes les roues de la tour, fondues en une seule.'),
      crash('escalier', 'L’Escalier Infini', 'Personne ne connaît la marche de trop.'),
      bj('bj_final', 'Le 21 Final', 'Une dernière main contre la tour elle-même.'),
      craps('des_destin', 'Les Dés du Destin', 'Ils ont déjà été lancés. Tu ne fais que regarder.'),
    ],
  },
];

export const floorAt = (i: number) => FLOORS[i - 1];

// ---- Objets ----
export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  category: 'PROTECTION' | 'RECOMPENSE' | 'ASSURANCE';
  desc: string;
  priceFrac: number;
}

export const ITEMS: ItemDef[] = [
  { id: 'carapace', name: 'Carapace de Tortue', icon: '🐢', category: 'PROTECTION',
    desc: 'Réduit de moitié les 3 prochaines pertes de l’étage.', priceFrac: 0.3 },
  { id: 'fruit_dore', name: 'Fruit Doré', icon: '🥭', category: 'RECOMPENSE',
    desc: '+25 % sur les gains de la roue et des slots de l’étage.', priceFrac: 0.4 },
  { id: 'oeuf', name: 'Œuf Mystérieux', icon: '🥚', category: 'ASSURANCE',
    desc: 'En cas de chute : conserve 30 % de la banque.', priceFrac: 0.5 },
];

export const itemAt = (id: string) => ITEMS.find(i => i.id === id);
