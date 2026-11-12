import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import {
  directiveOf,
  findBarePackageImport,
  moduleImports,
  scanClientImports,
} from "./client-imports"

/**
 * Reviewed `<client file>::<subpath>` pairs the api-contract subpath rule would otherwise fail on:
 *  - `apps/app/src/components/live-notes.tsx` imports `RealtimeEventSchema` through
 *    `@repo/api-contract/realtime` (directly, and through `@/lib/realtime`) and calls
 *    `.safeParse()` on incoming SSE payloads in the browser: a real use of Zod client-side, not an
 *    accidental pull-in. A stale entry (the import changes or goes) fails the run, the same
 *    convention as `apps/e2e/a11y.allowlist.json`.
 *
 * `apps/help/src/components/contact-form.tsx` had the bug shape against `@repo/api-contract/support`
 * and `apps/jobs/src/components/apply-form.tsx` against `/jobs`; both were fixed (the
 * `*-limits.ts` subpaths), not allowlisted.
 */
const KNOWN_SUBPATH_EXCEPTIONS = new Set(["apps/app/src/components/live-notes.tsx::/realtime"])

const repoRoot = resolve(import.meta.dir, "..")

describe("the repo's client files", () => {
  test("import no value from the root of @repo/api-contract, @repo/public-api-contract or @repo/sites, nor legalUrl, nor a Zod-carrying subpath", () => {
    const { violations, usedExceptions } = scanClientImports(repoRoot, KNOWN_SUBPATH_EXCEPTIONS)
    expect(violations).toEqual([])
    const stale = [...KNOWN_SUBPATH_EXCEPTIONS].filter((key) => !usedExceptions.has(key))
    expect(stale).toEqual([])
  })
})

describe("the client-safe @repo/api-contract subpaths", () => {
  // Subpaths documented as allowed in client code (the invitation domain rules, which apps/account
  // uses server-side today; the terms version; the notification vocabulary): each must stay
  // Zod-free, or the rule above would fail the first client file that imports one. Checked here
  // so a regression names the subpath itself.
  const contractSrc = join(repoRoot, "packages/api-contract/src")
  test.each(["invite-domains", "legal", "notifications"])(
    "./%s reaches no bare package",
    (subpath) => {
      expect(findBarePackageImport(join(contractSrc, `${subpath}.ts`), contractSrc)).toBeNull()
    }
  )
})

describe("moduleImports", () => {
  const values = (source: string) =>
    moduleImports(source).map(({ specifier, values }) => [specifier, values])

  test("named, type-qualified, default, namespace and mixed clauses", () => {
    expect(values('import { a, type B, c as d } from "x"')).toEqual([["x", ["a", "c as d"]]])
    expect(values('import x from "x"')).toEqual([["x", ["x"]]])
    expect(values('import * as s from "@repo/sites"')).toEqual([["@repo/sites", ["* as s"]]])
    expect(values('import d, { siteUrl } from "@repo/sites"')).toEqual([
      ["@repo/sites", ["d", "siteUrl"]],
    ])
    expect(values('import d, * as all from "y"')).toEqual([["y", ["d", "* as all"]]])
  })

  test("a multi-line clause", () => {
    expect(values('import {\n  siteUrl,\n  type Env,\n} from "@repo/sites"\n')).toEqual([
      ["@repo/sites", ["siteUrl"]],
    ])
  })

  test("type-only clauses carry no value", () => {
    expect(values('import type { A } from "x"')).toEqual([["x", []]])
    expect(values('import type X from "x"')).toEqual([["x", []]])
    expect(values('export type { A } from "x"')).toEqual([["x", []]])
    expect(values('import { type A, type B } from "x"')).toEqual([["x", []]])
  })

  test("re-exports and side-effect imports", () => {
    expect(values('export { siteUrl } from "@repo/sites"')).toEqual([["@repo/sites", ["siteUrl"]]])
    expect(values('export * from "z"')).toEqual([["z", ["*"]]])
    expect(values('export * as ns from "z"')).toEqual([["z", ["* as ns"]]])
    expect(values('import "@repo/api-contract"')).toEqual([
      ["@repo/api-contract", ["(side effect)"]],
    ])
  })

  test("only statements that start a line", () => {
    expect(values('const s = "import { a } from \\"x\\""')).toEqual([])
  })
})

describe("directiveOf", () => {
  test("the first statement, after blank lines and line or block comments", () => {
    expect(directiveOf('"use client"\nimport x from "x"')).toBe("client")
    expect(directiveOf("\n// note\n'use client'")).toBe("client")
    expect(directiveOf('/**\n * A doc comment.\n */\n"use client"\n')).toBe("client")
    expect(directiveOf('"use server"\n')).toBe("server")
    expect(directiveOf('import x from "x"\n"use client"')).toBeNull()
  })
})

/** Writes `files` (repo-relative path → contents) under a fresh temporary root. */
function fixtureRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "client-imports-"))
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), contents)
  }
  return root
}

describe("findBarePackageImport", () => {
  let root = ""
  beforeAll(() => {
    root = fixtureRepo({
      "src/jobs.ts": 'import { z } from "zod"\nexport const CV_UPLOAD_MESSAGE = "x"\n',
      "src/jobs-limits.ts": 'export const CV_UPLOAD_MESSAGE = "x"\n',
      "src/auth.ts": 'import { z } from "zod"\nexport const EmailSchema = z.string()\n',
      "src/support.ts":
        'import { EmailSchema } from "./auth"\nexport const SUPPORT_TOPICS = ["a"]\n',
      "src/clean.ts": 'import type { EmailSchema } from "./auth"\nexport const CLEAN = "x"\n',
    })
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const src = (name: string) => join(root, "src", name)

  test("a direct bare import (apply-form.tsx's old bug: jobs.ts importing zod)", () => {
    expect(findBarePackageImport(src("jobs.ts"), join(root, "src"))).toEqual({
      chain: [src("jobs.ts")],
      bareSpecifier: "zod",
    })
  })

  test("a Zod-free leaf (the jobs-limits.ts fix)", () => {
    expect(findBarePackageImport(src("jobs-limits.ts"), join(root, "src"))).toBeNull()
  })

  test("one relative hop away, with the full chain", () => {
    expect(findBarePackageImport(src("support.ts"), join(root, "src"))).toEqual({
      chain: [src("support.ts"), src("auth.ts")],
      bareSpecifier: "zod",
    })
  })

  test("a type-only import is not followed", () => {
    expect(findBarePackageImport(src("clean.ts"), join(root, "src"))).toBeNull()
  })
})

describe("scanClientImports", () => {
  const client = (body: string) => `"use client"\n${body}\n`
  let root = ""
  beforeAll(() => {
    root = fixtureRepo({
      "packages/api-contract/package.json": JSON.stringify({
        exports: {
          ".": "./src/index.ts",
          "./limits": "./src/limits.ts",
          "./schemas": "./src/schemas.ts",
        },
      }),
      "packages/api-contract/src/index.ts": 'import { z } from "zod"\nexport const PLANS = []\n',
      "packages/api-contract/src/limits.ts": "export const LIMIT = 3\n",
      "packages/api-contract/src/schemas.ts":
        'import { z } from "zod"\nexport const S = z.string()\n',
      // The public /v1 contract, guarded the same way: its root and `./webhooks` carry Zod (and
      // the oRPC contract); `./webhook-events` is Zod-free.
      "packages/public-api-contract/package.json": JSON.stringify({
        exports: {
          ".": "./src/index.ts",
          "./webhook-events": "./src/webhook-events.ts",
          "./webhooks": "./src/webhooks.ts",
        },
      }),
      "packages/public-api-contract/src/index.ts":
        'import { oc } from "@orpc/contract"\nexport const contract = oc\n',
      "packages/public-api-contract/src/webhook-events.ts":
        'export const WEBHOOK_EVENTS = ["ping"]\n',
      "packages/public-api-contract/src/webhooks.ts":
        'import { z } from "zod"\nexport { WEBHOOK_EVENTS } from "./webhook-events"\nexport const E = z.string()\n',
      // Root @repo/sites, in every clause shape.
      "apps/x/src/components/namespace.tsx": client('import * as sites from "@repo/sites"'),
      "apps/x/src/components/mixed.tsx": client('import d, { siteUrl } from "@repo/sites"'),
      "apps/x/src/components/reexport.tsx": client('export { siteUrl } from "@repo/sites"'),
      // `legalUrl` reads `SITE_DOMAIN` too; the rest of `@repo/sites/legal` is client-safe.
      "apps/x/src/components/legal-url.tsx": client(
        'import { LEGAL_PAGES, legalUrl } from "@repo/sites/legal"'
      ),
      "apps/x/src/components/legal-all.tsx": client('import * as legal from "@repo/sites/legal"'),
      "apps/x/src/components/commented.tsx": `/* A block comment first. */\n${client(
        'import { siteUrl } from "@repo/sites"'
      )}`,
      // Through a local module, by `@/` and by a relative path, two hops deep.
      "apps/x/src/components/via-lib.tsx": client('import { link } from "@/lib/link"'),
      "apps/x/src/components/via-relative.tsx": client('import { link } from "../lib/link"'),
      "apps/x/src/lib/link.ts": 'import { url } from "./url"\nexport const link = url\n',
      "apps/x/src/lib/url.ts":
        'import { siteUrl } from "@repo/sites"\nexport const url = siteUrl\n',
      // A server action file is not followed; a local module only servers import is not checked.
      "apps/x/src/components/calls-action.tsx": client('import { act } from "@/app/actions"'),
      "apps/x/src/app/actions.ts":
        '"use server"\nimport { siteUrl } from "@repo/sites"\nexport async function act() {}\n',
      "apps/x/src/lib/reauth.ts":
        'import { siteUrl } from "@repo/sites"\nexport const reauth = siteUrl\n',
      // Fine: types only, the brand subpath, a Zod-free contract subpath.
      "apps/x/src/components/fine.tsx": client(
        [
          'import type { Env } from "@repo/sites"',
          'import { BRAND_NAME } from "@repo/sites/brand"',
          'import { LEGAL_PAGES, legalPath, type LegalLocale } from "@repo/sites/legal"',
          'import { LIMIT } from "@repo/api-contract/limits"',
          'import { type Plan } from "@repo/api-contract"',
          'import type { Lib } from "@/lib/url"',
          'import { WEBHOOK_EVENTS } from "@repo/public-api-contract/webhook-events"',
          'import type { WebhookEvent } from "@repo/public-api-contract/webhooks"',
          'import type { PublicApiContract } from "@repo/public-api-contract"',
        ].join("\n")
      ),
      "apps/x/src/components/public-root.tsx": client(
        'import { contract } from "@repo/public-api-contract"'
      ),
      "apps/x/src/components/public-webhooks.tsx": client(
        'import { WEBHOOK_EVENTS } from "@repo/public-api-contract/webhooks"'
      ),
      // The contract root (a side-effect import too), and a Zod-carrying subpath.
      "apps/x/src/components/contract-root.tsx": client('import "@repo/api-contract"'),
      "apps/x/src/components/schemas.tsx": client('import { S } from "@repo/api-contract/schemas"'),
      "apps/x/src/components/allowed.tsx": client('import { S } from "@repo/api-contract/schemas"'),
    })
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const scan = (exceptions: string[] = []) => scanClientImports(root, new Set(exceptions))
  const firstFiles = (exceptions?: string[]) =>
    scan(exceptions)
      .violations.map((v) => v.chain.join(" > "))
      .sort()

  test("finds every shape, and only those", () => {
    expect(firstFiles(["apps/x/src/components/allowed.tsx::/schemas"])).toEqual([
      "apps/x/src/components/commented.tsx",
      "apps/x/src/components/contract-root.tsx",
      "apps/x/src/components/legal-all.tsx",
      "apps/x/src/components/legal-url.tsx",
      "apps/x/src/components/mixed.tsx",
      "apps/x/src/components/mixed.tsx",
      "apps/x/src/components/namespace.tsx",
      "apps/x/src/components/public-root.tsx",
      "apps/x/src/components/public-webhooks.tsx",
      "apps/x/src/components/reexport.tsx",
      "apps/x/src/components/schemas.tsx",
      "apps/x/src/components/via-lib.tsx > apps/x/src/lib/link.ts > apps/x/src/lib/url.ts",
      "apps/x/src/components/via-relative.tsx > apps/x/src/lib/link.ts > apps/x/src/lib/url.ts",
    ])
  })

  test("names the value, the rule and, for a subpath, the chain to the bare import", () => {
    const { violations } = scan(["apps/x/src/components/allowed.tsx::/schemas"])
    expect(violations).toContainEqual({
      rule: "sites root",
      chain: ["apps/x/src/components/namespace.tsx"],
      value: "* as sites",
    })
    expect(violations).toContainEqual({
      rule: "sites legalUrl",
      chain: ["apps/x/src/components/legal-url.tsx"],
      value: "legalUrl",
    })
    expect(violations).toContainEqual({
      rule: "sites legalUrl",
      chain: ["apps/x/src/components/legal-all.tsx"],
      value: "* as legal",
    })
    expect(violations).toContainEqual({
      rule: "api-contract root",
      chain: ["apps/x/src/components/contract-root.tsx"],
      value: "(side effect)",
    })
    expect(violations).toContainEqual({
      rule: "api-contract subpath",
      chain: ["apps/x/src/components/schemas.tsx"],
      subpath: "/schemas",
      bareChain: ["packages/api-contract/src/schemas.ts"],
    })
    expect(violations).toContainEqual({
      rule: "public-api-contract root",
      chain: ["apps/x/src/components/public-root.tsx"],
      value: "contract",
    })
    expect(violations).toContainEqual({
      rule: "public-api-contract subpath",
      chain: ["apps/x/src/components/public-webhooks.tsx"],
      subpath: "/webhooks",
      bareChain: ["packages/public-api-contract/src/webhooks.ts"],
    })
  })

  test("an allowlisted pair passes and is reported as used; without it, it fails", () => {
    const allowed = "apps/x/src/components/allowed.tsx::/schemas"
    expect([...scan([allowed]).usedExceptions]).toEqual([allowed])
    expect(firstFiles()).toContain("apps/x/src/components/allowed.tsx")
  })
})
