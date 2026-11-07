# Microfrontends + PWA Restructure — Design

**Date:** 2026-05-06
**Status:** Design approved, ready for implementation plan

## Goal

Restructure this Symbiora monorepo so each production app deploys as its own subdomain (microfrontend), each is independently installable as a PWA, and shared dependencies live in a Bun workspace catalog (one source of truth for versions).

## Goals (all four selected by user)

1. **Independent deploys / team autonomy** — each subdomain ships on its own cadence
2. **Smaller bundles per app** — visitors of www don't download dashboard JS
3. **Security isolation for auth** — auth state lives on its own origin (forward-looking)
4. **Better dependency management** — one place to bump Next.js, motion, iconify, etc.

## Browser Constraints (load-bearing)

ServiceWorker and SharedWorker are scoped per-origin. `auth.brand.com` and `app.brand.com` are separate origins, so they cannot share a literal SharedWorker. Decision: accept per-origin workers. "Shared" means same code shipped to each app, not a literal cross-origin worker. Cross-app state lives in cookies on the `.brand.com` parent domain (eTLD+1).

## Architecture

```
brand.com infrastructure:
├── auth.brand.com   ← apps/auth   (deferred — not in this work)
├── www.brand.com    ← apps/www    (exists; this work makes it MFE-ready)
├── app.brand.com    ← apps/app    (exists; this work makes it MFE-ready)
├── docs.brand.com   ← apps/docs   (deferred)
└── help.brand.com   ← apps/help   (deferred)

Tools (not a production subdomain):
└── apps/story       ← Storybook for packages/ui
```

Each production app:

- Owns its own ServiceWorker (PWA install scope, offline cache) via `@serwist/next`
- Owns its own manifest, install prompt, runtime cache rules
- Pulls shared deps via Bun workspace `catalog:` protocol
- Uses workspace packages (`@repo/ui`, `@repo/tokens`, `@repo/typescript-config`)
- Can spin up DedicatedWorker / SharedWorker within its own origin (deferred — not pre-built)

Cross-app state: cookies on `.brand.com` parent domain. Better Auth's session cookie domain is configured so `auth.brand.com` (when it lands later) can issue sessions valid on every other subdomain.

## Approach Decisions

### Origin model: pure subdomains, per-origin workers

Considered alternatives:
- Edge rewrites to single origin (preserves shared workers, adds infrastructure)
- Hybrid: auth separate, rest co-located (most complex, addresses all goals best)

Chosen: pure subdomains. Cleanest, most idiomatic, browser-supported. Trade: no literal cross-origin SharedWorker — accepted.

### Apps scope: restructure existing 3, defer the rest

Considered alternatives:
- Restructure + scaffold auth
- Restructure + scaffold all 5 apps
- Defer MFE entirely, just do dep hoisting

Chosen: restructure only `www`, `app`, and `story`. Auth/docs/help land later when actually needed — at which point the pattern is cookie-cutter.

### Dependency management: Bun workspace catalog

Considered alternatives:
- Expand root `overrides`
- Hoist deps physically to root /node_modules

Chosen: Bun catalog protocol (`"next": "catalog:"`). Modern, idiomatic, single source of truth. Apps still see deps in their own package.json so type-checking and IDE work normally.

### Local dev URLs: `*.localhost`

Modern browsers auto-resolve `*.localhost` → `127.0.0.1`. No `/etc/hosts` edits, no external DNS dependency. Forward-compatible with production subdomain routing.

## Concrete Changes

### Root `package.json`

Add `catalog` field with shared deps:

```json
{
  "catalog": {
    "next": "^16.0.8",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "motion": "^12.23.26",
    "@iconify/react": "^6.0.0",
    "lucide-react": "^0.564.0",
    "next-themes": "^0.4.6",
    "tailwind-merge": "^3.4.0",
    "tailwindcss-animate": "^1.0.7",
    "@hookform/resolvers": "^5.2.2",
    "react-hook-form": "^7.66.1",
    "zod": "^3.23.8",
    "@serwist/next": "^9.2.3",
    "clsx": "^2.1.1",
    "class-variance-authority": "^0.7.1"
  }
}
```

`overrides` shrinks (or stays as a defensive belt-and-suspenders for transitive deps).

### App `package.json` files

Switch shared deps to `catalog:`:

```json
{
  "dependencies": {
    "next": "catalog:",
    "react": "catalog:",
    "motion": "catalog:",
    "@iconify/react": "catalog:",
    "@repo/ui": "workspace:*"
  }
}
```

App-specific deps (e.g., `@apollo/client` only in `apps/app`, `@mdx-js/react` only in `apps/www`) stay declared per-app with their own version.

### Per-app PWA setup (`apps/www`, `apps/app`)

New files per app:
- `app/sw.ts` — Serwist entry, precache + runtime cache strategies
- `public/manifest.json` — PWA manifest (icons, name, start_url, display: standalone)

Modified per app:
- `next.config.ts` — wrap with `withSerwist({ swSrc: "app/sw.ts", swDest: "public/sw.js" })`
- `app/layout.tsx` — link manifest, register SW
- `package.json` — `dev` script binds to subdomain hostname (`next dev --hostname www.localhost`)

Story app (`apps/story`) participates in the catalog but does NOT get a SW or manifest. It's a tools app, not a PWA.

### Auth cookie domain

Even though `apps/auth` is deferred, set the foundation now:
- `apps/app/src/lib/auth.ts` — Better Auth session cookie domain reads from env
  - Production: `.brand.com`
  - Dev: `.localhost`
- Document this in CLAUDE.md so when `apps/auth` lands, the pattern is clear

### Local dev URL conventions

- `apps/www` dev → `www.localhost:3000`
- `apps/app` dev → `app.localhost:3001`
- `apps/story` dev → stays at `localhost:6006` (not a subdomain-routed app)

Document: any future `apps/auth`, `apps/docs`, `apps/help` follow the same pattern with their own ports.

### CLAUDE.md updates

Refresh to reflect:
- New subdomain architecture
- Catalog dep management
- PWA conventions
- Local dev URL pattern
- Cookie domain pattern for cross-app auth (forward-looking)

## What's NOT Changing

- Turborepo config
- Biome / commitlint / Husky
- Source code inside any app
- packages/ui internal structure
- GraphQL+Apollo setup in apps/app
- Existing auth flow (still inside apps/app, just with cookie-domain config added)

## Out of Scope (Future Work)

- Creating `apps/auth`, `apps/docs`, `apps/help`
- `packages/workers` for typed Worker wrappers (YAGNI; add when first non-trivial worker appears)
- Vercel multi-project deployment configuration
- Edge rewrites / proxy layer
- Module Federation or runtime composition
- Extracting `@repo/auth-config` / `@repo/api-client` (deferred until apps/auth exists)

## Validation Plan

1. `bun install` regenerates lockfile cleanly without errors
2. `bun --filter @repo/www dev` starts on `www.localhost:3000`; manifest loads; SW registers; Lighthouse PWA audit passes
3. `bun --filter @repo/app dev` same on `app.localhost:3001`
4. `bun --filter @repo/story dev` stays at `localhost:6006`, still works
5. `bun typecheck` passes monorepo-wide
6. `bun run build` produces production bundles for www and app, each with their own SW

## Risks

- **Bun catalog quirks with `next`** — Next.js sometimes assumes itself in the local workspace. Catalog should still resolve correctly (Bun installs the dep into the workspace's hoisted tree), but verify with `which next` from inside `apps/app`.
- **Serwist Webpack vs Turbopack** — apps build with `next build --webpack` (already pinned). Serwist's webpack plugin is the supported path. Don't switch to Turbopack mid-flight.
- **Cookie domain collisions in dev** — `.localhost` cookies can leak between dev tabs. Acceptable for dev; document.
- **PWA install prompt UX** — first install on each subdomain is independent. Users may see multiple "install" prompts as they cross subdomains. Document; not actionable beyond UX guidance.
