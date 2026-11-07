# Telemetry (Phase 5: error tracking + web vitals destination) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Errors from every app and service, and Core Web Vitals from every page, land in `apps/api` out of the box, show on the `/admin` overview, and forward to Sentry with one env var.

**Architecture:** Browsers report to their own origin (`POST /api/telemetry`, `sendBeacon`); every Next app's route handler stamps the `app` and forwards server-to-server to `telemetry.ingest` on `apps/api`; the Bun services report through the same procedure (`apps/ai`) or write directly (`apps/api`). The api stores errors (upserted per fingerprint-day) and vitals in two tables, prunes on ingest, and — behind a provider seam (`store` | `sentry`) — forwards each *new* error to Sentry's envelope endpoint over `fetch`. No SDK anywhere, no key outside the api, no CSP change.

**Tech Stack:** Bun 1.4 (`Bun.sql` on SQLite + Postgres, `bun test`), oRPC + Zod contract, a new pure-TypeScript workspace `packages/telemetry` (`@repo/telemetry`, entry points `/browser` and `/server`), Next 16 route handlers and client components, `@repo/ui`.

**Spec:** `docs/superpowers/specs/2026-10-04-telemetry-design.md`

**Deviation from the spec, decided while planning:** the browser payload carries **no `app`** and the root layouts set **no `data-app`** — the route handler already overwrites `app` with its configured value, so the browser never needs to know it (and `global-error.tsx` replaces `<html>`, which would have lost the attribute). `BrowserBatchSchema { errors, vitals }` is what browsers send; `TelemetryBatchSchema = BrowserBatch + { app }` is what the api accepts.

## Global Constraints

- One egress: browsers post only to their own origin; `apps/api` is the only thing that talks to Sentry. No SDK in any browser, no DSN outside the api env, no CSP change.
- Provider seam in the api only: `TELEMETRY_PROVIDER=store` (default) | `sentry` (`SENTRY_DSN` required iff `sentry`, at any `NODE_ENV`, parsed at boot; `SENTRY_ENVIRONMENT` optional, default `NODE_ENV`). Vitals never leave the api. Every error is also written to the api log in every mode.
- Consent rule: an event may always carry `app`, `route` (pathname only — no query, no hash), `kind`, `message`, `stack`, `digest` and the metric fields; `userAgent` only when the `consent` cookie is `all`. The api never stores an ip on the telemetry tables; no user id, no cookies, no request bodies.
- Reporting never breaks what it reports on: browser clients swallow every failure; the route answers `204` for anything; the api's own recording is wrapped and cannot throw.
- Caps (`TELEMETRY_LIMITS`): body 8192 bytes, batch 20 errors + 20 vitals, message 500, stack 4000, digest 64, route 200, userAgent 300, navigationType 30. Browser dedupe: same `message + first frame` within 60 s is dropped; at most 10 events per page load. Api limiter `telemetry:<clientId>` 60 per minute. Errors are upserted per `(fingerprint, day)` with a `count`. Retention: errors 30 days, vitals 7 days, pruned on ingest.
- Capture scope: `boundary` (every `error.tsx` / `global-error.tsx` render), `unhandled` (`window.onerror`, `unhandledrejection`; events whose every frame is cross-origin, and `Script error.`, are dropped), `server` (the api's `rpc failed` / `unhandled` log seam and its detached failures; `apps/ai`'s `logUnexpected`). Vitals: CLS, INP, LCP, FCP, TTFB.
- Admin: `admin.telemetry.errors` (24 h window: `distinct`, `total`, top 5 by count) and `admin.telemetry.vitals` (7 d window: per app `samples`, p75 LCP/INP/CLS or null) behind the existing `superadmin` middleware; two cards on `/admin`; empty states exactly `No errors in the last 24 hours.` and `No vitals reported yet.`; thresholds LCP 2500/4000 ms, INP 200/500 ms, CLS 0.1/0.25 with the rating as text, not colour alone.
- The seven apps' `error.tsx` / `global-error.tsx` stay byte-identical; each app's `src/app/api/telemetry/route.ts` differs only in its `app:` literal (like `/api/health`).
- Bun.sql: never interpolate user input into `sql.unsafe`; sequential statements on a transaction-bound `Queries`. Code style: Biome (double quotes, no semicolons, 2 spaces, 100 cols); commit trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A page that throws in a loop (a render error that re-throws on `reset`)** — a person expects one row counting up, not thousands of beacons; pinned in Task 2 (dedupe window + 10-per-page cap test) and Task 1 (upsert `count` test).
2. **A visitor who declined cookies ("necessary only")** — their vitals and errors must still arrive, without a user agent; pinned in Task 2 (`shapeError` / `shapeVital` consent tests).
3. **`apps/docs` / `help` / `jobs` running without `API_URL`** — a static app with no api configured must serve its pages and answer `204` on `/api/telemetry`, never 500 or a crash at boot; pinned in Task 2 (route drops when unconfigured) and Task 4 (build of a static app with the route).
4. **A malicious or buggy page posting 10 MB of "stack"** — the route must answer `204` without forwarding, and the api must refuse an oversize batch with `BAD_REQUEST`; pinned in Task 2 (route size test) and Task 1 (contract caps test).
5. **Sentry down or a wrong DSN** — ingest must still store the row and answer normally; a bad DSN must fail at boot, not at the first error; pinned in Task 3 (adapter timeout test, `parseDsn` test, `createTelemetryProvider` throws on a bad DSN).

---

### Task 1: Contract schemas, migration, queries and `telemetry.ingest` in `apps/api`

**Files:**
- Create: `packages/api-contract/src/telemetry.ts`, `packages/api-contract/src/telemetry.test.ts`
- Modify: `packages/api-contract/src/index.ts` (export + `telemetry.ingest` procedure)
- Create: `apps/api/src/migrations/0012_telemetry.ts`; modify `apps/api/src/migrations/index.ts`, `apps/api/src/migrate.test.ts` (shipped list gains `"0012_telemetry"`)
- Create: `apps/api/src/queries/telemetry.ts`; modify `apps/api/src/db.ts`
- Create: `apps/api/src/telemetry/fingerprint.ts`, `apps/api/src/telemetry/provider.ts`, `apps/api/src/telemetry/store.ts`, `apps/api/src/telemetry/record.ts`, `apps/api/src/telemetry/fingerprint.test.ts`, `apps/api/src/telemetry.test.ts`
- Modify: `apps/api/src/router.ts` (`Context`, `telemetry: { ingest }`), `apps/api/src/server.ts` (`ServerOptions.telemetry?`, `telemetryLimiter?`, context wiring), `apps/api/src/env.ts` (`TELEMETRY_PROVIDER`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`), `apps/api/src/env.test.ts`

**Interfaces:**
- Consumes: `createMemoryRateLimiter`, `detach` (`apps/api/src/mail/mailer.ts`), `ddl.serialId`, `Migration`, the `Context`/`api` pattern in `router.ts`.
- Produces: `@repo/api-contract` — `TELEMETRY_APPS`, `TelemetryAppSchema`/`TelemetryApp`, `ERROR_KINDS`, `ErrorEventSchema`/`ErrorEvent`, `VITAL_NAMES`, `VitalEventSchema`/`VitalEvent`, `BrowserBatchSchema`/`BrowserBatch`, `TelemetryBatchSchema`/`TelemetryBatch`, `TELEMETRY_LIMITS`, `VITAL_THRESHOLDS`, `rateVital(name, value)`, `TelemetryErrorSummarySchema`, `TelemetryErrorsSchema`/`TelemetryErrors`, `TelemetryVitalsSchema`/`TelemetryVitals`, procedure `telemetry.ingest` (`POST /telemetry`, input `TelemetryBatchSchema`, output `void`, errors `TOO_MANY_REQUESTS`). `apps/api` — `db.telemetry` (`upsertError`, `insertVitals`, `errorTotals`, `errorSummary`, `vitalSamples`, `prune`), `ErrorRow`, `TelemetryProvider { kind; onNewError(row) }`, `storeProvider`, `fingerprint(app, kind, message, stack)`, `recordBatch(deps, batch)`, `recordServerError(deps, app, error, route?)` where `deps = { db, provider, log }`; `Context.telemetry`, `Context.telemetryLimiter`; `ServerOptions.telemetry?: TelemetryProvider`, `telemetryLimiter?: RateLimiter`; `createServer` returns `telemetry` too.

- [ ] **Step 1: Contract schemas — test first**

Create `packages/api-contract/src/telemetry.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import {
  BrowserBatchSchema,
  rateVital,
  TELEMETRY_LIMITS,
  TelemetryBatchSchema,
} from "./telemetry"

describe("telemetry schemas", () => {
  test("a browser batch has no app; the api batch requires one", () => {
    const browser = BrowserBatchSchema.parse({
      errors: [{ kind: "boundary", message: "boom" }],
      vitals: [{ name: "LCP", value: 1200, rating: "good", route: "/notes" }],
    })
    expect(browser.errors[0]).toEqual({ kind: "boundary", message: "boom" })
    expect(TelemetryBatchSchema.safeParse(browser).success).toBe(false)
    expect(TelemetryBatchSchema.parse({ ...browser, app: "app" }).app).toBe("app")
    expect(TelemetryBatchSchema.safeParse({ ...browser, app: "evil" }).success).toBe(false)
  })

  test("caps: message, stack, batch size, value sign", () => {
    const long = (n: number) => "x".repeat(n)
    expect(
      BrowserBatchSchema.safeParse({ errors: [{ kind: "server", message: long(501) }], vitals: [] })
        .success
    ).toBe(false)
    expect(
      BrowserBatchSchema.safeParse({
        errors: [{ kind: "server", message: "m", stack: long(TELEMETRY_LIMITS.stack + 1) }],
        vitals: [],
      }).success
    ).toBe(false)
    expect(
      BrowserBatchSchema.safeParse({
        errors: Array.from({ length: TELEMETRY_LIMITS.batch + 1 }, () => ({
          kind: "server",
          message: "m",
        })),
        vitals: [],
      }).success
    ).toBe(false)
    expect(
      BrowserBatchSchema.safeParse({
        errors: [],
        vitals: [{ name: "CLS", value: -1, rating: "good", route: "/" }],
      }).success
    ).toBe(false)
  })

  test("rateVital follows the web-vitals thresholds", () => {
    expect(rateVital("LCP", 2500)).toBe("good")
    expect(rateVital("LCP", 2501)).toBe("needs-improvement")
    expect(rateVital("LCP", 4001)).toBe("poor")
    expect(rateVital("INP", 200)).toBe("good")
    expect(rateVital("INP", 500)).toBe("needs-improvement")
    expect(rateVital("CLS", 0.1)).toBe("good")
    expect(rateVital("CLS", 0.26)).toBe("poor")
  })
})
```

Run `cd packages/api-contract && bun test src/telemetry.test.ts` — FAIL (module missing).

Create `packages/api-contract/src/telemetry.ts`:

```ts
import { z } from "zod"

/** Where an event came from: the seven Next apps and the two Bun services. */
export const TELEMETRY_APPS = [
  "www",
  "app",
  "auth",
  "account",
  "docs",
  "help",
  "jobs",
  "api",
  "ai",
] as const
export const TelemetryAppSchema = z.enum(TELEMETRY_APPS)
export type TelemetryApp = z.infer<typeof TelemetryAppSchema>

/** Size caps, shared by the browser client (truncate), the route (reject) and the api (reject). */
export const TELEMETRY_LIMITS = {
  bodyBytes: 8192,
  batch: 20,
  message: 500,
  stack: 4000,
  digest: 64,
  route: 200,
  userAgent: 300,
  navigationType: 30,
} as const

export const ERROR_KINDS = ["boundary", "unhandled", "server"] as const
export const ErrorEventSchema = z.object({
  kind: z.enum(ERROR_KINDS),
  message: z.string().min(1).max(TELEMETRY_LIMITS.message),
  stack: z.string().max(TELEMETRY_LIMITS.stack).optional(),
  digest: z.string().max(TELEMETRY_LIMITS.digest).optional(),
  route: z.string().max(TELEMETRY_LIMITS.route).optional(),
  /** Only present when the visitor consented to "all" (see the consent rule). */
  userAgent: z.string().max(TELEMETRY_LIMITS.userAgent).optional(),
})
export type ErrorEvent = z.infer<typeof ErrorEventSchema>

export const VITAL_NAMES = ["CLS", "INP", "LCP", "FCP", "TTFB"] as const
export const VitalRatingSchema = z.enum(["good", "needs-improvement", "poor"])
export const VitalEventSchema = z.object({
  name: z.enum(VITAL_NAMES),
  value: z.number().min(0),
  rating: VitalRatingSchema,
  navigationType: z.string().max(TELEMETRY_LIMITS.navigationType).optional(),
  route: z.string().max(TELEMETRY_LIMITS.route),
})
export type VitalEvent = z.infer<typeof VitalEventSchema>

/** What a browser posts to its own app's /api/telemetry: the route stamps the app. */
export const BrowserBatchSchema = z.object({
  errors: z.array(ErrorEventSchema).max(TELEMETRY_LIMITS.batch),
  vitals: z.array(VitalEventSchema).max(TELEMETRY_LIMITS.batch),
})
export type BrowserBatch = z.infer<typeof BrowserBatchSchema>
/** What the api accepts: the same, from a known app. */
export const TelemetryBatchSchema = BrowserBatchSchema.extend({ app: TelemetryAppSchema })
export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>

/** web.dev thresholds: [good ≤, needs-improvement ≤]; above is poor. */
export const VITAL_THRESHOLDS: Record<"LCP" | "INP" | "CLS", readonly [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
}
export function rateVital(name: keyof typeof VITAL_THRESHOLDS, value: number) {
  const [good, ok] = VITAL_THRESHOLDS[name]
  return value <= good ? "good" : value <= ok ? "needs-improvement" : "poor"
}

export const TelemetryErrorSummarySchema = z.object({
  fingerprint: z.string(),
  app: TelemetryAppSchema,
  kind: z.enum(ERROR_KINDS),
  message: z.string(),
  route: z.string().nullable(),
  digest: z.string().nullable(),
  count: z.number().int(),
  firstSeen: z.iso.datetime(),
  lastSeen: z.iso.datetime(),
})
export const TelemetryErrorsSchema = z.object({
  window: z.literal("24h"),
  distinct: z.number().int(),
  total: z.number().int(),
  top: z.array(TelemetryErrorSummarySchema),
})
export type TelemetryErrors = z.infer<typeof TelemetryErrorsSchema>

export const TelemetryVitalsSchema = z.object({
  window: z.literal("7d"),
  apps: z.array(
    z.object({
      app: TelemetryAppSchema,
      samples: z.number().int(),
      lcp: z.number().nullable(),
      inp: z.number().nullable(),
      cls: z.number().nullable(),
    })
  ),
})
export type TelemetryVitals = z.infer<typeof TelemetryVitalsSchema>
```

In `packages/api-contract/src/index.ts`: `export * from "./telemetry"` (alphabetical, after `./note`… keep the existing order: it goes between `./note` and `./waitlist`), import `TelemetryBatchSchema`, and add to `contract` after `waitlist`:

```ts
  // Error and web-vitals events from the apps and services (see packages/telemetry). Service token
  // only, no session: the Next apps' /api/telemetry routes forward what their browsers send.
  telemetry: {
    ingest: oc
      .route({ method: "POST", path: "/telemetry", summary: "Record errors and web vitals" })
      .errors({
        TOO_MANY_REQUESTS: { message: "Too many telemetry events, try again later" },
      })
      .input(TelemetryBatchSchema)
      .output(z.void()),
  },
```

Run the contract test — PASS. (`bun run --filter @repo/api typecheck` is now red until Step 6.)

- [ ] **Step 2: Env**

`apps/api/src/env.ts`, add to `EnvSchema` after `SUPERADMIN_EMAILS`:

```ts
  // Telemetry: errors and vitals always land in the api's tables; sentry also forwards errors.
  TELEMETRY_PROVIDER: optionalString
    .pipe(z.enum(["store", "sentry"]).optional())
    .transform((value) => value ?? "store"),
  SENTRY_DSN: optionalString,
  SENTRY_ENVIRONMENT: optionalString,
```

In `loadEnv`, after the Stripe check:

```ts
  if (env.TELEMETRY_PROVIDER === "sentry" && !env.SENTRY_DSN) {
    throw new Error("TELEMETRY_PROVIDER=sentry needs SENTRY_DSN")
  }
```

Add to `apps/api/src/env.test.ts`:

```ts
test("TELEMETRY_PROVIDER defaults to store; sentry needs SENTRY_DSN", () => {
  expect(loadEnv({ NODE_ENV: "test" }).TELEMETRY_PROVIDER).toBe("store")
  expect(() => loadEnv({ NODE_ENV: "test", TELEMETRY_PROVIDER: "sentry" })).toThrow(
    "TELEMETRY_PROVIDER=sentry needs SENTRY_DSN"
  )
  const env = loadEnv({
    NODE_ENV: "test",
    TELEMETRY_PROVIDER: "sentry",
    SENTRY_DSN: "https://abc@o1.ingest.sentry.io/42",
  })
  expect(env.SENTRY_DSN).toBe("https://abc@o1.ingest.sentry.io/42")
})
```

- [ ] **Step 3: Migration `0012_telemetry`**

```ts
import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Errors are one row per (fingerprint, day) with a count; vitals are one row per sample. Both are
// pruned on ingest (30 / 7 days), so neither needs a retention job.
const telemetry: Migration = {
  name: "0012_telemetry",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE telemetry_errors (
        id ${ddl.serialId(dialect)},
        fingerprint TEXT NOT NULL,
        day TEXT NOT NULL,
        app TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('boundary', 'unhandled', 'server')),
        message TEXT NOT NULL,
        stack TEXT,
        digest TEXT,
        route TEXT,
        user_agent TEXT,
        count INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        UNIQUE (fingerprint, day)
      )
    `)
    await sql.unsafe("CREATE INDEX telemetry_errors_last_seen ON telemetry_errors (last_seen)")
    await sql.unsafe(`
      CREATE TABLE telemetry_vitals (
        id ${ddl.serialId(dialect)},
        app TEXT NOT NULL,
        route TEXT NOT NULL,
        name TEXT NOT NULL CHECK (name IN ('CLS', 'INP', 'LCP', 'FCP', 'TTFB')),
        value REAL NOT NULL,
        rating TEXT NOT NULL,
        navigation_type TEXT,
        at TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX telemetry_vitals_app_name_at ON telemetry_vitals (app, name, at)")
  },
}

export default telemetry
```

Register it in `migrations/index.ts` and append `"0012_telemetry"` to the shipped list in `migrate.test.ts`.

- [ ] **Step 4: Queries**

Create `apps/api/src/queries/telemetry.ts`:

```ts
import type { ErrorEvent, TelemetryApp, VitalEvent } from "@repo/api-contract"
import type { SQL } from "bun"

export type ErrorRow = {
  id: number
  fingerprint: string
  day: string
  app: TelemetryApp
  kind: ErrorEvent["kind"]
  message: string
  stack: string | null
  digest: string | null
  route: string | null
  user_agent: string | null
  count: number | string
  first_seen: string
  last_seen: string
}
export type ErrorSummaryRow = {
  fingerprint: string
  app: TelemetryApp
  kind: ErrorEvent["kind"]
  message: string
  route: string | null
  digest: string | null
  count: number | string
  first_seen: string
  last_seen: string
}
export type VitalSampleRow = { app: TelemetryApp; name: VitalEvent["name"]; value: number | string }

export function telemetryQueries(sql: SQL) {
  return {
    /**
     * One row per fingerprint and UTC day: a repeat counts up and moves `last_seen`. Returns the
     * row and whether this call created it (the provider forwards only new rows).
     */
    async upsertError(input: {
      fingerprint: string
      app: TelemetryApp
      event: ErrorEvent
      now: string
    }): Promise<{ row: ErrorRow; created: boolean }> {
      const day = input.now.slice(0, 10)
      const e = input.event
      const [row]: ErrorRow[] = await sql`
        INSERT INTO telemetry_errors (fingerprint, day, app, kind, message, stack, digest, route, user_agent, count, first_seen, last_seen)
        VALUES (${input.fingerprint}, ${day}, ${input.app}, ${e.kind}, ${e.message}, ${e.stack ?? null}, ${e.digest ?? null}, ${e.route ?? null}, ${e.userAgent ?? null}, 1, ${input.now}, ${input.now})
        ON CONFLICT (fingerprint, day) DO UPDATE
          SET count = telemetry_errors.count + 1, last_seen = excluded.last_seen
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return { row, created: Number(row.count) === 1 }
    },

    async insertVitals(app: TelemetryApp, vitals: VitalEvent[], now: string): Promise<void> {
      // Sequential: this may run on a shared connection and the batch is at most 20 rows.
      for (const v of vitals) {
        await sql`
          INSERT INTO telemetry_vitals (app, route, name, value, rating, navigation_type, at)
          VALUES (${app}, ${v.route}, ${v.name}, ${v.value}, ${v.rating}, ${v.navigationType ?? null}, ${now})
        `
      }
    },

    async errorTotals(since: string): Promise<{ distinct: number; total: number }> {
      const [row]: { distinct_n: number | string; total: number | string | null }[] = await sql`
        SELECT COUNT(DISTINCT fingerprint) AS distinct_n, SUM(count) AS total
        FROM telemetry_errors WHERE last_seen >= ${since}
      `
      return { distinct: Number(row?.distinct_n ?? 0), total: Number(row?.total ?? 0) }
    },

    /** The busiest fingerprints since `since`, each with its latest message/route/digest. */
    async errorSummary(since: string, limit: number): Promise<ErrorSummaryRow[]> {
      return sql`
        SELECT e.fingerprint, e.app, e.kind, e.message, e.route, e.digest,
          t.count, t.first_seen, t.last_seen
        FROM (
          SELECT fingerprint, SUM(count) AS count, MIN(first_seen) AS first_seen, MAX(last_seen) AS last_seen
          FROM telemetry_errors WHERE last_seen >= ${since}
          GROUP BY fingerprint ORDER BY SUM(count) DESC, MAX(last_seen) DESC LIMIT ${limit}
        ) t
        JOIN telemetry_errors e ON e.fingerprint = t.fingerprint AND e.last_seen = t.last_seen
        ORDER BY t.count DESC, t.last_seen DESC
      `
    },

    /** Every LCP/INP/CLS sample since `since`; the p75 is picked in JS (no percentile on SQLite). */
    async vitalSamples(since: string): Promise<VitalSampleRow[]> {
      return sql`
        SELECT app, name, value FROM telemetry_vitals
        WHERE at >= ${since} AND name IN ('LCP', 'INP', 'CLS')
        ORDER BY app, name, value
      `
    },

    async prune(errorsBefore: string, vitalsBefore: string): Promise<void> {
      await sql`DELETE FROM telemetry_errors WHERE last_seen < ${errorsBefore}`
      await sql`DELETE FROM telemetry_vitals WHERE at < ${vitalsBefore}`
    },
  }
}
```

Register `telemetry: telemetryQueries(sql)` in `apps/api/src/db.ts`.

- [ ] **Step 5: Fingerprint, provider seam, record helpers — unit test first**

Create `apps/api/src/telemetry/fingerprint.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { fingerprint, firstFrame, normaliseMessage } from "./fingerprint"

describe("fingerprint", () => {
  test("normalises digits and hex runs so ids and addresses do not split a group", () => {
    expect(normaliseMessage("Note 42 not found (0x1f3a9c)")).toBe("Note # not found (#)")
    expect(normaliseMessage("Request 8f3c2a9b-11d4 failed after 1500ms")).toBe(
      "Request # failed after #ms"
    )
  })
  test("first frame strips the query string and column noise", () => {
    const stack = "Error: boom\n    at render (http://app.brand.localhost:3001/_next/static/chunks/app.js?v=12:10:5)\n    at other (x.js:1:1)"
    expect(firstFrame(stack)).toBe("render (http://app.brand.localhost:3001/_next/static/chunks/app.js)")
    expect(firstFrame(undefined)).toBe("")
  })
  test("is stable across runs and distinct across app, kind and message", () => {
    const a = fingerprint("app", "boundary", "Note 1 missing", "Error\n    at f (a.js:1:1)")
    expect(a).toBe(fingerprint("app", "boundary", "Note 2 missing", "Error\n    at f (a.js:9:9)"))
    expect(a).not.toBe(fingerprint("www", "boundary", "Note 1 missing", "Error\n    at f (a.js:1:1)"))
    expect(a).not.toBe(fingerprint("app", "unhandled", "Note 1 missing", "Error\n    at f (a.js:1:1)"))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

Run `cd apps/api && bun test src/telemetry/fingerprint.test.ts` — FAIL.

Create `apps/api/src/telemetry/fingerprint.ts`:

```ts
/** Digits and hex runs become `#`, so "Note 42" and "Note 43" are one group. */
export const normaliseMessage = (message: string) =>
  message.replace(/0x[0-9a-f]+|[0-9a-f]{8,}(?:-[0-9a-f]{4,})*|\d+/gi, "#")

/** The first `at …` frame, without `?query` and `:line:col`, or "" when there is none. */
export function firstFrame(stack: string | undefined): string {
  const line = stack?.split("\n").find((l) => /^\s*at\s/.test(l))
  if (!line) return ""
  return line
    .trim()
    .replace(/^at\s+/, "")
    .replace(/\?[^):\s]*/g, "")
    .replace(/:\d+:\d+(?=\)?$)/, "")
}

export function fingerprint(app: string, kind: string, message: string, stack?: string): string {
  const key = [app, kind, normaliseMessage(message), firstFrame(stack)].join("|")
  return new Bun.CryptoHasher("sha256").update(key).digest("hex")
}
```

Run — PASS (adjust the expected `normaliseMessage` strings only if the regex produces an equivalent but differently spaced result; the intent is digits/hex → `#`).

Create `apps/api/src/telemetry/provider.ts`:

```ts
import type { ErrorRow } from "../queries/telemetry"

/** Where new errors go besides the tables. `store` is the keyless default; `sentry` forwards. */
export type TelemetryProvider = {
  kind: "store" | "sentry"
  /** Called once per new (fingerprint, day) row, detached from the request. Must not throw. */
  onNewError(row: ErrorRow): Promise<void>
}
```

`apps/api/src/telemetry/store.ts`:

```ts
import type { TelemetryProvider } from "./provider"

export const storeProvider: TelemetryProvider = { kind: "store", onNewError: async () => {} }
```

`apps/api/src/telemetry/record.ts`:

```ts
import type { ErrorEvent, TelemetryApp, TelemetryBatch } from "@repo/api-contract"
import type { Db } from "../db"
import { detach } from "../mail/mailer"
import { fingerprint } from "./fingerprint"
import type { TelemetryProvider } from "./provider"

export const ERROR_RETENTION_MS = 30 * 24 * 60 * 60_000
export const VITAL_RETENTION_MS = 7 * 24 * 60 * 60_000

export type RecordDeps = {
  db: Pick<Db, "telemetry">
  provider: TelemetryProvider
  log: (message: string, error: unknown) => void
}

/** Writes a batch; new error rows go to the provider and the tables are pruned, both detached. */
export async function recordBatch(deps: RecordDeps, batch: TelemetryBatch): Promise<void> {
  const now = new Date().toISOString()
  const created = []
  for (const event of batch.errors) {
    const result = await deps.db.telemetry.upsertError({
      fingerprint: fingerprint(batch.app, event.kind, event.message, event.stack),
      app: batch.app,
      event,
      now,
    })
    if (result.created) created.push(result.row)
  }
  if (batch.vitals.length > 0) await deps.db.telemetry.insertVitals(batch.app, batch.vitals, now)
  for (const row of created) {
    detach(
      () => deps.provider.onNewError(row),
      (error) => deps.log("telemetry forward failed", error)
    )
  }
  const t = Date.parse(now)
  detach(
    () =>
      deps.db.telemetry.prune(
        new Date(t - ERROR_RETENTION_MS).toISOString(),
        new Date(t - VITAL_RETENTION_MS).toISOString()
      ),
    (error) => deps.log("telemetry prune failed", error)
  )
}

/** Turns a thrown value into a `server` event. */
export function toErrorEvent(error: unknown, route?: string): ErrorEvent {
  const e = error instanceof Error ? error : new Error(String(error))
  return {
    kind: "server",
    message: (e.message || e.name || "Error").slice(0, 500),
    stack: e.stack?.slice(0, 4000),
    route: route?.slice(0, 200),
  }
}

/**
 * For the services' own failures: never throws and never awaits on the caller's path, so a
 * telemetry problem cannot turn a 500 into a crash.
 */
export function recordServerError(
  deps: RecordDeps,
  app: TelemetryApp,
  error: unknown,
  route?: string
): void {
  detach(
    () => recordBatch(deps, { app, errors: [toErrorEvent(error, route)], vitals: [] }),
    (failure) => deps.log("telemetry record failed", failure)
  )
}
```

- [ ] **Step 6: Router, server, wiring**

`router.ts` — `Context` gains:

```ts
  /** Where new errors go besides the tables (store = nowhere else; sentry = forwarded). */
  telemetry: TelemetryProvider
  /** Throttles telemetry batches per calling client (the Next routes key it per browser). */
  telemetryLimiter: RateLimiter
```

(`import type { TelemetryProvider } from "./telemetry/provider"`, `import { recordBatch } from "./telemetry/record"`.) Add after `waitlist`:

```ts
  telemetry: {
    // The route handlers already stamped `app` and keyed the client id per browser; here the
    // limiter is the defence against a page that floods its own app.
    ingest: api.telemetry.ingest.handler(async ({ input, context, errors }) => {
      const limit = await context.telemetryLimiter.hit(`telemetry:${context.clientId ?? "unknown"}`)
      if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
      await recordBatch(
        { db: context.db, provider: context.telemetry, log: context.log },
        input
      )
    }),
  },
```

`server.ts` — `ServerOptions`:

```ts
  /** Where new errors go besides the tables. Defaults to the keyless `store` (tables only). */
  telemetry?: TelemetryProvider
  /** Throttles telemetry batches per client id. Defaults to 60 per minute. */
  telemetryLimiter?: RateLimiter
```

In `createServer`: `const telemetry = options.telemetry ?? storeProvider`, `const telemetryLimiter = options.telemetryLimiter ?? createMemoryRateLimiter({ limit: 60, windowMs: 60_000 })`, both into the `context` object, and `telemetry` on the returned object. The api's own errors are hooked in Task 3 (it needs the record helper to be stable first); this task only wires the context.

`apps/api/src/index.ts`: nothing yet (Task 3 adds `createTelemetryProvider(env)`).

- [ ] **Step 7: API tests**

Create `apps/api/src/telemetry.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { createMemoryRateLimiter } from "@repo/service-kit"
import type { ErrorRow } from "./queries/telemetry"
import type { TelemetryProvider } from "./telemetry/provider"
import { clientFor, start } from "./test-server"

const forwarded: ErrorRow[] = []
const spy: TelemetryProvider = {
  kind: "sentry",
  onNewError: async (row) => {
    forwarded.push(row)
  },
}
let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start({ telemetry: spy })
})
afterAll(() => app.stop())

const waitFor = async (check: () => boolean | Promise<boolean>, ms = 2_000) => {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not met in time")
    await Bun.sleep(5)
  }
}
const boom = (message: string, stack = "Error: x\n    at render (app.js:1:1)") => ({
  kind: "boundary" as const,
  message,
  stack,
  route: "/notes",
})

describe("telemetry.ingest", () => {
  test("stores errors per fingerprint-day with a count, forwards only new rows", async () => {
    const client = clientFor(app)
    forwarded.length = 0
    await client.telemetry.ingest({ app: "app", errors: [boom("Note 1 missing")], vitals: [] })
    await client.telemetry.ingest({ app: "app", errors: [boom("Note 2 missing")], vitals: [] })
    await client.telemetry.ingest({ app: "www", errors: [boom("Note 1 missing")], vitals: [] })
    const since = new Date(Date.now() - 60_000).toISOString()
    const totals = await app.db.telemetry.errorTotals(since)
    expect(totals).toEqual({ distinct: 2, total: 3 })
    const [top] = await app.db.telemetry.errorSummary(since, 5)
    expect(top).toMatchObject({ app: "app", kind: "boundary", route: "/notes" })
    expect(Number(top?.count)).toBe(2)
    await waitFor(() => forwarded.length === 2)
    expect(forwarded.map((r) => r.app).sort()).toEqual(["app", "www"])
  })

  test("stores vitals and the samples feed a p75", async () => {
    const client = clientFor(app)
    await client.telemetry.ingest({
      app: "docs",
      errors: [],
      vitals: [1000, 2000, 3000, 4000].map((value) => ({
        name: "LCP" as const,
        value,
        rating: "good" as const,
        route: "/",
      })),
    })
    const samples = await app.db.telemetry.vitalSamples(new Date(Date.now() - 60_000).toISOString())
    expect(samples.filter((s) => s.app === "docs").map((s) => Number(s.value))).toEqual([
      1000, 2000, 3000, 4000,
    ])
  })

  test("refuses an oversize batch and an unknown app", async () => {
    const client = clientFor(app)
    const [tooBig] = await safe(
      client.telemetry.ingest({
        app: "app",
        errors: Array.from({ length: 21 }, (_, i) => boom(`e${i}`)),
        vitals: [],
      })
    )
    expect(tooBig).toMatchObject({ code: "BAD_REQUEST" })
    const [badApp] = await safe(
      client.telemetry.ingest({ app: "evil" as never, errors: [boom("x")], vitals: [] })
    )
    expect(badApp).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("needs the service token", async () => {
    const res = await fetch(new URL("/openapi/telemetry", app.server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: "app", errors: [], vitals: [] }),
    })
    expect(res.status).toBe(401)
  })

  test("limiter: telemetry:<clientId>", async () => {
    const limited = await start({
      telemetryLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const client = clientFor(limited)
      await client.telemetry.ingest({ app: "app", errors: [], vitals: [] })
      await client.telemetry.ingest({ app: "app", errors: [], vitals: [] })
      const [error] = await safe(client.telemetry.ingest({ app: "app", errors: [], vitals: [] }))
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await limited.stop()
    }
  })

  test("prune drops old rows", async () => {
    const old = "2020-01-01T00:00:00.000Z"
    await app.db.telemetry.upsertError({
      fingerprint: "old-fp",
      app: "api",
      event: { kind: "server", message: "old" },
      now: old,
    })
    await app.db.telemetry.insertVitals("api", [{ name: "CLS", value: 0.01, rating: "good", route: "/" }], old)
    await app.db.telemetry.prune("2021-01-01T00:00:00.000Z", "2021-01-01T00:00:00.000Z")
    expect((await app.db.telemetry.errorSummary("2019-01-01T00:00:00.000Z", 50)).some((r) => r.fingerprint === "old-fp")).toBe(false)
    expect((await app.db.telemetry.vitalSamples("2019-01-01T00:00:00.000Z")).some((s) => s.app === "api")).toBe(false)
  })
})
```

Run `cd apps/api && bun test src/telemetry.test.ts && bun run test:postgres` — PASS on both.

- [ ] **Step 8: Verify, commit**

```bash
cd apps/api && bun test && cd ../.. && bun run --filter @repo/api typecheck && bun run --filter @repo/api-contract typecheck && bunx biome check apps/api packages/api-contract
git add -A && git commit -m "feat(api,api-contract): telemetry.ingest — error fingerprints, vitals, retention, provider seam

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `packages/telemetry` — browser client, server client, route handler

**Files:**
- Create: `packages/telemetry/package.json`, `packages/telemetry/tsconfig.json`, `packages/telemetry/README.md`
- Create: `packages/telemetry/src/browser.ts`, `packages/telemetry/src/browser.test.ts`
- Create: `packages/telemetry/src/server.ts`, `packages/telemetry/src/server.test.ts`
- Modify: root `package.json` (`typecheck` and `test:services` filter lists gain `--filter @repo/telemetry`), `scripts/ci-plan.ts` if it holds a workspace list (check: it derives workspaces from `workspace:*` deps — verify by running `bun test scripts`)

**Interfaces:**
- Consumes: `BrowserBatchSchema`, `BrowserBatch`, `ErrorEvent`, `VitalEvent`, `TELEMETRY_LIMITS`, `TelemetryApp`, `ApiClient` (`@repo/api-contract`); `@orpc/client` (`createORPCClient`, `RPCLink`).
- Produces: `@repo/telemetry/browser` — `readConsent(cookie: string): "all" | "necessary" | null`, `stripRoute(pathname: string): string`, `isForeignStack(stack: string | undefined, origin: string): boolean`, `shapeError(error: unknown, ctx: { kind: "boundary" | "unhandled"; digest?: string; pathname: string; consent: "all" | "necessary" | null; userAgent?: string }): ErrorEvent`, `shapeVital(metric: { name: string; value: number; rating: string; navigationType?: string }, ctx: { pathname: string }): VitalEvent | null`, `createDedupe({ windowMs, max, now? })` → `(key: string) => boolean` (true = send), `createBrowserHandlers(report: (e: ErrorEvent) => void, ctx: { origin: string; pathname: () => string; consent: () => Consent; userAgent?: string })` → `{ onError(event: { message?: string; error?: unknown; filename?: string }), onUnhandledRejection(event: { reason?: unknown }) }`, `reportError(error, ctx?: { kind?; digest? })`, `reportVital(metric)`, `installBrowserHandlers(): void`, `sendBatch(batch: BrowserBatch): void`. `@repo/telemetry/server` — `createTelemetryClient({ apiUrl, serviceToken, app, fetch?, timeoutMs?, log? })` → `{ report(batch: BrowserBatch, opts?: { clientId?: string }): void }`, `createTelemetryRoute({ app, env?: { API_URL?: string; API_SERVICE_TOKEN?: string }, forward?: (batch, clientId) => Promise<void>, log? })` → `(req: Request) => Promise<Response>`, `clientIp(headers: Headers): string | undefined`, `anonymousClientId(ip: string | undefined): Promise<string | undefined>`, `throttledLogger(intervalMs?: number)`.

- [ ] **Step 1: Workspace scaffolding**

`packages/telemetry/package.json`:

```json
{
  "name": "@repo/telemetry",
  "version": "0.1.0",
  "description": "Error and web-vitals reporting: browsers to their own app, apps and services to apps/api",
  "type": "module",
  "private": true,
  "exports": {
    "./browser": "./src/browser.ts",
    "./server": "./src/server.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@orpc/client": "catalog:",
    "@repo/api-contract": "workspace:*"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@types/bun": "catalog:"
  }
}
```

`packages/telemetry/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/bun.json",
  "compilerOptions": { "types": ["bun"], "lib": ["ESNext", "DOM"] },
  "include": ["src"]
}
```

Run `bun install`. Add `--filter @repo/telemetry` to the root `typecheck` (after `@repo/session`) and `test:services` (after `@repo/session`) scripts. Run `bun test scripts` — the planner must still pass (if it enumerates workspaces by reading `package.json` files it picks the new one up; if a test lists workspaces explicitly, add `telemetry`).

- [ ] **Step 2: Browser module — tests first**

Create `packages/telemetry/src/browser.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import {
  createBrowserHandlers,
  createDedupe,
  isForeignStack,
  readConsent,
  shapeError,
  shapeVital,
  stripRoute,
} from "./browser"

describe("shaping", () => {
  test("stripRoute keeps the pathname only and caps it", () => {
    expect(stripRoute("/notes?x=1#top")).toBe("/notes")
    expect(stripRoute(`/${"a".repeat(300)}`)).toHaveLength(200)
    expect(stripRoute("")).toBe("/")
  })

  test("readConsent mirrors the consent cookie rule", () => {
    expect(readConsent("theme=dark; consent=all")).toBe("all")
    expect(readConsent("consent=necessary")).toBe("necessary")
    expect(readConsent("consent=maybe; consent=all")).toBe("all")
    expect(readConsent("")).toBeNull()
  })

  test("shapeError: message, stack, digest, route; userAgent only with consent all", () => {
    const error = new Error("boom")
    const base = { kind: "boundary" as const, digest: "d1", pathname: "/notes?q=1", userAgent: "UA" }
    const withConsent = shapeError(error, { ...base, consent: "all" })
    expect(withConsent).toMatchObject({ kind: "boundary", message: "boom", digest: "d1", route: "/notes", userAgent: "UA" })
    expect(withConsent.stack).toContain("boom")
    expect(shapeError(error, { ...base, consent: "necessary" }).userAgent).toBeUndefined()
    expect(shapeError(error, { ...base, consent: null }).userAgent).toBeUndefined()
  })

  test("shapeError copes with non-Error values and truncates", () => {
    expect(shapeError("just a string", { kind: "unhandled", pathname: "/", consent: null }).message).toBe("just a string")
    expect(shapeError(undefined, { kind: "unhandled", pathname: "/", consent: null }).message).toBe("Unknown error")
    const long = new Error("m".repeat(1000))
    long.stack = "s".repeat(10_000)
    const shaped = shapeError(long, { kind: "boundary", pathname: "/", consent: null })
    expect(shaped.message).toHaveLength(500)
    expect(shaped.stack).toHaveLength(4000)
  })

  test("shapeVital maps a web-vitals metric and ignores unknown names", () => {
    expect(
      shapeVital({ name: "LCP", value: 1234.5, rating: "good", navigationType: "navigate" }, { pathname: "/x?y" })
    ).toEqual({ name: "LCP", value: 1234.5, rating: "good", navigationType: "navigate", route: "/x" })
    expect(shapeVital({ name: "FID", value: 1, rating: "good" }, { pathname: "/" })).toBeNull()
  })
})

describe("isForeignStack", () => {
  const origin = "http://app.brand.localhost:3001"
  test("true when every frame is from another origin", () => {
    expect(isForeignStack("Error\n    at x (chrome-extension://abc/inject.js:1:1)\n    at y (https://cdn.example.com/a.js:2:2)", origin)).toBe(true)
  })
  test("false when one frame is ours or the stack has no frames", () => {
    expect(isForeignStack(`Error\n    at x (https://cdn.example.com/a.js:2:2)\n    at render (${origin}/_next/static/chunks/app.js:1:1)`, origin)).toBe(false)
    expect(isForeignStack("Error: boom", origin)).toBe(false)
    expect(isForeignStack(undefined, origin)).toBe(false)
  })
})

describe("dedupe and handlers", () => {
  test("createDedupe allows a key once per window and at most max events", () => {
    let t = 0
    const allow = createDedupe({ windowMs: 60_000, max: 3, now: () => t })
    expect(allow("a")).toBe(true)
    expect(allow("a")).toBe(false)
    t = 61_000
    expect(allow("a")).toBe(true)
    expect(allow("b")).toBe(true)
    expect(allow("c")).toBe(false) // max reached (a, a, b)
  })

  test("handlers report unhandled errors and rejections, drop Script error. and foreign stacks", () => {
    const reported: unknown[] = []
    const h = createBrowserHandlers((e) => reported.push(e), {
      origin: "http://app.brand.localhost:3001",
      pathname: () => "/notes",
      consent: () => "necessary",
    })
    h.onError({ message: "Script error.", error: undefined })
    h.onError({ message: "x", error: Object.assign(new Error("ext"), { stack: "Error: ext\n    at f (chrome-extension://abc/x.js:1:1)" }) })
    h.onError({ message: "real", error: new Error("real") })
    h.onUnhandledRejection({ reason: new Error("rejected") })
    h.onUnhandledRejection({ reason: "plain" })
    expect(reported.map((e) => (e as { message: string }).message)).toEqual(["real", "rejected", "plain"])
    expect(reported.every((e) => (e as { kind: string }).kind === "unhandled")).toBe(true)
  })

  test("handlers dedupe repeats and stop after 10 per page", () => {
    const reported: unknown[] = []
    const h = createBrowserHandlers((e) => reported.push(e), {
      origin: "http://x",
      pathname: () => "/",
      consent: () => null,
    })
    for (let i = 0; i < 5; i++) h.onError({ message: "same", error: new Error("same") })
    expect(reported).toHaveLength(1)
    for (let i = 0; i < 20; i++) h.onError({ message: `e${i}`, error: new Error(`e${i}`) })
    expect(reported).toHaveLength(10)
  })
})
```

Run `cd packages/telemetry && bun test src/browser.test.ts` — FAIL.

Create `packages/telemetry/src/browser.ts`:

```ts
import {
  type BrowserBatch,
  type ErrorEvent,
  TELEMETRY_LIMITS,
  VITAL_NAMES,
  type VitalEvent,
} from "@repo/api-contract"

export type Consent = "all" | "necessary" | null
const ENDPOINT = "/api/telemetry"
const DEDUPE_WINDOW_MS = 60_000
const MAX_PER_PAGE = 10

/** The consent cookie rule, duplicated from @repo/ui/lib/consent so this package stays React-free. */
export function readConsent(cookie: string): Consent {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.split("=")
    if (name?.trim() !== "consent") continue
    const value = rest.join("=").trim()
    if (value === "all" || value === "necessary") return value
  }
  return null
}

/** Pathname only: never a query string or hash, which may carry tokens or search terms. */
export function stripRoute(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/"
  return path.slice(0, TELEMETRY_LIMITS.route)
}

const frames = (stack: string | undefined) =>
  (stack ?? "").split("\n").filter((line) => /^\s*at\s/.test(line))

/** True when the stack has frames and none of them is from `origin` (extensions, third-party scripts). */
export function isForeignStack(stack: string | undefined, origin: string): boolean {
  const list = frames(stack)
  return list.length > 0 && list.every((frame) => !frame.includes(origin))
}

export function shapeError(
  error: unknown,
  ctx: { kind: "boundary" | "unhandled"; digest?: string; pathname: string; consent: Consent; userAgent?: string }
): ErrorEvent {
  const e = error instanceof Error ? error : undefined
  const message = (e?.message || (typeof error === "string" ? error : "") || e?.name || "Unknown error").slice(0, TELEMETRY_LIMITS.message)
  return {
    kind: ctx.kind,
    message,
    stack: e?.stack?.slice(0, TELEMETRY_LIMITS.stack),
    digest: ctx.digest?.slice(0, TELEMETRY_LIMITS.digest),
    route: stripRoute(ctx.pathname),
    userAgent: ctx.consent === "all" && ctx.userAgent ? ctx.userAgent.slice(0, TELEMETRY_LIMITS.userAgent) : undefined,
  }
}

export function shapeVital(
  metric: { name: string; value: number; rating: string; navigationType?: string },
  ctx: { pathname: string }
): VitalEvent | null {
  if (!(VITAL_NAMES as readonly string[]).includes(metric.name)) return null
  if (!["good", "needs-improvement", "poor"].includes(metric.rating)) return null
  return {
    name: metric.name as VitalEvent["name"],
    value: Math.max(0, metric.value),
    rating: metric.rating as VitalEvent["rating"],
    navigationType: metric.navigationType?.slice(0, TELEMETRY_LIMITS.navigationType),
    route: stripRoute(ctx.pathname),
  }
}

/** A key may pass once per window; the total is capped (a page in a render loop sends 10, not 10,000). */
export function createDedupe({ windowMs, max, now = Date.now }: { windowMs: number; max: number; now?: () => number }) {
  const seen = new Map<string, number>()
  let sent = 0
  return (key: string): boolean => {
    const t = now()
    const last = seen.get(key)
    if (last !== undefined && t - last < windowMs) return false
    if (sent >= max) return false
    seen.set(key, t)
    sent++
    return true
  }
}

const firstFrame = (stack: string | undefined) => frames(stack)[0]?.trim() ?? ""

export function createBrowserHandlers(
  report: (event: ErrorEvent) => void,
  ctx: { origin: string; pathname: () => string; consent: () => Consent; userAgent?: string }
) {
  const allow = createDedupe({ windowMs: DEDUPE_WINDOW_MS, max: MAX_PER_PAGE })
  const handle = (error: unknown, fallbackMessage?: string) => {
    const value = error ?? fallbackMessage
    if (value === undefined || value === "Script error.") return
    if (error instanceof Error && isForeignStack(error.stack, ctx.origin)) return
    const event = shapeError(value, { kind: "unhandled", pathname: ctx.pathname(), consent: ctx.consent(), userAgent: ctx.userAgent })
    if (!allow(`${event.message}|${firstFrame(event.stack)}`)) return
    report(event)
  }
  return {
    onError: (event: { message?: string; error?: unknown }) => handle(event.error, event.message),
    onUnhandledRejection: (event: { reason?: unknown }) => handle(event.reason),
  }
}

/** `sendBeacon` survives unload; `fetch keepalive` is the fallback. Never throws. */
export function sendBatch(batch: BrowserBatch): void {
  try {
    const body = JSON.stringify(batch)
    if (body.length > TELEMETRY_LIMITS.bodyBytes) return
    const blob = new Blob([body], { type: "application/json" })
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.(ENDPOINT, blob)) return
    void fetch(ENDPOINT, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {})
  } catch {
    // Reporting must never break the page.
  }
}

const browserCtx = () => ({
  pathname: typeof location !== "undefined" ? location.pathname : "/",
  consent: typeof document !== "undefined" ? readConsent(document.cookie) : null,
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
})

/** For error boundaries: one event, now. */
export function reportError(error: unknown, ctx: { kind?: "boundary" | "unhandled"; digest?: string } = {}): void {
  try {
    const { pathname, consent, userAgent } = browserCtx()
    sendBatch({ errors: [shapeError(error, { kind: ctx.kind ?? "boundary", digest: ctx.digest, pathname, consent, userAgent })], vitals: [] })
  } catch {
    // never throw
  }
}

/** For `useReportWebVitals`: one vital, now (they arrive one at a time as they settle). */
export function reportVital(metric: { name: string; value: number; rating: string; navigationType?: string }): void {
  try {
    const vital = shapeVital(metric, { pathname: browserCtx().pathname })
    if (vital) sendBatch({ errors: [], vitals: [vital] })
  } catch {
    // never throw
  }
}

let installed = false
/** window.onerror + unhandledrejection, once per page. */
export function installBrowserHandlers(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  const handlers = createBrowserHandlers((event) => sendBatch({ errors: [event], vitals: [] }), {
    origin: location.origin,
    pathname: () => location.pathname,
    consent: () => readConsent(document.cookie),
    userAgent: navigator.userAgent,
  })
  window.addEventListener("error", (event) => handlers.onError(event))
  window.addEventListener("unhandledrejection", (event) => handlers.onUnhandledRejection(event))
}
```

Run — PASS (the `createDedupe` test's `max` arithmetic: a, a-blocked, a-after-window, b = 3 sends → c blocked; adjust the expectation only if your count differs by the blocked repeat not counting, which is the intended behaviour).

- [ ] **Step 3: Server module — tests first**

Create `packages/telemetry/src/server.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { anonymousClientId, clientIp, createTelemetryClient, createTelemetryRoute } from "./server"

const batch = { errors: [{ kind: "boundary" as const, message: "boom" }], vitals: [] }
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://app.brand.localhost:3001/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

describe("createTelemetryRoute", () => {
  test("forwards a valid batch with the app stamped and a per-browser client id", async () => {
    const seen: unknown[] = []
    const route = createTelemetryRoute({
      app: "app",
      forward: async (b, clientId) => {
        seen.push({ b, clientId })
      },
    })
    const res = await route(post({ ...batch, app: "www" }, { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))
    expect(res.status).toBe(204)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ b: { app: "app", errors: batch.errors } })
    expect((seen[0] as { clientId: string }).clientId).toMatch(/^anon:[0-9a-f]{32}$/)
  })

  test("answers 204 and forwards nothing for garbage, oversize bodies or a schema miss", async () => {
    let calls = 0
    const route = createTelemetryRoute({ app: "app", forward: async () => { calls++ } })
    expect((await route(post("{not json"))).status).toBe(204)
    expect((await route(post({ errors: [{ kind: "boundary", message: "x".repeat(9000) }], vitals: [] }))).status).toBe(204)
    expect((await route(post({ errors: [{ kind: "nope", message: "x" }], vitals: [] }))).status).toBe(204)
    expect(calls).toBe(0)
  })

  test("answers 204 when the forward throws, and drops when unconfigured", async () => {
    const logs: string[] = []
    const throwing = createTelemetryRoute({ app: "app", forward: async () => { throw new Error("api down") }, log: (m) => logs.push(m) })
    expect((await throwing(post(batch))).status).toBe(204)
    expect(logs.join(" ")).toContain("api down")
    const unconfigured = createTelemetryRoute({ app: "docs", env: {}, log: (m) => logs.push(m) })
    expect((await unconfigured(post(batch))).status).toBe(204)
  })
})

describe("createTelemetryClient", () => {
  test("posts telemetry.ingest with the service bearer and a client id; never throws", async () => {
    const requests: Request[] = []
    const client = createTelemetryClient({
      apiUrl: "http://api.example",
      serviceToken: "svc",
      app: "ai",
      fetch: async (input, init) => {
        requests.push(new Request(input, init))
        return new Response(JSON.stringify({ json: null }), { status: 200 })
      },
    })
    client.report(batch)
    await Bun.sleep(20)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer svc")
    expect(requests[0]?.headers.get("x-api-client-id")).toBe("telemetry:ai")
    const down = createTelemetryClient({ apiUrl: "http://127.0.0.1:1", serviceToken: "svc", app: "ai", log: () => {} })
    expect(() => down.report(batch)).not.toThrow()
  })
})

test("clientIp prefers x-real-ip, then the first x-forwarded-for hop", () => {
  expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1")
  expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2")
  expect(clientIp(new Headers())).toBeUndefined()
})

test("anonymousClientId hashes the ip and is undefined without one", async () => {
  expect(await anonymousClientId("203.0.113.9")).toMatch(/^anon:[0-9a-f]{32}$/)
  expect(await anonymousClientId(undefined)).toBeUndefined()
})
```

Run — FAIL. Create `packages/telemetry/src/server.ts`:

```ts
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import {
  type ApiClient,
  type BrowserBatch,
  BrowserBatchSchema,
  TELEMETRY_LIMITS,
  type TelemetryApp,
  type TelemetryBatch,
} from "@repo/api-contract"

type Log = (message: string, error?: unknown) => void

/** Logs a message at most once per interval per key: a flood of identical failures is one line. */
export function throttledLogger(intervalMs = 60_000, sink: Log = console.error): Log {
  const last = new Map<string, number>()
  return (message, error) => {
    const t = Date.now()
    if (t - (last.get(message) ?? 0) < intervalMs) return
    last.set(message, t)
    sink(`[telemetry] ${message}`, error)
  }
}

/** The browser's ip as the proxy reports it (informational; the limiter key only). */
export function clientIp(headers: Headers): string | undefined {
  const real = headers.get("x-real-ip")?.trim()
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (real || forwarded || undefined)?.slice(0, 45)
}

/** `anon:<32 hex of sha256(ip)>` — one limiter bucket per browser, and the ip itself never travels. */
export async function anonymousClientId(ip: string | undefined): Promise<string | undefined> {
  if (!ip) return undefined
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip))
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
  return `anon:${hex.slice(0, 32)}`
}

export function createTelemetryClient(options: {
  apiUrl: string
  serviceToken: string
  app: TelemetryApp
  fetch?: typeof fetch
  timeoutMs?: number
  log?: Log
}) {
  const log = options.log ?? throttledLogger()
  const f = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  const clientFor = (clientId: string) =>
    createORPCClient<ApiClient>(
      new RPCLink({
        url: `${options.apiUrl.replace(/\/+$/, "")}/rpc`,
        headers: { authorization: `Bearer ${options.serviceToken}`, "x-api-client-id": clientId },
        fetch: (request, init) =>
          f(request, { ...init, signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]) }),
      })
    )
  return {
    /** Fire-and-forget: the caller's request never waits on telemetry. */
    report(batch: BrowserBatch, opts: { clientId?: string } = {}): void {
      const body: TelemetryBatch = { app: options.app, errors: batch.errors, vitals: batch.vitals }
      clientFor(opts.clientId ?? `telemetry:${options.app}`)
        .telemetry.ingest(body)
        .catch((error) => log("ingest failed", error))
    },
  }
}

/**
 * The Next apps' `POST /api/telemetry`: validates, stamps the app, forwards. Answers 204 for every
 * body — a page must never see a telemetry failure. Without API_URL / API_SERVICE_TOKEN it drops.
 */
export function createTelemetryRoute(options: {
  app: TelemetryApp
  env?: { API_URL?: string; API_SERVICE_TOKEN?: string }
  forward?: (batch: TelemetryBatch, clientId: string | undefined) => Promise<void>
  log?: Log
}): (req: Request) => Promise<Response> {
  const log = options.log ?? throttledLogger()
  const env = options.env ?? process.env
  let forward = options.forward
  if (!forward) {
    if (env.API_URL && env.API_SERVICE_TOKEN) {
      const client = createTelemetryClient({ apiUrl: env.API_URL, serviceToken: env.API_SERVICE_TOKEN, app: options.app, log })
      forward = async (batch, clientId) => client.report(batch, { clientId })
    } else {
      forward = async () => log("API_URL / API_SERVICE_TOKEN not set — dropping telemetry")
    }
  }
  const done = () => new Response(null, { status: 204 })
  return async (req) => {
    try {
      const text = await req.text()
      if (text.length > TELEMETRY_LIMITS.bodyBytes) return done()
      const parsed = BrowserBatchSchema.safeParse(JSON.parse(text))
      if (!parsed.success) return done()
      const clientId = await anonymousClientId(clientIp(req.headers))
      await forward({ app: options.app, ...parsed.data }, clientId)
    } catch (error) {
      log("route failed", error)
    }
    return done()
  }
}
```

(If `createORPCClient<ApiClient>` needs the contract-router generic form used in `packages/session/src/client.ts`, copy that call exactly.) Run — PASS.

- [ ] **Step 4: README, verify, commit**

`packages/telemetry/README.md`: what each entry point does, the consent rule, the one route line per app, the caps, "reporting never throws".

```bash
cd packages/telemetry && bun test && bun run typecheck && cd ../.. && bunx biome check packages/telemetry && bun test scripts
git add -A && git commit -m "feat(telemetry): @repo/telemetry — browser reporter, server client, /api/telemetry route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Sentry adapter and the services' own errors

**Files:**
- Create: `apps/api/src/telemetry/sentry.ts`, `apps/api/src/telemetry/sentry.test.ts`, `apps/api/src/telemetry/create-provider.ts`
- Modify: `apps/api/src/server.ts` (`log` seam → `recordServerError`), `apps/api/src/index.ts` (`telemetry: createTelemetryProvider(env)`), `apps/api/src/telemetry.test.ts` (a throwing handler becomes a `server` row)
- Modify: `apps/ai/src/env.ts`, `apps/ai/src/env.test.ts` (or `config.test.ts`), `apps/ai/src/server.ts`, `apps/ai/src/index.ts`, `apps/ai/package.json` (`@repo/telemetry` dep), `apps/ai/src/server.test.ts`

**Interfaces:**
- Consumes: `TelemetryProvider`, `ErrorRow`, `recordServerError`, `storeProvider` (Task 1); `createTelemetryClient` (Task 2).
- Produces: `parseDsn(dsn): { envelopeUrl: string; publicKey: string }` (throws on a bad DSN), `buildEnvelope(row, { environment, dsn })`: string, `sentryProvider({ dsn, environment, fetch?, log })`: TelemetryProvider, `createTelemetryProvider(env: { TELEMETRY_PROVIDER; SENTRY_DSN?; SENTRY_ENVIRONMENT?; NODE_ENV }, log)`: TelemetryProvider; `ServerOptions.telemetryApp?` is not needed — the api records with `app: "api"`.

- [ ] **Step 1: Sentry adapter — tests first**

```ts
import { describe, expect, test } from "bun:test"
import type { ErrorRow } from "../queries/telemetry"
import { buildEnvelope, parseDsn, sentryProvider } from "./sentry"

const row: ErrorRow = {
  id: 1, fingerprint: "f".repeat(64), day: "2026-10-04", app: "app", kind: "boundary",
  message: "boom", stack: "Error: boom\n    at render (http://app/x.js:1:2)\n    at main (http://app/y.js:3:4)",
  digest: "d1", route: "/notes", user_agent: null, count: 1,
  first_seen: "2026-10-04T10:00:00.000Z", last_seen: "2026-10-04T10:00:00.000Z",
}

describe("parseDsn", () => {
  test("derives the envelope url and the public key", () => {
    expect(parseDsn("https://abc123@o1.ingest.sentry.io/42")).toEqual({
      envelopeUrl: "https://o1.ingest.sentry.io/api/42/envelope/",
      publicKey: "abc123",
    })
  })
  test("refuses a DSN without a key or a project", () => {
    expect(() => parseDsn("https://o1.ingest.sentry.io/42")).toThrow()
    expect(() => parseDsn("https://abc@o1.ingest.sentry.io/")).toThrow()
    expect(() => parseDsn("not a url")).toThrow()
  })
})

describe("buildEnvelope", () => {
  test("three JSON lines: envelope header, item header, event", () => {
    const lines = buildEnvelope(row, { environment: "test", dsn: "https://abc@o1.ingest.sentry.io/42" }).split("\n")
    expect(lines).toHaveLength(3)
    const [header, item, event] = lines.map((l) => JSON.parse(l))
    expect(header).toMatchObject({ dsn: "https://abc@o1.ingest.sentry.io/42" })
    expect(header.event_id).toMatch(/^[0-9a-f]{32}$/)
    expect(item).toEqual({ type: "event" })
    expect(event).toMatchObject({
      level: "error", platform: "javascript", environment: "test",
      tags: { app: "app", kind: "boundary", route: "/notes" },
      fingerprint: [row.fingerprint],
      exception: { values: [{ type: "Error", value: "boom" }] },
    })
    // Frames oldest first, as Sentry expects.
    expect(event.exception.values[0].stacktrace.frames.map((f: { function: string }) => f.function)).toEqual(["main", "render"])
    expect(JSON.stringify(event)).not.toContain("user_agent")
  })
  test("server rows use the node platform", () => {
    const event = JSON.parse(buildEnvelope({ ...row, app: "api", kind: "server" }, { environment: "x", dsn: "https://a@b/1" }).split("\n")[2] ?? "")
    expect(event.platform).toBe("node")
  })
})

describe("sentryProvider", () => {
  test("posts the envelope with the auth header; a failure or timeout is logged, never thrown", async () => {
    const calls: Request[] = []
    const ok = sentryProvider({
      dsn: "https://abc@o1.ingest.sentry.io/42", environment: "test", log: () => {},
      fetch: async (input, init) => { calls.push(new Request(input, init)); return new Response("{}", { status: 200 }) },
    })
    await ok.onNewError(row)
    expect(calls[0]?.url).toBe("https://o1.ingest.sentry.io/api/42/envelope/")
    expect(calls[0]?.headers.get("x-sentry-auth")).toContain("sentry_key=abc")
    expect(calls[0]?.headers.get("content-type")).toBe("application/x-sentry-envelope")

    const logs: string[] = []
    const failing = sentryProvider({ dsn: "https://abc@o1/1", environment: "t", log: (m) => logs.push(m), fetch: async () => new Response("no", { status: 500 }) })
    await expect(failing.onNewError(row)).resolves.toBeUndefined()
    expect(logs.join(" ")).toContain("sentry")

    const hanging = sentryProvider({ dsn: "https://abc@o1/1", environment: "t", log: (m) => logs.push(m), timeoutMs: 20,
      fetch: (_input, init) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))) })
    await expect(hanging.onNewError(row)).resolves.toBeUndefined()
  })
})
```

Run — FAIL. Create `apps/api/src/telemetry/sentry.ts`:

```ts
import type { ErrorRow } from "../queries/telemetry"
import type { TelemetryProvider } from "./provider"

type Log = (message: string, error: unknown) => void

/** `https://<publicKey>@<host>/<projectId>` → the envelope endpoint and the key for the auth header. */
export function parseDsn(dsn: string): { envelopeUrl: string; publicKey: string } {
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    throw new Error("SENTRY_DSN is not a URL")
  }
  const publicKey = url.username
  const projectId = url.pathname.replace(/^\/+/, "").split("/")[0]
  if (!publicKey || !projectId) throw new Error("SENTRY_DSN needs a public key and a project id")
  return { envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`, publicKey }
}

const FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/
function parseFrames(stack: string | null) {
  const frames = []
  for (const line of (stack ?? "").split("\n")) {
    const m = FRAME.exec(line)
    if (!m) continue
    frames.push({ function: m[1] ?? "<anonymous>", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) })
  }
  return frames.reverse() // Sentry wants the oldest call first.
}

export function buildEnvelope(row: ErrorRow, opts: { environment: string; dsn: string }): string {
  const eventId = crypto.randomUUID().replaceAll("-", "")
  const typeMatch = /^([A-Za-z]*Error)\b/.exec(row.stack ?? "")
  const event = {
    event_id: eventId,
    timestamp: row.last_seen,
    platform: row.kind === "server" ? "node" : "javascript",
    level: "error",
    environment: opts.environment,
    tags: { app: row.app, kind: row.kind, route: row.route ?? "" },
    fingerprint: [row.fingerprint],
    exception: {
      values: [
        {
          type: typeMatch?.[1] ?? "Error",
          value: row.message,
          stacktrace: { frames: parseFrames(row.stack) },
        },
      ],
    },
    extra: { digest: row.digest, day: row.day },
  }
  return [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: opts.dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n")
}

/** Forwards each new error row as one Sentry event, over plain fetch. Never throws. */
export function sentryProvider(options: {
  dsn: string
  environment: string
  fetch?: typeof fetch
  timeoutMs?: number
  log: Log
}): TelemetryProvider {
  const { envelopeUrl, publicKey } = parseDsn(options.dsn)
  const f = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  return {
    kind: "sentry",
    async onNewError(row) {
      try {
        const res = await f(envelopeUrl, {
          method: "POST",
          headers: {
            "content-type": "application/x-sentry-envelope",
            "x-sentry-auth": `Sentry sentry_version=7, sentry_client=boilerplate-api/0.1, sentry_key=${publicKey}`,
          },
          body: buildEnvelope(row, { environment: options.environment, dsn: options.dsn }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!res.ok) options.log(`sentry answered ${res.status}`, undefined)
      } catch (error) {
        options.log("sentry forward failed", error)
      }
    },
  }
}
```

`apps/api/src/telemetry/create-provider.ts`:

```ts
import type { Env } from "../env"
import type { TelemetryProvider } from "./provider"
import { sentryProvider } from "./sentry"
import { storeProvider } from "./store"

export type TelemetryEnv = Pick<Env, "TELEMETRY_PROVIDER" | "SENTRY_DSN" | "SENTRY_ENVIRONMENT" | "NODE_ENV">

/** Picks the provider by TELEMETRY_PROVIDER; a bad DSN fails here, at boot. */
export function createTelemetryProvider(
  env: TelemetryEnv,
  log: (message: string, error: unknown) => void
): TelemetryProvider {
  if (env.TELEMETRY_PROVIDER !== "sentry") return storeProvider
  // Unreachable after loadEnv, which refuses sentry without a DSN.
  if (!env.SENTRY_DSN) throw new Error("TELEMETRY_PROVIDER=sentry needs SENTRY_DSN")
  return sentryProvider({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV, log })
}
```

Add to `sentry.test.ts`:

```ts
import { createTelemetryProvider } from "./create-provider"
test("createTelemetryProvider: store by default, sentry with a DSN, throws on a bad one", () => {
  const log = () => {}
  expect(createTelemetryProvider({ TELEMETRY_PROVIDER: "store", NODE_ENV: "test" }, log).kind).toBe("store")
  expect(createTelemetryProvider({ TELEMETRY_PROVIDER: "sentry", SENTRY_DSN: "https://k@h/1", NODE_ENV: "test" }, log).kind).toBe("sentry")
  expect(() => createTelemetryProvider({ TELEMETRY_PROVIDER: "sentry", SENTRY_DSN: "https://h/1", NODE_ENV: "test" }, log)).toThrow()
})
```

Run — PASS.

- [ ] **Step 2: The api records its own failures**

`apps/api/src/server.ts`: after `db`, `telemetry` and `log` exist, build `const telemetryDeps = { db, provider: telemetry, log }` and change the two seams:

```ts
  const logUnexpected = (error: unknown) => {
    if (!(error instanceof ORPCError) || error.status >= 500) {
      log("rpc failed", error)
      recordServerError(telemetryDeps, "api", error)
    }
  }
  …
    error(error) {
      log("unhandled", error)
      recordServerError(telemetryDeps, "api", error)
      return errorResponse("INTERNAL_SERVER_ERROR", { message: "Internal error" })
    },
```

`apps/api/src/index.ts`: `telemetry: createTelemetryProvider(env, (m, e) => console.error(\`[api] ${m}\`, e))` inside the `createServer` call (wrap like `createMailer` in a try → `cannotStart`).

Test, in `apps/api/src/telemetry.test.ts`:

```ts
test("a handler that answers 500 becomes a server row for app api", async () => {
  // A deterministic 500: workspaces.delete cancels a live subscription first, and a provider whose
  // cancel throws makes the handler answer INTERNAL_SERVER_ERROR, which logUnexpected sees.
  const { mockProvider } = await import("./billing/mock")
  const { signUpWithWorkspace } = await import("./test-server")
  const broken = await start({
    billing: ({ db }) => ({
      ...mockProvider(db),
      cancelSubscription: async () => {
        throw new Error("provider exploded")
      },
    }),
  })
  try {
    const owner = await signUpWithWorkspace(broken)
    await broken.billing.change(owner.workspaceId, "pro", "month")
    const [error] = await safe(owner.client.workspaces.delete({ workspaceId: owner.workspaceId }))
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    await waitFor(async () => (await broken.db.telemetry.errorTotals("2000-01-01T00:00:00.000Z")).total >= 1)
    const [row] = await broken.db.telemetry.errorSummary("2000-01-01T00:00:00.000Z", 1)
    // The recorded error is the ORPCError the handler threw (its message is the contract's
    // "Internal error"), not the provider's: what matters is that the 500 left a row.
    expect(row).toMatchObject({ app: "api", kind: "server" })
    expect(row?.message.length).toBeGreaterThan(0)
  } finally {
    await broken.stop()
  }
})
```

(`waitFor` must accept an async check: declare it `check: () => boolean | Promise<boolean>` and `await check()`. `start()`'s `billing` option is the `BillingFactory` `({ db, log, accountUrl }) => BillingProvider`; `broken.billing` is cast to `MockBillingProvider` by `start`, so `change` is available on the spread object.)

- [ ] **Step 3: `apps/ai` reports through the api**

`apps/ai/package.json`: add `"@repo/telemetry": "workspace:*"` and `"@repo/api-contract": "workspace:*"` to dependencies; `bun install`.

`apps/ai/src/env.ts`: add `API_URL: optionalString.pipe(z.string().url().optional())` and `API_SERVICE_TOKEN: optionalString` to the schema (no production requirement — unset means no reporting). Test: `loadEnv({ NODE_ENV: "test" }).API_URL` is undefined; with both set they come through.

`apps/ai/src/server.ts`: `ServerOptions.telemetry?: { report(batch: BrowserBatch): void }`; in `logUnexpected`, after `log.error("rpc failed", error)`: `options.telemetry?.report({ errors: [toAiErrorEvent(error)], vitals: [] })` where

```ts
const toAiErrorEvent = (error: unknown): ErrorEvent => {
  const e = error instanceof Error ? error : new Error(String(error))
  return { kind: "server", message: (e.message || "Error").slice(0, 500), stack: e.stack?.slice(0, 4000) }
}
```

`apps/ai/src/index.ts`: `telemetry: env.API_URL && env.API_SERVICE_TOKEN ? createTelemetryClient({ apiUrl: env.API_URL, serviceToken: env.API_SERVICE_TOKEN, app: "ai" }) : undefined`, and `console.info("[ai] telemetry off — set API_URL and API_SERVICE_TOKEN to report errors to the api")` when undefined.

Test in `apps/ai/src/server.test.ts`: start the ai server with `telemetry: { report: (b) => reported.push(b) }` and a model that throws (see how the existing tests fake a failing model), call `summarize` or `chat`, assert one batch with `kind: "server"`.

- [ ] **Step 4: Verify, commit**

```bash
cd apps/api && bun test && bun run test:postgres && cd ../ai && bun test && cd ../.. && bun run --filter @repo/api typecheck && bun run --filter @repo/ai typecheck && bunx biome check apps/api apps/ai
git add -A && git commit -m "feat(api,ai): Sentry envelope forwarder behind TELEMETRY_PROVIDER; services record their own 5xx

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `packages/ui` production branch and the seven apps

**Files:**
- Modify: `packages/ui/src/components/web-vitals.tsx`; create `packages/ui/src/components/web-vitals.test.tsx`
- Create: `packages/ui/src/components/browser-telemetry.tsx`, `packages/ui/src/components/browser-telemetry.test.tsx`
- Modify: `packages/ui/package.json` (dependency `@repo/telemetry`), `packages/ui/tsconfig*.json` only if `@repo/telemetry/browser` fails to resolve
- Create: `apps/{www,app,auth,account,docs,help,jobs}/src/app/api/telemetry/route.ts`
- Modify: the seven root layouts (`<BrowserTelemetry />` next to `<WebVitals />`), the seven `src/app/error.tsx` (byte-identical), the seven `package.json` (`@repo/telemetry`) and `next.config.mjs` (`transpilePackages` gains `@repo/telemetry` and, where missing, `@repo/api-contract`)
- Modify: `docker-compose.yml` (every Next service gets `API_URL` / `API_SERVICE_TOKEN`; docs/help/jobs did not have them), `.env.example` comment, `scripts/ci-plan.test.ts` (identical-files check now also covers `src/app/api/telemetry/route.ts` modulo the `app:` literal — or just asserts the file exists in all seven)
- Modify: `apps/story/stories/WebVitals.stories.tsx` only if one exists (check)

**Interfaces:**
- Consumes: `reportError`, `reportVital`, `installBrowserHandlers` (`@repo/telemetry/browser`), `createTelemetryRoute` (`@repo/telemetry/server`), `useConsent` (`@repo/ui/components/use-consent`).
- Produces: `WebVitals({ consent? })` unchanged signature; `BrowserTelemetry()`; the `/api/telemetry` route in every app.

- [ ] **Step 1: `WebVitals` and `BrowserTelemetry` — tests first**

`packages/ui/src/components/web-vitals.test.tsx`:

```tsx
import { describe, expect, mock, test } from "bun:test"

const sent: unknown[] = []
mock.module("@repo/telemetry/browser", () => ({
  reportVital: (metric: unknown) => sent.push(metric),
  reportError: () => {},
  installBrowserHandlers: () => {},
}))
const { reportWebVitals } = await import("./web-vitals")

describe("reportWebVitals", () => {
  test("outside development every metric goes to reportVital", () => {
    const metric = { name: "LCP", value: 1200, rating: "good", delta: 1200, id: "v1", navigationType: "navigate", entries: [] }
    reportWebVitals(metric as never, "production")
    expect(sent).toEqual([metric])
  })
  test("in development it only logs", () => {
    sent.length = 0
    const metric = { name: "CLS", value: 0.01, rating: "good", delta: 0.01, id: "v2", navigationType: "navigate", entries: [] }
    reportWebVitals(metric as never, "development")
    expect(sent).toEqual([])
  })
})
```

`packages/ui/src/components/browser-telemetry.test.tsx`:

```tsx
import { expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

let installs = 0
mock.module("@repo/telemetry/browser", () => ({ installBrowserHandlers: () => installs++, reportError: () => {}, reportVital: () => {} }))
const { BrowserTelemetry } = await import("./browser-telemetry")

test("renders nothing and installs only on the client (effects do not run in SSR)", () => {
  expect(renderToStaticMarkup(<BrowserTelemetry />)).toBe("")
  expect(installs).toBe(0)
})
```

Run `cd packages/ui && bun test src/components/web-vitals.test.tsx src/components/browser-telemetry.test.tsx` — FAIL.

`packages/ui/src/components/web-vitals.tsx`:

```tsx
"use client"

import type { Consent } from "@repo/ui/lib/consent"
import { reportVital } from "@repo/telemetry/browser"
import { useReportWebVitals } from "next/web-vitals"
import type { Metric } from "web-vitals"

/**
 * Core Web Vitals (CLS, INP, LCP) plus FCP/TTFB. Development logs; everywhere else the metric goes
 * to this app's /api/telemetry (see @repo/telemetry), which forwards it to apps/api. The browser
 * client reads the consent cookie itself: a vital never carries anything identifying, so consent
 * only decides whether the user agent rides along on error events.
 */
export function reportWebVitals(metric: Metric, env: string | undefined = process.env.NODE_ENV) {
  if (env === "development") {
    console.log(`[Web Vital] ${metric.name}:`, { value: metric.value, rating: metric.rating, delta: metric.delta, id: metric.id })
    return
  }
  reportVital(metric)
}

/** Drop into any app's root layout: <WebVitals consent={…} /> (the prop is kept for callers; the cookie is the source of truth). */
// biome-ignore lint/correctness/noUnusedFunctionParameters: kept for the layouts' call sites
export function WebVitals({ consent }: { consent?: Consent | null }) {
  useReportWebVitals((metric) => reportWebVitals(metric))
  return null
}
```

`packages/ui/src/components/browser-telemetry.tsx`:

```tsx
"use client"

import { installBrowserHandlers } from "@repo/telemetry/browser"
import { useEffect } from "react"

/** window.onerror + unhandledrejection → this app's /api/telemetry. Renders nothing. */
export function BrowserTelemetry() {
  useEffect(() => {
    installBrowserHandlers()
  }, [])
  return null
}
```

Add `"@repo/telemetry": "workspace:*"` to `packages/ui/package.json` dependencies; `bun install`. Run — PASS; `bun run --filter @repo/ui typecheck`.

- [ ] **Step 2: The seven apps**

For each of `www`, `app`, `auth`, `account`, `docs`, `help`, `jobs`:

`src/app/api/telemetry/route.ts`:

```ts
import { createTelemetryRoute } from "@repo/telemetry/server"

// Browsers post their errors and web vitals here (same origin); this forwards them to apps/api
// with the service token. The app name is stamped here, never trusted from the body.
export const POST = createTelemetryRoute({ app: "www" })
```

(the literal per app). Root layout: `import { BrowserTelemetry } from "@repo/ui/components/browser-telemetry"` and render `<BrowserTelemetry />` right after `<WebVitals … />`. `src/app/error.tsx` (identical in all seven):

```tsx
"use client"

import { reportError } from "@repo/telemetry/browser"
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
    if (process.env.NODE_ENV === "development") console.error(error)
    reportError(error, { kind: "boundary", digest: error.digest })
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

`package.json`: `"@repo/telemetry": "workspace:*"` (and `@repo/api-contract` where missing — docs/help/jobs); `next.config.mjs` `transpilePackages`: add `"@repo/telemetry"` and `"@repo/api-contract"` where missing. `bun install`.

`docker-compose.yml`: `API_URL` and `API_SERVICE_TOKEN` on `docs`, `help`, `jobs` as the other Next services have them. `.env.example`: note that every Next app reads `API_URL` / `API_SERVICE_TOKEN` (telemetry; optional for docs/help/jobs).

`scripts/ci-plan.test.ts`: in the identical-files test add `expect(await same("src/app/error.tsx")).toBe(1)` is already there; add a check that all seven `src/app/api/telemetry/route.ts` exist and differ only in the `app:` literal (read each, replace `app: "<name>"` by `app: "X"`, assert one distinct content).

- [ ] **Step 3: Verify, commit**

```bash
bun test scripts && cd packages/ui && bun test && cd ../.. && bun run typecheck && bun run typecheck:ui && bunx biome check . --max-diagnostics=none
bun --filter @repo/docs build && bun --filter @repo/app build
git add -A && git commit -m "feat(ui,apps): report boundaries, unhandled errors and web vitals through /api/telemetry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Both builds must stay green; `docs`'s pages must still be static — check the build output's route table shows `○` for its pages and `ƒ` only for `/api/*`.)

---

### Task 5: Admin — `admin.telemetry.errors` / `vitals` and the two overview cards

**Files:**
- Modify: `packages/api-contract/src/index.ts` (the two procedures under `admin.telemetry`)
- Create: `apps/api/src/telemetry/p75.ts`, `apps/api/src/telemetry/p75.test.ts`
- Modify: `apps/api/src/router.ts` (`admin.telemetry`), `apps/api/src/admin-api.test.ts` (or `telemetry.test.ts`)
- Create: `apps/auth/src/components/admin/errors-card.tsx`, `apps/auth/src/components/admin/vitals-card.tsx`, `apps/auth/src/lib/vitals.ts`, `apps/auth/src/lib/vitals.test.ts`
- Modify: `apps/auth/src/views/admin-home-view.tsx`, `apps/auth/src/app/admin/(gated)/page.tsx`

**Interfaces:**
- Consumes: `db.telemetry.errorTotals/errorSummary/vitalSamples`, `adminApi`, `TelemetryErrorsSchema`, `TelemetryVitalsSchema`, `rateVital`, `VITAL_THRESHOLDS`, `formatDateTime` (`apps/auth/src/lib/admin.ts`).
- Produces: `p75(values: number[]): number | null`, `vitalsByApp(samples): TelemetryVitals["apps"]`; `formatVital(name, value)` (`"1.2 s"`, `"180 ms"`, `"0.05"`), `ratingLabel(rating)`; `AdminHomeView({ metrics, errors, vitals })`.

- [ ] **Step 1: p75 — test first**

```ts
import { expect, test } from "bun:test"
import { p75, vitalsByApp } from "./p75"

test("p75 is the nearest-rank 75th percentile", () => {
  expect(p75([])).toBeNull()
  expect(p75([5])).toBe(5)
  expect(p75([1, 2, 3, 4])).toBe(3)
  expect(p75([4, 1, 3, 2, 5])).toBe(4)
  expect(p75([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(8)
})

test("vitalsByApp groups samples per app and metric", () => {
  const rows = vitalsByApp([
    { app: "app", name: "LCP", value: 1000 }, { app: "app", name: "LCP", value: 3000 },
    { app: "app", name: "CLS", value: 0.2 }, { app: "www", name: "INP", value: "150" },
  ])
  expect(rows).toEqual([
    { app: "app", samples: 3, lcp: 3000, inp: null, cls: 0.2 },
    { app: "www", samples: 1, lcp: null, inp: 150, cls: null },
  ])
})
```

`apps/api/src/telemetry/p75.ts`:

```ts
import type { TelemetryVitals } from "@repo/api-contract"
import type { VitalSampleRow } from "../queries/telemetry"

/** Nearest-rank p75 of an unsorted list; null when empty. */
export function p75(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(0.75 * sorted.length) - 1] ?? null
}

export function vitalsByApp(samples: VitalSampleRow[]): TelemetryVitals["apps"] {
  const byApp = new Map<string, { lcp: number[]; inp: number[]; cls: number[]; samples: number }>()
  for (const s of samples) {
    const entry = byApp.get(s.app) ?? { lcp: [], inp: [], cls: [], samples: 0 }
    entry.samples++
    const value = Number(s.value)
    if (s.name === "LCP") entry.lcp.push(value)
    else if (s.name === "INP") entry.inp.push(value)
    else if (s.name === "CLS") entry.cls.push(value)
    byApp.set(s.app, entry)
  }
  return [...byApp.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([app, e]) => ({ app: app as TelemetryVitals["apps"][number]["app"], samples: e.samples, lcp: p75(e.lcp), inp: p75(e.inp), cls: p75(e.cls) }))
}
```

- [ ] **Step 2: Contract + handlers**

Under `admin` in the contract, after `audit`:

```ts
    telemetry: {
      errors: oc
        .route({ method: "GET", path: "/admin/telemetry/errors", summary: "Errors in the last 24 hours" })
        .errors(ADMIN_ERRORS)
        .input(empty)
        .output(TelemetryErrorsSchema),
      vitals: oc
        .route({ method: "GET", path: "/admin/telemetry/vitals", summary: "p75 web vitals over 7 days" })
        .errors(ADMIN_ERRORS)
        .input(empty)
        .output(TelemetryVitalsSchema),
    },
```

Router, inside `admin`:

```ts
    telemetry: {
      errors: adminApi.admin.telemetry.errors.handler(async ({ context }) => {
        const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
        const totals = await context.db.telemetry.errorTotals(since)
        const top = await context.db.telemetry.errorSummary(since, 5)
        return {
          window: "24h" as const,
          ...totals,
          top: top.map((r) => ({
            fingerprint: r.fingerprint, app: r.app, kind: r.kind, message: r.message, route: r.route,
            digest: r.digest, count: Number(r.count), firstSeen: r.first_seen, lastSeen: r.last_seen,
          })),
        }
      }),
      vitals: adminApi.admin.telemetry.vitals.handler(async ({ context }) => {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
        return { window: "7d" as const, apps: vitalsByApp(await context.db.telemetry.vitalSamples(since)) }
      }),
    },
```

Tests (append to `apps/api/src/telemetry.test.ts`, starting a superadmin app as `admin-api.test.ts` does with `signUpVerified(app, ROOT)`):

```ts
describe("admin.telemetry", () => {
  test("errors: 24h totals and top five; vitals: p75 per app; NOT_FOUND for non-admins", async () => {
    const adminApp = await start({ superadminEmails: ["root@example.com"] })
    try {
      const { signUpVerified } = await import("./test-server")
      const root = await signUpVerified(adminApp, "root@example.com")
      const user = await signUpVerified(adminApp)
      const svc = clientFor(adminApp)
      for (let i = 0; i < 3; i++) await svc.telemetry.ingest({ app: "app", errors: [boom("hot")], vitals: [] })
      await svc.telemetry.ingest({ app: "www", errors: [boom("cold")], vitals: [1000, 2000, 3000, 4000].map((value) => ({ name: "LCP" as const, value, rating: "good" as const, route: "/" })) })
      const errors = await root.client.admin.telemetry.errors()
      expect(errors).toMatchObject({ window: "24h", distinct: 2, total: 4 })
      expect(errors.top[0]).toMatchObject({ app: "app", message: "hot", count: 3 })
      const vitals = await root.client.admin.telemetry.vitals()
      expect(vitals.apps.find((a) => a.app === "www")).toEqual({ app: "www", samples: 4, lcp: 3000, inp: null, cls: null })
      const [denied] = await safe(user.client.admin.telemetry.errors())
      expect(denied).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await adminApp.stop()
    }
  })
})
```

- [ ] **Step 3: The cards — helper test first**

`apps/auth/src/lib/vitals.test.ts`:

```ts
import { expect, test } from "bun:test"
import { formatVital, ratingLabel } from "./vitals"

test("formatVital prints seconds for LCP, ms for INP, a bare number for CLS", () => {
  expect(formatVital("LCP", 2340)).toBe("2.3 s")
  expect(formatVital("INP", 180.4)).toBe("180 ms")
  expect(formatVital("CLS", 0.0512)).toBe("0.05")
  expect(formatVital("LCP", null)).toBe("—")
})
test("ratingLabel", () => {
  expect(ratingLabel("good")).toBe("Good")
  expect(ratingLabel("needs-improvement")).toBe("Needs improvement")
  expect(ratingLabel("poor")).toBe("Poor")
})
```

`apps/auth/src/lib/vitals.ts`:

```ts
export type VitalKey = "LCP" | "INP" | "CLS"
export function formatVital(name: VitalKey, value: number | null): string {
  if (value === null) return "—"
  if (name === "LCP") return `${(value / 1000).toFixed(1)} s`
  if (name === "INP") return `${Math.round(value)} ms`
  return value.toFixed(2)
}
export const ratingLabel = (rating: "good" | "needs-improvement" | "poor") =>
  rating === "good" ? "Good" : rating === "needs-improvement" ? "Needs improvement" : "Poor"
export const ratingClass = (rating: "good" | "needs-improvement" | "poor") =>
  rating === "good" ? "text-emerald-700 dark:text-emerald-400" : rating === "needs-improvement" ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"
```

`apps/auth/src/components/admin/errors-card.tsx`:

```tsx
import type { TelemetryErrors } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/components/table"
import { formatDateTime } from "@/lib/admin"

const truncate = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function ErrorsCard({ errors }: { errors: TelemetryErrors }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Errors (24 h)</CardTitle>
        <CardDescription>
          {errors.distinct} distinct · {errors.total} events
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errors.top.length === 0 ? (
          <p className="text-muted-foreground text-sm">No errors in the last 24 hours.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">The five most frequent errors in the last 24 hours</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.top.map((e) => (
                  <TableRow key={e.fingerprint}>
                    <TableCell>{e.app}</TableCell>
                    <TableCell className="font-mono text-xs">{e.kind}</TableCell>
                    <TableCell title={e.message}>{truncate(e.message)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.route ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.count}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <time dateTime={e.lastSeen}>{formatDateTime(e.lastSeen)}</time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

`apps/auth/src/components/admin/vitals-card.tsx`:

```tsx
import { rateVital, type TelemetryVitals } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/components/table"
import { formatVital, ratingClass, ratingLabel, type VitalKey } from "@/lib/vitals"

function Cell({ name, value }: { name: VitalKey; value: number | null }) {
  if (value === null) return <TableCell>—</TableCell>
  const rating = rateVital(name, value)
  return (
    <TableCell className={ratingClass(rating)}>
      <span className="tabular-nums">{formatVital(name, value)}</span>{" "}
      <span className="text-xs">({ratingLabel(rating)})</span>
    </TableCell>
  )
}

export function VitalsCard({ vitals }: { vitals: TelemetryVitals }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Web vitals (7 d)</CardTitle>
        <CardDescription>p75 per app · LCP, INP, CLS</CardDescription>
      </CardHeader>
      <CardContent>
        {vitals.apps.length === 0 ? (
          <p className="text-muted-foreground text-sm">No vitals reported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">p75 web vitals per app over the last 7 days</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead>LCP</TableHead>
                  <TableHead>INP</TableHead>
                  <TableHead>CLS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vitals.apps.map((a) => (
                  <TableRow key={a.app}>
                    <TableCell>{a.app}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.samples}</TableCell>
                    <Cell name="LCP" value={a.lcp} />
                    <Cell name="INP" value={a.inp} />
                    <Cell name="CLS" value={a.cls} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

`admin-home-view.tsx`: props become `{ metrics, errors, vitals }`; render after the Workspaces section:

```tsx
      <section aria-labelledby="health" className="grid gap-3">
        <h2 id="health" className="text-lg font-medium">Health</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <ErrorsCard errors={errors} />
          <VitalsCard vitals={vitals} />
        </div>
      </section>
```

`(gated)/page.tsx`: load the three in parallel (`Promise.all` of three `safe(...)` calls is fine — separate HTTP requests), NOT_FOUND → `notFound()` as today, then `<AdminHomeView metrics errors vitals />`.

- [ ] **Step 4: Verify, commit**

```bash
cd apps/api && bun test && bun run test:postgres && cd ../auth && bun test && cd ../.. && bun run --filter @repo/api typecheck && bun run --filter @repo/api-contract typecheck && bun run --filter @repo/auth typecheck && bunx biome check apps/api apps/auth packages/api-contract && bun --filter @repo/auth build
git add -A && git commit -m "feat(api,auth): admin Health cards — errors (24 h) and p75 web vitals (7 d)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Docs, env examples, guide, ROADMAP, full gate

**Files:**
- Modify: `CLAUDE.md` (Packages list: `packages/telemetry`; **Telemetry** entry under **Design System Single Points**; env table rows `TELEMETRY_PROVIDER`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and `API_URL`/`API_SERVICE_TOKEN` now read by every Next app and `ai`; "Adding a new subdomain app" gains the route + `BrowserTelemetry` step; Quality gates' typecheck/test lists mention `telemetry`)
- Modify: `.env.example`, `apps/api/.env.example`, `apps/ai/.env.example` (if present), `docker-compose.yml` (api: `TELEMETRY_PROVIDER`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`; ai: `API_URL`, `API_SERVICE_TOKEN`)
- Create: `docs/guides/sentry.md`
- Modify: `apps/api/README.md` (Telemetry section: tables, retention, provider, what Sentry receives), `apps/ai/README.md` (one paragraph), `apps/auth/README.md` (Health cards), `docs/ROADMAP.md` (tick), the spec's status line + a **Deviations** list (no `data-app`; browser batches carry no `app`)

- [ ] **Step 1: CLAUDE.md**

Under **Design System Single Points** add:

> - **Telemetry** — `@repo/telemetry`: errors and web vitals, one way. Browsers call `reportError` / `reportVital` (`@repo/telemetry/browser`) which `sendBeacon` to the app's own `POST /api/telemetry` (`createTelemetryRoute({ app })` from `@repo/telemetry/server`, a three-line file per app); the route stamps the app, keys the api's limiter per browser (`anon:<ip hash>`) and forwards to `telemetry.ingest` with the service token — browsers never call `apps/api`, no CSP change, no key in the client. `WebVitals` (every layout) reports CLS/INP/LCP/FCP/TTFB outside development; `BrowserTelemetry` (next to it) installs `window.onerror` / `unhandledrejection`; every `error.tsx` reports its boundary. Consent: events carry route (pathname only), kind, message, stack, digest and metrics always; the user agent only when the `consent` cookie is `all`; never an ip, user id, cookie or body. `apps/api` stores errors per fingerprint-day (`telemetry_errors`, 30 days) and vitals (`telemetry_vitals`, 7 days), pruned on ingest, and records its own 5xx; `apps/ai` reports through the api when `API_URL` / `API_SERVICE_TOKEN` are set. `TELEMETRY_PROVIDER=store` (default) keeps everything in the tables; `sentry` also forwards each new error to Sentry's envelope endpoint over `fetch` (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`; no SDK) — see `docs/guides/sentry.md`. Superadmins see the last 24 h of errors and p75 vitals per app on `/admin`. Reporting never throws and the route always answers 204.

Env table: `TELEMETRY_PROVIDER` (api; `store`; `store` or `sentry`), `SENTRY_DSN` / `SENTRY_ENVIRONMENT` (api; —; required iff `sentry` / optional), and amend the `API_URL`, `API_SERVICE_TOKEN` row's Apps column to "every Next app (optional for docs/help/jobs: telemetry drops without them), ai (optional)".

- [ ] **Step 2: Guide, env examples, Compose, READMEs, ROADMAP, spec**

`docs/guides/sentry.md`: create a project, copy the DSN, set `TELEMETRY_PROVIDER=sentry`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT` on the api, what arrives (one event per new fingerprint per day, tags app/kind/route, raw frames — no source maps), what does not (vitals, user data), how to test locally with a listener (`bun -e 'Bun.serve({ port: 9999, fetch: async (r) => { console.log(await r.text()); return new Response("{}") } })'` and `SENTRY_DSN=http://key@localhost:9999/1`).

Env examples and Compose per the file list. READMEs per the file list. ROADMAP: tick "Error tracking and a production destination for web vitals". Spec: status → `implemented`, **Deviations**: no `data-app` and browser batches carry no `app` (the route stamps it); `WebVitals` does not call `useConsent()` — the browser client reads the `consent` cookie itself at send time, which is the same source of truth without a React dependency in `@repo/telemetry`.

- [ ] **Step 3: Full gate, commit**

```bash
bun run ci
cd apps/api && bun run test:postgres && cd ../..
git add -A && git commit -m "docs: telemetry — CLAUDE.md, env examples, Sentry guide, READMEs, ROADMAP

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Controller's browser pass (after the final review, before the PR)

Dev stack with the api's default `store` provider: open `app` and `www` pages (vitals flow: check the api log shows no errors and the admin **Web vitals** card fills after a few navigations); trigger a boundary error (e.g. a note page with a non-numeric id if it throws, or a temporary throw on a dev page — reverted before commit) → the **Errors (24 h)** card shows app, kind `boundary`, route and count, and a second trigger counts up; with the consent banner set to "necessary only" confirm (api log or table) that the row has no `user_agent`; restart the api with `TELEMETRY_PROVIDER=sentry SENTRY_DSN=http://key@localhost:9999/1` and a local listener → the envelope prints. Back up and restore the dev SQLite file around the pass.
