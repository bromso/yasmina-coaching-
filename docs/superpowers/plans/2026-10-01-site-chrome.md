# Shared site header, footer and cross-app navigation (Phase 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Next app renders one shared header and footer from `packages/ui`, with cross-app
links from a single registry (`@repo/sites`), so the seven subdomains read as one site and a visitor
reaches the app and sign-in from anywhere.

**Architecture:** `@repo/sites` (pure TS) owns the list of apps and `siteUrl`/`siteNav`/
`footerGroups` driven by `SITE_DOMAIN`. `@repo/ui` gains content-agnostic `SiteHeader`/`SiteFooter`
blocks plus `Brand`, `ThemeToggle`, `UserMenu`, `SignInLink`. Each app's root layout composes them in
a few lines; static apps pass static links, the three auth apps pass the user and their `signOut`.

**Tech Stack:** Next 16, React 19, `next-themes`, shadcn `Sheet`/`DropdownMenu`/`Avatar`, Storybook 10
(`@storybook/react-vite`), `bun test` with `react-dom/server`.

**Spec:** `docs/superpowers/specs/2026-10-01-site-chrome-design.md`

## Global Constraints

- Branch `feat/site-chrome` from `main` after PR #43.
- **Ruling (amends the spec, applied in Task 5's docs):** `siteUrl` never throws. `SITE_DOMAIN` unset → `brand.localhost` (dev form); in production mode it also prints one warning per process: `[sites] SITE_DOMAIN is not set — cross-app links point at brand.localhost`. Reason: `next build` always runs with `NODE_ENV=production`, so a throw would break every local build and `bun run ci`.
- `siteUrl` rules: domain ending in `.localhost` → `http://<id>.<domain>:<port>`; any other domain → `https://<id>.<domain>`. `SITES` order and labels exactly as the spec. `siteNav` = App, Docs, Help, Jobs with `current` flagged. `footerGroups` = Product (App, Docs), Company (Jobs, Help), Account (Sign in, Account).
- Blocks use plain `<a>`; the current nav item renders as `<span aria-current="page">` with no `href`; `<nav aria-label="Site">`; mobile menu is a `Sheet` under `md`.
- `Brand` default name `"Boilerplate"`; `BrandMark` is the three-bar mark from `apps/auth`'s `AuthLayout`.
- Static apps (`www`, `docs`, `help`, `jobs`) do not depend on `@repo/session`; their layouts stay synchronous.
- `app`'s `site-header.tsx`, `account`'s `account-header.tsx`, `www`'s `theme-toggle.tsx`, `app`'s `theme-switch.tsx` and `logo.tsx` are deleted; `initialsOf` moves to `@repo/ui/lib/initials` (account imports it from there).
- Biome 0/0; double quotes, no semicolons, 2-space indent, 100-char lines. Commits: Conventional Commits, blank line, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (subjects ≤100 chars). Planner tests (`bun test scripts`) updated whenever root scripts change.

## Review Focus

1. **A production build with `SITE_DOMAIN=example.com`** must emit `https://docs.example.com` links and never `brand.localhost` — Task 5's build check greps the output HTML.
2. **The current app must not link to itself** in the nav (`aria-current`, no `href`) — Task 3's `SiteHeader` test and Task 5's browser pass.
3. **A signed-out visitor on `app`** must get a Sign-in link whose `next` is the current page (not stale) — Task 4 keeps the `x-url` source; Task 5's walk checks the `next` value.
4. **`account`'s sidebar trigger** must still open the sidebar below `md` — Task 5's walk at 400px.
5. **Keyboard users** must reach every nav link and the mobile sheet — Task 3's stories' `play` tab through them.

---

### Task 1: `@repo/sites` registry, session defaults, build plumbing

**Files:**
- Create: `packages/sites/package.json`, `tsconfig.json`, `README.md`, `src/index.ts`, `src/index.test.ts`
- Modify: `packages/session/package.json`, `packages/session/src/env.ts`, `packages/session/src/env.test.ts`, root `package.json`, `scripts/ci-plan.test.ts`, `docker/next.Dockerfile`, `docker-compose.yml`, `.env.example`

**Interfaces:**
- Produces: `SITES`, `type SiteId`, `siteUrl(id, env?)`, `siteNav(current)`, `footerGroups()` as in the spec; `@repo/session` dev defaults `AUTH_URL = siteUrl("auth")`, `APP_URL = siteUrl("app")`.

- [ ] **Step 1: Failing tests**

`packages/sites/src/index.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { footerGroups, SITES, siteNav, siteUrl } from "./index"

describe("siteUrl", () => {
  test("unset: dev hosts with ports", () => {
    expect(siteUrl("docs", {})).toBe("http://docs.brand.localhost:3004")
    expect(siteUrl("www", {})).toBe("http://www.brand.localhost:3000")
  })
  test("a .localhost domain keeps http and ports", () => {
    expect(siteUrl("app", { SITE_DOMAIN: "acme.localhost" })).toBe("http://app.acme.localhost:3001")
  })
  test("a real domain is https without a port", () => {
    expect(siteUrl("auth", { SITE_DOMAIN: "acme.com" })).toBe("https://auth.acme.com")
    expect(siteUrl("auth", { SITE_DOMAIN: " acme.com/ " })).toBe("https://auth.acme.com")
  })
  test("production without SITE_DOMAIN falls back and warns once", () => {
    const warnings: string[] = []
    const warn = console.warn
    console.warn = (m: string) => {
      warnings.push(m)
    }
    try {
      expect(siteUrl("docs", { NODE_ENV: "production" })).toBe("http://docs.brand.localhost:3004")
      siteUrl("help", { NODE_ENV: "production" })
    } finally {
      console.warn = warn
    }
    expect(warnings.filter((w) => w.includes("SITE_DOMAIN is not set"))).toHaveLength(1)
  })
})

describe("siteNav", () => {
  test("lists App, Docs, Help, Jobs and flags the current one without changing its href", () => {
    const nav = siteNav("docs", {})
    expect(nav.map((n) => n.id)).toEqual(["app", "docs", "help", "jobs"])
    expect(nav.find((n) => n.id === "docs")).toEqual({
      id: "docs",
      label: "Docs",
      href: "http://docs.brand.localhost:3004",
      current: true,
    })
    expect(nav.filter((n) => n.current)).toHaveLength(1)
  })
  test("www is never a nav item", () => {
    expect(siteNav("www", {}).some((n) => n.id === "www")).toBe(false)
  })
})

describe("footerGroups", () => {
  test("three groups in the documented order", () => {
    const groups = footerGroups({})
    expect(groups.map((g) => g.title)).toEqual(["Product", "Company", "Account"])
    expect(groups[2]?.links.map((l) => l.label)).toEqual(["Sign in", "Account"])
    expect(groups[0]?.links[1]?.href).toBe("http://docs.brand.localhost:3004")
  })
})

test("SITES covers the seven apps with their dev ports", () => {
  expect(Object.keys(SITES)).toEqual(["www", "app", "auth", "account", "docs", "help", "jobs"])
  expect(SITES.jobs).toEqual({ label: "Jobs", port: 3006 })
})
```

(`siteNav` and `footerGroups` take an optional `env` second/first parameter like `siteUrl`, defaulting to `process.env`, so tests are deterministic.)

Run: `cd packages/sites && bun test` — FAIL (no module yet).

- [ ] **Step 2: Implement**

`packages/sites/package.json`:

```json
{
  "name": "@repo/sites",
  "version": "0.1.0",
  "description": "The one list of this site's apps and how to link between them",
  "type": "module",
  "private": true,
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "bun test" },
  "devDependencies": { "@repo/typescript-config": "workspace:*", "@types/bun": "catalog:" }
}
```

`tsconfig.json`: `{ "extends": "@repo/typescript-config/bun.json", "compilerOptions": { "types": ["bun"] }, "include": ["src"] }`.

`packages/sites/src/index.ts`:

```ts
/**
 * Every app of this site, and how to link between them. Pure TypeScript: usable from server and
 * client components, config files and tests alike. Rename a project by setting SITE_DOMAIN.
 */

export const SITES = {
  www: { label: "Home", port: 3000 },
  app: { label: "App", port: 3001 },
  auth: { label: "Sign in", port: 3002 },
  account: { label: "Account", port: 3003 },
  docs: { label: "Docs", port: 3004 },
  help: { label: "Help", port: 3005 },
  jobs: { label: "Jobs", port: 3006 },
} as const

export type SiteId = keyof typeof SITES
type Env = Record<string, string | undefined>

const DEV_DOMAIN = "brand.localhost"
let warned = false

/**
 * `http://<id>.brand.localhost:<port>` until SITE_DOMAIN is set; a `.localhost` domain keeps the
 * dev form, anything else is `https://<id>.<domain>`. Never throws: `next build` always runs in
 * production mode, so a missing value warns once instead of failing every local build.
 */
export function siteUrl(id: SiteId, env: Env = process.env): string {
  const domain = env.SITE_DOMAIN?.trim().replace(/\/+$/, "") || undefined
  if (!domain && env.NODE_ENV === "production" && !warned) {
    warned = true
    console.warn("[sites] SITE_DOMAIN is not set — cross-app links point at brand.localhost")
  }
  const host = domain ?? DEV_DOMAIN
  return host.endsWith(".localhost") || host === "localhost"
    ? `http://${id}.${host}:${SITES[id].port}`
    : `https://${id}.${host}`
}

const NAV: readonly SiteId[] = ["app", "docs", "help", "jobs"]

/** The cross-app navigation, with the current app flagged (rendered as text, not a link). */
export function siteNav(current: SiteId, env: Env = process.env) {
  return NAV.map((id) => ({ id, label: SITES[id].label, href: siteUrl(id, env), current: id === current }))
}

/** The footer's link groups; the same on every app. */
export function footerGroups(env: Env = process.env) {
  const link = (id: SiteId) => ({ label: SITES[id].label, href: siteUrl(id, env) })
  return [
    { title: "Product", links: [link("app"), link("docs")] },
    { title: "Company", links: [link("jobs"), link("help")] },
    { title: "Account", links: [link("auth"), link("account")] },
  ]
}
```

`packages/session`: add `"@repo/sites": "workspace:*"` to dependencies; in `env.ts` replace the two
literal defaults with `AUTH_URL: siteUrl("auth", {})` and `APP_URL: siteUrl("app", {})` (`{}` so
the defaults never depend on the caller's env); `env.test.ts` expectations unchanged (same strings).

Root `package.json`: `typecheck` and `test:services` gain `--filter @repo/sites`; update
`scripts/ci-plan.test.ts` (pinned lists; a `packages/sites` change reaches `@repo/session` and
through it `app`/`auth`/`account` — add one expectation for that).

`docker/next.Dockerfile`: in the builder stage before `RUN bun run … build`:
```dockerfile
# Where cross-app links point. The default is right for the local Compose stack; a deploy passes its domain.
ARG SITE_DOMAIN=brand.localhost
ENV SITE_DOMAIN=${SITE_DOMAIN}
```
`docker-compose.yml`: add `SITE_DOMAIN: ${SITE_DOMAIN:-brand.localhost}` to the `args` of the seven Next services. Root `.env.example`: `SITE_DOMAIN=` with: "Parent domain of the site (e.g. `acme.com`). Unset → `brand.localhost` with dev ports. Read at **build** time by the Next apps (static pages bake their links)."

`packages/sites/README.md`: what it is, the env rule, `siteNav`/`footerGroups`, "add your app here first".

- [ ] **Step 3: Run and commit**

Run: `bun install && bunx biome check --write packages/sites packages/session scripts package.json && cd packages/sites && bun test && bun run typecheck && cd ../.. && cd packages/session && bun test && cd ../.. && bun run typecheck && bun test scripts && docker compose config -q`
Expected: sites 8 pass; session tests unchanged and green; typecheck green incl. `@repo/sites`; planner green; compose validates.

```bash
git add packages/sites packages/session package.json bun.lock scripts/ci-plan.test.ts docker/next.Dockerfile docker-compose.yml .env.example
git commit -m "feat(sites): one registry of the site's apps and cross-app URLs, driven by SITE_DOMAIN"
```

---

### Task 2: `Brand`, `ThemeToggle`, `UserMenu`, `SignInLink`, `initials` in `@repo/ui`

**Files:**
- Create: `packages/ui/src/components/brand.tsx`, `theme-toggle.tsx`, `user-menu.tsx`, `sign-in-link.tsx`, `packages/ui/src/lib/initials.ts`; tests `brand.test.tsx`, `sign-in-link.test.tsx`, `user-menu.test.tsx`, `lib/initials.test.ts`
- Modify: `apps/auth/src/components/auth-layout.tsx` (use `Brand`), `apps/account/src/lib/actions.ts` (+ its test) to import `initialsOf` from `@repo/ui/lib/initials`
- Delete: `apps/www/src/components/theme-toggle.tsx`, `apps/app/src/components/theme-switch.tsx`, `apps/app/src/components/logo.tsx` (update their importers to `@repo/ui/components/theme-toggle`)

**Interfaces:**
- Produces: `Brand({ name?, href, className })`, `BrandMark({ className })`; `ThemeToggle({ className })` (client; cycles light/dark); `UserMenu({ user: { name: string; email: string }, accountUrl: string, signOut: () => Promise<void> })` (client); `SignInLink({ authUrl, next?, className, ...buttonProps })`; `initialsOf({ name, email })`.

- [ ] **Step 1: Failing tests**

`lib/initials.test.ts` — move the three `initialsOf` cases from `apps/account/src/lib/actions.test.ts` (and delete them there). `brand.test.tsx`: renders a link to `href` containing the name and an `aria-hidden` mark; default name `Boilerplate`; custom name. `sign-in-link.test.tsx`: `href` is `${authUrl}/login` without `next`, and `${authUrl}/login?next=<encoded>` with it; text "Sign in". `user-menu.test.tsx` (`renderToStaticMarkup` renders the closed menu): the trigger is a `button` with `aria-haspopup="menu"` and contains the initials; the user's name is not in the static output of a closed menu (that's the dropdown's job — assert the `sr-only` label "Account menu for <name>" instead). Each: `cd packages/ui && bun test` → FAIL first.

- [ ] **Step 2: Implement**

`brand.tsx` (server-renderable): `BrandMark` = the three `<span>` bars from `AuthLayout` on a `size-6 rounded-md bg-primary` box, `aria-hidden="true"`; `Brand` = `<a href={href} className={cn("flex items-center gap-2 font-semibold", className)}><BrandMark />{name}</a>`.

`theme-toggle.tsx` = `apps/www`'s current component with `className` merged via `cn()` and `aria-label="Toggle theme"` on the button.

`user-menu.tsx` (`"use client"`):

```tsx
"use client"

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar"
import { Button } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { initialsOf } from "@repo/ui/lib/initials"

type UserMenuProps = {
  user: { name: string; email: string }
  accountUrl: string
  /** A server action; passed from the app so the menu stays app-agnostic. */
  signOut: () => Promise<void>
}

export function UserMenu({ user, accountUrl, signOut }: UserMenuProps) {
  const label = user.name || user.email
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
              {initialsOf(user)}
            </AvatarFallback>
          </Avatar>
          <span className="sr-only">Account menu for {label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{label}</span>
          {user.name && <span className="text-muted-foreground truncate text-xs font-normal">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={accountUrl}>Account</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full text-left">
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

`sign-in-link.tsx`: `Button asChild variant="outline" size="sm"` around `<a href={...}>Sign in</a>`.
`lib/initials.ts`: `initialsOf` verbatim from `apps/account`.

Importers: `apps/www` (wherever `ThemeToggle` is used — grep) → `@repo/ui/components/theme-toggle`; `apps/app` `theme-switch` users likewise; `AuthLayout` renders `<Brand href="/" />` in place of its inline mark; `apps/account/src/lib/actions.ts` re-exports `initialsOf` from ui (or callers import from ui directly — prefer the latter and drop the local function).

- [ ] **Step 3: Run and commit**

Run: `bunx biome check --write packages/ui apps && bun run --filter @repo/ui test && bun run --filter @repo/ui typecheck && bun run typecheck && bun run --filter @repo/account test`
Expected: ui tests +7, all green; typecheck green (app, www, auth, account compile with the moved components); account tests green with `initialsOf` imported from ui.

```bash
git add packages/ui apps
git commit -m "feat(ui): Brand, ThemeToggle, UserMenu and SignInLink as design-system single points"
```

---

### Task 3: `SiteHeader` and `SiteFooter` blocks, tests, stories

**Files:**
- Create: `packages/ui/src/blocks/site-header.tsx`, `site-header-mobile.tsx`, `site-footer.tsx`, `site-header.test.tsx`, `site-footer.test.tsx`
- Create: `apps/story/stories/SiteHeader.stories.tsx`, `SiteFooter.stories.tsx`, `Brand.stories.tsx`, `UserMenu.stories.tsx`, `ThemeToggle.stories.tsx`

**Interfaces:**
- Produces: `type NavLink = { label: string; href: string; current?: boolean }`; `SiteHeader({ brand, links, start?, end?, sticky?, className })`; `SiteFooter({ brand, groups, legal?, className })`.

- [ ] **Step 1: Failing tests**

`site-header.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SiteHeader } from "./site-header"

const links = [
  { label: "App", href: "https://app.example.com" },
  { label: "Docs", href: "https://docs.example.com", current: true },
]

describe("SiteHeader", () => {
  test("is a header landmark with a labelled site nav", () => {
    const html = renderToStaticMarkup(<SiteHeader brand={<a href="/">Brand</a>} links={links} />)
    expect(html).toContain("<header")
    expect(html).toContain('<nav aria-label="Site"')
    expect(html).toContain('href="https://app.example.com"')
  })
  test("the current app is text with aria-current, not a link", () => {
    const html = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={links} />)
    expect(html).toMatch(/<span[^>]*aria-current="page"[^>]*>Docs<\/span>/)
    expect(html).not.toContain('href="https://docs.example.com"')
  })
  test("renders start and end slots and the sticky variant", () => {
    const html = renderToStaticMarkup(
      <SiteHeader brand={<span>B</span>} links={[]} start={<button type="button">menu</button>} end={<span>end</span>} sticky />
    )
    expect(html).toContain(">menu<")
    expect(html).toContain(">end<")
    expect(html).toMatch(/<header[^>]*class="[^"]*sticky/)
  })
})
```

`site-footer.test.tsx`: groups render as `<nav aria-label="Footer">` with headings and links; `legal` renders in the bottom row; `brand` rendered.

Run: `cd packages/ui && bun test src/blocks` → FAIL.

- [ ] **Step 2: Implement**

`site-header.tsx` (server-renderable):

```tsx
import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"
import { SiteHeaderMobile } from "./site-header-mobile"

export type NavLink = { label: string; href: string; current?: boolean }

type SiteHeaderProps = React.ComponentProps<"header"> & {
  brand: React.ReactNode
  links: NavLink[]
  /** Before the brand: a sidebar trigger, for example. */
  start?: React.ReactNode
  /** After the nav: theme toggle, sign-in or the user menu. */
  end?: React.ReactNode
  sticky?: boolean
}

/** The site-wide header: brand, cross-app nav (sheet below md), and controls. Content via props. */
export function SiteHeader({ brand, links, start, end, sticky, className, ...props }: SiteHeaderProps) {
  return (
    <header
      data-slot="site-header"
      className={cn(
        "border-b bg-background",
        sticky && "sticky top-0 z-50",
        className
      )}
      {...props}
    >
      <div className="container flex h-14 items-center gap-4">
        {start}
        {brand}
        <nav aria-label="Site" className="hidden md:flex md:items-center md:gap-1">
          {links.map((link) =>
            link.current ? (
              <span key={link.href} aria-current="page" className="rounded-md px-3 py-1.5 text-sm font-medium">
                {link.label}
              </span>
            ) : (
              <a key={link.href} href={link.href} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                {link.label}
              </a>
            )
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {end}
          <SiteHeaderMobile links={links} />
        </div>
      </div>
    </header>
  )
}
```

`site-header-mobile.tsx` (`"use client"`): a `Sheet` with a `SheetTrigger` ghost icon button (`lucide:menu`, `aria-label="Open menu"`, `md:hidden`), `SheetContent side="right"` with `SheetTitle "Menu"` and the same link list (current as `aria-current` text). Nothing rendered when `links` is empty.

`site-footer.tsx`: `<footer data-slot="site-footer" className={cn("border-t", className)}>` → container grid: brand column, then `<nav aria-label="Footer">` with one `<div>` per group (`<h2 className="text-sm font-semibold">` + `<ul>` of links), then a bottom row with `legal`.

- [ ] **Step 3: Stories**

`SiteHeader.stories.tsx` (`Blocks/SiteHeader`): `Static` (brand + 4 links + end = ThemeToggle + a Sign in button) with `play`: header landmark, `aria-current` on the current item, tab reaches the first link; `SignedIn` (end = `UserMenu` with `signOut: async () => {}`); `Mobile` with `parameters.viewport` small and `play` clicking "Open menu" and asserting the sheet lists the links. `SiteFooter.stories.tsx` (`Blocks/SiteFooter`) with `footerGroups`-shaped data and a legal row. `Brand.stories.tsx`, `UserMenu.stories.tsx` (`play`: open the menu, see Account and Sign out), `ThemeToggle.stories.tsx` under `Components/...`. Stories import nothing from `@repo/sites` (keep Storybook independent of env); they use literal hrefs.

- [ ] **Step 4: Run and commit**

Run: `bunx biome check --write packages/ui apps/story && bun run --filter @repo/ui test && bun run --filter @repo/ui typecheck && cd apps/story && bunx vitest run stories/SiteHeader.stories.tsx stories/SiteFooter.stories.tsx stories/Brand.stories.tsx stories/UserMenu.stories.tsx stories/ThemeToggle.stories.tsx`
Expected: ui tests green (+6); story `play`s pass.

```bash
git add packages/ui apps/story
git commit -m "feat(ui): SiteHeader and SiteFooter blocks with stories"
```

---

### Task 4: The seven layouts

**Files:**
- Modify: `apps/{www,docs,help,jobs}/src/app/layout.tsx`; `apps/app/src/app/layout.tsx`; `apps/auth/src/app/layout.tsx` + `src/components/auth-layout.tsx`; `apps/account/src/app/(account)/layout.tsx`
- Delete: `apps/app/src/components/site-header.tsx`, `apps/account/src/components/account-header.tsx`
- Modify: `apps/{www,docs,help,jobs,auth,account}/package.json` (+ `@repo/sites`), `apps/app/package.json` (+ `@repo/sites`), each `next.config.mjs` `transpilePackages` (+ `@repo/sites`)

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: A shared snippet per app kind**

Static apps (`www`, `docs`, `help`, `jobs`) — in `layout.tsx` (synchronous):

```tsx
import { SiteFooter } from "@repo/ui/blocks/site-footer"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { Brand } from "@repo/ui/components/brand"
import { Button } from "@repo/ui/components/button"
import { SignInLink } from "@repo/ui/components/sign-in-link"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { footerGroups, siteNav, siteUrl } from "@repo/sites"

const SITE = "docs" as const  // per app
const legal = (
  <p className="text-muted-foreground text-xs">
    © {new Date().getFullYear()} Boilerplate · <a href={`${siteUrl("www")}/terms`}>Terms</a> ·{" "}
    <a href={`${siteUrl("www")}/privacy`}>Privacy</a>
  </p>
)
// in the body, replacing bare {children}:
<SiteHeader
  brand={<Brand href={siteUrl("www")} />}
  links={siteNav(SITE)}
  end={
    <>
      <ThemeToggle />
      <SignInLink authUrl={siteUrl("auth")} />
      <Button asChild size="sm">
        <a href={siteUrl("app")}>Open app</a>
      </Button>
    </>
  }
/>
{children}
<SiteFooter brand={<Brand href={siteUrl("www")} />} groups={footerGroups()} legal={legal} />
```

(`www`: also switch `metadata.title` to `{ default: "Boilerplate", template: "%s | Boilerplate" }` and keep its `ThemeProvider`.) The `legal` fragment is identical in every app; it is small enough to repeat rather than become a block.

`app`: replace the `SiteHeader` import/usage with the shared block: `end` = `<ThemeToggle />` + (`user ? <UserMenu user={user} accountUrl={siteUrl("account")} signOut={signOut} /> : <SignInLink authUrl={AUTH_URL} next={(await headers()).get("x-url") ?? APP_URL} />`); import `signOut` from `./actions`; keep `connection()`/`getUser()`; add the footer after `{children}`. Delete `src/components/site-header.tsx`.

`auth`: the root layout gains the header/footer (its layout becomes `async`, reads `getAuth().getUser()` after `connection()`; `end` = `<ThemeToggle />` + `user && <UserMenu … signOut={signOut} />` with `signOut` from `./actions`); `AuthLayout` drops its brand link (keeps the centred column; `<main id="main">` stays).

`account`: `(account)/layout.tsx` renders `<SiteHeader start={<SidebarTrigger className="md:hidden" />} sticky brand={<Brand href={siteUrl("www")} />} links={siteNav("account")} end={<><ThemeToggle /><UserMenu user={user} accountUrl={siteUrl("account")} signOut={signOut} /></>} />` in place of `AccountHeader`; footer after the sidebar/inset block. Delete `account-header.tsx`.

- [ ] **Step 2: Deps, config, run**

Each app's `package.json` gains `"@repo/sites": "workspace:*"`; each `next.config.mjs` `transpilePackages` gains `"@repo/sites"`. `bun install`.

Run: `bunx biome check --write apps && bun run typecheck && bun run test:services && for a in www docs help jobs app auth account; do bun --filter @repo/$a build || exit 1; done`
Expected: all green; static apps still report their pages as static (○) in the build output.

```bash
git add apps bun.lock
git commit -m "feat(apps): every app renders the shared header and footer; ad-hoc headers removed"
```

---

### Task 5: Docs, spec amendment, browser pass, production build check

**Files:**
- Modify: `CLAUDE.md`, `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-01-site-chrome-design.md`, `apps/app/README.md`, `apps/account/README.md`, `README.md` (if it describes headers)

- [ ] **Step 1: Docs**

Spec: replace the "throws" rule with the ruling (never throws; dev fallback + one warning in production mode; Docker ARG default). CLAUDE.md Design System Single Points: **Site header & footer**, **Brand**, **Theme toggle**, **Sites registry** (`SITE_DOMAIN` rule, build-time); "Adding a new subdomain app": step 0 "add it to `SITES`", the layout snippet, `@repo/sites` in `transpilePackages`; Docker section: the build arg. ROADMAP: tick the item. READMEs: remove references to the deleted headers.

- [ ] **Step 2: Browser pass (`bun dev`)**

1. Each of the seven home pages shows the header (brand, nav with the current app as text, theme toggle, controls) and the footer.
2. From `www`: click **Docs** → `docs.brand.localhost:3004`; from `docs` click **Help**, **Jobs**, **App** → the right hosts; **Sign in** → `auth…/login`; **Open app** → `app…`.
3. At 400px on `www`: the hamburger opens the sheet with the four links; on `account` the sidebar trigger still opens the sidebar.
4. Theme toggle flips `html.dark` on `www`.
5. Signed in (via `auth`): `app`, `auth` and `account` show the `UserMenu`; **Account** goes to `account…`; **Sign out** works from `app`'s header.
6. Signed out on `app`: the Sign-in link's `next=` is the current page URL.
7. Console: zero CSP messages on every page visited.

- [ ] **Step 3: Production build check**

`SITE_DOMAIN=example.com bun --filter @repo/www build && grep -o 'https://docs.example.com' apps/www/.next/server/app/index.html | head -1` → a hit, and `grep -c 'brand.localhost' apps/www/.next/server/app/index.html` → `0`. Then `bun --filter @repo/www build` without `SITE_DOMAIN` → the build output contains the `[sites] SITE_DOMAIN is not set` warning once.

- [ ] **Step 4: Full gate and commit**

`bun run ci` → exit 0.

```bash
git add CLAUDE.md docs README.md apps/app/README.md apps/account/README.md
git commit -m "docs: shared site chrome and the sites registry; Phase 5a done"
```
