/**
 * The repo's own Gitleaks rules (`.gitleaks.toml`), checked without Docker: each rule's regex is
 * compiled here (it is written RE2-compatible, which JavaScript reads the same way) and run over a
 * fixture of lines that must and must not match. The fixture's matching lines carry the Gitleaks
 * allow marker, so the real scan never reports them. (apps/api/src/api-keys.test.ts checks the
 * same rule against keys the api itself generates; this file imports nothing outside scripts/,
 * since CI runs it before `bun install`.)
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

type Rule = { id: string; regex: string; secretGroup?: number; keywords?: string[] }

const root = join(import.meta.dirname, "..", "..")
const config = Bun.TOML.parse(readFileSync(join(root, ".gitleaks.toml"), "utf8")) as {
  extend?: { useDefault?: boolean }
  rules?: Rule[]
}

const rule = (id: string): Rule => {
  const found = config.rules?.find((r) => r.id === id)
  if (!found) throw new Error(`no rule ${id} in .gitleaks.toml`)
  return found
}

/** The secret the rule would report in `line` (its secretGroup, else the whole match), or null. */
const secretIn = (r: Rule, line: string) => {
  const match = new RegExp(r.regex).exec(line)
  return match ? (match[r.secretGroup ?? 0] ?? null) : null
}

const fixture = readFileSync(join(import.meta.dirname, "fixtures", "api-keys.txt"), "utf8")
  .split("\n")
  .filter((line) => /^(no-)?match: /.test(line))
  .map((line) => {
    const [label, ...rest] = line.split(": ")
    const text = rest.join(": ").replace(/\s*# gitleaks:allow$/, "")
    return { match: label === "match", text }
  })

describe(".gitleaks.toml", () => {
  test("extends the default ruleset", () => {
    expect(config.extend?.useDefault).toBe(true)
  })
})

describe("bb-live-api-key", () => {
  const apiKey = rule("bb-live-api-key")

  test("is keyed on the tag, so Gitleaks only runs it where a key could be", () => {
    expect(apiKey.keywords).toEqual(["bb_live_"])
  })

  test("the fixture has both kinds of line", () => {
    expect(fixture.filter((l) => l.match).length).toBeGreaterThanOrEqual(3)
    expect(fixture.filter((l) => !l.match).length).toBeGreaterThanOrEqual(5)
  })

  test.each(fixture.filter((l) => l.match).map((l) => [l.text]))("matches %p", (text) => {
    const secret = secretIn(apiKey, text)
    expect(secret).toMatch(/^bb_live_[0-9A-Za-z]{8}_[A-Za-z0-9_-]{43}$/)
    expect(text).toContain(secret as string)
  })

  test.each(fixture.filter((l) => !l.match).map((l) => [l.text]))("does not match %p", (text) => {
    expect(secretIn(apiKey, text)).toBeNull()
  })
})
