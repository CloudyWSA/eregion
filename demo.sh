#!/usr/bin/env bash
# Sobe o daemon do Eregion + o app exemplo num terminal só.
# Uso: ./demo.sh [--parallel N]   (Ctrl+C derruba os dois)
set -e
cd "$(dirname "$0")"

# Restos de execuções anteriores seguram as portas e servem app com token
# velho — limpa antes de subir.
pkill -f 'daemon/dist/cli.js' 2>/dev/null || true
pkill -f 'vite --port 5199' 2>/dev/null || true
sleep 1

node packages/daemon/dist/cli.js "$@" &
DAEMON_PID=$!
trap 'kill $DAEMON_PID 2>/dev/null' EXIT

# dá tempo do daemon escrever .eregion/daemon.json antes do vite ler
sleep 2

echo "▸ subindo o vite (primeiro boot em /mnt/c leva ~1 min — aguarde a URL)…"
cd examples/vite-react
pnpm exec vite --port 5199 --strictPort
