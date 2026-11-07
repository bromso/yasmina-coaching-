// `bun run perf:update`: the only writer of `perf/budgets.json`. Reads every measurement in
// `perf/.results/*.json` (a local run and a downloaded CI run combine, the worse value per key
// winning), adds each kind's headroom, lays the result over the current budgets key by key and
// prints what changed. CI never runs this: a budget moves only through a reviewed diff.

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  applyHeadroom,
  BUDGETS_PATH,
  type Budgets,
  loadBudgets,
  mergeBudgets,
  mergeResults,
  RESULTS_DIR,
  type Results,
  repoContext,
  serializeBudgets,
  validateBudgets,
} from "./budgets"

/** Every leaf as `section key → value`, for the before/after table. */
function flatten(b: Budgets): Map<string, number> {
  const out = new Map<string, number>()
  for (const [app, routes] of Object.entries(b.bundles)) {
    for (const [route, kb] of Object.entries(routes)) out.set(`bundles ${app} ${route}`, kb)
  }
  for (const section of ["lighthouse", "vitals"] as const) {
    for (const [page, metrics] of Object.entries(b[section])) {
      for (const [metric, v] of Object.entries(metrics)) out.set(`${section} ${page} ${metric}`, v)
    }
  }
  for (const [label, ms] of Object.entries(b.api)) out.set(`api ${label}`, ms)
  return out
}

function main(): number {
  let files: string[]
  try {
    files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"))
  } catch {
    files = []
  }
  if (files.length === 0) {
    console.error(`No results in ${RESULTS_DIR}. Run \`bun run perf:measure\` first.`)
    return 1
  }
  const sets = files.map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")) as Results)
  const before = loadBudgets()
  const after = mergeBudgets(before, applyHeadroom(mergeResults(sets)))

  const problems = validateBudgets(after, repoContext())
  if (problems.length > 0) {
    console.error(`Not written — the new budgets do not validate:\n  ${problems.join("\n  ")}`)
    return 1
  }

  const old = flatten(before)
  const rows = [...flatten(after)]
    .filter(([key, value]) => old.get(key) !== value)
    .map(([key, value]) => [key, String(old.get(key) ?? "—"), String(value)])
  if (rows.length === 0) {
    console.log(`Read ${files.join(", ")}: no budget changed.`)
    return 0
  }
  const width = (i: number) => Math.max(...rows.map((r) => (r[i] as string).length), 6)
  const line = (r: string[]) =>
    `${(r[0] as string).padEnd(width(0))}  ${(r[1] as string).padStart(width(1))}  ${(r[2] as string).padStart(width(2))}`
  console.log(line(["budget", "before", "after"]))
  for (const r of rows) console.log(line(r))
  writeFileSync(BUDGETS_PATH, serializeBudgets(after))
  console.log(`\nRead ${files.join(", ")}; wrote ${rows.length} change(s) to ${BUDGETS_PATH}.`)
  return 0
}

process.exit(main())
