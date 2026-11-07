import { randomBytes } from "node:crypto"
import { ORPCError } from "@orpc/server"
import {
  APPLICATION_RETENTION_MONTHS,
  type JobApplySchema,
  jobReference,
  MAX_CV_BYTES,
} from "@repo/api-contract"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import type { z } from "zod"
import type { Db } from "./db"
import { apiMessage } from "./i18n"
import { enqueueMail } from "./jobs/builtin/mail"
import { enqueueStorageDelete } from "./jobs/builtin/storage"
import type { Enqueue } from "./jobs/enqueue"
import { CvRejected, validatePdf } from "./storage/pdf"
import type { Storage } from "./storage/storage"
import { putOrUnavailable } from "./uploads"

/** A fresh, unguessable key for a CV: `applications/<random>.pdf` (`CV_KEY_PATTERN`). */
export const newCvKey = () => `applications/${randomBytes(16).toString("base64url")}.pdf`

/** When an application sent at `now` is deleted by `applications.prune`: six months later. */
export function deleteAfter(now: Date): string {
  const at = new Date(now.getTime())
  at.setUTCMonth(at.getUTCMonth() + APPLICATION_RETENTION_MONTHS)
  return at.toISOString()
}

type ApplyContext = {
  db: Db
  storage: Storage
  enqueue: Enqueue
  /** The language a refusal answers in. */
  locale: Locale
  /** The supported locale the request named, or null: the applicant's confirmation uses it. */
  requestedLocale: Locale | null
  /** The x-api-client-id (an ip hash), stored for abuse review. */
  clientId: string | null
  hiringEmail: string
  authUrl: string
  /** For a failed `storage.delete` enqueue: logs it and records it as a `server` row. */
  recordFailure: (message: string, error: unknown) => void
}

/**
 * Stores one application (`jobs.apply`, after its limits): the CV is checked as a PDF before
 * anything is written (size first, from `File.size`, so an oversized file is never read), stored
 * under a fresh key, then one transaction inserts the row and queues both mails — to the hiring
 * inbox (`Reply-To:` the applicant) and the confirmation to the applicant (the role title and the
 * reference only, `Reply-To:` the hiring inbox). If that transaction fails, the CV just written is
 * queued for `storage.delete` and the error rethrown, so a CV never outlives its row for long (the
 * nightly `storage.sweep` catches a failed enqueue).
 */
export async function submitApplication(
  context: ApplyContext,
  input: z.output<typeof JobApplySchema>
): Promise<{ reference: string }> {
  let bytes: Uint8Array
  try {
    if (input.cv.size > MAX_CV_BYTES) throw new CvRejected("too large")
    bytes = new Uint8Array(await input.cv.arrayBuffer())
    validatePdf(bytes)
  } catch (error) {
    if (!(error instanceof CvRejected)) throw error
    throw new ORPCError("BAD_REQUEST", { message: apiMessage(context, "cvUpload") })
  }
  const cvKey = newCvKey()
  await putOrUnavailable(context, cvKey, bytes, "application/pdf")
  const now = new Date()
  const link = input.link ?? null
  const note = input.note || null
  try {
    return await context.db.transaction(async (tx) => {
      const { id } = await tx.applications.create({
        jobSlug: input.job,
        jobTitle: input.title,
        name: input.name,
        email: input.email,
        link,
        note,
        cvKey,
        ipHash: context.clientId,
        createdAt: now.toISOString(),
        deleteAfter: deleteAfter(now),
      })
      const reference = jobReference(id)
      // To the hiring team, in English (an internal mail); replying reaches the applicant.
      await enqueueMail(
        context.enqueue,
        "jobApplication",
        context.hiringEmail,
        {
          reference,
          title: input.title,
          name: input.name,
          email: input.email,
          link: link ?? undefined,
          note: note ?? undefined,
          adminUrl: `${context.authUrl}/admin/applications`,
        },
        { tx, replyTo: input.email }
      )
      // Only the role title and the reference: the address is whatever was typed, so the copy
      // never repeats the applicant's text (that would make it an open, branded relay).
      await enqueueMail(
        context.enqueue,
        "jobApplicationReceived",
        input.email,
        { reference, title: input.title },
        {
          tx,
          locale: context.requestedLocale ?? DEFAULT_LOCALE,
          replyTo: context.hiringEmail,
        }
      )
      return { reference }
    })
  } catch (error) {
    // The commit failed: queue the CV just written for deletion, but never let a failure to even
    // queue that cleanup replace the real error.
    await enqueueStorageDelete(context.enqueue, cvKey).catch((e) =>
      context.recordFailure("storage.delete enqueue failed", e)
    )
    throw error
  }
}
