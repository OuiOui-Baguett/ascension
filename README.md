# Le Casse

Jeu de braquage coopératif pour 4 à 8 joueurs sur mobile, avec un indic caché dans l'équipe.
Navigateur (lien / PWA), Three.js + Vite + TypeScript.

**État actuel : test de rendu** — écran d'accueil (rue sous la pluie), cinématique d'entrée,
hall du Grand Casino en marche libre. Pas encore de gameplay ni de personnages.

## Lancer en local

```bash
npm install
npm run dev          # http://localhost:5173
npm run build:solo   # version autonome dans dist-solo/
```

Paramètres de debug dans l'URL : `?quality=high|medium|low`, `?view=hall`, `?shot=0`, `?clean`.

## Structure

- `src/gfx/` — moteur de rendu (post-process, reflets planaires, pluie, textures peintes)
- `src/world/` — la rue (`street.ts`) et le hall du casino (`hall.ts`)
- `src/cam.ts` — plans de cinéma et marche libre (joystick + glisser)
- `public/res/` — modèles et textures CC0 (Poly Haven), optimisés pour le mobile
- `tools/` — scripts de téléchargement / optimisation / emballage des assets

Les anciennes versions d'Ascension restent disponibles dans l'historique Git.
