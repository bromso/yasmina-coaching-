/**
 * `bun run --filter @repo/load drills [database|slow|providers|sigterm …]`: the failure drills of
 * the spec's §2.4, every one by default or the ones named, in order. Each starts and stops its own
 * stack (its own ports and `.tmp/stack-<port>` directory), so none needs a stack running already,
 * and prints one `PASS`/`FAIL` line with the numbers it measured. Exits 1 when any fails.
 *
 * The Postgres variant of `database` runs only with `LOAD_DRILL_POSTGRES=1` (needs docker; it
 * starts and removes its own throwaway container).
 */
import type { DrillResult } from "./common"
import { databaseDrill } from "./database"
import { providersDrill } from "./providers"
import { sigtermDrill } from "./sigterm"
import { slowDrill } from "./slow"

export const DRILLS = {
  database: databaseDrill,
  slow: async () => [await slowDrill()],
  providers: async () => [await providersDrill()],
  sigterm: async () => [await sigtermDrill()],
} satisfies Record<string, () => Promise<DrillResult[]>>

export type DrillName = keyof typeof DRILLS

/** The drills to run from the command line's names (none = all); throws on an unknown one. */
export function selectDrills(args: string[]): DrillName[] {
  const names = args.filter((arg) => !arg.startsWith("-"))
  if (names.length === 0) return Object.keys(DRILLS) as DrillName[]
  const unknown = names.filter((name) => !(name in DRILLS))
  if (unknown.length > 0) {
    throw new Error(
      `unknown drill ${unknown.join(", ")} — choose from ${Object.keys(DRILLS).join(", ")}`
    )
  }
  return names as DrillName[]
}

export async function main(args: string[]): Promise<boolean> {
  let passed = true
  for (const name of selectDrills(args)) {
    let results: DrillResult[]
    try {
      results = await DRILLS[name]()
    } catch (error) {
      // A drill that cannot even run (a stack that never became ready, docker missing) fails.
      results = [
        {
          name,
          passed: false,
          lines: [`FAIL ${name}: the drill itself failed — ${(error as Error)?.message ?? error}`],
        },
      ]
    }
    for (const r of results) {
      for (const line of r.lines) console.log(line)
      if (!r.passed) passed = false
    }
  }
  return passed
}

if (import.meta.main) {
  if (!(await main(process.argv.slice(2)))) process.exitCode = 1
}
