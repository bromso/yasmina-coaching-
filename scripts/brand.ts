import { existsSync, readFileSync } from "node:fs"

/** The literal brand name; only `packages/sites/src/brand.ts` may spell it out in first-party src. */
export const LITERAL = "Boilerplate"

/** Files that may contain the literal, each with its reason. */
export const ALLOW = ["packages/sites/src/brand.ts"]

const isTest = (path: string) => /\.test\.(ts|tsx)$/.test(path)

/** `<path>:<line>` for every line naming the brand outside the allow-list and test files. */
export function findBrandLiterals(files: { path: string; text: string }[], allow = ALLOW) {
  const hits: string[] = []
  for (const { path, text } of files) {
    if (allow.includes(path) || isTest(path)) continue
    text.split("\n").forEach((line, i) => {
      if (line.includes(LITERAL)) hits.push(`${path}:${i + 1}`)
    })
  }
  return hits
}

/** The TypeScript files among `paths`, read; a path missing from the working tree is skipped. */
export function readSources(paths: string[]): { path: string; text: string }[] {
  return paths
    .filter((p) => /\.(ts|tsx)$/.test(p) && existsSync(p))
    .map((path) => ({ path, text: readFileSync(path, "utf8") }))
}

/** Tracked first-party source: every app's and package's `src/`, TypeScript only. */
export function firstPartySources(): { path: string; text: string }[] {
  const out = Bun.spawnSync(["git", "ls-files", "apps/*/src/**", "packages/*/src/**"]).stdout
  return readSources(new TextDecoder().decode(out).split("\n"))
}
