// ============================================================
// Catalogue des jeux. La page d'accueil et le serveur lisent CE fichier :
// ajouter un jeu, c'est ajouter une entrée ici + son module.
// ============================================================
export interface GameDef {
  id: string;
  name: string;
  tagline: string;
  desc: string;
  icon: string;
  minPlayers: number;
  maxPlayers: number;
  accent: string;
}

export const GAMES: GameDef[] = [
  {
    id: 'ascension', name: 'ASCENSION', icon: '🎰', accent: '#e6b64c',
    tagline: '5 étages, une cagnotte commune',
    desc: 'Montez la tour-casino. Tout le monde mise dans le même pot — et tout le monde peut tout perdre.',
    minPlayers: 1, maxPlayers: 8,
  },
  {
    id: 'fish', name: 'FISH & FURY', icon: '🎣', accent: '#3fd0c9',
    tagline: 'Pêche coopérative et chaotique',
    desc: 'Vous êtes venus pêcher tranquillement. Cinq minutes plus tard, quelqu’un est traîné au large par un poisson.',
    minPlayers: 1, maxPlayers: 8,
  },
];

export const gameAt = (id: string) => GAMES.find(g => g.id === id) ?? GAMES[0];
