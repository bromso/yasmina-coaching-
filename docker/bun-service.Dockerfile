# syntax=docker/dockerfile:1
# One image recipe for the Bun services — pick the service with build args:
#   docker build -f docker/bun-service.Dockerfile --build-arg APP=api --build-arg PORT=3007 -t api .
# APP is the folder under apps/ (api, ai). The service is bundled with `bun build` and run by Bun.
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS installer
WORKDIR /app
ARG APP
ENV HUSKY=0
# Manifests only — cached until a package.json or the lockfile changes.
COPY package.json bun.lock ./
COPY --parents apps/*/package.json packages/*/package.json ./
RUN bun install --frozen-lockfile --filter "@repo/${APP}"

FROM installer AS builder
ARG APP
COPY . .
RUN bun run --filter "@repo/${APP}" build

FROM oven/bun:${BUN_VERSION}-slim AS runner
WORKDIR /app
ARG APP
ARG PORT
# Debian security patches for the base image's OS packages (gzip, libpcre2, libsqlite3, libssl,
# perl-base, …) — the base image is pinned by BUN_VERSION and only gets these otherwise when that
# tag is bumped. Runs as root, before USER switches away from it below; one layer so the apt lists
# removed in the same RUN don't survive in an earlier layer. APT_REFRESH (CI and
# scripts/security/image.ts pass the UTC date) is only here to bust the build cache: a changed
# value is a cache miss for this RUN, so a cached build still re-runs the upgrade at least daily
# instead of reusing the package set from the day the cache was filled.
ARG APT_REFRESH=unset
RUN DEBIAN_FRONTEND=noninteractive apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
# /data is where stateful services keep files (e.g. apps/api: DATABASE_URL=sqlite:///data/api.db).
RUN mkdir -p /data && chown bun:bun /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=${PORT}
# apps/api's local storage provider (STORAGE_PROVIDER=local) writes here; /app is root-owned. The
# other services never read it.
ENV STORAGE_DIR=/data/storage
COPY --from=builder --chown=bun:bun /app/apps/${APP}/dist ./dist
USER bun
EXPOSE ${PORT}
# /ready, not /health: healthy means "the database answers", so Compose's service_healthy waits for it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/ready`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "dist/index.js"]
