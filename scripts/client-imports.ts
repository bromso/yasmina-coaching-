/**
 * What a `"use client"` file may import from three packages whose root entries must never reach a
 * browser bundle. Run by `scripts/client-imports.test.ts` (in `bun test scripts`, which CI runs on
 * every change, before `bun install`: so nothing here imports a package — `node:fs`, `node:path`,
 * Bun's `Glob` and regular expressions only).
 *
 * - **`@repo/api-contract`** (PR #100): a VALUE import from the root entry pulls the whole
 *   contract — every Zod schema — into the browser. Values come through the package's narrow,
 *   Zod-free subpaths (`./billing-plans`, `./roles`, `./email-change-limits`, `./invite-domains`,
 *   …). And (PR #102) a subpath carrying a value must itself be Zod-free: its file, and every file
 *   it reaches through relative imports inside `packages/api-contract/src`, may import no bare
 *   package at all.
 * - **`@repo/public-api-contract`** (the webhooks branch): the same two rules, for the same reason —
 *   its root is the `/v1` oRPC contract and its Zod schemas, and `./webhooks` carries the payload
 *   schemas (and imports the root). `./webhook-events` (the event names) is the Zod-free subpath.
 * - **`@repo/sites`** (the email-change branch): every function on the root entry reads
 *   `process.env` at call time (`siteUrl`, `siteNav`, …), which a browser bundle never inlines, so
 *   a client component gets such a value as a prop from a server component instead.
 *   `@repo/sites/brand` (`BRAND_NAME`) is the client-safe subpath.
 *
 * A type-only import is erased at compile time and costs nothing, so it is never a violation.
 *
 * Beyond the client file's own imports, the scan follows its value imports of local modules
 * (`./`, `../`, `@/` — the app's `src/`) into files with neither a `"use client"` nor a
 * `"use server"` directive, transitively: such a file is bundled for the browser along with the
 * component that imports it (a `"use client"` file is checked on its own, and a `"use server"`
 * file's exports reach the browser only as references). So a client component importing
 * `@/lib/foo`, which imports `siteUrl`, fails naming the chain. A local module nothing on the
 * client side reaches (`apps/account/src/lib/reauth.ts`, imported only by server actions) is
 * never checked.
 *
 * Plain regexes, not the TypeScript compiler: the import and export clause syntax is regular
 * enough. Recognised: `import x from`, `import { a, type b } from`, `import * as x from`,
 * `import x, { a } from`, `import x, * as y from`, `import type … from`, `export { a } from`,
 * `export type { … } from`, `export * from`, `export * as x from`, and side-effect
 * `import "x"`. Each must start a line (after optional whitespace). A dynamic `import()` is not
 * followed.
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { Glob } from "bun"

/** One import or re-export statement: where from, and the value bindings it carries. */
export type ModuleImport = {
  specifier: string
  /** The value bindings (`[]` for a type-only clause). A side-effect import is `["(side effect)"]`. */
  values: string[]
}

const IMPORT_RE =
  /(?:^|\n)[ \t]*import\s+(type\s+)?((?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*\s*as\s+[\w$]+)|[\w$]+)\s*from\s*["']([^"']+)["']/g
const EXPORT_FROM_RE =
  /(?:^|\n)[ \t]*export\s+(type\s+)?(\{[^}]*\}|\*(?:\s*as\s+[\w$]+)?)\s*from\s*["']([^"']+)["']/g
const SIDE_EFFECT_RE = /(?:^|\n)[ \t]*import\s*["']([^"']+)["']/g

/** The value bindings of one clause (`x`, `{ a, type b }`, `* as x`, `x, { … }`, `*`). */
function clauseValues(clause: string): string[] {
  const values: string[] = []
  let rest = clause.trim()
  const defaultMatch = rest.match(/^([\w$]+)\s*(?:,\s*|$)/)
  if (defaultMatch?.[1] && !rest.startsWith("{")) {
    values.push(defaultMatch[1])
    rest = rest.slice(defaultMatch[0].length).trim()
  }
  if (rest.startsWith("{")) {
    for (const item of rest.slice(1, rest.lastIndexOf("}")).split(",")) {
      const name = item.trim()
      if (name && !name.startsWith("type ")) values.push(name)
    }
  } else if (rest.startsWith("*")) {
    values.push(rest.replace(/\s+/g, " "))
  }
  return values
}

/** Every import and re-export statement in `source`, in no particular order. */
export function moduleImports(source: string): ModuleImport[] {
  const found: ModuleImport[] = []
  for (const re of [IMPORT_RE, EXPORT_FROM_RE]) {
    for (const [, typeKeyword, clause, specifier] of source.matchAll(re)) {
      found.push({
        specifier: specifier ?? "",
        values: typeKeyword ? [] : clauseValues(clause ?? ""),
      })
    }
  }
  for (const [, specifier] of source.matchAll(SIDE_EFFECT_RE)) {
    found.push({ specifier: specifier ?? "", values: ["(side effect)"] })
  }
  return found
}

/** The file's directive (`"use client"` / `"use server"`), if its first statement is one —
 * blank lines, line comments and block comments above it aside. */
export function directiveOf(source: string): "client" | "server" | null {
  const body = source.replace(/^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/, "")
  const match = body.match(/^(["'])use (client|server)\1/)
  return match ? (match[2] as "client" | "server") : null
}

/** A file path for `base`, trying the extensions and index files a bundler would. */
function resolveFile(base: string): string | null {
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (existsSync(candidate) && !candidate.endsWith("/") && /\.tsx?$/.test(candidate)) {
      return candidate
    }
  }
  return null
}

/** A local import (`./`, `../`, or `@/` = the app's `src/`) resolved to its file, else null. */
function resolveLocal(fromFile: string, specifier: string, appSrc: string): string | null {
  if (specifier.startsWith(".")) return resolveFile(resolve(dirname(fromFile), specifier))
  if (specifier.startsWith("@/")) return resolveFile(resolve(appSrc, specifier.slice(2)))
  return null
}

/**
 * Walks `entryFile` and every file it reaches through relative value imports, all inside `root`,
 * and returns the chain (entry first) to the first bare (package) value import, with its
 * specifier — or null when the whole reachable graph imports only relative files.
 */
export function findBarePackageImport(
  entryFile: string,
  root: string,
  visited: Set<string> = new Set()
): { chain: string[]; bareSpecifier: string } | null {
  if (visited.has(entryFile) || !existsSync(entryFile)) return null
  visited.add(entryFile)
  const imports = moduleImports(readFileSync(entryFile, "utf8")).filter((i) => i.values.length)
  const bare = imports.find((i) => !i.specifier.startsWith("."))
  if (bare) return { chain: [entryFile], bareSpecifier: bare.specifier }
  for (const { specifier } of imports) {
    const next = resolveFile(resolve(dirname(entryFile), specifier))
    if (!next?.startsWith(root)) continue
    const found = findBarePackageImport(next, root, visited)
    if (found) return { chain: [entryFile, ...found.chain], bareSpecifier: found.bareSpecifier }
  }
  return null
}

/** The contract packages guarded alike: no root value import, Zod-free subpaths only. */
const CONTRACTS = [
  { name: "api-contract", dir: "packages/api-contract" },
  { name: "public-api-contract", dir: "packages/public-api-contract" },
] as const
type ContractName = (typeof CONTRACTS)[number]["name"]

export type ClientImportViolation =
  | { rule: `${ContractName} root`; chain: string[]; value: string }
  | { rule: `${ContractName} subpath`; chain: string[]; subpath: string; bareChain: string[] }
  | { rule: "sites root"; chain: string[]; value: string }

export type ScanResult = {
  violations: ClientImportViolation[]
  /** The `<client file>::<subpath>` allowlist entries that matched something. */
  usedExceptions: Set<string>
}

/**
 * Every violation under `apps/*\/src` of `repoRoot`. `exceptions` holds reviewed
 * `<client file>::<subpath>` pairs (repo-relative client file, e.g. `/realtime`) the subpath rule
 * lets through — `@repo/api-contract`'s by subpath alone, another contract's as
 * `<client file>::@repo/<package><subpath>`; which of them matched comes back so a stale one can
 * fail.
 */
export function scanClientImports(
  repoRoot: string,
  exceptions: ReadonlySet<string> = new Set()
): ScanResult {
  const contracts = CONTRACTS.map(({ name, dir }) => {
    const pkg = resolve(repoRoot, dir, "package.json")
    return {
      name,
      pattern: new RegExp(`^@repo/${name}(/[\\w-]+)?$`),
      pkgDir: resolve(repoRoot, dir),
      src: resolve(repoRoot, dir, "src"),
      exportsMap: existsSync(pkg)
        ? (JSON.parse(readFileSync(pkg, "utf8")) as { exports: Record<string, string> }).exports
        : {},
    }
  })
  const rel = (file: string) => relative(repoRoot, file)
  const violations: ClientImportViolation[] = []
  const usedExceptions = new Set<string>()

  const checkFile = (chain: string[], source: string, clientFile: string) => {
    for (const { specifier, values } of moduleImports(source)) {
      if (values.length === 0) continue
      const contract = contracts.find((c) => c.pattern.test(specifier))
      if (contract) {
        const subpath = specifier.match(contract.pattern)?.[1]
        if (!subpath) {
          for (const value of values) {
            violations.push({ rule: `${contract.name} root`, chain, value })
          }
          continue
        }
        const entry = contract.exportsMap[`.${subpath}`]
        if (!entry) continue // an unknown subpath: TypeScript refuses it already.
        const found = findBarePackageImport(resolve(contract.pkgDir, entry), contract.src)
        if (!found) continue
        const key =
          contract.name === "api-contract"
            ? `${clientFile}::${subpath}`
            : `${clientFile}::@repo/${contract.name}${subpath}`
        if (exceptions.has(key)) {
          usedExceptions.add(key)
          continue
        }
        violations.push({
          rule: `${contract.name} subpath`,
          chain,
          subpath,
          bareChain: found.chain.map(rel),
        })
        continue
      }
      if (specifier === "@repo/sites") {
        for (const value of values) violations.push({ rule: "sites root", chain, value })
      }
    }
  }

  for (const file of new Glob("apps/*/src/**/*.{ts,tsx}").scanSync(repoRoot)) {
    const clientPath = resolve(repoRoot, file)
    const source = readFileSync(clientPath, "utf8")
    if (directiveOf(source) !== "client") continue
    const appSrc = resolve(repoRoot, file.split("/").slice(0, 3).join("/"))
    const clientFile = rel(clientPath)
    // The client file itself, then every local module it pulls into the bundle.
    const visited = new Set<string>([clientPath])
    const queue: { path: string; chain: string[]; source: string }[] = [
      { path: clientPath, chain: [clientFile], source },
    ]
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      checkFile(item.chain, item.source, clientFile)
      for (const { specifier, values } of moduleImports(item.source)) {
        if (values.length === 0) continue
        const next = resolveLocal(item.path, specifier, appSrc)
        if (!next || visited.has(next)) continue
        visited.add(next)
        const nextSource = readFileSync(next, "utf8")
        if (directiveOf(nextSource) !== null) continue
        queue.push({ path: next, chain: [...item.chain, rel(next)], source: nextSource })
      }
    }
  }
  return { violations, usedExceptions }
}
