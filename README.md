# boilerplate-bun

A Bun-workspaces monorepo boilerplate: eight Next.js apps, each on its own subdomain, a shared UI
package with Storybook, and two Bun services — a typed API and an AI service. Clone it, delete
what you don't need, and build your product on top.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Bun](https://img.shields.io/badge/Bun-1.4.2+-f9f1e1?logo=bun)](https://bun.sh/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06b6d4?logo=tailwindcss)](https://tailwindcss.com/)
[![Biome](https://img.shields.io/badge/Biome-2.3-60a5fa?logo=biome)](https://biomejs.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-new--york-000000?logo=shadcnui)](https://ui.shadcn.com/)
[![Motion](https://img.shields.io/badge/Motion-12-fff312)](https://motion.dev/)
[![Iconify](https://img.shields.io/badge/Iconify-6-1769aa?logo=iconify)](https://iconify.design/)
[![Storybook](https://img.shields.io/badge/Storybook-10-ff4785?logo=storybook)](https://storybook.js.org/)
[![Zod](https://img.shields.io/badge/Zod-4-3e67b1?logo=zod)](https://zod.dev/)
[![oRPC](https://img.shields.io/badge/oRPC-1.15-2563eb)](https://orpc.dev/)
[![AI SDK](https://img.shields.io/badge/AI%20SDK-7-000000?logo=vercel)](https://ai-sdk.dev/)
[![Docker](https://img.shields.io/badge/Docker-compose-2496ed?logo=docker)](https://www.docker.com/)

## Quick start

```bash
git clone https://github.com/bromso/boilerplate-bun.git
cd boilerplate-bun
bun install
bun dev            # every app below, in parallel
```

Modern browsers resolve `*.localhost` on their own — no `/etc/hosts` edits. Every app sits under
`brand.localhost` so the apps can share one sign-in cookie, as they do under `brand.com` in production. The AI service runs
without an API key in development (it answers with a keyless `mock:echo` model); add
`ANTHROPIC_API_KEY` to `apps/ai/.env` to use Claude.

| App | Dev URL | What it is |
|---|---|---|
| `apps/www` | http://www.brand.localhost:3000 | Marketing site |
| `apps/app` | http://app.brand.localhost:3001 | Application shell |
| `apps/auth` | http://auth.brand.localhost:3002 | Sign-in, sign-up, password reset, social sign-in (Google, GitHub, Apple) and magic link |
| `apps/account` | http://account.brand.localhost:3003 | Account settings hub (personal info, security, payments, …) |
| `apps/docs` | http://docs.brand.localhost:3004 | Docs shell |
| `apps/help` | http://help.brand.localhost:3005 | Help / support shell |
| `apps/jobs` | http://jobs.brand.localhost:3006 | Jobs shell |
| `apps/blog` | http://blog.brand.localhost:3009 | Blog — MDX posts (fumadocs-mdx), RSS/Atom/JSON feeds |
| `apps/api` | http://api.brand.localhost:3007 | API on `Bun.serve` + oRPC — typed RPC, REST, OpenAPI docs at `/openapi` |
| `apps/ai` | http://ai.brand.localhost:3008 | AI service — streaming chat, tools, structured output (AI SDK) |
| `apps/story` | http://localhost:6006 | Storybook for `packages/ui` |

In production each app deploys to its own subdomain (`app.brand.com`, `api.brand.com`, …) and each
Next app is independently installable as a PWA.

## What's inside

| Area | Choice |
|---|---|
| Monorepo | Bun workspaces; shared versions in the root `catalog` |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| UI | `packages/ui` — shadcn/ui on Radix and Base UI, reusable blocks, bklit charts |
| Icons & motion | Iconify (`@iconify/react`), Motion (`motion/react`) |
| API | `apps/api` — `Bun.serve` routes, oRPC contract in `packages/api-contract`, `Bun.sql` (SQLite by default, Postgres by URL) |
| AI | `apps/ai` — Vercel AI SDK with Anthropic (default `claude-opus-5`), guarded and rate-limited, contract in `packages/ai-contract` |
| Quality | Biome (lint + format), TypeScript, `bun test`, Storybook + Vitest |
| Workflow | Husky + lint-staged, Conventional Commits (commitlint), Changesets |
| Containers | Dockerfiles for every app, `docker compose`, a VS Code devcontainer |

Authentication is built in: `apps/api` owns users, sessions and password resets, and
`packages/session` is how the Next apps read the shared `session` cookie. `apps/auth` signs users
in, `apps/app` requires a session for its signed-in pages, and `apps/account` lets the user change
their name and password and sign out other devices (see `docs/ROADMAP.md`, Phase 4).

## Project structure

```
apps/
├── www · app · auth · account · docs · help · jobs · blog   # Next.js apps (one subdomain each)
├── api                 # Bun service: oRPC + Bun.sql
├── ai                  # Bun service: AI SDK chat + structured output
└── story               # Storybook for packages/ui
packages/
├── ui                  # Shared components, blocks, charts, fonts, theme, global CSS
├── tokens              # Design tokens (Style Dictionary)
├── api-contract        # Typed contract for apps/api
├── ai-contract         # Typed contract + chat types for apps/ai
├── session             # Server-only sign-in helpers for the Next apps (cookie, requireUser)
├── sites               # Registry of the apps and their URLs from SITE_DOMAIN (nav, footer)
├── content             # MDX frontmatter schema, feeds and link checking for apps/blog
└── typescript-config   # Shared tsconfig presets
docker/                 # next.Dockerfile, bun-service.Dockerfile, dev.Dockerfile
```

Frontend code flows one way: `tokens → components → blocks → views → pages`. Views are app-specific
compositions in `apps/<app>/src/views/`; pages under `src/app/` are thin wrappers that render a
view. Frontends talk to the services only through `@repo/api-contract` and `@repo/ai-contract` —
never by importing another app.

## Common commands

```bash
bun dev                          # all apps
bun --filter @repo/app dev       # one app (any name from the table)
bun run story                    # Storybook only

bun run build                    # build everything
bun run lint                     # Biome lint (bun run lint:fix to fix)
bun run format                   # Biome format check (bun run format:fix to fix)
bun run typecheck                # TypeScript: app, www, api, api-contract, ai, ai-contract
bun run test:services            # bun test for apps/api and apps/ai
bun run ci                       # the full CI gate locally (Biome, typechecks, tests, build)

bunx shadcn@latest add <component> -c packages/ui   # add a shared component
bun run doctor                   # check your local environment
```

## Docker

```bash
docker compose up -d --build                     # production-like stack, all 10 apps on the ports above
docker compose -f docker-compose.dev.yml up      # dev container: `bun dev` with the repo bind-mounted
```

The `api` and `ai` containers need `API_SERVICE_TOKEN` and `AI_SERVICE_TOKEN` — each at least 32
characters (`openssl rand -hex 32`) — (and `ANTHROPIC_API_KEY`, unless `AI_MODEL=mock:echo`) in a
root `.env` — copy `.env.example`. The repo also ships a VS Code devcontainer
(`.devcontainer/`) built on the same dev image.

## Environment

Each Bun service documents its variables in `apps/<service>/.env.example`, and `apps/app` lists the
service URLs it calls in its own; Bun and Next load `.env` files automatically. The root
`.env.example` lists what `docker compose` reads.

The Motion MCP server (`.mcp.json`) reads its token from `MOTION_TOKEN` — get one at
[motion.dev/docs/ai-kit](https://motion.dev/docs/ai-kit) and export it in your shell.

## Documentation

- [CLAUDE.md](./CLAUDE.md) — architecture, conventions, dependency rules and quality gates
  (written for Claude Code), with a summary of each domain
- [docs/architecture](./docs/architecture) — the full behaviour of each domain, linked from those
  summaries
- [apps/api/README.md](./apps/api/README.md) and [apps/ai/README.md](./apps/ai/README.md) — the
  services, their routes and how to call them from a Next app
- [CONTRIBUTING.md](./CONTRIBUTING.md) — branches, commits, Git hooks and pull requests
- [SECURITY.md](./SECURITY.md) — reporting vulnerabilities
- [docs/ROADMAP.md](./docs/ROADMAP.md) — what's planned next, in phases; finished design docs are
  in [docs/archive](./docs/archive)

## Guides

- [docs/guides/renaming-the-brand.md](./docs/guides/renaming-the-brand.md) — swap `BRAND_NAME` and
  `SITE_DOMAIN` for your own
- [docs/guides/deploying.md](./docs/guides/deploying.md) — build, publish and run the ten
  containers in production
- [docs/guides/removing-apps.md](./docs/guides/removing-apps.md) — delete an app you don't need,
  and every reference to it
- [docs/guides/oauth-providers.md](./docs/guides/oauth-providers.md) — set up Google, GitHub and
  Apple sign-in
- [docs/guides/passkeys.md](./docs/guides/passkeys.md) — the relying party, subdomains, local dev
  and recovery paths for passkey sign-in
- [docs/guides/email-change.md](./docs/guides/email-change.md) — why there's no confirmation from
  the old mailbox, the taken-address ruling, and the undo link's rollback window
- [docs/guides/stripe.md](./docs/guides/stripe.md) — set up Stripe billing
- [docs/guides/sentry.md](./docs/guides/sentry.md) — forward errors to Sentry
- [docs/guides/security-scanning.md](./docs/guides/security-scanning.md) — the dependency, image
  and secrets scans, reading a failure, and writing an allowlist entry

## License

Proprietary — all rights reserved.

---

Built by [Jonas Bröms](https://github.com/bromso)
