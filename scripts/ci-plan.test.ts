import { beforeAll, describe, expect, test } from "bun:test"
import { SITES } from "../packages/sites/src/index"
import { type Context, filtersIn, loadContext, plan } from "./ci-plan"

const dockerRows = [
  { dockerfile: "next", app: "app", port: 3001 },
  { dockerfile: "bun-service", app: "api", port: 3007 },
  { dockerfile: "bun-service", app: "ai", port: 3008 },
]
// The Next apps are exactly the sites registry: removing an app from SITES updates every list here.
const SITE_IDS: string[] = Object.keys(SITES)
const NEXT_APPS = [...SITE_IDS].sort().map((a) => `@repo/${a}`)
/** Every Next app plus other `apps/*` workspaces, in workspace dir order (alphabetical). */
const inApps = (...extra: string[]) => [...SITE_IDS, ...extra].sort().map((a) => `@repo/${a}`)

// The real workspace graph, so these tests also catch a manifest that stops declaring a dependency.
let ctx: Context
beforeAll(async () => {
  ctx = { ...(await loadContext()), dockerRows }
})

describe("docs", () => {
  test("a README-only change skips everything", () => {
    const p = plan(["README.md", "CLAUDE.md", "docs/plans/x.md", "apps/www/README.md"], ctx)
    expect(p).toMatchObject({
      docsOnly: true,
      affected: [],
      build: [],
      docker: [],
      postgres: false,
      e2e: false,
    })
  })

  test("Markdown inside src is code: apps/ai imports its system prompt", () => {
    const p = plan(["apps/ai/src/prompts/system.md"], ctx)
    expect(p.docsOnly).toBe(false)
    expect(p.tests).toEqual(["@repo/ai"])
  })

  test("MDX is code: Storybook builds it", () => {
    const p = plan(["apps/story/stories/Intro.mdx"], ctx)
    expect(p).toMatchObject({ docsOnly: false, storybook: true })
  })
})

describe("workspaces", () => {
  test("an api change checks api alone and builds its image", () => {
    const p = plan(["apps/api/src/env.ts"], ctx)
    expect(p.affected).toEqual(["@repo/api"])
    expect(p.typecheck).toEqual(["@repo/api"])
    expect(p.tests).toEqual(["@repo/api"])
    expect(p.build).toEqual(["@repo/api"])
    expect(p.uiTypecheck).toBe(false)
    expect(p.storybook).toBe(false)
    expect(p.docker.map((r) => r.app)).toEqual(["api"])
    expect(p.postgres).toBe(true)
  })

  test("a contract change reaches the service that implements it", () => {
    const p = plan(["packages/ai-contract/src/index.ts"], ctx)
    expect(p.affected).toEqual([
      "@repo/account",
      "@repo/ai",
      "@repo/app",
      "@repo/auth",
      "@repo/help",
      "@repo/jobs",
      "@repo/load",
      "@repo/www",
      "@repo/ai-contract",
      "@repo/session",
    ])
    expect(p.tests).toEqual([
      "@repo/ai",
      "@repo/app",
      "@repo/session",
      "@repo/auth",
      "@repo/account",
      "@repo/www",
      "@repo/help",
      "@repo/jobs",
      "@repo/load",
    ])
    expect(p.docker.map((r) => r.app)).toEqual(["app", "ai"])
  })

  // @repo/help and @repo/jobs both depend on @repo/session too (their anonymous forms forward a
  // client id without letting the limiter key switch to a session one — see CLAUDE.md's
  // Controller ruling).
  test("a session change reaches the apps that sign users in, www's waitlist, help's contact form and jobs' apply form", () => {
    const p = plan(["packages/session/src/index.ts"], ctx)
    expect(p.affected).toEqual([
      "@repo/account",
      "@repo/app",
      "@repo/auth",
      "@repo/help",
      "@repo/jobs",
      "@repo/www",
      "@repo/session",
    ])
    expect(p.typecheck).toEqual([
      "@repo/app",
      "@repo/www",
      "@repo/help",
      "@repo/jobs",
      "@repo/session",
      "@repo/auth",
      "@repo/account",
    ])
    expect(p.tests).toEqual([
      "@repo/app",
      "@repo/session",
      "@repo/auth",
      "@repo/account",
      "@repo/www",
      "@repo/help",
      "@repo/jobs",
    ])
  })

  test("a sites change reaches session, every Next app, the api, and BRAND_NAME's readers", () => {
    const p = plan(["packages/sites/src/index.ts"], ctx)
    // @repo/ui, @repo/email and @repo/story depend on @repo/sites for BRAND_NAME.
    expect(p.affected).toEqual([
      ...inApps("api", "story"),
      "@repo/email",
      "@repo/session",
      "@repo/sites",
      "@repo/ui",
    ])
    // These two mirror the root `typecheck` / `test:services` filter lists, so they change with
    // package.json, not with SITES.
    expect(p.typecheck).toEqual([
      "@repo/app",
      "@repo/www",
      "@repo/blog",
      "@repo/docs",
      "@repo/help",
      "@repo/jobs",
      "@repo/api",
      "@repo/sites",
      "@repo/email",
      "@repo/session",
      "@repo/auth",
      "@repo/account",
      "@repo/story",
    ])
    expect(p.tests).toEqual([
      "@repo/api",
      "@repo/app",
      "@repo/ui",
      "@repo/sites",
      "@repo/email",
      "@repo/session",
      "@repo/auth",
      "@repo/account",
      "@repo/www",
      "@repo/blog",
      "@repo/docs",
      "@repo/help",
      "@repo/jobs",
    ])
    expect(p.uiTypecheck).toBe(true)
    expect(p.storybook).toBe(true)
    // @repo/story's build needs @repo/tokens built first (Storybook reads its dist/); build
    // order follows workspace dir order, not an alphabetical sort, once packages mix with apps.
    expect(p.build).toEqual([...inApps("api", "story"), "@repo/tokens"])
  })

  test("an email change reaches the api and the story app", () => {
    const p = plan(["packages/email/src/index.tsx"], ctx)
    expect(p.affected).toEqual(["@repo/api", "@repo/story", "@repo/email"])
    expect(p.typecheck).toEqual(["@repo/api", "@repo/email", "@repo/story"])
    expect(p.tests).toEqual(["@repo/api", "@repo/email"])
  })

  test("a packages/ui change reaches every Next app and Storybook, not the services", () => {
    const p = plan(["packages/ui/src/components/button.tsx"], ctx)
    expect(p.affected).toEqual(expect.arrayContaining([...NEXT_APPS, "@repo/story", "@repo/ui"]))
    expect(p.affected).not.toContain("@repo/api")
    expect(p.uiTypecheck).toBe(true)
    expect(p.storybook).toBe(true)
    expect(p.tests).toEqual([
      "@repo/app",
      "@repo/ui",
      "@repo/auth",
      "@repo/account",
      "@repo/www",
      "@repo/blog",
      "@repo/docs",
      "@repo/help",
      "@repo/jobs",
    ])
    expect(p.docker.map((r) => r.app)).toEqual(["app"])
    expect(p.postgres).toBe(false)
  })

  test("a vendored packages/ui change typechecks the story app, which checks its declarations", () => {
    // apps/story's typecheck fails when types/vendored is stale; that only catches drift on the
    // PR that causes it if a vendored edit keeps @repo/story in the typecheck set.
    for (const file of [
      "packages/ui/src/components/BlobCursor.tsx",
      "packages/ui/src/components/magicui/marquee.tsx",
    ]) {
      expect(plan([file], ctx).typecheck).toContain("@repo/story")
    }
  })

  test("a build also builds what it depends on: Storybook needs tokens' dist/", () => {
    const p = plan(["apps/story/stories/Button.stories.tsx"], ctx)
    expect(p.build).toEqual(["@repo/story", "@repo/tokens"])
  })

  test("a Storybook config change typechecks and builds only the story app", () => {
    const p = plan(["apps/story/.storybook/main.ts"], ctx)
    expect(p.typecheck).toEqual(["@repo/story"])
    expect(p.build).toEqual(["@repo/story", "@repo/tokens"])
    expect(p.docker).toEqual([])
  })

  test("Markdown next to code does not hide the code", () => {
    const p = plan(["README.md", "apps/api/src/env.ts"], ctx)
    expect(p.docsOnly).toBe(false)
    expect(p.affected).toEqual(["@repo/api"])
  })

  test("a service-kit change reaches both services and their images", () => {
    const p = plan(["packages/service-kit/src/guard.ts"], ctx)
    expect(p.affected).toEqual(["@repo/ai", "@repo/api", "@repo/service-kit"])
    expect(p.tests).toEqual(["@repo/api", "@repo/ai", "@repo/service-kit"])
    expect(p.docker.map((r) => r.app).sort()).toEqual(["ai", "api"])
    expect(p.postgres).toBe(true)
  })
})

describe("e2e", () => {
  test("an app the suite exercises turns it on", () => {
    expect(plan(["apps/app/src/views/notes-view.tsx"], ctx).e2e).toBe(true)
    expect(plan(["apps/api/src/router.ts"], ctx).e2e).toBe(true)
    expect(plan(["apps/e2e/tests/auth.spec.ts"], ctx).e2e).toBe(true)
    expect(plan(["apps/blog/src/lib/blog.ts"], ctx).e2e).toBe(true)
    expect(plan(["apps/docs/src/app/[[...slug]]/page.tsx"], ctx).e2e).toBe(true)
    expect(plan(["apps/help/src/app/page.tsx"], ctx).e2e).toBe(true)
    expect(plan(["apps/jobs/src/app/page.tsx"], ctx).e2e).toBe(true)
    expect(plan(["apps/load/src/scenarios/api-core.ts"], ctx).e2e).toBe(true)
  })
  test("a shared package they depend on turns it on", () => {
    expect(plan(["packages/session/src/index.ts"], ctx).e2e).toBe(true)
  })
  test("a docs-only change leaves it off", () => {
    expect(plan(["README.md"], ctx).e2e).toBe(false)
  })
})

describe("audit", () => {
  test("bun.lock is a root file: it already runs everything, audit included", () => {
    const p = plan(["bun.lock"], ctx)
    expect(p.all).toBe(true)
    expect(p.audit).toBe(true)
  })

  test("the root package.json runs everything, audit included", () => {
    const p = plan(["package.json"], ctx)
    expect(p.all).toBe(true)
    expect(p.audit).toBe(true)
  })

  test("one workspace's own package.json turns audit on without making the plan `all`", () => {
    const p = plan(["apps/api/package.json"], ctx)
    expect(p.all).toBe(false)
    expect(p.audit).toBe(true)
    // Unrelated jobs stay scoped to the one workspace, same as any other apps/api-only change.
    expect(p.affected).toEqual(["@repo/api"])
  })

  test("a package.json change under packages/ also turns audit on", () => {
    const p = plan(["packages/session/package.json"], ctx)
    expect(p.all).toBe(false)
    expect(p.audit).toBe(true)
  })

  test("an ordinary source change leaves audit off", () => {
    const p = plan(["apps/api/src/env.ts"], ctx)
    expect(p.all).toBe(false)
    expect(p.audit).toBe(false)
  })

  test("a docs-only change leaves it off even if named package.json.md", () => {
    expect(plan(["README.md"], ctx).audit).toBe(false)
  })

  test("an empty diff (full run) turns audit on", () => {
    expect(plan([], ctx).audit).toBe(true)
  })
})

describe("everything else", () => {
  for (const file of ["bun.lock", "package.json", "biome.json", ".github/workflows/ci.yml"]) {
    test(`${file} runs everything`, () => {
      const p = plan([file], ctx)
      expect(p.all).toBe(true)
      expect(p.affected).toHaveLength(ctx.workspaces.length)
      expect(p.docker).toEqual(dockerRows)
      expect(p.e2e).toBe(true)
    })
  }

  test("an empty diff runs everything rather than nothing", () => {
    expect(plan([], ctx)).toMatchObject({ all: true, docsOnly: false })
  })

  test("a Dockerfile change builds only the images that use it", () => {
    const p = plan(["docker/bun-service.Dockerfile"], ctx)
    expect(p.affected).toEqual([])
    expect(p.docker.map((r) => r.app)).toEqual(["api", "ai"])
  })

  test(".dockerignore rebuilds every image", () => {
    expect(plan([".dockerignore"], ctx).docker).toEqual(dockerRows)
  })

  test("repo config that no build, test or image reads runs Biome only", () => {
    const files = [
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/CODEOWNERS",
      ".github/dependabot.yml",
      ".husky/pre-commit",
      "commitlint.config.js",
      "lint-staged.config.js",
      "cspell.json",
      ".editorconfig",
      ".czrc",
      ".claudeignore",
      ".mcp.json",
      ".env.example",
      "LLMS.txt",
      "skills-lock.json",
      "workspace.code-workspace",
    ]
    for (const file of files) {
      expect(plan([file], ctx)).toMatchObject({ docsOnly: false, all: false, affected: [] })
    }
  })

  test("the CI workflow itself still runs everything", () => {
    expect(plan([".github/workflows/ci.yml"], ctx).all).toBe(true)
  })

  test("a change under scripts/ or perf/ still runs everything, including verify's typecheck", () => {
    expect(plan(["scripts/ci-plan.ts"], ctx).all).toBe(true)
    expect(plan(["perf/budgets.ts"], ctx).all).toBe(true)
  })

  test("lint-only files run Biome and nothing else", () => {
    const p = plan([".devcontainer/devcontainer.json", "docker-compose.yml"], ctx)
    expect(p).toMatchObject({ docsOnly: false, all: false, affected: [], build: [], docker: [] })
  })
})

test("these rows are the workflow's DOCKER_MATRIX", async () => {
  const workflow = await Bun.file(`${import.meta.dir}/../.github/workflows/ci.yml`).text()
  const matrix = workflow.match(/DOCKER_MATRIX: >-\n((?:\s+[[{].*\n)+)/)?.[1]
  expect(JSON.parse(matrix?.replace(/\s+/g, " ") ?? "null")).toEqual(dockerRows)
})

test("the shared per-app files are byte-identical across the Next apps", async () => {
  const ROOT = `${import.meta.dir}/..`
  const apps = SITE_IDS
  const digest = async (path: string) =>
    new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex")
  const same = async (file: string, subset = apps) =>
    new Set(await Promise.all(subset.map((a) => digest(`${ROOT}/apps/${a}/${file}`)))).size
  // account extends `form-action` for the Stripe redirects (the proxy's one `csp` option).
  expect(
    await same(
      "src/proxy.ts",
      apps.filter((a) => a !== "account")
    )
  ).toBe(1)
  // auth, app and account read their status pages in the request's language (i18n G1, G2); the
  // static apps keep theirs in English.
  const translated = ["auth", "app", "account"]
  expect(
    await same(
      "src/app/error.tsx",
      apps.filter((a) => !translated.includes(a))
    )
  ).toBe(1)
  // The translated copies differ only in their namespace (`auth.status`, `app.status`,
  // `account.status`); normalize it, and they must still be one file — which also keeps the
  // boundary report in each.
  for (const file of ["src/app/error.tsx", "src/app/not-found.tsx"]) {
    const texts = await Promise.all(
      translated.map((a) => Bun.file(`${ROOT}/apps/${a}/${file}`).text())
    )
    expect(
      new Set(texts.map((text) => text.replace(/"(auth|app|account)\.status"/, '"X.status"'))).size
    ).toBe(1)
  }
  for (const app of translated) {
    expect(await Bun.file(`${ROOT}/apps/${app}/src/app/error.tsx`).text()).toContain(
      'reportError(error, { kind: "boundary"'
    )
  }
  expect(await same("src/app/global-error.tsx")).toBe(1)
  // Each app's telemetry route differs only in its `app:` literal; normalize that before comparing.
  const telemetryRoutes = await Promise.all(
    apps.map((a) => Bun.file(`${ROOT}/apps/${a}/src/app/api/telemetry/route.ts`).text())
  )
  const normalized = telemetryRoutes.map((text) => text.replace(/app:\s*"[^"]+"/, 'app: "X"'))
  expect(new Set(normalized).size).toBe(1)
  // No Next app ships a root loading.tsx, for two reasons. Static apps (www, docs, help, jobs):
  // React outlines a Suspense boundary larger than ~12.8 KB as a hidden segment revealed by an
  // inline script, so a root boundary hides any sizeable page from readers without JavaScript.
  // Dynamic apps (app, auth, account): with a root boundary, Next 16.2's client router can leave a
  // revalidating server action's transition uncommitted forever (the button spins until a reload;
  // see apps/{app,auth,account}/src/app/root-loading.test.ts and CLAUDE.md "Status pages").
  for (const app of apps) {
    expect(await Bun.file(`${ROOT}/apps/${app}/src/app/loading.tsx`).exists()).toBe(false)
  }
  // www wraps its 404 in the site's Background and auth, app and account translate it; the others
  // share one file.
  expect(
    await same(
      "src/app/not-found.tsx",
      apps.filter((a) => a !== "www" && !translated.includes(a))
    )
  ).toBe(1)
})

test("filtersIn reads the root scripts' --filter lists", () => {
  expect(filtersIn("bun run --filter @repo/a --filter '@repo/b' typecheck")).toEqual([
    "@repo/a",
    "@repo/b",
  ])
  expect(ctx.typecheckGate).toContain("@repo/api")
  expect(ctx.testGate).toEqual([
    "@repo/api",
    "@repo/ai",
    "@repo/app",
    "@repo/service-kit",
    "@repo/ui",
    "@repo/api-contract",
    "@repo/public-api-contract",
    "@repo/sites",
    "@repo/content",
    "@repo/email",
    "@repo/session",
    "@repo/telemetry",
    "@repo/i18n",
    "@repo/i18n-guard",
    "@repo/log",
    "@repo/auth",
    "@repo/account",
    "@repo/www",
    "@repo/blog",
    "@repo/docs",
    "@repo/help",
    "@repo/jobs",
    "@repo/load",
  ])
})
