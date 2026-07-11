#!/usr/bin/env bash
# Brings up the Eregion daemon + the example app in a single terminal.
# Usage: ./demo.sh [--parallel N]   (Ctrl+C tears down both)
set -e
cd "$(dirname "$0")"

# Leftovers from previous runs hold the ports and serve the app with a stale
# token — clean up before starting.
pkill -f 'daemon/dist/cli.js' 2>/dev/null || true
pkill -f 'vite --port 5199' 2>/dev/null || true
pkill -f 'api-node/src/server.mjs' 2>/dev/null || true
sleep 1

node packages/daemon/dist/cli.js "$@" &
DAEMON_PID=$!
node examples/api-node/src/server.mjs &
API_PID=$!
trap 'kill $DAEMON_PID $API_PID 2>/dev/null' EXIT

sleep 1
if curl -sf -o /dev/null http://127.0.0.1:3199/api/orders; then
  echo "- mock api ready on http://127.0.0.1:3199"
else
  echo "! mock api failed to start (port 3199 busy?)" >&2
fi

# give the daemon time to write .eregion/daemon.json before vite reads it
sleep 2

echo "▸ starting vite (first boot on /mnt/c takes ~1 min — wait for the URL)…"
cd examples/vite-react
pnpm exec vite --port 5199 --strictPort
