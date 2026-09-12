#!/bin/sh
# Restart the dsh web instance serving http://127.0.0.1:3080/ so a newly installed
# bundle enters the boot graph. The boot graph is composed once at startup, so a
# live patch-layer reload mounts new Host rows without adding their browser half.
#
# Run this from a terminal in the deepseek-harness checkout. It stops the process
# currently listening on the port, then starts `pnpm dsh web` in the foreground.
set -eu

PORT="${1:-3080}"
CHECKOUT="${DSH_CHECKOUT:-/Users/buu99y/workspace/github/agents/deepseek-harness}"

pids=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$pids" ]; then
  echo "stopping the process listening on $PORT: $pids"
  kill $pids 2>/dev/null || true
  sleep 2
  still=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  [ -z "$still" ] || { echo "still listening: $still" >&2; exit 1; }
else
  echo "nothing listening on $PORT"
fi

cd "$CHECKOUT"
echo "starting: pnpm dsh web   (opens the URL with a fresh token)"
exec pnpm dsh web
