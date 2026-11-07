/**
 * Container image scanner: runs Trivy against a local Docker image (built by this script in
 * `--build` mode, or an already-built tag in `--image` mode), normalises its vulnerabilities into
 * `Finding[]`, applies `security/allowlist.json` and prints a table, then writes
 * `security/.results/image-<app>.json`. See
 * `docs/superpowers/specs/2026-10-17-security-scanning-design.md` section 1 and
 * `.superpowers/sdd/2026-10-17-security-scanning/constraints.md`.
 *
 * `bun test scripts` runs with no network and no Docker: only `normaliseTrivy`, `parseImageArgs`,
 * the argv builders (`dockerBuildArgs`, `trivyRunArgs`, `aptRefreshDate`) and the static
 * `IMAGE_BUILD_CONFIG` mapping are exercised directly, against a committed fixture
 * (the decide/print/write/exit tail is `report.ts`'s `finish()`, tested once there). `main()` is
 * thin orchestration — it is run for real with `bun run security:image <app>`, never under the
 * test runner.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Finding } from "./allowlist"
import { IMAGES, type Image, SEVERITIES, type Severity } from "./allowlist"
import { finish } from "./report"

/**
 * Trivy pinned to its latest stable release — checked by `docker pull aquasec/trivy:0.76.0` on
 * 2026-10-17, the day this scanner was written. Pulled from ghcr.io (the same release Docker Hub
 * carries) so both scanner images come from one registry, outside Docker Hub's anonymous limits.
 */
export const TRIVY_IMAGE = "ghcr.io/aquasecurity/trivy:0.76.0"

/**
 * One build per app the `docker` CI job also builds, with the same Dockerfile, build args and
 * port as `.github/workflows/ci.yml`'s `DOCKER_MATRIX` (`app` stands in for all seven Next apps,
 * which share `next.Dockerfile`; `api` and `ai` each get `bun-service.Dockerfile`).
 */
export const IMAGE_BUILD_CONFIG: Record<
  Image,
  { dockerfile: "next" | "bun-service"; port: number }
> = {
  app: { dockerfile: "next", port: 3001 },
  api: { dockerfile: "bun-service", port: 3007 },
  ai: { dockerfile: "bun-service", port: 3008 },
}

const isImage = (value: string): value is Image => (IMAGES as readonly string[]).includes(value)

/**
 * Trivy's own JSON can list the same vulnerability twice (once per layer it is detected in);
 * findings are de-duplicated by `(VulnerabilityID, PkgName, InstalledVersion)`, keeping the first
 * occurrence. Only `VulnerabilityID`, `PkgName`, `InstalledVersion` and `Severity` are guaranteed —
 * `FixedVersion` and `PrimaryURL` (and `Title`) may be absent, which `--ignore-unfixed` does not
 * fully rule out (a vulnerability can be marked "fixed" in a data source with no concrete
 * `FixedVersion` string yet). A report missing `SchemaVersion: 2` or `ArtifactName` is rejected
 * outright, rather than read as "0 findings" — `{}` is not a clean scan, it is Trivy (or whatever
 * produced the file) not having run as expected.
 */
export function normaliseTrivy(json: unknown, image: Image): Finding[] {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("trivy: expected a JSON object")
  }
  const report = json as Record<string, unknown>

  if (report.SchemaVersion !== 2) {
    throw new Error("trivy: report has no SchemaVersion 2 (not a Trivy JSON report?)")
  }
  if (typeof report.ArtifactName !== "string" || report.ArtifactName.length === 0) {
    throw new Error("trivy: report has no ArtifactName")
  }

  if (report.Results !== undefined && !Array.isArray(report.Results)) {
    throw new Error("trivy: Results is not an array")
  }
  const results = (report.Results as unknown[] | undefined) ?? []

  const seen = new Map<string, Finding>()

  for (const result of results) {
    if (typeof result !== "object" || result === null) {
      throw new Error("trivy: a result is not an object")
    }
    const vulnerabilities = (result as Record<string, unknown>).Vulnerabilities
    if (vulnerabilities === undefined) continue
    if (!Array.isArray(vulnerabilities)) {
      throw new Error("trivy: Vulnerabilities is not an array")
    }

    for (const raw of vulnerabilities) {
      if (typeof raw !== "object" || raw === null) {
        throw new Error("trivy: a vulnerability entry is not an object")
      }
      const v = raw as Record<string, unknown>

      if (typeof v.VulnerabilityID !== "string" || v.VulnerabilityID.length === 0) {
        throw new Error("trivy: a vulnerability has no VulnerabilityID")
      }
      if (typeof v.PkgName !== "string" || v.PkgName.length === 0) {
        throw new Error(`trivy: ${v.VulnerabilityID} has no PkgName`)
      }
      if (typeof v.InstalledVersion !== "string" || v.InstalledVersion.length === 0) {
        throw new Error(`trivy: ${v.VulnerabilityID} has no InstalledVersion`)
      }
      if (typeof v.Severity !== "string" || v.Severity.length === 0) {
        throw new Error(`trivy: ${v.VulnerabilityID} has no Severity`)
      }

      const severity = v.Severity.toLowerCase()
      if (!(SEVERITIES as readonly string[]).includes(severity)) {
        throw new Error(`trivy: unknown severity "${v.Severity}" for ${v.VulnerabilityID}`)
      }

      const key = `${v.VulnerabilityID}::${v.PkgName}::${v.InstalledVersion}`
      if (seen.has(key)) continue

      seen.set(key, {
        scanner: "image",
        id: v.VulnerabilityID,
        severity: severity as Severity,
        package: v.PkgName,
        image,
        installed: v.InstalledVersion,
        fixed:
          typeof v.FixedVersion === "string" && v.FixedVersion.length > 0
            ? v.FixedVersion
            : undefined,
        url: typeof v.PrimaryURL === "string" && v.PrimaryURL.length > 0 ? v.PrimaryURL : undefined,
        title: typeof v.Title === "string" && v.Title.length > 0 ? v.Title : undefined,
      })
    }
  }

  return [...seen.values()]
}

export type ImageArgs = { mode: "scan"; tag: string; app: Image } | { mode: "build"; app: Image }

/**
 * Pure: parses `--image <tag> --app <app|api|ai>` (scan a tag already built) or `--build <app>`
 * (build that app's image exactly as CI does, then scan it).
 */
export function parseImageArgs(argv: string[]): ImageArgs | { error: string } {
  let build: string | undefined
  let tag: string | undefined
  let app: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) break
    if (arg === "--build") {
      i++
      const value = argv[i]
      if (value === undefined) return { error: "image: --build needs a value" }
      build = value
    } else if (arg === "--image") {
      i++
      const value = argv[i]
      if (value === undefined) return { error: "image: --image needs a value" }
      tag = value
    } else if (arg === "--app") {
      i++
      const value = argv[i]
      if (value === undefined) return { error: "image: --app needs a value" }
      app = value
    } else {
      return { error: `image: unknown argument "${arg}"` }
    }
  }

  if (build !== undefined) {
    if (tag !== undefined || app !== undefined) {
      return { error: "image: --build cannot be combined with --image or --app" }
    }
    if (!isImage(build)) {
      return { error: `image: --build must be one of ${IMAGES.join(", ")}, got "${build}"` }
    }
    return { mode: "build", app: build }
  }

  if (tag === undefined) return { error: "image: --image <tag> or --build <app> is required" }
  if (app === undefined) return { error: "image: --app <app|api|ai> is required" }
  if (!isImage(app))
    return { error: `image: --app must be one of ${IMAGES.join(", ")}, got "${app}"` }

  return { mode: "scan", tag, app }
}

const REPO_ROOT = join(import.meta.dirname, "..", "..")
const RESULTS_DIR = join(REPO_ROOT, "security", ".results")
const DEFAULT_CACHE_DIR = join(REPO_ROOT, "security", ".cache", "trivy")

async function run(
  cmd: string[],
  opts: { stdio?: "inherit" } = {}
): Promise<{ code: number; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: REPO_ROOT,
    stdout: opts.stdio === "inherit" ? "inherit" : "pipe",
    stderr: opts.stdio === "inherit" ? "inherit" : "pipe",
  })
  const stderr = opts.stdio === "inherit" ? "" : await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, stderr }
}

/**
 * Pure: the run's UTC date (`YYYY-MM-DD`), passed as the Dockerfiles' `APT_REFRESH` build arg. A
 * new value is a cache miss for the runtime stage's `apt-get upgrade` layer, so a cached build
 * still picks up Debian's security patches at least once a day — CI passes the same value.
 */
export function aptRefreshDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** Pure: the `docker build` argv for `app`, exactly as the CI `docker` job builds it. */
export function dockerBuildArgs(app: Image, now: Date): string[] {
  const { dockerfile, port } = IMAGE_BUILD_CONFIG[app]
  return [
    "docker",
    "build",
    "-f",
    `docker/${dockerfile}.Dockerfile`,
    "--build-arg",
    `APP=${app}`,
    "--build-arg",
    `PORT=${port}`,
    "--build-arg",
    `APT_REFRESH=${aptRefreshDate(now)}`,
    "-t",
    `boilerplate-bun-scan-${app}`,
    ".",
  ]
}

/** Builds `app`'s image exactly as the CI `docker` job does, tagged `boilerplate-bun-scan-<app>`. */
async function buildImage(app: Image): Promise<string> {
  const tag = `boilerplate-bun-scan-${app}`
  const { code, stderr } = await run(dockerBuildArgs(app, new Date()), { stdio: "inherit" })
  if (code !== 0) {
    throw new Error(`docker build exited ${code}${stderr.trim() ? `\n${stderr.trim()}` : ""}`)
  }
  return tag
}

/**
 * Pure: the `docker run` argv for Trivy. `--cache-backend memory` keeps the per-image layer
 * (`fanal`) cache in memory, so only the vulnerability DB is written to `cacheDir` — the directory
 * CI saves with `actions/cache`, keyed by date; scan caches of throwaway images don't belong there.
 */
export function trivyRunArgs(tag: string, cacheDir: string, outDir: string): string[] {
  return [
    "docker",
    "run",
    "--rm",
    "-v",
    "/var/run/docker.sock:/var/run/docker.sock",
    "-v",
    `${cacheDir}:/root/.cache/trivy`,
    "-v",
    `${outDir}:/out`,
    TRIVY_IMAGE,
    "image",
    "--format",
    "json",
    "--scanners",
    "vuln",
    "--ignore-unfixed",
    "--severity",
    "HIGH,CRITICAL",
    "--cache-backend",
    "memory",
    "--image-src",
    "docker",
    "--output",
    "/out/report.json",
    "--",
    tag,
  ]
}

/**
 * Runs Trivy against `tag` and returns its report as raw text (parsed separately by the caller).
 * The report is written to a `mkdtemp` directory, never into `security/.results/` (the directory
 * CI uploads as an artifact) — a killed process would otherwise leave a half-written or
 * secret-scan-included report there ahead of the `finally` cleanup. `--scanners vuln` disables
 * Trivy's default secret scanning (this scanner's job is `secrets.ts`'s, over Gitleaks; a second,
 * unfiltered secret scanner here would both slow the run and sit ungated, since `normaliseTrivy`
 * never reads a `Secrets` result). `--image-src docker` plus `--` before `tag` keep a typo'd or
 * missing local tag from silently falling back to a same-named image on a remote registry — a
 * tag that happens to start with `-` is read as that argument, not a flag, either way.
 */
async function scanImage(tag: string): Promise<string> {
  const cacheDir = Bun.env.TRIVY_CACHE_DIR ?? DEFAULT_CACHE_DIR
  mkdirSync(cacheDir, { recursive: true })
  const outDir = mkdtempSync(join(tmpdir(), "security-image-"))

  try {
    const { code, stderr } = await run(trivyRunArgs(tag, cacheDir, outDir))
    if (code !== 0) {
      throw new Error(
        `docker run exited ${code} (trivy pull/run failure)${stderr.trim() ? `\n${stderr.trim()}` : ""}`
      )
    }
    return readFileSync(join(outDir, "report.json"), "utf8")
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

async function main() {
  const args = parseImageArgs(process.argv.slice(2))
  if ("error" in args) {
    console.error(args.error)
    process.exit(2)
  }

  let tag: string
  let app: Image
  if (args.mode === "build") {
    app = args.app
    try {
      tag = await buildImage(app)
    } catch (error) {
      console.error(`image: could not build the ${app} image: ${(error as Error).message}`)
      process.exit(2)
    }
  } else {
    tag = args.tag
    app = args.app
  }

  let reportText: string
  try {
    reportText = await scanImage(tag)
  } catch (error) {
    console.error(`image: could not run trivy: ${(error as Error).message}`)
    process.exit(2)
  }

  let raw: unknown
  try {
    raw = JSON.parse(reportText)
  } catch {
    // Never interpolate JSON.parse's own message: it can quote a raw token straight out of the
    // report.
    console.error("image: trivy report is not valid JSON")
    process.exit(2)
  }

  let findings: Finding[]
  try {
    findings = normaliseTrivy(raw, app)
  } catch (error) {
    console.error(`image: ${(error as Error).message}`)
    process.exit(2)
  }

  process.exit(
    finish({
      label: "image",
      findings,
      run: { scanner: "image", image: app },
      resultsPath: join(RESULTS_DIR, `image-${app}.json`),
    })
  )
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`image: ${(error as Error).message}`)
    process.exit(2)
  })
}
