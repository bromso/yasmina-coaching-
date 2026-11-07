import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import {
  decide,
  type Entry,
  type Finding,
  formatTable,
  loadAllowlist,
  MAX_EXPIRES_DAYS,
  parseAllowlist,
} from "./allowlist"

const TODAY = new Date(Date.UTC(2026, 0, 15)) // 2026-01-15, UTC midnight

const auditEntry = (overrides: Partial<Entry> = {}): Entry => ({
  scanner: "audit",
  id: "GHSA-1111-1111-1111",
  package: "left-pad",
  reason: "build-time only, reached through the bundler",
  expires: "2026-02-01",
  ...overrides,
})

const auditFinding = (overrides: Partial<Finding> = {}): Finding => ({
  scanner: "audit",
  id: "GHSA-1111-1111-1111",
  severity: "high",
  package: "left-pad",
  ...overrides,
})

describe("parseAllowlist", () => {
  test("rejects anything that isn't a JSON array", () => {
    expect(parseAllowlist({}, TODAY)).toEqual({
      entries: [],
      errors: ["the allowlist must be a JSON array"],
    })
    expect(parseAllowlist(null, TODAY).errors).toEqual(["the allowlist must be a JSON array"])
    expect(parseAllowlist("nope", TODAY).errors).toEqual(["the allowlist must be a JSON array"])
  })

  test("an empty array is valid", () => {
    expect(parseAllowlist([], TODAY)).toEqual({ entries: [], errors: [] })
  })

  test("a non-object entry names its index", () => {
    const { entries, errors } = parseAllowlist([auditEntry(), "nope", null, ["x"]], TODAY)
    expect(entries).toEqual([auditEntry()])
    expect(errors).toEqual([
      "allowlist[1]: must be an object",
      "allowlist[2]: must be an object",
      "allowlist[3]: must be an object",
    ])
  })

  test("every invalid case names the entry index and field", () => {
    const cases: Array<{ item: unknown; error: string }> = [
      {
        item: { ...auditEntry(), scanner: "nope" },
        error: 'allowlist[0].scanner: must be one of "audit", "image", "secrets"',
      },
      {
        item: { ...auditEntry(), scanner: undefined },
        error: 'allowlist[0].scanner: must be one of "audit", "image", "secrets"',
      },
      { item: { ...auditEntry(), id: "" }, error: "allowlist[0].id: must be a non-empty string" },
      {
        item: { ...auditEntry(), id: undefined },
        error: "allowlist[0].id: must be a non-empty string",
      },
      {
        item: { ...auditEntry(), package: undefined },
        error: 'allowlist[0].package: is required for "audit" and "image" entries',
      },
      {
        item: {
          scanner: "image",
          id: "CVE-1",
          image: "app",
          reason: "x".repeat(20),
          expires: "2026-02-01",
        },
        error: 'allowlist[0].package: is required for "audit" and "image" entries',
      },
      {
        item: {
          scanner: "image",
          id: "CVE-1",
          package: "openssl",
          reason: "x".repeat(20),
          expires: "2026-02-01",
        },
        error: 'allowlist[0].image: must be one of "app", "api", "ai" for "image" entries',
      },
      {
        item: {
          scanner: "image",
          id: "CVE-1",
          package: "openssl",
          image: "web",
          reason: "x".repeat(20),
          expires: "2026-02-01",
        },
        error: 'allowlist[0].image: must be one of "app", "api", "ai" for "image" entries',
      },
      {
        item: {
          scanner: "secrets",
          id: "generic-api-key",
          reason: "x".repeat(20),
          expires: "2026-02-01",
        },
        error: 'allowlist[0].file: is required for "secrets" entries',
      },
      {
        item: {
          scanner: "secrets",
          id: "generic-api-key",
          file: "src/x.ts",
          line: -1,
          reason: "x".repeat(20),
          expires: "2026-02-01",
        },
        error: "allowlist[0].line: must be a positive integer when present",
      },
      {
        item: {
          scanner: "secrets",
          id: "generic-api-key",
          file: "src/x.ts",
          line: 1.5,
          reason: "x".repeat(20),
          expires: "2026-02-01",
        },
        error: "allowlist[0].line: must be a positive integer when present",
      },
      {
        item: { ...auditEntry(), reason: undefined },
        error: "allowlist[0].reason: must be at least 20 characters",
      },
      {
        item: { ...auditEntry(), reason: "too short" },
        error: "allowlist[0].reason: must be at least 20 characters",
      },
      {
        item: { ...auditEntry(), expires: undefined },
        error: 'allowlist[0].expires: must be an ISO date ("YYYY-MM-DD")',
      },
      {
        item: { ...auditEntry(), expires: "2026/02/01" },
        error: 'allowlist[0].expires: must be an ISO date ("YYYY-MM-DD")',
      },
      {
        item: { ...auditEntry(), expires: "2026-02-30" },
        error: 'allowlist[0].expires: must be an ISO date ("YYYY-MM-DD")',
      },
      {
        item: { ...auditEntry(), expires: "2026-08-01" }, // 198 days after 2026-01-15
        error: `allowlist[0].expires: must be no more than ${MAX_EXPIRES_DAYS} days after today`,
      },
    ]

    for (const { item, error } of cases) {
      const { entries, errors } = parseAllowlist([item], TODAY)
      expect(entries).toEqual([])
      expect(errors).toEqual([error])
    }
  })

  test("an entry with several problems reports every one of them", () => {
    const { errors } = parseAllowlist([{ scanner: "nope" }], TODAY)
    expect(errors).toEqual([
      'allowlist[0].scanner: must be one of "audit", "image", "secrets"',
      "allowlist[0].id: must be a non-empty string",
      "allowlist[0].reason: must be at least 20 characters",
      'allowlist[0].expires: must be an ISO date ("YYYY-MM-DD")',
    ])
  })

  test("an invalid entry is dropped; the valid entries around it still parse", () => {
    const good1 = auditEntry({ id: "GHSA-1" })
    const bad = { scanner: "nope" }
    const good2 = auditEntry({ id: "GHSA-2" })
    const { entries, errors } = parseAllowlist([good1, bad, good2], TODAY)
    expect(entries).toEqual([good1, good2])
    expect(errors.every((e) => e.startsWith("allowlist[1]"))).toBe(true)
  })

  test("accepts exactly 180 days out, and a date already in the past", () => {
    const farButValid = auditEntry({ expires: "2026-07-14" }) // exactly 180 days after 2026-01-15
    expect(parseAllowlist([farButValid], TODAY).errors).toEqual([])
    const alreadyPast = auditEntry({ expires: "2020-01-01" })
    expect(parseAllowlist([alreadyPast], TODAY).errors).toEqual([])
  })

  test("accepts exactly 20-character reasons", () => {
    const entry = auditEntry({ reason: "x".repeat(20) })
    expect(parseAllowlist([entry], TODAY)).toEqual({ entries: [entry], errors: [] })
  })

  test("accepts a secrets entry with no line (matches any line) and with one", () => {
    const noLine: Entry = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      reason: "a fixture token used only in tests",
      expires: "2026-02-01",
    }
    const withLine: Entry = { ...noLine, line: 42 }
    expect(parseAllowlist([noLine, withLine], TODAY)).toEqual({
      entries: [noLine, withLine],
      errors: [],
    })
  })

  test("accepts every image value", () => {
    for (const image of ["app", "api", "ai"] as const) {
      const entry: Entry = {
        scanner: "image",
        id: "CVE-2026-0001",
        package: "openssl",
        image,
        reason: "no fixed version yet, tracked upstream for the next release",
        expires: "2026-02-01",
      }
      expect(parseAllowlist([entry], TODAY)).toEqual({ entries: [entry], errors: [] })
    }
  })
})

describe("decide: severity gate", () => {
  test("high, critical and secret fail with no matching entry", () => {
    for (const severity of ["high", "critical", "secret"] as const) {
      const finding = auditFinding({ severity })
      const result = decide([finding], [], { scanner: "audit" }, TODAY)
      expect(result.failing).toEqual([finding])
      expect(result.allowed).toEqual([])
      expect(result.reported).toEqual([])
    }
  })

  test("low, moderate and medium are reported only, never failing, with or without an entry", () => {
    for (const severity of ["low", "moderate", "medium"] as const) {
      const finding = auditFinding({ severity })
      const withoutEntry = decide([finding], [], { scanner: "audit" }, TODAY)
      expect(withoutEntry.failing).toEqual([])
      expect(withoutEntry.allowed).toEqual([])
      expect(withoutEntry.reported).toEqual([finding])

      const withEntry = decide([finding], [auditEntry()], { scanner: "audit" }, TODAY)
      expect(withEntry.failing).toEqual([])
      expect(withEntry.allowed).toEqual([])
      expect(withEntry.reported).toEqual([finding])
    }
  })

  test("a gating finding matched by a live entry is allowed, not failing", () => {
    const finding = auditFinding({ severity: "critical" })
    const result = decide([finding], [auditEntry()], { scanner: "audit" }, TODAY)
    expect(result.allowed).toEqual([finding])
    expect(result.failing).toEqual([])
  })
})

describe("decide: matching exactness", () => {
  test("wrong scanner on the entry never matches", () => {
    const finding = auditFinding({ severity: "high" })
    const entry = auditEntry({ scanner: "image", image: "api" })
    const result = decide([finding], [entry], { scanner: "audit" }, TODAY)
    expect(result.failing).toEqual([finding])
  })

  test("wrong id never matches", () => {
    const finding = auditFinding({ severity: "high", id: "GHSA-2222-2222-2222" })
    const result = decide([finding], [auditEntry()], { scanner: "audit" }, TODAY)
    expect(result.failing).toEqual([finding])
  })

  test("wrong package never matches", () => {
    const finding = auditFinding({ severity: "high", package: "right-pad" })
    const result = decide([finding], [auditEntry()], { scanner: "audit" }, TODAY)
    expect(result.failing).toEqual([finding])
  })

  test("an image entry only covers the image it names", () => {
    const entry: Entry = {
      scanner: "image",
      id: "CVE-2026-0001",
      package: "openssl",
      image: "app",
      reason: "no fix yet, tracked with the vendor for the next point release",
      expires: "2026-02-01",
    }
    const findingForApp: Finding = {
      scanner: "image",
      id: "CVE-2026-0001",
      severity: "critical",
      package: "openssl",
      image: "app",
    }
    const findingForApi: Finding = { ...findingForApp, image: "api" }

    expect(
      decide([findingForApp], [entry], { scanner: "image", image: "app" }, TODAY).allowed
    ).toEqual([findingForApp])
    expect(
      decide([findingForApi], [entry], { scanner: "image", image: "api" }, TODAY).failing
    ).toEqual([findingForApi])
  })

  test("a secrets entry with a file but no line covers every line in that file", () => {
    const entry: Entry = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      reason: "a fixture token used only in tests, never a live credential",
      expires: "2026-02-01",
    }
    const line10: Finding = {
      scanner: "secrets",
      id: "generic-api-key",
      severity: "secret",
      file: "src/example.ts",
      line: 10,
    }
    const line99: Finding = { ...line10, line: 99 }
    const result = decide([line10, line99], [entry], { scanner: "secrets" }, TODAY)
    expect(result.allowed).toEqual([line10, line99])
    expect(result.failing).toEqual([])
  })

  test("a secrets entry with a line only covers that exact line", () => {
    const entry: Entry = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      line: 10,
      reason: "a fixture token used only in tests, never a live credential",
      expires: "2026-02-01",
    }
    const line10: Finding = {
      scanner: "secrets",
      id: "generic-api-key",
      severity: "secret",
      file: "src/example.ts",
      line: 10,
    }
    const line99: Finding = { ...line10, line: 99 }
    const result = decide([line10, line99], [entry], { scanner: "secrets" }, TODAY)
    expect(result.allowed).toEqual([line10])
    expect(result.failing).toEqual([line99])
  })

  test("a secrets entry never matches a finding in a different file", () => {
    const entry: Entry = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      reason: "a fixture token used only in tests, never a live credential",
      expires: "2026-02-01",
    }
    const elsewhere: Finding = {
      scanner: "secrets",
      id: "generic-api-key",
      severity: "secret",
      file: "src/other.ts",
      line: 1,
    }
    expect(decide([elsewhere], [entry], { scanner: "secrets" }, TODAY).failing).toEqual([elsewhere])
  })
})

describe("decide: expiry", () => {
  test("an entry expiring today still allows (inclusive last valid day)", () => {
    const finding = auditFinding({ severity: "high" })
    const entry = auditEntry({ expires: "2026-01-15" }) // same as TODAY
    const result = decide([finding], [entry], { scanner: "audit" }, TODAY)
    expect(result.allowed).toEqual([finding])
    expect(result.expired).toEqual([])
  })

  test("an entry that expired yesterday fails its finding and is reported expired", () => {
    const finding = auditFinding({ severity: "high" })
    const entry = auditEntry({ expires: "2026-01-14" })
    const result = decide([finding], [entry], { scanner: "audit" }, TODAY)
    expect(result.failing).toEqual([finding])
    expect(result.expired).toEqual([entry])
  })

  test("expiry is global: an expired entry of a different scanner (or image) still fails the run", () => {
    const secretsEntry: Entry = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      reason: "a fixture token used only in tests, never a live credential",
      expires: "2026-01-01",
    }
    // run.scanner is "audit" — the expired entry belongs to "secrets" and is out of scope for
    // staleness, but it still shows up as expired.
    const result = decide([], [secretsEntry], { scanner: "audit" }, TODAY)
    expect(result.expired).toEqual([secretsEntry])
    expect(result.stale).toEqual([])
  })

  test("UTC date math: a few hours either side of local midnight does not move the boundary", () => {
    const finding = auditFinding({ severity: "high" })
    const entry = auditEntry({ expires: "2026-01-15" })
    const lateInTheDay = new Date(Date.UTC(2026, 0, 15, 23, 59, 59))
    expect(decide([finding], [entry], { scanner: "audit" }, lateInTheDay).allowed).toEqual([
      finding,
    ])
    const earlyNextDay = new Date(Date.UTC(2026, 0, 16, 0, 0, 1))
    expect(decide([finding], [entry], { scanner: "audit" }, earlyNextDay).failing).toEqual([
      finding,
    ])
  })
})

describe("decide: staleness", () => {
  test("an unmatched entry of the run's own scanner is stale", () => {
    const entry = auditEntry()
    const result = decide([], [entry], { scanner: "audit" }, TODAY)
    expect(result.stale).toEqual([entry])
  })

  test("a matched entry is never stale", () => {
    const finding = auditFinding({ severity: "high" })
    const result = decide([finding], [auditEntry()], { scanner: "audit" }, TODAY)
    expect(result.stale).toEqual([])
  })

  test("an entry of a different scanner is never judged by this run", () => {
    const secretsEntry: Entry = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      reason: "a fixture token used only in tests, never a live credential",
      expires: "2026-02-01",
    }
    const result = decide([], [secretsEntry], { scanner: "audit" }, TODAY)
    expect(result.stale).toEqual([])
  })

  test("an image entry is only judged stale by a run of its own image", () => {
    const entry: Entry = {
      scanner: "image",
      id: "CVE-2026-0001",
      package: "openssl",
      image: "app",
      reason: "no fix yet, tracked with the vendor for the next point release",
      expires: "2026-02-01",
    }
    // The api image's run never built/scanned app, so it must never call this entry stale.
    const apiRun = decide([], [entry], { scanner: "image", image: "api" }, TODAY)
    expect(apiRun.stale).toEqual([])
    // A run of the app image with no matching finding does call it stale.
    const appRun = decide([], [entry], { scanner: "image", image: "app" }, TODAY)
    expect(appRun.stale).toEqual([entry])
  })

  test("a run with judgeStale: false never reports an entry stale (a --range secrets run)", () => {
    const entry: Entry = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      reason: "a fixture token used only in tests, never a live credential",
      expires: "2026-02-01",
    }
    // A PR's range sees only its own commits, so an entry for an older commit matches nothing.
    const rangeRun = decide([], [entry], { scanner: "secrets", judgeStale: false }, TODAY)
    expect(rangeRun.stale).toEqual([])
    // A working-tree or --history run sees everything, so the same entry is stale there.
    const dirRun = decide([], [entry], { scanner: "secrets" }, TODAY)
    expect(dirRun.stale).toEqual([entry])
  })

  test("judgeStale: false still reports expired entries and still fails unallowed findings", () => {
    const entry: Entry = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      reason: "a fixture token used only in tests, never a live credential",
      expires: "2026-01-01",
    }
    const finding: Finding = {
      scanner: "secrets",
      id: "generic-api-key",
      file: "src/example.ts",
      line: 3,
      severity: "secret",
    }
    const result = decide([finding], [entry], { scanner: "secrets", judgeStale: false }, TODAY)
    expect(result.expired).toEqual([entry])
    expect(result.failing).toEqual([finding])
  })
})

describe("formatTable", () => {
  test("no findings", () => {
    expect(formatTable([])).toBe("(no findings)")
  })

  test("a vulnerability table includes severity, package, versions and a link", () => {
    const table = formatTable([
      {
        scanner: "audit",
        id: "GHSA-1111-1111-1111",
        severity: "high",
        package: "left-pad",
        installed: "1.0.0",
        fixed: "1.0.1",
        url: "https://example.com/advisory",
      },
    ])
    expect(table).toContain("left-pad")
    expect(table).toContain("1.0.0")
    expect(table).toContain("1.0.1")
    expect(table).toContain("https://example.com/advisory")
    expect(table).toContain("HIGH".toLowerCase() === "high" ? "high" : "")
  })

  test("a secret finding's row never carries anything beyond rule id, file and line", () => {
    const table = formatTable([
      {
        scanner: "secrets",
        id: "generic-api-key",
        severity: "secret",
        file: "src/leaked.ts",
        line: 7,
        // Decoy fields a misbehaving upstream caller might still set on a secrets finding —
        // formatTable must never let any of these reach the output.
        package: "should-not-appear-package",
        image: "should-not-appear-image",
        installed: "should-not-appear-installed",
        fixed: "should-not-appear-fixed",
        url: "https://should-not-appear.example/secret",
        title: "should-not-appear-title",
      },
    ])
    expect(table).toContain("generic-api-key")
    expect(table).toContain("src/leaked.ts")
    expect(table).toContain("7")
    expect(table).not.toContain("should-not-appear")
  })

  test("vulnerabilities and secrets render as separate sections in one call", () => {
    const table = formatTable([
      auditFinding({ severity: "high" }),
      { scanner: "secrets", id: "generic-api-key", severity: "secret", file: "src/x.ts", line: 1 },
    ])
    expect(table).toContain("left-pad")
    expect(table).toContain("generic-api-key")
  })
})

describe("loadAllowlist", () => {
  test("the committed security/allowlist.json parses with no errors", () => {
    const result = loadAllowlist()
    expect(result.errors).toEqual([])
  })

  test("a fixture with an invalid entry reports its errors", () => {
    const result = loadAllowlist(join(import.meta.dirname, "fixtures", "invalid-allowlist.json"))
    expect(result.entries).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.every((e) => e.startsWith("allowlist[0]"))).toBe(true)
  })
})
