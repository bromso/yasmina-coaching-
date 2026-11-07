/**
 * Drill 2, slow queries (spec §2.4.2). A stack whose every database statement waits
 * `API_TEST_QUERY_DELAY_MS` (200 ms) first — the api's test-only hook, honoured only outside
 * production, so this stack runs with `NODE_ENV=test`. Pass: `notes.list`'s p95 rises to at
 * least the delay but stays under 2 s, nothing answers 5xx, and no request outlives the client
 * timeout (nothing deadlocks).
 */
import { DEFAULT_CLIENT_TIMEOUT_MS } from "../clients"
import { startStack } from "../stack"
import {
  type Check,
  check,
  type DrillResult,
  durationOf,
  errorKinds,
  fmtKinds,
  is5xx,
  percentile,
  result,
  type Sample,
  setupUsers,
  sleep,
  startLoop,
} from "./common"

export const PORTS = { api: 3043, ai: 3044 }
export const QUERY_DELAY_MS = 200
export const P95_CEILING_MS = 2_000
const VUS = 10
const USERS = 3
const LOAD_MS = 8_000

/** The drill's verdict from what it recorded — pure, unit-tested. */
export function judgeSlow(samples: Sample[], delayMs = QUERY_DELAY_MS): Check[] {
  const list = samples.filter((s) => s.label === "notes.list")
  const okList = list.filter((s) => s.ok)
  const p95 = percentile(okList.map(durationOf), 95)
  const fives = samples.filter(is5xx).length
  const slowest = Math.max(0, ...samples.map(durationOf))
  const timeouts = samples.filter((s) => s.kind === "timeout").length
  return [
    check(
      okList.length > 0 && p95 >= delayMs && p95 < P95_CEILING_MS,
      `notes.list p95 ${Math.round(p95)} ms over ${okList.length} ok (want ≥ ${delayMs} and < ${P95_CEILING_MS})`
    ),
    check(
      fives === 0,
      `5xx ${fives} of ${samples.length} (errors ${fmtKinds(errorKinds(samples))})`
    ),
    check(
      timeouts === 0 && slowest < DEFAULT_CLIENT_TIMEOUT_MS,
      `slowest ${Math.round(slowest)} ms, client timeouts ${timeouts} (timeout ${DEFAULT_CLIENT_TIMEOUT_MS} ms)`
    ),
  ]
}

export async function slowDrill(): Promise<DrillResult> {
  const stack = await startStack({
    db: "sqlite",
    apiPort: PORTS.api,
    aiPort: PORTS.ai,
    env: { NODE_ENV: "test", API_TEST_QUERY_DELAY_MS: String(QUERY_DELAY_MS) },
  })
  try {
    const users = await setupUsers(USERS, stack.target, stack.mailDir, "slow")
    const loop = startLoop(VUS, async (vu, measure) => {
      const { user, workspaceId } = users[vu % users.length] as (typeof users)[number]
      await measure("notes.list", () => user.client.notes.list({ workspaceId }))
    })
    await sleep(LOAD_MS)
    await loop.stop()
    return result("slow", judgeSlow(loop.samples))
  } finally {
    await stack.stop()
  }
}
