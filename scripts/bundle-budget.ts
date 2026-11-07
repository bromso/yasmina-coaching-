// First-load JS per route, from a Next 16 webpack build (`apps/<app>/.next`), against
// `perf/budgets.json`'s `bundles`. `bun scripts/bundle-budget.ts [app…]` (default: every app with a
// build); `--write-results` also writes the measurement to `perf/.results/bundles.json` for
// `bun run perf:update`. Exits 1 on any route over its budget or with no budget at all.
//
// What a modern browser downloads on a first visit, verified against the prerendered HTML of a
// real build: the build manifest's `rootMainFiles`, then the client chunk group of every segment
// entry on the route's path — each layout, template, error, loading and not-found boundary from
// the root down, the root's global-error, and the page itself. The manifest's `polyfillFiles` are
// left out: Next loads them with `noModule`, so only legacy browsers fetch them (about 39.5 KB
// gzip on www, on top of every route's number). Next 16 no longer writes
// `app-build-manifest.json`; the groups come from the client reference manifest, where every
// client module lists its entry's whole chunk group, ending with the entry chunk
// (`static/chunks/app/<dir>/<kind>-<hash>.js`). A route's files are the union of those groups,
// each file gzipped once (level 9) and summed. Known gap: the manifest records each client module
// under one entry only, so a page whose client modules are all shared with a sibling page
// reconstructs as an empty group and is undercounted (Next's own HTML emits the sibling's chunks
// there). Imports nothing outside the repo (runs in `bun test scripts` before `bun install`).
//
// Guarded against a silent false pass if Next's manifest shape ever changes underneath this (an
// upgrade renaming entry chunks, a hash alphabet change, a Turbopack output): `entryGroups` throws
// when no chunk matched `ENTRY_CHUNK` at all (every group empty), and `routeFiles` throws per route
// when none of its own keys (`|global-error`, every `<prefix>|<kind>`, `<dir>|page`) matched a
// group — i.e. its files are only the root's — rather than silently measuring it as lighter than it
// is. `main` catches either and fails that app loudly, naming it and what broke.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { Glob } from "bun"
import { type Budgets, formatBreach, loadBudgets, RESULTS_DIR } from "../perf/budgets"

export type Chunk = { file: string; kb: number }
export type RouteMeasure = { kb: number; chunks: Chunk[] }

// Segment boundaries Next creates a client entry for at every level of the route's path.
const SEGMENT_KINDS = [
  "layout",
  "template",
  "error",
  "loading",
  "not-found",
  "forbidden",
  "unauthorized",
]
const ENTRY_CHUNK = /^static\/chunks\/app\/(?:(.*)\/)?([a-z-]+)-[0-9a-f]+\.js$/

type ClientModule = { chunks?: unknown[] }

/** Runs a `*_client-reference-manifest.js` against a throwaway global and returns its entries. */
function readClientManifest(
  file: string
): Record<string, { clientModules?: Record<string, ClientModule> }> {
  const scope: Record<string, unknown> = {}
  new Function("globalThis", "self", readFileSync(file, "utf8"))(scope, scope)
  return (scope.__RSC_MANIFEST ?? {}) as Record<
    string,
    { clientModules?: Record<string, ClientModule> }
  >
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** `entry key` (`<dir>|<kind>`, dir decoded, `""` for the root) → every file of its chunk group. */
function entryGroups(nextDir: string): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>()
  const glob = new Glob("server/app/**/*_client-reference-manifest.js")
  for (const file of glob.scanSync({ cwd: nextDir, dot: true })) {
    for (const entry of Object.values(readClientManifest(join(nextDir, file)))) {
      for (const mod of Object.values(entry.clientModules ?? {})) {
        const files = (mod.chunks ?? []).filter(
          (c, i): c is string => i % 2 === 1 && typeof c === "string"
        )
        const last = files.at(-1)?.split("?")[0]
        const match = last ? decode(last).match(ENTRY_CHUNK) : null
        if (!match) continue
        const key = `${match[1] ?? ""}|${match[2]}`
        const group = groups.get(key) ?? new Set<string>()
        for (const f of files) group.add(f.split("?")[0] as string)
        groups.set(key, group)
      }
    }
  }
  if (groups.size === 0) {
    throw new Error(
      "no entry chunk groups found — Next's client-reference-manifest format may have changed"
    )
  }
  return groups
}

/** `/(marketing)/about` → `/about`, as `routeOf` names routes. */
const routeKey = (dir: string) =>
  `/${dir
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .join("/")}`

/** Every page route of a build → the files its first visit loads (sorted). */
export function routeFiles(nextDir: string): Map<string, string[]> {
  const build = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8")) as {
    rootMainFiles?: string[]
  }
  // `polyfillFiles` are `noModule`: a modern browser never downloads them.
  const root = build.rootMainFiles ?? []
  const appPaths = JSON.parse(
    readFileSync(join(nextDir, "server/app-paths-manifest.json"), "utf8")
  ) as Record<string, string>
  const groups = entryGroups(nextDir)
  const out = new Map<string, string[]>()
  for (const key of Object.keys(appPaths)) {
    if (!key.endsWith("/page")) continue
    const dir = key.slice(1, -"/page".length).replace(/^\/|\/$/g, "")
    if (dir === "_not-found" || dir === "_global-error") continue
    const segments = dir ? dir.split("/") : []
    const files = new Set(root)
    let matchedOwnGroup = false
    const add = (entry: string) => {
      const group = groups.get(entry)
      if (!group) return
      matchedOwnGroup = true
      for (const f of group) files.add(f)
    }
    add("|global-error")
    for (let depth = 0; depth <= segments.length; depth++) {
      const prefix = segments.slice(0, depth).join("/")
      for (const kind of SEGMENT_KINDS) add(`${prefix}|${kind}`)
    }
    add(`${dir}|page`)
    if (!matchedOwnGroup) {
      throw new Error(
        `route "${routeKey(dir)}" resolved no segment group of its own (only ${root.length} root file(s)) — Next's manifest format may have changed`
      )
    }
    out.set(routeKey(dir), [...files].sort())
  }
  return out
}

const KB = 1000
const round1 = (n: number) => Math.round(n * 10) / 10

/** First-load JS per route in gzip KB, with each route's chunks largest first. */
export function measureApp(nextDir: string): Record<string, RouteMeasure> {
  const sizes = new Map<string, number>()
  const gzipBytes = (file: string): number => {
    const cached = sizes.get(file)
    if (cached !== undefined) return cached
    const path = [join(nextDir, file), join(nextDir, decode(file))].find((p) => existsSync(p))
    if (!path) throw new Error(`${file} is in the manifests but not in ${nextDir}`)
    const bytes = Bun.gzipSync(readFileSync(path), { level: 9 }).byteLength
    sizes.set(file, bytes)
    return bytes
  }
  const out: Record<string, RouteMeasure> = {}
  for (const [route, files] of routeFiles(nextDir)) {
    const chunks = files
      .map((file) => ({ file, bytes: gzipBytes(file) }))
      .sort((a, b) => b.bytes - a.bytes)
    out[route] = {
      kb: round1(chunks.reduce((sum, c) => sum + c.bytes, 0) / KB),
      chunks: chunks.map((c) => ({ file: c.file, kb: round1(c.bytes / KB) })),
    }
  }
  return out
}

const LARGEST = 5

/** Each route against its budget: printable lines, and whether the app passes. */
export function checkApp(
  app: string,
  measured: Record<string, RouteMeasure>,
  budgets: Record<string, number> | undefined
): { ok: boolean; lines: string[] } {
  const lines: string[] = []
  let ok = true
  const routes = Object.keys(measured).sort()
  const width = Math.max(...routes.map((r) => r.length), 1)
  for (const route of routes) {
    const { kb, chunks } = measured[route] as RouteMeasure
    const budget = budgets?.[route]
    if (budget === undefined) {
      ok = false
      lines.push(
        `FAIL ${app} ${route}: ${kb} KB and no budget — add it with \`bun run perf:update\` after \`bun scripts/bundle-budget.ts --write-results ${app}\``
      )
    } else if (kb > budget) {
      ok = false
      const largest = chunks
        .slice(0, LARGEST)
        .map((c) => `${c.file} ${c.kb} KB`)
        .join(", ")
      lines.push(
        `FAIL ${formatBreach({ key: `${app} ${route}`, metric: "first-load JS", runs: [kb], budget, unit: " KB" })}`
      )
      lines.push(`     largest chunks: ${largest}`)
    } else {
      lines.push(`ok   ${app} ${route.padEnd(width)}  ${kb} KB (budget ${budget} KB)`)
    }
  }
  return { ok, lines }
}

const APPS_DIR = join(import.meta.dir, "..", "apps")
const nextDirOf = (app: string) => join(APPS_DIR, app, ".next")

function main(argv: string[]): number {
  const write = argv.includes("--write-results")
  const named = argv.filter((a) => !a.startsWith("--"))
  const apps =
    named.length > 0
      ? named
      : readdirSync(APPS_DIR).filter((a) => existsSync(join(nextDirOf(a), "build-manifest.json")))
  if (apps.length === 0) {
    console.error("No built app found (apps/<app>/.next). Build one first.")
    return 1
  }
  const budgets: Budgets = loadBudgets()
  const results: Record<string, Record<string, number>> = {}
  let ok = true
  for (const app of apps) {
    const nextDir = nextDirOf(app)
    if (!existsSync(join(nextDir, "build-manifest.json"))) {
      console.error(`FAIL ${app}: no build at ${nextDir}`)
      ok = false
      continue
    }
    let measured: Record<string, RouteMeasure>
    try {
      measured = measureApp(nextDir)
    } catch (err) {
      console.error(`FAIL ${app}: ${(err as Error).message}`)
      ok = false
      continue
    }
    results[app] = Object.fromEntries(Object.entries(measured).map(([r, m]) => [r, m.kb]))
    const check = checkApp(app, measured, budgets.bundles[app])
    for (const line of check.lines) console.log(line)
    ok &&= check.ok
  }
  if (write) {
    const file = join(RESULTS_DIR, "bundles.json")
    const previous = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).bundles ?? {}) : {}
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify({ bundles: { ...previous, ...results } }, null, 2)}\n`)
    console.log(`Wrote ${file}`)
  }
  return ok ? 0 : 1
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
