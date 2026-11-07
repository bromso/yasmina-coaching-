/**
 * Decides which CI work a change needs, so a pull request runs only what it can affect.
 *
 * Changed files map to workspaces, and every workspace that depends on them (through
 * `workspace:*` in its package.json) is affected too. The typecheck and test sets come from the
 * root package.json scripts, so they stay defined in one place. Run by the `changes` job in
 * .github/workflows/ci.yml through scripts/ci-plan-run.ts; `bun test scripts` covers the rules.
 */

export type Workspace = {
  name: string
  dir: string
  deps: string[]
  scripts: string[]
}

export type DockerRow = { dockerfile: string; app: string; port: number }

export type Context = {
  workspaces: Workspace[]
  /** Workspaces the root `typecheck` script gates. */
  typecheckGate: string[]
  /** Workspaces the root `test:services` script gates. */
  testGate: string[]
  /** Every image the docker job can build. */
  dockerRows: DockerRow[]
}

export type Plan = {
  /** Only documentation changed: every job can be skipped. */
  docsOnly: boolean
  /** A root-level file changed (lockfile, configs, CI itself): run everything. */
  all: boolean
  affected: string[]
  typecheck: string[]
  uiTypecheck: boolean
  tests: string[]
  build: string[]
  storybook: boolean
  /** Run apps/api's tests against a real Postgres too. */
  postgres: boolean
  docker: DockerRow[]
  /** Run the Playwright journeys (apps/e2e). */
  e2e: boolean
  /** Run the dependency audit scanner (`bun scripts/security/audit.ts`). */
  audit: boolean
}

// CI never builds or runs these; Biome still lints the ones it covers (JSON, for example).
const LINT_ONLY = [
  /^\.claude\//,
  /^\.agents\//,
  /^\.changeset\//,
  /^\.devcontainer\//,
  /^\.vscode\//,
  /^docker-compose[^/]*\.ya?ml$/,
  /^\.github\/workflows\/[^/]+\.disabled$/,
  // Repo configuration no build, test or image reads: issue templates, ownership, update bots,
  // Git hooks and commit tooling, editor and assistant settings.
  /^\.github\/(ISSUE_TEMPLATE\/|CODEOWNERS$|dependabot\.ya?ml$)/,
  /^\.husky\//,
  /^(commitlint|lint-staged)\.config\.[cm]?js$/,
  /^(cspell\.json|\.editorconfig|\.czrc|\.claudeignore|\.mcp\.json|\.env\.example)$/,
  /^(LLMS\.txt|skills-lock\.json|workspace\.code-workspace)$/,
]

// Markdown is documentation unless it sits in source: apps/ai imports prompts/system.md as text.
const isDocs = (file: string) => file.endsWith(".md") && !/(^|\/)src\//.test(file)

// The apps and services the Playwright journeys drive, directly or through a shared package.
const E2E_TARGETS = [
  "@repo/api",
  "@repo/ai",
  "@repo/www",
  "@repo/app",
  "@repo/auth",
  "@repo/account",
  "@repo/blog",
  "@repo/docs",
  "@repo/help",
  "@repo/jobs",
  "@repo/e2e",
  "@repo/load",
]

export function plan(files: string[], ctx: Context): Plan {
  const byDir = new Map(ctx.workspaces.map((w) => [w.dir, w]))
  const changed = new Set<string>()
  const dockerfiles = new Set<string>()
  let all = files.length === 0
  let docsOnly = files.length > 0
  let allDocker = false
  // bun.lock is a root file (sets `all` below), but a single workspace's own package.json change
  // does not — the audit scanner reads the whole lockfile regardless, so any package.json must
  // turn it on too, not just a root-level one.
  let dependenciesChanged = false

  for (const file of files) {
    if (isDocs(file)) continue
    docsOnly = false
    if (file === "bun.lock" || file === "package.json" || file.endsWith("/package.json")) {
      dependenciesChanged = true
    }
    if (LINT_ONLY.some((pattern) => pattern.test(file))) continue

    const dockerfile = file.match(/^docker\/([^/]+)\.Dockerfile$/)?.[1]
    if (dockerfile) {
      dockerfiles.add(dockerfile)
      continue
    }
    if (file.startsWith("docker/") || file === ".dockerignore") {
      allDocker = true
      continue
    }

    const workspace = byDir.get(file.split("/").slice(0, 2).join("/"))
    if (workspace) changed.add(workspace.name)
    else all = true
  }

  const names = ctx.workspaces.map((w) => w.name)
  const affected = all ? new Set(names) : dependents(changed, ctx.workspaces)
  const has = (name: string) => affected.has(name)
  const withScript = (script: string) =>
    ctx.workspaces.filter((w) => w.scripts.includes(script)).map((w) => w.name)

  // A workspace's build can need its dependencies built first (Storybook reads tokens' dist/).
  const buildable = new Set(withScript("build"))
  const build = [...withDependencies(affected, ctx.workspaces)].filter((n) => buildable.has(n))

  const dirOf = new Map(ctx.workspaces.map((w) => [w.dir, w.name]))
  const docker = ctx.dockerRows.filter(
    (row) =>
      all || allDocker || dockerfiles.has(row.dockerfile) || has(dirOf.get(`apps/${row.app}`) ?? "")
  )

  return {
    docsOnly,
    all,
    affected: names.filter(has),
    typecheck: ctx.typecheckGate.filter(has),
    uiTypecheck: has("@repo/ui"),
    tests: ctx.testGate.filter(has),
    build: names.filter((n) => build.includes(n)),
    storybook: has("@repo/story"),
    postgres: !docsOnly && has("@repo/api"),
    docker: docsOnly ? [] : docker,
    e2e: !docsOnly && E2E_TARGETS.some(has),
    audit: !docsOnly && (all || dependenciesChanged),
  }
}

/** The changed workspaces plus everything that depends on them, directly or not. */
function dependents(changed: Set<string>, workspaces: Workspace[]): Set<string> {
  const result = new Set(changed)
  let grew = true
  while (grew) {
    grew = false
    for (const w of workspaces) {
      if (!result.has(w.name) && w.deps.some((d) => result.has(d))) {
        result.add(w.name)
        grew = true
      }
    }
  }
  return result
}

/** The given workspaces plus everything they depend on, directly or not. */
function withDependencies(start: Set<string>, workspaces: Workspace[]): Set<string> {
  const byName = new Map(workspaces.map((w) => [w.name, w]))
  const result = new Set<string>()
  const visit = (name: string) => {
    if (result.has(name)) return
    result.add(name)
    for (const dep of byName.get(name)?.deps ?? []) visit(dep)
  }
  for (const name of start) visit(name)
  return result
}

/** `--filter @repo/a --filter @repo/b` → ["@repo/a", "@repo/b"] */
export const filtersIn = (script: string) =>
  [...script.matchAll(/--filter\s+'?([^\s']+)'?/g)].map((m) => m[1] as string)

export async function loadContext(): Promise<Context> {
  const root = await Bun.file("package.json").json()
  const workspaces: Workspace[] = []
  for (const pattern of root.workspaces as string[]) {
    for await (const manifest of new Bun.Glob(`${pattern}/package.json`).scan(".")) {
      const pkg = await Bun.file(manifest).json()
      const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
      workspaces.push({
        name: pkg.name,
        dir: manifest.slice(0, -"/package.json".length),
        deps: Object.keys(deps).filter((d) => String(deps[d]).startsWith("workspace:")),
        scripts: Object.keys(pkg.scripts ?? {}),
      })
    }
  }
  workspaces.sort((a, b) => a.dir.localeCompare(b.dir))
  return {
    workspaces,
    typecheckGate: filtersIn(root.scripts.typecheck),
    testGate: filtersIn(root.scripts["test:services"]),
    dockerRows: JSON.parse(Bun.env.DOCKER_MATRIX ?? "[]"),
  }
}
