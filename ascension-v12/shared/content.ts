// ============================================================
// ASCENSION — contenu partagé client / serveur / tests
// Source de vérité du game design.
// ============================================================

export type Archetype =
  | 'WHEEL' | 'CRASH' | 'SLOTS' | 'HILO'
  | 'ROULETTE' | 'BLACKJACK' | 'CRAPS'
  | 'CHESTS' | 'PLINKO' | 'MINES' | 'RACE';

export interface WheelSegment { mult: number; weight: number }
export interface Runner { name: string; icon: string; weight: number }
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
  plinko?: { mults: number[]; dropMs: number; maxBalls: number };
  mines?: { cells: number; bombs: number; edge: number; decideMs: number };
  race?: { runners: Runner[]; raceMs: number; edge: number };
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
// Péage = 1,65 × le plancher de l'étage. Valeur choisie par simulation :
// à ×2 la tour était ingagnable (0,4 %), ici une partie sur vingt atteint le sommet.
export const tollOf = (f: FloorDef) => 1650 * f.mult;

export const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR') + ' $';
export const CARD_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ---- Réactions rapides (au-dessus de la tête, purement social) ----
export const EMOTES = ['👍', '😱', '🤡', '💰', '🔥', '😭', '🙏', '🤝'];

// ---- Skins des personnages (choisis à l'accueil, gratuits) ----
// 8 couleurs bien distinctes : une par joueur d'une table pleine
export const SKIN_COLORS = [
  '#e6b64c', '#4aa8dc', '#e05c5c', '#5cb46e',
  '#b07de0', '#e08a3e', '#3fd0c9', '#f07ab0',
];
export const MAX_PLAYERS = 8;
export const HATS = [
  { id: 0, name: 'Sans' },
  { id: 1, name: 'Casquette' },
  { id: 2, name: 'Couronne' },
  { id: 3, name: 'Haut-de-forme' },
  { id: 4, name: 'Antennes' },
  { id: 5, name: 'Auréole' },
];

// ---- Tables de gains ----
// Règle de conception : ici la « maison » n'existe pas, il n'y a personne à enrichir.
// Chaque machine rend ~100 % de ce qu'elle encaisse. La difficulté vient du chrono,
// du péage à doubler et de la variance — pas d'une taxe invisible qui condamne l'équipe.
const WHEEL_BASE: WheelSegment[] = [
  { mult: 0, weight: 46.5 }, { mult: 0.5, weight: 20 }, { mult: 1, weight: 12 },
  { mult: 2, weight: 9 }, { mult: 3, weight: 5 }, { mult: 5, weight: 3.5 },
  { mult: 8, weight: 2 }, { mult: 20, weight: 0.5 },
];                                                                     // EV 1.000
const slotSet = (e: [string, string, string, string, string]): SlotSymbol[] => [
  { e: e[0], color: '#7ec98a', weight: 40, pair: 0.55, triple: 3.2 },
  { e: e[1], color: '#4aa8dc', weight: 30, pair: 1.05, triple: 5.3 },
  { e: e[2], color: '#c95f8a', weight: 18, pair: 1.55, triple: 10.5 },
  { e: e[3], color: '#e8703e', weight: 9, pair: 3.2, triple: 26 },
  { e: e[4], color: '#e6b64c', weight: 3, pair: 8.5, triple: 105 },
];                                                                     // EV 1.004
const CHEST_MULTS = [0, 0, 0, 0, 0.5, 1, 1.5, 2.5, 3.5];              // EV 1.000
const PLINKO_MULTS = [19, 4.1, 1.35, 0.52, 0.26, 0.52, 1.35, 4.1, 19]; // EV 0.999

// Concurrents des courses : 4 partants, cotes tirées des poids (le favori paie peu).
const RUNNERS = (a: [string, string], b: [string, string], c: [string, string], d: [string, string]): Runner[] => [
  { icon: a[0], name: a[1], weight: 40 },
  { icon: b[0], name: b[1], weight: 30 },
  { icon: c[0], name: c[1], weight: 20 },
  { icon: d[0], name: d[1], weight: 10 },
];
/** Cote affichée d'un partant : mise × cote s'il gagne. */
export const raceOdds = (r: { runners: Runner[]; edge: number }, i: number) => {
  const total = r.runners.reduce((s, x) => s + x.weight, 0);
  return Math.round(((1 - r.edge) * total / r.runners[i].weight) * 100) / 100;
};
/** Multiplicateur des Mines après k cases sûres (formule combinatoire, sans taxe). */
export const minesMult = (m: { cells: number; bombs: number; edge: number }, k: number) => {
  let x = 1 - m.edge;
  for (let i = 0; i < k; i++) x *= (m.cells - i) / (m.cells - m.bombs - i);
  return Math.round(x * 100) / 100;
};

const wheel = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'WHEEL', desc, wheel: { segments: WHEEL_BASE, spinMs: 3800 } });
const crash = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'CRASH', desc, crash: { growth: 1.07, tickMs: 300, edge: 0 } });
const slots = (id: string, name: string, desc: string, e: [string, string, string, string, string]): MachineDef =>
  ({ id, name, archetype: 'SLOTS', desc, slots: { symbols: slotSet(e), spinMs: 2800 } });
const hilo = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'HILO', desc, hilo: { edge: 0, maxSteps: 5, decideMs: 12_000 } });
const roulette = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'ROULETTE', desc, roulette: { spinMs: 3500, colorMult: 2.055, greenMult: 37 } });
const bj = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'BLACKJACK', desc, bj: { decideMs: 15_000, winMult: 2.12, naturalMult: 2.5 } });
const craps = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'CRAPS', desc, craps: { rollMs: 2200, sideMult: 2.4, sevenMult: 6 } });
const chests = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'CHESTS', desc, chests: { mults: CHEST_MULTS, openMs: 1400 } });
const plinko = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'PLINKO', desc, plinko: { mults: PLINKO_MULTS, dropMs: 2600, maxBalls: 5 } });
const mines = (id: string, name: string, desc: string): MachineDef =>
  ({ id, name, archetype: 'MINES', desc, mines: { cells: 25, bombs: 3, edge: 0, decideMs: 20_000 } });
const race = (id: string, name: string, desc: string, r: Runner[]): MachineDef =>
  ({ id, name, archetype: 'RACE', desc, race: { runners: r, raceMs: 4200, edge: 0 } });

// Chaque étage : 6 machines de types TOUS DIFFÉRENTS (11 mécaniques réparties sur 30 machines).
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
      mines('champ_fourmis', 'Le Champ de Fourmis', 'Vingt-cinq feuilles, trois fourmilières. Retourne, encaisse, ou insiste.'),
      race('course_capybaras', 'La Course des Capybaras', 'Quatre capybaras, une seule ligne d’arrivée. Le favori paie peu.',
        RUNNERS(['🦫', 'Gros Pépin'], ['🐗', 'Sanglier'], ['🦥', 'Paresseux'], ['🐢', 'Tortue'])),
    ],
  },
  {
    index: 2, id: 'abysses', name: 'Les Abysses', sub: 'Une salle pressurisée au fond de la fosse',
    mult: 10,
    theme: { bg: '#06131f', fog: '#0a2033', ground: '#0e2a42', accent: '#4aa8dc', light: '#bfe8ff', emoji: '🌊' },
    machines: [
      roulette('roulette_marees', 'Roulette des Marées', 'Rouge, noir… ou la perle verte des profondeurs.'),
      plinko('cascade_perles', 'La Cascade de Perles', 'Lâche jusqu’à 5 perles d’un coup. Les bords paient ×18, le centre ruine.'),
      bj('bj_epave', 'Blackjack de l’Épave', 'Le croupier-poulpe tire jusqu’à 17. Approche 21 sans dépasser.'),
      hilo('cartes_corsaire', 'Cartes du Corsaire', 'Plus haut ou plus bas ? Enchaîne, puis encaisse avant l’erreur.'),
      mines('mines_derivantes', 'Les Mines Dérivantes', 'Vingt-cinq casiers rouillés. Trois contiennent encore une charge.'),
      race('course_anguilles', 'La Course des Anguilles', 'Quatre anguilles lâchées dans le tube. Parie sur la bonne.',
        RUNNERS(['🐟', 'Bar Rayé'], ['🦑', 'Encre'], ['🐙', 'Huit-Pattes'], ['🦈', 'Vieux Squale'])),
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
      mines('sol_braise', 'Le Sol de Braise', 'Vingt-cinq dalles. Trois sont creuses et donnent sur la lave.'),
      wheel('roue_forge', 'La Roue de Forge', 'Une meule à aiguiser lancée à pleine vitesse. Elle finit par s’arrêter.'),
    ],
  },
  {
    index: 4, id: 'zenith', name: 'Station Zénith', sub: 'Un casino orbital au-dessus de la Terre',
    mult: 1000,
    theme: { bg: '#070812', fog: '#0d1024', ground: '#131735', accent: '#9282f2', light: '#cfd4ff', emoji: '🚀' },
    machines: [
      roulette('roulette_grav', 'Roulette Gravitationnelle', 'La bille orbite un puits de gravité avant de tomber.'),
      plinko('pluie_meteorites', 'Pluie de Météorites', 'Lâche jusqu’à 5 modules. Chacun dévie jusqu’à sa case.'),
      bj('bj_orbital', 'Le 21 Orbital', 'Un croupier-robot, zéro état d’âme, tire à 17.'),
      craps('des_quantiques', 'Les Dés Quantiques', 'Deux dés en superposition. L’observation tranche.'),
      race('grand_prix_orbital', 'Le Grand Prix Orbital', 'Quatre modules en approche finale. Un seul touche la baie.',
        RUNNERS(['🛰️', 'Sonde 7'], ['🚀', 'Navette'], ['🛸', 'Prototype'], ['☄️', 'Le Débris'])),
      hilo('cartes_vide', 'Cartes du Vide', 'Plus haut, plus bas. Dehors il n’y a ni haut ni bas.'),
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
      plinko('chute_infinie', 'La Chute Infinie', 'Jusqu’à 5 billes lâchées du sommet. Elles tombent longtemps.'),
      mines('damier_paradoxe', 'Le Damier du Paradoxe', 'Vingt-cinq cases. Trois n’existent pas encore, mais te tueront quand même.'),
      race('course_echos', 'La Course des Échos', 'Quatre versions de toi partent en même temps. Une seule arrive.',
        RUNNERS(['👤', 'Toi (hier)'], ['👥', 'Toi (demain)'], ['🕴️', 'Toi (jamais)'], ['🫥', 'Toi (presque)'])),
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
