# Monorepo-aware build. Build context MUST be the repo root:
#   docker build -f apps/platform-api/Dockerfile -t platform-api .

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for layer caching.
COPY package*.json ./
COPY apps/platform-api/package.json ./apps/platform-api/
COPY packages/api-contracts/package.json ./packages/api-contracts/
COPY prisma ./prisma/

# Install all workspace deps (incl. dev — needed to build).
RUN npm ci

# Copy the sources we need to build.
COPY packages/api-contracts ./packages/api-contracts/
COPY apps/platform-api ./apps/platform-api/

# Generate Prisma client, build shared contracts, then the API bundle.
RUN npx prisma generate \
  && npm run build:contracts \
  && npm run build:api

# Drop dev dependencies for the runtime image.
RUN npm prune --omit=dev

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# dumb-init (PID 1 signal handling), openssl (Prisma), wget (healthcheck)
RUN apk add --no-cache dumb-init openssl wget

# Non-root runtime user
RUN addgroup -g 1001 -S nodejs \
  && adduser -S nodejs -u 1001

# Built API bundle, pruned deps, prisma schema/engine, manifests.
COPY --from=builder --chown=nodejs:nodejs /app/apps/platform-api/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

USER nodejs

EXPOSE 3000

# Readiness-based healthcheck (verifies DB connectivity, not just liveness).
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/ready || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
