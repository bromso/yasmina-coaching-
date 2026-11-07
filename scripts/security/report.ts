/**
 * The decide → print → write-results → exit-code tail every scanner CLI shares. Factored out of
 * `audit.ts`, `secrets.ts` and `image.ts` (each used to carry its own ~40-line copy) because this
 * is the code that decides pass/fail: a fix to one copy — the results-file shape, a new failure
 * category — could silently miss the others.
 *
 * `finish()` does I/O (loads `security/allowlist.json` unless `allowlistPath` overrides it for a
 * test, writes `resultsPath`, prints to the console) but never calls `process.exit` itself — it
 * returns the exit code so each CLI's own `main()` stays the one place that calls `process.exit`,
 * which keeps this function callable, and assertable, from a plain test.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import {
  decide,
  type Entry,
  type Finding,
  formatTable,
  loadAllowlist,
  type Scanner,
} from "./allowlist"

export type FinishOptions = {
  /** Printed as the prefix of every log line ("audit", "secrets", "image"). */
  label: string
  findings: Finding[]
  /** `judgeStale: false` for a run that cannot see every finding (a secrets `--range` run). */
  run: { scanner: Scanner; image?: string; judgeStale?: boolean }
  /** Absolute path `security/.results/<scanner>[-<image>].json` is written to. */
  resultsPath: string
  /** Overrides `security/allowlist.json` — tests only. */
  allowlistPath?: string
  /** Overrides the real clock — tests only. */
  now?: Date
}

/**
 * Pure: the run's final exit code from `decide()`'s output plus the allowlist's own validation
 * errors — an invalid entry, an expired one or a stale one fails the run (1) exactly like an
 * unallowed finding does. A tool failure (the scanner itself could not run, its output could not
 * be parsed) never reaches this function; the CLI exits 2 for that before `finish()` is called.
 */
export function exitCodeFor(
  decision: { failing: Finding[]; expired: Entry[]; stale: Entry[] },
  allowlistErrors: string[]
): 0 | 1 {
  const fails =
    allowlistErrors.length > 0 ||
    decision.failing.length > 0 ||
    decision.expired.length > 0 ||
    decision.stale.length > 0
  return fails ? 1 : 0
}

/**
 * Loads the allowlist, applies it to `options.findings`, prints the table plus any
 * expired/stale/invalid-entry lines, writes the results file, and returns the exit code: 2 if the
 * allowlist could not be loaded or the results file could not be written, else whatever
 * `exitCodeFor` says (0 or 1).
 */
export function finish(options: FinishOptions): number {
  let entries: Entry[]
  let allowlistErrors: string[]
  try {
    const loaded = loadAllowlist(options.allowlistPath)
    entries = loaded.entries
    allowlistErrors = loaded.errors
  } catch (error) {
    console.error(
      `${options.label}: could not load security/allowlist.json: ${(error as Error).message}`
    )
    return 2
  }

  const decision = decide(options.findings, entries, options.run, options.now ?? new Date())

  for (const message of allowlistErrors) console.error(`${options.label}: ${message}`)
  for (const entry of decision.expired) {
    console.error(
      `${options.label}: allowlist entry expired: ${entry.id} (expired ${entry.expires})`
    )
  }
  for (const entry of decision.stale) {
    console.error(`${options.label}: allowlist entry is stale, no matching finding: ${entry.id}`)
  }

  console.log(formatTable([...decision.failing, ...decision.allowed, ...decision.reported]))

  try {
    mkdirSync(dirname(options.resultsPath), { recursive: true })
    writeFileSync(
      options.resultsPath,
      JSON.stringify(
        { findings: options.findings, failing: decision.failing, allowed: decision.allowed },
        null,
        2
      )
    )
  } catch (error) {
    console.error(`${options.label}: could not write results: ${(error as Error).message}`)
    return 2
  }

  return exitCodeFor(decision, allowlistErrors)
}
