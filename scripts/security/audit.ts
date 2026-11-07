/**
 * Dependency audit scanner: runs `bun audit --json`, normalises its advisories into `Finding[]`,
 * applies `security/allowlist.json` and prints a table, then writes
 * `security/.results/audit.json`. See `docs/superpowers/specs/2026-10-17-security-scanning-design.md`
 * section 1 and `.superpowers/sdd/2026-10-17-security-scanning/constraints.md`.
 *
 * `bun test scripts` runs with no network: only `normaliseAudit` below is exercised directly,
 * against a committed fixture (the decide/print/write/exit tail is `report.ts`'s `finish()`,
 * tested once there). `main()` is thin orchestration — it is run for real with
 * `bun run security`, never under the test runner.
 */

import { join } from "node:path"
import type { Finding, Severity } from "./allowlist"
import { finish } from "./report"

/** `bun audit` only ever reports these four — never "secret" and never Trivy's "medium". */
const AUDIT_SEVERITIES: ReadonlySet<string> = new Set(["low", "moderate", "high", "critical"])

const GHSA_IN_URL = /\/advisories\/(GHSA-[0-9a-zA-Z-]+)$/

/**
 * `bun audit --json` reports `{ "<package>": [<advisory>, ...] }`. A package can carry several
 * distinct advisories, and the same advisory can be listed more than once (once per vulnerable
 * version range it covers) — real output does this, e.g. `brace-expansion` listing
 * `GHSA-mh99-v99m-4gvg` twice, once for its 1.x range and once for its 2.x range. Findings are
 * keyed by package + the GHSA id parsed out of the advisory's `url`, de-duplicated by keeping the
 * first occurrence (every duplicate observed in real output repeats the same severity and title).
 *
 * Throws a plain `Error` with a message naming the problem on anything that doesn't match this
 * shape — the CLI below turns that into a tool-failure exit (2), distinct from a clean run that
 * simply found nothing (0) or found something the allowlist does not cover (1).
 */
export function normaliseAudit(json: unknown): Finding[] {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("bun audit --json: expected an object keyed by package name")
  }

  const seen = new Map<string, Finding>()

  for (const [pkg, value] of Object.entries(json as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      throw new Error(`bun audit --json: "${pkg}" is not an array of advisories`)
    }

    for (const raw of value) {
      if (typeof raw !== "object" || raw === null) {
        throw new Error(`bun audit --json: an advisory for "${pkg}" is not an object`)
      }
      const advisory = raw as Record<string, unknown>

      if (typeof advisory.url !== "string") {
        throw new Error(`bun audit --json: an advisory for "${pkg}" has no url`)
      }
      const match = GHSA_IN_URL.exec(advisory.url)
      if (!match) {
        throw new Error(`bun audit --json: cannot find a GHSA id in "${advisory.url}"`)
      }
      const ghsaId = match[1]
      if (ghsaId === undefined) {
        // Unreachable: GHSA_IN_URL's one capture group is outside any `?`/`*`, so a successful
        // match always has it — guarded anyway so this never silently narrows to `string`.
        throw new Error(`bun audit --json: cannot find a GHSA id in "${advisory.url}"`)
      }

      if (typeof advisory.severity !== "string" || !AUDIT_SEVERITIES.has(advisory.severity)) {
        throw new Error(
          `bun audit --json: unknown severity "${String(advisory.severity)}" for "${pkg}"`
        )
      }

      if (typeof advisory.title !== "string" || advisory.title.length === 0) {
        throw new Error(`bun audit --json: an advisory for "${pkg}" has no title`)
      }

      const key = `${pkg}::${ghsaId}`
      if (seen.has(key)) continue

      seen.set(key, {
        scanner: "audit",
        id: ghsaId,
        severity: advisory.severity as Severity,
        package: pkg,
        url: advisory.url,
        title: advisory.title,
      })
    }
  }

  return [...seen.values()]
}

const REPO_ROOT = join(import.meta.dirname, "..", "..")
const RESULTS_DIR = join(REPO_ROOT, "security", ".results")

async function runBunAudit(): Promise<string> {
  const proc = Bun.spawn(["bun", "audit", "--json"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  // bun audit's own exit code reflects whether it found vulnerabilities, not whether it ran
  // successfully — a failed run (missing lockfile, no network) prints nothing useful to stdout,
  // which is what we actually check below. `err` here is bun's own operational message (e.g.
  // "missing lockfile"), never report content, so echoing it is safe.
  if (out.trim().length === 0) {
    throw new Error(`bun audit produced no output${err.trim() ? `\n${err.trim()}` : ""}`)
  }
  return out
}

async function main() {
  let stdout: string
  try {
    stdout = await runBunAudit()
  } catch (error) {
    console.error(`audit: could not run "bun audit --json": ${(error as Error).message}`)
    process.exit(2)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    // Never interpolate JSON.parse's own message: it can quote a raw token straight out of the
    // report (Bun's parser echoes the offending text in "Unexpected identifier \"...\"").
    console.error("audit: bun audit did not print JSON")
    process.exit(2)
  }

  let findings: Finding[]
  try {
    findings = normaliseAudit(parsed)
  } catch (error) {
    console.error(`audit: ${(error as Error).message}`)
    process.exit(2)
  }

  process.exit(
    finish({
      label: "audit",
      findings,
      run: { scanner: "audit" },
      resultsPath: join(RESULTS_DIR, "audit.json"),
    })
  )
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`audit: ${(error as Error).message}`)
    process.exit(2)
  })
}
