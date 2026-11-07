# syntax=docker/dockerfile:1
# Development image for docker-compose.dev.yml and the devcontainer: all workspaces installed,
# source bind-mounted at runtime, `bun dev` runs every app with hot reload.
ARG BUN_VERSION=1.4.2
ARG NODE_VERSION=24.21
FROM node:${NODE_VERSION}-trixie-slim AS node

FROM oven/bun:${BUN_VERSION}

# Node on PATH, as on a developer's machine: `bun run dev` then starts next dev on Node rather than
# Bun's node shim, so VS Code's debugger can attach to it (Next server breakpoints in the container).
COPY --from=node /usr/local/bin/node /usr/local/bin/node

# Install system dependencies as root
RUN apt-get update && apt-get install -y --no-install-recommends git curl vim \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown bun:bun /app
# The source is bind-mounted, owned by the host user, so git refuses it ("detected dubious
# ownership") from subdirectories, and tools that ask git for changes (Storybook's change
# detection) fail. System scope (/etc/gitconfig): ~/.gitconfig stays free for the Dev Containers
# extension, which copies your host identity there.
RUN git config --system --add safe.directory /app
USER bun


# Every workspace manifest, paths preserved — adding an app never needs this file edited.
COPY --chown=bun:bun package.json bun.lock ./
COPY --chown=bun:bun --parents apps/*/package.json packages/*/package.json ./

# Install as the bun user (avoids root-owned node_modules). Scripts run later, against real source.
RUN bun install --frozen-lockfile --ignore-scripts

# Pre-create each app's .next (bun-owned) so docker-compose.dev.yml can mount a container-only volume
# there — the host's .next holds dev caches with host absolute paths that break inside the container.
RUN for app in apps/*/; do mkdir -p "${app}.next"; done

# Bind every dev server to all interfaces inside the container (the host keeps *.localhost).
ENV DEV_HOSTNAME=0.0.0.0 HOST=0.0.0.0

# www app auth account docs help jobs api ai · storybook
EXPOSE 3000 3001 3002 3003 3004 3005 3006 3007 3008 6006
CMD ["bun", "dev"]
