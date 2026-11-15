// ============================================================
// Les classes : chacune a son coup de base (Frapper), son Pouvoir (temps de recharge)
// et son Ultime (se charge en touchant les autres). Saut et Esquive sont communs.
// poids : multiplie le recul reçu (léger > 1, lourd < 1) ; vitesse : multiplie la course.
// ============================================================
export type ClassId = 'brasier' | 'colosse';
export type Ability = 'atk' | 'pow' | 'ult';

export interface ClassDef {
  id: ClassId; name: string; role: string; desc: string; color: string; weight: number; speed: number;
  atk: { name: string; cd: number }; pow: { name: string; cd: number; desc: string }; ult: { name: string; desc: string };
}
export const CLASSES: Record<ClassId, ClassDef> = {
  brasier: {
    id: 'brasier', name: 'Brasier', role: 'Feu · distance', color: '#ff7a1a', weight: 1, speed: 1,
    desc: 'Arrose de loin et fait décoller les autres avec la lave.',
    atk: { name: 'Feu', cd: .42 },
    pow: { name: 'Geyser', cd: 6, desc: 'Un geyser de lave jaillit là où tu vises et envoie en l\'air.' },
    ult: { name: 'Météore', desc: 'Un météore s\'écrase là où tu vises : énorme explosion.' },
  },
  colosse: {
    id: 'colosse', name: 'Colosse', role: 'Roche · corps à corps', color: '#b08a5a', weight: .72, speed: .9,
    desc: 'Lourd, dur à éjecter, frappe comme un camion.',
    atk: { name: 'Poing', cd: .55 },
    pow: { name: 'Mur', cd: 7, desc: 'Dresse un mur de roche devant toi : bloque les sorts et repousse.' },
    ult: { name: 'Séisme', desc: 'Frappe le sol : tous ceux qui touchent terre autour de toi décollent.' },
  },
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

// ---------- réglages des coups ----------
export const FIREBALL = { speed: 30, radius: .35, life: .95, dmg: 5, kb: 3.4, scale: .065, splash: 1.2 };
export const GEYSER = { range: 20, delay: 550, radius: 2.3, dmg: 12, up: 10, kb: 3, scale: .07 };
export const METEOR = { range: 32, delay: 1300, radius: 5, dmg: 22, kb: 11, scale: .14 };
export const COLOSSE_PUNCH = { range: 2.9, cos: .45, dmg: 9, dmg3: 15, kb: 6.5, kb3: 11, scale: .12, scale3: .15 };
export const WALL = { dist: 2.6, width: 3.6, height: 2.3, life: 6000, push: 9 };
export const QUAKE = { radius: 7.5, dmg: 18, kb: 10, scale: .14 };
/** Charge de l'ultime : par % de dégâts infligés, et un peu avec le temps. */
export const ULT = { perDmg: 2.4, perSec: 1.2 };
