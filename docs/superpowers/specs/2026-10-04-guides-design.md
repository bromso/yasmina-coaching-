# Guides: deploying, renaming the brand, removing apps — design

Phase 5's last item (`docs/ROADMAP.md`). Approved in chat on 2026-10-04, section by section.

## Intent

Someone who owns a copy of this starter can take it to production as their own product: deploy it,
rename it, and trim the apps they do not need — from three guides in `docs/guides/`, each checked
against the code and exercised for real, not written from memory.

Decided with the owner:

- Deploying is **containers first** (the nine images the repo already builds), with a short Vercel
  section for the Next apps.
- Renaming is **consolidate, then guide**: the brand name moves into one constant before the guide
  is written.
- Removing apps is **a guide verified by real removals** on a throwaway branch — no removal script.

Assumed (not contested): the dev hostnames (`*.brand.localhost`) stay; they never reach production,
where `SITE_DOMAIN` decides the domain. The guides address an owner of a copy, not this repo's
maintainers.

## 1. One brand name

`@repo/sites` exports `BRAND_NAME = "Boilerplate"` (pure TypeScript; every Next app and `apps/api`
already depend on it). Readers:

| Where | What changes |
|---|---|
| `apps/*/src/app/layout.tsx` (7) | `title.default`, `title.template` (`%s \| ${BRAND_NAME}`), the © footer line |
| `apps/*/src/app/manifest.ts` (7) | `name` (`${BRAND_NAME} Docs`, …) |
| `apps/*/src/app/opengraph-image.tsx` (7) | `alt` |
| `packages/ui/src/components/brand.tsx` | `Brand`'s default `name` |
| `packages/ui/src/lib/og.tsx` | `ogImage`'s default `brand` |
| `packages/email/src/templates/layout.tsx` | `BRAND` becomes `export const BRAND = BRAND_NAME` (re-export kept for templates and callers) |
| `apps/api/src/env.ts` | `DEV_MAIL_FROM` = `` `${BRAND_NAME} <no-reply@brand.localhost>` `` |
| Storybook stories naming the brand | read `BRAND_NAME` where they show the default |

`@repo/ui` and `@repo/email` gain `"@repo/sites": "workspace:*"`. Next apps already list
`@repo/sites` in `transpilePackages`.

Unchanged on purpose: placeholder descriptions ("Docs shell — frontend boilerplate", rewritten by the
owner, the guide says so), `@repo/*` package names, the `boilerplate-bun` / `boilerplate-api`
user-agent and client strings, comments.

**Guard:** `scripts/brand.test.ts` (runs under `bun test scripts`, already in CI and `bun run ci`)
lists tracked first-party source files (`git ls-files` under `apps/*/src`, `packages/*/src`,
excluding vendored `packages/ui` components per the existing boundary and test files) and fails on
any literal `Boilerplate` outside `packages/sites/src/index.ts` and a short, commented allow-list.
It must fail on today's tree before the consolidation.

**Docs:** CLAUDE.md's **Brand** bullet stops calling `brand.tsx` "the one file" and names
`BRAND_NAME` plus the guide.

## 2. `docs/guides/deploying.md`

1. **Topology** — nine containers (seven Next apps, `api`, `ai`) behind one TLS reverse proxy, one
   subdomain each, plus Postgres for `api`. Diagram: browser → Next apps → `api` / `ai`; the browser
   never reaches `api` directly. The api migrates on boot (`db.migrate()` in `server.ts`).
2. **Before building** — the parent domain and DNS (per subdomain or wildcard); the values:
   `SITE_DOMAIN`, `COOKIE_DOMAIN=.<domain>`, `AUTH_URL` / `APP_URL` / `ACCOUNT_URL` / `API_URL`,
   `API_SERVICE_TOKEN` / `AI_SERVICE_TOKEN` (`openssl rand -hex 32`), `DATABASE_URL=postgres://…`,
   mail provider, billing, OAuth, `SUPERADMIN_EMAILS`.
3. **Build and publish** — enable `.github/workflows/docker-build.yml.disabled`. **Code fix in this
   PR:** that workflow passes only `APP` / `PORT`, so its images bake in `brand.localhost`; it gains
   `SITE_DOMAIN` and `COOKIE_DOMAIN` build args from GitHub repository variables
   (`vars.SITE_DOMAIN`, `vars.COOKIE_DOMAIN`). The same `docker build --build-arg …` by hand.
4. **Run** — one env table per service (required / optional, and where a missing value fails: at
   boot or first request), every row checked against `apps/api/src/env.ts`, `apps/ai`'s env,
   `@repo/session`'s `loadEnv` / `assertAuthEnv` and `apps/www`'s `assertEnv`; health checks
   (`/api/health`, `/health`); the proxy must set `x-real-ip` or overwrite `x-forwarded-for`
   (otherwise anonymous rate limits share one bucket); `experimental.serverActions.allowedOrigins`
   when the proxy rewrites `Host`; rate limits are in memory, per process, so replicas multiply them.
5. **After the first deploy** — sign up and verify the superadmin, mail delivery, the Stripe webhook
   and OAuth redirect URIs (linking `stripe.md` / `oauth-providers.md`, not repeating them),
   `TELEMETRY_PROVIDER` (`sentry.md`), and a smoke list: each app's `/api/health`, sign-up, `/notes`.
6. **Vercel variant (short)** — one project per Next app (root directory `apps/<name>`, install from
   the repo root), env per project, `SITE_DOMAIN` / `COOKIE_DOMAIN` at build time too; `api` / `ai`
   stay on a container host.

**Verification:** every command run; one Next image (a static app, e.g. `docs`) and the `api` image
built with a non-localhost `SITE_DOMAIN`, confirming the static app's baked links read
`https://www.<domain>`.

## 3. `docs/guides/removing-apps.md`

1. **What can go** — removable: `docs`, `help`, `jobs` (shells nothing depends on), `ai` (takes
   `apps/app`'s `/chat` with it), `story`, `e2e` (tooling). **Keep or replace:** `www` — the other
   apps link to its `/terms` and `/privacy`, `Brand` links to it, the consent banner's privacy link
   points at it, the api's waitlist mail links to it; the guide lists those touch points for
   replacing it, it is not a delete-the-folder case. **Core:** `api`, `auth`, `app`, and `account`
   (the api requires `ACCOUNT_URL`; billing and workspace management live there).
2. **A Next shell** (from the real `docs` + `help` + `jobs` removal) — the folder; `SITES`, `NAV` /
   `footerGroups` and their tests in `@repo/sites`; the `scripts/ci-plan.test.ts` app lists;
   `docker-compose.yml`, `docker-compose.dev.yml`, the GHCR matrix, devcontainer ports; `bun install`
   (lockfile). The `@repo/api-contract` telemetry `app` and waitlist `source` enum values stay —
   harmless, and stored rows still parse; the guide says why.
3. **`ai`** (from the real removal) — `apps/ai` and `packages/ai-contract`; in `apps/app` the `/chat`
   page and view, `api/chat/route.ts`, `chat-proxy.ts`, the `ai` / `@ai-sdk/*` deps, the
   `transpilePackages` entry and the nav link; `@repo/session`'s `ai-contract` import; the root
   `typecheck` / `test:services` filter lists, the ci.yml docker matrix row, e2e's `webServer` entry
   and chat spec, Compose, env tables; `FEATURES = ["chat"]` in billing and the one place that gates it.
4. **`story` and `e2e`** — a paragraph each: their CI jobs, planner outputs, root scripts.
5. **Final check** — `bun install && bun run ci`, plus `bunx playwright test` from `apps/e2e` if kept.

**Verification:** on a throwaway local branch (never pushed), remove `docs`/`help`/`jobs`, then
`ai`, until `bun run ci` and e2e pass; the guide records exactly those edits. Small decoupling fixes
the removals reveal (e.g. `@repo/session` importing `@repo/ai-contract` only for a token default)
land in this PR; anything larger becomes a ROADMAP follow-up.

## Shipping

One PR: the three guides, `BRAND_NAME` with its guard test, the GHCR build-arg fix, any small
decoupling fixes, links from `README.md` / CLAUDE.md, the ROADMAP item ticked.

## Out of scope

A `remove-app` script; renaming the dev hostnames or the `@repo/*` scope; rewriting placeholder copy;
a docs engine for `apps/docs`; Kubernetes / Terraform manifests.
