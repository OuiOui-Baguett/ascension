# Naufragés

Jeu de baston en 3D à la première personne, sur une île déserte, de 2 à 8 joueurs sur mobile (navigateur / PWA).
Three.js + Vite + TypeScript, serveur Node (WebSocket). Remplace Le Casse (et Ascension) : les anciennes versions
restent dans l'historique Git.

**État actuel : étape 2 — les classes et la grande île.** Deux classes jouables (sur six prévues) :
**Brasier** (feu, distance, poids moyen — boules de feu, Pouvoir « Geyser » de lave là où on vise avec cercle d'alerte,
Ultime « Météore » qui tombe du ciel) et **Colosse** (roche, corps à corps, lourd et plus lent — gros poings en combo,
Pouvoir « Mur » de roche qui bloque et repousse, Ultime « Séisme » qui fait décoller ceux qui touchent terre).
L'Ultime se charge en touchant les autres (et un peu avec le temps). Île presque deux fois plus grande : camp,
colline, ruines du temple, palmeraie, docks et ponton, îlot du phare relié par un pont de corde. Ombres qui suivent
le joueur, freinage de visée au tactile. Choix de la classe sur l'accueil et dans le salon (les bots alternent).

**Étape 1 bis — l'arène améliorée.** Île agrandie d'un tiers (murets en ruine, caisses, rochers et
palmiers en plus), colline retexturée (herbe au sommet, roche sur les flancs), modes de jeu **Chacun pour soi**,
**Duos** (les potes ensemble, pas de coups entre coéquipiers) et **Potes contre bots**, flèche verte au-dessus des
coéquipiers, caméra qui suit son coéquipier quand on est à l'eau. Téléphone : boutons en arc autour du pouce
(Saut à gauche de Frapper), Frapper en continu en restant appuyé, caméra lissée avec accélération et sensibilité
réglable, visée assistée pour l'orbe, résolution adaptative (plus de rendu pixelisé), décor fusionné pour la fluidité.
Retours de coups : marqueur sur le viseur, % qui s'envolent, flèches vers les adversaires hors de l'écran, indicateur
de la direction d'où vient le coup.

**Étape 1 — l'arène.** L'île (plage, dune, colline, cabane au toit praticable, caisses, rochers,
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
- `shared/fight.ts` — physique des combattants · `shared/classes.ts` — les classes et leurs coups
- `shared/core.ts` — serveur de jeu : salons, manches, coups, éjections, bots
- `shared/protocol.ts` — messages
- `server/` — serveur Node (site + WebSocket `/ws`)
- `src/world.ts` — l'île à l'écran (ciel, mer, décor) · `src/fx.ts` — effets des sorts
- `src/avatars.ts` — combattants provisoires et gants à la 1re personne · `src/main.ts` — menus, combat, HUD
