// `bun run perf:measure`: runs every performance measurement in one command, writing each kind's
// numbers to `perf/.results/*.json` for `bun run perf:update` to fold into `perf/budgets.json`
// (which this script never writes itself — see `perf/update.ts`).
//
// It builds nothing. Two of its three steps read an existing Next production build:
//
//   - Bundle budgets (`scripts/bundle-budget.ts --write-results`) read whichever apps under
//     `apps/*/.next` are already built — skipped entirely with none built.
//   - The Lighthouse and Web Vitals perf specs (`apps/e2e/tests/perf-*.spec.ts`) start all eight
//     Next apps with `next start` (`apps/e2e/playwright.config.ts`'s `webServer` entries), so they
//     need all eight built first — skipped, naming the missing ones, if any aren't.
//
// Build them with, e.g.:
//   COOKIE_DOMAIN=.brand.localhost bun run --filter @repo/www --filter @repo/app \
//     --filter @repo/auth --filter @repo/account --filter @repo/blog --filter @repo/docs \
//     --filter @repo/help --filter @repo/jobs build
// (the same build `apps/e2e`'s own `bun run e2e` runs before its tests; `apps/e2e/README.md`.)
//
// The third step, the load smoke (`bun run --filter @repo/load smoke`), needs nothing built: it
// starts its own throwaway api/ai stack. It always runs.
//
// A missing prerequisite skips its step with a clear message rather than failing the whole run;
// an actual failure (a budget breach, a crashed process) still fails it.

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const E2E_DIR = join(ROOT, "apps", "e2e")
const APPS_DIR = join(ROOT, "apps")

/** The eight Next apps `apps/e2e/playwright.config.ts`'s `webServer` starts with `next start`. */
const E2E_APPS = ["www", "app", "auth", "account", "blog", "docs", "help", "jobs"] as const

const hasBuild = (app: string) => existsSync(join(APPS_DIR, app, ".next", "build-manifest.json"))

type StepResult = "ran" | "skipped" | "failed"

async function spawn(
  cmd: string[],
  cwd: string,
  env: Record<string, string | undefined> = {}
): Promise<boolean> {
  console.log(`\n$ ${cmd.join(" ")}  (in ${cwd.replace(ROOT, ".")})`)
  const proc = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  })
  return (await proc.exited) === 0
}

async function measureBundles(): Promise<StepResult> {
  const built = readdirSync(APPS_DIR).filter(hasBuild)
  if (built.length === 0) {
    console.log(
      "\nSkipping bundle budgets — no app under apps/*/.next is built. Build at least one first " +
        "(e.g. `bun --filter @repo/www build`)."
    )
    return "skipped"
  }
  const ok = await spawn(["bun", "scripts/bundle-budget.ts", "--write-results"], ROOT)
  return ok ? "ran" : "failed"
}

async function measureE2e(): Promise<StepResult> {
  const missing = E2E_APPS.filter((app) => !hasBuild(app))
  if (missing.length > 0) {
    console.log(
      `\nSkipping the Lighthouse/Web Vitals perf specs — not built: ${missing.join(", ")}. All ` +
        "eight Next apps must be built first (see this file's header comment, or " +
        "`bun run --filter @repo/e2e e2e`, which builds them before running every e2e spec)."
    )
    return "skipped"
  }
  const ok = await spawn(
    ["bunx", "playwright", "test", "tests/perf-lighthouse.spec.ts", "tests/perf-vitals.spec.ts"],
    E2E_DIR,
    {
      PERF_WRITE_RESULTS: "1",
    }
  )
  return ok ? "ran" : "failed"
}

async function measureApi(): Promise<StepResult> {
  const ok = await spawn(["bun", "run", "--filter", "@repo/load", "smoke"], ROOT, {
    PERF_WRITE_RESULTS: "1",
  })
  return ok ? "ran" : "failed"
}

async function main(): Promise<number> {
  console.log(
    "perf:measure needs the eight Next apps built for the bundle and e2e steps (see this file's " +
      "header comment for the exact command); the load smoke needs nothing built — it starts its " +
      "own stack. Builds nothing itself."
  )
  const results: Record<string, StepResult> = {
    bundles: await measureBundles(),
    e2e: await measureE2e(),
    api: await measureApi(),
  }
  console.log(
    `\n${Object.entries(results)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")}`
  )
  if (Object.values(results).includes("ran")) {
    console.log(
      `\nResults written under ${join("perf", ".results")}. Review them, then run ` +
        "`bun run perf:update` to fold them into perf/budgets.json."
    )
  }
  return Object.values(results).includes("failed") ? 1 : 0
}

process.exit(await main())
