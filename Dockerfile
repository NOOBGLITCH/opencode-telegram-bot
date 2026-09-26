# syntax=docker/dockerfile:1
# Pinned to linux/amd64: Railway runs amd64; alpine keeps the image superlite.
# better-sqlite3 compiles against musl in the builder below (same libc as runtime).
FROM --platform=linux/amd64 node:22-alpine AS builder

LABEL org.opencontainers.image.title="opencode-telegram-bot"
LABEL org.opencontainers.image.source="https://github.com/NOOBGLITCH/opencode-telegram-bot"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Native build deps for better-sqlite3 (musl)
RUN apk add --no-cache python3 make g++

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci --no-audit --no-fund

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build, then strip dev deps + npm cache in the same layer chain
RUN npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force \
    && rm -rf /root/.npm /tmp/*


# Runtime stage: alpine superlite (~5MB base libs + node). su-exec replaces gosu.
FROM --platform=linux/amd64 node:22-alpine AS runtime

LABEL org.opencontainers.image.title="opencode-telegram-bot"
LABEL org.opencontainers.image.source="https://github.com/NOOBGLITCH/opencode-telegram-bot"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# dumb-init (signals) + su-exec (root -> node drop for Railway root-mounted
# volumes) + ca-certificates (Telegram HTTPS) + libstdc++ (better-sqlite3)
# + git (WORKSPACE_REPOS cloning at startup)
RUN apk add --no-cache dumb-init su-exec ca-certificates libstdc++ git

# OpenCode engine (same `opencode serve` the bot manages locally).
# Installed globally so `opencode` is on PATH for the node user.
RUN npm install -g opencode-ai@latest --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf /root/.npm /tmp/*

# Set production environment
ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Set persistent home for the bot.
# On Railway attach a volume at /app/data (see railway.toml comments).
ENV OPENCODE_TELEGRAM_HOME=/app/data

# Create data directories with correct ownership for node user
RUN mkdir -p /app/data/logs /app/data/run && \
    chown -R node:node /app

# Copy built application and production dependencies from builder
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Entrypoint fixes Railway volume ownership (/app/data mounts as root),
# then drops to the non-root node user. Stays root until exec.
COPY --chown=root:root --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Worker has no HTTP port, so this only verifies the runtime is intact.
# Railway restart policy (railway.toml) handles crash recovery.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node --check dist/index.js || exit 1

STOPSIGNAL SIGTERM

# dumb-init stays PID 1; entrypoint drops to node via su-exec (alpine)
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]