# syntax=docker/dockerfile:1
#
# Combined container: dripline + dripyard + runline
# Lives in the Securiteru/dripline fork so pushing the fork to Dokku deploys all three.
# The runline fork is cloned at build time so its source is also pinned to our fork.

FROM oven/bun:1 AS build

# bun image lacks git; install it so we can clone the runline fork
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy the dripline monorepo (build context = this fork root)
COPY . /build/dripline/

# Clone the runline fork (sibling repo on Securiteru)
RUN git clone --depth=1 https://github.com/Securiteru/runline.git /build/runline

# Build dripline monorepo: engine + dashboard + plugins
WORKDIR /build/dripline
RUN bun install --frozen-lockfile
RUN bun run --filter dripline build
RUN bun run --filter dripyard build
# dripyard ships a React UI; build the vite bundle that gets served from the same process
WORKDIR /build/dripline/packages/dripyard/src/app/ui
RUN if [ -f package.json ]; then bun install && bun run build; fi

# Build runline monorepo
WORKDIR /build/runline
RUN bun install --frozen-lockfile
RUN bun run --filter runline build

# Prune to production deps for runtime
WORKDIR /build/dripline
RUN bun install --production --frozen-lockfile
WORKDIR /build/runline
RUN bun install --production --frozen-lockfile

# --- Runtime stage ---
FROM oven/bun:1 AS runtime

# oven/bun:1 runs as non-root `bun` user by default; switch to root for system setup
USER root

# bun ships in the base image; add node for runline (its CLI shebang is #!/usr/bin/env node)
# tini for PID 1 signal handling
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tini git nodejs npm \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the built monorepos (with node_modules + dist) so workspace:* deps still resolve
COPY --from=build /build/dripline /app/dripline
COPY --from=build /build/runline /app/runline

# Make CLI entrypoints executable and symlink them into PATH
RUN chmod +x /app/dripline/packages/dripline/dist/main.js \
           /app/dripline/packages/dripyard/dist/main.js \
           /app/runline/packages/runline/dist/main.js \
 && ln -sf /app/dripline/packages/dripline/dist/main.js /usr/local/bin/dripline \
 && ln -sf /app/dripline/packages/dripyard/dist/main.js /usr/local/bin/dripyard \
 && ln -sf /app/runline/packages/runline/dist/main.js /usr/local/bin/runline

# Default workspace + persistent data dir (mounted as a Dokku volume)
RUN mkdir -p /app/workspace /app/data

# Seed the workspace with a minimal .dripline config if one isn't already present
# (the mounted volume on subsequent deploys will preserve any existing config)
RUN mkdir -p /app/workspace/.dripline
COPY docker/seed-config.json /app/workspace/.dripline/config.json
COPY docker/seed-plugins.json /app/workspace/.dripline/plugins.json

WORKDIR /app/workspace

ENV DRIPYARD_PORT=3457 \
    DRIPYARD_URL=http://0.0.0.0:3457 \
    DRIPYARD_DB=/app/data/dripyard.sqlite \
    HOME=/app \
    NODE_ENV=production

EXPOSE 3457

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3457/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["dripyard", "serve", "/app/workspace", "--port", "3457"]
