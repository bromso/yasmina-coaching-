import { EmailSchema } from "@repo/api-contract"
import { emails } from "@repo/email"
import { DEFAULT_LOCALE, isLocale, type Locale } from "@repo/i18n/locales"
import { z } from "zod"
import { maskEmail } from "../../mail/mailer"
import { defineJob } from "../define"
import type { Enqueue, EnqueueOptions } from "../enqueue"

export type MailTemplate = keyof typeof emails

const MAIL_TEMPLATE_NAMES = Object.keys(emails) as [MailTemplate, ...MailTemplate[]]

export type MailPayload = {
  template: MailTemplate
  to: string
  props: Record<string, unknown>
  idempotencyKey?: string
  /**
   * The recipient's language, validated with `isLocale` in `run` below rather than by the schema:
   * optional (and typed as a plain string here) so a job queued before this field existed, or
   * holding a locale this deploy dropped, still runs — both fall back to English at run time
   * instead of the schema rejecting the row outright.
   */
  locale?: string
  /** Forwarded to the mailer's `Message.replyTo` (e.g. a support request's own address). */
  replyTo?: string
  /**
   * Forwarded to the mailer's `Message.headers`: only an optional notification mail sets it
   * (`List-Unsubscribe` / `List-Unsubscribe-Post`, see apps/api/src/notification-email.ts).
   */
  headers?: Record<string, string>
}

const payload: z.ZodType<MailPayload> = z.object({
  template: z.enum(MAIL_TEMPLATE_NAMES),
  to: z.string(),
  props: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().optional(),
  locale: z.string().optional(),
  replyTo: EmailSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
})

/** Renders and sends one mail: every `detach`ed send in router.ts becomes this job instead. */
export const sendMailJob = defineJob<MailPayload>({
  name: "mail.send",
  payload,
  maxAttempts: 5,
  run: async (job, ctx) => {
    const locale = isLocale(job.locale) ? job.locale : DEFAULT_LOCALE
    const mail = await emails[job.template](job.props as never, locale)
    await ctx.mailer.send({
      to: job.to,
      ...mail,
      idempotencyKey: job.idempotencyKey,
      replyTo: job.replyTo,
      ...(job.headers ? { headers: job.headers } : {}),
    })
    ctx.log(`mail sent ${job.template} to ${maskEmail(job.to)}`, undefined)
  },
})

/**
 * Typed helper over `enqueue`: `props` is checked against the template's own props type at
 * compile time instead of the job's erased `Record<string, unknown>`. `idempotencyKey` reaches
 * the mailer (so a provider that supports it can drop a retried duplicate) and, unless the caller
 * gives its own `dedupeKey`, doubles as the job's dedupe key too — the two are usually the same
 * value (e.g. `verify:<user>:<hash>`): the same mail enqueued twice joins one row instead of
 * sending twice. `locale` is the recipient's language; omitted (or invalid once run) it renders in
 * English — see `MailPayload.locale`. `replyTo` and `headers` reach the mailer unchanged — see
 * `MailPayload`.
 */
export function enqueueMail<T extends MailTemplate>(
  enqueue: Enqueue,
  template: T,
  to: string,
  props: Parameters<(typeof emails)[T]>[0],
  options?: EnqueueOptions & {
    idempotencyKey?: string
    locale?: Locale
    replyTo?: string
    headers?: Record<string, string>
  }
): Promise<number> {
  const { idempotencyKey, locale, replyTo, headers, ...enqueueOptions } = options ?? {}
  return enqueue(
    sendMailJob,
    {
      template,
      to,
      props: props as Record<string, unknown>,
      idempotencyKey,
      locale,
      replyTo,
      ...(headers ? { headers } : {}),
    },
    { ...enqueueOptions, dedupeKey: enqueueOptions.dedupeKey ?? idempotencyKey }
  )
}
