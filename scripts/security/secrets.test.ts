/**
 * `fixtures/gitleaks.json` is real Gitleaks JSON output (captured 2026-10-17 with
 * `ghcr.io/gitleaks/gitleaks:v8.30.1`, `gitleaks git . --redact --report-format json
 * --exit-code 0 --no-banner`) from a throwaway repo under the OS temp dir, seeded with two
 * obviously fake, non-real credentials — a fake AWS secret access key in a `.env` file and a
 * fake Stripe-style key in a `.js` file, both invented for this capture and never real secrets.
 * Gitleaks' own `--redact` already scrubs `Secret`/`Match`; the fixture additionally carries real
 * `Commit`/`Author`/`Email`/`Message`/`Fingerprint` values from that throwaway repo's commits
 * (author "Test" <test@example.com>, a repo that exists only under /tmp and is not part of this
 * one), which is exactly the data `normaliseGitleaks` must never let through.
 */
import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatTable } from "./allowlist"
import {
  hasSymlinkParent,
  normaliseGitleaks,
  parseLsFilesZ,
  parseSecretsArgs,
  planWorkingTreeCopy,
  rangeLogOpts,
  resolveCommit,
  secretsRun,
  ZERO_SHA,
} from "./secrets"

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "gitleaks.json"), "utf8")
)

const REPO_ROOT = join(import.meta.dirname, "..", "..")

/** The real `git rev-parse <ref>`, used only to compute an expectation — never the code under test. */
function gitRevParse(ref: string): string {
  const proc = Bun.spawnSync(["git", "rev-parse", ref], { cwd: REPO_ROOT })
  if (proc.exitCode !== 0) throw new Error(`git rev-parse ${ref} failed: ${proc.stderr.toString()}`)
  return proc.stdout.toString().trim()
}

describe("normaliseGitleaks", () => {
  test("maps RuleID/File/StartLine to a secret Finding, dropping everything else", () => {
    expect(normaliseGitleaks(fixture)).toEqual([
      { scanner: "secrets", id: "generic-api-key", file: ".env", line: 2, severity: "secret" },
      {
        scanner: "secrets",
        id: "stripe-access-token",
        file: "stripe.js",
        line: 2,
        severity: "secret",
      },
    ])
  })

  test("never carries the fixture's Commit, Author or Email into the output", () => {
    const findings = normaliseGitleaks(fixture)
    const serialised = JSON.stringify(findings)
    expect(serialised).not.toContain("4d327ccd3798abd5e29fe9afdf247e728eaad96b")
    expect(serialised).not.toContain("fccb0b56dd984accffa87a46b755b3dca696da18")
    expect(serialised).not.toContain("Test")
    expect(serialised).not.toContain("test@example.com")
    expect(serialised).not.toContain("add fake stripe key")
  })

  test("a raw finding carrying an actual secret value never reaches the output", () => {
    // A defensive case: even if Gitleaks' own --redact somehow failed to scrub a field, or
    // reported a raw Fingerprint with a commit in it, normaliseGitleaks must not forward it —
    // it only ever reads RuleID/File/StartLine off the raw object.
    const leaky = [
      {
        RuleID: "aws-access-key",
        File: "config.js",
        StartLine: 3,
        Secret: "FAKE_SECRET_VALUE_FOR_TEST_1234567890",
        Match: "AKIA_FAKE_SECRET_VALUE_FOR_TEST_1234567890",
        Fingerprint: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef:config.js:aws-access-key:3",
        Commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        Author: "Eve",
        Email: "eve@example.com",
      },
    ]
    const findings = normaliseGitleaks(leaky)
    const serialised = JSON.stringify(findings)
    expect(serialised).not.toContain("FAKE_SECRET_VALUE_FOR_TEST_1234567890")
    expect(serialised).not.toContain("deadbeef")
    expect(serialised).not.toContain("Eve")
    expect(serialised).not.toContain("eve@example.com")
    expect(findings).toEqual([
      { scanner: "secrets", id: "aws-access-key", file: "config.js", line: 3, severity: "secret" },
    ])
  })

  test("the formatted table never carries a secret's commit, author or email either", () => {
    const findings = normaliseGitleaks(fixture)
    const table = formatTable(findings)
    expect(table).not.toContain("4d327ccd3798abd5e29fe9afdf247e728eaad96b")
    expect(table).not.toContain("test@example.com")
    expect(table).toContain("generic-api-key")
    expect(table).toContain(".env")
  })

  test("rejects a non-array payload", () => {
    expect(() => normaliseGitleaks({})).toThrow("expected a JSON array of findings")
  })

  test("rejects a finding missing RuleID", () => {
    expect(() => normaliseGitleaks([{ File: "a", StartLine: 1 }])).toThrow("has no RuleID")
  })

  test("rejects a finding missing File", () => {
    expect(() => normaliseGitleaks([{ RuleID: "r", StartLine: 1 }])).toThrow("has no File")
  })

  test("rejects a finding missing StartLine", () => {
    expect(() => normaliseGitleaks([{ RuleID: "r", File: "a" }])).toThrow("has no StartLine")
  })
})

describe("parseSecretsArgs", () => {
  test("no flags scans the working tree", () => {
    expect(parseSecretsArgs([])).toEqual({ mode: "dir" })
  })

  test("--history scans every commit", () => {
    expect(parseSecretsArgs(["--history"])).toEqual({ mode: "history" })
  })

  test("--range <base>..<head> scans that range", () => {
    expect(parseSecretsArgs(["--range", "abc123..def456"])).toEqual({
      mode: "range",
      base: "abc123",
      head: "def456",
    })
  })

  test("--range=<base>..<head> works too", () => {
    expect(parseSecretsArgs(["--range=abc123..def456"])).toEqual({
      mode: "range",
      base: "abc123",
      head: "def456",
    })
  })

  test("--range and --history are mutually exclusive", () => {
    expect(parseSecretsArgs(["--range", "a..b", "--history"])).toEqual({
      error: "secrets: --range and --history are mutually exclusive",
    })
  })

  test("a range with no ..  is rejected", () => {
    expect(parseSecretsArgs(["--range", "abc123"])).toEqual({
      error: 'secrets: --range must look like <base>..<head>, got "abc123"',
    })
  })

  test("a range missing its base or head is rejected", () => {
    expect(parseSecretsArgs(["--range", "..def456"])).toEqual({
      error: 'secrets: --range must look like <base>..<head>, got "..def456"',
    })
    expect(parseSecretsArgs(["--range", "abc123.."])).toEqual({
      error: 'secrets: --range must look like <base>..<head>, got "abc123.."',
    })
  })

  test("--range with no value is rejected", () => {
    expect(parseSecretsArgs(["--range"])).toEqual({ error: "secrets: --range needs a value" })
  })

  test("an unknown flag is rejected", () => {
    expect(parseSecretsArgs(["--nope"])).toEqual({ error: 'secrets: unknown argument "--nope"' })
  })
})

// The decide/print/write/exit tail — including `exitCodeFor` — is shared by all three scanners
// as `report.ts`'s `finish()`, and is tested once there (report.test.ts), not per scanner.

describe("resolveCommit", () => {
  test("HEAD resolves to this repo's own full 40-hex commit SHA", () => {
    expect(resolveCommit("HEAD", REPO_ROOT)).toBe(gitRevParse("HEAD"))
  })

  test("a well-formed but non-existent SHA is refused", () => {
    expect(resolveCommit("f".repeat(40), REPO_ROOT)).toBeNull()
  })

  test("a tree id (not a commit) is refused, not resolved to one", () => {
    const treeId = gitRevParse("HEAD^{tree}")
    expect(resolveCommit(treeId, REPO_ROOT)).toBeNull()
  })

  test("a blob id (not a commit) is refused, not resolved to one", () => {
    const blobId = gitRevParse("HEAD:package.json")
    expect(resolveCommit(blobId, REPO_ROOT)).toBeNull()
  })

  test("a shell-metacharacter-laden ref resolves only to a commit SHA, never executes anything", () => {
    // Bun.spawnSync passes this string as one argv element straight to git — there is no shell in
    // between to expand `$(...)` — so this is purely git's own (loose) reflog-date grammar to
    // parse. Whether `HEAD@{now ...}` resolves at all depends on whether this clone happens to
    // have a reflog for HEAD (a reflog-less clone refuses the whole ref outright, `null`); either
    // way, nothing inside `$(...)` ever runs — proved directly here with a touch payload rather
    // than trusting that a `$(id)` with no observable side effect didn't silently run.
    const marker = join(tmpdir(), `security-secrets-marker-${Date.now()}-${Math.random()}`)
    try {
      const result = resolveCommit(`HEAD@{now $(touch ${marker})}`, REPO_ROOT)
      expect(result === null || /^[0-9a-f]{40}$/.test(result)).toBe(true)
      if (result !== null) expect(result).toBe(gitRevParse("HEAD"))
      expect(existsSync(marker)).toBe(false)
    } finally {
      rmSync(marker, { force: true })
    }
  })

  test("an unparseable ref is refused", () => {
    expect(resolveCommit("not a ref at all @#$%", REPO_ROOT)).toBeNull()
  })
})

describe("rangeLogOpts", () => {
  const headSha = "b".repeat(40)
  const baseSha = "c".repeat(40)
  const resolveKnown = (ref: string) => {
    if (ref === "head") return headSha
    if (ref === "base") return baseSha
    return null
  }

  test("a resolvable base and head produce a <base>..<head> log-opts", () => {
    expect(rangeLogOpts("base", "head", resolveKnown)).toEqual({
      logOpts: `--log-opts=${baseSha}..${headSha}`,
    })
  })

  test("an all-zero base (a new branch's first push) scans just the head commit", () => {
    expect(rangeLogOpts(ZERO_SHA, "head", resolveKnown)).toEqual({
      logOpts: `--log-opts=${headSha}^!`,
    })
  })

  test("an unresolvable head is an error before the base is even checked", () => {
    expect(rangeLogOpts("base", "nope", resolveKnown)).toEqual({
      error: 'cannot resolve commit "nope" in --range',
    })
  })

  test("an unresolvable base is an error", () => {
    expect(rangeLogOpts("nope", "head", resolveKnown)).toEqual({
      error: 'cannot resolve commit "nope" in --range',
    })
  })
})

describe("secretsRun", () => {
  test("a --range run never judges secrets entries stale", () => {
    expect(secretsRun({ mode: "range", base: "a", head: "b" })).toEqual({
      scanner: "secrets",
      judgeStale: false,
    })
  })

  test("working-tree and --history runs do", () => {
    expect(secretsRun({ mode: "dir" })).toEqual({ scanner: "secrets", judgeStale: true })
    expect(secretsRun({ mode: "history" })).toEqual({ scanner: "secrets", judgeStale: true })
  })
})

describe("parseLsFilesZ", () => {
  test("splits NUL-terminated paths, keeping spaces and newlines inside a name", () => {
    expect(parseLsFilesZ("a.ts\0dir/b c.ts\0odd\nname\0")).toEqual([
      "a.ts",
      "dir/b c.ts",
      "odd\nname",
    ])
  })

  test("an empty listing is no paths", () => {
    expect(parseLsFilesZ("")).toEqual([])
  })

  test("a repeated path (listed as both cached and other) appears once", () => {
    expect(parseLsFilesZ("a.ts\0a.ts\0")).toEqual(["a.ts"])
  })
})

describe("planWorkingTreeCopy", () => {
  const kinds: Record<string, "file" | "symlink" | "missing" | "other"> = {
    "src/a.ts": "file",
    "src/link": "symlink",
    "deleted.ts": "missing",
    "vendor/submodule": "other",
  }
  const kindOf = (path: string) => kinds[path] ?? "missing"

  test("copies files, recreates symlinks, skips deleted paths and anything else", () => {
    expect(planWorkingTreeCopy(Object.keys(kinds), kindOf)).toEqual([
      { path: "src/a.ts", kind: "file" },
      { path: "src/link", kind: "symlink" },
    ])
  })

  test("never plans a path that escapes the repo root", () => {
    const all = (_: string) => "file" as const
    expect(
      planWorkingTreeCopy(["../outside", "/etc/passwd", "ok/../../x", "fine.ts"], all)
    ).toEqual([{ path: "fine.ts", kind: "file" }])
  })

  test("only the listed paths are planned — a git-ignored .env never appears unless git lists it", () => {
    const all = (_: string) => "file" as const
    expect(planWorkingTreeCopy(["README.md"], all).map((step) => step.path)).toEqual(["README.md"])
  })

  test("skips a path whose parent directory is a symlink, even though the leaf itself is a file", () => {
    const all = (_: string) => "file" as const
    // "linked" is a symlink (planted, say, between checkout and scan) pointing outside the repo;
    // git still lists "linked/evil.ts" as a path (it tracked the real file before "linked" became
    // a link, or the link resolves back into something git can still see as untracked). Copying
    // through it would read whatever "linked" now points at, straight out of the repo's bounds.
    const hasSymlinkParent = (path: string) => path.startsWith("linked/")
    expect(planWorkingTreeCopy(["linked/evil.ts", "fine.ts"], all, hasSymlinkParent)).toEqual([
      { path: "fine.ts", kind: "file" },
    ])
  })

  test("with no hasSymlinkParent given, behaves exactly as before (defaults to no symlink parents)", () => {
    expect(planWorkingTreeCopy(Object.keys(kinds), kindOf)).toEqual([
      { path: "src/a.ts", kind: "file" },
      { path: "src/link", kind: "symlink" },
    ])
  })
})

describe("hasSymlinkParent", () => {
  test("true when any ancestor directory segment is a symlink", () => {
    const lstat = (path: string) => (path === "a/b" ? { isSymbolicLink: () => true } : undefined)
    expect(hasSymlinkParent("a/b/c.ts", lstat)).toBe(true)
  })

  test("false when every ancestor is a real directory", () => {
    const lstat = (_path: string) => ({ isSymbolicLink: () => false })
    expect(hasSymlinkParent("a/b/c.ts", lstat)).toBe(false)
  })

  test("a top-level file (no parent directories) is never flagged", () => {
    const lstat = () => ({ isSymbolicLink: () => true })
    expect(hasSymlinkParent("file.ts", lstat)).toBe(false)
  })

  test("a missing ancestor (lstat returns undefined) is never treated as a symlink", () => {
    const lstat = (_path: string) => undefined
    expect(hasSymlinkParent("a/b/c.ts", lstat)).toBe(false)
  })

  test("checks every ancestor, not just the immediate parent", () => {
    const lstat = (path: string) => (path === "a" ? { isSymbolicLink: () => true } : undefined)
    expect(hasSymlinkParent("a/b/c.ts", lstat)).toBe(true)
  })
})
