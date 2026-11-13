// Objets en vente à la caisse (prix de départ, ±30 % selon la nuit) — voir le dossier de règles.
export interface Item { id: string; name: string; price: number; stock: number; desc: string }
export const ITEMS: Item[] = [
  { id: 'fumi', name: 'Fumigène', price: 250, stock: 3, desc: 'Rideau de fumée 15 s : coupe toutes les lignes de vue.' },
  { id: 'crochet', name: 'Kit de crochetage', price: 300, stock: 3, desc: 'Ouvre portes, coffres et tiroirs (petit jeu d\'adresse). Réutilisable.' },
  { id: 'sac', name: 'Grand sac de sport', price: 300, stock: 3, desc: 'Porte 2 sacs de butin à la fois au lieu d\'un.' },
  { id: 'somni', name: 'Somnifère', price: 350, stock: 2, desc: 'Endort un vigile 2 minutes. Approche-le par derrière.' },
  { id: 'badge', name: 'Faux badge du personnel', price: 400, stock: 2, desc: 'Ouvre les portes du personnel 3 fois (pas le bureau du directeur).' },
  { id: 'tenue', name: 'Tenue de serveur', price: 600, stock: 2, desc: '90 s en zone privée sans alerter les vigiles.' },
  { id: 'brouilleur', name: 'Brouilleur de caméras', price: 800, stock: 2, desc: 'Coupe 60 s les caméras à moins de 12 m.' },
];
export const START_MONEY = 500;

/** Menu piégé de la caisse, visible seulement par l'indic : l'effet part tout de suite. */
export interface TrapItem { id: string; name: string; price: number; desc: string; seen: 'envelope' | 'phone' }
export const TRAP_ITEMS: TrapItem[] = [
  { id: 'tuyau', name: 'Tuyau aux flics', price: 300, desc: '+15 % de chaleur, tout de suite.', seen: 'envelope' },
  { id: 'vigile', name: 'Vigile prévenu', price: 400, desc: 'Un vigile de plus patrouille dans les zones privées jusqu\'à la fin de la nuit.', seen: 'envelope' },
  { id: 'fauxcode', name: 'Faux code', price: 500, desc: 'Un morceau du code de la chambre forte est falsifié : ceux qui le liront ensuite auront un faux chiffre. Un mauvais code tapé = +10 % de chaleur.', seen: 'envelope' },
];
/** Nombre de coups piégés par indic et par nuit */
export const TRAP_LIMIT = 5;
