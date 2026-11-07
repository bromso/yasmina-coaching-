import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import {
  type ApiClient,
  CV_KEY_PATTERN,
  CV_UPLOAD_MESSAGE,
  JOBS_RATE_MESSAGE,
  JobApplySchema,
  MAX_CV_BYTES,
  STORAGE_UNAVAILABLE_MESSAGE,
} from "@repo/api-contract"
import { jobApplicationReceivedSubject, jobApplicationSubject } from "@repo/email"
import { createMemoryRateLimiter, type RateLimiter } from "@repo/service-kit"
import { SQL } from "bun"
import { submitApplication } from "./applications"
import { applicationsPruneJob } from "./jobs/builtin/applications"
import { TINY_PDF } from "./storage/fixtures"
import { testDatabase } from "./test-db"
import { auth, clientFor, mailsTo, start } from "./test-server"

const HIRING = "hiring@example.com"
const DAY = 24 * 60 * 60 * 1000
const enc = (s: string) => new TextEncoder().encode(s)
const pdf = (bytes: Uint8Array = TINY_PDF, type = "application/pdf") =>
  new File([bytes], "cv.pdf", { type })

let counter = 0
/** A valid application from a fresh address (so the per-recipient limit never carries over). */
function application(patch: Record<string, unknown> = {}) {
  counter += 1
  return {
    job: "senior-engineer",
    title: "Senior Engineer",
    name: "Ada Lovelace",
    email: `Applicant${counter}@Example.com`,
    link: "https://ada.example/portfolio",
    note: "I would love to build engines with you.",
    cv: pdf(),
    ...patch,
  }
}

const open = (): RateLimiter => createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 })
let app: Awaited<ReturnType<typeof start>>
/** A second connection to the server's own database, to back-date a row for the prune test. */
let raw: SQL
let cleanup: () => Promise<void>
const clock = { offset: 0 }

beforeAll(async () => {
  let databaseUrl: string
  if (Bun.env.TEST_DATABASE_URL) {
    const db = await testDatabase()
    databaseUrl = db.url
    cleanup = db.cleanup
  } else {
    const dir = await mkdtemp(join(tmpdir(), "jobs-apply-"))
    databaseUrl = `sqlite://${join(dir, "t.db")}`
    cleanup = () => rm(dir, { recursive: true, force: true })
  }
  app = await start({
    databaseUrl,
    hiringEmail: HIRING,
    supportEmail: "help@example.com",
    jobsLimiter: open(),
    jobsRecipientLimiter: open(),
    jobsGlobalLimiter: open(),
    now: () => new Date(Date.now() + clock.offset),
  })
  raw = new SQL(databaseUrl)
})
afterAll(async () => {
  await app.stop()
  await raw.close()
  await cleanup()
})

const idOf = (reference: string) => Number(reference.replace(/^JOB-/, ""))

async function storedCvs(): Promise<string[]> {
  const keys: string[] = []
  for await (const object of app.storage.list("applications/")) keys.push(object.key)
  return keys.sort()
}

/** Expects `promise` to be refused with `code` (and `message`, when given). */
async function refused(promise: Promise<unknown>, code: string, message?: string) {
  const [error] = await safe(promise)
  expect(error).toMatchObject({ code, ...(message === undefined ? {} : { message }) })
}

describe("jobs.apply", () => {
  test("a tiny PDF is accepted: row, private CV and both mails", async () => {
    const input = application()
    const before = Date.now()
    const { reference } = await clientFor(app, undefined, "sv").jobs.apply(input)
    expect(reference).toMatch(/^JOB-\d+$/)
    const row = await app.db.applications.find(idOf(reference))
    expect(row).toMatchObject({
      job_slug: "senior-engineer",
      job_title: "Senior Engineer",
      name: "Ada Lovelace",
      email: input.email.toLowerCase(),
      link: "https://ada.example/portfolio",
      note: input.note,
      ip_hash: "test-client",
      status: "new",
      status_changed_at: null,
      status_changed_by: null,
    })
    if (!row) throw new Error("no row")
    expect(row.cv_key).toMatch(CV_KEY_PATTERN)
    const stored = await app.storage.get(row.cv_key)
    expect(stored?.contentType).toBe("application/pdf")
    expect([...(stored?.body ?? [])]).toEqual([...TINY_PDF])
    // Six months on, give or take the month lengths in between.
    const kept = Date.parse(row.delete_after) - before
    expect(kept).toBeGreaterThan(180 * DAY)
    expect(kept).toBeLessThan(185 * DAY)

    const [toHiring] = await mailsTo(app, HIRING, jobApplicationSubject(reference, input.title))
    expect(toHiring?.replyTo).toBe(input.email.toLowerCase())
    expect(toHiring?.text).toContain("http://auth.example.com/admin/applications")
    expect(toHiring?.text).toContain(input.note)
    expect(toHiring?.text).toContain("Ada Lovelace")

    // The confirmation is in the request's locale (Swedish here), so not the English subject.
    await app.drain()
    const copy = app.mailer.sent.filter((m) => m.to === input.email.toLowerCase())
    expect(copy).toHaveLength(1)
    expect(copy[0]?.subject).not.toBe(jobApplicationReceivedSubject(reference))
    expect(copy[0]?.subject).toContain(reference)
    expect(copy[0]?.replyTo).toBe(HIRING)
    // Only the role title and the reference: never the applicant's name, note or link.
    for (const part of [copy[0]?.text ?? "", copy[0]?.html ?? ""]) {
      expect(part).toContain("Senior Engineer")
      expect(part).not.toContain("Ada Lovelace")
      expect(part).not.toContain("build engines")
      expect(part).not.toContain("ada.example")
    }
  })

  test("without x-locale the confirmation is in English", async () => {
    const input = application()
    const { reference } = await clientFor(app).jobs.apply(input)
    const [copy] = await mailsTo(
      app,
      input.email.toLowerCase(),
      jobApplicationReceivedSubject(reference)
    )
    expect(copy?.replyTo).toBe(HIRING)
  })

  test("HTML, a zip or an executable sent as application/pdf is refused; nothing is written", async () => {
    await app.drain()
    const cvsBefore = await storedCvs()
    const mailsBefore = app.mailer.sent.length
    for (const body of [
      enc("<!doctype html><script>alert(1)</script>\n%%EOF"),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc("zip%%EOF")]),
      new Uint8Array([0x4d, 0x5a, 0x90, 0x00, ...enc("exe%%EOF")]),
    ]) {
      const input = application({ cv: pdf(body) })
      await refused(clientFor(app).jobs.apply(input), "BAD_REQUEST", CV_UPLOAD_MESSAGE)
      expect(await app.db.applications.list({ job: "senior-engineer", limit: 1000 })).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ email: input.email.toLowerCase() })])
      )
    }
    await app.drain()
    expect(await storedCvs()).toEqual(cvsBefore)
    expect(app.mailer.sent.length).toBe(mailsBefore)
  })

  test("a PDF header without %%EOF near the end is refused", async () => {
    const cvsBefore = await storedCvs()
    const noEof = new Uint8Array([...enc("%PDF-1.4\n%%EOF"), ...new Uint8Array(2048)])
    for (const body of [enc("%PDF-1.4\nno trailer"), noEof]) {
      await refused(
        clientFor(app).jobs.apply(application({ cv: pdf(body) })),
        "BAD_REQUEST",
        CV_UPLOAD_MESSAGE
      )
    }
    expect(await storedCvs()).toEqual(cvsBefore)
  })

  test("a CV over 5 MB passes the body cap but is refused before storage", async () => {
    const cvsBefore = await storedCvs()
    const big = new Uint8Array(MAX_CV_BYTES + 1)
    big.set(TINY_PDF)
    big.set(enc("%%EOF"), big.length - 6)
    await refused(
      clientFor(app).jobs.apply(application({ cv: pdf(big) })),
      "BAD_REQUEST",
      CV_UPLOAD_MESSAGE
    )
    expect(await storedCvs()).toEqual(cvsBefore)
  })

  test("a 5 MB CV is accepted (the body cap leaves room for it and the fields)", async () => {
    const max = new Uint8Array(MAX_CV_BYTES)
    max.set(TINY_PDF)
    max.set(enc("%%EOF"), max.length - 6)
    const { reference } = await clientFor(app).jobs.apply(application({ cv: pdf(max) }))
    const row = await app.db.applications.find(idOf(reference))
    expect((await app.storage.get(row?.cv_key ?? ""))?.size).toBe(MAX_CV_BYTES)
  })

  test("a body over 6 MB is 413, over either transport", async () => {
    for (const path of ["/rpc/jobs/apply", "/openapi/jobs/apply"]) {
      const res = await fetch(new URL(path, app.server.url), {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: "x".repeat(7 * 1024 * 1024),
      })
      expect({ path, status: res.status }).toEqual({ path, status: 413 })
    }
  })

  test("each invalid field is BAD_REQUEST and stores nothing; a bad link is dropped", async () => {
    const cvsBefore = await storedCvs()
    for (const patch of [
      { job: "Senior Engineer" },
      { job: "../etc" },
      { title: "" },
      { title: "x".repeat(201) },
      { name: "" },
      { name: "x".repeat(101) },
      { email: "nope" },
      { note: "x".repeat(3001) },
    ]) {
      const [error] = await safe(clientFor(app).jobs.apply(application(patch)))
      expect({ patch, code: (error as { code?: string })?.code }).toEqual({
        patch,
        code: "BAD_REQUEST",
      })
    }
    expect(await storedCvs()).toEqual(cvsBefore)

    for (const link of [
      "http://ada.example",
      "javascript:alert(1)",
      `https://a.example/${"a".repeat(300)}`,
    ]) {
      const { reference } = await clientFor(app).jobs.apply(application({ link }))
      expect((await app.db.applications.find(idOf(reference)))?.link).toBeNull()
    }
    const { link: _link, note: _note, ...bare } = application()
    const { reference } = await clientFor(app).jobs.apply(bare)
    expect(await app.db.applications.find(idOf(reference))).toMatchObject({
      link: null,
      note: null,
    })
  })

  test("a failed commit queues the written CV for deletion", async () => {
    await app.drain()
    const cvsBefore = await storedCvs()
    const failure = new Error("commit failed")
    // The real storage and queue, with a database whose transaction fails: the CV is written
    // before the transaction, so it must be queued for deletion and the error passed on.
    const context = {
      db: { ...app.db, transaction: () => Promise.reject(failure) },
      storage: app.storage,
      enqueue: app.enqueue,
      locale: "en" as const,
      requestedLocale: null,
      clientId: "test-client",
      hiringEmail: HIRING,
      authUrl: "http://auth.example.com",
      recordFailure: app.recordFailure,
    }
    const input = JobApplySchema.parse(application())
    await expect(submitApplication(context, input)).rejects.toBe(failure)
    await app.drain()
    expect(await storedCvs()).toEqual(cvsBefore)
  })

  test("a storage failure on the CV is the declared 503, recorded; no row, no mail", async () => {
    await app.drain()
    const failures: string[] = []
    const before = await raw`SELECT COUNT(*) AS n FROM job_applications`
    const context = {
      db: app.db,
      storage: {
        ...app.storage,
        put: () => Promise.reject(new Error("bucket unreachable")),
      },
      enqueue: app.enqueue,
      locale: "en" as const,
      requestedLocale: null,
      clientId: "test-client",
      hiringEmail: HIRING,
      authUrl: "http://auth.example.com",
      recordFailure: (message: string) => failures.push(message),
    }
    const input = JobApplySchema.parse(application())
    const [error] = await safe(submitApplication(context, input))
    expect(error).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      status: 503,
      message: STORAGE_UNAVAILABLE_MESSAGE,
    })
    expect(failures).toEqual(["storage write failed"])
    const after = await raw`SELECT COUNT(*) AS n FROM job_applications`
    expect(Number(after[0].n)).toBe(Number(before[0].n))
  })

  test("files.get never serves a CV, by any key", async () => {
    const { reference } = await clientFor(app).jobs.apply(application())
    const key = (await app.db.applications.find(idOf(reference)))?.cv_key ?? ""
    expect(key).toMatch(CV_KEY_PATTERN)
    const [error, file] = await safe(clientFor(app).files.get({ key }))
    expect(file).toBeUndefined()
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    const res = await fetch(new URL(`/openapi/files/${key}`, app.server.url), { headers: auth })
    expect(res.status).toBe(400)
    expect(res.headers.get("content-type")).not.toContain("pdf")
  })
})

describe("jobs.apply limits", () => {
  /** A server whose `which` limiter allows one application; the others stay open. */
  async function limited(which: "jobsLimiter" | "jobsRecipientLimiter" | "jobsGlobalLimiter") {
    const one = createMemoryRateLimiter({ limit: 1, windowMs: 60_000 })
    return start({
      jobsLimiter: open(),
      jobsRecipientLimiter: open(),
      jobsGlobalLimiter: open(),
      [which]: one,
    })
  }
  const withClientId = (target: { server: { url: URL } }, clientId: string): ApiClient =>
    createORPCClient(
      new RPCLink({
        url: new URL("/rpc", target.server.url).href,
        headers: { ...auth, "x-api-client-id": clientId },
      })
    )

  test("per client: a second application from the same client id is refused", async () => {
    const server = await limited("jobsLimiter")
    try {
      await withClientId(server, "anon:a").jobs.apply(application())
      await refused(
        withClientId(server, "anon:a").jobs.apply(application()),
        "TOO_MANY_REQUESTS",
        JOBS_RATE_MESSAGE
      )
      await withClientId(server, "anon:b").jobs.apply(application())
    } finally {
      await server.stop()
    }
  })

  test("per recipient: a second application to the same address is refused, from any client", async () => {
    const server = await limited("jobsRecipientLimiter")
    try {
      const first = application()
      await withClientId(server, "anon:a").jobs.apply(first)
      await refused(
        withClientId(server, "anon:b").jobs.apply({
          ...application(),
          email: first.email.toUpperCase(),
        }),
        "TOO_MANY_REQUESTS",
        JOBS_RATE_MESSAGE
      )
      await withClientId(server, "anon:b").jobs.apply(application())
    } finally {
      await server.stop()
    }
  })

  test("api-wide: rotating client ids and addresses still trip the global cap; nothing stored", async () => {
    const server = await limited("jobsGlobalLimiter")
    try {
      await withClientId(server, "anon:a").jobs.apply(application())
      await refused(
        withClientId(server, "anon:b").jobs.apply(application()),
        "TOO_MANY_REQUESTS",
        JOBS_RATE_MESSAGE
      )
      expect(await server.db.applications.list({})).toHaveLength(1)
      const keys: string[] = []
      for await (const object of server.storage.list("applications/")) keys.push(object.key)
      expect(keys).toHaveLength(1)
    } finally {
      await server.stop()
    }
  })

  test("the defaults: 3 per client per hour", async () => {
    const server = await start({ jobsRecipientLimiter: open(), jobsGlobalLimiter: open() })
    try {
      for (let i = 0; i < 3; i++) await clientFor(server).jobs.apply(application())
      await refused(clientFor(server).jobs.apply(application()), "TOO_MANY_REQUESTS")
    } finally {
      await server.stop()
    }
  })

  test("the defaults: 3 per address per day", async () => {
    const server = await start({ jobsLimiter: open(), jobsGlobalLimiter: open() })
    try {
      const email = application().email
      for (let i = 0; i < 3; i++) await clientFor(server).jobs.apply(application({ email }))
      await refused(clientFor(server).jobs.apply(application({ email })), "TOO_MANY_REQUESTS")
    } finally {
      await server.stop()
    }
  })
})

describe("applications.prune", () => {
  test("deletes applications past delete_after and their CVs; keeps the rest", async () => {
    const expired = await clientFor(app).jobs.apply(application())
    const kept = await clientFor(app).jobs.apply(application())
    await app.drain()
    const expiredRow = await app.db.applications.find(idOf(expired.reference))
    const keptRow = await app.db.applications.find(idOf(kept.reference))
    if (!expiredRow || !keptRow) throw new Error("no rows")
    await raw.unsafe(
      `UPDATE job_applications SET delete_after = '2026-01-01T00:00:00.000Z' WHERE id = ${expiredRow.id}`
    )

    await app.enqueue(applicationsPruneJob, {})
    await app.drain()

    expect(await app.db.applications.find(expiredRow.id)).toBeUndefined()
    expect(await app.storage.get(expiredRow.cv_key)).toBeNull()
    expect(await app.db.applications.find(keptRow.id)).toBeDefined()
    expect(await app.storage.get(keptRow.cv_key)).not.toBeNull()
  })

  test("six months on, the worker's clock expires everything sent today", async () => {
    const { reference } = await clientFor(app).jobs.apply(application())
    const row = await app.db.applications.find(idOf(reference))
    if (!row) throw new Error("no row")
    clock.offset = 190 * DAY
    try {
      await app.enqueue(applicationsPruneJob, {})
      await app.drain()
    } finally {
      clock.offset = 0
    }
    expect(await app.db.applications.find(row.id)).toBeUndefined()
    expect(await app.storage.get(row.cv_key)).toBeNull()
  })
})
