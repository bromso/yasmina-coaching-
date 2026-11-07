/**
 * Drill 3, storage and mail providers failing (spec §2.4.3). A stack on `STORAGE_PROVIDER=s3`
 * pointed at a closed port and `MAIL_PROVIDER=smtp` with an SMTP URL that refuses. Pass: an avatar
 * upload answers its declared `SERVICE_UNAVAILABLE` (503) promptly (no hang, no crash — the api
 * still answers `/health`),
 * the mail jobs the sign-ups enqueued go to retry (`job_runs_total{outcome="retried"}` rises, none
 * `dead`), and `notes.list` alongside stays within its read budget with no errors.
 *
 * With mail going nowhere readable, setup cannot read a verify link: it marks each address verified
 * straight in the stack's SQLite file (`setupUsersWithoutMail`) — setup, not the path under test.
 */
import { DEFAULT_CLIENT_TIMEOUT_MS } from "../clients"
import { fetchMetrics, type Metrics, metricSum } from "../metrics-client"
import { classifyError, type ErrorKind } from "../runner"
import { startStack } from "../stack"
import {
  type Check,
  check,
  type DrillResult,
  durationOf,
  errorKinds,
  fmtKinds,
  percentile,
  result,
  type Sample,
  setupUsersWithoutMail,
  sleep,
  startLoop,
} from "./common"

export const PORTS = { api: 3045, ai: 3046 }
/** Nothing listens on the discard port locally: connections are refused at once. */
const CLOSED = "127.0.0.1:9"
/** `api-core`'s read budget. */
export const READ_BUDGET_MS = 250
/** An upload that fails on a refused connection should answer well inside this. */
export const UPLOAD_ANSWER_MS = 5_000
const VUS = 10
const USERS = 5
const LOAD_MS = 5_000

// The real 1×1 PNG apps/api's own tests and apps/e2e use (apps/api/src/storage/fixtures.ts).
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
)

export const PROVIDER_ENV = {
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: `http://${CLOSED}`,
  S3_BUCKET: "uploads",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "load-drill",
  S3_SECRET_ACCESS_KEY: "load-drill-secret",
  MAIL_PROVIDER: "smtp",
  SMTP_URL: `smtp://${CLOSED}`,
  MAIL_FROM: "Load drill <no-reply@brand.localhost>",
}

export type Upload = { kind: ErrorKind | "ok"; ms: number }

const retried = (m: Metrics) => metricSum(m, "job_runs_total", { outcome: "retried" })
const dead = (m: Metrics) => metricSum(m, "job_runs_total", { outcome: "dead" })

/** The drill's verdict from what it recorded — pure, unit-tested. */
export function judgeProviders(input: {
  upload: Upload
  healthAfter: number | string
  retriedBefore: number
  retriedAfter: number
  deadAfter: number
  samples: Sample[]
}): Check[] {
  const { upload, samples } = input
  const list = samples.filter((s) => s.label === "notes.list")
  const p95 = percentile(list.filter((s) => s.ok).map(durationOf), 95)
  const listErrors = list.filter((s) => !s.ok)
  return [
    check(
      upload.kind === "status:503" && upload.ms < UPLOAD_ANSWER_MS,
      `avatar upload → ${upload.kind} in ${Math.round(upload.ms)} ms (want status:503 < ${UPLOAD_ANSWER_MS} ms)`
    ),
    check(input.healthAfter === 200, `/health after the upload: ${input.healthAfter}`),
    check(
      input.retriedAfter > input.retriedBefore && input.deadAfter === 0,
      `mail retries ${input.retriedBefore} → ${input.retriedAfter}, dead ${input.deadAfter}`
    ),
    check(
      list.length > listErrors.length && listErrors.length === 0 && p95 < READ_BUDGET_MS,
      `notes.list p95 ${p95.toFixed(1)} ms over ${list.length} (budget ${READ_BUDGET_MS} ms), ` +
        `errors ${fmtKinds(errorKinds(listErrors))}`
    ),
  ]
}

export async function providersDrill(): Promise<DrillResult> {
  const stack = await startStack({
    db: "sqlite",
    apiPort: PORTS.api,
    aiPort: PORTS.ai,
    env: PROVIDER_ENV,
  })
  try {
    const retriedBefore = retried(await fetchMetrics(stack.apiUrl, stack.metricsToken))
    const users = await setupUsersWithoutMail(
      USERS,
      stack.target,
      `${stack.runDir}/api.db`,
      "providers"
    )
    const loop = startLoop(VUS, async (vu, measure) => {
      const { user, workspaceId } = users[vu % users.length] as (typeof users)[number]
      await measure("notes.list", () => user.client.notes.list({ workspaceId }))
    })
    await sleep(1_000)
    const started = performance.now()
    let upload: Upload
    try {
      await (users[0] as (typeof users)[number]).user.client.account.avatar.set({
        file: new File([PNG_1X1], "avatar.png", { type: "image/png" }),
      })
      upload = { kind: "ok", ms: performance.now() - started }
    } catch (error) {
      upload = { kind: classifyError(error), ms: performance.now() - started }
    }
    await sleep(Math.max(0, LOAD_MS - 1_000))
    await loop.stop()
    let healthAfter: number | string
    try {
      healthAfter = (
        await fetch(`${stack.apiUrl}/health`, {
          signal: AbortSignal.timeout(DEFAULT_CLIENT_TIMEOUT_MS),
        })
      ).status
    } catch (error) {
      healthAfter = classifyError(error)
    }
    const after = await fetchMetrics(stack.apiUrl, stack.metricsToken)
    return result(
      "providers",
      judgeProviders({
        upload,
        healthAfter,
        retriedBefore,
        retriedAfter: retried(after),
        deadAfter: dead(after),
        samples: loop.samples,
      })
    )
  } finally {
    await stack.stop()
  }
}
