#!/usr/bin/env node

/**
 * install-registry.mjs
 *
 * Installs components from shadcn-compatible registries (animate-ui, magicui)
 * into packages/ui/src/. Works around the shadcn CLI "unsafe file path" error
 * that occurs with deeply nested target paths.
 *
 * Usage:
 *   bun scripts/install-registry.mjs --registry animate-ui <component-names...>
 *   bun scripts/install-registry.mjs --registry magicui <component-names...>
 *
 * Examples:
 *   bun scripts/install-registry.mjs --registry animate-ui primitives-effects-effect primitives-effects-blur
 *   bun scripts/install-registry.mjs --registry magicui marquee blur-fade
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REGISTRIES = {
  "animate-ui": {
    baseUrl: "https://animate-ui.com/r",
    prefix: "@animate-ui/",
  },
  magicui: {
    baseUrl: "https://magicui.design/r",
    prefix: "@magicui/",
  },
}

const TARGET_BASE = join(
  import.meta.dirname ?? dirname(new URL(import.meta.url).pathname),
  "..",
  "packages",
  "ui",
  "src"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2)
  let registry = null
  const names = []

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--registry" || args[i] === "-r") {
      registry = args[++i]
    } else if (args[i].startsWith("--registry=")) {
      registry = args[i].split("=")[1]
    } else if (!args[i].startsWith("-")) {
      names.push(args[i])
    }
  }

  if (!registry || !REGISTRIES[registry]) {
    console.error(`Error: --registry must be one of: ${Object.keys(REGISTRIES).join(", ")}`)
    console.error(`Usage: bun scripts/install-registry.mjs --registry <name> <components...>`)
    process.exit(1)
  }

  if (names.length === 0) {
    console.error("Error: provide at least one component name")
    process.exit(1)
  }

  return { registry, names }
}

/**
 * Determine which registry a dependency name belongs to.
 * Returns { name, registry } with the cleaned component name and registry key.
 */
function resolveDependency(depName, defaultRegistry) {
  for (const [key, cfg] of Object.entries(REGISTRIES)) {
    if (cfg.prefix && depName.startsWith(cfg.prefix)) {
      return { name: depName.slice(cfg.prefix.length), registry: key }
    }
  }
  return { name: depName, registry: defaultRegistry }
}

/**
 * Fix import aliases so they work within the @repo/ui package structure.
 */
function fixImportAliases(content) {
  return content
    .replace(/@\/components\//g, "@repo/ui/components/")
    .replace(/@\/hooks\//g, "@repo/ui/hooks/")
    .replace(/@\/lib\//g, "@repo/ui/lib/")
}

/**
 * Derive a target path for files that lack an explicit `target` field.
 *
 * For magicui components, `path` looks like "registry/magicui/marquee.tsx".
 * We map that to "components/magicui/marquee.tsx".
 *
 * For animate-ui, `path` looks like "registry/primitives/effects/blur/index.tsx"
 * but those always have a `target` field so this is a fallback.
 */
function deriveTarget(filePath) {
  // Strip the leading "registry/" prefix
  let relative = filePath.replace(/^registry\//, "")

  // If the file is an index file, use the parent directory name as filename
  if (relative.endsWith("/index.tsx") || relative.endsWith("/index.ts")) {
    const parts = relative.split("/")
    parts.pop() // remove "index.tsx"
    const parentName = parts.pop()
    const ext = filePath.endsWith(".tsx") ? ".tsx" : ".ts"
    relative = [...parts, `${parentName}${ext}`].join("/")
  }

  // Ensure it starts with "components/"
  if (
    !relative.startsWith("components/") &&
    !relative.startsWith("hooks/") &&
    !relative.startsWith("lib/")
  ) {
    relative = `components/${relative}`
  }

  return relative
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function fetchComponent(name, registryKey) {
  const config = REGISTRIES[registryKey]
  const url = `${config.baseUrl}/${name}.json`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  return res.json()
}

async function installComponent(name, registryKey, visited, results) {
  // Build a unique key for deduplication
  const key = `${registryKey}:${name}`
  if (visited.has(key)) return
  visited.add(key)

  console.log(`\nFetching ${registryKey}/${name}...`)

  let data
  try {
    data = await fetchComponent(name, registryKey)
  } catch (err) {
    console.error(`  [SKIP] Failed to fetch ${registryKey}/${name}: ${err.message}`)
    results.errors.push(`${registryKey}/${name}: ${err.message}`)
    return
  }

  // -- Process files --
  if (data.files && Array.isArray(data.files)) {
    for (const file of data.files) {
      const target = file.target || deriveTarget(file.path)
      const absPath = join(TARGET_BASE, target)
      const content = fixImportAliases(file.content)

      try {
        await mkdir(dirname(absPath), { recursive: true })
        await writeFile(absPath, content, "utf-8")
        console.log(`  [WRITE] ${target}`)
        results.filesWritten.push(target)
      } catch (err) {
        console.error(`  [ERROR] Could not write ${target}: ${err.message}`)
        results.errors.push(`write ${target}: ${err.message}`)
      }
    }
  }

  // -- Collect npm dependencies --
  if (data.dependencies && Array.isArray(data.dependencies)) {
    for (const dep of data.dependencies) {
      results.dependencies.add(dep)
    }
  }
  if (data.devDependencies && Array.isArray(data.devDependencies)) {
    for (const dep of data.devDependencies) {
      results.devDependencies.add(dep)
    }
  }

  // -- Handle CSS / cssVars (informational) --
  if (data.css || data.cssVars) {
    results.cssNotes.push(
      `${registryKey}/${name} includes CSS/cssVars that may need manual integration into your globals.css`
    )
  }

  // -- Recursively install registry dependencies --
  if (data.registryDependencies && Array.isArray(data.registryDependencies)) {
    for (const depName of data.registryDependencies) {
      const resolved = resolveDependency(depName, registryKey)
      await installComponent(resolved.name, resolved.registry, visited, results)
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { registry, names } = parseArgs()

  console.log(`Registry:   ${registry} (${REGISTRIES[registry].baseUrl})`)
  console.log(`Target dir: ${TARGET_BASE}`)
  console.log(`Components: ${names.join(", ")}`)

  const visited = new Set()
  const results = {
    filesWritten: [],
    dependencies: new Set(),
    devDependencies: new Set(),
    cssNotes: [],
    errors: [],
  }

  for (const name of names) {
    await installComponent(name, registry, visited, results)
  }

  // -- Summary --
  console.log(`\n${"=".repeat(60)}`)
  console.log("SUMMARY")
  console.log("=".repeat(60))

  console.log(`\nFiles written (${results.filesWritten.length}):`)
  for (const f of results.filesWritten) {
    console.log(`  packages/ui/src/${f}`)
  }

  if (results.dependencies.size > 0) {
    const deps = [...results.dependencies].sort()
    console.log(`\nDependencies to install (${deps.length}):`)
    console.log(`  bun add --filter @repo/ui ${deps.join(" ")}`)
  }

  if (results.devDependencies.size > 0) {
    const deps = [...results.devDependencies].sort()
    console.log(`\nDev dependencies to install (${deps.length}):`)
    console.log(`  bun add --filter @repo/ui -D ${deps.join(" ")}`)
  }

  if (results.cssNotes.length > 0) {
    console.log("\nCSS notes:")
    for (const note of results.cssNotes) {
      console.log(`  - ${note}`)
    }
  }

  if (results.errors.length > 0) {
    console.log(`\nErrors (${results.errors.length}):`)
    for (const e of results.errors) {
      console.log(`  - ${e}`)
    }
  }

  console.log("")
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
