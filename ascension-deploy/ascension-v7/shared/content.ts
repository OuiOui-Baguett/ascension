// ============================================================
// ASCENSION — contenu partagé client / serveur / tests
// Source de vérité du game design.
// ============================================================

export type Archetype =
  | 'WHEEL' | 'CRASH' | 'SLOTS' | 'HILO'
  | 'ROULETTE' | 'BLACKJACK' | 'CRAPS'
  | 'CHESTS' | 'PLINKO';

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
  chests?: { mults: number[]; openMs: number };
  plinko?: { mults: number[]; dropMs: number };
}

export interface FloorTheme {
  bg: string; fog: string; ground: string; accent: string; light: string; emoji: string;
}

export interface FloorDef {
  index: number; id: string; name: string; sub: string;
  mult: number; theme: FloorTheme; machines: MachineDef[];
}

// ---- Économie ----
export const START_BANK = 1000;
export const FLOOR_MS = 180_000;                       // 3 minutes par étage
export const betMin = (f: FloorDef) => 10 * f.mult;
export const betMax = (f: FloorDef) => 500 * f.mult;
export const floorFloat = (f: FloorDef) => 1000 * f.mult;
export const tollOf = (f: FloorDef) => 2000 * f.mult;

export const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' $';
export const CARD_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ---- Skins des personnages (choisis à l'accueil, gratuits) ----
export const SKIN_COLORS = ['#e6b64c', '#4aa8dc', '#e05c5c', '#5cb46e', '#b07de0', '#e08a3e'];
export const HATS = [
  { id: 0, name: 'Sans' },
  { id: 1, name: 'Casquette' },
  { id: 2, name: 'Couronne' },
  { id: 3, name: 'Haut-de-forme' },
  { id: 4, name: 'Antennes' },
  { id: 5, name: 'Auréole' },
];

// ---- Tables de gains (espérance ≈ 0,96 partout) ----
const WHEEL_BASE: WheelSegment[] = [
  { mult: 0, weight: 48 }, { mult: 0.5, weight: 20 }, { mult: 1, weight: 12 },
  { mult: 2, weight: 9 }, { mult: 3, weight: 5 }, { mult: 5, weight: 3.5 },
  { mult: 8, weight: 2 }, { mult: 20, weight: 0.5 },
];
const slotSet = (e: [string, string, string, string, string]): SlotSymbol[] => [
  { e: e[0], color: '#7ec98a', weight: 40, pair: 0.5, triple: 3 },
  { e: e[1], color: '#4aa8dc', weight: 30, pair: 1, triple: 5 },
  { e: e[2], color: '#c95f8a', weight: 18, pair: 1.5, triple: 10 },
  { e: e[3], color: '#e8703e', weight: 9, pair: 3, triple: 25 },
  { e: e[4], color: '#e6b64c', weight: 3, pair: 8, triple: 100 },
];
const CHEST_MULTS = [0, 0, 0, 0, 0.5, 1, 1.5, 2.5, 3.2];              // EV 0.967
const PLINKO_MULTS = [18, 4, 1.3, 0.5, 0.25, 0.5, 1.3, 4, 18];        // EV 0.962

const wheel = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'WHEEL', desc, wheel: { segments: WHEEL_BASE, spinMs: 3800 } });
const crash = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'CRASH', desc, crash: { growth: 1.07, tickMs: 300, edge: 0.03 } });
const slots = (id: string, name: string, desc: string, e: [string, string, string, string, string]): MachineDef =>
  ({ id, name, archetype: 'SLOTS', desc, slots: { symbols: slotSet(e), spinMs: 2800 } });
const hilo = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'HILO', desc, hilo: { edge: 0.03, maxSteps: 5, decideMs: 12_000 } });
const roulette = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'ROULETTE', desc, roulette: { spinMs: 3500, colorMult: 2, greenMult: 36 } });
const bj = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'BLACKJACK', desc, bj: { decideMs: 15_000, winMult: 2, naturalMult: 2.5 } });
const craps = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'CRAPS', desc, craps: { rollMs: 2200, sideMult: 2.3, sevenMult: 5.8 } });
const chests = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'CHESTS', desc, chests: { mults: CHEST_MULTS, openMs: 1400 } });
const plinko = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'PLINKO', desc, plinko: { mults: PLINKO_MULTS, dropMs: 2600 } });

// Chaque étage : 4 machines de types TOUS DIFFÉRENTS.
export const FLOORS: FloorDef[] = [
  {
    index: 1, id: 'canopee', name: 'La Canopée', sub: 'Un casino englouti par la jungle',
    mult: 1,
    theme: { bg: '#0e2416', fog: '#183a22', ground: '#1e4a2a', accent: '#5cb46e', light: '#ffe9b0', emoji: '🌴' },
    machines: [
      wheel('roue_ancetres', 'Roue des Ancêtres', 'Tire la liane. La roue tribale décide de ton sort.'),
      chests('pierres_scarabees', 'Pierres à Scarabées', 'Neuf pierres, une seule à retourner. La plupart sont vides.'),
      crash('pont_pourri', 'Le Pont Pourri', 'Le capybara avance. Rappelle-le avant que les planches cèdent.'),
      slots('totem_bavard', 'Le Totem Bavard', 'Trois tambours sculptés. Deux pareils paient, trois paient gros.', ['🌺', '🐒', '🐍', '🗿', '👑']),
    ],
  },
  {
    index: 2, id: 'abysses', name: 'Les Abysses', sub: 'Une salle pressurisée au fond de la fosse',
    mult: 10,
    theme: { bg: '#06131f', fog: '#0a2033', ground: '#0e2a42', accent: '#4aa8dc', light: '#bfe8ff', emoji: '🌊' },
    machines: [
      roulette('roulette_marees', 'Roulette des Marées', 'Rouge, noir… ou la perle verte des profondeurs.'),
      plinko('cascade_perles', 'La Cascade de Perles', 'Lâche la perle. Les bords paient 18 fois, le centre ruine.'),
      bj('bj_epave', 'Blackjack de l’Épave', 'Le croupier-poulpe tire jusqu’à 17. Approche 21 sans dépasser.'),
      hilo('cartes_corsaire', 'Cartes du Corsaire', 'Plus haut ou plus bas ? Enchaîne, puis encaisse avant l’erreur.'),
    ],
  },
  {
    index: 3, id: 'fournaise', name: 'La Fournaise', sub: 'La forge démoniaque de la tour',
    mult: 100,
    theme: { bg: '#1a0d08', fog: '#33140a', ground: '#3d1a0c', accent: '#e8703e', light: '#ffb36b', emoji: '🌋' },
    machines: [
      craps('des_braise', 'Les Dés de Braise', 'Deux dés forgés dans la lave. Sous 7, sur 7, ou pile 7.'),
      slots('forge_lingots', 'La Forge à Lingots', 'Trois frappes. Un lingot, ou des cendres.', ['🪨', '🔥', '⚒️', '💀', '👑']),
      crash('geyser', 'Le Geyser', 'La pression monte, le gain aussi. Lâche la valve à temps.'),
      chests('geodes', 'Les Géodes', 'Neuf géodes au concasseur. Une seule cache une gemme.'),
    ],
  },
  {
    index: 4, id: 'zenith', name: 'Station Zénith', sub: 'Un casino orbital au-dessus de la Terre',
    mult: 1000,
    theme: { bg: '#070812', fog: '#0d1024', ground: '#131735', accent: '#9282f2', light: '#cfd4ff', emoji: '🚀' },
    machines: [
      roulette('roulette_grav', 'Roulette Gravitationnelle', 'La bille orbite un puits de gravité avant de tomber.'),
      plinko('pluie_meteorites', 'Pluie de Météorites', 'Le module dévie de rocher en rocher jusqu’à sa case.'),
      bj('bj_orbital', 'Le 21 Orbital', 'Un croupier-robot, zéro état d’âme, tire à 17.'),
      craps('des_quantiques', 'Les Dés Quantiques', 'Deux dés en superposition. L’observation tranche.'),
    ],
  },
  {
    index: 5, id: 'paradoxe', name: 'Le Paradoxe', sub: 'Le sommet. Rien n’obéit plus à rien.',
    mult: 10000,
    theme: { bg: '#120c1c', fog: '#241536', ground: '#2e1a45', accent: '#e6b64c', light: '#fff3cf', emoji: '🌌' },
    machines: [
      wheel('miroir', 'Le Miroir', 'Toutes les roues de la tour, fondues en une seule.'),
      crash('escalier', 'L’Escalier Infini', 'Monte les marches. Personne ne connaît la marche de trop.'),
      hilo('cartes_destin', 'Cartes du Destin', 'La dernière carte a déjà été tirée. Reste à savoir laquelle.'),
      plinko('chute_infinie', 'La Chute Infinie', 'Une bille lâchée du sommet de la tour. Elle tombe longtemps.'),
    ],
  },
];

export const floorAt = (i: number) => FLOORS[i - 1];
export const machineAt = (floor: number, id: string) => floorAt(floor)?.machines.find(m => m.id === id);

// ---- Objets de la boutique (payés avec les jetons EN MAIN) ----
export type ItemEffect = 'SHIELD' | 'BOOST' | 'INSURANCE' | 'TOLL_CUT' | 'REFUND';

export interface ItemDef {
  id: string; name: string; icon: string; effect: ItemEffect;
  short: string;            // effet en une ligne, affiché en gros
  desc: string;             // détail
  priceFrac: number;        // × plancher de l'étage
  scope: 'ÉQUIPE' | 'PERSO';
}

export const ITEMS: ItemDef[] = [
  {
    id: 'carapace', name: 'Carapace de Tortue', icon: '🐢', effect: 'SHIELD', scope: 'ÉQUIPE',
    short: 'Les 3 prochaines pertes de l’équipe sont divisées par 2',
    desc: 'Chaque perte consomme une charge. Reste actif jusqu’à épuisement.',
    priceFrac: 0.25,
  },
  {
    id: 'fruit_dore', name: 'Fruit Doré', icon: '🥭', effect: 'BOOST', scope: 'ÉQUIPE',
    short: '+25 % sur TOUS les gains de l’équipe',
    desc: 'Actif jusqu’à la fin de l’étage en cours.',
    priceFrac: 0.35,
  },
  {
    id: 'passe_droit', name: 'Passe-Droit', icon: '🔑', effect: 'TOLL_CUT', scope: 'ÉQUIPE',
    short: 'Le Péage de cet étage baisse de 20 %',
    desc: 'Effet immédiat sur l’objectif affiché. Un seul par étage.',
    priceFrac: 0.4,
  },
  {
    id: 'jeton_chance', name: 'Jeton Porte-Bonheur', icon: '🍀', effect: 'REFUND', scope: 'PERSO',
    short: 'TA prochaine mise perdue est remboursée',
    desc: 'Une seule charge, pour toi uniquement.',
    priceFrac: 0.2,
  },
  {
    id: 'oeuf', name: 'Œuf Mystérieux', icon: '🥚', effect: 'INSURANCE', scope: 'ÉQUIPE',
    short: 'En cas de chute, l’équipe garde 30 % de la cagnotte',
    desc: 'Assurance : ne sert que si vous échouez. Se consomme à la chute.',
    priceFrac: 0.45,
  },
];

export const itemAt = (id: string) => ITEMS.find(i => i.id === id);
