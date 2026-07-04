# =============================================================================
# Shep AI CLI - Multi-stage Docker Build
# =============================================================================
# Optimized for caching, speed, and minimal image size.
#
# Usage:
#   docker build -t shep-cli .
#   docker run shep-cli --version
#
# =============================================================================

# =============================================================================
# Stage 1: Install production dependencies (cached layer)
# =============================================================================
FROM node:22-alpine AS deps

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy only dependency files first (maximizes cache hits)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/presentation/web/package.json ./src/presentation/web/package.json
COPY packages/core/package.json ./packages/core/package.json

# Install native build tooling for modules like better-sqlite3
RUN apk add --no-cache python3 make g++

# Install production dependencies and rebuild native addons
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && \
    pnpm rebuild better-sqlite3

# =============================================================================
# Stage 2: Build TypeScript
# =============================================================================
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy dependency and config files (workspace config + all package.json files first for cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json tspconfig.yaml ./
COPY src/presentation/web/package.json ./src/presentation/web/package.json
COPY packages/core/package.json ./packages/core/package.json

# Install native build tooling for modules like better-sqlite3
RUN apk add --no-cache python3 make g++

# Install all dependencies (including devDependencies for TypeScript compiler)
RUN pnpm install --frozen-lockfile

# Copy TypeSpec files (needed for code generation during build)
COPY tsp/ ./tsp/

# Copy source code and translations
COPY src/ ./src/
COPY packages/ ./packages/
COPY translations/ ./translations/

# Build TypeScript to JavaScript (includes prebuild hook that runs pnpm generate)
RUN pnpm run build

# Assemble the production Next.js bundle consumed by the CLI runtime
RUN pnpm run build:web:prod

# =============================================================================
# Stage 3: Production runtime (minimal image)
# =============================================================================
FROM node:22-alpine AS runtime

# Upgrade base packages to pick up security patches (e.g. zlib CVE-2026-22184)
RUN apk upgrade --no-cache

# Install tools
RUN apk add --no-cache git curl wget bash

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 shep

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps --chown=shep:nodejs /app/node_modules ./node_modules

# Copy built output from builder stage
COPY --from=builder --chown=shep:nodejs /app/dist ./dist

# Copy the production web bundle used by `shep ui`
COPY --from=builder --chown=shep:nodejs /app/web ./web

# Copy package.json (required by VersionService to read version at runtime)
COPY --chown=shep:nodejs package.json ./

# Switch to non-root user
USER shep

# CLI entrypoint - allows: docker run ghcr.io/shep-ai/shep --version
ENTRYPOINT ["node", "dist/src/presentation/cli/index.js"]
