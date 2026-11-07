import { expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// .github lists every workspace by hand, and nothing else notices one left out.
const ROOT = join(import.meta.dir, "..")
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")
const workspaces = (dir: string) =>
  readdirSync(join(ROOT, dir)).filter((name) => existsSync(join(ROOT, dir, name, "package.json")))

test("CODEOWNERS names every workspace", () => {
  const owned = new Set(
    read(".github/CODEOWNERS")
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .map((line) => line.split(/\s+/)[0])
  )
  for (const dir of ["apps", "packages"]) {
    for (const name of workspaces(dir)) expect(owned).toContain(`/${dir}/${name}/`)
  }
})

type Template = { labels?: string[]; body: { id?: string; attributes: { options?: string[] } }[] }
const area = (file: string) =>
  (Bun.YAML.parse(read(`.github/ISSUE_TEMPLATE/${file}`)) as Template).body.find(
    (field) => field.id === "area"
  )?.attributes.options ?? []

test("the bug and feature templates offer every app as an area", () => {
  for (const file of ["bug_report.yml", "feature_request.yml"]) {
    const options = area(file)
    for (const app of workspaces("apps")) {
      expect(options.some((option) => option.startsWith(`apps/${app} `))).toBe(true)
    }
    expect(options.some((option) => option.startsWith("packages/"))).toBe(true)
  }
})

/** A GitHub Actions `${{ … }}` expression, written without tripping noTemplateCurlyInString. */
const gha = (body: string) => `\${{ ${body} }}`

type Step = {
  id?: string
  run?: string
  uses?: string
  if?: string
  with?: Record<string, unknown>
}
type Job = {
  needs?: string[] | string
  if?: string
  steps?: Step[]
  uses?: string
  with?: Record<string, unknown>
  permissions?: Record<string, string>
  strategy?: { matrix?: Record<string, unknown> }
}
type Workflow = {
  on?: Record<string, unknown>
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

test("the final ci job waits for every gated job and decides through scripts/ci-gate.ts", async () => {
  const { GATED_JOBS } = await import("./ci-gate")
  const ci = (Bun.YAML.parse(read(".github/workflows/ci.yml")) as Workflow).jobs.ci
  expect(ci?.if).toBe("always()")
  expect([...(ci?.needs ?? [])].sort()).toEqual(["changes", ...GATED_JOBS].sort())
  expect(ci?.steps?.some((step) => step.run === "bun scripts/ci-gate.ts")).toBe(true)
  // A step-level `if:` would be ANDed with an implicit success() and skip on a failed dependency.
  expect(ci?.steps?.every((step) => !("if" in step))).toBe(true)
})

test("the verify job always typechecks scripts and perf", () => {
  const workflow = Bun.YAML.parse(read(".github/workflows/ci.yml")) as Workflow
  const steps = workflow.jobs.verify?.steps ?? []
  const step = steps.find((step) => step.run === "bun run typecheck:scripts")
  expect(step).toBeDefined()
  // Cheap and never affected by the plan: it runs on every `verify` run, unconditionally.
  expect(step?.if).toBeUndefined()
})

test("the security job runs on every PR and push, docs-only changes included", () => {
  const workflow = Bun.YAML.parse(read(".github/workflows/ci.yml")) as Workflow
  const security = workflow.jobs.security
  expect(security).toBeDefined()
  // No `if:` at all — unlike verify/storybook/e2e/docker/api-postgres, which are each gated on
  // the plan's outputs, this job always runs.
  expect(security?.if).toBeUndefined()
  expect(security?.needs).toBe("changes")
  expect(security?.steps?.some((step) => step.run?.includes("scripts/security/secrets.ts"))).toBe(
    true
  )
  // The audit step is the one part of this job the plan can still skip.
  const auditStep = security?.steps?.find((step) => step.run?.includes("scripts/security/audit.ts"))
  // `!cancelled()` so a failing secrets scan earlier in the job does not skip the audit too.
  expect(auditStep?.if).toBe(gha("!cancelled() && needs.changes.outputs.audit == 'true'"))
})

test("security.yml runs weekly and on demand, read-only, serialised", () => {
  const workflow = Bun.YAML.parse(read(".github/workflows/security.yml")) as Workflow & {
    concurrency?: { group?: string; "cancel-in-progress"?: boolean }
  }
  const schedule = workflow.on?.schedule as { cron: string }[] | undefined
  expect(schedule?.[0]?.cron).toBe("0 6 * * 1")
  expect(workflow.on).toHaveProperty("workflow_dispatch")
  expect(workflow.permissions?.contents).toBe("read")
  expect(workflow.concurrency?.group).toBeTruthy()
})

// The build/restore-cache/scan/own-cache/check-freshness/save-cache/upload steps shared by
// ci.yml's `docker` job and security.yml's `image` job live in one reusable workflow
// (`workflow_call`), so a fix to one copy can never miss the other the way two inline copies
// could drift. Both callers are job-level `uses:` calls, never inline steps.

test("image-scan.yml is a reusable workflow taking dockerfile/app/port and is read-only", () => {
  const workflow = Bun.YAML.parse(read(".github/workflows/image-scan.yml")) as Workflow & {
    on?: { workflow_call?: { inputs?: Record<string, { required?: boolean; type?: string }> } }
  }
  const inputs = workflow.on?.workflow_call?.inputs ?? {}
  expect(inputs.dockerfile).toEqual({ required: true, type: "string" })
  expect(inputs.app).toEqual({ required: true, type: "string" })
  expect(inputs.port).toEqual({ required: true, type: "number" })
  // Permissions flow down from the caller and can only be narrowed, never widened, so this job's
  // own declaration is redundant with (not a substitute for) ci.yml's and security.yml's top-level
  // `permissions: contents: read` — it documents and enforces the same read-only scope here too.
  expect(workflow.jobs["image-scan"]?.permissions?.contents).toBe("read")
})

test("image-scan.yml builds each image with load:true, then scans it with Trivy", () => {
  const workflow = Bun.YAML.parse(read(".github/workflows/image-scan.yml")) as Workflow
  const steps = workflow.jobs["image-scan"]?.steps ?? []
  const buildIndex = steps.findIndex((step) => step.uses?.startsWith("docker/build-push-action"))
  expect(buildIndex).toBeGreaterThanOrEqual(0)
  expect(steps[buildIndex]?.with?.load).toBe(true)
  const scanIndex = steps.findIndex((step) => step.id === "scan")
  expect(scanIndex).toBeGreaterThan(buildIndex)
  expect(steps[scanIndex]?.run).toContain("scripts/security/image.ts")
})

test("ci.yml's docker job and security.yml's image job both call image-scan.yml, each keeping its own matrix", () => {
  const ci = Bun.YAML.parse(read(".github/workflows/ci.yml")) as Workflow
  const weekly = Bun.YAML.parse(read(".github/workflows/security.yml")) as Workflow
  const docker = ci.jobs.docker
  const image = weekly.jobs.image
  // The job id in ci.yml must stay "docker" — scripts/ci-gate.ts and branch protection read
  // `needs.docker.result`, which GitHub reports for the calling job regardless of what it calls.
  expect(docker).toBeDefined()
  expect(image).toBeDefined()
  const workflowPath = "./.github/workflows/image-scan.yml"
  expect(docker?.uses).toBe(workflowPath)
  expect(image?.uses).toBe(workflowPath)
  // Neither caller has its own steps any more: everything shared moved into image-scan.yml.
  expect(docker?.steps).toBeUndefined()
  expect(image?.steps).toBeUndefined()
  // Each caller hands the reusable workflow the same three inputs, read from its own matrix.
  const expectedWith = {
    dockerfile: gha("matrix.dockerfile"),
    app: gha("matrix.app"),
    port: gha("matrix.port"),
  }
  expect(docker?.with).toEqual(expectedWith)
  expect(image?.with).toEqual(expectedWith)
  // ci.yml's matrix is still the plan's narrowed rows; security.yml's is still its own static three.
  expect(docker?.strategy?.matrix).toEqual({
    include: gha("fromJSON(needs.changes.outputs.docker)"),
  })
  expect(image?.strategy?.matrix).toEqual({
    include: [
      { dockerfile: "next", app: "app", port: 3001 },
      { dockerfile: "bun-service", app: "api", port: 3007 },
      { dockerfile: "bun-service", app: "ai", port: 3008 },
    ],
  })
})

test("every image build passes APT_REFRESH so the apt-get upgrade layer cannot stay cached", () => {
  for (const file of ["image-scan.yml", "docker-build.yml.disabled"]) {
    const workflow = Bun.YAML.parse(read(`.github/workflows/${file}`)) as Workflow
    const builds = Object.values(workflow.jobs).flatMap((job) =>
      (job.steps ?? []).filter((step) => step.uses?.startsWith("docker/build-push-action"))
    )
    expect(builds.length).toBeGreaterThan(0)
    for (const build of builds) {
      expect(String(build.with?.["build-args"])).toContain(
        `APT_REFRESH=${gha("steps.date.outputs.date")}`
      )
    }
  }
  for (const dockerfile of ["next", "bun-service"]) {
    const text = read(`docker/${dockerfile}.Dockerfile`)
    const arg = text.indexOf("ARG APT_REFRESH")
    expect(arg).toBeGreaterThan(text.indexOf("AS runner"))
    expect(text.indexOf("apt-get upgrade")).toBeGreaterThan(arg)
  }
})

test("the Trivy DB cache is restored before the scan, owned, checked fresh, then saved only when the scan ran", () => {
  const steps = (Bun.YAML.parse(read(".github/workflows/image-scan.yml")) as Workflow).jobs[
    "image-scan"
  ]?.steps
  const index = (match: (step: Step) => boolean) => steps?.findIndex(match) ?? -1
  const restore = index((step) => step.uses?.startsWith("actions/cache/restore") === true)
  const scan = index((step) => step.id === "scan")
  const chown = index((step) => step.run?.includes("chown") === true)
  const fresh = index((step) => step.id === "trivy-fresh")
  const save = index((step) => step.uses?.startsWith("actions/cache/save") === true)
  expect(restore).toBeGreaterThanOrEqual(0)
  expect(scan).toBeGreaterThan(restore)
  expect(chown).toBeGreaterThan(scan)
  expect(fresh).toBeGreaterThan(chown)
  expect(save).toBeGreaterThan(fresh)
  expect(steps?.[chown]?.if).toBe(gha("!cancelled()"))
  expect(steps?.[fresh]?.if).toBe(gha("!cancelled()"))
  // The save step must never run just because the job wasn't cancelled: it also needs the scan
  // step to have actually run (not skipped by an earlier failure) and the DB directory to show a
  // database freshly touched by this run, on top of the pre-existing exact-key-miss check.
  const saveIf = steps?.[save]?.if ?? ""
  expect(saveIf).toContain("!cancelled()")
  expect(saveIf).toContain("steps.scan.outcome == 'success'")
  expect(saveIf).toContain("steps.scan.outcome == 'failure'")
  expect(saveIf).toContain("steps.trivy-fresh.outputs.fresh == 'true'")
  expect(saveIf).toContain("steps.trivy-cache.outputs.cache-hit != 'true'")
  expect(steps?.[save]?.with?.key).toBe(steps?.[restore]?.with?.key)
  expect(steps?.some((step) => step.uses?.startsWith("actions/cache@") === true)).toBe(false)
})
