#!/bin/sh
# Suite complète. Deux vitesses de serveur : les tests de logique tournent en accéléré,
# le parcours navigateur a besoin d'un étage de 3 minutes.
set -e
cd "$(dirname "$0")/.."
export CHROMIUM="${CHROMIUM:-}"
npm run build

echo "\n=== logique (hors réseau) ==="
SPEED=10 npx tsx test/money.mjs | tail -1
SPEED=10 npx tsx test/flow.mjs  | tail -1
N=60000 npx tsx test/ev.mjs     | tail -1

echo "\n=== serveur accéléré (SPEED=10) ==="
SPEED=10 PORT=2567 npx tsx server/src/index.ts > /tmp/asc-fast.log 2>&1 &
FAST=$!; sleep 5
npx tsx test/smoke.mjs | tail -1
npx tsx test/eight.mjs | tail -1
kill $FAST 2>/dev/null || true; pkill -f "tsx server/src/index.ts" 2>/dev/null || true; sleep 1

echo "\n=== serveur vitesse réelle ==="
PORT=2567 npx tsx server/src/index.ts > /tmp/asc-slow.log 2>&1 &
SLOW=$!; sleep 5
npx tsx test/floorswap.mjs | tail -1
npx tsx test/play.mjs   | tail -1
npx tsx test/floors.mjs | tail -1
npx tsx test/move.mjs   | tail -1
kill $SLOW 2>/dev/null || true; pkill -f "tsx server/src/index.ts" 2>/dev/null || true

echo "\n=== TOUT EST VERT ==="
