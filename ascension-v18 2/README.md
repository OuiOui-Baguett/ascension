# ASCENSION + FISH & FURY — deux jeux, une seule appli (v18 « claque »)

## v18 — refonte visuelle complète de l'étage 1 et de l'interface

- **Nouveau moteur de rendu** (`client/src/gfx/engine.ts`) : occlusion ambiante (N8AO), halo HDR,
  anticrénelage SMAA, courbe filmique AgX, étalonnage, vignette, grain. Trois niveaux de qualité
  (haut / moyen / bas) choisis automatiquement selon les images/seconde réelles ; `?quality=` force.
- **La Canopée refaite de zéro** (`client/src/jungle/`) : temple englouti, sol dallé qui se perd
  dans l'humus, enceinte en ruine, idole géante qui crache une cascade dans un bassin, arbres
  colosses, canopée qui filtre le soleil en faisceaux, braseros, lucioles, papillons, brume.
- **Les 6 machines remodelées** + comptoir en paillote + tam-tam (radio) ; le Pont Pourri traverse
  un vrai gouffre ; capybara, sanglier, paresseux et tortue animés.
- **Avatars animés** : petit robot riggé (marche, course, émotes), teint à la couleur du joueur,
  chapeau sur l'os de la tête.
- **Interface « relique d'or »** : typo Lilita One + Outfit, verre fumé chaud, boutons en relief,
  écran de chargement des assets.
- **Mode solo sans serveur** : `?solo` (ou build `VITE_SOLO=1`) fait tourner les mêmes règles
  dans le navigateur (`server/src/router.ts`, partagé avec le vrai serveur).
- Les étages 2 à 5 gardent leur décor v17 (rendu par le nouveau moteur) : prochaine étape.

Assets : uniquement des fichiers libres CC0 (voir `CREDITS.md`), optimisés pour mobile
(`client/public/res/`, ~12 Mo). Rien ne vient du jeu d'origine.

**Déployer sur Render** : pousser ce dossier sur GitHub, puis dans Render → Settings →
*Root Directory* = `ascension-v18`. Commandes inchangées. `/version` doit répondre `v18-claque`.

---


Un **menu d'accueil** propose deux jeux. Le salon, les codes de table, la reconnexion,
les émotes, la radio et le relais de position sont **communs** (`server/src/base.ts`,
`BaseRoom`) ; chaque jeu n'écrit que ses règles. Côté client, FISH & FURY est
**chargé à la demande** : tant qu'on ne le choisit pas, son code n'est pas téléchargé
(build : `ui-*.js`, ~36 ko à part).

---

## 1. ASCENSION — slice verticale (jalon J1)

Party game de gambling coopératif : **jusqu'à 8 téléphones**, une cagnotte commune, 5 étages, un Péage par étage.

**Rendu** — le moteur fait le gros du travail visuel, pas la quantité d'objets :
courbe filmique ACES + sortie sRGB, carte d'environnement PMREM (c'est elle qui fait que l'or
ressemble à de l'or), ombres portées PCF douces, halo lumineux (bloom) réglé haut pour que seuls
les néons et l'or débordent, et un projecteur à faisceau visible au-dessus de chaque machine.
Toutes les matières sont des **textures générées en code** (moquette damassée, tenture murale,
marbre veiné, bois verni, velours) : aucun fichier d'image à charger.

**Une vraie salle** : arène de 33 m, mur tendu à soubassement de marbre, plafond, colonnes,
appliques, lustre, bar garni, coins salon, cordons de velours, et une **pièce maîtresse par
étage** — idole et cascade, baie sur la fosse, chute de lave et enclume, baie sur la Terre,
anneaux en lévitation. Coût mesuré : ~670 objets et ~77 000 triangles par étage.

**Contrôle visuel** — `?look=N` braque la caméra sur la machine N (ou `shop` / `radio`), et
`window.__fx` déclenche une animation sans jouer : c'est ce qui permet de vérifier une machine
en une capture au lieu d'une partie entière. `?quality=low|high` force le niveau de rendu.

**Radio du casino** — un juke-box dans la salle, six stations composées EN DIRECT par le client
(marimba et congas, ambient sous-marin, techno de forge, synthwave, lounge jazzy, ou la simple
nappe de l'étage). Aucun morceau, aucun fichier audio : un ordonnanceur réveille des oscillateurs
Web Audio en avance de phase, avec batterie, basse, accords et réverbération générée. La station
est commune à la table : celui qui la change la change pour tout le monde.

**30 machines, 11 mécaniques** : roue, crash, machine à sous, hi-lo, roulette, blackjack, craps,
coffres, plinko, mines, course. 6 machines par étage, toutes de types différents.

**Équilibrage** — les machines rendent ~100 % de ce qu'elles encaissent : ici la « maison » n'existe
pas, il n'y a personne à enrichir. La difficulté vient du chrono (3 min), du péage (1,65 × le plancher
de l'étage) et de la variance. Mesuré par simulation : **environ 5 % des parties atteignent le sommet**
à une table de 4, 2,6 % en solo. `test/ev.mjs` et `test/winrate.mjs` revérifient ces deux chiffres.

## Lancer en local (Mac)

Prérequis : Node.js ≥ 20 (`brew install node` si besoin).

```bash
npm install
npm run dev
```

- Serveur de jeu : port **2567** · Client : port **5173**
- Sur ton Mac : ouvre http://localhost:5173
- Sur les iPhones (même Wi-Fi) : ouvre `http://IP-DU-MAC:5173`
  (l'IP s'affiche dans le terminal Vite, ligne "Network")

Un joueur crée une table → code à 4 caractères (lettres ET chiffres) → les autres rejoignent.

## Tests

Tout d'un coup (build + 7 suites, gère lui-même les deux vitesses de serveur) :

```bash
sh test/run.sh
```

Au détail :

```bash
SPEED=10 npx tsx test/money.mjs   # les 30 machines : cagnotte et bilans restent synchrones
SPEED=10 npx tsx test/flow.mjs    # machine à états (péage → ascenseur → victoire, assurance)
N=60000 npx tsx test/ev.mjs       # rendement réel des 11 mécaniques (cible 100 %)
N=1500 npx tsx test/winrate.mjs   # taux de victoire d'une partie complète
# serveur accéléré (SPEED=10 PORT=2567) puis :
npx tsx test/smoke.mjs            # 2 bots jouent une vraie partie
npx tsx test/eight.mjs            # 8 joueurs : couleurs et places distinctes, 9e refusé
# serveur à vitesse réelle (l'étage dure 3 min) puis :
npx tsx test/play.mjs             # parcours navigateur complet
npx tsx test/floors.mjs           # les 5 étages se construisent sans erreur
npx tsx test/move.mjs             # relais des positions (dont les bords de la salle)
npx tsx test/radio.mjs            # radio : propagation à la table + le son sort vraiment
npx tsx test/floorswap.mjs        # 10 changements d'étage : décor et textures intacts
```

## Production (plus tard, VPS)

```bash
npm run build   # construit client/dist
npm start       # le serveur sert le jeu ET le WebSocket sur le port 2567
```

Derrière Caddy pour HTTPS/WSS (nécessaire pour la PWA).

## Structure

```
shared/content.ts   ← LA source de vérité du game design (étages, machines, objets, formules)
server/src/room.ts  ← serveur autoritaire : banque, mises, tirages, péages, chute
server/src/index.ts ← HTTP + WebSocket /ws + rooms
client/src/         ← Three.js (scène par étage) + UI DOM mobile + reconnexion auto
test/               ← run.sh (tout) + money, flow, ev, winrate, smoke, eight, play, floors, move
```

Réglages rapides : tout est dans `shared/content.ts` (mises, péages, segments de roue, house edge, objets, thèmes). Les durées de phase sont dans `server/src/room.ts` (`DUR`).

---

## 2. FISH & FURY — pêche coopérative et chaotique

Même direction artistique, même appli, **jusqu'à 8 joueurs**. Une crique : un ponton
avec une avancée sur l'eau, une plage, deux étals (marché et équipement), un bateau,
des falaises au fond, un phare et des îlots à l'horizon. Tout est généré en code,
comme le casino : aucun fichier d'image, aucun modèle 3D.

**La boucle** — on marche jusqu'au bout du ponton, on **maintient** pour charger le
lancer (plus long = plus loin = plus profond), on attend la touche, on **ferre** dans
la fenêtre, puis on **mouline par à-coups** : la ligne monte en tension quand le
poisson tire, il faut relâcher avant la rupture. 7 espèces, 4 cannes, 3 appâts,
variantes et raretés. On vend sa besace au marché, on s'équipe à l'étal d'à côté.

**Le chaos, mis en scène** (`chaos()` dans `server/src/fishroom.ts`) — pas de moteur
physique, des règles écrites que tout le monde voit pareil, parce que le serveur les
décide :

| Moment | Règle |
|---|---|
| **Arraché** | Au-delà de **6 kg**, le poisson ne tire plus sur la ligne mais sur le pêcheur : un pas vers le large à chaque à-coup. |
| **À l'eau** | Plus de planche = baignade de 4,5 s, prise ferrée perdue, et une prise de la besace qui repart à la mer. Dans l'axe du ponton on a 9 m de rab ; sur le bord de la plateforme, une seconde. |
| **Reculer** | Pendant un combat on peut marcher — **mais pas en moulinant**. Gagner de la ligne ou sauver ses pieds : il faut choisir. |
| **Lignes croisées** | Deux combats en cours s'emmêlent : mouliner coûte le double pendant 2,6 s. Il faut se parler. |
| **Vague** | Elle balaie le ponton, recule tout le monde et fait lâcher les touches en cours. |

**Équilibrage mesuré** — `test/fishfight.mjs` (horloge virtuelle) donne la durée d'un
combat par canne et par espèce : bambou → communs 5-6 s, épique 15 s, légendaire
impossible ; acier → légendaire 29,5 s ; abysse → légendaire 20 s. La valeur d'une
prise ne compte **pas** la rareté (elle est déjà payée deux fois : dans la valeur de
base de l'espèce et dans sa probabilité d'apparition).

```bash
npx tsx test/fishchaos.mjs        # arraché, chute, remontée, croisements, vague
npx tsx test/fishfight.mjs        # rythme des combats, canne par canne
# serveur accéléré puis :
npx tsx test/fish.mjs             # boucle complète + économie + besace pleine
npx tsx test/twogames.mjs         # deux tables, deux jeux, aucune fuite de règles
# serveur au ralenti (SPEED=0.3) puis :
npx tsx test/vfishplay.mjs        # parcours navigateur : lancer → ferrer → prise
```

### Contrôle du typage

`npm run build` lance d'abord `npm run check` (`tsc --noEmit` sur `shared`, `client`
et `server`). Vite ne type pas : sans cette étape, un import oublié passe le build et
casse la page en silence — c'est exactement ce qui est arrivé au menu (`GAMES is not
defined`, page blanche).
