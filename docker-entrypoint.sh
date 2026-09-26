#!/bin/sh
# Railway/Docker entrypoint: fix volume ownership, then drop to node user.
# Runs as root (image default). Railway mounts /app/data as root, which would
# otherwise cause EACCES for the non-root app user.
# Alpine image uses su-exec (Debian equivalent: gosu).
set -eu

DATA_DIR="${OPENCODE_TELEGRAM_HOME:-/app/data}"

if [ -d "$DATA_DIR" ] || mkdir -p "$DATA_DIR" 2>/dev/null; then
  mkdir -p "$DATA_DIR/logs" "$DATA_DIR/run" 2>/dev/null || true
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

if command -v su-exec >/dev/null 2>&1; then
  exec su-exec node "$@"
elif command -v gosu >/dev/null 2>&1; then
  exec gosu node "$@"
else
  exec "$@"
fi
