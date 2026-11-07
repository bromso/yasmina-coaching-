/**
 * `bun run security`'s entry point: runs the audit and secrets scanners as two subprocesses,
 * sequentially, even when the first one fails. Chaining them with `&&` in `package.json` (the
 * original approach) meant this repo's own pre-triage audit findings — expected to fail until
 * Tasks 6–7's triage — silently stopped the secrets scan from running at all, every single time.
 *
 * The exit code is the worse of the two: 2 (a tool failure) beats 1 (a findings failure) beats 0
 * (clean), so a tool failure in either scanner is still distinguishable from a clean pass even
 * when the other scanner found nothing.
 */

import { join } from "node:path"

/** Pure: the worst (highest) of a list of exit codes, 0 for an empty list. */
export function worstExitCode(codes: number[]): number {
  return codes.reduce((worst, code) => Math.max(worst, code), 0)
}

/** Exported for `run.test.ts`'s clamping test; `main()` below is the only real caller. */
export async function runScript(path: string): Promise<number> {
  const proc = Bun.spawn(["bun", path], { stdout: "inherit", stderr: "inherit" })
  const code = await proc.exited
  // audit.ts and secrets.ts only ever exit 0, 1 or 2 themselves; anything else — a signal kill
  // (137 for SIGKILL), a crash before main() installs its own handler — is still a tool failure,
  // never a clean pass or a plain findings failure, so it's clamped to 2 rather than passed
  // through unchanged.
  return code === 0 || code === 1 ? code : 2
}

async function main() {
  const dir = import.meta.dirname
  const auditCode = await runScript(join(dir, "audit.ts"))
  const secretsCode = await runScript(join(dir, "secrets.ts"))
  process.exit(worstExitCode([auditCode, secretsCode]))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`security: ${(error as Error).message}`)
    process.exit(2)
  })
}
