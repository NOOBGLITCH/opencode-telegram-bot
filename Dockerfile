# Build stage
FROM node:22-bookworm-slim AS builder

LABEL org.opencontainers.image.title="opencode-telegram-bot"
LABEL org.opencontainers.image.source="https://github.com/grinev/opencode-telegram-bot"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Install only native build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci --no-audit --no-fund

# Copy TypeScript config and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build the project
RUN npm run build

# Prune dev dependencies from the final image
RUN npm prune --omit=dev


# Runtime stage
FROM node:22-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="opencode-telegram-bot"
LABEL org.opencontainers.image.source="https://github.com/grinev/opencode-telegram-bot"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install dumb-init and ca-certificates for proper signal handling and HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

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

# Run as non-root node user (uid 1000)
USER node

# Worker has no HTTP port, so this only verifies the runtime is intact.
# Railway restart policy (railway.toml) handles crash recovery.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node --check dist/index.js || exit 1

STOPSIGNAL SIGTERM

# Single dumb-init entrypoint
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]