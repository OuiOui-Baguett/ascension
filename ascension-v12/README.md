# ASCENSION — slice verticale (jalon J1)

Party game de gambling coopératif : **jusqu'à 8 téléphones**, une cagnotte commune, 5 étages, un Péage par étage.

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
npx tsx test/move.mjs             # relais des positions entre joueurs
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
