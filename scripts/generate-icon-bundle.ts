#!/usr/bin/env bun
import { execSync } from "node:child_process"
/**
 * Generate the offline icon bundle for the design system.
 *
 *   bun icons:bundle
 *
 * Scans the repo for `lucide:*` icon names, subsets the Lucide collection
 * from @iconify-json/lucide, and writes the result to
 * packages/ui/src/lib/icon-bundle.ts. The Icon wrapper registers this bundle
 * with @iconify/react at module load, so bundled icons render synchronously
 * (including SSR) and fully offline. Names not in the bundle still fall back
 * to the Iconify API at runtime.
 *
 * Re-run this after adding icons that aren't in the bundle yet.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { getIcons } from "@iconify/utils"

const ROOT = "/" === process.cwd() ? "." : process.cwd()

const grep = execSync(
  `grep -rhoE 'lucide:[a-z0-9-]+' packages/ui/src apps/*/src apps/story/stories --include=*.tsx --include=*.ts 2>/dev/null | sort -u`,
  { encoding: "utf8", cwd: ROOT }
)
const names = grep
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((n) => n.replace("lucide:", ""))

if (names.length === 0) {
  console.error("No lucide:* icon names found — nothing to bundle.")
  process.exit(1)
}

const lucidePath = require.resolve("@iconify-json/lucide/icons.json")
const lucide = JSON.parse(readFileSync(lucidePath, "utf8"))
const subset = getIcons(lucide, names)

if (!subset) {
  console.error("Failed to build icon subset.")
  process.exit(1)
}

const missing = (subset.not_found ?? []).slice()
subset.not_found = undefined

const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: bun icons:bundle  (scripts/generate-icon-bundle.ts)
 *
 * Offline subset of the Lucide collection covering every \`lucide:*\` name
 * used in this repo (${names.length} icons). Registered by the Icon wrapper so
 * icons render synchronously, server-side, and without network access.
 */
import type { IconifyJSON } from "@iconify/react"

export const lucideBundle: IconifyJSON = ${JSON.stringify(subset)}
`

writeFileSync("packages/ui/src/lib/icon-bundle.ts", out)

console.log(
  `Bundled ${names.length - missing.length}/${names.length} icons into packages/ui/src/lib/icon-bundle.ts`
)
if (missing.length > 0) {
  console.error(`\n⚠ Not found in the Lucide collection (check the names):`)
  for (const m of missing) console.error(`  lucide:${m}`)
  process.exit(1)
}
