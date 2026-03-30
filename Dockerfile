# =============================================================================
# MULTI-STAGE DOCKERFILE FOR NEXT.JS (STANDALONE MODE)
# =============================================================================
#
# Stages:
#   1. deps    — installs node_modules (cached separately from source changes)
#   2. builder — runs `next build`, produces .next/standalone/
#   3. runner  — copies only the minimal runtime output (~150MB vs ~1GB)
#
# Why standalone mode?
#   `output: "standalone"` in next.config.ts tells Next.js to trace all imports
#   and copy only the files that are actually used into .next/standalone/.
#   That folder has its own server.js and a pruned node_modules — no `next`
#   CLI, no dev tooling, no source files needed at runtime.
#
# Why multi-stage?
#   Each stage builds on the previous but the final image only copies specific
#   artifacts from earlier stages. So build tools, dev deps, and source code
#   never end up in the image you ship.
# =============================================================================

# ---- Stage 1: deps -----------------------------------------------------------
# Install ALL dependencies (including devDependencies) — we need them to build.
# This stage is cached separately. If package.json doesn't change, Docker reuses
# this layer even if your source code does — making rebuilds fast.
FROM node:22-alpine AS deps

# Set working directory inside the container.
WORKDIR /app

# Copy only the package manifests first.
# Docker caches layers by content hash — if these files haven't changed,
# `npm ci` won't re-run on the next build. This is a key Docker optimization.
COPY package.json package-lock.json ./

# `npm ci` installs exact versions from package-lock.json.
# Cleaner than `npm install` for CI/Docker — no lockfile mutations.
RUN npm ci


# ---- Stage 2: builder --------------------------------------------------------
# Copy source code and run the production build.
FROM node:22-alpine AS builder

WORKDIR /app

# Copy node_modules from the deps stage (avoids re-installing).
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the source code.
# This layer changes whenever you edit code — but node_modules is already
# cached from the deps stage, so only the build step re-runs.
COPY . .

# Build the Next.js app.
# With `output: "standalone"`, this produces:
#   .next/standalone/   — a self-contained Node server
#   .next/static/       — hashed JS/CSS bundles (served by the standalone server)
#   public/             — static public assets
#
# NEXT_TELEMETRY_DISABLED=1 turns off Next.js anonymous usage data collection.
ENV NEXT_TELEMETRY_DISABLED=1

# Dummy build-time env vars — Next.js validates these at build time even though
# the real values are injected at container runtime. These are NOT secrets and
# are NOT baked into the final image (this is the builder stage, not the runner).
ENV DATABASE_URL="postgres://build:build@localhost:5432/build"
ENV JWT_SECRET="build-only-not-a-real-secret-must-be-32-chars-long"
ENV VOYAGE_API_KEY="build-only-not-a-real-key"
ENV ANTHROPIC_API_KEY="build-only-not-a-real-key"

RUN npm run build


# ---- Stage 3: runner ---------------------------------------------------------
# The actual production image. Only the minimum needed to run the app.
FROM node:22-alpine AS runner

# Install dumb-init: a minimal init system for containers.
# Without it, Node is PID 1, which doesn't handle signals (SIGTERM) properly.
# dumb-init wraps Node so ctrl-c / docker stop / k8s termination all work cleanly.
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create a non-root user/group for security.
# Running as root in a container is unnecessary and increases attack surface.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone server output from the builder stage.
# This is the entire self-contained app — it has its own mini node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets (hashed JS/CSS bundles). The standalone server serves
# these itself — no separate static file server needed.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the public/ directory (favicon, icons, other static files).
# Note: public/uploads/ is excluded via .dockerignore — in prod, MinIO handles
# file storage so we don't want a local uploads directory in the image.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy the migration runner script.
# This plain .mjs file runs before the app starts to apply pending migrations.
# It lives at /app/migrate.mjs alongside server.js in the standalone output.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./migrate.mjs

# Copy the Drizzle migration SQL files.
# migrate.mjs reads these to know which SQL to apply to the database.
# They're committed to git so they travel with the image — no CLI needed.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

# Copy the entrypoint script.
# This runs migrations then starts the app. Must be executable.
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Switch to the non-root user.
USER nextjs

# Tell Docker this container will listen on port 3000.
# This is metadata only — it doesn't actually publish the port.
# Nginx (on the host or in another container) will proxy to this.
EXPOSE 3000

# Required by Next.js standalone server to know which port to bind.
ENV PORT=3000

# NODE_ENV=production enables React's production build optimizations
# and disables dev-only warnings.
ENV NODE_ENV=production

# Disable telemetry in the runner too (build env vars don't carry over).
ENV NEXT_TELEMETRY_DISABLED=1

# dumb-init is PID 1. It forwards signals (SIGTERM, SIGINT) to its child
# process. docker-entrypoint.sh runs migrations then `exec`s into server.js.
# The exec means server.js inherits the process slot — dumb-init → server.js.
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "docker-entrypoint.sh"]
