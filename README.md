# Naufragés

Jeu de baston en 3D à la première personne, sur une île déserte, de 2 à 8 joueurs sur mobile (navigateur / PWA).
Three.js + Vite + TypeScript, serveur Node (WebSocket). Remplace Le Casse (et Ascension) : les anciennes versions
restent dans l'historique Git.

**État actuel : étape 1 — l'arène.** L'île (plage, dune, colline, cabane au toit praticable, caisses, rochers,
palmiers, feu de camp, ponton au-dessus de l'eau, épave au large), la mer cartoon avec écume sur le rivage,
le déplacement à la première personne (course, saut, double saut, esquive), deux attaques communes en attendant
les 6 personnages (coup de poing en combo de 3, orbe d'énergie qui explose), la jauge de dégâts en % (plus elle est
haute, plus on vole loin), la chute dans l'eau = une vie perdue, retour par un rayon de lumière avec 2 s de
bouclier, 3 vies (réglable 1 à 5), dernier debout gagne, classement, revanche. Parties par code, bots pour
s'entraîner seul, reconnexion.

## Commandes

- Téléphone (à l'horizontale) : pouce gauche n'importe où à gauche = joystick, glisser à droite = regarder,
  boutons Frapper / Pouvoir / Saut / Esquive.
- Ordinateur : clic dans le jeu pour viser à la souris, ZQSD ou WASD pour bouger, clic gauche = frapper,
  clic droit ou E = pouvoir, Espace = sauter (2 fois en l'air), Maj = esquive.

## Jouer en ligne avec des amis (hébergement gratuit sur Render)

1. Va sur <https://render.com> et connecte-toi avec ton compte GitHub.
2. **New +** → **Blueprint** → choisis ce dépôt. Render lit `render.yaml` tout seul. Clique **Apply**.
3. Render donne une adresse du type `https://naufrages-xxxx.onrender.com` : c'est le lien du jeu.

Offre gratuite : le serveur s'endort après 15 minutes sans joueur, le premier à ouvrir le lien attend ~50 s.

## Lancer en local

```bash
npm install
npm run dev:server   # serveur de jeu, port 8787
npm run dev          # site sur http://localhost:5173
```
Version d'aperçu sans serveur (avec des bots) : `npm run build:solo` → `dist-solo/`.
Paramètres d'URL : `?local` (serveur dans la page), `?quality=high|medium|low`, `?train` (entraînement direct).

## Structure

- `shared/island.ts` — l'île : relief, obstacles, points d'apparition (commun au serveur et à la page)
- `shared/fight.ts` — physique des combattants et règles des coups
- `shared/core.ts` — serveur de jeu : salons, manches, coups, éjections, bots
- `shared/protocol.ts` — messages
- `server/` — serveur Node (site + WebSocket `/ws`)
- `src/world.ts` — l'île à l'écran (ciel, mer, décor) · `src/fx.ts` — effets des sorts
- `src/avatars.ts` — combattants provisoires et gants à la 1re personne · `src/main.ts` — menus, combat, HUD
