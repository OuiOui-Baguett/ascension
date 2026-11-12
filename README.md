# Le Casse

Jeu de braquage coopératif pour 3 à 8 joueurs sur mobile, avec un ou plusieurs indics cachés dans l'équipe.
Navigateur (lien / PWA), Three.js + Vite + TypeScript, serveur Node (WebSocket).

**État actuel : étape 2 — argent et caisse.** Parties par code, personnage tiré au sort, vue à l'épaule,
reconnexion (étape 1). Chacun entre avec 500 €, horloge de la nuit (23 h 47 → 3 h), caisse avec les 11 objets
(prix ±30 % et stocks par nuit), sac, dons d'argent entre joueurs, roulette européenne à plusieurs (vraie bille
qui tombe sur le numéro tiré par le serveur), machines à sous avec jackpot progressif commun.
Pas encore d'indic, de vigiles ni de casse : les objets achetés ne font encore rien.

**Voix (ElevenLabs)** : maître de jeu (explication des règles en 8 chapitres, lancée à la première visite et
via « Le maître de jeu t'explique tout »), narration de la cinématique, croupier (annonces et les 37 numéros),
caissière, annonce du jackpot. Fichiers dans `public/res/voix/`.

## Jouer en ligne avec des amis (hébergement gratuit sur Render)

1. Va sur <https://render.com> et connecte-toi avec ton compte GitHub.
2. **New +** → **Blueprint** → choisis ce dépôt. Render lit `render.yaml` tout seul.
3. Clique **Apply**. La première construction prend 3 à 5 minutes.
4. Render te donne une adresse du type `https://le-casse-xxxx.onrender.com` : c'est le lien du jeu.
   Ouvre-le sur ton iPhone, crée une partie, envoie le code de 4 lettres à tes potes.

Si Render refuse le Blueprint, fais-le à la main : **New +** → **Web Service** → ce dépôt, puis
Build Command `npm install --include=dev && npm run build`, Start Command `npm start`, offre **Free**.

À savoir : avec l'offre gratuite, le serveur s'endort après 15 minutes sans joueur. La première personne qui ouvre
le lien attend alors environ 50 secondes le temps qu'il se réveille. Chaque nouveau `git push` redéploie le jeu.

## Lancer en local

```bash
npm install
npm run dev:server   # serveur de jeu sur le port 8787 (à laisser tourner)
npm run dev          # site sur http://localhost:5173 (dans un 2e terminal)
```

Version de production en local : `npm run build && npm start` puis <http://localhost:8787>.
Version d'aperçu sans serveur (avec des bots) : `npm run build:solo` → `dist-solo/`.

Paramètres utiles dans l'URL : `?local` (serveur dans la page, avec bots), `?quality=high|medium|low`,
`?server=wss://autre-serveur/ws`, `?view=hall`, `?shot=0`, `?clean`.

Commandes au clavier : ZQSD / WASD pour marcher, Maj pour courir, souris (clic-glisser) pour tourner la caméra,
E pour utiliser (caisse, roulette, machine), Espace pour lancer une machine, Échap pour fermer.
Sur téléphone : pouce gauche = joystick (poussé à fond = course), glisser à droite = caméra.

## Structure

- `shared/` — protocole et cœur du serveur de jeu (salons, tirage des personnages, positions, bots) ;
  il tourne aussi dans la page pour la version d'aperçu
- `server/` — serveur Node : sert le site et les parties en WebSocket sur `/ws`
- `src/net.ts` — connexion, jeton de reconnexion, mode local
- `shared/items.ts`, `shared/games.ts`, `shared/layout.ts` — objets, règles et cotes des jeux, plan du casino
- `src/play.ts` — interface de la nuit : argent, horloge, caisse, sac, roulette, machines
- `src/player.ts` — corps des joueurs (Rocketbox), animations marche/course, interpolation des autres joueurs
- `src/cam.ts` — plans de cinéma et vue à l'épaule
- `src/gfx/` — moteur de rendu (post-process, reflets planaires, pluie, textures peintes)
- `src/world/` — la rue, le hall, les salles, les figurants
- `public/res/` — modèles et textures (Poly Haven CC0, Microsoft Rocketbox MIT), optimisés pour le mobile
- `tools/` — scripts de téléchargement / optimisation / emballage des assets

Crédits et licences : voir `CREDITS.md`. Les anciennes versions d'Ascension restent dans l'historique Git.
