import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import {
  type ApiClient,
  isTwoFactorChallenge,
  type RealtimeEvent,
  type SignInResult,
  type UserRealtimeEvent,
} from "@repo/api-contract"
import { verifyEmailSubject } from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import type { MockBillingProvider } from "./billing/mock"
import { DEV_TWO_FACTOR_KEY } from "./env"
import type { Mailer, Message } from "./mail/mailer"
import type { Profile, Provider } from "./oauth/provider"
import type { ProviderId } from "./queries/identities"
import { createServer } from "./server"
import { localStorage } from "./storage/local"
import { testDatabase } from "./test-db"
import { encryptSecret } from "./two-factor/secret"
import { generateTotpSecret } from "./two-factor/totp"

export const TOKEN = "test-token"
export const auth = { authorization: `Bearer ${TOKEN}` }

export type Sent = Message
/** Records every message, then hands it to `inner` if given (so a failing provider still fails). */
export function captureMailer(inner?: Mailer): Mailer & {
  sent: Sent[]
  waitFor(count?: number, timeoutMs?: number): Promise<Sent[]>
} {
  const sent: Sent[] = []
  return {
    kind: inner?.kind ?? "log",
    sent,
    async send(message) {
      sent.push(message)
      await inner?.send(message)
    },
    /** Resolves once at least `count` messages were captured (sends are detached from responses). */
    async waitFor(count = 1, timeoutMs = 2_000) {
      const deadline = Date.now() + timeoutMs
      while (sent.length < count) {
        if (Date.now() > deadline) {
          throw new Error(`expected ${count} mail(s) within ${timeoutMs} ms, got ${sent.length}`)
        }
        await Bun.sleep(5)
      }
      return sent
    },
  }
}

// A real Bun.serve on an ephemeral port with a private database (in-memory SQLite, or a throwaway
// Postgres database when TEST_DATABASE_URL is set) and a capturing mailer (which records, then
// delegates to `overrides.mailer` when one is given). Billing is the keyless mock unless
// `overrides.billing` says otherwise; `billing` on the result is what the factory built, so a test
// can drive the mock's `change` directly.
export async function start(overrides: Partial<Parameters<typeof createServer>[0]> = {}) {
  const db = await testDatabase()
  const { mailer: inner, storage: storageOverride, ...rest } = overrides
  const mailer = captureMailer(inner)
  // Never write a test's uploads into the repo: a throwaway directory per server, unless the test
  // supplies its own storage.
  const storageDir = storageOverride ? null : await mkdtemp(join(tmpdir(), "api-storage-"))
  const storage = storageOverride ?? localStorage(storageDir as string)
  let app: Awaited<ReturnType<typeof createServer>>
  try {
    app = await createServer({
      hostname: "127.0.0.1",
      port: 0,
      databaseUrl: db.url,
      token: TOKEN,
      authUrl: "http://auth.example.com",
      accountUrl: "http://account.example.com",
      appUrl: "http://app.example.com",
      mailer,
      storage,
      allowedOrigins: ["https://app.example.com"],
      allowLocalhostOrigins: false,
      rateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      // Per-user limits sized for production would trip on the role matrix's one busy owner;
      // the limiter tests pass their own.
      inviterLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      workspaceCreateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      signUpLimiter: createMemoryRateLimiter({ limit: 10_000, windowMs: 60_000 }),
      signUpEmailLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      magicGlobalLimiter: createMemoryRateLimiter({ limit: 10_000, windowMs: 60_000 }),
      resetGlobalLimiter: createMemoryRateLimiter({ limit: 10_000, windowMs: 60_000 }),
      twoFactorEncryptionKey: DEV_TWO_FACTOR_KEY,
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      resetTwoFactorLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      removePasskeysLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      suspendLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      auditExportLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      // The software authenticator (test-authenticator.ts) signs for these origins and RP id.
      passkeyRpId: "example.com",
      passkeyRpName: "Test",
      // Refusal tests share one client id; the limiter test passes its own.
      passkeyLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      uploadLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      // Tests share one client id; the limiter test passes its own.
      notificationEmailLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
      maxBodyBytes: 262_144,
      drainMs: 500,
      log: () => {},
      // Access lines and `error()` go through the structured logger; a test passes its own
      // `logWrite` to read them.
      logWrite: () => {},
      // Tests run queued jobs on demand with `drain()`, never on a background poll.
      jobsWorker: false,
      ...rest,
    })
  } catch (error) {
    await db.cleanup()
    if (storageDir) await rm(storageDir, { recursive: true, force: true })
    throw error
  }
  const stop = app.stop
  return {
    ...app,
    billing: app.billing as MockBillingProvider,
    mailer,
    /** Runs every due job to completion (the worker is not polling in tests). */
    drain: () => app.jobs.drain(),
    stop: async () => {
      await stop()
      await db.cleanup()
      if (storageDir) await rm(storageDir, { recursive: true, force: true })
    },
  }
}

/** The x-api-client-id every test client sends, as `@repo/session` does per session. */
export const CLIENT_ID = "test-client"

/** `locale`, when given, goes out as `x-locale`, as `@repo/session` sends the resolved locale. */
export function clientFor(
  app: { server: { url: URL } },
  sessionToken?: string,
  locale?: string
): ApiClient {
  const headers: Record<string, string> = { ...auth, "x-api-client-id": CLIENT_ID }
  if (sessionToken) headers["x-session-token"] = sessionToken
  if (locale !== undefined) headers["x-locale"] = locale
  return createORPCClient(new RPCLink({ url: new URL("/rpc", app.server.url).href, headers }))
}

/**
 * Waits until `app`'s mailer has captured at least `count` mails to `to` with `subject`, and
 * returns them in order. Selecting by address and subject (never by position in `sent`) keeps an
 * earlier test's mail from being mistaken for this one's. Mail is queued, not sent: each iteration
 * drains first (a no-op once there is nothing due), so a mail.send job that has not run yet is not
 * mistaken for one that will never arrive.
 */
export async function mailsTo(
  app: { mailer: { sent: Sent[] }; drain?: () => Promise<void> },
  to: string,
  subject: string,
  count = 1
) {
  const deadline = Date.now() + 2_000
  for (;;) {
    await app.drain?.()
    const found = app.mailer.sent.filter((m) => m.to === to && m.subject === subject)
    if (found.length >= count) return found
    if (Date.now() > deadline) {
      throw new Error(`expected ${count} "${subject}" mail(s) to ${to}, got ${found.length}`)
    }
    await Bun.sleep(5)
  }
}

let counter = 0
/**
 * Creates an account through the api and returns a client signed in as it. The verify mail is
 * queued, not sent: with a `drain`, this runs the queue so it lands before returning, then waits
 * for it in the mailbox (with a capturing mailer), so a test that clears `sent` afterwards cannot
 * have that mail land in the middle of what it counts.
 */
export async function signUp(
  app: {
    server: { url: URL }
    mailer?: Mailer | ReturnType<typeof captureMailer>
    drain?: () => Promise<void>
  },
  email = `user${++counter}@example.com`
) {
  const anonymous = clientFor(app)
  const { user, session } = await anonymous.auth.signUp({
    email,
    password: "correct horse battery",
  })
  await app.drain?.()
  if (app.mailer && "sent" in app.mailer) {
    const { sent } = app.mailer
    const deadline = Date.now() + 2_000
    while (!sent.some((m) => m.to === email && m.subject === verifyEmailSubject)) {
      if (Date.now() > deadline) throw new Error(`no verify mail for ${email} within 2000 ms`)
      await Bun.sleep(5)
    }
  }
  return { client: clientFor(app, session.token), token: session.token, user, email }
}

/** A verified account (the shape superadmins and invitees need). */
export async function signUpVerified(
  app: {
    server: { url: URL }
    mailer: ReturnType<typeof captureMailer>
    drain?: () => Promise<void>
  },
  email?: string
) {
  const user = await signUp(app, email)
  await verify(app, user.email)
  return user
}

type FakeProfile = Profile | ((input: Parameters<Provider["exchange"]>[0]) => Profile)

/** A provider that never leaves the process: `start` builds a fake URL, `exchange` returns `profile`. */
export function fakeProvider(id: ProviderId, profile: FakeProfile): Provider {
  return {
    id,
    pkce: id === "google",
    start: (state, codeVerifier) =>
      new URL(
        `https://provider.example/${id}?state=${state}${codeVerifier ? `&code_challenge=${codeVerifier}` : ""}`
      ),
    exchange: async (input) => (typeof profile === "function" ? profile(input) : profile),
  }
}

/** Fake providers by id (each with a default verified profile), or by id → profile. */
export function providersWith(
  spec: ProviderId[] | Partial<Record<ProviderId, FakeProfile>>
): Map<ProviderId, Provider> {
  const entries: Array<[ProviderId, FakeProfile]> = Array.isArray(spec)
    ? spec.map((id) => [
        id,
        {
          providerUserId: `${id}-1`,
          email: `${id}@example.com`,
          emailVerified: true,
          name: id,
        },
      ])
    : (Object.entries(spec) as Array<[ProviderId, FakeProfile]>)
  return new Map(entries.map(([id, profile]) => [id, fakeProvider(id, profile)]))
}

/** Confirms `email` through the latest verify link mailed to it, as the auth app would. */
export async function verify(
  app: { server: { url: URL }; mailer: { sent: Sent[] }; drain?: () => Promise<void> },
  email: string
) {
  await app.drain?.()
  const mails = await mailsTo(app, email, verifyEmailSubject)
  const token = mails.at(-1)?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1]
  if (!token) throw new Error(`no verify link for ${email}`)
  await clientFor(app).auth.verifyEmail({ token })
}

/** A verified account with a workspace of its own (as owner): what a notes test needs. */
export async function signUpWithWorkspace(
  app: {
    server: { url: URL }
    mailer: ReturnType<typeof captureMailer>
    drain?: () => Promise<void>
  },
  email?: string
) {
  const user = await signUp(app, email)
  await verify(app, user.email)
  const workspace = await user.client.workspaces.create({ name: "Notes" })
  return { ...user, workspaceId: workspace.id }
}

/**
 * Turns two-step verification on for `userId` straight through the queries (no codes, no mail),
 * encrypted with the test server's default key, and returns the raw TOTP secret so a test can
 * compute codes with `totpCodeAt`. The account has no recovery codes until a test adds some.
 */
export async function enableTwoFactor(
  app: { db: Awaited<ReturnType<typeof start>>["db"] },
  userId: number
): Promise<Uint8Array> {
  const secret = generateTotpSecret()
  const encrypted = await encryptSecret(secret, DEV_TWO_FACTOR_KEY)
  await app.db.twoFactor.setPendingSecret(userId, encrypted)
  await app.db.twoFactor.enable(userId, encrypted, new Date().toISOString(), [])
  return secret
}

/** A sign-in result that must be a session (no two-factor challenge); throws otherwise. */
export function signedIn<T extends SignInResult>(result: T): Exclude<T, { twoFactor: unknown }> {
  if (isTwoFactorChallenge(result))
    throw new Error("expected a session, got a two-factor challenge")
  return result as Exclude<T, { twoFactor: unknown }>
}

/** One parsed SSE frame: a `retry:`, a `: comment`, or an event (`id:` + `event:` + JSON `data:`). */
export type SseFrame =
  | { kind: "retry"; retry: number }
  | { kind: "comment"; text: string }
  | { kind: "event"; id: number; event: string; data: RealtimeEvent | UserRealtimeEvent }

function parseFrame(block: string): SseFrame | null {
  const lines = block.split("\n").filter(Boolean)
  if (lines.length === 0) return null
  if (lines.every((line) => line.startsWith(":"))) {
    return { kind: "comment", text: lines.map((line) => line.slice(1).trim()).join("\n") }
  }
  const fields = new Map<string, string>()
  for (const line of lines) {
    const at = line.indexOf(":")
    fields.set(line.slice(0, at), line.slice(at + 1).replace(/^ /, ""))
  }
  if (fields.has("retry") && !fields.has("data")) {
    return { kind: "retry", retry: Number(fields.get("retry")) }
  }
  return {
    kind: "event",
    id: Number(fields.get("id")),
    event: fields.get("event") ?? "message",
    data: JSON.parse(fields.get("data") ?? "null"),
  }
}

async function readRefusal(response: Response) {
  const text = await response.text()
  try {
    return { text, json: JSON.parse(text) as { code: string; message: string } }
  } catch {
    return { text, json: null }
  }
}

/**
 * Opens `GET /events/workspaces/:workspaceId` as `@repo/session` would (bearer, client id, the
 * session token) and reads its body in the background. A non-200 answer is returned with its body
 * (`text`, and `json` when it parses) and no reader. `waitFor` resolves with the first frame (from the start) matching `match`
 * after `from` frames; `ended` resolves when the server ends the stream.
 */
export function openStream(
  app: { server: { url: URL } },
  input: { token?: string; workspaceId: number | string; clientId?: string }
) {
  return openEventStream(app, `/events/workspaces/${input.workspaceId}`, input)
}

/** Opens `GET /events/me` — the caller's own notification stream — the way `openStream` does. */
export function openUserStream(
  app: { server: { url: URL } },
  input: { token?: string; clientId?: string } = {}
) {
  return openEventStream(app, "/events/me", input)
}

async function openEventStream(
  app: { server: { url: URL } },
  path: string,
  input: { token?: string; clientId?: string }
) {
  const controller = new AbortController()
  const headers: Record<string, string> = {
    ...auth,
    "x-api-client-id": input.clientId ?? CLIENT_ID,
  }
  if (input.token) headers["x-session-token"] = input.token
  const response = await fetch(new URL(path, app.server.url), {
    headers,
    signal: controller.signal,
  })
  // A refusal is JSON in oRPC's error shape, except the two-step 403's plain-text body.
  const refusal = response.ok ? null : await readRefusal(response)
  const frames: SseFrame[] = []
  let done = false
  const ended = (async () => {
    if (!response.ok || !response.body) return
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true })
        let at = buffer.indexOf("\n\n")
        while (at !== -1) {
          const frame = parseFrame(buffer.slice(0, at))
          if (frame) frames.push(frame)
          buffer = buffer.slice(at + 2)
          at = buffer.indexOf("\n\n")
        }
      }
    } catch {
      // Aborted by `close()`, or errored by the server dropping the stream: both count as ended.
    } finally {
      done = true
    }
  })()

  return {
    status: response.status,
    headers: response.headers,
    json: refusal?.json ?? null,
    /** The raw body of a refusal (the two-step 403's is plain text, `two_factor_required`). */
    text: refusal?.text ?? null,
    frames,
    ended,
    isDone: () => done,
    async waitFor(match: (frame: SseFrame) => boolean, { from = 0, timeoutMs = 2_000 } = {}) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const found = frames.slice(from).find(match)
        if (found) return found
        if (Date.now() > deadline) {
          throw new Error(`no matching frame within ${timeoutMs} ms: ${JSON.stringify(frames)}`)
        }
        await Bun.sleep(5)
      }
    },
    /** Disconnects like a closed tab; resolves once the reader has stopped. */
    async close() {
      controller.abort()
      await ended
    },
  }
}

/** Events only, in order — the `data` of every `kind: "event"` frame. */
export const eventsOf = (frames: SseFrame[]) =>
  frames.flatMap((frame) => (frame.kind === "event" ? [frame.data] : []))
