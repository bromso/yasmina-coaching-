/**
 * `fixtures/trivy.json` is built from real `trivy image --format json --ignore-unfixed --severity
 * HIGH,CRITICAL <image>` output (captured 2026-10-17 with `aquasec/trivy:0.76.0` against
 * `alpine:3.9`, an old, no-longer-supported tag chosen for its known fixable HIGH CVEs in
 * `libcrypto1.1`/`libssl1.1`): the real scan reported four distinct vulnerabilities
 * (CVE-2021-23840 and CVE-2021-3450, each against both `libcrypto1.1` and `libssl1.1`). The
 * fixture is NOT a byte-for-byte copy of that output:
 * - each entry keeps only 8 fields (`VulnerabilityID`, `PkgName`, `InstalledVersion`,
 *   `FixedVersion`, `Status`, `Severity`, `PrimaryURL`, `Title`) — real Trivy output also carries
 *   `PkgID`, `PkgIdentifier`, `Layer`, `DataSource`, `Description`, `CVSS`, `References`,
 *   `VendorSeverity`, `CweIDs` and more, all dropped since `normaliseTrivy` never reads them;
 * - of the scan's four real entries, only three are kept (`CVE-2021-3450`/`libssl1.1` was
 *   dropped entirely);
 * - the `CVE-2021-23840`/`libcrypto1.1` entry is duplicated verbatim (Trivy's own report can
 *   repeat an entry per layer) to exercise de-duping;
 * - the `CVE-2021-3450`/`libcrypto1.1` entry (real in content otherwise) has its real
 *   `FixedVersion` field (`1.1.1k-r0`) removed, to exercise the documented "FixedVersion may be
 *   empty" case.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  aptRefreshDate,
  dockerBuildArgs,
  IMAGE_BUILD_CONFIG,
  normaliseTrivy,
  parseImageArgs,
  TRIVY_IMAGE,
  trivyRunArgs,
} from "./image"

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "trivy.json"), "utf8")
)

describe("normaliseTrivy", () => {
  test("maps a vulnerability to a Finding tagged with the scanned image", () => {
    const findings = normaliseTrivy(fixture, "api")
    const entry = findings.find((f) => f.id === "CVE-2021-23840" && f.package === "libssl1.1")
    expect(entry).toEqual({
      scanner: "image",
      id: "CVE-2021-23840",
      severity: "high",
      package: "libssl1.1",
      image: "api",
      installed: "1.1.1g-r0",
      fixed: "1.1.1j-r0",
      url: "https://avd.aquasec.com/nvd/cve-2021-23840",
      title: "openssl: integer overflow in CipherUpdate",
    })
  })

  test("de-dupes a vulnerability repeated in the raw report, keyed by id + package + installed version", () => {
    const findings = normaliseTrivy(fixture, "api").filter(
      (f) => f.id === "CVE-2021-23840" && f.package === "libcrypto1.1"
    )
    expect(findings).toHaveLength(1)
  })

  test("the same VulnerabilityID against a different PkgName is a distinct finding, not de-duped", () => {
    const findings = normaliseTrivy(fixture, "api").filter((f) => f.id === "CVE-2021-23840")
    expect(findings.map((f) => f.package).sort()).toEqual(["libcrypto1.1", "libssl1.1"])
  })

  test("a vulnerability with no FixedVersion keeps fixed undefined rather than throwing", () => {
    const entry = normaliseTrivy(fixture, "api").find(
      (f) => f.id === "CVE-2021-3450" && f.package === "libcrypto1.1"
    )
    expect(entry?.fixed).toBeUndefined()
    expect(entry?.installed).toBe("1.1.1g-r0")
  })

  test("the whole fixture normalises to exactly three findings (four raw entries, one duplicate)", () => {
    expect(normaliseTrivy(fixture, "api")).toHaveLength(3)
  })

  test("tags every finding with the image it was given, regardless of what the report says", () => {
    expect(normaliseTrivy(fixture, "ai").every((f) => f.image === "ai")).toBe(true)
  })

  test("Severity is lowercased", () => {
    expect(normaliseTrivy(fixture, "api").every((f) => f.severity === "high")).toBe(true)
  })

  test("a report with no Results is an empty, not a thrown, result", () => {
    expect(normaliseTrivy({ SchemaVersion: 2, ArtifactName: "alpine:3.9" }, "api")).toEqual([])
  })

  test("a result with no Vulnerabilities key is skipped, not a thrown error", () => {
    expect(
      normaliseTrivy(
        { SchemaVersion: 2, ArtifactName: "alpine:3.9", Results: [{ Target: "x" }] },
        "api"
      )
    ).toEqual([])
  })

  test("rejects a non-object payload", () => {
    expect(() => normaliseTrivy([], "api")).toThrow("expected a JSON object")
    expect(() => normaliseTrivy(null, "api")).toThrow("expected a JSON object")
  })

  test("rejects a report with no SchemaVersion at all — {} is not a clean scan", () => {
    expect(() => normaliseTrivy({}, "api")).toThrow("no SchemaVersion 2")
  })

  test("rejects a report with the wrong SchemaVersion", () => {
    expect(() => normaliseTrivy({ SchemaVersion: 1, ArtifactName: "alpine:3.9" }, "api")).toThrow(
      "no SchemaVersion 2"
    )
  })

  test("rejects a report with no ArtifactName", () => {
    expect(() => normaliseTrivy({ SchemaVersion: 2 }, "api")).toThrow("no ArtifactName")
  })

  test("rejects Results that is not an array", () => {
    expect(() =>
      normaliseTrivy({ SchemaVersion: 2, ArtifactName: "x", Results: "nope" }, "api")
    ).toThrow("Results is not an array")
  })

  test("rejects Vulnerabilities that is not an array", () => {
    expect(() =>
      normaliseTrivy(
        { SchemaVersion: 2, ArtifactName: "x", Results: [{ Vulnerabilities: "nope" }] },
        "api"
      )
    ).toThrow("Vulnerabilities is not an array")
  })

  test("rejects a vulnerability missing PkgName", () => {
    expect(() =>
      normaliseTrivy(
        {
          SchemaVersion: 2,
          ArtifactName: "x",
          Results: [
            {
              Vulnerabilities: [
                { VulnerabilityID: "CVE-x", InstalledVersion: "1", Severity: "HIGH" },
              ],
            },
          ],
        },
        "api"
      )
    ).toThrow("has no PkgName")
  })

  test("rejects a vulnerability with an unknown severity", () => {
    expect(() =>
      normaliseTrivy(
        {
          SchemaVersion: 2,
          ArtifactName: "x",
          Results: [
            {
              Vulnerabilities: [
                { VulnerabilityID: "CVE-x", PkgName: "p", InstalledVersion: "1", Severity: "NOPE" },
              ],
            },
          ],
        },
        "api"
      )
    ).toThrow('unknown severity "NOPE"')
  })
})

describe("IMAGE_BUILD_CONFIG", () => {
  test("matches ci.yml's DOCKER_MATRIX exactly", () => {
    expect(IMAGE_BUILD_CONFIG).toEqual({
      app: { dockerfile: "next", port: 3001 },
      api: { dockerfile: "bun-service", port: 3007 },
      ai: { dockerfile: "bun-service", port: 3008 },
    })
  })
})

describe("parseImageArgs", () => {
  test("--image <tag> --app <app> scans that tag", () => {
    expect(parseImageArgs(["--image", "my-tag:1", "--app", "api"])).toEqual({
      mode: "scan",
      tag: "my-tag:1",
      app: "api",
    })
  })

  test("--build <app> builds and scans that app", () => {
    expect(parseImageArgs(["--build", "api"])).toEqual({ mode: "build", app: "api" })
  })

  test("--build cannot be combined with --image or --app", () => {
    expect(parseImageArgs(["--build", "api", "--image", "x"])).toEqual({
      error: "image: --build cannot be combined with --image or --app",
    })
  })

  test("an unknown --build app is rejected", () => {
    expect(parseImageArgs(["--build", "nope"])).toEqual({
      error: 'image: --build must be one of app, api, ai, got "nope"',
    })
  })

  test("an unknown --app is rejected", () => {
    expect(parseImageArgs(["--image", "x", "--app", "nope"])).toEqual({
      error: 'image: --app must be one of app, api, ai, got "nope"',
    })
  })

  test("--image without --app is rejected", () => {
    expect(parseImageArgs(["--image", "x"])).toEqual({
      error: "image: --app <app|api|ai> is required",
    })
  })

  test("neither --image nor --build is rejected", () => {
    expect(parseImageArgs(["--app", "api"])).toEqual({
      error: "image: --image <tag> or --build <app> is required",
    })
  })

  test("an unknown flag is rejected", () => {
    expect(parseImageArgs(["--nope"])).toEqual({ error: 'image: unknown argument "--nope"' })
  })
})

// The decide/print/write/exit tail — including `exitCodeFor` — is shared by all three scanners
// as `report.ts`'s `finish()`, and is tested once there (report.test.ts), not per scanner.

describe("aptRefreshDate", () => {
  test("is the run's UTC date, so the apt-get upgrade layer refreshes at least daily", () => {
    expect(aptRefreshDate(new Date(Date.UTC(2026, 9, 17, 23, 59)))).toBe("2026-10-17")
    expect(aptRefreshDate(new Date(Date.UTC(2026, 0, 2, 0, 0)))).toBe("2026-01-02")
  })
})

describe("dockerBuildArgs", () => {
  test("builds exactly as CI does, passing APT_REFRESH to bust the apt layer's cache", () => {
    expect(dockerBuildArgs("api", new Date(Date.UTC(2026, 9, 17)))).toEqual([
      "docker",
      "build",
      "-f",
      "docker/bun-service.Dockerfile",
      "--build-arg",
      "APP=api",
      "--build-arg",
      "PORT=3007",
      "--build-arg",
      "APT_REFRESH=2026-10-17",
      "-t",
      "boilerplate-bun-scan-api",
      ".",
    ])
  })
})

describe("trivyRunArgs", () => {
  const args = trivyRunArgs("boilerplate-bun-scan-app", "/cache", "/out")

  test("keeps per-image scan caches in memory, persisting only the DB cache directory", () => {
    const i = args.indexOf("--cache-backend")
    expect(i).toBeGreaterThan(-1)
    expect(args[i + 1]).toBe("memory")
    expect(args).toContain("/cache:/root/.cache/trivy")
  })

  test("pins the image, scans vulnerabilities only, and ends with -- <tag>", () => {
    expect(args).toContain(TRIVY_IMAGE)
    expect(args.slice(-2)).toEqual(["--", "boilerplate-bun-scan-app"])
    expect(args.join(" ")).toContain("--scanners vuln --ignore-unfixed --severity HIGH,CRITICAL")
  })
})
