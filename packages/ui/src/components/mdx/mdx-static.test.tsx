import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import type { ComponentType, ReactElement, ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server.edge"
import { Tab } from "./tabs-stacked"

/** A `"use client"` directive, on its own line (the one shape that actually opts a module in). */
const USE_CLIENT_DIRECTIVE = /^["']use client["']\s*;?\s*$/m

/** Any `import`/`export` specifier naming another module to follow: `from "x"` — covers a plain
 * `import ... from "x"`, `export * from "x"`, `export { a } from "x"` and their type-only
 * variants alike, since all of them share the literal word "from" — and a bare side-effect
 * `import "x"` (no "from" clause at all). */
const FROM_IMPORT = /\bfrom\s+["']([^"']+)["']/g
const SIDE_EFFECT_IMPORT = /^\s*import\s+["']([^"']+)["']/gm

function specifiersIn(source: string): string[] {
  const specs: string[] = []
  for (const match of source.matchAll(FROM_IMPORT)) specs.push(match[1] as string)
  for (const match of source.matchAll(SIDE_EFFECT_IMPORT)) specs.push(match[1] as string)
  return specs
}

// packages/ui/src/components/mdx -> packages/ui
const UI_ROOT = join(import.meta.dir, "../../..")
const UI_EXPORTS: Record<string, unknown> = (
  JSON.parse(readFileSync(join(UI_ROOT, "package.json"), "utf8")) as {
    exports: Record<string, unknown>
  }
).exports

function exportStringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>
    const picked = record.default ?? record.types ?? Object.values(record)[0]
    return typeof picked === "string" ? picked : undefined
  }
  return undefined
}

/** The export map's own wildcard (`"./components/*": "./src/components/*.tsx"`) pattern
 * matching, picking the entry with the longest literal prefix when more than one matches. */
function bestWildcardMatch(subpath: string): unknown {
  let best: { prefixLength: number; value: unknown } | undefined
  for (const [key, value] of Object.entries(UI_EXPORTS)) {
    const star = key.indexOf("*")
    if (star === -1) continue
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue
    if (best && prefix.length <= best.prefixLength) continue
    const captured = subpath.slice(prefix.length, subpath.length - suffix.length)
    const raw = exportStringValue(value)
    if (!raw) continue
    best = { prefixLength: prefix.length, value: raw.replace("*", captured) }
  }
  return best?.value
}

/**
 * Resolves a package-absolute `@repo/ui/...` specifier through `packages/ui/package.json`'s own
 * `exports` map — the exact mechanism a real `import` follows — so `@repo/ui/components/icon`
 * (what the old `Callout` pulled a Client Component in through) lands on the real file, not just
 * a relative one.
 */
export function resolvePackageSpecifier(spec: string): string | undefined {
  if (spec !== "@repo/ui" && !spec.startsWith("@repo/ui/")) return undefined
  const subpath = spec === "@repo/ui" ? "." : `.${spec.slice("@repo/ui".length)}`
  const matched = subpath in UI_EXPORTS ? UI_EXPORTS[subpath] : bestWildcardMatch(subpath)
  const target = exportStringValue(matched)
  return target ? join(UI_ROOT, target) : undefined
}

function resolveRelative(fromFile: string, spec: string): string {
  const base = join(dirname(fromFile), spec)
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  throw new Error(`mdx-static.test.tsx: cannot resolve "${spec}" from ${fromFile}`)
}

/** `undefined` means "out of scope" (react, other npm/`@repo/*` packages, a `.css` import) —
 * not a bug; everything else must resolve to a real file or throw. */
function resolveSpecifier(fromFile: string, spec: string): string | undefined {
  if (spec.startsWith("./") || spec.startsWith("../")) return resolveRelative(fromFile, spec)
  if (spec === "@repo/ui" || spec.startsWith("@repo/ui/")) {
    const resolved = resolvePackageSpecifier(spec)
    if (!resolved) return undefined
    if (existsSync(resolved) && statSync(resolved).isFile()) return resolved
    throw new Error(`mdx-static.test.tsx: "${spec}" resolved to "${resolved}", which is not a file`)
  }
  return undefined
}

/** Every file reachable from `entry` through a relative import or a package-absolute
 * `@repo/ui/...` one, read once each. */
function importGraph(entry: string): Map<string, string> {
  const files = new Map<string, string>()
  const visited = new Set<string>()
  const stack = [entry]
  while (stack.length > 0) {
    const file = stack.pop() as string
    if (visited.has(file)) continue
    visited.add(file)
    const source = readFileSync(file, "utf8")
    files.set(file, source)
    for (const spec of specifiersIn(source)) {
      const resolved = resolveSpecifier(file, spec)
      if (resolved) stack.push(resolved)
    }
  }
  return files
}

function offendersIn(graph: Map<string, string>): string[] {
  return [...graph.entries()]
    .filter(([, source]) => USE_CLIENT_DIRECTIVE.test(source))
    .map(([file]) => file)
}

describe("mdxStaticComponents has no Client Component in its import graph", () => {
  test('no file reachable from mdx-static.tsx — relative or through @repo/ui/* — has "use client"', () => {
    const entry = join(import.meta.dir, "mdx-static.tsx")
    const graph = importGraph(entry)
    expect(offendersIn(graph)).toEqual([])
    // Sanity check the walk itself isn't vacuous (a bug here would make the assertion above pass
    // for the wrong reason — an empty or one-file graph).
    expect(graph.size).toBeGreaterThan(5)
  })

  test("resolvePackageSpecifier follows a package-absolute specifier to the real file — the old Callout's own regression shape (@repo/ui/components/icon, a Client Component)", () => {
    const resolved = resolvePackageSpecifier("@repo/ui/components/icon")
    expect(resolved).toBeDefined()
    const source = readFileSync(resolved as string, "utf8")
    expect(USE_CLIENT_DIRECTIVE.test(source)).toBe(true)
  })

  test('positive control: walking index.tsx (the interactive map) DOES reach a "use client" file — proving the walker can see what it should refuse', () => {
    const entry = join(import.meta.dir, "index.tsx")
    const graph = importGraph(entry)
    const offenders = offendersIn(graph)
    expect(offenders.length).toBeGreaterThan(0)
    expect(
      offenders.some((file) => file.endsWith("tabs.tsx") || file.endsWith("copy-button.tsx"))
    ).toBe(true)
  })
})

describe("mdxStaticComponents rendering (react-dom/server.edge's renderToReadableStream, the API the feed routes use)", () => {
  async function render(children: ReactElement): Promise<string> {
    const stream = await renderToReadableStream(children)
    await stream.allReady
    return new Response(stream).text()
  }

  test("Tabs panels render stacked, each preceded by its label", async () => {
    // Imported lazily inside each test (after the guard test above has already proven the graph
    // is clean) so a regression there fails loudly instead of this whole file failing to import.
    const { mdxStaticComponents } = await import("./mdx-static")
    const Tabs = mdxStaticComponents.Tabs as ComponentType<{
      items: string[]
      children: ReactNode
    }>
    const html = await render(
      <Tabs items={["npm", "bun"]}>
        <Tab value="npm">npm install</Tab>
        <Tab value="bun">bun add</Tab>
      </Tabs>
    )
    expect(html).toContain("npm install")
    expect(html).toContain("bun add")
    expect(html).toMatch(/<h4[^>]*>npm<\/h4>/)
    expect(html).toMatch(/<h4[^>]*>bun<\/h4>/)
    expect(html).not.toContain('role="tablist"')
  })

  test("the callout keeps its role and renders an icon (no text fallback needed)", async () => {
    const { mdxStaticComponents } = await import("./mdx-static")
    const Callout = mdxStaticComponents.Callout as ComponentType<{
      type?: "note" | "tip" | "warning"
      title?: string
      children: ReactNode
    }>
    const html = await render(
      <Callout type="tip" title="Heads up">
        Be careful.
      </Callout>
    )
    expect(html).toContain('role="note"')
    expect(html).toContain("Heads up")
    expect(html).toContain("Be careful.")
    expect(html).toContain("<svg")
    expect(html).toContain('aria-hidden="true"')
  })

  test("no <script> anywhere in a full render", async () => {
    const { mdxStaticComponents } = await import("./mdx-static")
    const H2 = mdxStaticComponents.h2 as ComponentType<{ id?: string; children: ReactNode }>
    const Callout = mdxStaticComponents.Callout as ComponentType<{ children: ReactNode }>
    const Pre = mdxStaticComponents.pre as ComponentType<{ children: ReactNode }>
    const html = await render(
      <div>
        <H2 id="x">Title</H2>
        <Callout>Note.</Callout>
        <Pre>
          <code>const a = 1</code>
        </Pre>
      </div>
    )
    expect(html).not.toContain("<script")
  })

  test('a static heading keeps its id with no "#" anchor', async () => {
    const { mdxStaticComponents } = await import("./mdx-static")
    const H2 = mdxStaticComponents.h2 as ComponentType<{ id?: string; children: ReactNode }>
    const html = await render(<H2 id="getting-started">Getting started</H2>)
    expect(html).toMatch(/<h2[^>]*id="getting-started"/)
    expect(html).toContain("Getting started")
    expect(html).not.toContain("#getting-started")
    expect(html).not.toContain("Link to this section")
  })

  test("inline code vs. code inside a pre: the latter resets to plain via a pre & variant", async () => {
    const { mdxStaticComponents } = await import("./mdx-static")
    const Code = mdxStaticComponents.code as ComponentType<{
      children: ReactNode
      className?: string
    }>
    const Pre = mdxStaticComponents.pre as ComponentType<{ children: ReactNode }>
    const inline = await render(<Code>bun dev</Code>)
    expect(inline).toContain("bg-muted")
    const blocked = await render(
      <Pre>
        <Code className="language-ts">const a = 1</Code>
      </Pre>
    )
    // Same component, same classes — but reset via a `pre &` variant rather than Context, since
    // this module graph has no Client Component (and so no `useContext`) available at all.
    expect(blocked).toContain("bg-muted")
    // `&` in the class string is escaped to `&amp;` in the rendered HTML attribute.
    expect(blocked).toContain("[pre_&amp;]:bg-transparent")
    expect(blocked).toContain("const a = 1")
  })

  test("the static image is always loading=lazy, even when the author passed loading=eager", async () => {
    const { mdxStaticComponents } = await import("./mdx-static")
    const Img = mdxStaticComponents.img as ComponentType<{
      src: string
      alt: string
      width: number
      height: number
      loading?: "eager" | "lazy"
    }>
    const html = await render(
      <Img src="/cat.png" alt="A cat" width={800} height={400} loading="eager" />
    )
    expect(html).toContain('loading="lazy"')
    expect(html).not.toContain('loading="eager"')
  })
})
