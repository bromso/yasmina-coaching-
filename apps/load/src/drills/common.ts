/**
 * What the four drills share: a closed-model request loop that keeps every request's own start
 * and end (the drills judge by *when* a request ran relative to the fault, which the runner's
 * aggregated histograms cannot say), percentile and verdict helpers, and user setup.
 */
import { isTwoFactorChallenge } from "@repo/api-contract"
import { SQL } from "bun"
import {
  apiClient,
  LOAD_PASSWORD,
  type SignedInUser,
  signUpVerified,
  withWorkspace,
} from "../clients"
import { classifyError, type ErrorKind } from "../runner"
import type { Targets } from "../target"

export type Sample = {
  label: string
  vu: number
  /** ms since the loop's own epoch (`performance.now()` based). */
  start: number
  end: number
  ok: boolean
  kind?: ErrorKind
}

export type DrillResult = { name: string; passed: boolean; lines: string[] }

/** One verdict line: `PASS`/`FAIL`, the drill, then the numbers it measured. */
export const verdict = (name: string, passed: boolean, details: string[]) =>
  `${passed ? "PASS" : "FAIL"} ${name}: ${details.join("; ")}`

/** One check inside a drill: what was measured, and whether it met the bar. */
export type Check = { ok: boolean; text: string }
export const check = (ok: boolean, text: string): Check => ({
  ok,
  text: `${ok ? "ok" : "✗"} ${text}`,
})

export function result(name: string, checks: Check[]): DrillResult {
  const passed = checks.every((c) => c.ok)
  return {
    name,
    passed,
    lines: [
      verdict(
        name,
        passed,
        checks.map((c) => c.text)
      ),
    ],
  }
}

/** The p-th percentile (nearest rank) of `values`; 0 for none. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number
}

export const durationOf = (s: Sample) => s.end - s.start

/** Counts of each error kind across `samples` (successes excluded). */
export function errorKinds(samples: Sample[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of samples) if (!s.ok) out[s.kind ?? "other"] = (out[s.kind ?? "other"] ?? 0) + 1
  return out
}

export const fmtKinds = (kinds: Record<string, number>) =>
  Object.keys(kinds).length === 0
    ? "none"
    : Object.entries(kinds)
        .map(([k, n]) => `${k}×${n}`)
        .join(", ")

export const is5xx = (s: Sample) => /^status:5\d\d$/.test(s.kind ?? "")

export type Loop = {
  samples: Sample[]
  /** Requests started so far (a started request is in `samples` once it ends). */
  started(): number
  /** ms on the loop's clock (same epoch as every sample's start/end). */
  now(): number
  /** Stop starting requests; resolves once every VU has finished its current one. */
  stop(): Promise<void>
}

/**
 * Starts `vus` workers, each calling `step(vu, measure)` back to back until `stop()`. `measure`
 * records one request (a throw is recorded with its kind and swallowed, never fatal).
 */
export function startLoop(
  vus: number,
  step: (
    vu: number,
    measure: (label: string, fn: () => Promise<unknown>) => Promise<void>
  ) => Promise<void>
): Loop {
  const epoch = performance.now()
  const now = () => performance.now() - epoch
  const samples: Sample[] = []
  let stopping = false
  let started = 0
  const workers = Array.from({ length: vus }, async (_, vu) => {
    const measure = async (label: string, fn: () => Promise<unknown>) => {
      const start = now()
      started++
      try {
        await fn()
        samples.push({ label, vu, start, end: now(), ok: true })
      } catch (error) {
        samples.push({ label, vu, start, end: now(), ok: false, kind: classifyError(error) })
      }
    }
    while (!stopping) {
      await step(vu, measure)
      // A step that failed instantly (connection refused) must not spin the event loop.
      await Bun.sleep(1)
    }
  })
  return {
    samples,
    started: () => started,
    now,
    stop: async () => {
      stopping = true
      await Promise.all(workers)
    },
  }
}

export type DrillUser = { user: SignedInUser; workspaceId: number }

/** `count` verified users with a workspace each, signed up in parallel. */
export async function setupUsers(
  count: number,
  target: Targets,
  mailDir: string,
  tag: string
): Promise<DrillUser[]> {
  const stamp = Date.now()
  return Promise.all(
    Array.from({ length: count }, async (_, n) => {
      const user = await signUpVerified(`load-drill-${tag}-${stamp}-${n}@example.com`, {
        target,
        mailDir,
        clientId: `load-drill-${tag}-${n}`,
      })
      return { user, workspaceId: await withWorkspace(user.client, `Drill ${n}`) }
    })
  )
}

/**
 * Like `setupUsers`, for a stack whose mail goes nowhere readable (the providers drill's refusing
 * SMTP): signs up, marks the address verified straight in the SQLite file (test setup, not the
 * path under test), then signs in.
 */
export async function setupUsersWithoutMail(
  count: number,
  target: Targets,
  sqliteFile: string,
  tag: string
): Promise<DrillUser[]> {
  const stamp = Date.now()
  const db = new SQL(`sqlite://${sqliteFile}`)
  try {
    const users: DrillUser[] = []
    for (let n = 0; n < count; n++) {
      const email = `load-drill-${tag}-${stamp}-${n}@example.com`
      const anonymous = apiClient({ target, clientId: `load-drill-${tag}-${n}` })
      await anonymous.auth.signUp({ email, password: LOAD_PASSWORD })
      await db`UPDATE users SET email_verified_at = ${new Date().toISOString()} WHERE email = ${email}`
      const signedIn = await anonymous.auth.signIn({ email, password: LOAD_PASSWORD })
      if (isTwoFactorChallenge(signedIn)) throw new Error(`${email} unexpectedly has two-step on`)
      const client = apiClient({ target, sessionToken: signedIn.session.token })
      const user: SignedInUser = {
        client,
        sessionToken: signedIn.session.token,
        userId: signedIn.user.id,
        email,
      }
      users.push({ user, workspaceId: await withWorkspace(client, `Drill ${n}`) })
    }
    return users
  } finally {
    await db.close()
  }
}

/** `GET /ready` with its own timeout: the status, or `"timeout"` / `"network"`. */
export async function probeReady(apiUrl: string, timeoutMs: number): Promise<number | string> {
  try {
    const res = await fetch(`${apiUrl}/ready`, { signal: AbortSignal.timeout(timeoutMs) })
    await res.arrayBuffer()
    return res.status
  } catch (error) {
    return classifyError(error)
  }
}

export const sleep = (ms: number) => Bun.sleep(ms)
