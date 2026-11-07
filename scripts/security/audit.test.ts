/**
 * `fixtures/bun-audit.json` is real `bun audit --json` output from this repo (captured
 * 2026-10-17 with `bun audit --json`), trimmed to two packages: `lodash` (two distinct
 * advisories) and `brace-expansion` (its `GHSA-mh99-v99m-4gvg` advisory listed twice — once per
 * vulnerable-version range it covers, exactly as the real output does). Every field in the
 * fixture is unedited real tool output; only the advisory count per package was trimmed.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normaliseAudit } from "./audit"

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "bun-audit.json"), "utf8")
)

describe("normaliseAudit", () => {
  test("maps a package's advisory to a Finding keyed by its GHSA id", () => {
    const findings = normaliseAudit(fixture)
    const lodashHigh = findings.find((f) => f.id === "GHSA-r5fr-rjxr-66jc")
    expect(lodashHigh).toEqual({
      scanner: "audit",
      id: "GHSA-r5fr-rjxr-66jc",
      severity: "high",
      package: "lodash",
      url: "https://github.com/advisories/GHSA-r5fr-rjxr-66jc",
      title: "lodash vulnerable to Code Injection via `_.template` imports key names",
    })
  })

  test("a package with two distinct advisories produces two findings", () => {
    const findings = normaliseAudit(fixture).filter((f) => f.package === "lodash")
    expect(findings.map((f) => f.id).sort()).toEqual(["GHSA-f23m-r3pf-42rh", "GHSA-r5fr-rjxr-66jc"])
    expect(findings.find((f) => f.id === "GHSA-f23m-r3pf-42rh")?.severity).toBe("moderate")
  })

  test("the same advisory listed twice (once per vulnerable-version range) de-dupes to one finding", () => {
    const findings = normaliseAudit(fixture).filter((f) => f.package === "brace-expansion")
    expect(findings).toHaveLength(1)
    expect(findings[0]).toEqual({
      scanner: "audit",
      id: "GHSA-mh99-v99m-4gvg",
      severity: "high",
      package: "brace-expansion",
      url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
      title:
        "brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash",
    })
  })

  test("the whole fixture normalises to exactly three findings", () => {
    expect(normaliseAudit(fixture)).toHaveLength(3)
  })

  test("rejects a non-object payload", () => {
    expect(() => normaliseAudit([])).toThrow("expected an object keyed by package name")
    expect(() => normaliseAudit(null)).toThrow("expected an object keyed by package name")
    expect(() => normaliseAudit("nope")).toThrow("expected an object keyed by package name")
  })

  test("rejects a package whose value is not an array", () => {
    expect(() => normaliseAudit({ lodash: { not: "an array" } })).toThrow(
      '"lodash" is not an array of advisories'
    )
  })

  test("rejects an advisory with no url", () => {
    expect(() => normaliseAudit({ lodash: [{ severity: "high", title: "x" }] })).toThrow(
      "has no url"
    )
  })

  test("rejects an advisory whose url carries no GHSA id", () => {
    expect(() =>
      normaliseAudit({
        lodash: [{ url: "https://example.com/not-an-advisory", severity: "high", title: "x" }],
      })
    ).toThrow('cannot find a GHSA id in "https://example.com/not-an-advisory"')
  })

  test("rejects an unknown severity", () => {
    expect(() =>
      normaliseAudit({
        lodash: [
          {
            url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
            severity: "secret",
            title: "x",
          },
        ],
      })
    ).toThrow('unknown severity "secret"')
  })

  test("rejects an advisory with no title", () => {
    expect(() =>
      normaliseAudit({
        lodash: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "high" }],
      })
    ).toThrow("has no title")
  })
})

// The decide/print/write/exit tail — including `exitCodeFor` — is shared by all three scanners
// as `report.ts`'s `finish()`, and is tested once there (report.test.ts), not per scanner.
