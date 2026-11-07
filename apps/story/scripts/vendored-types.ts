// Generates the declarations `apps/story`'s typecheck reads in place of the vendored
// `packages/ui` sources (animate-ui, magicui, charts and the PascalCase files). Those sources sit
// outside `@repo/ui`'s own gates and carry known type errors; checking the stories against their
// emitted `.d.ts` instead keeps the story typecheck about the stories.
//
//   bun scripts/vendored-types.ts          regenerate apps/story/types/vendored
//   bun scripts/vendored-types.ts --check  fail when the committed declarations are stale
//
// The root `tsc` binary is run as a child process (no `typescript` import, no new dependency).
// It exits 2 because the vendored sources have type errors; declarations are still emitted
// (`noEmitOnError: false`), so success is "declarations emitted", not the exit code.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve, sep } from "node:path"

const STORY = resolve(import.meta.dir, "..")
const ROOT = resolve(STORY, "../..")
const UI = join(ROOT, "packages/ui")
const OUT = join(STORY, "types/vendored")
const BIN = join(ROOT, "node_modules/.bin")
const TSCONFIG = join(STORY, "tsconfig.json")
const PATH_PREFIX = "@repo/ui/components/"
const GENERATE_COMMAND = "bun run --filter @repo/story generate:vendored-types"

/** The root binary, found the way the shell would (`tsc.exe` on Windows). */
function bin(name: string): string {
  const found = Bun.which(name, { PATH: BIN })
  if (!found) throw new Error(`${name} not found in ${rel(ROOT, BIN)} — run \`bun install\` first`)
  return found
}
// The declarations import packages (`class-variance-authority`, `@base-ui/react/…`) that only
// `@repo/ui` depends on. Bun installs them under `packages/ui/node_modules`, which a file under
// `apps/story` never walks past, and `skipLibCheck` would turn each miss into a silent `any`. A
// git-ignored `node_modules` link next to the declarations makes them resolve exactly as the
// sources do; both modes (re)create it, so `typecheck` sets it up on a fresh checkout.
const LINK = join(OUT, "node_modules")
const LINK_TARGET = relative(OUT, join(UI, "node_modules"))
const STALE_MESSAGE = `Vendored declarations are stale — run \`${GENERATE_COMMAND}\``

/** The PascalCase vendored files, read from the list `@repo/ui`'s type gate excludes. */
function pascalCaseFiles(): string[] {
  const config = JSON.parse(readFileSync(join(UI, "tsconfig.typecheck.json"), "utf8")) as {
    exclude: string[]
  }
  return config.exclude.filter((entry) => /^src\/components\/[A-Z][^/]*\.tsx$/.test(entry)).sort()
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (path === LINK) continue
    if (entry.isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

/** Relative path with forward slashes, so output never depends on the platform. */
function rel(from: string, path: string): string {
  return relative(from, path).split(sep).join("/")
}

function normalise(text: string, file: string, temp: string): string {
  const out = `${text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.startsWith("//# sourceMappingURL="))
    .join("\n")
    .trimEnd()}\n`
  for (const absolute of [ROOT, temp, tmpdir()]) {
    if (out.includes(absolute)) throw new Error(`${file} contains an absolute path (${absolute})`)
  }
  return out
}

/** Emits the declarations into a temp dir; returns them keyed by path relative to `src/`. */
async function generate(): Promise<Map<string, string>> {
  const temp = mkdtempSync(join(tmpdir(), "vendored-types-"))
  try {
    const outDir = join(temp, "out")
    const src = join(UI, "src")
    const tsconfig = {
      extends: join(UI, "tsconfig.typecheck.json"),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        declarationMap: false,
        emitDeclarationOnly: true,
        noEmitOnError: false,
        incremental: false,
        skipLibCheck: true,
        rootDir: src,
        outDir,
      },
      include: [
        `${src}/components/animate-ui/**/*.ts`,
        `${src}/components/animate-ui/**/*.tsx`,
        `${src}/components/magicui/**/*.tsx`,
        `${src}/components/charts/**/*.ts`,
        `${src}/components/charts/**/*.tsx`,
        ...pascalCaseFiles().map((entry) => join(UI, entry)),
      ],
      exclude: ["**/node_modules", "**/*.test.ts", "**/*.test.tsx", "**/*.stories.tsx"],
    }
    const configPath = join(temp, "tsconfig.json")
    await writeFile(configPath, JSON.stringify(tsconfig, null, 2))

    const proc = Bun.spawn([bin("tsc"), "-p", configPath], {
      cwd: UI,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    // 0: clean; 2: errors in the sources, outputs still written. Anything else is tsc failing.
    if (code !== 0 && code !== 2) {
      throw new Error(`tsc exited ${code}\n${stdout}${stderr}`)
    }

    const files = new Map<string, string>()
    for (const file of walk(outDir)
      .filter((path) => path.endsWith(".d.ts"))
      .sort()) {
      const key = rel(outDir, file)
      files.set(key, normalise(readFileSync(file, "utf8"), key, temp))
    }
    if (files.size === 0) throw new Error(`tsc emitted no declarations\n${stdout}${stderr}`)
    return files
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function committed(): Map<string, string> {
  const files = new Map<string, string>()
  for (const file of walk(OUT).sort()) files.set(rel(OUT, file), readFileSync(file, "utf8"))
  return files
}

// React's own types take `any` as a constraint (`JSXElementConstructor<any>`); a declaration that
// passes it through is not a vendored signature falling back to `any`.
const REACT_ANY_ARGUMENT = /\b(?:JSXElementConstructor|ElementType|ComponentType)<any>/g
const DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:const|let|var|function|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/

/** Splits a `.d.ts` into its top-level statements: tsc starts each one at column 0 with a word. */
function statements(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const out: string[] = []
  for (const line of code.split("\n")) {
    if (/^[A-Za-z]/.test(line) || out.length === 0) out.push(line)
    else out[out.length - 1] += `\n${line}`
  }
  return out
}

/** Exported declarations whose signatures fall back to `any` — worth a look, not a failure. */
function anyFiles(files: Map<string, string>): string[] {
  const hits: string[] = []
  for (const [key, text] of files) {
    const parts = statements(text)
    const exported = new Set<string>()
    for (const part of parts) {
      const list = part.match(/^export\s+(?:type\s+)?\{([^}]*)\}/)
      for (const item of list?.[1]?.split(",") ?? []) {
        const local = item
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
        if (local) exported.add(local)
      }
      const fallback = part.match(/^export\s+default\s+([A-Za-z_$][\w$]*)\s*;/)
      if (fallback?.[1]) exported.add(fallback[1])
    }
    // An exported declaration's signature includes the local types it names (`interface Props`
    // behind `export default Ballpit: React.FC<Props>`), so follow those, transitively.
    const locals = new Map<string, string>()
    const queue: string[] = []
    for (const part of parts) {
      const name = part.match(DECLARATION)?.[1]
      if (part.startsWith("export") || (name && exported.has(name))) queue.push(part)
      else if (name && !part.startsWith("import")) locals.set(name, part)
    }
    let count = 0
    for (let part = queue.pop(); part !== undefined; part = queue.pop()) {
      for (const [name, local] of locals) {
        if (!new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`).test(part)) continue
        locals.delete(name)
        queue.push(local)
      }
      count += part.replace(REACT_ANY_ARGUMENT, "").match(/\bany\b/g)?.length ?? 0
    }
    if (count > 0) hits.push(`${key} (${count})`)
  }
  return hits
}

/** The package a bare specifier names: `@scope/name` or `name`, without any subpath. */
function packageName(specifier: string): string {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier)
}

/**
 * Every bare package the declarations import must resolve from `packages/ui`, as it does for the
 * sources. `skipLibCheck` turns an unresolved import in a `.d.ts` into a silent `any`, so a missing
 * package (or a broken `node_modules` link) would otherwise only show as fewer errors.
 */
function unresolvedImports(files: Map<string, string>): Map<string, string[]> {
  const importers = new Map<string, string[]>()
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm
  for (const [key, text] of files) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1] as string
      if (specifier.startsWith(".") || specifier.startsWith("@repo/ui/")) continue
      if (specifier.startsWith("node:")) continue
      const list = importers.get(specifier) ?? []
      if (!list.includes(key)) list.push(key)
      importers.set(specifier, list)
    }
  }
  const missing = new Map<string, string[]>()
  for (const [specifier, keys] of [...importers].sort(([a], [b]) => a.localeCompare(b))) {
    if (resolves(specifier)) continue
    missing.set(specifier, keys.sort())
  }
  return missing
}

function resolves(specifier: string): boolean {
  const from = join(UI, "src")
  try {
    Bun.resolveSync(specifier, from)
    return true
  } catch {
    // Type-only entries (`class-variance-authority/types`) and packages that ship nothing but
    // types (`geojson` through `@types/geojson`) have no runtime file to resolve; finding their
    // package.json is enough.
  }
  const name = packageName(specifier)
  const typesName = `@types/${name.startsWith("@") ? name.slice(1).replace("/", "__") : name}`
  for (const candidate of [name, typesName]) {
    try {
      Bun.resolveSync(`${candidate}/package.json`, from)
      return true
    } catch {}
    for (let dir = UI; ; dir = dirname(dir)) {
      if (existsSync(join(dir, "node_modules", candidate, "package.json"))) return true
      if (dir === ROOT || dirname(dir) === dir) break
    }
  }
  return false
}

function failResolution(missing: Map<string, string[]>): never {
  console.error(
    "Vendored declarations import packages that do not resolve from packages/ui — the story " +
      "typecheck would read them as `any`. Run `bun install`, or add the package to @repo/ui."
  )
  for (const [specifier, keys] of missing) {
    console.error(`  ${specifier}`)
    for (const key of keys) console.error(`    apps/story/types/vendored/${key}`)
  }
  process.exit(1)
}

function ensureLink(): void {
  const target = join(UI, "node_modules")
  if (!existsSync(target)) {
    throw new Error(
      `${rel(ROOT, target)} does not exist — run \`bun install\` first. The vendored declarations ` +
        "resolve their packages through it."
    )
  }
  mkdirSync(OUT, { recursive: true })
  let exists = false
  try {
    const stat = lstatSync(LINK)
    exists = true
    if (stat.isSymbolicLink() && resolve(dirname(LINK), readlinkSync(LINK)) === resolve(target)) {
      return
    }
  } catch {
    // No link yet.
  }
  if (exists) rmSync(LINK, { recursive: true, force: true })
  // A junction needs no privilege on Windows; Node makes its target absolute.
  const type = process.platform === "win32" ? "junction" : "dir"
  try {
    symlinkSync(type === "junction" ? target : LINK_TARGET, LINK, type)
  } catch (error) {
    throw new Error(
      `Could not create ${rel(ROOT, LINK)} -> ${rel(ROOT, target)} (${type}): ` +
        `${(error as Error).message}. The link lets the vendored declarations resolve the ` +
        "packages only @repo/ui depends on; without it the story typecheck reads them as `any`. " +
        "On Windows, enable Developer Mode or run this script once as an administrator."
    )
  }
}

type TsConfig = { compilerOptions: { paths: Record<string, string[]> } }

/** The `paths` entry for each PascalCase vendored file, in `pascalCaseFiles()` order. */
function pascalCasePaths(): [string, string[]][] {
  return pascalCaseFiles().map((entry) => {
    const name = entry.slice("src/components/".length, -".tsx".length)
    return [`${PATH_PREFIX}${name}`, [`./types/vendored/components/${name}.d.ts`]]
  })
}

function isPascalCaseKey(key: string): boolean {
  return /^[A-Z][^/]*$/.test(key.startsWith(PATH_PREFIX) ? key.slice(PATH_PREFIX.length) : "")
}

/** `missing` / `extra` / `changed` PascalCase `paths` entries in apps/story/tsconfig.json. */
function pathsDrift(): string[] {
  const paths = (JSON.parse(readFileSync(TSCONFIG, "utf8")) as TsConfig).compilerOptions.paths
  const expected = new Map(pascalCasePaths())
  const drift: string[] = []
  for (const [key, target] of expected) {
    if (!(key in paths)) drift.push(`missing: ${key}`)
    else if (JSON.stringify(paths[key]) !== JSON.stringify(target)) drift.push(`changed: ${key}`)
  }
  for (const key of Object.keys(paths)) {
    if (isPascalCaseKey(key) && !expected.has(key)) drift.push(`extra: ${key}`)
  }
  return drift.sort()
}

/**
 * Rewrites the PascalCase `paths` entries from `pascalCaseFiles()`, keeping every other entry and
 * key in place, then formats the file with the root Biome so the result matches `biome ci`.
 */
async function writePaths(): Promise<void> {
  const config = JSON.parse(readFileSync(TSCONFIG, "utf8")) as TsConfig
  const others = Object.entries(config.compilerOptions.paths).filter(
    ([key]) => !isPascalCaseKey(key)
  )
  config.compilerOptions.paths = Object.fromEntries([...others, ...pascalCasePaths()])
  const proc = Bun.spawn([bin("biome"), "format", `--stdin-file-path=${TSCONFIG}`], {
    cwd: ROOT,
    stdin: new TextEncoder().encode(JSON.stringify(config, null, 2)),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [formatted, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0 || formatted.trim() === "") throw new Error(`biome format failed\n${stderr}`)
  if (formatted !== readFileSync(TSCONFIG, "utf8")) await writeFile(TSCONFIG, formatted)
}

function printAny(files: Map<string, string>, log: (line: string) => void): void {
  const hits = anyFiles(files)
  if (hits.length === 0) return
  log(`${hits.length} declarations with \`any\` in an exported signature:`)
  for (const hit of hits) log(`  ${hit}`)
}

function removeEmptyDirs(dir: string): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && join(dir, entry.name) !== LINK)
      removeEmptyDirs(join(dir, entry.name))
  }
  if (dir !== OUT && readdirSync(dir).length === 0) rmSync(dir, { recursive: true })
}

const generated = await generate()
const missing = unresolvedImports(generated)
if (missing.size > 0) failResolution(missing)
ensureLink()

if (process.argv.includes("--check")) {
  const current = committed()
  const differing = [...new Set([...generated.keys(), ...current.keys()])]
    .filter((key) => generated.get(key) !== current.get(key))
    .sort()
  if (differing.length > 0) {
    console.error(STALE_MESSAGE)
    for (const key of differing) {
      const state = !current.has(key) ? "missing" : !generated.has(key) ? "extra" : "changed"
      console.error(`  ${state}: apps/story/types/vendored/${key}`)
    }
    process.exit(1)
  }
  const drift = pathsDrift()
  if (drift.length > 0) {
    console.error(
      "apps/story/tsconfig.json's PascalCase `paths` entries do not match the vendored files in " +
        `packages/ui/tsconfig.typecheck.json — run \`${GENERATE_COMMAND}\``
    )
    for (const line of drift) console.error(`  ${line}`)
    process.exit(1)
  }
  const anyCount = anyFiles(generated).length
  if (anyCount > 0) {
    console.warn(
      `${anyCount} vendored declarations have \`any\` in an exported signature — ` +
        `run \`${GENERATE_COMMAND}\` to list them`
    )
  }
} else {
  const current = committed()
  for (const key of current.keys()) {
    if (!generated.has(key)) rmSync(join(OUT, key))
  }
  for (const [key, text] of generated) {
    if (current.get(key) === text) continue
    const path = join(OUT, key)
    mkdirSync(dirname(path), { recursive: true })
    await writeFile(path, text)
  }
  removeEmptyDirs(OUT)
  await writePaths()
  console.log(`Wrote ${generated.size} declarations to ${rel(ROOT, OUT)}`)
  printAny(generated, (line) => console.log(line))
}
