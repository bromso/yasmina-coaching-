#!/usr/bin/env bun
import { execSync } from "node:child_process"
/**
 * Generate the offline icon bundle for the design system.
 *
 *   bun icons:bundle
 *
 * Scans the repo for `lucide:*` and `circle-flags:*` icon names, subsets each collection from
 * its `@iconify-json/*` package, and writes the result to packages/ui/src/lib/icon-bundle.ts.
 * The Icon wrapper registers these bundles with @iconify/react at module load, so bundled icons
 * render synchronously (including SSR) and fully offline. Names not in a bundle still fall back
 * to the Iconify API at runtime (which the shared CSP blocks, so bundle everything you use).
 *
 * The flags come from `LOCALE_FLAGS` in packages/i18n/src/locales.ts (the language switcher's
 * one map of locale → flag), hence that directory in the scan.
 *
 * Re-run this after adding icons that aren't in the bundle yet.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { getIcons } from "@iconify/utils"

const ROOT = "/" === process.cwd() ? "." : process.cwd()

/**
 * Every circle flag wraps its artwork in the same circular `<mask id="…">`. @iconify/react
 * rewrites such ids with a process-wide counter, so a server render and the browser's would
 * disagree (a hydration mismatch, and ids that can collide across requests). The bundle drops the
 * mask instead — the flag is a square, clipped to a circle by the `rounded-full` the language
 * menu puts on it — and refuses a flag whose body does not have exactly that shape.
 */
const FLAG_MASK =
  /^<mask id="([^"]+)"><circle cx="256" cy="256" r="256" fill="#fff"\/><\/mask><g mask="url\(#\1\)">(.*)<\/g>$/s

function unmaskFlag(name: string, body: string): string {
  const match = body.match(FLAG_MASK)
  const inner = match?.[2]
  if (!inner || /\sid="/.test(inner)) {
    console.error(`circle-flags:${name} is not a masked square flag; update FLAG_MASK.`)
    process.exit(1)
  }
  return inner
}

type Subset = NonNullable<ReturnType<typeof getIcons>>

const COLLECTIONS: {
  prefix: string
  exportName: string
  title: string
  transform?: (subset: Subset) => void
}[] = [
  { prefix: "lucide", exportName: "lucideBundle", title: "Lucide" },
  {
    prefix: "circle-flags",
    exportName: "circleFlagsBundle",
    title: "Circle Flags",
    transform: (subset) => {
      for (const [name, icon] of Object.entries(subset.icons)) {
        icon.body = unmaskFlag(name, icon.body)
      }
    },
  },
]

function namesFor(prefix: string): string[] {
  const grep = execSync(
    `grep -rhoE '${prefix}:[a-z0-9-]+' packages/ui/src packages/i18n/src apps/*/src apps/story/stories --include=*.tsx --include=*.ts 2>/dev/null | sort -u || true`,
    { encoding: "utf8", cwd: ROOT }
  )
  return grep
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((n) => n.slice(prefix.length + 1))
}

let failed = false
const parts: string[] = []
const summary: string[] = []

for (const { prefix, exportName, title, transform } of COLLECTIONS) {
  const names = namesFor(prefix)
  if (names.length === 0) {
    console.error(`No ${prefix}:* icon names found — nothing to bundle.`)
    process.exit(1)
  }
  const path = require.resolve(`@iconify-json/${prefix}/icons.json`)
  const collection = JSON.parse(readFileSync(path, "utf8"))
  const subset = getIcons(collection, names)
  if (!subset) {
    console.error(`Failed to build the ${prefix} icon subset.`)
    process.exit(1)
  }
  const missing = (subset.not_found ?? []).slice()
  subset.not_found = undefined
  transform?.(subset)
  parts.push(
    `/** ${title}: every \`${prefix}:*\` name used in this repo (${names.length} icons). */
export const ${exportName}: IconifyJSON = ${JSON.stringify(subset)}
`
  )
  summary.push(`${names.length - missing.length}/${names.length} ${prefix}`)
  if (missing.length > 0) {
    console.error(`\n⚠ Not found in the ${title} collection (check the names):`)
    for (const m of missing) console.error(`  ${prefix}:${m}`)
    failed = true
  }
}

const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: bun icons:bundle  (scripts/generate-icon-bundle.ts)
 *
 * Offline subsets of the Lucide and Circle Flags collections covering every name used in this
 * repo. Registered by the Icon wrapper so icons render synchronously, server-side, and without
 * network access.
 */
import type { IconifyJSON } from "@iconify/react"

${parts.join("\n")}`

writeFileSync("packages/ui/src/lib/icon-bundle.ts", out)

console.log(`Bundled ${summary.join(", ")} icons into packages/ui/src/lib/icon-bundle.ts`)
if (failed) process.exit(1)
