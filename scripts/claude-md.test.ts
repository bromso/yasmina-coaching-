import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// Claude Code warns once CLAUDE.md passes 150,000 characters and loads the whole file every
// session, so this stays under that with room to spare. Over budget? Move detail to
// docs/architecture/ and keep a summary, rather than raising the number.
const MAX_CHARS = 130_000

const ROOT = join(import.meta.dir, "..")
const claudeMd = readFileSync(join(ROOT, "CLAUDE.md"), "utf8")

describe("CLAUDE.md", () => {
  test("stays within its size budget", () => {
    expect(claudeMd.length).toBeLessThanOrEqual(MAX_CHARS)
  })

  test("links every docs/architecture file", () => {
    const files = readdirSync(join(ROOT, "docs/architecture"))
    expect(files.filter((file) => !claudeMd.includes(`(docs/architecture/${file})`))).toEqual([])
  })

  test("links only docs/architecture files that exist", () => {
    const links = [...claudeMd.matchAll(/\]\((docs\/architecture\/[^)]+)\)/g)].map(
      (match) => match[1] as string
    )
    expect(links.filter((link) => !existsSync(join(ROOT, link)))).toEqual([])
  })
})
