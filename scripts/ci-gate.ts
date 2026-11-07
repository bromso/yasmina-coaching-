#!/usr/bin/env bun
/**
 * The final `ci` job: one check for branch protection. NEEDS is `toJSON(needs)` from the workflow.
 * A job the plan required must have succeeded; a job the plan left out may only be skipped (or
 * succeed). "Never ran" is not a pass: a job that got no runner reports no failure either.
 */

export type Needs = Record<string, { result: string; outputs?: Record<string, string> }>

/** The jobs the final `ci` job waits for besides `changes` (scripts/github.test.ts checks). */
export const GATED_JOBS = [
  "verify",
  "storybook",
  "api-postgres",
  "e2e",
  "docker",
  "security",
] as const

/**
 * Which jobs the `changes` plan asked for, from its outputs (mirrors each job's `if:`).
 * `security` runs unconditionally, docs-only changes included (it has no `if:` of its own), so
 * it is always required here too — never derived from the plan's outputs.
 */
function planned(outputs: Record<string, string>): Record<string, boolean> {
  return {
    verify: outputs.docs_only !== "true",
    storybook: outputs.storybook === "true",
    "api-postgres": outputs.postgres === "true",
    e2e: outputs.e2e === "true",
    docker: (outputs.docker ?? "[]") !== "[]",
    security: true,
  }
}

/** One line per job that does not pass; empty when the run is good. */
export function gateFailures(needs: Needs): string[] {
  const changes = needs.changes
  if (changes?.result !== "success") return [`changes: ${changes?.result ?? "missing"}`]
  const required = planned(changes.outputs ?? {})
  const failures: string[] = []
  for (const [job, mustRun] of Object.entries(required)) {
    const result = needs[job]?.result ?? "missing"
    if (result === "success") continue
    if (result === "skipped" && !mustRun) continue
    failures.push(
      result === "skipped" ? `${job}: skipped, but the plan required it` : `${job}: ${result}`
    )
  }
  return failures
}

if (import.meta.main) {
  const failures = gateFailures(JSON.parse(Bun.env.NEEDS ?? "{}") as Needs)
  for (const line of failures) console.error(`::error::${line}`)
  if (failures.length > 0) process.exit(1)
  console.log("All required jobs passed; the rest were skipped by the plan.")
}
