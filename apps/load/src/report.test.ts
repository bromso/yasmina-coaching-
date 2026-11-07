import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatTable, writeReport } from "./report"
import type { RunResult } from "./runner"

const dir = mkdtempSync(join(tmpdir(), "load-report-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const result: RunResult = {
  name: "demo",
  model: "closed",
  durationMs: 2_000,
  iterations: 10,
  failedIterations: 1,
  dropped: 0,
  labels: {
    "notes.list": {
      count: 10,
      ok: 9,
      errors: { "status:500": 1 },
      p50: 5,
      p95: 9,
      p99: 9.5,
      max: 12,
      rps: 5,
    },
  },
}

describe("report", () => {
  test("the table names each label and its errors", () => {
    const table = formatTable(result)
    expect(table).toContain("notes.list")
    expect(table).toContain("status:500×1")
    expect(table).toContain("10 iterations, 1 failed")
  })

  test("writes the result and the verdict as JSON and returns the path", () => {
    const lines: string[] = []
    const path = writeReport(
      result,
      { passed: false, failures: ["notes.list: 1 5xx (max 0)"] },
      { dir, log: (line) => lines.push(line) }
    )
    expect(path.startsWith(join(dir, "demo-"))).toBe(true)
    expect(path.endsWith(".json")).toBe(true)
    const saved = JSON.parse(readFileSync(path, "utf8"))
    expect(saved.labels["notes.list"].count).toBe(10)
    expect(saved.evaluation.passed).toBe(false)
    expect(lines.join("\n")).toContain("FAIL")
  })
})
