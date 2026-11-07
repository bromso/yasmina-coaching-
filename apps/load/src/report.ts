import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Evaluation, RunResult } from "./runner"

export const RESULTS_DIR = join(import.meta.dirname, "..", ".results")

const pad = (value: string, width: number, right = false) =>
  right ? value.padStart(width) : value.padEnd(width)

const ms = (value: number) => value.toFixed(1)

/** The result as a fixed-width table, one row per label. */
export function formatTable(result: RunResult): string {
  const header = ["label", "count", "ok", "rps", "p50 ms", "p95 ms", "p99 ms", "max ms", "errors"]
  const rows = Object.entries(result.labels).map(([label, s]) => [
    label,
    String(s.count),
    String(s.ok),
    s.rps.toFixed(1),
    ms(s.p50),
    ms(s.p95),
    ms(s.p99),
    ms(s.max),
    Object.entries(s.errors)
      .map(([kind, n]) => `${kind}×${n}`)
      .join(" ") || "-",
  ])
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)))
  const line = (cells: string[]) =>
    cells.map((cell, i) => pad(cell, widths[i] ?? 0, i > 0 && i < cells.length - 1)).join("  ")
  const summary =
    `${result.name} (${result.model}, ${(result.durationMs / 1000).toFixed(0)} s): ` +
    `${result.iterations} iterations, ${result.failedIterations} failed, ${result.dropped} dropped`
  return [summary, line(header), ...rows.map(line)].join("\n")
}

/** Prints the table and the verdict, writes `.results/<name>-<ISO>.json`, returns its path. */
export function writeReport(
  result: RunResult,
  evaluation: Evaluation,
  { dir = RESULTS_DIR, log = console.log }: { dir?: string; log?: (line: string) => void } = {}
): string {
  log(formatTable(result))
  log(evaluation.passed ? "PASS" : `FAIL\n${evaluation.failures.map((f) => `  - ${f}`).join("\n")}`)
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(":", "-")
  const path = join(dir, `${result.name}-${stamp}.json`)
  writeFileSync(path, `${JSON.stringify({ ...result, evaluation }, null, 2)}\n`)
  return path
}
