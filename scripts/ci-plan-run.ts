#!/usr/bin/env bun
/**
 * Writes the CI plan for the current diff to $GITHUB_OUTPUT and the job summary.
 * BASE_SHA is the commit to diff against; FULL=true runs everything but docs-only changes.
 * Locally: `BASE_SHA=origin/main bun scripts/ci-plan-run.ts`
 */

import { appendFile } from "node:fs/promises"
import { loadContext, plan } from "./ci-plan"

async function changedFiles(base: string | undefined): Promise<string[]> {
  // No usable base (a new branch, a forced full run): an empty list means "run everything".
  if (!base || /^0+$/.test(base)) return []
  const diff = Bun.spawnSync(["git", "diff", "--name-only", `${base}...HEAD`])
  if (diff.exitCode !== 0) throw new Error(`git diff failed: ${diff.stderr.toString()}`)
  return diff.stdout.toString().split("\n").filter(Boolean)
}

async function main() {
  const ctx = await loadContext()
  const files = await changedFiles(Bun.env.BASE_SHA)
  const result = plan(files, ctx)
  // main runs everything but docs-only pushes: a safety net for any edge the graph misses.
  const final = Bun.env.FULL === "true" && !result.docsOnly ? plan([], ctx) : result

  const filters = (names: string[]) => names.map((n) => `--filter '${n}'`).join(" ")
  const outputs = {
    docs_only: String(final.docsOnly),
    typecheck: filters(final.typecheck),
    ui_typecheck: String(final.uiTypecheck),
    tests: filters(final.tests),
    build: filters(final.build),
    storybook: String(final.storybook),
    postgres: String(final.postgres),
    docker: JSON.stringify(final.docker),
    e2e: String(final.e2e),
    audit: String(final.audit),
  }
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`)
  console.info(`${files.length} changed file(s)`)
  console.info(lines.join("\n"))

  const summary = [
    "### CI plan",
    final.docsOnly ? "Docs-only change — nothing to build or test." : "",
    `- **Affected:** ${final.all ? "everything" : final.affected.join(", ") || "none"}`,
    `- **Typecheck:** ${final.typecheck.join(", ") || "skipped"}`,
    `- **UI typecheck:** ${final.uiTypecheck ? "yes" : "skipped"}`,
    `- **Service tests:** ${final.tests.join(", ") || "skipped"}`,
    `- **Build:** ${final.build.join(", ") || "skipped"}`,
    `- **Storybook tests:** ${final.storybook ? "yes" : "skipped"}`,
    `- **Postgres tests:** ${final.postgres ? "yes" : "skipped"}`,
    `- **Docker:** ${final.docker.map((r) => r.app).join(", ") || "skipped"}`,
    `- **End-to-end tests:** ${final.e2e ? "yes" : "skipped"}`,
    `- **Dependency audit:** ${final.audit ? "yes" : "skipped"}`,
  ].filter(Boolean)

  if (Bun.env.GITHUB_OUTPUT) await appendFile(Bun.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`)
  if (Bun.env.GITHUB_STEP_SUMMARY) {
    await appendFile(Bun.env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
