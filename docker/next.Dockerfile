# syntax=docker/dockerfile:1
# One image recipe for every Next.js app — pick the app with build args:
#   docker build -f docker/next.Dockerfile --build-arg APP=app --build-arg PORT=3001 -t app .
# APP is the folder under apps/ (www, app, auth, account, docs, help, jobs).
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS installer
WORKDIR /app
ARG APP
# Skip the root "prepare" script (husky) — there is no .git in the build context.
ENV HUSKY=0
# Manifests only — this layer stays cached until a package.json or the lockfile changes.
# --parents keeps every workspace's path, so adding an app never needs this file edited.
COPY package.json bun.lock ./
COPY --parents apps/*/package.json packages/*/package.json ./
# @repo/mono brings the root devDependencies; `next build` needs typescript to read tsconfig paths.
RUN bun install --frozen-lockfile --filter '@repo/mono' --filter "@repo/${APP}"

FROM installer AS builder
ARG APP
ENV NEXT_TELEMETRY_DISABLED=1
# Where cross-app links point. The default is right for the local Compose stack; a deploy passes its domain.
ARG SITE_DOMAIN=brand.localhost
ENV SITE_DOMAIN=${SITE_DOMAIN}
# Optional host prefix (`yas-` → yas-www.<domain>), see packages/sites/README.md. Empty: none.
ARG SITE_HOST_PREFIX=
ENV SITE_HOST_PREFIX=${SITE_HOST_PREFIX}
# The static apps bake the consent cookie's domain in at build time (see the consent banner in each
# root layout); empty behaves exactly as today — a host-only cookie.
ARG COOKIE_DOMAIN=
ENV COOKIE_DOMAIN=${COOKIE_DOMAIN}
# docs only: baked in at build (every route is static), shows "Edit on GitHub" on every page.
# Unused by every other app.
ARG CONTENT_REPO_URL=
ENV CONTENT_REPO_URL=${CONTENT_REPO_URL}
COPY . .
RUN bun run --filter "@repo/${APP}" build

FROM oven/bun:${BUN_VERSION}-slim AS runner
WORKDIR /app
ARG APP
ARG PORT=3000
# Same domain as the build: app, auth and account resolve their links per request from this ENV.
ARG SITE_DOMAIN=brand.localhost
ARG SITE_HOST_PREFIX=
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
RUN groupadd --system --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --no-create-home nextjs
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=${PORT} APP=${APP} \
    SITE_DOMAIN=${SITE_DOMAIN} SITE_HOST_PREFIX=${SITE_HOST_PREFIX}
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/${APP}/public ./apps/${APP}/public
USER nextjs
EXPOSE ${PORT}
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["sh", "-c", "exec bun apps/${APP}/server.js"]
