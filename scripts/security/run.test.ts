import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runScript, worstExitCode } from "./run"

describe("worstExitCode", () => {
  test("0 for an empty list", () => {
    expect(worstExitCode([])).toBe(0)
  })

  test("0 when every code is 0", () => {
    expect(worstExitCode([0, 0])).toBe(0)
  })

  test("1 beats 0", () => {
    expect(worstExitCode([0, 1])).toBe(1)
    expect(worstExitCode([1, 0])).toBe(1)
  })

  test("2 (a tool failure) beats 1 (a findings failure)", () => {
    expect(worstExitCode([1, 2])).toBe(2)
    expect(worstExitCode([2, 1])).toBe(2)
  })

  test("2 beats 0", () => {
    expect(worstExitCode([0, 2])).toBe(2)
  })

  test("a single code is returned as-is", () => {
    expect(worstExitCode([1])).toBe(1)
  })
})

describe("runScript", () => {
  // No network, no Docker: each script here is a local temp file that just calls process.exit.
  const dir = mkdtempSync(join(tmpdir(), "security-run-"))
  const scriptExiting = (code: number): string => {
    const path = join(dir, `exit-${code}.ts`)
    writeFileSync(path, `process.exit(${code})\n`)
    return path
  }

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("passes 0 and 1 through unchanged", async () => {
    expect(await runScript(scriptExiting(0))).toBe(0)
    expect(await runScript(scriptExiting(1))).toBe(1)
  })

  test("clamps any other exit code to 2, a signal kill included", async () => {
    expect(await runScript(scriptExiting(2))).toBe(2)
    // 137 is what a SIGKILL'd process reports (128 + 9) — still a tool failure, not findings.
    expect(await runScript(scriptExiting(137))).toBe(2)
  })
})
