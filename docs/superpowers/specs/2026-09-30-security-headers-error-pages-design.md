# Security headers and status pages (Phase 3c)

**Status:** approved design, pending implementation plan
**Date:** 2026-09-30
**Roadmap:** `docs/ROADMAP.md`, Phase 3 — sub-project 3c (3a shipped in #34, 3b in PR #37)

## Intent

Only `apps/www` sends security headers today, from a hand-written `src/proxy.ts` whose CSP allows
`'unsafe-eval'`; the other six Next apps send none. Only `www` has a `not-found.tsx`; no app has an
`error.tsx`, `global-error.tsx` or `loading.tsx`, so a thrown error or a bad URL shows Next's
default screens. This puts the policy in one file in `packages/ui`, applies it to every app with a
six-line `proxy.ts`, removes `'unsafe-eval'` from production, and gives every app branded
error / not-found / loading pages built from shared blocks.

**Success criteria**

- Every app returns the same security headers on every document and API route, from one source.
- The production CSP contains no `'unsafe-eval'`; development keeps what Next HMR needs.
- No CSP violation appears in the browser console on any app's home page.
- Every app renders a `StatusPage` for a bad URL, a thrown render error, and a root-layout error,
  and a `PageLoading` while a segment suspends.
- A new subdomain app is covered by copying five files from `apps/app`.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Script CSP | `script-src 'self' 'unsafe-inline'` in production | Next's hydration scripts are inline, so the alternatives are `'unsafe-inline'` or a per-request nonce; a nonce makes every page in seven apps dynamically rendered. The roadmap asks for no `'unsafe-eval'`; a nonce upgrade later lives in the same `proxy.ts`. |
| Where applied | `src/proxy.ts` per app, calling `createSecurityProxy()` from `@repo/ui` | Next compiles `proxy.ts`, so it works identically under Bun (Docker), Node (CI) and locally. `headers()` in `next.config` would be loaded by whichever runtime runs `next`, and not all of them strip TypeScript from an imported `@repo/ui` file. |
| Extension point | One option, `csp: Partial<Record<CspDirective, string[]>>`, appended to the directive | An app that needs one more origin never re-declares the policy. |
| Error pages | One content-agnostic `StatusPage` block; thin per-app files | The five-layer rule: blocks are shared and take props, the app files are the composition. |
| Error reporting | `console.error(error)` in `error.tsx` | Error tracking is Phase 5; this is the hook it will replace. |

## Components

### `packages/ui/src/lib/security-headers.ts` (pure, no Next import)

```ts
type CspDirective = "default-src" | "script-src" | "style-src" | "img-src" | "font-src"
  | "connect-src" | "worker-src" | "manifest-src" | "frame-src" | "frame-ancestors"
  | "form-action" | "base-uri" | "object-src"
type SecurityHeaderOptions = { dev?: boolean; csp?: Partial<Record<CspDirective, string[]>> }
securityHeaders(options?: SecurityHeaderOptions): Record<string, string>
```

Production headers:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.iconify.design https://raw.githubusercontent.com; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `credentialless` |

With `dev: true`: `script-src` gains `'unsafe-eval'` (Next HMR), `connect-src` gains `ws: wss:`
(the HMR socket), and `upgrade-insecure-requests` and `Strict-Transport-Security` are omitted (the
apps run on `http://*.localhost`). Nothing else differs. `csp` sources are appended to the named
directive; a directive not in the base policy (`frame-src`) is added.

Why the two extra origins: `api.iconify.design` is the `Icon` component's API;
`raw.githubusercontent.com` serves the bklit choropleth's topology. The animate-ui demo components
that call `api.github.com` / `api.microlink.io` are not imported by any app. `apps/app` calls
`apps/api` and `apps/ai` server-side, so `'self'` covers the browser.

### `packages/ui/src/lib/security-proxy.ts`

`createSecurityProxy(options?: SecurityHeaderOptions): (request: NextRequest) => NextResponse` —
`NextResponse.next()` with every header from `securityHeaders` set. `dev` defaults to
`process.env.NODE_ENV !== "production"`.

### Per app: `src/proxy.ts` (all seven; replaces `apps/www/src/proxy.ts`)

```ts
import { createSecurityProxy } from "@repo/ui/lib/security-proxy"

export const proxy = createSecurityProxy()

// Skip Next's own assets and static files; the policy is for documents and API routes.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|js|css|map|txt|webmanifest)$).*)",
  ],
}
```

The matcher is a literal in each file because Next reads it statically. `/api/health` is matched,
so `curl -I` on any route shows the headers.

### Blocks: `packages/ui/src/blocks/`

- `status-page.tsx` — `StatusPage({ code?, title, description, children?, className? })`: a centred
  column; `code` in small mono type, `title` as the `h1`, `description`, and `children` as the
  actions row. No client hooks, so it renders from server and client components alike.
- `page-loading.tsx` — `PageLoading({ label = "Loading…" })`: the existing `Spinner` centred in a
  `min-h-[50vh]` box with `role="status"` and a visually hidden label.

### Per app: `src/app/` (identical in all seven; `www`'s `not-found.tsx` keeps its `<Background>` wrapper around the block)

- `not-found.tsx` (server) — `<StatusPage code="404" title="Page not found" description=…>` with
  `Button asChild → Link href="/"` "Back to home". Next sends the 404 status itself.
- `error.tsx` (`"use client"`) — `({ error, reset })`; `useEffect(() => console.error(error), [error])`;
  `<StatusPage code="500" title="Something went wrong">`; the description ends with
  `Reference: <digest>` when `error.digest` is set; actions **Try again** (`reset`) and **Back to home**.
- `global-error.tsx` (`"use client"`) — the boundary for the root layout: renders its own
  `<html lang="en"><body>`, imports `@/styles/globals.css`, then the same content as `error.tsx`.
  No fonts or theme provider (they are what failed); default light palette is acceptable.
- `loading.tsx` — `<PageLoading />`, at the app root so every segment (including `account`'s
  `(account)` group) inherits it.

## Tests

`packages/ui` gains `"test": "bun test"` and joins the root `test:services` filter list (the CI
planner then runs it when `@repo/ui` is affected).

- `src/lib/security-headers.test.ts` — production map equals an explicit expected object; production
  CSP has no `unsafe-eval` and has `upgrade-insecure-requests` and HSTS; dev CSP has `unsafe-eval`
  and `ws: wss:` and no HSTS; `csp` extras append to the named directive only; each directive
  appears once.
- `src/lib/security-proxy.test.ts` — `createSecurityProxy()(new NextRequest("https://app.example.com/"))`
  carries every header; a `csp: { "frame-src": [...] }` option appears in the CSP.
- `src/blocks/status-page.test.tsx`, `page-loading.test.tsx` — `renderToStaticMarkup`: code, title,
  description and action markup present; `role="status"` and the hidden label on the loader.
- Storybook: `StatusPage.stories.tsx` (404, 500, with digest), `PageLoading.stories.tsx`.

Manual verification in the plan's last task (CI is blocked until 2026-10-01):
1. `bun --filter @repo/app build && bun --filter @repo/app start`; `curl -sI` on `/` and
   `/api/health` show the production policy with no `unsafe-eval`.
2. Under `bun dev`, `curl -sI http://<app>.localhost:<port>/` for all seven shows the dev policy.
3. Browser pass (Chrome DevTools): each app's home page logs zero CSP violations; `/this-does-not-exist`
   renders the 404 page. `error.tsx` is checked through its story and an uncommitted local throw.
4. `bun run ci` green.

## Docs

- `CLAUDE.md` "Design System Single Points": **Security headers** (`@repo/ui/lib/security-headers`
  + `security-proxy`; `csp` is the only extension point) and **Status pages** (`StatusPage`,
  `PageLoading`). "Adding a new subdomain app": copy `src/proxy.ts`, `not-found.tsx`, `error.tsx`,
  `global-error.tsx`, `loading.tsx` from `apps/app`.
- `docs/ROADMAP.md`: tick both Phase 3 items.
- `apps/www`: update any README mention of the old proxy.

## Out of scope

Nonce / `strict-dynamic` CSP, a CSP report endpoint, error tracking (Phase 5), Storybook's own
headers, per-app copy differences on the status pages.
