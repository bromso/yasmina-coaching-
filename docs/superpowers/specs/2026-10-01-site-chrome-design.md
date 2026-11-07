# Shared site header, footer and cross-app navigation (Phase 5a)

**Status:** implemented (Phase 5a)
**Date:** 2026-10-01
**Roadmap:** `docs/ROADMAP.md`, Phase 5 — "Shared site header / footer and cross-app navigation"

## Intent

The seven apps do not read as one site. `app` and `account` have their own, different headers;
`auth` has a brand mark in a centred shell; `www`, `docs`, `help` and `jobs` have no header at all;
no app has a footer; and nothing in the code knows that `docs` lives at `docs.brand.com` — only
`AUTH_URL` and `APP_URL` exist, in the three auth-aware apps. With authentication shipped, the sign-in
flow is reachable only by typing the URL. This gives every app the same header and footer from
`packages/ui`, fed by one registry of sites, so a visitor finds the app and sign-in from anywhere,
a signed-in user sees who they are on the apps that know, and a new subdomain app is one registry
entry plus one layout snippet.

**Success criteria**

- Every app renders the shared header (brand, cross-app nav, theme toggle, sign-in or user menu) and
  the shared footer, from `packages/ui`, with content from `@repo/sites`.
- From `www`, **Docs / Help / Jobs / App / Sign in** reach the right subdomains in dev and in a
  production build with `SITE_DOMAIN` set; a production build without it still succeeds, links to
  `brand.localhost` and logs one `[sites] SITE_DOMAIN is not set` warning.
- `app`, `auth` and `account` show the signed-in user and can sign out from the header; `www`,
  `docs`, `help` and `jobs` stay static and show **Sign in** / **Open app**.
- `account` keeps its sidebar; `app`'s and `account`'s ad-hoc headers are gone.
- Renaming the brand means editing `Brand` once and setting `SITE_DOMAIN`.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Auth awareness | Only `app`, `auth`, `account` read the session; the four static apps show static links | Reading the cookie makes every page dynamic and needs a service token; marketing/docs sites should stay static and PWA-friendly. |
| Where URLs come from | `@repo/sites`: `SITES`, `siteUrl`, `siteNav`, `footerGroups`, driven by one `SITE_DOMAIN` | One place to rename a domain; pure TS for server components, next config and tests; pass computed hrefs to client components as props (`process.env.SITE_DOMAIN` is not inlined into the browser bundle). |
| Failure mode | `siteUrl` never throws: without `SITE_DOMAIN` in production mode it falls back to `brand.localhost` and warns once; the Docker build arg defaults to `brand.localhost` | `next build` always runs in production mode, so throwing would fail every bare local build. Static pages bake links at build time, so a deploy must pass `SITE_DOMAIN` to the build; the warning in the build log is the signal. |
| Shape | Content-agnostic blocks (`SiteHeader`, `SiteFooter`) with slots, composed per app | Matches the repo's blocks rule; `account`'s sidebar trigger and `www`'s static controls fit through slots instead of option flags. |
| Links | Plain `<a>` in the blocks | Cross-origin links need no router; Storybook has no Next router mock. |
| Session redirect targets | `AUTH_URL` / `APP_URL` stay explicit and required in production; their dev defaults come from `@repo/sites` | Explicit values for security-relevant redirects. `@repo/session`'s dev defaults are computed with an empty env (`siteUrl("auth", {})`), so they ignore `SITE_DOMAIN`; a renamed local stack sets `AUTH_URL` / `APP_URL` explicitly. |

## Components

### `packages/sites` (`@repo/sites`, pure TypeScript)

```ts
export const SITES = {
  www:     { label: "Home",    port: 3000 },
  app:     { label: "App",     port: 3001 },
  auth:    { label: "Sign in", port: 3002 },
  account: { label: "Account", port: 3003 },
  docs:    { label: "Docs",    port: 3004 },
  help:    { label: "Help",    port: 3005 },
  jobs:    { label: "Jobs",    port: 3006 },
} as const
export type SiteId = keyof typeof SITES

export function siteUrl(id: SiteId, env: Record<string, string | undefined> = process.env): string
export function siteNav(current: SiteId): Array<{ id: SiteId; label: string; href: string; current: boolean }>
export function footerGroups(): Array<{ title: string; links: Array<{ label: string; href: string }> }>
```

`siteUrl`: `SITE_DOMAIN` unset → `http://<id>.brand.localhost:<port>`; set and ending in
`.localhost` → `http://<id>.<domain>:<port>`; set to anything else → `https://<id>.<domain>`.
It never throws: in production mode (`NODE_ENV === "production"`) an unset value falls back to
the dev form and logs `[sites] SITE_DOMAIN is not set — cross-app links point at brand.localhost`
once per process (`next build` always runs in production mode, so a throw would fail every bare
build). `siteNav` and `footerGroups` also take the optional `env`.
`siteNav` lists App, Docs, Help, Jobs in that order with `current` flagged. `footerGroups`:
*Product* (App, Docs), *Company* (Jobs, Help), *Account* (Sign in, Account).

`@repo/session`'s `DEV_DEFAULTS.AUTH_URL` / `APP_URL` become `siteUrl("auth")` / `siteUrl("app")`
(`@repo/session` depends on `@repo/sites`); production still requires them explicitly.

### `packages/ui`

- `blocks/site-header.tsx` — `SiteHeader({ brand, links, start?, end?, sticky?, className })`:
  `<header>` + `<nav aria-label="Site">`; desktop inline links, the `current` item as
  `<span aria-current="page">`; below `md` a hamburger opens a `Sheet` with the same links
  (`site-header-mobile.tsx`, `"use client"`). `start` precedes the brand (sidebar trigger); `end`
  holds the controls. `sticky` applies `sticky top-0 z-50 bg-background`.
- `blocks/site-footer.tsx` — `SiteFooter({ brand, groups, legal?, className })`: brand column,
  link groups, a bottom row with `legal`.
- `components/brand.tsx` — `BrandMark` (the three-bar mark from `apps/auth`'s `AuthLayout`) and
  `Brand({ name = "Boilerplate", href, className })`. The one file to edit when renaming.
- `components/theme-toggle.tsx` (`"use client"`, `next-themes`) — the single theme control;
  `apps/www/src/components/theme-toggle.tsx` and `apps/app/src/components/theme-switch.tsx` are removed.
- `components/user-menu.tsx` (`"use client"`) — `UserMenu({ user: { name; email }, accountUrl, signOut })`:
  avatar-with-initials trigger, `DropdownMenu` with name/email, **Account** link, **Sign out** as a
  `<form action={signOut}>` item. `initialsOf` moves from `apps/account` to `@repo/ui/lib/initials`.
- `components/sign-in-link.tsx` — `SignInLink({ authUrl, next?, className })` → `${authUrl}/login`
  (+ `?next=` when given).
- `apps/app/src/components/logo.tsx` (unused) is deleted.

### Per-app layouts

| App | `start` | `links` | `end` |
|---|---|---|---|
| www, docs, help, jobs | — | `siteNav(id)` | `ThemeToggle`, `SignInLink authUrl={siteUrl("auth")}`, **Open app** → `siteUrl("app")` |
| app | — | `siteNav("app")` | `ThemeToggle`, `user ? UserMenu : SignInLink` (`next` from `x-url`) |
| auth | — | `siteNav("auth")` | `ThemeToggle`, `user ? UserMenu : —` |
| account | `SidebarTrigger` (`md:hidden`), `sticky` | `siteNav("account")` | `ThemeToggle`, `UserMenu` |

Brand on every header: `<Brand href={siteUrl("www")} />`. Footer on every app after `main`:
`SiteFooter` with `footerGroups()` and `legal` = `© <year> Boilerplate · Terms · Privacy`
(`siteUrl("www")/terms`, `/privacy` — pages that do not exist yet; they land on `www`'s 404
`StatusPage` until written). `www`'s metadata title aligns with the others (`"Boilerplate"`, shared
template). `AuthLayout` drops its own brand mark; `apps/app/src/components/site-header.tsx` and
`apps/account/src/components/account-header.tsx` are removed. Layout order: `SkipLink` → header →
`main#main` → footer; `Providers`/`Toaster`/`WebVitals` unchanged.

### Build and deployment

`docker/next.Dockerfile`: `ARG SITE_DOMAIN=brand.localhost` + `ENV SITE_DOMAIN=$SITE_DOMAIN` before
`next build`, and the same pair in the runner stage so `app`, `auth` and `account` resolve links per
request with the domain the image was built for. `docker-compose.yml`: `build.args.SITE_DOMAIN: ${SITE_DOMAIN:-brand.localhost}` on the
seven Next services (compose on the host resolves `*.brand.localhost` to the mapped ports, so the
default is correct there). Root `.env.example`: `SITE_DOMAIN=` with the rule.

## Tests

- `@repo/sites` (`bun test`, in `test:services` and the root `typecheck`): `siteUrl` × {unset,
  `.localhost`, real domain, production-unset falls back and warns once}; `siteNav` order and `current`; `footerGroups`.
- `@repo/ui` (`renderToStaticMarkup`): `SiteHeader` landmarks, `aria-current` without `href`,
  slots; `SiteFooter` groups + legal; `Brand`; `SignInLink` with/without `next`; `UserMenu` trigger.
- Storybook: `Blocks/SiteHeader` (static and signed-in, mobile viewport), `Blocks/SiteFooter`,
  `Components/Brand`, `Components/UserMenu`, `Components/ThemeToggle`, with `play` checks.
- Browser pass on `bun dev`: header/footer on all seven homes; nav round-trips between subdomains;
  mobile sheet at 400px; theme toggle; **Sign in** from `www` → `auth`; signed in, `UserMenu` +
  sign-out on `app`/`auth`/`account`; `account` sidebar intact; zero CSP messages. Production check:
  `SITE_DOMAIN=example.com bun --filter @repo/www build` links to `https://docs.example.com`;
  a build without `SITE_DOMAIN` succeeds and logs the `[sites] SITE_DOMAIN is not set` warning.

## Docs

CLAUDE.md Design System Single Points: **Site header & footer**, **Brand**, **Theme toggle**,
**Sites registry**; "Adding a new subdomain app": add to `SITES`, the layout snippet, the ports
table; Docker section: the `SITE_DOMAIN` build arg. `packages/sites/README.md`. ROADMAP tick.

## Out of scope

Per-app custom nav beyond `siteNav`, mega-menus, search, notifications, Terms/Privacy content,
i18n, a client-side signed-in hint on the static apps.
