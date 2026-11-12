// Objets en vente à la caisse (prix de départ, ±30 % selon la nuit) — voir le dossier de règles.
export interface Item { id: string; name: string; price: number; stock: number; desc: string }
export const ITEMS: Item[] = [
  { id: 'gants', name: 'Gants', price: 150, stock: 99, desc: 'Tes erreurs font monter la chaleur 2 fois moins.' },
  { id: 'talkie', name: 'Talkie-walkie', price: 200, stock: 4, desc: 'Messages privés à un coéquipier.' },
  { id: 'fumi', name: 'Fumigène', price: 250, stock: 3, desc: 'Rideau de fumée 15 s : coupe toutes les lignes de vue.' },
  { id: 'crochet', name: 'Kit de crochetage', price: 300, stock: 3, desc: 'Ouvre portes, casiers et tiroirs.' },
  { id: 'sac', name: 'Grand sac de sport', price: 300, stock: 3, desc: 'Porte 2 fois plus de butin.' },
  { id: 'somni', name: 'Somnifère', price: 350, stock: 2, desc: 'Endort un vigile ou un employé 2 minutes.' },
  { id: 'badge', name: 'Faux badge du personnel', price: 400, stock: 2, desc: 'Ouvre les portes du personnel 3 fois.' },
  { id: 'tenue', name: 'Tenue de serveur', price: 600, stock: 2, desc: '90 s en zone privée sans alerter les vigiles.' },
  { id: 'usb', name: 'Clé USB pirate', price: 700, stock: 1, desc: 'Pirater 2 fois plus vite.' },
  { id: 'brouilleur', name: 'Brouilleur de caméras', price: 800, stock: 2, desc: "Coupe les caméras d'une pièce 60 s." },
  { id: 'perceuse', name: 'Perceuse thermique', price: 2000, stock: 1, desc: 'Perce la chambre forte en 90 s. Très bruyante.' },
];
export const START_MONEY = 500;

/** Menu piégé de la caisse, visible seulement par l'indic : l'effet part tout de suite. */
export interface TrapItem { id: string; name: string; price: number; desc: string; seen: 'envelope' | 'phone' }
export const TRAP_ITEMS: TrapItem[] = [
  { id: 'tuyau', name: 'Tuyau aux flics', price: 300, desc: '+15 % de chaleur, tout de suite.', seen: 'envelope' },
  { id: 'fauxcode', name: 'Faux code', price: 500, desc: 'Un chiffre du code de la chambre forte devient faux (servira au casse).', seen: 'envelope' },
  { id: 'balise', name: 'Balise sur la camionnette', price: 800, desc: 'La fuite prendra 30 s de plus (servira au casse).', seen: 'envelope' },
];
/** Nombre de coups piégés par indic et par nuit */
export const TRAP_LIMIT = 5;
