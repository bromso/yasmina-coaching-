# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Development (all apps):**
```bash
bun dev              # Start all apps in parallel via Bun workspaces
```

**Development (single app):**
```bash
bun --filter @repo/www dev    # Marketing site on www.brand.localhost:3000
bun --filter @repo/app dev    # App shell on app.brand.localhost:3001
bun --filter @repo/auth dev   # Auth shell on auth.brand.localhost:3002
bun --filter @repo/account dev # Account shell on account.brand.localhost:3003
bun --filter @repo/docs dev   # Docs shell on docs.brand.localhost:3004
bun --filter @repo/help dev   # Help shell on help.brand.localhost:3005
bun --filter @repo/jobs dev   # Jobs shell on jobs.brand.localhost:3006
bun --filter @repo/blog dev   # Blog (MDX posts) on blog.brand.localhost:3009
bun --filter @repo/api dev    # API (Bun.serve + oRPC) on api.brand.localhost:3007, bun --hot
bun --filter @repo/ai dev     # AI service (Bun.serve + AI SDK + oRPC) on ai.brand.localhost:3008
bun --filter @repo/story dev  # Storybook on localhost:6006
```

**Build & Lint:**
```bash
bun run build         # Build all apps
bun run lint          # Lint all apps (Biome)
bun run format        # Format all files (Biome)
bun run lint:fix      # Auto-fix lint issues
```

**Bundle analysis:**
```bash
bun --filter @repo/www analyze   # any of the 8 Next apps
```
Every Next app wraps its config in `@next/bundle-analyzer` and exposes
`analyze: ANALYZE=true next build --webpack`. Reports are written to
`apps/<app>/.next/analyze/{client,nodejs,edge}.html` — open them in a browser. The apps also set
`productionBrowserSourceMaps` when `ANALYZE=true`, so the client report maps back to real modules.

**End-to-end tests:**
```bash
bun --filter @repo/e2e e2e        # build the eight Next apps, then run every journey
```
See `apps/e2e/README.md` for running one journey, against already-running servers, `--ui`, and traces.

**Docker:**
```bash
docker compose up -d --build              # production-like stack: all 10 apps on their dev ports
docker compose up -d --build app ai       # a subset
docker compose -f docker-compose.dev.yml up   # dev container: `bun dev` with the repo bind-mounted
JOBS_WORKER=false docker compose --profile worker up -d --build   # + a dedicated job worker
```
Two parameterized Dockerfiles cover every app: `docker/next.Dockerfile` (the 8 Next apps, standalone
output, health check on `/api/health`) and `docker/bun-service.Dockerfile` (`api`, `ai`, bundled with
`bun build`, health check on `/health`), both taking `--build-arg APP=<folder> --build-arg PORT=<port>`.
They copy every workspace manifest with `COPY --parents`, so a new workspace needs no Dockerfile edit.
Every port `docker-compose.yml` publishes (the eight Next apps, `api`, `ai`, Mailpit, SeaweedFS's S3
API) binds `127.0.0.1` only, never a bare host port — `scripts/docker.test.ts` fails on anything else.
The `api` image bundles two entrypoints, `dist/index.js` (the api, the default command) and
`dist/worker.js` (`src/worker.ts`, the job worker alone). Compose runs the second as `api-worker`
under the `worker` profile only (not in the default stack): the api's image (`api` names it
`boilerplate-bun-api`; `api-worker` reuses it with `pull_policy: never` rather than building a
second copy), environment and data volume (one SQLite file for both, in WAL mode — see **Jobs**),
its own `PORT` (3017, unpublished — the worker binds `PORT` like the api) and a `/health` check
(503 when the database does not answer) in place of the image's `/ready`. Start it with `JOBS_WORKER=false` so `api` only enqueues
(see **Jobs** and `docs/guides/background-jobs.md`).
Next images install with `--filter '@repo/mono'` as well as the app — `next build` needs the root
`typescript` to read tsconfig `paths`, and a bare `--filter '@repo/<app>'` install leaves it out.
`ai` reads `AI_SERVICE_TOKEN` / `AI_MODEL` / `ANTHROPIC_API_KEY` from the root `.env` and exits at
startup without them. `app`, `auth` and `account` need `COOKIE_DOMAIN`, `AUTH_URL`
and `APP_URL` in the root `.env` to be healthy — with `COOKIE_DOMAIN` empty they answer 500 on every
route. `api` also needs `TWO_FACTOR_ENCRYPTION_KEY` in the root `.env` — it exits at startup
without it, and in production refuses the public dev key too. Compose also runs **SeaweedFS** for
the api's uploads (`STORAGE_PROVIDER=s3`, bucket `uploads`, the S3 API published on `127.0.0.1:8333` only, the
unauthenticated filer never published; its S3 gateway accepts only the identity built from `S3_ACCESS_KEY_ID` /
`S3_SECRET_ACCESS_KEY` in the root `.env`, `devstorage` / `devstorage-secret` by default, through a
top-level `configs:` entry) plus a one-shot `seaweedfs-init` on the same image that creates the
bucket unless it exists, and the api waits for it to finish; the image is pinned
(`chrislusf/seaweedfs:4.48`; MinIO's images are no longer publicly pullable). See **Storage** under
**Authentication**. `docker-compose.dev.yml` runs no SeaweedFS: the api there stays on `local`.
The Bun service image sets `STORAGE_DIR=/data/storage`, so `local` works there with a volume on
`/data`. Both runtime (`runner`) stages run `apt-get update && apt-get upgrade -y
--no-install-recommends` (noninteractive) as root, before `USER` drops to the unprivileged
account, so the pinned `oven/bun` base picks up Debian's own security patches for its OS packages
between base-image bumps. An `ARG APT_REFRESH` just before that `RUN` busts the build cache: every
CI, weekly and publish build (and `bun run security:image`) passes the UTC date, so a cached layer
is re-upgraded at least daily rather than kept from the day the cache was filled (a plain local
`docker build` leaves it `unset`) — see **Security scanning**. The `docker` CI job builds one
image per Dockerfile on every PR (never pushes) and scans each build with Trivy (see **Security
scanning**);
`.github/workflows/docker-build.yml.disabled` publishes all ten to GHCR once renamed; it needs the
`SITE_DOMAIN` repository variable (it fails before building without it) and takes optional
`COOKIE_DOMAIN` and `CONTENT_REPO_URL` ones — see `docs/guides/deploying.md`.
`docker/next.Dockerfile` also takes `--build-arg SITE_DOMAIN=<parent domain>` (default
`brand.localhost`, right for the local Compose stack; Compose passes `${SITE_DOMAIN:-brand.localhost}`
from the root `.env`). Set it to the production parent domain when building a deploy image. The one arg
reaches both stages: the static apps bake their cross-app links in at `next build`, and the runner
stage sets it as `ENV`, which `app`, `auth` and `account` read per request. A different domain
therefore needs a rebuild, not just a new runtime env.
It takes `--build-arg COOKIE_DOMAIN=<.parent domain>` too, read only in the builder stage: the static
apps (`www`, `docs`, `help`, `jobs`, `blog`) bake the consent banner's cookie domain in at `next build`, and
Compose passes them `${COOKIE_DOMAIN:-.brand.localhost}`. Empty (the Dockerfile's default) writes a
host-only consent cookie, so the choice is not shared across subdomains.
And `--build-arg CONTENT_REPO_URL=<repo blob URL of apps/docs/content/docs>`, read only by `docs` at
`next build` for its "Edit on GitHub" link (Compose passes `${CONTENT_REPO_URL:-}`, the GHCR workflow
`vars.CONTENT_REPO_URL`); empty (the default) shows no link.

The dev image (`docker/dev.Dockerfile`, used by `docker-compose.dev.yml` and the devcontainer; not
built in CI) adds Node 24.21 (`bun run dev` starts `next dev` on it rather than Bun's node shim, so
VS Code's debugger can attach) and trusts the bind-mounted repo for git (`safe.directory` in
`/etc/gitconfig`, so `~/.gitconfig` stays free for the host identity the Dev Containers extension
copies in). It leaves out Playwright's browsers: in the
devcontainer, the `e2e: install Chromium (devcontainer)` task installs them (and their system
libraries, through the `bun` user's sudo from the `common-utils` feature). `scripts/docker.test.ts`
fails when a workspace is missing from the dev compose's volume lines, an app from
`docker-compose.yml` or the GHCR matrix, an `api-worker` command naming a file the api build does not emit, or a port from the dev compose's published ports or the
devcontainer's `forwardPorts` (Mailpit's is `mailpit:8025`: it is its own service).

Dev servers bind `${DEV_HOSTNAME:-<name>.brand.localhost}` (Next) and `HOST` (Bun services). `*.localhost`
does not resolve inside Linux containers, so the dev image and `docker-compose.dev.yml` set both to
`0.0.0.0`; on the host nothing changes.

**Debugging (VS Code):** every debug config lives in the root `.vscode/launch.json` — the same list
whether you open the repo folder or `workspace.code-workspace` (whose folders cover every app and
package). `Next: <App>` runs the app's `bun run dev` in a debug terminal (server breakpoints) and
opens `Chrome: <App>` on its `*.brand.localhost` URL once Next is ready; `Bun: API` / `Bun: AI` use
the Bun extension with hot reload; `Stack: app` / `Stack: everything` start several at once. Each
`Next:` config waits for a pattern naming its own port (`Local: …:3001`): VS Code checks every debug
terminal against every waiting pattern, so a shared one would open the wrong browser. Inside the
devcontainer the servers run in the container and `browserLaunchLocation: "ui"` opens Chrome on the
host. The dev image ships Node, so `next dev` runs on it there too and Next server breakpoints work
in the container. No app keeps its own `.vscode/launch.json`
or `tasks.json`; `scripts/vscode.test.ts` (in `bun test scripts`) fails when a config, the workspace
folder list or the devcontainer's extensions drift from the repo.

**Single app build/lint:**
```bash
bun --filter @repo/app build
bun --filter @repo/app lint
```

## Architecture

**Monorepo Structure:**
- **Bun workspaces** for package management and task orchestration (`bun run --filter`)
- **Biome** for linting/formatting (not ESLint/Prettier)

**Apps:**
- `apps/www` — Marketing site, bilingual (Swedish by default, English when the `locale` cookie says `en`; every page renders per request, ƒ): Yasmina Petersson's leadership-coaching landing page, one content file (`src/content/home.tsx`, both languages) arranged by `src/views/home-view.tsx` into www-specific sections (`src/components/*-section.tsx`) plus the shared `Faq` and `Newsletter` blocks, `/terms` and `/privacy` templates (both languages), the `/kontakt` contact page (a three-step qualifying form over `leads.create`, a tailored next step on `/kontakt/tack`; the home page's `#contact` is a teaser linking it — see **Leads.**), the public booking journey under `/book` (catalog, slot calendar, group seats, request forms, token manage page — see **Booking.**) and the Ledarskap inifrån track under `/inifran` (hub, four services, research); www and the blog override the shared palette with `@repo/ui/themes/coaching.css` and set headlines in `fontDisplay`; its photos and five short clips live under `public/media/` (JPEG + WebP, MP4 without audio, posters; camera/generated originals under `assets/originals/`, never served), and its motion (`src/components/motion/`, `motion/react`) is disabled under `prefers-reduced-motion` (Next.js 16; dev: www.brand.localhost:3000 → prod: www.brand.com). See `apps/www/README.md`.
- `apps/app` — Application shell: notes per workspace (`/notes`, role-gated create and delete, a key-authored note shown as "via API key `<name>`" rather than "Deleted user", live over `/api/events` with a "Here now" presence row, see **Realtime**), `/chat` (a paid feature: an upsell on the page, a 403 from `/api/chat`, see **Billing**), the `/workspaces/new` onboarding and the `/invitations/[token]` accept page (naming a workspace that requires two-step verification, and refusing **Accept** — and the signed-out sign-in links — for an invitation its workspace's allowed domains no longer admit, see **Invitation domains.**) against `apps/api`; `/notes` and `/chat` show a blocked-member notice in place of the page for a workspace that requires two-step verification, see **Required two-step.**; the signed-in header's notification bell is the one that updates live, over `/api/events/me`, see **Notifications.** (Next.js 16; dev: app.brand.localhost:3001 → prod: app.brand.com)
- `apps/auth` — Authentication: sign-in, sign-up, forgot and reset password, Google/GitHub/Apple and magic-link sign-in against `apps/api`, sign-in with a passkey (skipping the code step even with two-step on), the two-step verification code step (`/login/verify`), and anonymous `/email/cancel` and `/email/revert` pages that cancel or undo an email change from the old mailbox (see **Email change**); a header notification bell, see **Notifications.**; the RFC 8058 one-click unsubscribe endpoint and `/email/unsubscribe` confirm page for optional notification mail, see **Notification preferences.**; superadmin pages under /admin (users, workspaces, audit, audit export, impersonation, two-step verification reset, passkey removal, account suspension, background jobs); Yasmina's booking calendar under `/admin/bookings` (month view, pending requests, confirm/decline/cancel, availability rules and blocked days, group events — see **Booking.**); the contact-form pipeline under `/admin/leads` (status tabs with counts, a lead's answers, status and notes — see **Leads.**) (Next.js 16; dev: auth.brand.localhost:3002 → prod: auth.brand.com)
- `apps/account` — Account management: My-Account-style settings hub; a header notification bell and a `/notifications` inbox with an Email section choosing which optional types are also mailed (see **Notifications.** and **Notification preferences.**); profile name and photo, an email address change (a confirm link to the new address, a cancel link to the old one — see **Email change**), password change or first password, connected sign-in providers, two-step verification (authenticator app + recovery codes), passkeys (add, rename, remove), signed-in devices and the **Workspace** section (logo, members, roles, invitations, rename, transfer, delete, a Security card requiring two-step verification of every member, owner only — see **Required two-step.** — and, below it, the owner-managed allowed invitation domains — see **Invitation domains.** — API keys — see **API keys and /v1.** — outgoing webhooks — see **Webhooks** — and an Activity card of the workspace's own administrative actions, admin and up — see **Activity log.**) against `apps/api`, which replaced the People & sharing mockup, **Payments** (the workspace's plan and seats, checkout, the billing portal, or the mock provider's in-app plan form) and **Data & privacy** (request and download a data export, the cookie-consent choice, and schedule or cancel the account's deletion — see **Privacy**) (Next.js 16; dev: account.brand.localhost:3003 → prod: account.brand.com)
- `apps/docs` — Docs: product documentation (fumadocs-mdx), fully static — `/` (`content/docs/index.mdx`), every other page at `[[...slug]]`, `/all` (every page listed), a **Developers** section at `/developers` for workspace integrators (overview, authentication, rate limits, a generated `/v1` reference and webhook event pages, verifying signatures — see **Developer docs.** below), per-page OG/Twitter images at `/og/<path>/image.png` and a static `/api/search` index behind a ⌘K/Ctrl K dialog, no runtime call to `apps/api` beyond telemetry/analytics (Next.js 16; dev: docs.brand.localhost:3004 → prod: docs.brand.com). See `apps/docs/README.md` and **Content** below.
- `apps/help` — Help center: categories and articles (fumadocs-mdx, the third `@repo/content` app, same shape as `apps/docs`) — `/` (search and popular articles), `/<category>`, `/<category>/<article>` (with up to three related articles and a "Contact us" link), `/all`, a static `/api/search` index behind a ⌘K/Ctrl K dialog, and `/contact` — otherwise fully static, its contact form the only runtime call to `apps/api` beyond telemetry/analytics (Next.js 16; dev: help.brand.localhost:3005 → prod: help.brand.com). See `apps/help/README.md`, `docs/guides/content.md` and **Support** below.
- `apps/jobs` — Jobs board: open roles (fumadocs-mdx, the fourth `@repo/content` app) — `/` (open roles grouped by team), `/<slug>` (a posting, `JobPosting` JSON-LD for open roles) and `/<slug>/apply` (a PDF-CV apply form, open roles only) — otherwise fully static, the apply form's server action the only runtime call to `apps/api` beyond telemetry/analytics; applications are reviewed on `apps/auth`'s `/admin/applications` (Next.js 16; dev: jobs.brand.localhost:3006 → prod: jobs.brand.com). See `apps/jobs/README.md`, `docs/guides/content.md` and **Hiring** below.
- `apps/blog` — Blog: Yasmina's MDX posts (fumadocs-mdx) on their own subdomain in www's look (`@repo/ui/themes/coaching.css`, shared with www), Swedish at the root and English under `/en` — `/`, `/page/[n]`, `/[slug]`, `/tags/[tag]`, `/authors/[author]` and the `rss.xml`/`atom.xml`/`feed.json` feeds, each once per language; one root layout per language (route groups `(sv)`, `(en)`) for `<html lang>`, and `global-not-found.tsx` for unmatched URLs; posts are `<slug>.mdx` (`locale: sv`) or `en-<slug>.mdx` (`locale: en`, `translationOf`), link to www as `www:/<path>`; fully static, no runtime call to `apps/api` beyond telemetry/analytics (Next.js 16; dev: blog.brand.localhost:3009 → prod: blog.brand.com). See `apps/blog/README.md` and **Content** below.
- `apps/api` — API on `Bun.serve` + oRPC: typed RPC at `/rpc`, REST + OpenAPI docs at `/openapi`, a public, versioned `/v1` REST API for workspace API keys (see **API keys and /v1.**), `Bun.sql` data layer, a durable job queue (see **Jobs**) (Bun runtime, not Next; dev: api.brand.localhost:3007 → prod: api.brand.com). See `apps/api/README.md`.
- `apps/ai` — AI service: streaming chat at `POST /chat` (stock `useChat`), structured endpoints at `/rpc` and `/openapi`, AI SDK with Anthropic + keyless `mock:echo` (Bun runtime; dev: ai.brand.localhost:3008 → prod: ai.brand.com). See `apps/ai/README.md`.
- `apps/story` — Storybook for `packages/ui` and the `@repo/email` templates (localhost:6006; internal tool, not subdomain-routed)
- `apps/e2e` — `@repo/e2e`, private: Playwright browser journeys over production builds of the eight Next apps (`www`, `app`, `auth`, `account`, `docs`, `help`, `jobs` and `blog`), plus `apps/api` and `apps/ai`, started on their real `*.brand.localhost` hosts and ports; a PR gate, not shipped. See `apps/e2e/README.md`.
- `apps/load` — `@repo/load`, private: Bun-native load scenarios (`api-core`, `realtime`, `jobs-burst`) and failure drills (`database`, `slow`, `providers`, `sigterm`) for `apps/api` and `apps/ai`, run on demand against a stack it starts itself (SQLite or, with `LOAD_DB=postgres`, Postgres); a 20 s smoke of `api-core` runs in the `e2e` job (see **Quality gates**). Never shipped, not a dev server. See `apps/load/README.md` and `docs/guides/capacity.md`.

> Future subdomain apps follow the same pattern: `apps/wiki` (wiki.brand.com), etc. Removing one instead? See `docs/guides/removing-apps.md`.

**Packages:**
- `packages/ui` — Shared shadcn/ui components and reusable section blocks
- `packages/tokens` — Design tokens; its `build` script (`node sd.config.js`) runs on style-dictionary 5, which *declares* `engines.node >= 22` (the build itself was verified byte-identical under Node 20 too) — CI's `storybook` and `verify` jobs run no `actions/setup-node` step, so it runs on whatever `node` the runner's own PATH resolves to: Node 22 on the ubuntu-24.04 runners, which satisfies the declaration
- `packages/api-contract` — oRPC contract + Zod schemas for `apps/api`; clients import `ApiClient` from here, never from `apps/api`
- `packages/public-api-contract` — `@repo/public-api-contract`, its own Zod schemas, routes and `{error:{code,message}}` error shape for `apps/api`'s public, API-key-authenticated `/v1` REST surface — kept apart from `@repo/api-contract` so the internal contract can change freely while `/v1` only ever gains (see **API keys and /v1.** and `packages/public-api-contract/README.md`); its `./webhook-events` (Zod-free: `WEBHOOK_EVENTS`, `SUBSCRIBABLE_WEBHOOK_EVENTS`) and `./webhooks` (the payload schemas, `WebhookEventSchema`) subpaths are the outgoing-webhook event vocabulary — see **Webhooks**; its `./openapi` subpath (new `@orpc/openapi` / `@orpc/zod` deps, both `catalog:`) builds the `/v1` OpenAPI document straight from the contract (`buildV1OpenAPIDocument({ serverUrl?, title?, docsUrl? })`, the same document `apps/api`'s `/v1` reference plugin serves) plus the webhook event and envelope JSON Schemas (`buildWebhookEventSchemas()`, `buildWebhookEnvelopeSchemas()`) — see **Developer docs.**
- `packages/ai-contract` — oRPC contract, tool schemas and `ChatMessage` for `apps/ai`; clients import `AiClient` / `ChatMessage` from here, never from `apps/ai`
- `packages/session` — `@repo/session`, server-only: the session cookie, `createAuth` / `requireUser`, CSRF and redirect-target checks, the `apps/api` client acting as the signed-in user, and `createFileRoute` (`@repo/session/files`) behind each signed-in app's `/files/<key>` route; the Next apps' one way to sign-in state (see **Authentication**)
- `packages/email` — `@repo/email`: the transactional email templates (React Email), `emails.<name>(props)` → `{ subject, html, text }`; renders only, sending lives in `apps/api` (see **Email** under **Authentication**)
- `packages/service-kit` — guard, rate limiter, error shape, graceful shutdown and readiness shared by `apps/api` and `apps/ai` (Bun-only; the Next apps never import it)
- `packages/sites` — `@repo/sites`, pure TypeScript: `BRAND_NAME`, `SITES` (every app, its label and dev port), `siteUrl`, `siteNav`, `footerGroups`, all driven by `SITE_DOMAIN` (see **Sites registry** below and `packages/sites/README.md`); `scripts/client-imports.test.ts` (in `bun test scripts`, so it runs on every CI change) fails the moment a `"use client"` file anywhere under `apps/*/src` — or a local module it pulls in (`@/…`, `./…`, followed through files with no `"use client"`/`"use server"` directive) — imports a *value* (not a type, in any clause shape, re-exports and side-effect imports included) from the bare `@repo/sites` specifier, since every function but `relabelNav`/`relabelFooter` reads `process.env` at call time and that read is not inlined into the browser bundle — a client component needs a server component to compute the value and pass it down as a prop (the same file guards `@repo/api-contract`'s and `@repo/public-api-contract`'s roots and their Zod-free subpaths)
- `packages/content` — `@repo/content`, pure TypeScript, no React/Next/fumadocs: frontmatter schema, `createBlog` (validation, pagination, tags, related posts, languages and translations), RSS/Atom/JSON feed rendering, internal-link checking, BlogPosting JSON-LD and the raw-MDX `checks` (links, images, heading) shared by `apps/blog` and `apps/docs` (see **Content** below and `packages/content/README.md`)
- `packages/telemetry` — `@repo/telemetry`: errors and web vitals, browser and server sides, no React or Next dependency (see **Telemetry** below and `packages/telemetry/README.md`)
- `packages/i18n` — `@repo/i18n`, pure TypeScript; depends on `use-intl` (for `./translate`), while `./locales`, `./cookie` and `./dates` (`formatUtcDate`, UTC dates with a fixed Swedish month table, shared by `app` and `account`) import nothing outside the package and stay client-safe: `LOCALES`/`DEFAULT_LOCALE`/`LOCALE_NAMES`, `negotiateLocale`/`resolveLocale`, the `locale` cookie, the ICU message catalogs (`messagesFor`) and `translatorFor` for callers with no React (see **i18n.** below and `packages/i18n/README.md`)
- `packages/i18n-guard` — `@repo/i18n-guard`: the hard-coded-string guard every translated app (`auth`, `app`, `account`) runs as its own `src/i18n-guard.test.ts`, over `scanApp` (parses a TypeScript compiler AST, so it declares `typescript` via `catalog:` — see the dependency rules above and `packages/i18n-guard/README.md`)
- `packages/log` — `@repo/log`, pure TypeScript, no runtime dependency: `createLogger` (structured JSON/pretty logging, redaction, `LOG_LEVEL`/`LOG_FORMAT`), `newRequestId`/`validRequestId`/`REQUEST_ID_HEADER`, and the server-only `@repo/log/context` subpath (`withRequestContext`/`currentRequestId` over `AsyncLocalStorage`) — shared by `apps/api`, its worker, `apps/ai` and every Next app's server code (see **Operations** below and `packages/log/README.md`)
- `packages/typescript-config` — Shared TypeScript configuration (`bun.json` is the preset for Bun-runtime workspaces)

## Frontend Architecture

The Next apps are **frontend-only**: none of them owns a backend or data layer. Server-side work
lives in `apps/api`, a separate Bun app that the frontends call through the typed contract in
`packages/api-contract`. `apps/app`'s `/notes` and `/chat` pages are the working example of calling
`apps/api` and `apps/ai` as a signed-in user; `apps/www`'s contact form (a server action calling
`leads.create` with the service token and no session) is the anonymous one. Users and sessions live in `apps/api`, reached through `@repo/session`
(see **Authentication** below): `apps/auth` signs users in, `apps/app` requires a session and a current
workspace for `/notes` and `/chat` (see **Workspaces** under **Authentication**), and `apps/account`
requires a session for every page.

Five layers, one-way import direction:

```
tokens → components → blocks → views → pages
```

- **tokens** (`packages/tokens/`): design tokens
- **components** (`packages/ui/src/components/`): low-level primitives (Button, Card, Input)
- **blocks** (`packages/ui/src/blocks/`): reusable section patterns (Hero, FeatureGrid, Footer) — content-agnostic, take props
- **views** (`apps/<app>/src/views/`): page-level compositions specific to one app
- **pages** (`apps/<app>/src/app/.../page.tsx`): thin wrappers — import a view, render it

A block may import components but NOT views or pages. A view may import blocks/components but is never imported by them.

**Imports:**
```tsx
import { Button } from "@repo/ui/components/button"
import { Hero } from "@repo/ui/blocks/hero"
import { cn } from "@repo/ui/lib/utils"
```

**Charts (bklit):** `packages/ui/src/components/charts/` vendors the bklit registry
(`@bklit` in `components.json`): 17 chart components, three KPI stat-card blocks under `charts/blocks/`,
and their demo data under `charts/data/`. Import from the barrel:
```tsx
import { AreaChart, Area, Grid, XAxis, ChartTooltip } from "@repo/ui/components/charts"
```
The charts read `--chart-*` / `--legend-*` tokens defined in `packages/ui/src/styles/globals.css`.
Stories live in `apps/story/stories/bklit/`. The choropleth chart and stat card fetch world topology
from GitHub at runtime.

**Adding shadcn components — always to `packages/ui`:**
```bash
bunx shadcn@latest add <component> -c packages/ui
```

Never add shadcn components directly to apps.

**Animations (motion.dev):**
Available in `apps/app`, `apps/www`, and `packages/ui`:
```tsx
import { motion, AnimatePresence } from "motion/react"
```

## Design System Single Points

Every cross-app concern lives in `packages/ui` — change it once, every subdomain app follows:

- **Fonts** — `@repo/ui/lib/fonts` (`fontSans`, `fontMono`). Apply in each root layout: `<body className={`${fontSans.variable} font-sans antialiased`}>`. Requires `transpilePackages: ["@repo/ui"]` in the app's next config.
- **Theme** — `@repo/ui/components/theme-provider` (next-themes with monorepo defaults baked in).
- **Web vitals** — `@repo/ui/components/web-vitals` (`<WebVitals />` in the layout; production reporting wired in one place).
- **Form feedback** — `@repo/ui/components/form-feedback`: the `FormState` a server action returns to its form, `fieldErrors()` (Zod issues → one message per field), `<FormMessage>` / `<FieldError>` to render it, and `fieldAria()` for the input's `aria-invalid` / `aria-describedby` (pointing at `<FieldError>`'s `<name>-error` id, plus an optional hint id) — both take an `idPrefix` for a second form on the same page sharing a field name. `<FormMessage>` always mounts a polite `role="status"` region (empty until a success arrives, so it is announced) and adds a `role="alert"` only for an error. `apps/auth` and `apps/account` both use it; a new form in any app does too.
- **Skip link** — `@repo/ui/components/skip-link` (+ `id="main"` on the page's main landmark).
- **Styles** — every app has `src/styles/globals.css` that starts with `@import "@repo/ui/globals.css";` and adds app-specific extensions below; the layout imports `@/styles/globals.css`; `components.json` `tailwind.css` points at the same file.
- **Security headers** — `@repo/ui/lib/security-headers` (the policy, a pure function) and `@repo/ui/lib/security-proxy` (`createSecurityProxy()`), applied by each app's small `src/proxy.ts` (`apps/account`'s adds the Stripe hosts to `form-action`, see **Billing**). The only extension point is the `csp` option (`createSecurityProxy({ csp: { "connect-src": ["https://api.example.com"] } })`); never edit a policy in an app. Production has no `'unsafe-eval'`; dev adds what HMR needs. An app that uses Zod in the browser adds `src/instrumentation-client.ts` with `z.config({ jitless: true })` (see `apps/app`) — Zod's `Function("")` probe would otherwise be reported under the policy. COEP `credentialless` also blocks cross-origin `<iframe>`s whose origin does not send COEP, so embedding third-party frames is a shared-header change, not a `csp` extra.
- **Status pages** — `@repo/ui/blocks/status-page` (`StatusPage`), rendered by each app's `src/app/{not-found,error,global-error}.tsx`. Those files are identical across the apps (except `www`'s, which follow the page's language — its `not-found.tsx` also wraps the block in the site's `Background` — and `auth`'s `not-found.tsx` and `error.tsx`, which read their text in the request's language — `error.tsx` falls back to English under `global-error.tsx`, outside the layout's translations); change the block, not the files. The blog has no layout above an unmatched URL (one root layout per language), so it also ships `src/app/global-not-found.tsx` (Next's `experimental.globalNotFound`): a whole Swedish 404 document with an English line. No app ships a root `loading.tsx`. In the static apps (`www`, `docs`, `help`, `jobs`, `blog`), React outlines a Suspense boundary larger than ~12.8 KB as a hidden segment revealed by an inline script, even in a static prerender, so a root loading boundary hides any sizeable page from readers without JavaScript (crawlers, reader modes, `curl`). In the dynamic apps (`app`, `auth`, `account`), a root loading boundary makes Next 16.2's client router leave a revalidating server action's transition uncommitted forever — the response arrives, the button spins until a reload. In `app` and `auth` this takes a soft navigation (`<Link>`, an action's `redirect()`) into the page first — a fresh load passed 6/6 in testing; in `account` it happens whether the page was reached by a sidebar `<Link>` or a fresh load, and the route group in between (`account`'s `(account)`) does not prevent it. `apps/{app,auth,account}/src/app/root-loading.test.ts` and `scripts/ci-plan.test.ts` keep it out of every app; a slow navigation keeps the current page on screen instead. `@repo/ui/blocks/page-loading` (`PageLoading`) remains for a nested segment that genuinely needs a fallback, but a loading boundary must never sit directly above pages whose forms revalidate.
- **Site header & footer** — `@repo/ui/blocks/site-header` (`SiteHeader({ brand, links, start?, controls?, end?, sticky? })`: `<nav aria-label="Site">`, the current app as text, a hamburger `Sheet` below `md`; below `sm` the row keeps `start`, the brand, `end` and the hamburger, and `controls` wrap onto their own row so a 320 px screen never scrolls sideways — WCAG 1.4.10) and `@repo/ui/blocks/site-footer` (`SiteFooter({ brand, groups, legal? })`), both fed by `@repo/sites`. `docs`, `help` and `jobs` stay static: `controls` is `ThemeToggle`, `StaticLocaleSwitcher` and `SignInLink`, `end` is **Open app**. `www` and `blog` render their own coaching-style headers instead (`blog`: `src/components/blog-header.tsx`, rendered per page so its language link can point at the page's translation). `app`, `auth` and `account` pass `LocaleSwitcher` (a language menu: flag and name per language from `LOCALE_FLAGS` in `@repo/i18n/locales`, bundled offline by `bun icons:bundle`, applied on activation, a `<details>` form without JavaScript; the account Language card keeps `LocaleSelect`) and `ThemeToggle` as `controls`, read the session and put `NotificationBell` (`@repo/ui/blocks/notification-bell`, the unread badge linking to `account`'s `/notifications`, `aria-current="page"` there through its `current` prop) next to `UserMenu` in `end` when signed in (`app` falls back to `SignInLink` with `next` = the current page; `account` adds its `SidebarTrigger` as `start` and sets `sticky`). Every layout composes them; change the block, not the layouts.
- **Brand** — `BRAND_NAME` in `@repo/sites/brand` is the name (every title, manifest, OG image,
  email and the brand link read it); `@repo/ui/components/brand` (`Brand`, `BrandMark`) is the
  mark. See `docs/guides/renaming-the-brand.md`.
- **Theme toggle** — `@repo/ui/components/theme-toggle`: the single light/dark control, in every header.
- **Sites registry** — `@repo/sites`: `SITES`, `siteUrl(id)`, `siteNav(current)`, `footerGroups()`. `SITE_DOMAIN` unset → `http://<id>.brand.localhost:<port>`; a `.localhost` domain keeps that `http://…:<port>` form; anything else → `https://<id>.<domain>`. The static apps evaluate it at `next build`, so a production build (and image) must be built with `SITE_DOMAIN`; `app`, `auth` and `account` evaluate it per request (in the image, from the `ENV` the same build arg sets). It never throws: in production mode without `SITE_DOMAIN` it falls back to `brand.localhost` and logs `[sites] SITE_DOMAIN is not set` once per process (a `next build` prints it once per worker). `AUTH_URL` / `APP_URL` stay separate, explicit env vars (see **Authentication**); only their dev defaults come from here. It also builds every app's `sitemap.ts` and `robots.ts`: `sitemapFor(id, PUBLIC_ROUTES)` and `robotsFor(id, { disallow? })`, each a two-line file over the app's `src/lib/routes.ts` `PUBLIC_ROUTES`. `www`, `docs`, `help`, `jobs` and `blog` allow everything; `auth` lists `/login`, `/signup` and `/forgot-password` and disallows `/oauth/`, `/magic`, `/verify-email`, `/reset-password`, `/login/verify` and `/email/`; `app` and `account` have an empty sitemap and `Disallow: /`. `robotsFor` drops `Allow: /` when `disallow` includes `/` (under RFC 9309 an equally specific Allow would win).
- **Blocks** — the landing blocks in `@repo/ui/blocks/*`: `LogoCloud`, `FeatureGrid`, `Testimonials`, `Cta`, `Pricing`, `Faq` (`jsonLd` emits FAQPage structured data, for string answers only), `Newsletter` (a plain `<form action>`; the app passes a server action and its `FormState`) and `LegalPage`, next to `Hero`, plus the `SectionHeading` component (`@repo/ui/components/section-heading`) that `FeatureGrid`, `Testimonials`, `Pricing`, `Faq` and `Newsletter` start with (`LogoCloud` has a caption, `Cta` and `LegalPage` their own heading). Content-agnostic: all copy is props. `apps/www`'s home is the reference composition — `src/content/home.tsx` holds every word, `src/views/home-view.tsx` only arranges blocks. See `packages/ui/src/blocks/README.md`.
- **Cookie consent** — `@repo/ui/components/cookie-consent` (`CookieConsent({ domain?, privacyHref, initial? })`), rendered in every app's root layout (`account`: its `(account)` route-group layout, the one with the footer). It writes the `consent` cookie (`@repo/ui/lib/consent`: `CONSENT_COOKIE`, `parseConsent`, `consentCookie`): `all` or `necessary`, `Max-Age` 180 days (`CONSENT_MAX_AGE`), `SameSite=Lax`, `Secure` over https, `Domain` = `COOKIE_DOMAIN`, so one choice holds on every subdomain. `useConsent()` (`@repo/ui/components/use-consent`) reads it client-side and re-renders when the banner writes it; `WebVitals` takes a `consent` prop as the hook point production analytics must check (`consent === "all"`) before sending anything identifying. `<Analytics />` and the `POST /api/analytics` route read the same cookie: a pageview needs no consent (it is cookieless by design — see **Analytics**), and `all` is only what adds a signed-in visitor's user and workspace id to it. The static apps (`www`, `docs`, `help`, `jobs`, `blog`) read `COOKIE_DOMAIN` at `next build` (`.brand.localhost` outside production; unset in production → a host-only cookie) and the banner reads the cookie after mount; `app`, `auth` and `account` read it per request and pass `initial={parseConsent(<cookie header>)}`, so a decided visitor never sees the banner flash.
- **OG images** — `@repo/ui/lib/og` (`ogImage({ title, subtitle?, brand? })`, `OG_SIZE` 1200×630, `ogElement` for tests). Each app has `src/app/opengraph-image.tsx` (calling `ogImage`; `force-static` in the static apps) and a `twitter-image.tsx` that re-exports it; change the renderer, not the files.
- **Service workers & PWA** — `@repo/ui/lib/service-worker` (`startServiceWorker(kind, self.__SW_MANIFEST)`) with the rules in `@repo/ui/lib/service-worker-rules`; each app's `src/app/sw.ts` is that one call (built by `@serwist/next` in `next build --webpack`, disabled in `next dev`). Two kinds: **`private`** (`app`, `auth`, `account` — their pages show the signed-in user) caches only build assets, fonts and `/icons/`, never pages, client-side navigation payloads (`RSC: 1`) or `/api/*`, so nothing of a user outlives sign-out in Cache Storage; **`public`** (`www`, `docs`, `help`, `jobs`, `blog`) serves pages (documents) network-first, readable offline once visited — RSC payloads stay network-only (link prefetches would crowd the documents out, and a failed RSC fetch makes Next fall back to a full navigation anyway); with a network slower than 3 s a cached page from an earlier deploy can show, acceptable for public pages. A failed navigation falls back to `public/offline.html` — a static file, identical in every app and precached; never a Next route, which in the signed-in apps would render (and so cache) the user's header. On activation the worker deletes every cache on its origin that neither starts with `serwist-` nor is one its rules use (with that cache's expiration metadata), so caches an older worker filled are removed on update — page scripts must not keep their own Cache Storage under another name. The precached `offline.html` keeps the headers it was installed with until the file itself changes (its revision is a content hash). Every app's Serwist config sets `reloadOnOnline: false` (the default reloads the page on each `online` event, discarding whatever is typed into an open form); the offline page's **Try again** is therefore manual — an `online` listener there would loop under Playwright's offline emulation, where that event fires with `navigator.onLine` true. `scripts/pwa.test.ts` checks each manifest (names, `start_url`/`scope` `/`, standalone, 192/512/maskable icons at their declared pixel sizes), each `sw.ts`'s kind and the offline page; `apps/e2e/tests/pwa.spec.ts` checks registration per origin, that a signed-in app never caches the user (after a full and a `next/link` navigation, signed in and after sign-out — it fails on the previous worker) and the offline page. **Other workers:** there are no SharedWorkers or DedicatedWorkers, on purpose. A SharedWorker cannot span the subdomain apps (each is its own origin), and syncing tabs within one app is `BroadcastChannel`. When an app has real CPU work, add a DedicatedWorker as `new Worker(new URL("./x.worker.ts", import.meta.url))` (Next bundles it as a same-origin file); the shared CSP's `worker-src 'self'` allows that and blocks `blob:` workers.
- **Telemetry** — `@repo/telemetry`: errors and web vitals, one way. Browsers call `reportError` / `reportVital` (`@repo/telemetry/browser`) which `sendBeacon` to the app's own `POST /api/telemetry` (`createTelemetryRoute({ app })` from `@repo/telemetry/server`, a three-line file per app); the route refuses a cross-site write (a non-JSON `content-type`, or a `sec-fetch-site` other than `same-origin` / `none`), stamps the app, keys the api's limiter per browser (`telemetry:<ip hash>`, apart from the sign-in `anon:` bucket; the api adds a per-app backstop) and forwards to `telemetry.ingest` with the service token (outside production the route falls back to the dev api URL and token like `@repo/session`'s `loadEnv`) — browsers never call `apps/api`, no CSP change, no key in the client. `WebVitals` (every layout) reports CLS/INP/LCP/FCP/TTFB outside development; `BrowserTelemetry` (next to it) installs `window.onerror` / `unhandledrejection`; every `error.tsx` reports its boundary. Consent: events carry route (pathname only, opaque segments such as tokens and ids collapsed to `:id`), kind, message, stack, digest and metrics always; the user agent only when the `consent` cookie is `all`; never an ip, user id, cookie or body. `apps/api` stores errors per fingerprint-day (`telemetry_errors`, 30 days) and vitals (`telemetry_vitals`, 7 days), pruned hourly by the `telemetry.prune` schedule (see **Jobs**), and records its own 5xx and its background failures (dead jobs, webhook writes; addresses and long tokens masked); `apps/ai` reports through the api when `API_URL` / `API_SERVICE_TOKEN` are set. `TELEMETRY_PROVIDER=store` (default) keeps everything in the tables; `sentry` also forwards each new error to Sentry's envelope endpoint over `fetch` (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`; no SDK) through a `telemetry.forward` job, enqueued only when the provider is not `store`, retried on a network error, a 5xx or a 429, with a deterministic `event_id` (sha256 of fingerprint and day) so a redelivered job is deduplicated by Sentry — see `docs/guides/sentry.md`. Superadmins see the last 24 h of errors and p75 vitals per app on `/admin`. Reporting never throws and the route always answers 204. Pageviews and product events are a separate, cookieless concern on the same package — `@repo/telemetry/analytics` and `createAnalyticsRoute`, see **Analytics** below.
- **Accessibility** — the design tokens in `packages/ui/src/styles/globals.css` are pinned to WCAG
  contrast (4.5:1 text, 3:1 UI and the solid focus-ring colour; the half-opacity focus halo
  measures 2.14:1, a known limitation) by `contrast.test.ts`, which reads the `oklch()` values
  straight from the CSS and converts them to sRGB the way a browser renders them; a token edit that
  drops a pair below its minimum fails that test, not a page later. `SiteHeader`'s `controls` slot
  (above) and the admin card grids' `grid-cols-1` keep every page reflow-safe at 320 px (WCAG
  1.4.10). Beyond tokens and layout, `apps/e2e` runs the real pages: `tests/a11y-pages.spec.ts`
  sweeps a route manifest (`a11y/routes.ts`) through axe (`@axe-core/playwright`, every WCAG
  2.0–2.2 A/AA rule) in light, dark and — on the translated apps — Swedish, plus a handful of
  journey-only states (the two-step QR screen, the open user menu, the cookie banner, …) checked
  from inside the journey that reaches them; `tests/a11y-keyboard.spec.ts` drives four journeys
  with the keyboard alone, asserting a visible focus indicator at every stop and that every dialog
  or sheet traps focus and returns it on Escape; `tests/a11y-reflow.spec.ts` checks every manifest
  page (the admin detail pages and each app's not-found page included) at 320 × 640; `tests/a11y-motion.spec.ts` checks that nothing keeps animating under
  `prefers-reduced-motion`. `scripts/a11y.test.ts` (`bun test scripts`) fails when a `page.tsx` in
  one of the eight Next apps is in neither the manifest nor its reasoned `EXCLUDED` list, so a new
  page cannot silently skip the sweep. A reviewed allowlist (`apps/e2e/a11y.allowlist.json`) covers
  the few violations that are a third party's internals, not ours (today: one, Radix's
  `aria-hidden-focus` on the open account `UserMenu`); a stale entry — one that no longer covers a
  violation on any manifest page its route matches — fails the run (its own test in
  `a11y-pages.spec.ts`, so a retry cannot skip it). See `docs/guides/accessibility.md` for what
  each check covers, adding a page, and what automation cannot catch (screen-reader experience, meaningful alt text,
  cognitive load).

Never load fonts, theme providers, or global CSS directly in an app — new subdomain apps copy this exact layout pattern.

## Microfrontend Architecture

Each production app deploys to its own subdomain. Per-origin ServiceWorker means each app is independently installable as a PWA.

- **Dev URLs:** `*.localhost` (modern browsers auto-resolve; no `/etc/hosts` edits)
- **Shared client state across apps:** when needed, persist via cookies on the parent domain. Cross-origin SharedWorker is NOT viable (browser scopes prohibit).

**Adding a new subdomain app:**

0. Add it to `SITES` in `packages/sites/src/index.ts` (label and port) — and to `siteNav` / `footerGroups` there if it belongs in the nav or footer
1. Scaffold under `apps/<name>/` (Next.js project)
2. Set its dev script to `next dev --port <unique-port> --hostname ${DEV_HOSTNAME:-<name>.brand.localhost}`
3. Use `catalog:` for shared deps (next, react, motion, etc.)
4. PWA: wrap the Next config in `withSerwistInit` (copy `apps/www/next.config.ts`'s, `reloadOnOnline: false` included), add `src/app/sw.ts` (copy `apps/www`'s for a public app, `apps/app`'s for one with signed-in pages), `public/offline.html` (copy unchanged), `src/app/manifest.ts` and its `public/icons/` — `scripts/pwa.test.ts` checks them (see **Service workers & PWA**)
5. Copy `src/proxy.ts` and `src/app/{not-found,error,global-error}.tsx` from `apps/app` unchanged (security headers, status pages, and `error.tsx`'s `reportError` call) — but no `src/app/loading.tsx`: no app ships a root loading boundary (see **Status pages**) — and, if the app uses Zod client-side, `src/instrumentation-client.ts`. Copy `src/app/opengraph-image.tsx` (set its title) and `twitter-image.tsx`, and add `src/lib/routes.ts` (`PUBLIC_ROUTES`) with the two-line `src/app/sitemap.ts` / `robots.ts` over `sitemapFor` / `robotsFor` (`disallow: ["/"]` and empty routes if every page needs a session) Add `src/app/api/telemetry/route.ts` (`export const POST = createTelemetryRoute({ app: "<name>" })` from `@repo/telemetry/server`, like `/api/health`'s `app:` field) and `src/app/api/analytics/route.ts` (`export const POST = createAnalyticsRoute({ app: "<name>" })`, same package; a signed-in app passes an `identity` resolving `getMeFromRequest` + `analyticsIdentity` — copy `apps/app`'s) and render `<WebVitals />` / `<BrowserTelemetry />` / `<Analytics />` (`@repo/ui/components/web-vitals` / `browser-telemetry` / `analytics`) in the root layout next to the other single points; `API_URL` / `API_SERVICE_TOKEN` are optional for a static app (in production telemetry and analytics just drop without them) — see **Telemetry** and **Analytics**
6. If the app has signed-in pages: `createAuth` in `src/lib/auth.ts`, `src/instrumentation.ts` calling `assertAuthEnv()` (copy `apps/app`'s), `@repo/api-contract` and `@repo/session` added to `transpilePackages` in `next.config.mjs`, and the auth env vars (see **Authentication** below and `packages/session/README.md`). Tenant pages call `requireWorkspace()` (not just `requireUser()`) and the layout passes `workspaces` to `UserMenu`, with a `switchWorkspace` server action in `src/app/actions.ts` (copy `apps/app`'s; see **Workspaces** below). If it shows avatars or workspace logos (`UserMenu` does), copy `src/app/files/[...key]/route.ts` (two lines over `createFileRoute()`; see **Storage** below). If it shows live data, copy `src/app/api/events/route.ts` (a few lines over `createEventsRoute()`; see **Realtime** below)
7. Layout: copy a static app's `src/app/layout.tsx` header/footer block (`SiteHeader` with `siteNav("<name>")`, `SiteFooter` with `footerGroups()`; `apps/www`'s, or `apps/app`'s for signed-in pages), and add `@repo/sites` (`workspace:*`) to `package.json` and `transpilePackages`. That layout's title template and footer copyright, and `src/app/manifest.ts`, read `BRAND_NAME` from `@repo/sites` (copy an existing app's). Render `CookieConsent` after the footer: a static app passes the build-time `COOKIE_DOMAIN` (copy `apps/www`'s `cookieDomain`), a signed-in app the `loadEnv` one plus `initial={parseConsent(<cookie header>)}` (copy `apps/app`'s)
8. Configure Vercel project for `<name>.brand.com`
9. Docker (`scripts/docker.test.ts` fails until each line below is there): add a service to `docker-compose.yml` (`build.args: { APP: <name>, PORT: <port>, SITE_DOMAIN: … }`, plus `COOKIE_DOMAIN: "${COOKIE_DOMAIN:-.brand.localhost}"` for a static app), a
   matrix row to `.github/workflows/docker-build.yml.disabled`, `node_modules` (and, for Next apps, `.next`)
   volume lines to `docker-compose.dev.yml`, and the port to `.devcontainer/devcontainer.json` `forwardPorts`
10. A **content app** (MDX posts or pages, like `apps/blog`, `apps/docs`, `apps/help` and `apps/jobs`) additionally needs: `@repo/content` (`workspace:*`), a `source.config.ts` importing the frontmatter schema by *relative* path (never `@repo/content/schema` — fumadocs-mdx bundles that file with esbuild and leaves packages external, so a package import would load the schema's `.ts` source at runtime instead of the bundled copy), a `postinstall: "fumadocs-mdx"` script, and `.source/` in `.gitignore` (it's generated — `next dev` and `next build` both regenerate it, so it's never committed)
11. i18n — a signed-in app follows `auth`, `app` and `account`'s pattern; a static app follows
    `www`, `docs`, `help`, `jobs` and `blog`'s (see **i18n.** above and `docs/guides/i18n.md`).
    A signed-in app: `src/i18n/request.ts` (`next-intl`'s `getRequestConfig`, no routing, no
    `[locale]` segment — copy an existing signed-in app's, resolving the locale from
    `getAuth().getLocale()`, with `connection()` and `unstable_rethrow(error)` so it never runs at
    build time), wrap `next.config.mjs` in `withNextIntl` and add `next-intl` (`catalog:`), render
    `<html lang={locale}>` in the root layout (step 7's copied layout hard-codes `"en"` — change it
    to the resolved value) and wrap the tree in `NextIntlClientProvider` with only the namespaces
    its client components read, and add the header's `LocaleSwitcher`
    (`@repo/ui/components/locale-switcher`) next to `ThemeToggle` in `SiteHeader`'s `controls`, wired to a `setLocale` server
    action (copy `apps/app/src/app/actions.ts`'s) — a Personal-info-style page also gets a
    **Language** card (`LanguageForm` over `setLocaleCore`; copy `apps/account`'s). It needs its
    own namespace in `packages/i18n/messages/<locale>/<name>.json` and a `zodMessage(t)` for its
    forms (copy `apps/account/src/lib/i18n.ts`'s pattern), and — the gate every translated app
    runs — its own `src/i18n-guard.test.ts` over `@repo/i18n-guard`'s `scanApp` (copy an existing
    app's; `i18n-guard.allowlist.json` starts `[]`) plus `@repo/i18n-guard` as a `devDependency`
    (`workspace:*`). A static app instead adds `StaticLocaleSwitcher`
    (`@repo/ui/components/static-locale-switcher`) to the header's `controls` slot, passing its
    existing build-time `cookieDomain` — it writes the shared `locale` cookie client-side and
    shows a saved note; the page itself stays English and gets no i18n-guard test, no
    `next-intl` dependency and no namespace.

## Dependency Versioning (Bun catalog)

Shared dep versions live in the root `package.json` `catalog` field. Apps reference them via `"<dep>": "catalog:"`. Single source of truth for `next`, `react`, `motion`, `react-hook-form`, `@serwist/next`, `@iconify/react`, `zod`, etc.

**Three rules govern where a dependency is declared:**

1. **Shared runtime/build deps → `catalog:`.** If two or more workspaces need it, it goes in the
   root `catalog` and every workspace references `"catalog:"`. Never write a literal version range
   for a package that already has a catalog entry — that is how drift starts. Package families that
   must move in lockstep go in the catalog as a set even where only one workspace uses a member
   today — every `@orpc/*` package, and `ai` / `@ai-sdk/*`, is catalogued so the contract, server and client never disagree. `@ai-sdk/react` pins `ai` exactly, so bump `ai`, `@ai-sdk/react` and `@ai-sdk/anthropic`
   together to the `ai` version `@ai-sdk/react` pins; `scripts/ai-sdk-lockstep.test.ts` fails on a
   nested second copy of `ai` or `@ai-sdk/provider(-utils)` in `bun.lock`.
2. **Tooling splits by *how it is reached*, not by whether it's "tooling".**
   - **Invoked as a binary from a script → root `devDependencies` only.** `@biomejs/biome` is
     declared once at the root and in **no** workspace. Nothing imports it; `bun run` walks up to
     root `node_modules/.bin`, so per-app `biome lint .` still resolves.
   - **Imported or named by a workspace's own files → declare it in that workspace via `catalog:`.**
     `@next/bundle-analyzer` is `import`ed by every `next.config.mjs`, `@tailwindcss/postcss` is
     named in every `postcss.config.mjs`, and `@types/node` backs the `node:*` imports in each
     app's `scripts/`. Root-only would make these **phantom dependencies** — resolving purely
     because Bun hoists, while the app's manifest no longer describes what its own config needs.

   `@types/bun` follows the same rule: it backs the `Bun.*` globals and `bun:*` imports in
   `apps/api`'s own files, so `apps/api` declares it via `catalog:`.

   `typescript` now straddles both: `tsc --noEmit` still runs as the root-resolved binary for every
   `typecheck` script, but `@repo/i18n-guard` also imports its compiler API directly (to parse a
   file's AST and read its `parseDiagnostics`), so it is catalogued and `@repo/i18n-guard` declares
   `"typescript": "catalog:"` in `dependencies`. The root `devDependencies` entry now reads
   `"catalog:"` too, so the two can never drift apart — unlike `@biomejs/biome`, which no workspace
   imports and which therefore stays root-only.

   `packages/ui` keeps its own `tailwindcss` because `src/styles/globals.css` does
   `@import "tailwindcss"`, which Tailwind v4 resolves relative to the CSS file's own location.
3. **Workspace-specific deps stay local** with a literal range (e.g. `three` and `gsap` in
   `packages/ui`, the Storybook packages in `apps/story`).

Do not use the root `overrides` field to pin something the catalog already covers — the two drift
apart silently and `overrides` wins. It currently holds `react` / `react-dom`, which force
transitive React-18 consumers up to 19, and `tmp` (`^0.2.7`, a security fix for patch-package's
`^0.2.4` range, which no catalog entry covers — see **Security scanning**), `undici` (`^7.30.1`,
a security fix for `@ai-sdk/provider-utils`' `^7.29.0` range) and three nested
`@serwist/{build,next,webpack-plugin}>zod` entries set to `catalog:` (Serwist pins `zod` to an exact,
vulnerable version; pointing the override at the catalog keeps the two in step rather than
pinning a second number).

To bump a shared dep:
1. Edit the version in root `package.json` `catalog`
2. Run `bun install`
3. Test affected apps
4. Add a changeset if user-visible

To audit for drift or dead deps, grep each workspace's `src/` for the package name before assuming
a declaration is load-bearing — several apps declare packages they reach only through `@repo/ui`.

## Code Style

- Biome handles all formatting and linting
- Double quotes for strings
- No semicolons (ASI)
- 2-space indentation
- 100 character line width

## File Naming Conventions

- Components: PascalCase (`UserProfile.tsx`)
- Blocks: kebab-case (`hero.tsx`, `feature-grid.tsx`) with PascalCase exports
- Views: kebab-case (`home-view.tsx`) with PascalCase exports (`HomeView`)
- Utilities: camelCase (`formatDate.ts`)
- Pages: lowercase-with-hyphens (`user-settings/page.tsx`)
- Types: PascalCase with `.types.ts` suffix when separated

## Common Tasks

### Adding a New Block (shared section pattern)
1. Create `packages/ui/src/blocks/<name>.tsx` — content-agnostic, take props, use `cn()` for `className` merge
2. Add a Storybook story at `apps/story/stories/<Name>.stories.tsx`
3. Block must NOT import from any view or page

### Adding a New View (app-specific composition)
1. Create `apps/<app>/src/views/<route>-view.tsx`
2. Compose blocks (`@repo/ui/blocks/*`) and components (`@repo/ui/components/*`)
3. Named export `<Route>View` (PascalCase)

### Adding a New Page
1. Create `apps/<app>/src/app/<route>/page.tsx` — thin wrapper that renders a view
2. Add the corresponding view in `apps/<app>/src/views/`

### Form Patterns
React Hook Form + Zod aren't pre-installed in every workspace anymore — install them where you need them, then:
```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
```

### Adding an API endpoint
1. Add the procedure (Zod input/output, `route` metadata, declared errors) to `packages/api-contract/src/index.ts`
2. Implement it in `apps/api/src/router.ts` — the typecheck fails until the handler matches
3. Add a test in `apps/api/src/*.test.ts` against the real server (the `start()` helper in `test-server.ts`, which runs on SQLite or Postgres; tests send the bearer token — see its `auth` export). For a procedure that needs a session, `signUp(app)` from `test-server.ts` creates an account and returns a `client` signed in as it
4. A schema change is a new file in `apps/api/src/migrations/` (forward-only; list it in `migrations/index.ts`), never an edit to a merged one

Prefer Bun built-ins inside `apps/api` over npm packages: `Bun.sql` / `bun:sqlite`, `Bun.password`,
`req.cookies`, native WebSocket pub/sub (`@orpc/server/bun-ws` for oRPC over it), `bun test`.

### Authentication
`apps/api` owns users and sessions (`auth.*` / `account.*` in `@repo/api-contract`; tables from `0002_auth`). Next apps use `@repo/session`: one `createAuth(...)` in `src/lib/auth.ts`, `requireUser()` in pages/actions, `getUserFromRequest()` + `assertSameOrigin()` in route handlers. The cookie is `session`, HttpOnly, `SameSite=Lax`, on `COOKIE_DOMAIN` (`.brand.localhost` in dev, your parent domain in production — required). The browser never calls `apps/api`: a Next app forwards the cookie's token server-to-server as `x-session-token`, next to its service bearer token. The service token alone cannot act as a user: every ⚑ procedure needs an `x-session-token` that hashes to a live session row. `API_RATE_LIMIT` is per `x-api-client-id`, and `@repo/session` sends one per session, so one user cannot exhaust the bucket for everyone. Password-reset, verify, magic-link, password-changed and invitation mail go through `apps/api`'s `Mailer` seam (see **Email** below; log-only by default — in dev the links are in the api's log). Sign-out is a server action in each app (`src/app/actions.ts`: `auth.signOut`, `clearSession()`, then `/login?signedout=1` on the auth app), not a shared `/logout` route — a cross-subdomain POST would fail `assertSameOrigin`. Sign-in, sign-up, password reset, magic link and provider sign-in call the api through `anonymousApi({ ip })` (service token, no session; a provider start and callback for a signed-in browser forward its session instead, to connect the provider). That rate limiting of anonymous calls is per browser behind a proxy that sets `x-real-ip` / overwrites `x-forwarded-for`. With no proxy, `next start` fills `x-forwarded-for` from the socket address when it is absent, so each client gets its own bucket — but a client talking to Next directly can send its own `x-real-ip` / `x-forwarded-for`, so the key is best-effort, as behind a proxy that appends. Behind a proxy that sets neither, every caller arrives from the proxy's address and shares one bucket. Sign-up is capped regardless of that: `SIGNUP_EMAIL_RATE_LIMIT` per normalised email per hour (default 3) and `SIGNUP_RATE_LIMIT` per `SIGNUP_RATE_WINDOW_SECONDS` api-wide (default 30 per 10 minutes), because each sign-up mails a verify link to whatever address it is given; magic-link requests likewise (3 per email per 15 minutes, `MAGIC_LINK_RATE_LIMIT` per `MAGIC_LINK_RATE_WINDOW_SECONDS` api-wide, silent), and password-reset requests (3 per email per 15 minutes, `PASSWORD_RESET_RATE_LIMIT` per `PASSWORD_RESET_RATE_WINDOW_SECONDS` api-wide, silent). A flood therefore refuses new sign-ups for everyone until the window passes, and the caps are per process (see `apps/api/README.md`). Every host under `COOKIE_DOMAIN` is trusted: a sibling subdomain can set the `session` cookie, so never serve user-controlled content under the parent domain. Behind a proxy that rewrites `Host`, server actions (sign-in, sign-out) fail Next's Origin check until the public origin is listed in `experimental.serverActions.allowedOrigins` in that app's `next.config.mjs`. See `packages/session/README.md`, `apps/api/README.md` and `apps/auth/README.md`; for social sign-in see **Social sign-in and magic link** below.

| Var | Apps | Dev default | Production |
|---|---|---|---|
| `COOKIE_DOMAIN` | app, auth, account | `.brand.localhost` | required |
| `COOKIE_DOMAIN` (build time) | www, docs, help, jobs, blog | `.brand.localhost` | optional; unset → a host-only consent cookie |
| `AUTH_URL` | app, account, api | `http://auth.brand.localhost:3002` | required (`apps/api` exits at startup without it; `account` also builds the `/login?reauth=1&next=…` link two-step setup's stale-session refusal shows). `apps/api` refuses one containing whitespace, CR, LF, `<` or `>` at startup — it rides inside a `List-Unsubscribe: <…>` mail header (see **Notification preferences.**), and any of those could split the header or break out of its brackets |
| `APP_URL` | app, auth, account, api | `http://app.brand.localhost:3001` | required (`apps/api` exits at startup without it; invitation links point at it) |
| `API_URL`, `API_SERVICE_TOKEN` | every Next app (optional for docs/blog: in production telemetry drops without them), ai (optional) | `http://api.brand.localhost:3007`, the dev token | required (`app`, `auth`, `account`, `www`, `help`, `jobs`: `www` for the contact and booking actions (`leads.create`, `booking.*`), `help` for the `/contact` form's `support.create` call, `jobs` for the apply form's `jobs.apply` call); optional elsewhere — telemetry just stops forwarding |
| `ACCOUNT_URL` | api | `http://account.brand.localhost:3003` | required (`apps/api` exits at startup without it). Rejected at startup on the same whitespace/`<`/`>` grounds as `AUTH_URL` above, since an optional notification mail's inbox link is built from it too |
| `SITE_DOMAIN` | api (the links in www-bound mail — the contact confirmation's next step, the booking mails, the waitlist welcome — and `PASSKEY_RP_ID`'s default), every Next app | `brand.localhost` | your parent domain (see **Sites registry**); the api refuses to start when the passkey RP ID it gives does not cover the `AUTH_URL` / `ACCOUNT_URL` hosts |
| `NEXT_PUBLIC_BOOKING_PAYMENTS` (build time) | www | on (unset outside production) | optional; `mock` offers the mock Apple Pay / Google Pay / Swish on `/book`; unset or anything else in production → invoice only, no "test mode" line (`apps/www/src/lib/mock-payment.ts`); the e2e build sets `mock` |
| `CONTENT_REPO_URL` (build time) | docs | — (no "Edit on GitHub" link) | optional; e.g. `https://github.com/<owner>/<repo>/blob/main/apps/docs/content/docs` — shows "Edit on GitHub" on every page, the file path appended |
| `MAIL_PROVIDER` | api | `log` | `smtp` or `resend` (with `log` or `file`, the api warns at startup) |
| `MAIL_FROM` | api | `Boilerplate <no-reply@brand.localhost>` | required with `smtp` / `resend` |
| `SUPPORT_EMAIL` | api | — (`MAIL_FROM`'s address) | optional; where help-center support requests are mailed (the api warns at startup in production without it) |
| `HIRING_EMAIL` | api | — (wherever support requests go: `SUPPORT_EMAIL`, else `MAIL_FROM`'s address) | optional; where job applications are mailed (the api warns at startup in production without it) |
| `SMTP_URL` | api | — | required iff `MAIL_PROVIDER=smtp` (at any `NODE_ENV`) |
| `RESEND_API_KEY` | api | — | required iff `MAIL_PROVIDER=resend` (at any `NODE_ENV`) |
| `MAIL_DIR` | api | — | required iff `MAIL_PROVIDER=file` (at any `NODE_ENV`); used by `apps/e2e` (`apps/e2e/.tmp/mail`), fine for other local/throwaway runs, never production |
| `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET` | api | — (Google off) | optional; both or neither |
| `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET` | api | — (GitHub off) | optional; both or neither |
| `OAUTH_APPLE_CLIENT_ID`, `OAUTH_APPLE_TEAM_ID`, `OAUTH_APPLE_KEY_ID`, `OAUTH_APPLE_PRIVATE_KEY` | api | — (Apple off) | optional; all four or none (the key is a PKCS#8 PEM, `\n` escapes allowed, parsed at boot) |
| `BILLING_PROVIDER` | api | `mock` | `stripe` (with `mock`, plans activate without payment and the api warns at startup) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | api | — (mock billing) | required iff `BILLING_PROVIDER=stripe` (at any `NODE_ENV`) |
| `STRIPE_PRICE_PRO_MONTH`, `STRIPE_PRICE_PRO_YEAR`, `STRIPE_PRICE_TEAM_MONTH`, `STRIPE_PRICE_TEAM_YEAR` | api | — (mock billing) | required iff `BILLING_PROVIDER=stripe`; the Stripe price ids (`price_…`) |
| `BOOKING_EMAIL` | api | — (wherever support requests go) | optional; where new coaching bookings, booking requests and contact-form leads are mailed (the api warns at startup in production without it) |
| `SUPERADMIN_EMAILS` | api | — (nobody) | optional; comma-separated emails |
| `SIGNUP_RATE_LIMIT`, `SIGNUP_RATE_WINDOW_SECONDS` | api | `30`, `600` | optional; the api-wide sign-up cap |
| `SIGNUP_EMAIL_RATE_LIMIT` | api | `3` | optional; sign-ups per normalised email per hour |
| `MAGIC_LINK_RATE_LIMIT`, `MAGIC_LINK_RATE_WINDOW_SECONDS` | api | `30`, `600` | optional; the api-wide magic-link cap (silent) |
| `PASSWORD_RESET_RATE_LIMIT`, `PASSWORD_RESET_RATE_WINDOW_SECONDS` | api | `30`, `600` | optional; the api-wide password-reset cap (silent) |
| `TELEMETRY_RATE_LIMIT` | api | `60` | optional; telemetry events per browser per minute (the per-app cap stays 3000) |
| `TELEMETRY_PROVIDER` | api | `store` | `store` or `sentry` |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | api | — | required iff `TELEMETRY_PROVIDER=sentry` / optional |
| `ANALYTICS_PROVIDER` | api | `store` | `store`, `posthog` or `plausible` |
| `ANALYTICS_RETENTION_DAYS` | api | `90` | optional; raw pageview/event rows (`analytics_daily` is kept indefinitely); the funnel and top referrers read raw rows, so they cover at most this many days of a longer range; `analytics.prune` floors its cutoff at the oldest day the nightly rollup still rebuilds, so e.g. `1` keeps raw rows two days in practice |
| `ANALYTICS_RATE_LIMIT` | api | `120` | optional; analytics beacons per browser per minute (the per-app cap stays 6000) |
| `POSTHOG_KEY`, `POSTHOG_HOST` | api | — | required iff `ANALYTICS_PROVIDER=posthog`; `POSTHOG_HOST` must be a URL |
| `PLAUSIBLE_DOMAIN`, `PLAUSIBLE_HOST` | api | — | required iff `ANALYTICS_PROVIDER=plausible`; `PLAUSIBLE_HOST` must be a URL |
| `STORAGE_PROVIDER` | api | `local` | `s3`, or `local` on one node with a volume (the api warns at startup) |
| `STORAGE_DIR` | api | `.data/storage` (from the api's working directory) | the volume's path with `local` (the Docker image sets `/data/storage`) |
| `STORAGE_PUBLIC_URL` | api | — (`/files/<key>` on each app) | optional; a public bucket or CDN, images served as `<url>/<key>` |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | api | — (local storage) | required iff `STORAGE_PROVIDER=s3` (at any `NODE_ENV`) |
| `S3_ENDPOINT` | api | — (AWS S3) | optional; R2, MinIO, SeaweedFS or another S3-compatible endpoint |
| `JOBS_WORKER` | api | `true` | `false` on api replicas when a dedicated worker (`src/worker.ts`) runs the jobs |
| `JOBS_CONCURRENCY` | api, worker | `4` | optional; jobs one process runs at once (1–50) |
| `WEBHOOK_CONCURRENCY` | api, worker | `2` (never above `JOBS_CONCURRENCY`) | optional; `webhook.deliver` jobs one process runs at once (1 to `JOBS_CONCURRENCY`, more refused at startup), so slow or silent endpoints never take every slot from mail and the other jobs; equal to `JOBS_CONCURRENCY` reserves none (see **Webhooks**) |
| `JOBS_POLL_MS` | api, worker | `1000` | optional; the idle poll interval in ms (100–60 000) |
| `BACKUP_ENABLED` | api, worker | `false` | optional; turns on the nightly `backup.run` schedule (`0 2 * * *`); read by the scheduler on each tick (a change to the process's env still means a restart) |
| `STORAGE_SWEEP_ENABLED` | api, worker | `true` | optional; `false` pauses the nightly `storage.sweep` schedule without stopping the other jobs — after a restore, until the bucket and the database agree again (see `docs/guides/operations.md`) |
| `WEBHOOK_ALLOW_LOCALHOST_HTTP` | api, worker | `false` | optional; the only way to let outgoing webhook deliveries target `http`/`https` on `localhost` and `*.localhost` (dialled at `127.0.0.1`), honoured in any `NODE_ENV` — one loud startup warning when it is on in production. For local development (`bun dev`, to use a `*.localhost` receiver) and `apps/e2e` only — never a real deployment (see **Webhooks**) |
| `BACKUP_RETENTION_DAYS` | api, worker | `14` | optional; integer 1–365, how long `backup.run` keeps its own objects under `backups/` before deleting them itself (`storage.sweep` never looks there) |
| `AUDIT_PII_RETENTION_DAYS` | api, worker | `90` | optional; integer ≥ 1 and strictly less than `AUDIT_RETENTION_DAYS`; how long `audit.prune` keeps a row's `ip`/`user_agent` before stripping them |
| `AUDIT_RETENTION_DAYS` | api, worker | `365` | optional; integer 180–1095 (CNIL's general case to its internal-control maximum), or up to 3650 with `AUDIT_RETENTION_JUSTIFIED=true`; how long `audit.prune` keeps a whole `audit_log` row before deleting it |
| `AUDIT_RETENTION_JUSTIFIED` | api, worker | `false` | optional; `true` lets `AUDIT_RETENTION_DAYS` go up to 3650 and logs one startup warning asking the operator to document the legal obligation or DPIA that justifies it |
| `REALTIME_BUS` | api | from `DATABASE_URL`: `postgres` on Postgres, `memory` on SQLite | optional override (`memory` is one process only) |
| `REALTIME_MAX_STREAMS` | api | `1000` | optional; open event streams per api process (`503` beyond) |
| `TWO_FACTOR_ENCRYPTION_KEY` | api | a fixed dev key (`DEV_TWO_FACTOR_KEY`) | required (32 bytes, base64; `apps/api` exits at startup without it, and refuses the dev key) |
| `PASSKEY_RP_ID` | api | `SITE_DOMAIN`, else `brand.localhost` | optional; the WebAuthn relying party id — the registrable domain `apps/auth` and `apps/account` share passkeys on. The api exits at startup (any `NODE_ENV`) unless it equals, or is a parent domain of, both the `AUTH_URL` and `ACCOUNT_URL` hosts — so in production set `SITE_DOMAIN` (or this) |
| `PASSKEY_RP_NAME` | api | `BRAND_NAME` | optional; the name the browser's passkey prompt shows |
| `LOG_LEVEL` | api, worker, ai | `info` | optional; `debug` / `info` / `warn` / `error`; an invalid value falls back to `info` with one warning line |
| `LOG_FORMAT` | api, worker, ai | `pretty` outside production, `json` in it | optional; `json` or `pretty` |
| `METRICS_TOKEN` | api, worker | — (`/metrics` answers `404`) | optional; ≥ 24 chars, the bearer `/metrics` requires (wrong/missing token: `401`); `apps/ai` exposes no `/metrics` |
| `READY_TIMEOUT_MS` | api, worker | `2000` | optional (100–60 000); how long `/ready` (the worker's `/health`) waits for the database ping before answering `503` "Not ready (timed out)" |
| `REQUEST_TIMEOUT_MS` | api, ai | `30000` | optional (1 000–600 000); the server-side request deadline: a handler with no response by then answers `503` "The request took too long. It may still complete — check before retrying." (event streams exempt) |
| `API_TEST_QUERY_DELAY_MS` | api | `0` | **test-only** (0–10 000); every database statement waits this long first — ignored (and reset to `0` with a warning) whenever `NODE_ENV=production`; `apps/load`'s `slow` drill is the one caller, over `apps/api/src/env.ts` |
| `GIT_COMMIT` | api, worker | — (`build_info`'s `commit` label reads `"unknown"`) | optional; read directly from the process env (not validated), shown on `build_info{version,commit}` |

Outside production `@repo/session`'s `loadEnv` falls back to these defaults; in production it throws on the first request that needs a missing key (not at `next build`). Each app with signed-in pages also has a `src/instrumentation.ts` calling `assertAuthEnv()` from `@repo/session/env`, so a production `next start` missing any of `API_URL`, `API_SERVICE_TOKEN`, `COOKIE_DOMAIN`, `AUTH_URL`, `APP_URL` (or holding an empty value) fails at boot instead of on the first signed-in request (Next 16 keeps the process listening: it logs `Failed to prepare server … <KEY> is not set` and answers every request, `/api/health` included, with 500, so the Docker health check reports the container unhealthy). `apps/auth`, `apps/app` and `apps/account` use `createAuth`. `apps/www` has no sessions: its `src/instrumentation.ts` calls `assertEnv(["API_URL", "API_SERVICE_TOKEN"])` (the generic check `assertAuthEnv` delegates to), and its contact and booking actions key the api's rate limit on `requestInfo(headers).ip` — `requestInfo` lives in `@repo/session`, shared with `apps/auth`.

The sections below are summaries. Each link holds the full behaviour: read it before changing that area, and put new detail there, keeping the summary here to the rules someone must not miss (`scripts/claude-md.test.ts` caps this file's size). Bold names such as **Jobs** elsewhere in the docs refer to these entries.

**Email.** Every mail goes through the `apps/api/src/mail/` seam (`MAIL_PROVIDER`: `log`, `smtp`, `resend`, `file`) as a `mail.send` job; `log` and `file` expose one-time links, so never production. Templates live in `@repo/email`: a new email = template + test + story. Verification is soft. One-time tokens share the `tokens` table by `purpose`; a new one is a value there, not a table. Full reference: [docs/architecture/email.md](docs/architecture/email.md).

**Workspaces.** The tenant: `workspaces`, `memberships`, `invitations`. Roles are the ordered `ROLES`, compared with `roleAtLeast`; `owner` comes only from `workspaces.transferOwnership`. Scoped procedures take an explicit `workspaceId` behind `member(min)`: a non-member gets `NOT_FOUND` whether or not the workspace exists (no existence oracle). Every workspace keeps an owner; writers lock `workspaces.lockForOwnership` first (user row before workspaces, workspaces in ascending id). Invitations are hashed, single use, 7 days, bound to the invited address. The `workspace` cookie is a hint re-checked per request by `requireWorkspace()`; only server actions write it. Full reference: [docs/architecture/workspaces.md](docs/architecture/workspaces.md).

**Billing.** Belongs to the workspace, never the user. `PLANS`, `FEATURES` and `entitlementsFor` are in `packages/api-contract/src/billing.ts`. One seam, `apps/api/src/billing/` (`mock` or `stripe`; the SDK stays in `src/billing/stripe.ts`). Entitlements are computed per request from the mirror tables, never cached and never fetched from Stripe. `POST /billing/webhook` sits outside the bearer guard: the signature over the raw body is the authentication; anything it will never apply answers `200`, a database failure `500`. Seats are enforced on invite and accept; `chat` and `api` are paid features. Full reference: [docs/architecture/billing.md](docs/architecture/billing.md).

**API keys and /v1.** A workspace admin or owner issues `bb_live_<prefix>_<secret>` keys, shown once and stored as a SHA-256 hash, with explicit scopes from `API_SCOPES`, at most 20 live per workspace, for the paid `api` feature. `/v1/*` authenticates only with these keys, through `createApiKeyGuard`; every refusal is `401` with no oracle for why. Every `/v1` error is `{"error":{"code","message"}}`, every query is scoped to the key's workspace in SQL, and no email ever appears. `/v1` only ever gains: anything that could break a caller is `/v2`. Full reference: [docs/architecture/api-keys.md](docs/architecture/api-keys.md).

**Webhooks.** Workspace admins push events to their own `https` endpoints (paid `api` feature; at most 10 per workspace). `emitWebhookEvent` runs inside the change's own transaction, one `webhook.deliver` job per subscribed endpoint. Signing follows Standard Webhooks. The SSRF guard (`apps/api/src/webhooks/ssrf.ts`) checks every resolved address at create and again before dialling, pins the checked address and never follows a redirect. Secrets are encrypted, never hashed, and shown once. Payloads match `/v1` shapes and never carry an email. Five dead deliveries in a row, or a `410`, disable the endpoint. `WEBHOOK_CONCURRENCY` keeps slots free for other jobs. Full reference: [docs/architecture/webhooks.md](docs/architecture/webhooks.md).

**Developer docs.** `apps/docs`'s **Developers** section is for the product's customers, not this repo's developers. `@repo/public-api-contract/openapi` is the single source, the same document `/v1/openapi.json` serves; contract `summary`/`description`/`.describe()` text is customer-facing prose. After a contract change run `bun run --filter @repo/docs generate:api`: a drift test fails on any committed page that differs. Full reference: [docs/architecture/developer-docs.md](docs/architecture/developer-docs.md).

**Social sign-in and magic link.** Google, GitHub and Apple run through `apps/auth`'s `/oauth/<provider>/{start,callback}`; provider secrets and the token exchange live only in `apps/api`. Only a provider-verified email links or creates an account. Linking or a magic link into an unverified account runs `purgeUnverifiedAccount` first, locking out anyone who pre-registered the address. Connecting while signed in needs a session under `REAUTH_WINDOW_MS` and keeps the caller's own session. Magic links are consumed only by the page's **Continue** button, never on load, so mail scanners cannot burn them. Setup: `docs/guides/oauth-providers.md`. Full reference: [docs/architecture/social-sign-in.md](docs/architecture/social-sign-in.md).

**Two-factor.** TOTP plus ten single-use recovery codes, for every sign-in method: sign-in answers a one-time challenge that only `auth.twoFactor.verify` turns into a session. Turning it on needs a verified email and fresh credentials (`requireFreshCredential`, `REAUTH_WINDOW_MS`). Secrets are AES-256-GCM under `TWO_FACTOR_ENCRYPTION_KEY`, which is not derived from `API_SERVICE_TOKEN`. `users.sessions_revoked_at` kills outstanding challenges. There is no email bypass: a lost phone needs a recovery code or a superadmin reset, and a password reset leaves it on. Full reference: [docs/architecture/two-factor.md](docs/architecture/two-factor.md).

**Passkeys.** WebAuthn: a passkey counts as both factors, so `auth.passkey.verify` never returns a two-factor challenge. User verification is `required`, resident keys `required`, attestation `none`. `PASSKEY_RP_ID` must cover the `AUTH_URL` and `ACCOUNT_URL` hosts or the api refuses to start. Challenges are single use (`tokens.consume` first). At most 10 per account, re-checked under the user-row lock; a passwordless account's last way in cannot be removed. Writers lock the user row first. Unverified accounts lose their passkeys on purge or password reset. Full reference: [docs/architecture/passkeys.md](docs/architecture/passkeys.md).

**Email change.** `account.email.*` re-authenticates (plus a code with two-step on), confirms by a link to the new address and warns the old one with a cancel link; a taken address gets the identical answer, so nothing can be probed. Confirming mails a 7-day "This wasn't me" revert link that locks the account down and rolls back what changed since the request. Links are consumed by a button, never on load. Mail to the account's own addresses uses its saved locale, never the request's. Full reference: [docs/architecture/email-change.md](docs/architecture/email-change.md).

**Suspension.** `isSuspended(user, now)` is computed on every read from `Context.now()`; expiry is never written back by a job. Enforcement sits after each path's own credential check, so the suspended message is never an existence oracle: password, magic link, OAuth, two-step verify, passkey, impersonation and `resolveSession`. `admin.users.suspend` / `unsuspend` are superadmin only, never yourself or another superadmin. `suspension_reason` is never shown to the user or exported. A record stays until **Lift suspension**. Full reference: [docs/architecture/suspension.md](docs/architecture/suspension.md).

**Storage.** One seam, `apps/api/src/storage/` (`local` or `s3` via Bun's `S3Client`, no SDK). Keys are random and never reused, so a replace writes a new object and queues `storage.delete` for the old one. Images are validated by magic bytes (PNG, JPEG, WebP; 2 MB; 4096 px) with metadata stripped by allowlist. Browsers never call `apps/api`: each signed-in app serves `/files/<key>` through `createFileRoute()`, and `files.get` serves only a key a row currently holds. Every UI form works without JavaScript. One bucket per environment: `storage.sweep` deletes what its own database does not reference. Full reference: [docs/architecture/storage.md](docs/architecture/storage.md).

**Privacy.** `account.export.*` writes a JSON export, read with explicit column lists so no secret rides along, downloadable by its owner for 7 days. `account.delete` schedules a purge 7 days ahead and ends every session; **Cancel deletion** stops it. The hourly `privacy.purge` re-checks everything inside its own transaction and rolls back rather than leave a shared workspace ownerless. A new user-owned table must be added to both the export and `users.purge`. Full reference: [docs/architecture/privacy.md](docs/architecture/privacy.md).

**Jobs.** A durable queue in the api's own database: `defineJob` in `src/jobs/`, listed in `JOBS` in `src/jobs/registry.ts`; `defineSchedule` for cron. Delivery is **at least once**, so make jobs idempotent where it matters. Pass `tx` to `context.enqueue` so data and job commit together. The worker runs in every api process unless `JOBS_WORKER=false`; `src/worker.ts` is the dedicated one. Ship workers with or after the code that defines a new job. Tests run with the worker off and call `drain()`. Guide: `docs/guides/background-jobs.md`. Full reference: [docs/architecture/jobs.md](docs/architecture/jobs.md).

**Realtime.** Server-Sent Events relayed through each app's own origin, so browsers never call `apps/api` and `connect-src` stays `'self'`. One seam, `apps/api/src/realtime/` (`memory` on SQLite, `postgres` NOTIFY across replicas; payloads under 8000 bytes on both). `publishAfterCommit` runs after the transaction and is fire-and-forget. Streams re-check auth every 60 s and carry stream caps. `@repo/api-contract/realtime` is the browser-safe subpath. Proxies must not buffer `text/event-stream`. Guide: `docs/guides/realtime.md`. Full reference: [docs/architecture/realtime.md](docs/architecture/realtime.md).

**Admin.** `SUPERADMIN_EMAILS` plus a verified email makes a superadmin, computed per request. Every `admin.*` procedure and page answers `NOT_FOUND` to anyone else, impersonation included. Impersonation is a 60-minute session row with a reason, never of yourself or another superadmin; a new sensitive `account.*`, billing or workspace write must refuse it ("Not available while impersonating") or be audited. `audit_log` is append-only apart from `audit.prune` and the privacy purge. Full reference: [docs/architecture/admin.md](docs/architecture/admin.md).

**Audit retention and export.** `audit.prune` strips `ip`/`user_agent` after `AUDIT_PII_RETENTION_DAYS` and deletes rows after `AUDIT_RETENTION_DAYS` (180-1095, up to 3650 with `AUDIT_RETENTION_JUSTIFIED=true`). `admin.audit.export` is a synchronous, capped CSV (with OWASP's injection guard) or JSON Lines download, audited after the file is built. Tamper evidence is a known, documented gap. Full reference: [docs/architecture/audit.md](docs/architecture/audit.md).

**Activity log.** `auditWorkspace` records every action in `WORKSPACE_ACTIVITY_ACTIONS`, inside the change's own transaction and only on a real change, targeting what changed rather than the workspace. `workspaces.activity.list` is admin and up, 90 days, on every plan. Never show `ip`, `user_agent`, `reason` or a staff id; a former member keeps a name, never an address. Full reference: [docs/architecture/activity-log.md](docs/architecture/activity-log.md).

**Required two-step.** An owner can require two-step or a passkey of every member; a member without one is blocked, never removed. `satisfiesTwoFactor` is judged fresh per request; `member(min)` refuses with `data.reason: "two_factor_required"` after the role check. Exempt, so a blocked member can always fix it or leave: `workspaces.list/create/leave`, `invitations.*` and all `account.*`/`auth.*`. Impersonation follows the member. A new `member` procedure is blocked by default. `/v1` and webhooks are unaffected. Blocked pages render `TwoFactorRequiredNotice`, not a redirect. Full reference: [docs/architecture/required-two-step.md](docs/architecture/required-two-step.md).

**Invitation domains.** An owner can limit invitations to listed domains: a restriction only, never auto-join, and existing members are untouched. `@repo/api-contract/invite-domains` (Zod-free) normalises with the same rule on client and server; matching is exact. Create, re-invite, accept and acceptById all enforce it, and accept locks the workspace row before the invitation. A corrupt stored value fails closed, allowing no address. Format domain lists with `Intl.ListFormat` / next-intl, never by hand. Full reference: [docs/architecture/invitation-domains.md](docs/architecture/invitation-domains.md).

**Notifications.** A per-user inbox for what happened *to* the person: a badge and an inbox, no toasts, pop-ups or sounds. `notifyUser` validates against `NOTIFICATION_TYPES` (`@repo/api-contract/notifications`, Zod-free) and writes inside the change's transaction; `isActor` skips telling someone about their own action. `data` holds ids and display names, never an email, token or secret. Reads work while impersonating, marking read does not. `GET /events/me` has its own stream counters. The privacy export and `users.purge` cover the table. Full reference: [docs/architecture/notifications.md](docs/architecture/notifications.md).

**Notification preferences.** `NOTIFICATION_EMAIL` splits types into `locked` (always mailed) and `optional` (`member.role_changed`, `member.removed`, `plan.changed`; on by default; verified addresses only). Optional mail carries RFC 8058 `List-Unsubscribe`. The signed, non-expiring token uses an HKDF key from `TWO_FACTOR_ENCRYPTION_KEY`; a bad token gets the same answer as a good one and spends nothing. `apps/auth`'s one-click endpoint sits outside `assertSameOrigin` on purpose. Guide: `docs/guides/notification-preferences.md`. Full reference: [docs/architecture/notification-preferences.md](docs/architecture/notification-preferences.md).

**Analytics.** First-party and cookieless. Product events come only from `apps/api` (`recordEvent`, an `analytics.event` job); browsers send pageviews and `pricing_viewed`, through the app's own `POST /api/analytics`. `visitor_id` is a hash under a daily salt; ip and user agent are never stored. Consent `all` adds user and workspace ids; impersonation records nothing. New events go in `ANALYTICS_EVENTS` and the `/privacy` text must keep up. Superadmin dashboard: `apps/auth`'s `/admin/analytics`. Guide: `docs/guides/analytics.md`. Full reference: [docs/architecture/analytics.md](docs/architecture/analytics.md).

**Content.** `apps/blog`, `apps/docs`, `apps/help` and `apps/jobs` are MDX compiled at build time with fumadocs-mdx over the pure-TypeScript `@repo/content`, with no runtime call to `apps/api` beyond telemetry/analytics (plus help's and jobs's forms). `source.config.ts` imports schemas by relative path, never `@repo/content/schema`. The build gate reports every problem at once in one `ContentError`: frontmatter, broken links, missing images, body `# h1`. Drafts and future-dated posts preview only under `next dev`. `@repo/ui` blocks take plain props and never import fumadocs. Guide: `docs/guides/content.md`. Full reference: [docs/architecture/content.md](docs/architecture/content.md).

**Support.** `apps/help`'s `/contact` posts to `support.create`, keeping the `anon:<ip hash>` client id while linking a signed-in account. Limits are per client, per typed address and api-wide. The acknowledgement mail carries only the reference, never the message, since the address is whatever was typed. Superadmins work requests on `apps/auth`'s `/admin/support`. Full reference: [docs/architecture/support.md](docs/architecture/support.md).

**Booking.** The coaching site's calendar. The catalog is `OFFERINGS` in `@repo/api-contract/booking-limits` (Zod-free): `instant` kinds pick slots, `group` takes seats at a scheduled event, `request` kinds propose dates and wait for a confirmation. Availability is weekly rules plus blocked days in `Europe/Stockholm`; the engine (`apps/api/src/booking/availability.ts`) is pure and `booking.book` re-derives every slot under the calendar lock (`booking_rules.lock`), so a slot a visitor sends is never trusted. Writes are anonymous behind three limiters, address-keyed like applications, and commit with both mails. A 256-bit manage token (hash stored) is the customer's only handle; confirming a request rotates it. `admin.bookings.*` is superadmin-only and audited; the pages are `apps/auth`'s `/admin/bookings`, the public flow `apps/www`'s `/book`. Full reference: [docs/architecture/booking.md](docs/architecture/booking.md).

**Leads.** `apps/www`'s `/kontakt` posts a three-step qualifying form to `leads.create`: anonymous, behind support's three limiters, address-keyed like applications, never linked to an account. The row, `leadNew` (to `BOOKING_EMAIL`, every answer) and `leadReceived` (to the sender: the reference and the next step only, never their text) commit together. `leadNextStep` in `@repo/api-contract/leads` (Zod-free) is the one rule the done page and the mail share. Consent to be contacted is required; newsletter consent is a separate box, stored only (nothing sends one). `leads.prune` deletes leads after 12 months. `admin.leads.*` is superadmin-only and audited without the notes' text; the page is `apps/auth`'s `/admin/leads`. Full reference: [docs/architecture/leads.md](docs/architecture/leads.md).

**Hiring.** `apps/jobs` postings are MDX; the apply form posts to `jobs.apply` and always shows English. Slugs and titles come from the build, never the form. A CV is a real PDF up to 5 MB, under `applications/<random>.pdf`, served only by `admin.applications.cv`, never `files.get`. Applications are address-keyed, outlive accounts and are deleted after 6 months by `applications.prune`. Superadmins review them on `apps/auth`'s `/admin/applications`. Full reference: [docs/architecture/hiring.md](docs/architecture/hiring.md).

**Operations.** Log through `@repo/log`: JSON in production, with secrets redacted by key and `email` masked. A request id follows a request from the proxy through the api to the jobs it enqueues; a caller's id is honoured only after the service-bearer guard. `route` labels are bounded, never a raw URL. `/ready` races `READY_TIMEOUT_MS`. `REQUEST_TIMEOUT_MS` answers `503`, but the handler keeps running, so a mutation may still commit. `/metrics` needs `METRICS_TOKEN` (`404` unset). Backups are off by default and exclude the uploads bucket. Guide: `docs/guides/operations.md`. Full reference: [docs/architecture/operations.md](docs/architecture/operations.md).

**Load.** `apps/load` runs Bun-native scenarios (`api-core`, `realtime`, `jobs-burst`) and failure drills on demand, against a stack it starts itself; a 20 s `api-core` smoke runs in the `e2e` job. Non-loopback targets need `LOAD_ALLOW_REMOTE=1`. Results and tuning: `docs/guides/capacity.md`. Full reference: [docs/architecture/load.md](docs/architecture/load.md).

**Performance.** `perf/budgets.json` commits four budgets: first-load JS per route, Lighthouse, Web Vitals and api p95. A route over budget, or with none, fails the build. Budgets change only through a reviewed diff (`bun run perf:measure`, then `bun run perf:update`); nothing in CI writes the file. Guide: `docs/guides/performance.md`. Full reference: [docs/architecture/performance.md](docs/architecture/performance.md).

**i18n.** English and Swedish. `@repo/i18n` holds `LOCALES`, ICU catalogs under `packages/i18n/messages/<locale>/` and `translatorFor`. Locale resolves as saved preference, `locale` cookie, `Accept-Language`, then `en`. `auth`, `app` and `account` are fully translated with `next-intl` without routing; `/admin/**`, `docs`, `help` and `jobs` stay English; `blog` is bilingual by URL, and static: Swedish at `/`, English under `/en`, one root layout per language (route groups `(sv)`, `(en)`) for `<html lang>`, its own words in `apps/blog/src/content/ui.ts` plus the `ui` catalog for the shared chrome, no `next-intl`; its header's language link (`LanguageLink`, a client component) opens the page's translation and writes the shared `locale` cookie so www follows; `www` is bilingual without `next-intl`: Swedish by default, English only when the `locale` cookie is `en` (`getLocale()` in `src/lib/locale.ts`, `Accept-Language` ignored), so its pages render per request; each content file exports both languages in one shape, the chrome reads that locale's `ui` catalog, the server actions send it as `x-locale` so the api's mails follow, and its switcher (`StaticLocaleSwitcher` with `reloadOnChange`) writes the cookie and reloads. In handlers use `apiMessage(context, key, values?)`, never a literal; `@repo/ui` takes labels as props, defaulting to English, and has no `next-intl`. Map Zod issues by `code`, never their English text. Each translated app runs `src/i18n-guard.test.ts`. Guide: `docs/guides/i18n.md`. Full reference: [docs/architecture/i18n.md](docs/architecture/i18n.md).

## Troubleshooting

### Build Failures
1. Check TypeScript errors: `bun run typecheck`
2. Check lint errors: `bun run lint`
3. Clear caches: `bun run clean && bun install`

### Module Resolution Issues
1. Ensure `@repo/ui` exports the component (check `packages/ui/package.json` `exports`)
2. Restart dev server after package changes

### Stacked pull requests

When a PR is based on another unmerged branch rather than `main`, merging the parent first strands
the child: its merge lands in a branch nobody will merge again, and the work never reaches `main`.
Both PRs still report `MERGED`.

Either merge child-first, or retarget the child to `main` as soon as the parent lands.

### Quality gates

`bunx biome ci .` and `bun run --filter @repo/ui typecheck` both pass and gate CI. The Biome gate
now covers formatting and import organisation as well as lint — strictly wider than the
`bun run lint` it replaced, which saw only lint rules. Both gates cover first-party code only, and
the Biome gate is **error-only**, so warnings and infos do not fail it. There are currently none:
keep it that way, since a warning nobody fixes is noise the next one hides in. An intentional
exception gets a `biome-ignore` with its reason, and Biome flags a suppression that stops
matching anything. Biome 2.6 added Markdown and YAML formatters, on by default; `biome.json` turns
both off (`markdown.formatter`, `yaml.formatter`), so docs, specs and the Compose/workflow files keep
their hand-written layout and Biome stays on the code it already gated. `.agents/skills` is excluded — those skills are installed from upstream and
pinned by hash in `skills-lock.json`, so local edits would be overwritten.

`bun run ci` runs the workflow's seven checks in full: the planner tests (`bun test scripts`), `biome ci`, the typecheck (app, www, blog, docs, help, jobs, api,
api-contract, public-api-contract, ai, ai-contract, service-kit, sites, content, email, session, telemetry, i18n, i18n-guard, log, auth, account, e2e, load, story), the `@repo/ui` typecheck, the scripts/perf typecheck
(`bun run typecheck:scripts`, i.e. `tsc --noEmit -p tsconfig.scripts.json` — a root `tsconfig.scripts.json` extending `packages/typescript-config/bun.json` over `scripts/**/*.ts` and `perf/**/*.ts`, with `types: ["bun"]` so `Bun.*` globals resolve; an editor that falls back to the root `tsconfig.json` for one of those files — nothing points it at `tsconfig.scripts.json` — typechecks it under `NodeNext` instead and can show phantom errors such as TS1470 that `bun run typecheck:scripts` does not reproduce; trust the command, not the editor's squiggles, for files under `scripts/` and `perf/`), the service tests (`bun run test:services`:
apps/api, apps/ai, packages/service-kit, packages/ui, packages/api-contract, packages/public-api-contract, packages/sites, packages/content, packages/email, packages/session, packages/telemetry, packages/i18n, packages/i18n-guard, packages/log, apps/auth and apps/account's action cores, apps/app's route and helper tests, apps/www's contact and booking action cores, content, view and sitemap tests, apps/blog's content pipeline, feed and sitemap tests, apps/docs's content checks, navigation, search-result, OG, sitemap and view tests, apps/help's content checks, navigation, search, related-article, sitemap, OG, view and contact tests, apps/jobs's content checks, OG, sitemap, view and apply-action tests, and apps/load's own unit tests (histogram, pacing, thresholds, target guard)), and the build. CI runs only the part a change can affect. Its first job,
`changes`, runs `scripts/ci-plan.ts` (tested by `bun test scripts`). That maps the changed files to
workspaces and adds everything that depends on them through `workspace:*`. It narrows the root
`typecheck` / `test:services` filter lists to that set, so those scripts stay the single definition,
and builds the affected workspaces plus the ones they build on. Biome always runs. A docs-only change
(`.md` outside any `src/`; `apps/ai` imports `src/prompts/system.md`) skips every job except
`security`, which always runs. Root files
(lockfile, configs, the workflow itself) run everything, and so does every push to `main` that isn't
docs-only — the safety net for a dependency the graph doesn't declare, such as Tailwind's `@source`
scanning every app. Storybook tests (the slowest check: ~15 WebGL stories render in software on
GPU-less runners) run in parallel with `verify`, sharded four ways. The docker job (one row per
image the plan keeps, each scanned with Trivy) and the `security` job (dependency audit and secrets
scan; see **Security scanning**) run in parallel with `verify` too. `security` carries no `if:` of
its own, so it always runs and is always required, unlike every other job here, which the plan can
skip. Require
the final `ci` job in branch protection, not the individual jobs: skipped matrix jobs never report
under their row names. That job decides through `scripts/ci-gate.ts` (tested in `bun test scripts`,
and `scripts/github.test.ts` keeps the workflow wired to it): every job the `changes` plan required
must have succeeded, and a job the plan left out may only be skipped. A required job that never ran
(no runner assigned, as when the month's Actions minutes run out) fails the gate instead of passing
it. The earlier inline step `if:` passed silently on a failed dependency: under `if: always()` a
step condition without a status function gets `success()` prepended. The workflow's `GITHUB_TOKEN` is read-only (`permissions: contents: read`) and every job has a
`timeout-minutes` of about 2-3x its usual run, so a hung step cannot burn the month's minutes.
`scripts/github.test.ts` fails when CODEOWNERS or the bug / feature templates' area lists miss a
workspace. CI runs all three typechecks (the workspaces', `@repo/ui`'s and scripts/perf's) before Biome so a failure keeps its existing step
name, while the script runs Biome first to fail fastest on the cheapest check.

A further job, `e2e`, runs on `needs.changes.outputs.e2e` — true when the affected set (after the
same `workspace:*` closure) includes `@repo/api`, `@repo/ai`, `@repo/www`, `@repo/app`, `@repo/auth`,
`@repo/account`, `@repo/blog`, `@repo/docs`, `@repo/help`, `@repo/jobs`, `@repo/e2e` or `@repo/load`
itself, same root-files-and-non-docs-push fallback as every plan-gated job (`security` alone
always runs); not part of `bun run ci` or
`bun run validate`, which stay local-only.
It resolves `*.brand.localhost` to loopback (RFC 6761 leaves `.localhost` resolution up to the
resolver, so it varies: pinning the ten hosts to `127.0.0.1` in `/etc/hosts` keeps `--hostname`
binding and the e2e probes deterministic regardless of what CI's runner would otherwise resolve),
installs Chromium, builds `www`, `app`, `auth`, `account`, `blog`, `docs`, `help` and `jobs` (with
`COOKIE_DOMAIN=.brand.localhost`: `next build` runs in production mode, where the static apps'
consent and locale cookies would otherwise be host-only, and `i18n.spec.ts` needs www's locale
choice to reach `auth`), builds the bundle budgets for all eight (`bun scripts/bundle-budget.ts
--write-results …`, writing its measurement to `perf/.results` too), then runs the 422
Playwright tests in `apps/e2e/tests/` (41 spec files — including `perf-lighthouse.spec.ts` and
`perf-vitals.spec.ts`, each writing its own measurements to `perf/.results` with
`PERF_WRITE_RESULTS=1`; see **Performance**) against those production builds plus
`apps/api` and `apps/ai` on
`bun src/index.ts`, Chromium only, serial
(`workers: 1`, one shared database and in-memory rate limiters), one retry (CI only — a test that
passes on retry shows as flaky in the uploaded report). Right after the journeys, with `apps/api`
and `apps/ai` already up, it runs the load smoke (`bun --filter @repo/load smoke`: `api-core` at
10 VUs for 20 s, thresholds zero 5xx plus each core label's own p95 budget — see **Load**), itself
writing to `perf/.results` too; the whole directory is then uploaded inside the `playwright-report`
artifact (`include-hidden-files: true`, since `perf/.results` and `apps/load/.results`/`.tmp` are
dot-directories) alongside the Playwright report, so a gross regression fails the PR without a
nightly job (the Actions budget has run out before) and every measurement the runner took is
recoverable for `bun run perf:update` without re-running anything. The final `ci` job requires `e2e`
to have succeeded whenever the plan asked for it, like every other job. See `apps/e2e/README.md`,
`apps/load/README.md` and `docs/guides/performance.md`.

`bun run validate` runs the same seven checks
for local use; it differs from `ci` only in reporter (`biome check` instead of `biome ci`, for
readable local output instead of CI annotations) and is non-writing, same as `ci`. Both currently
pass. The `NODE_OPTIONS=--max-old-space-size=8192` memory ceiling the build needs (`@repo/story`'s
325-story bundle can exceed Node's default ~4GB and die with exit 134) now lives in the `build` script
itself, so `bun run ci`, `bun run validate`, and CI all apply it alike. `files.includes` is now the
single ignore list Biome consults — `formatter.includes` and
`linter.includes` no longer carry their own copies — so a future exclusion belongs in exactly one
place.

**Security scanning.** Phase 9 E: three small Bun scripts in `scripts/security/`, each wrapping
one pinned scanner and sharing a pure allowlist engine (`allowlist.ts`/`report.ts`) — `audit.ts`
(`bun audit --json`, reads only `bun.lock`, no install needed), `image.ts` (Trivy
`ghcr.io/aquasecurity/trivy:0.76.0` against a built Docker image, `--ignore-unfixed --severity
HIGH,CRITICAL`, per-image scan caches in memory) and `secrets.ts` (Gitleaks
`ghcr.io/gitleaks/gitleaks:v8.30.1`; by default the working tree — only what `git ls-files
--cached --others --exclude-standard` lists, copied into a temp dir, so a git-ignored `.env` is
never read — or a commit range or full history with `--range`/`--history`; a path whose parent
directory, at any depth, is a symlink is skipped with a `console.warn` rather than copied or
failing the run, the same "skip this one path, keep going" treatment a `missing` or `other`-kind
path already gets — `hasSymlinkParent` in `secrets.ts`). A repo-specific rule in `.gitleaks.toml`,
`bb-live-api-key` (keyword `bb_live_`), flags a leaked workspace API key — see **API keys and
/v1.**; `scripts/security/gitleaks-rules.test.ts` parses the rule's own regex with `Bun.TOML` and
runs it over a fixture of fake, `gitleaks:allow`-marked keys before `bun install`, so it needs no
Docker. `security/allowlist.json` is one
reviewed, expiring exception per accepted risk — `scanner`, `id`, `package`/`image` or `file`
(+`line`), a `reason` of 20+ characters and an `expires` no more than 180 days out (the repo's own
first-triage entries used 90, all expiring 2027-01-15); an expired entry fails every scanner's run
until renewed, and an entry whose own scanner (and, for `image`, image) ran but matched nothing
fails as stale — except that a `--range` secrets run (CI's) never judges staleness, since a range
sees only its own commits; working-tree and `--history` runs do. A high,
critical or secret finding fails unless an unexpired entry matches it exactly; anything lower is
reported, never gating. A permanent false positive (a test fixture, a public dev key, a documented
example) gets an inline `// gitleaks:allow` (`<!-- gitleaks:allow -->` in Markdown) on the flagged
line instead of an allowlist entry — that marker is for fakes that can never become real, never for
something merely low-risk. Exit codes: 0 clean, 1 a finding/expiry/staleness/invalid entry, 2 the
tool itself failed to run. CI: the `security` job in `ci.yml` runs unconditionally on every PR and
push to `main`, docs-only included (a secret can land in a "docs" commit) — the secrets scan always
runs over the push/PR range, the dependency audit only when `scripts/ci-plan.ts`'s new `audit`
output is true (a lockfile, `package.json` or root-file change, or any non-docs push to `main`),
even after a failed secrets scan (`!cancelled()`); the `docker` job additionally scans each image
it builds with Trivy, restoring Trivy's DB cache by UTC date and saving it (after a `chown`, Trivy
writes as root) — but only when the scan step itself actually ran (`steps.scan.outcome` is
`success` or `failure`, never `skipped`, as it is when an earlier step such as the build failed)
and a "Check Trivy's vulnerability database was refreshed" step finds `db/metadata.json`'s mtime
within the last 24h. The scan-outcome condition is what keeps a build failure that skips the scan
from saving that run's merely-restored DB under the day's exact cache key; the mtime check only
refuses a DB downloaded more than a day ago (`actions/cache/restore` keeps the files' original
mtimes, so a DB an earlier run downloaded within the day, and Trivy still considers current,
passes it too). The build → restore-cache → scan → chown →
freshness-check → save-cache → upload-artifact steps live once, in the reusable
`.github/workflows/image-scan.yml` (`on: workflow_call`, inputs `dockerfile`/`app`/`port`, its own
job-level `permissions: contents: read`); `ci.yml`'s `docker` job and `security.yml`'s `image` job
each keep their own `strategy.matrix` and call it with `uses:`, so a fix to one copy can never miss
the other. The job id in `needs:` / branch protection is still `docker` (a called workflow's job
keeps the *calling* job's id; only the check-run label changes, to
`docker (<dockerfile>, <app>, <port>) / image-scan`). `.github/workflows/security.yml` reruns the audit and all three image scans every Monday
06:00 UTC plus `workflow_dispatch`, queuing behind an in-progress run rather than cancelling it; a
red run shows in Actions and emails the workflow's owner, no issue filed. Locally: `bun run
security` (audit + secrets, exit = the worse of the two) and `bun run security:image <app>`
(builds that app's image as CI does, then scans it) — both need Docker for the secrets/image half,
neither is part of `bun run ci` or `bun run validate`. See `docs/guides/security-scanning.md`.

`packages/ui` holds 209 top-level components plus the `animate-ui/` (150 files), `magicui/` (15), and
`charts/` (bklit, ~180 files) subdirectories, nearly all vendored from third-party registries via
`shadcn add`. (`layout/`, `customized/` and `animated-ui/` hold another 8 first-party files and sit
inside both gates.) The applications import 37 `@repo/ui/components/*` specifiers, 20 blocks, `lib/utils`, `lib/fonts`, `lib/initials`, `lib/security-proxy`, `lib/oauth-errors`, `lib/consent`, `lib/og`, `lib/post-date` and `lib/service-worker` (which brings `lib/service-worker-rules` with it; no app imports that one directly).

**The boundary is narrower than "everything unimported."** It covers files matching `^[A-Z].*\.tsx$`
directly under `packages/ui/src/components/` (104 files) plus those three subdirectories,
excluded from both gates (except the Base UI animate-ui files, back inside the type gate — see
below). The vendored files are still *formatted* with Biome (`biome check --write`)
because the override relaxes lint rules only; the format and import-organisation checks apply to them. The 84 remaining kebab-case top-level components the apps do not import are
kebab-case, fall outside the pattern, and are therefore held to both gates in full. Being unimported
does not exempt a file; matching the pattern does.

Neutralising the override and re-linting `packages/ui/src/components` reports **62 errors**, all
of them `a11y`, plus 390 warnings — the debt the boundary is hiding. On the type side, the scoped
gate is clean and vendored internals stay unchecked; see the `@repo/story` note below.

**The bug-class part is fixed, and its rules are on for vendored files too.** The override used to
disable 14 rules. Five of them hid 22 bug-class errors — 16
`useIterableCallbackReturn`, 3 `noAssignInExpressions`, 2 `noUnsafeOptionalChaining`, 1
`noImplicitAnyLet` — plus 2 unused-binding warnings (`noUnusedVariables`); all 24 were fixed in
place, and those five rules now apply to vendored code exactly as to first-party code. A sixth,
`useTemplate`, had no vendored findings and was dropped too: no rule is exempted without one. The
override now disables 8 rules: 1 `correctness`, 2 `suspicious`, 1 `style` and 4 `a11y`. The four
non-a11y ones are style or noise in third-party code, and every hidden finding they cover is a
warning, not an error:
`noExplicitAny` (189: upstream's own loose typing of three.js/ogl/gsap objects, which re-typing
would turn into a fork), `noNonNullAssertion` (77: mostly refs and DOM lookups the component expects to
be set by then), `noArrayIndexKey` (67: mostly fixed, never-reordered lists, where an index key is harmless)
and `useExhaustiveDependencies` (57: effects written to run once or on chosen props — the suggested
fix would change when animations restart) — the 390 warnings above. The four `a11y` ones are
the 62 errors, explained below.

**Accessibility: no a11y rule is off repo-wide.** There used to be a top-level
`linter.rules.a11y` block turning four rules off everywhere and downgrading `useValidAnchor` to
`warn`; it is gone, so `useValidAnchor` now defaults to `error` like every other a11y rule, and
Biome's full a11y rule set runs over first-party and vendored code alike.

**The vendored override exempts exactly four a11y rules**, listed in `biome.json`'s vendored
override (Biome rejects `//` comments there, so the reasons live here instead):
`noSvgWithoutTitle` (decorative-SVG naming is not enforced there), `noStaticElementInteractions` and
`useKeyWithClickEvents` (most of what these two catch is a decorative pointer effect — cursor
trails, hover tilts, magnetic/particle effects — with no keyboard equivalent intended, but not all
of it: a few remaining findings are real actions with no keyboard path at all today, including
`ChromaGrid`'s `<article onClick>` and `Masonry`'s tiles opening a URL, `Folder` opening on click,
`InfiniteMenu`'s item action button and `animate-ui`'s `flip-card` flipping on click — so a
`<div onClick>` keyboard trap in vendored code still passes CI green under this exemption, exactly
as it would have under the old repo-wide block), and `useSemanticElements` (a different reason: its
two remaining sites, CardNav's hamburger toggle and DomeGallery's image tile, are structural
wrappers already carrying `role="button"` — Biome's suggested fix, swapping the `<div>` for a native
`<button>`, would change their layout semantics, and restructuring a vendored component is what this
boundary forbids; a third site, `LogoLoop`'s `role="region"` wrapper, needed no exemption at all and was swapped
for a plain `<section>`, as `lens` and `mdx/schema-table` were).
`useAriaPropsSupportedByRole` has no vendored findings left — of its five original
sites, one keeps its `aria-label` paired with `role="img"` (`StaggeredMenu`'s logo wrapper, a single
`<img>` child), one keeps its `aria-label` behind a reasoned per-line `biome-ignore` (`StaggeredMenu`'s
`<header>`, which sits outside article/aside/main/nav/section and so really is the banner landmark —
Biome's static model just doesn't see that), one had its label swapped for `aria-hidden`
(`PixelBlast`'s decorative canvas container), and two had an already-inert label removed outright
(`BubbleMenu`'s logo wrapper — whose child can be an arbitrary `ReactNode`, so `role="img"` would risk
flattening a consumer's own interactive content — and `StaggeredMenu`'s "Social links" div, a plain
`<div>` whose implicit role never supported naming in the first place). So the rule is not in the
exemption and applies to vendored code same as anywhere else. Every other a11y rule, including every
rule not named above, applies to vendored code exactly as it does everywhere else: a vendored
component that fails `useAltText` or `useButtonType` fails the gate like any other code. First-party
code — every kebab-case `packages/ui` component and every app — is held to every a11y rule without
exception, with a handful of reasoned per-line `biome-ignore`s (role=group or role=list on a layout
`<div>` where `<fieldset>`/`<ul>`/`<ol>` would add unwanted native semantics, a drag-handle control
that must stay a `<div>` because HTML forbids nesting a `<button>` inside another `<button>`, and the
like) rather than a blanket exemption.

The boundary is written as an explicit list in two places — `packages/ui/tsconfig.typecheck.json` and
the `overrides` block in `biome.json` — because neither TypeScript nor Biome supports character-class
globs. TypeScript silently matches nothing; Biome errors outright.

The list is intentionally not auto-generated. A newly added vendored component will fail the gates
until someone adds it, which forces a conscious decision.

One carve-out back in: the Base UI animate-ui files (`animate-ui/primitives/base/**`,
`animate-ui/components/base/**` and `animate-ui/components/community/radial-menu.tsx`) are ported
to `@base-ui/react` 1.x — the only Base UI package — and typechecked by
`packages/ui/tsconfig.base-ui.json`, which `@repo/ui`'s `typecheck` script runs after the main one,
so they sit inside the type gate (still outside the Biome lint rules). TypeScript follows their
imports, so the gate also covers what they pull in: `animate-ui/primitives/effects/highlight`,
`effects/auto-height`, `texts/counting-number`, `animate/slot`, both `buttons/button.tsx` files and the
hooks — an edit there can fail `@repo/ui typecheck` too. Upstream animate-ui still
ships them on `@base-ui-components/react` rc.0, so never re-add them with
`shadcn add @animate-ui/primitives-base-*` / `components-base-*`: that would bring rc.0 back. Port
an update by hand and let `tsconfig.base-ui.json` and the Base stories' tests check it.

`bun run --filter @repo/story typecheck` is a gate too: it is in the root `typecheck` list, so CI
runs it whenever the plan affects `@repo/story`. Stories' vendored imports typecheck against
declarations generated into `apps/story/types/vendored/` (`apps/story/tsconfig.json` `paths` point
each vendored specifier there), regenerated with `bun run --filter @repo/story
generate:vendored-types` and committed. `typecheck` runs the generator's `--check` first, which
fails on drift or on a package it cannot resolve, and prints the declarations whose exported types
contain `any` (a warning, not a failure). So every story is checked against each vendored
component's exported props, while the vendored internals stay unchecked, as under `@repo/ui`'s
gate. `apps/story` emits no declarations, so its tsconfig turns `declaration` off.

## Slash Commands

Project commands live in `.claude/commands/`:

| Command | What it does |
|---|---|
| `/dev [app]` | Start one app's dev server, or all of them |
| `/build [app]` | Production build for one app or all |
| `/lint` | Biome lint + format with auto-fix |
| `/typecheck` | The gated typechecks (see Quality gates) |
| `/test [unit\|story]` | Service tests (`bun test`) or Storybook tests |
| `/validate` | The full local gate (`bun run validate`) |
| `/story [dev\|build\|test]` | Storybook |
| `/new-page <app> <route>` | A page plus its view in one of the Next apps |
| `/new-story <component>` | A Storybook story for a component |
| `/add-component <name>` | A shadcn component, always into `packages/ui` |
| `/docker [build\|up\|down\|dev] [app]` | The Compose stacks |
| `/changeset [add\|version\|status]` | Changesets |
| `/commit` | A Conventional Commit |
| `/clean` | Remove build artifacts and caches |
| `/doctor` | Check the development environment |
