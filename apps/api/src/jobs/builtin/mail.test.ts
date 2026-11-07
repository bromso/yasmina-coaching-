import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyEmailSubject } from "@repo/email"
import { translatorFor } from "@repo/i18n/translate"
import { storeAnalyticsProvider } from "../../analytics/providers/provider"
import { createDb, type Db } from "../../db"
import type { Mailer } from "../../mail/mailer"
import { memoryBroadcaster } from "../../realtime/memory"
import { localStorage } from "../../storage/local"
import { storeProvider } from "../../telemetry/store"
import { engines, testDatabase } from "../../test-db"
import { captureMailer } from "../../test-server"
import { createEnqueue } from "../enqueue"
import { createWorker } from "../worker"
import { enqueueMail, sendMailJob } from "./mail"

const T0 = new Date("2026-10-06T12:00:00.000Z")
const HOUR = 3_600_000

for (const engine of engines) {
  describe(`mail.send on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0).reverse()) await c()
    })

    /** A tempfile SQLite database (so a raw connection would see the rows too), or a throwaway Postgres. */
    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "mail-job-test-")) : null
      const tdb = dir
        ? {
            url: `sqlite://${join(dir, "t.db")}`,
            cleanup: async () => rmSync(dir, { recursive: true, force: true }),
          }
        : await testDatabase(engine)
      const db = createDb(tdb.url)
      await db.migrate()
      cleanups.push(async () => {
        await db.close()
        await tdb.cleanup()
      })
      return { db }
    }

    /** A worker over `db` with an injectable clock, wired to a capturing mailer over `inner`. */
    function setup(db: Db, inner?: Mailer) {
      const clock = { at: T0 }
      const logs: string[] = []
      const failures: string[] = []
      const log = (message: string) => void logs.push(message)
      const recordFailure = (message: string) => void failures.push(message)
      const mailer = captureMailer(inner)
      const worker = createWorker({
        db,
        context: {
          db,
          mailer,
          storage: localStorage(join(tmpdir(), "mail-job-test-unused")),
          log,
          recordFailure,
          telemetry: storeProvider,
          analyticsRetentionDays: 90,
          backupRetentionDays: 14,
          broadcaster: memoryBroadcaster(() => {}),
          auditPiiRetentionDays: 90,
          auditRetentionDays: 365,
          accountUrl: "http://account.example.com",
          storagePublicUrl: null,
          billing: { kind: "mock" as const, cancelSubscription: async () => {} },
          twoFactorKey: "unused",
          webhookResolve: async () => [],
          webhookAllowLocalhostHttp: false,
          analytics: storeAnalyticsProvider,
          enqueue: async () => 0,
        },
        jobs: [sendMailJob],
        schedules: [],
        concurrency: 4,
        pollMs: 10,
        now: () => clock.at,
        log,
        recordFailure,
      })
      cleanups.push(() => worker.stop(1_000))
      const enqueue = createEnqueue({ db, now: () => clock.at, nudge: worker.nudge })
      const advance = (ms: number) => {
        clock.at = new Date(clock.at.getTime() + ms)
      }
      return { worker, enqueue, mailer, clock, advance, logs, failures }
    }

    test("a queued mail.send, drained, sends the rendered template and logs the masked line", async () => {
      const { db } = await fresh()
      const { worker, enqueue, mailer, logs } = setup(db)
      await enqueueMail(enqueue, "verifyEmail", "ada@example.com", {
        name: "Ada",
        link: "https://auth.example.com/verify-email?token=abc",
      })
      await worker.drain()
      expect(mailer.sent).toHaveLength(1)
      expect(mailer.sent[0]).toMatchObject({ to: "ada@example.com", subject: verifyEmailSubject })
      expect(mailer.sent[0]?.text).toContain("https://auth.example.com/verify-email?token=abc")
      expect(logs).toContain("mail sent verifyEmail to a***@example.com")
    })

    test("a mail enqueued with replyTo reaches the mailer unchanged", async () => {
      const { db } = await fresh()
      const { worker, enqueue, mailer } = setup(db)
      await enqueueMail(
        enqueue,
        "verifyEmail",
        "ada@example.com",
        { name: "Ada", link: "https://auth.example.com/verify-email?token=abc" },
        { replyTo: "support@example.com" }
      )
      await worker.drain()
      expect(mailer.sent).toHaveLength(1)
      expect(mailer.sent[0]?.replyTo).toBe("support@example.com")
    })

    test("a mail enqueued with no replyTo reaches the mailer with it absent", async () => {
      const { db } = await fresh()
      const { worker, enqueue, mailer } = setup(db)
      await enqueueMail(enqueue, "verifyEmail", "ada@example.com", {
        name: "Ada",
        link: "https://auth.example.com/verify-email?token=abc",
      })
      await worker.drain()
      expect(mailer.sent[0]?.replyTo).toBeUndefined()
    })

    test("a mail enqueued with locale: 'sv' renders in Swedish", async () => {
      const { db } = await fresh()
      const { worker, enqueue, mailer } = setup(db)
      await enqueueMail(
        enqueue,
        "verifyEmail",
        "ada@example.com",
        { name: "Ada", link: "https://auth.example.com/verify-email?token=abc" },
        { locale: "sv" }
      )
      await worker.drain()
      expect(mailer.sent).toHaveLength(1)
      expect(mailer.sent[0]?.subject).not.toBe(verifyEmailSubject)
      expect(mailer.sent[0]?.subject).toBe(translatorFor("sv", "email")("verifyEmail.subject"))
      expect(mailer.sent[0]?.text).toContain("https://auth.example.com/verify-email?token=abc")
    })

    test("a mail enqueued with no locale (queued before this deploy) still renders in English", async () => {
      const { db } = await fresh()
      const { worker, enqueue, mailer } = setup(db)
      // Simulates a row written before `locale` existed: the job payload simply lacks the field.
      await enqueue(sendMailJob, {
        template: "verifyEmail",
        to: "ada@example.com",
        props: { name: "Ada", link: "https://auth.example.com/verify-email?token=abc" },
      })
      await worker.drain()
      expect(mailer.sent[0]?.subject).toBe(verifyEmailSubject)
    })

    test("an unsupported locale on the payload falls back to English rather than failing the job", async () => {
      const { db } = await fresh()
      const { worker, enqueue, mailer } = setup(db)
      await enqueue(sendMailJob, {
        template: "verifyEmail",
        to: "ada@example.com",
        props: { name: "Ada", link: "https://auth.example.com/verify-email?token=abc" },
        locale: "xx",
      })
      await worker.drain()
      expect(mailer.sent[0]?.subject).toBe(verifyEmailSubject)
    })

    test("a mailer failing twice then working → sent on attempt 3", async () => {
      const { db } = await fresh()
      let calls = 0
      const flakyMailer: Mailer = {
        kind: "log",
        send: async (_message) => {
          calls++
          if (calls < 3) throw new Error(`still down (${calls})`)
        },
      }
      const { worker, enqueue, mailer, advance, failures } = setup(db, flakyMailer)
      await enqueue(sendMailJob, {
        template: "verifyEmail",
        to: "ada@example.com",
        props: { name: "Ada", link: "https://auth.example.com/verify" },
      })
      await worker.drain()
      expect(calls).toBe(1)
      advance(HOUR)
      await worker.drain()
      expect(calls).toBe(2)
      advance(HOUR)
      await worker.drain()
      expect(calls).toBe(3)
      // captureMailer records every attempt, failed ones included: three calls, one that lands.
      expect(mailer.sent).toHaveLength(3)
      expect(mailer.sent.at(-1)).toMatchObject({ to: "ada@example.com" })
      expect((await db.jobs.counts()).succeeded).toBe(1)
      expect(failures).toEqual([])
    })

    test("a mailer always failing → dead after 5, the error masked", async () => {
      const { db } = await fresh()
      const alwaysFails: Mailer = {
        kind: "log",
        send: async (message) => {
          throw new Error(`550 ${message.to} rejected`)
        },
      }
      const { worker, enqueue, advance, failures } = setup(db, alwaysFails)
      await enqueueMail(enqueue, "verifyEmail", "ada@example.com", {
        name: "Ada",
        link: "https://auth.example.com/verify",
      })
      for (let i = 0; i < 5; i++) {
        await worker.drain()
        advance(HOUR)
      }
      expect((await db.jobs.counts()).dead).toBe(1)
      expect(failures).toEqual(["job mail.send died"])
    })

    test("an invitation created in a transaction that rolls back leaves no mail.send row", async () => {
      const { db } = await fresh()
      const owner = await db.users.create({
        email: "owner@example.com",
        passwordHash: null,
        name: "Owner",
      })
      const workspace = await db.workspaces.create({
        name: "Acme",
        slug: "acme",
        createdBy: owner.id,
      })
      const enqueue = createEnqueue({ db })
      await expect(
        db.transaction(async (tx) => {
          await tx.invitations.create({
            workspaceId: workspace.id,
            email: "invitee@example.com",
            role: "member",
            tokenHash: "x".repeat(64),
            invitedBy: owner.id,
            expiresAt: new Date(T0.getTime() + HOUR).toISOString(),
          })
          await enqueueMail(
            enqueue,
            "invitation",
            "invitee@example.com",
            {
              workspaceName: workspace.name,
              inviterName: owner.name,
              role: "member",
              link: "https://app.example.com/invitations/x",
            },
            { tx }
          )
          // The seat check (or any other post-insert failure) rolls the whole thing back.
          throw new Error("seat check failed")
        })
      ).rejects.toThrow("seat check failed")
      expect(await db.jobs.counts()).toEqual({ queued: 0, running: 0, succeeded: 0, dead: 0 })
      const invitations = await db.invitations.listPending(workspace.id, T0.toISOString())
      expect(invitations).toEqual([])
    })

    test("an unverified-account purge that rolls back leaves neither the purge nor the mail.send row", async () => {
      const { db } = await fresh()
      const squatter = await db.users.create({
        email: "squat@example.com",
        passwordHash: "some-hash",
        name: "Squatter",
      })
      const enqueue = createEnqueue({ db })
      const at = T0.toISOString()
      // Mirrors router.ts's purgeUnverifiedAccount: clear the password, mark verified, and
      // enqueue the account-reset mail, all inside one transaction.
      await expect(
        db.transaction(async (tx) => {
          await tx.users.update(squatter.id, { passwordHash: null })
          await tx.users.markEmailVerified(squatter.id, at)
          await enqueueMail(
            enqueue,
            "accountReset",
            squatter.email,
            { name: squatter.name || undefined, accountUrl: "https://account.example.com" },
            { tx }
          )
          // A failure discovered after the enqueue (e.g. a later step in the real purge) rolls
          // everything in this transaction back together.
          throw new Error("purge aborted")
        })
      ).rejects.toThrow("purge aborted")
      expect(await db.jobs.counts()).toEqual({ queued: 0, running: 0, succeeded: 0, dead: 0 })
      const row = await db.users.find(squatter.id)
      expect(row?.password_hash).toBe("some-hash")
      expect(row?.email_verified_at).toBeNull()
    })
  })
}
