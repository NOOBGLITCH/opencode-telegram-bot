#!/bin/sh
# Railway/Docker entrypoint:
#  1. Fix volume ownership (Railway mounts /app/data as root).
#  2. Clone WORKSPACE_REPOS (comma/space-separated git URLs) into the volume.
#  3. Start a local `opencode serve` (same command the bot manages itself).
#  4. Drop to the node user and run the bot.
# Runs as root (image default). Alpine uses su-exec (Debian: gosu).
set -eu

DATA_DIR="${OPENCODE_TELEGRAM_HOME:-/app/data}"
OPENCODE_PORT="${OPENCODE_PORT:-4096}"

mkdir -p "$DATA_DIR/logs" "$DATA_DIR/run" "$DATA_DIR/workspaces" 2>/dev/null || true
chown -R node:node "$DATA_DIR" 2>/dev/null || true

# Keep OpenCode server state (auth, sessions, config) on the volume.
export HOME="$DATA_DIR/home"
mkdir -p "$HOME" 2>/dev/null || true
chown -R node:node "$HOME" 2>/dev/null || true

run_as_node() {
  if command -v su-exec >/dev/null 2>&1; then
    su-exec node "$@"
  elif command -v gosu >/dev/null 2>&1; then
    gosu node "$@"
  else
    "$@"
  fi
}

# Clone workspace repos once (skip when already present from the volume).
if [ -n "${WORKSPACE_REPOS:-}" ]; then
  for repo in $(printf '%s' "$WORKSPACE_REPOS" | tr ',;' '  '); do
    [ -n "$repo" ] || continue
    name=$(basename "$repo" .git)
    dest="$DATA_DIR/workspaces/$name"
    if [ ! -d "$dest/.git" ]; then
      echo "[boot] cloning $repo ..."
      run_as_node git clone --depth 1 "$repo" "$dest" 2>&1 \
        || echo "[boot] WARN: clone failed for $repo (private repos need credentials)"
    fi
  done
fi

# Bundled OpenCode backend so OPENCODE_API_URL=http://127.0.0.1:4096 resolves.
if command -v opencode >/dev/null 2>&1; then
  echo "[boot] starting opencode serve on 127.0.0.1:$OPENCODE_PORT ..."
  run_as_node sh -c "nohup opencode serve --port $OPENCODE_PORT >$DATA_DIR/logs/opencode-serve.log 2>&1 &"
  run_as_node node -e 'const net=require("net");const port=Number(process.env.OPENCODE_PORT||4096);const t0=Date.now();(function p(){const s=net.connect(port,"127.0.0.1");s.on("connect",()=>{s.end();process.exit(0)});s.on("error",()=>{if(Date.now()-t0>30000)process.exit(1);setTimeout(p,500)}})()'
  if [ $? -ne 0 ]; then
    echo "[boot] WARN: opencode serve not reachable yet; bot auto-restart may heal it"
  fi
else
  echo "[boot] WARN: opencode binary not found; bot will report server unavailable"
fi

exec run_as_node "$@"
