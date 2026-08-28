# ASCENSION — slice verticale (jalon J1)

Party game de gambling coopératif : 2–4 téléphones, une banque commune, 5 étages, un Péage par étage.

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

Un joueur crée une table → code à 4 lettres → les autres rejoignent.

## Tests

```bash
# serveur accéléré x10 dans un terminal :
SPEED=10 npm -w server run dev
# puis :
node test/smoke.mjs           # 2 bots jouent une vraie partie
SPEED=10 npx tsx test/flow.mjs  # machine à états déterministe (péage→shop→victoire, assurance)
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
test/               ← smoke (réseau) + flow (machine à états)
```

Réglages rapides : tout est dans `shared/content.ts` (mises, péages, segments de roue, house edge, objets, thèmes). Les durées de phase sont dans `server/src/room.ts` (`DUR`).
