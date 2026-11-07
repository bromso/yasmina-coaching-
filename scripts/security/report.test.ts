import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Entry, Finding } from "./allowlist"
import { exitCodeFor, finish } from "./report"

let dir: string
let logSpy: ReturnType<typeof spyOn>
let errorSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "security-report-test-"))
  logSpy = spyOn(console, "log").mockImplementation(() => {})
  errorSpy = spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  logSpy.mockRestore()
  errorSpy.mockRestore()
})

const writeAllowlist = (entries: Entry[]): string => {
  const path = join(dir, "allowlist.json")
  writeFileSync(path, JSON.stringify(entries))
  return path
}

// `loadAllowlist` validates `expires` against the real clock (it is the production entry point —
// see allowlist.ts), so a fixed future date like "2099-01-01" is always too far out (> 180 days)
// and makes the entry invalid rather than merely unexpired. Use a date close to, but not exactly
// on, the real "now" instead.
const nearFutureIso = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const auditFinding = (overrides: Partial<Finding> = {}): Finding => ({
  scanner: "audit",
  id: "GHSA-1111-1111-1111",
  severity: "high",
  package: "left-pad",
  ...overrides,
})

describe("finish", () => {
  test("a clean run writes the results file and returns 0", () => {
    const allowlistPath = writeAllowlist([])
    const resultsPath = join(dir, "audit.json")

    const code = finish({
      label: "audit",
      findings: [],
      run: { scanner: "audit" },
      resultsPath,
      allowlistPath,
    })

    expect(code).toBe(0)
    const written = JSON.parse(readFileSync(resultsPath, "utf8"))
    expect(written).toEqual({ findings: [], failing: [], allowed: [] })
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test("an unallowed high finding fails the run (1) and is written as failing", () => {
    const allowlistPath = writeAllowlist([])
    const resultsPath = join(dir, "audit.json")
    const finding = auditFinding()

    const code = finish({
      label: "audit",
      findings: [finding],
      run: { scanner: "audit" },
      resultsPath,
      allowlistPath,
    })

    expect(code).toBe(1)
    const written = JSON.parse(readFileSync(resultsPath, "utf8"))
    expect(written.failing).toEqual([finding])
    expect(written.allowed).toEqual([])
  })

  test("a finding matched by an unexpired allowlist entry passes (0) and is written as allowed", () => {
    const finding = auditFinding()
    const allowlistPath = writeAllowlist([
      {
        scanner: "audit",
        id: finding.id,
        package: finding.package,
        reason: "build-time only, reached through the bundler",
        expires: nearFutureIso(90),
      },
    ])
    const resultsPath = join(dir, "audit.json")

    const code = finish({
      label: "audit",
      findings: [finding],
      run: { scanner: "audit" },
      resultsPath,
      allowlistPath,
    })

    expect(code).toBe(0)
    const written = JSON.parse(readFileSync(resultsPath, "utf8"))
    expect(written.allowed).toEqual([finding])
    expect(written.failing).toEqual([])
  })

  test("an expired allowlist entry fails the run (1) and logs it", () => {
    const allowlistPath = writeAllowlist([
      {
        scanner: "audit",
        id: "GHSA-x",
        package: "p",
        reason: "x".repeat(20),
        expires: "2020-01-01",
      },
    ])

    const code = finish({
      label: "audit",
      findings: [],
      run: { scanner: "audit" },
      resultsPath: join(dir, "audit.json"),
      allowlistPath,
    })

    expect(code).toBe(1)
    expect(
      errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes("allowlist entry expired"))
    ).toBe(true)
  })

  test("a stale allowlist entry (no matching finding in this run) fails the run (1) and logs it", () => {
    const allowlistPath = writeAllowlist([
      {
        scanner: "audit",
        id: "GHSA-x",
        package: "p",
        reason: "x".repeat(20),
        expires: nearFutureIso(90),
      },
    ])

    const code = finish({
      label: "audit",
      findings: [],
      run: { scanner: "audit" },
      resultsPath: join(dir, "audit.json"),
      allowlistPath,
    })

    expect(code).toBe(1)
    expect(
      errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes("allowlist entry is stale"))
    ).toBe(true)
  })

  test("an invalid allowlist entry fails the run (1) and names the entry", () => {
    const code = finish({
      label: "audit",
      findings: [],
      run: { scanner: "audit" },
      resultsPath: join(dir, "audit.json"),
      allowlistPath: join(import.meta.dirname, "fixtures", "invalid-allowlist.json"),
    })

    expect(code).toBe(1)
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes("allowlist[0]"))).toBe(
      true
    )
  })

  test("a missing allowlist file is a tool failure (2), not a findings failure", () => {
    const code = finish({
      label: "audit",
      findings: [],
      run: { scanner: "audit" },
      resultsPath: join(dir, "audit.json"),
      allowlistPath: join(dir, "does-not-exist.json"),
    })

    expect(code).toBe(2)
    expect(
      errorSpy.mock.calls.some((c: unknown[]) =>
        String(c[0]).includes("could not load security/allowlist.json")
      )
    ).toBe(true)
  })

  test("a results path that cannot be written is a tool failure (2)", () => {
    // A file where a directory is expected: mkdirSync(dirname(resultsPath)) fails with ENOTDIR.
    const blocker = join(dir, "blocker")
    writeFileSync(blocker, "x")
    const allowlistPath = writeAllowlist([])

    const code = finish({
      label: "audit",
      findings: [],
      run: { scanner: "audit" },
      resultsPath: join(blocker, "audit.json"),
      allowlistPath,
    })

    expect(code).toBe(2)
    expect(
      errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes("could not write results"))
    ).toBe(true)
  })

  test("prints the table before writing results", () => {
    const allowlistPath = writeAllowlist([])
    finish({
      label: "audit",
      findings: [auditFinding()],
      run: { scanner: "audit" },
      resultsPath: join(dir, "audit.json"),
      allowlistPath,
    })
    expect(String(logSpy.mock.calls[0]?.[0])).toContain("GHSA-1111-1111-1111")
  })
})

describe("exitCodeFor", () => {
  const clean = { failing: [], expired: [], stale: [] }

  test("0 when nothing fails and the allowlist has no errors", () => {
    expect(exitCodeFor(clean, [])).toBe(0)
  })

  test("1 when a finding fails", () => {
    expect(exitCodeFor({ ...clean, failing: [auditFinding()] }, [])).toBe(1)
  })

  test("1 when an allowlist entry has expired", () => {
    const expired: Entry = {
      scanner: "audit",
      id: "GHSA-x",
      package: "p",
      reason: "x".repeat(20),
      expires: "2020-01-01",
    }
    expect(exitCodeFor({ ...clean, expired: [expired] }, [])).toBe(1)
  })

  test("1 when an allowlist entry is stale", () => {
    const stale: Entry = {
      scanner: "audit",
      id: "GHSA-x",
      package: "p",
      reason: "x".repeat(20),
      expires: "2099-01-01",
    }
    expect(exitCodeFor({ ...clean, stale: [stale] }, [])).toBe(1)
  })

  test("1 when the allowlist itself has validation errors", () => {
    expect(exitCodeFor(clean, ["allowlist[0].id: must be a non-empty string"])).toBe(1)
  })
})
