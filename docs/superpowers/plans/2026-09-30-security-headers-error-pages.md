# Security headers and status pages (Phase 3c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Next app sends the same security headers from one module in `packages/ui` (no
`'unsafe-eval'` in production) and renders shared, branded error / not-found / loading pages.

**Architecture:** `packages/ui/src/lib/security-headers.ts` is a pure function producing the header
map; `security-proxy.ts` wraps it as a Next `proxy`; each app's `src/proxy.ts` is six lines. Two
blocks, `StatusPage` and `PageLoading`, back four thin files per app under `src/app/`.

**Tech Stack:** Next.js 16 (`proxy.ts`, App Router error files), React 19, Bun test
(`react-dom/server` for block tests), Storybook 10.

**Spec:** `docs/superpowers/specs/2026-09-30-security-headers-error-pages-design.md`

## Global Constraints

- Production CSP is exactly: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.iconify.design https://raw.githubusercontent.com; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests`.
- Dev (`dev: true`) differs only in: `script-src` + `'unsafe-eval'`; `connect-src` + `ws: wss:`; no `upgrade-insecure-requests`; no `Strict-Transport-Security`.
- Other headers: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`.
- `csp` option: sources are appended to the named directive; a directive absent from the base policy is added at the end.
- Headers are applied by `src/proxy.ts` in each app (never `headers()` in `next.config`); the `config.matcher` is a literal in each file.
- The five per-app files (`proxy.ts`, `not-found.tsx`, `error.tsx`, `global-error.tsx`, `loading.tsx`) are byte-identical across the seven apps, except `apps/www/src/app/not-found.tsx`, which keeps its `<Background>` wrapper.
- Blocks are content-agnostic, take props, use `cn()`; kebab-case files, PascalCase exports; blocks never import views or pages.
- Biome at 0 errors and 0 warnings. Style: double quotes, no semicolons, 2-space indent, 100-char lines.
- Commits: Conventional Commits, a blank line, then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- CI is blocked until 2026-10-01; verification is local (`bun run ci` plus the manual checks in Task 5).

## Review Focus

1. **A page that loads an icon outside the bundled Lucide set, or the choropleth chart** must render without a CSP violation — Task 1 pins `api.iconify.design` and `raw.githubusercontent.com` in `connect-src`; Task 5's browser pass confirms on the real apps.
2. **`bun dev` HMR** must keep working with the CSP on — Task 1's dev test pins `'unsafe-eval'` and `ws: wss:`; Task 5 checks a live dev server's console.
3. **The Serwist service worker** must still register (`worker-src 'self'`, `manifest-src 'self'`) — Task 5's production run checks `/sw.js` registers without a console error.
4. **An error in the root layout** must still show a page, not a blank screen — Task 4's `global-error.tsx` renders its own `<html>`; Task 3's test proves `StatusPage` needs no providers.
5. **Docker's `/api/health` probe** must keep returning 200 with the headers on — Task 5's `curl -sI …/api/health`.

---

### Task 1: `securityHeaders()` and the `packages/ui` test setup

**Files:**
- Create: `packages/ui/src/lib/security-headers.ts`, `packages/ui/src/lib/security-headers.test.ts`
- Modify: `packages/ui/package.json` (`test` script, `@types/bun` devDependency), root `package.json` (`test:services` filter list)

**Interfaces:**
- Produces:
  - `type CspDirective = "default-src" | "script-src" | "style-src" | "img-src" | "font-src" | "connect-src" | "worker-src" | "manifest-src" | "frame-src" | "frame-ancestors" | "form-action" | "base-uri" | "object-src"`
  - `type SecurityHeaderOptions = { dev?: boolean; csp?: Partial<Record<CspDirective, string[]>> }`
  - `securityHeaders(options?: SecurityHeaderOptions): Record<string, string>`
  - `bun run --filter @repo/ui test`

- [ ] **Step 1: Write the failing test**

`packages/ui/src/lib/security-headers.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { securityHeaders } from "./security-headers"

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.iconify.design https://raw.githubusercontent.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ")

const csp = (headers: Record<string, string>) => headers["Content-Security-Policy"] ?? ""
const directive = (policy: string, name: string) =>
  policy.split("; ").find((d) => d.startsWith(`${name} `) || d === name)

describe("securityHeaders (production)", () => {
  const headers = securityHeaders()

  test("is exactly the documented header set", () => {
    expect(headers).toEqual({
      "Content-Security-Policy": PRODUCTION_CSP,
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    })
  })

  test("never allows eval and always upgrades", () => {
    expect(csp(headers)).not.toContain("unsafe-eval")
    expect(csp(headers)).toContain("upgrade-insecure-requests")
  })

  test("lists every directive once", () => {
    const names = csp(headers)
      .split("; ")
      .map((d) => d.split(" ")[0])
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("securityHeaders (dev)", () => {
  const headers = securityHeaders({ dev: true })

  test("adds what Next HMR needs and nothing else", () => {
    expect(directive(csp(headers), "script-src")).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    expect(directive(csp(headers), "connect-src")).toBe(
      "connect-src 'self' https://api.iconify.design https://raw.githubusercontent.com ws: wss:"
    )
    expect(csp(headers)).not.toContain("upgrade-insecure-requests")
    expect(headers["Strict-Transport-Security"]).toBeUndefined()
    const { "Content-Security-Policy": _csp, ...rest } = headers
    const { "Content-Security-Policy": _p, "Strict-Transport-Security": _h, ...prodRest } = securityHeaders()
    expect(rest).toEqual(prodRest)
  })
})

describe("securityHeaders({ csp })", () => {
  test("appends to an existing directive and leaves the others alone", () => {
    const headers = securityHeaders({ csp: { "connect-src": ["https://api.example.com"] } })
    expect(directive(csp(headers), "connect-src")).toBe(
      "connect-src 'self' https://api.iconify.design https://raw.githubusercontent.com https://api.example.com"
    )
    expect(directive(csp(headers), "script-src")).toBe("script-src 'self' 'unsafe-inline'")
  })

  test("adds a directive the base policy does not have", () => {
    const headers = securityHeaders({ csp: { "frame-src": ["https://www.youtube.com"] } })
    expect(directive(csp(headers), "frame-src")).toBe("frame-src https://www.youtube.com")
    // New directives join in order, before the trailing upgrade flag.
    expect(csp(headers)).toContain("object-src 'none'; frame-src https://www.youtube.com")
    expect(csp(headers).endsWith("upgrade-insecure-requests")).toBe(true)
  })
})
```

- [ ] **Step 2: Wire the test script and run it to see it fail**

`packages/ui/package.json`: add `"test": "bun test"` to `scripts` and `"@types/bun": "catalog:"` to
`devDependencies` (the file imports `bun:test`, so the workspace declares the types — see
CLAUDE.md's dependency rule 2). Root `package.json` `test:services`: append
`--filter @repo/ui` after `--filter @repo/service-kit`. Run `bun install`.

Run: `bun run --filter @repo/ui test`
Expected: FAIL — `Cannot find module './security-headers'`.

- [ ] **Step 3: Implement**

`packages/ui/src/lib/security-headers.ts`:

```ts
/**
 * The security headers every Next app sends, built in one place. Applied per request by
 * `createSecurityProxy` (./security-proxy) from each app's `src/proxy.ts`.
 */

export type CspDirective =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "worker-src"
  | "manifest-src"
  | "frame-src"
  | "frame-ancestors"
  | "form-action"
  | "base-uri"
  | "object-src"

export type SecurityHeaderOptions = {
  /** Development relaxations for Next HMR; never set in production. */
  dev?: boolean
  /** Extra sources per directive, appended to the base policy. The only extension point. */
  csp?: Partial<Record<CspDirective, string[]>>
}

// Next's hydration scripts are inline, so script-src needs 'unsafe-inline' (or a per-request
// nonce, which would make every page dynamic). 'unsafe-eval' is dev-only: HMR needs it.
const BASE_POLICY: Array<[CspDirective, string[]]> = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", "'unsafe-inline'"]],
  ["style-src", ["'self'", "'unsafe-inline'"]],
  ["img-src", ["'self'", "data:", "blob:", "https:"]],
  ["font-src", ["'self'", "data:"]],
  // Iconify API for icons outside the bundled set; GitHub raw for the bklit choropleth topology.
  ["connect-src", ["'self'", "https://api.iconify.design", "https://raw.githubusercontent.com"]],
  ["worker-src", ["'self'"]],
  ["manifest-src", ["'self'"]],
  ["frame-ancestors", ["'none'"]],
  ["form-action", ["'self'"]],
  ["base-uri", ["'self'"]],
  ["object-src", ["'none'"]],
]

const DEV_EXTRAS: Partial<Record<CspDirective, string[]>> = {
  "script-src": ["'unsafe-eval'"],
  "connect-src": ["ws:", "wss:"],
}

function contentSecurityPolicy(dev: boolean, extras: SecurityHeaderOptions["csp"] = {}): string {
  const policy = new Map<CspDirective, string[]>(BASE_POLICY.map(([name, sources]) => [name, [...sources]]))
  const append = (additions: Partial<Record<CspDirective, string[]>>) => {
    for (const [name, sources] of Object.entries(additions) as Array<[CspDirective, string[]]>) {
      policy.set(name, [...(policy.get(name) ?? []), ...sources])
    }
  }
  if (dev) append(DEV_EXTRAS)
  append(extras)
  const directives = [...policy].map(([name, sources]) => `${name} ${sources.join(" ")}`)
  // The apps run on http://*.localhost in development; upgrading would break them.
  if (!dev) directives.push("upgrade-insecure-requests")
  return directives.join("; ")
}

export function securityHeaders({ dev = false, csp }: SecurityHeaderOptions = {}): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(dev, csp),
    // HSTS is meaningless over plain http and would pin a dev hostname.
    ...(dev ? {} : { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "credentialless",
  }
}
```

- [ ] **Step 4: Run, lint, typecheck**

Run: `bunx biome check --write packages/ui/src/lib package.json packages/ui/package.json && bun run --filter @repo/ui test && bun run --filter @repo/ui typecheck`
Expected: 7 pass; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/security-headers.ts packages/ui/src/lib/security-headers.test.ts packages/ui/package.json package.json bun.lock
git commit -m "feat(ui): one source for every Next app's security headers"
```

---

### Task 2: `createSecurityProxy()` and every app's `proxy.ts`

**Files:**
- Create: `packages/ui/src/lib/security-proxy.ts`, `packages/ui/src/lib/security-proxy.test.ts`
- Create: `apps/{app,auth,account,docs,help,jobs}/src/proxy.ts`
- Rewrite: `apps/www/src/proxy.ts`

**Interfaces:**
- Consumes: `securityHeaders`, `SecurityHeaderOptions` (Task 1).
- Produces: `createSecurityProxy(options?: SecurityHeaderOptions): (request: NextRequest) => NextResponse`.

- [ ] **Step 1: Write the failing test**

`packages/ui/src/lib/security-proxy.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { securityHeaders } from "./security-headers"
import { createSecurityProxy } from "./security-proxy"

const request = () => new NextRequest("https://app.example.com/notes")

describe("createSecurityProxy", () => {
  test("sets every header on the pass-through response", () => {
    const response = createSecurityProxy({ dev: false })(request())
    for (const [name, value] of Object.entries(securityHeaders({ dev: false }))) {
      expect(response.headers.get(name)).toBe(value)
    }
    // NextResponse.next() marks the response as a pass-through.
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  test("passes csp extras through", () => {
    const response = createSecurityProxy({ dev: false, csp: { "frame-src": ["https://x.example"] } })(
      request()
    )
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-src https://x.example")
  })

  test("defaults dev from NODE_ENV", () => {
    // bun test sets NODE_ENV=test, which is not production: the dev policy applies.
    const response = createSecurityProxy()(request())
    expect(response.headers.get("Content-Security-Policy")).toContain("'unsafe-eval'")
    expect(response.headers.get("Strict-Transport-Security")).toBeNull()
  })
})
```

Run: `bun run --filter @repo/ui test src/lib/security-proxy.test.ts`
Expected: FAIL — `Cannot find module './security-proxy'`. (If instead `next/server` itself fails
to load under Bun, report it: the fallback is to keep this file's tests to the pure function and
verify the proxy in Task 5's curl checks. Do not stub `next/server`.)

- [ ] **Step 2: Implement**

`packages/ui/src/lib/security-proxy.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server"
import { type SecurityHeaderOptions, securityHeaders } from "./security-headers"

/**
 * A Next `proxy` that adds the shared security headers to every matched response. Each app's
 * `src/proxy.ts` exports the result plus a literal `config.matcher`.
 */
export function createSecurityProxy({
  dev = process.env.NODE_ENV !== "production",
  csp,
}: SecurityHeaderOptions = {}) {
  const headers = securityHeaders({ dev, csp })
  return (_request: NextRequest): NextResponse => {
    const response = NextResponse.next()
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
    return response
  }
}
```

- [ ] **Step 3: The per-app file**

Write this exact content to `apps/www/src/proxy.ts` (replacing it) and to
`apps/{app,auth,account,docs,help,jobs}/src/proxy.ts` (new):

```ts
import { createSecurityProxy } from "@repo/ui/lib/security-proxy"

export const proxy = createSecurityProxy()

// Skip Next's own assets and static files; the policy is for documents and API routes.
// Next reads the matcher statically, so it is a literal here rather than a shared constant.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|js|css|map|txt|webmanifest)$).*)",
  ],
}
```

Confirm with `for a in www app auth account docs help jobs; do md5 -q apps/$a/src/proxy.ts; done | sort -u | wc -l` → `1`.

- [ ] **Step 4: Run, lint, typecheck, and a real dev server**

Run: `bunx biome check --write packages/ui/src/lib apps/*/src/proxy.ts && bun run --filter @repo/ui test && bun run --filter @repo/ui typecheck && bun run typecheck`
Expected: 10 pass; both typechecks exit 0.

Then one live check that Next accepts the file: `bun --filter @repo/docs dev` in the background,
`curl -sI http://docs.localhost:3004/ | grep -i "content-security-policy"` shows the **dev**
policy (contains `'unsafe-eval'` and `ws: wss:`), `curl -sI http://docs.localhost:3004/ | grep -ic "strict-transport"` → `0`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/security-proxy.ts packages/ui/src/lib/security-proxy.test.ts apps/*/src/proxy.ts
git commit -m "feat(apps): apply the shared security headers from a six-line proxy in every Next app"
```

---

### Task 3: `StatusPage` and `PageLoading` blocks, tests and stories

**Files:**
- Create: `packages/ui/src/blocks/status-page.tsx`, `packages/ui/src/blocks/page-loading.tsx`
- Create: `packages/ui/src/blocks/status-page.test.tsx`, `packages/ui/src/blocks/page-loading.test.tsx`
- Create: `apps/story/stories/StatusPage.stories.tsx`, `apps/story/stories/PageLoading.stories.tsx`

**Interfaces:**
- Produces:
  - `StatusPage(props: React.ComponentProps<"section"> & { code?: string; title: string; description: string })` — `children` is the actions row
  - `PageLoading(props: React.ComponentProps<"div"> & { label?: string })`

- [ ] **Step 1: Write the failing tests**

`packages/ui/src/blocks/status-page.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { StatusPage } from "./status-page"

describe("StatusPage", () => {
  test("renders code, title, description and the actions slot", () => {
    const html = renderToStaticMarkup(
      <StatusPage code="404" title="Page not found" description="Nothing here.">
        <a href="/">Back to home</a>
      </StatusPage>
    )
    expect(html).toContain(">404<")
    expect(html).toContain("<h1")
    expect(html).toContain("Page not found")
    expect(html).toContain("Nothing here.")
    expect(html).toContain('<a href="/">Back to home</a>')
  })

  test("omits the code and actions row when not given", () => {
    const html = renderToStaticMarkup(<StatusPage title="Oops" description="Sorry." />)
    expect(html).not.toContain("font-mono")
    expect(html).not.toContain("data-slot=\"status-page-actions\"")
  })

  test("merges className onto the section", () => {
    const html = renderToStaticMarkup(<StatusPage title="T" description="D" className="extra" />)
    expect(html).toMatch(/<section[^>]*class="[^"]*extra[^"]*"/)
  })
})
```

`packages/ui/src/blocks/page-loading.test.tsx`:

```tsx
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PageLoading } from "./page-loading"

describe("PageLoading", () => {
  test("is one live status region with a hidden label", () => {
    const html = renderToStaticMarkup(<PageLoading />)
    expect(html.match(/role="status"/g)?.length).toBe(1)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('<span class="sr-only">Loading…</span>')
    expect(html).toContain("<svg")
  })

  test("takes a custom label", () => {
    expect(renderToStaticMarkup(<PageLoading label="Fetching notes…" />)).toContain("Fetching notes…")
  })
})
```

Run: `bun run --filter @repo/ui test src/blocks`
Expected: FAIL — modules not found.

- [ ] **Step 2: Implement the blocks**

`packages/ui/src/blocks/status-page.tsx`:

```tsx
import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

type StatusPageProps = React.ComponentProps<"section"> & {
  /** Short status code shown above the title, e.g. "404". */
  code?: string
  title: string
  description: string
}

/**
 * A full-height status message: not found, error, maintenance. Content-agnostic; the app's
 * `not-found.tsx` / `error.tsx` supply the copy and the actions (as children). No client hooks,
 * so it renders from server and client components alike, including `global-error.tsx`.
 */
export function StatusPage({
  code,
  title,
  description,
  children,
  className,
  ...props
}: StatusPageProps) {
  return (
    <section
      data-slot="status-page"
      className={cn(
        "container flex min-h-[70vh] flex-col items-center justify-center py-24 text-center",
        className
      )}
      {...props}
    >
      <div className="max-w-xl">
        {code && (
          <p className="text-muted-foreground mb-4 font-mono text-sm tracking-widest">{code}</p>
        )}
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="text-muted-foreground mb-8 text-lg text-balance">{description}</p>
        {children && (
          <div
            data-slot="status-page-actions"
            className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
```

`packages/ui/src/blocks/page-loading.tsx`:

```tsx
import { Spinner } from "@repo/ui/components/spinner"
import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

type PageLoadingProps = React.ComponentProps<"div"> & {
  /** Read by screen readers; the spinner itself is decorative. */
  label?: string
}

/** What a route segment shows while it suspends: the app's `loading.tsx` renders this. */
export function PageLoading({ label = "Loading…", className, ...props }: PageLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="page-loading"
      className={cn("flex min-h-[50vh] items-center justify-center", className)}
      {...props}
    >
      {/* Spinner sets its own role/label; the wrapper is the single status region. */}
      <Spinner className="size-6" role="presentation" aria-label={undefined} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
```

- [ ] **Step 3: Stories**

`apps/story/stories/StatusPage.stories.tsx`:

```tsx
import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/StatusPage",
  component: StatusPage,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof StatusPage>

export default meta
type Story = StoryObj<typeof meta>

export const NotFound: Story = {
  args: {
    code: "404",
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
  },
  render: (args) => (
    <StatusPage {...args}>
      <Button asChild size="lg">
        <a href="/">Back to home</a>
      </Button>
    </StatusPage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Page not found")
    await expect(canvas.getByRole("link", { name: "Back to home" })).toBeVisible()
  },
}

export const ServerError: Story = {
  args: {
    code: "500",
    title: "Something went wrong",
    description: "An unexpected error occurred. Try again, or head back home.",
  },
  render: (args) => (
    <StatusPage {...args}>
      <Button size="lg">Try again</Button>
      <Button asChild size="lg" variant="outline">
        <a href="/">Back to home</a>
      </Button>
    </StatusPage>
  ),
}

export const WithReference: Story = {
  args: {
    code: "500",
    title: "Something went wrong",
    description: "An unexpected error occurred. Try again, or head back home. Reference: 3f9a1c2b",
  },
}
```

`apps/story/stories/PageLoading.stories.tsx`:

```tsx
import { PageLoading } from "@repo/ui/blocks/page-loading"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/PageLoading",
  component: PageLoading,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof PageLoading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Loading…")
  },
}

export const CustomLabel: Story = {
  args: { label: "Fetching notes…" },
}
```

- [ ] **Step 4: Run, lint, typecheck, and the two stories**

Run: `bunx biome check --write packages/ui/src/blocks apps/story/stories/StatusPage.stories.tsx apps/story/stories/PageLoading.stories.tsx && bun run --filter @repo/ui test && bun run --filter @repo/ui typecheck`
Expected: 15 pass; typecheck exit 0.

Run the two stories' interaction tests (Storybook's Vitest runner, as CI does):
`cd apps/story && bunx vitest run stories/StatusPage.stories.tsx stories/PageLoading.stories.tsx`
Expected: the `play` functions pass (5 stories).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/blocks/status-page.tsx packages/ui/src/blocks/page-loading.tsx packages/ui/src/blocks/*.test.tsx apps/story/stories/StatusPage.stories.tsx apps/story/stories/PageLoading.stories.tsx
git commit -m "feat(ui): StatusPage and PageLoading blocks for the apps' error, 404 and loading routes"
```

---

### Task 4: The four route files in every app

**Files:**
- Create in each of `apps/{app,auth,account,docs,help,jobs}/src/app/`: `not-found.tsx`, `error.tsx`, `global-error.tsx`, `loading.tsx`
- Create in `apps/www/src/app/`: `error.tsx`, `global-error.tsx`, `loading.tsx`; rewrite `not-found.tsx`

**Interfaces:**
- Consumes: `StatusPage`, `PageLoading` (Task 3); `Button` from `@repo/ui/components/button`.

- [ ] **Step 1: The shared content (identical in all seven apps)**

`src/app/not-found.tsx`:

```tsx
import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import Link from "next/link"

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
    >
      <Button asChild size="lg">
        <Link href="/">Back to home</Link>
      </Button>
    </StatusPage>
  )
}
```

`src/app/error.tsx`:

```tsx
"use client"

import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import { useEffect } from "react"

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

/** The segment error boundary. Also rendered by global-error.tsx inside its own <html>. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Error tracking is a later phase; until then the console is the record.
    console.error(error)
  }, [error])

  const reference = error.digest ? ` Reference: ${error.digest}` : ""
  return (
    <StatusPage
      code="500"
      title="Something went wrong"
      description={`An unexpected error occurred. Try again, or head back home.${reference}`}
    >
      <Button size="lg" onClick={reset}>
        Try again
      </Button>
      <Button asChild size="lg" variant="outline">
        {/* A plain anchor: global-error renders outside the router, where <Link> is unavailable. */}
        <a href="/">Back to home</a>
      </Button>
    </StatusPage>
  )
}
```

`src/app/global-error.tsx`:

```tsx
"use client"

import "@/styles/globals.css"

import ErrorPage from "./error"

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Replaces the root layout when the layout itself throws, so it owns <html> and <body>. Fonts and
 * the theme provider live in that layout and are not retried here; the default palette is fine
 * for a last-resort page.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorPage error={error} reset={reset} />
      </body>
    </html>
  )
}
```

`src/app/loading.tsx`:

```tsx
import { PageLoading } from "@repo/ui/blocks/page-loading"

export default function Loading() {
  return <PageLoading />
}
```

Write these to the six non-www apps. For `apps/www`, write `error.tsx`, `global-error.tsx` and
`loading.tsx` identically, and rewrite `not-found.tsx` as the same content wrapped in the app's
existing `Background`:

```tsx
import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import Link from "next/link"

import { Background } from "@/components/background"

export default function NotFound() {
  return (
    <Background>
      <StatusPage
        code="404"
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
      >
        <Button asChild size="lg">
          <Link href="/">Back to home</Link>
        </Button>
      </StatusPage>
    </Background>
  )
}
```

Confirm identity: `for f in error global-error loading; do for a in www app auth account docs help jobs; do md5 -q apps/$a/src/app/$f.tsx; done | sort -u | wc -l; done` → `1` three times; and `for a in app auth account docs help jobs; do md5 -q apps/$a/src/app/not-found.tsx; done | sort -u | wc -l` → `1`.

- [ ] **Step 2: Lint, typecheck, and see the pages**

Run: `bunx biome check --write apps/*/src/app && bun run typecheck`
Expected: Biome clean; typecheck exit 0 (`app` and `www` are in the gate; the other five compile in Task 5's build).

Run `bun --filter @repo/app dev` in the background, then:
- `curl -s -o /dev/null -w "%{http_code}\n" http://app.localhost:3001/this-does-not-exist` → `404`, and `curl -s http://app.localhost:3001/this-does-not-exist | grep -c "Page not found"` → `1`.
- Add a temporary `apps/app/src/app/boom/page.tsx` containing `export default function Boom(): never { throw new Error("boom") }`, load `http://app.localhost:3001/boom` in a browser (Chrome DevTools tooling is available in this session), confirm the "Something went wrong" page with **Try again** renders, then **delete the file** — it is not committed. `git status` must show no `boom` directory before the commit.
Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add apps/*/src/app/not-found.tsx apps/*/src/app/error.tsx apps/*/src/app/global-error.tsx apps/*/src/app/loading.tsx
git commit -m "feat(apps): branded not-found, error, global-error and loading routes in every Next app"
```

---

### Task 5: Docs, roadmap, and the full verification pass

**Files:**
- Modify: `CLAUDE.md`, `docs/ROADMAP.md`, `apps/www/README.md` (only if it mentions the old proxy)

- [ ] **Step 1: Docs**

`CLAUDE.md` "Design System Single Points" — add after the **Styles** bullet:

```markdown
- **Security headers** — `@repo/ui/lib/security-headers` (the policy, a pure function) and `@repo/ui/lib/security-proxy` (`createSecurityProxy()`), applied by each app's six-line `src/proxy.ts`. The only extension point is the `csp` option (`createSecurityProxy({ csp: { "frame-src": ["https://…"] } })`); never edit a policy in an app. Production has no `'unsafe-eval'`; dev adds what HMR needs.
- **Status pages** — `@repo/ui/blocks/status-page` (`StatusPage`) and `@repo/ui/blocks/page-loading` (`PageLoading`), rendered by each app's `src/app/{not-found,error,global-error,loading}.tsx`. Those four files are identical across apps; change the block, not the files.
```

`CLAUDE.md` "Adding a new subdomain app" — insert a new step 5 and renumber the rest:

```markdown
5. Copy `src/proxy.ts` and `src/app/{not-found,error,global-error,loading}.tsx` from `apps/app` unchanged (security headers and status pages)
```

`docs/ROADMAP.md` Phase 3: tick both remaining items:

```markdown
- [x] Security headers from one place in `@repo/ui`, applied to every Next app; no `unsafe-eval`
- [x] `error.tsx`, `not-found.tsx` and a `loading.tsx` pattern in every Next app
```

`apps/www/README.md`: `grep -n -i "proxy\|security\|csp" apps/www/README.md`; if it describes the
old hand-written proxy, replace that sentence with "Security headers come from
`@repo/ui/lib/security-proxy` via `src/proxy.ts` (see CLAUDE.md, Design System Single Points)."
If nothing matches, leave the file alone.

- [ ] **Step 2: Production headers on a built app**

Run: `bun --filter @repo/app build` then `PORT=3001 HOSTNAME=127.0.0.1 bun --filter @repo/app start` in the background.
- `curl -sI http://127.0.0.1:3001/ | grep -i "^content-security-policy"` — equals the production policy from Global Constraints (no `unsafe-eval`, ends in `upgrade-insecure-requests`).
- `curl -sI http://127.0.0.1:3001/ | grep -ic "^strict-transport-security"` → `1`.
- `curl -sI http://127.0.0.1:3001/api/health | grep -ic "^content-security-policy"` → `1` and its status is `200`.
- `curl -sI http://127.0.0.1:3001/_next/static/chunks/main-app.js 2>/dev/null | head -1` — whatever chunk exists; the point is `curl -sI` on any `_next/static/...` URL shows **no** CSP header (matcher excludes it).
- In a browser (Chrome DevTools tooling): open `http://127.0.0.1:3001/`, `/notes`, `/chat`; the console has **zero** `Content Security Policy` violations, and `navigator.serviceWorker.getRegistrations()` resolves to one registration (Serwist, production only).
Stop the server.

- [ ] **Step 3: Dev pass on all seven**

Run `bun dev` in the background; for each of `www:3000 app:3001 auth:3002 account:3003 docs:3004 help:3005 jobs:3006`:
`curl -sI http://<name>.localhost:<port>/ | grep -i "^content-security-policy" | grep -c "'unsafe-eval'"` → `1`. In the browser open each home page once and confirm zero CSP violations in the console (this is what catches a missed origin). Then `http://www.localhost:3000/nope` renders the 404 page inside `www`'s background. Stop `bun dev`.

- [ ] **Step 4: Full local gate**

Run: `bun run ci`
Expected: exit 0 (Biome, both typechecks, `test:services` now including `@repo/ui`, and the build of every app — which is the compile check for the five apps outside the typecheck gate).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/ROADMAP.md apps/www/README.md
git commit -m "docs: security headers and status pages as design-system single points; roadmap 3c done"
```
