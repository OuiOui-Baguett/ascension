#!/bin/sh
# Suite complète. Deux vitesses de serveur : les tests de logique tournent en accéléré,
# le parcours navigateur a besoin d'un étage de 3 minutes.
set -e
cd "$(dirname "$0")/.."

# Un serveur oublié sur le port fausse TOUTE la suite en silence : les tests
# parlent alors à la mauvaise version, à la mauvaise vitesse. On fait le ménage.
libere_port() {
  pkill -f "src/index.ts" 2>/dev/null || true
  sleep 1
  if (exec 3<>/dev/tcp/127.0.0.1/2567) 2>/dev/null; then
    echo "ABANDON : le port 2567 est toujours occupé."; exit 1
  fi
}
libere_port

npm run build     # le build lance d'abord le typage (npm run check)

echo "\n=== logique (hors réseau) ==="
SPEED=10 npx tsx test/money.mjs | tail -1
SPEED=10 npx tsx test/flow.mjs  | tail -1
N=60000 npx tsx test/ev.mjs     | tail -1
npx tsx test/fishchaos.mjs      | tail -1

echo "\n=== serveur accéléré (SPEED=10) ==="
SPEED=10 PORT=2567 npx tsx server/src/index.ts > /tmp/asc-fast.log 2>&1 &
FAST=$!; sleep 5
npx tsx test/smoke.mjs | tail -1
npx tsx test/eight.mjs | tail -1
npx tsx test/fish.mjs  | tail -1
npx tsx test/twogames.mjs | tail -1
kill $FAST 2>/dev/null || true; libere_port

echo "\n=== serveur vitesse réelle ==="
PORT=2567 npx tsx server/src/index.ts > /tmp/asc-slow.log 2>&1 &
SLOW=$!; sleep 5
npx tsx test/floorswap.mjs | tail -1
npx tsx test/radio.mjs  | tail -1
npx tsx test/floors.mjs | tail -1
npx tsx test/move.mjs   | tail -1
kill $SLOW 2>/dev/null || true; libere_port

echo "\n=== serveur au ralenti (parcours complet) ==="
SPEED=0.5 PORT=2567 npx tsx server/src/index.ts > /tmp/asc-play.log 2>&1 &
PLAY=$!; sleep 5
npx tsx test/play.mjs   | tail -1
kill $PLAY 2>/dev/null || true; libere_port

echo "\n=== TOUT EST VERT ==="
