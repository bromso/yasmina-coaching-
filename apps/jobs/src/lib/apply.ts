import { ORPCError } from "@orpc/client"
import {
  type ApiClient,
  CV_UPLOAD_MESSAGE,
  JOBS_RATE_MESSAGE,
  JobApplySchema,
  MAX_CV_BYTES,
  STORAGE_UNAVAILABLE_MESSAGE,
} from "@repo/api-contract"
import { resolveLocaleWithSource } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import type { Job } from "./jobs-core"

const logger = createLogger({ service: "jobs" })

export type ApplyApi = Pick<ApiClient["jobs"], "apply">

/**
 * Builds the api client for one submission, given the request's ip and resolved locale. Injected
 * (rather than a pre-built client) so a test can assert what reaches it — mirrors `apps/help`'s
 * `ContactApiFactory`. The real implementation is `apps/jobs/src/lib/api.ts`'s `anonymousApiFor`.
 */
export type ApplyApiFactory = (
  ip: string | undefined,
  locale: string | undefined
) => Promise<ApplyApi>

export type ApplyDeps = {
  api: ApplyApiFactory
  ip?: string
  locale?: string
  /** Open postings only, from the build — the slug and title the form ever trusts. */
  openJobs: Job[]
}

export type ApplyFormState = FormState & { reference?: string }

/** The English of every outcome but the success message (which also carries the name, role and
 * the address a confirmation was sent to). */
export const UNAVAILABLE = "Applications are unavailable right now. Try again in a moment."
/** A filled honeypot gets this and nothing else — no reference exists for a request never sent. */
export const HONEYPOT_MESSAGE = "Thanks — we've got it."
/** `job` names a posting that is not currently open (or never existed). */
export const JOB_CLOSED_MESSAGE = "This role is no longer open."
/** The required consent checkbox, unchecked. */
export const CONSENT_MESSAGE = "Please agree so we can store your application."
/** The same English text `jobs.apply`'s rate limiter answers with — read from the contract
 * directly rather than the live error: this page never translates (see `apps/help`'s identical
 * `TOO_MANY_REQUESTS` reasoning). */
export const TOO_MANY_REQUESTS = JOBS_RATE_MESSAGE

/** "Thanks, {name} — we've received your application for {role}. We've sent a confirmation to
 * {email}." (spec §2). */
export function applicationSentMessage(name: string, title: string, email: string): string {
  return `Thanks, ${name} — we've received your application for ${title}. We've sent a confirmation to ${email}.`
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/** The uploaded CV from the form; null when no file was chosen (browsers send an empty File). */
function cvFile(fd: FormData): File | null {
  const v = fd.get("cv")
  return v instanceof File && v.size > 0 ? v : null
}

/**
 * The apply form's language: the `locale` cookie, else `Accept-Language`, else nothing — the
 * English default is no real choice to report. Mirrors `apps/help/src/lib/contact.ts`'s
 * `resolveContactLocale` exactly.
 */
export function resolveApplyLocale(signals: {
  cookie?: string | null
  acceptLanguage?: string | null
}): string | undefined {
  const { locale, source } = resolveLocaleWithSource(signals)
  return source === "default" ? undefined : locale
}

/**
 * The apply form's logic, free of Next so it runs under `bun test`. A filled honeypot (`hp_field`)
 * answers success with no api call at all. `job` is checked against `deps.openJobs` before
 * anything else — a closed or unknown slug never reaches the api, and the title that is sent
 * always comes from the build, never from the form. The CV is checked for presence and size
 * before the api ever sees it (as `apps/account`'s avatar action checks `MAX_IMAGE_BYTES`), and
 * the consent checkbox is required — neither is part of `JobApplySchema`, since both are this
 * form's own rules, not the api's.
 */
export async function submitApplicationCore(
  deps: ApplyDeps,
  fd: FormData
): Promise<ApplyFormState> {
  if (str(fd, "hp_field")) {
    logger.info("apply honeypot tripped")
    return { ok: true, message: HONEYPOT_MESSAGE }
  }

  const slug = str(fd, "job")
  const job = deps.openJobs.find((candidate) => candidate.slug === slug)
  if (!job) return { ok: false, fieldErrors: { job: JOB_CLOSED_MESSAGE } }

  const values = {
    name: str(fd, "name"),
    email: str(fd, "email"),
    link: str(fd, "link"),
    note: str(fd, "note"),
    consent: str(fd, "consent"),
  }

  const cv = cvFile(fd)
  if (!cv || cv.size > MAX_CV_BYTES) {
    return { ok: false, fieldErrors: { cv: CV_UPLOAD_MESSAGE }, values }
  }

  if (str(fd, "consent") !== "yes") {
    return { ok: false, fieldErrors: { consent: CONSENT_MESSAGE }, values }
  }

  const parsed = JobApplySchema.safeParse({
    job: job.slug,
    title: job.title,
    name: values.name,
    email: values.email,
    link: values.link || undefined,
    note: values.note || undefined,
    cv,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  }

  let api: ApplyApi
  try {
    api = await deps.api(deps.ip, deps.locale)
  } catch (error) {
    logger.error("building the apply api client failed", { error })
    return { ok: false, message: UNAVAILABLE, values }
  }

  try {
    const { reference } = await api.apply(parsed.data)
    return {
      ok: true,
      message: applicationSentMessage(parsed.data.name, job.title, parsed.data.email),
      reference,
    }
  } catch (error) {
    if (error instanceof ORPCError && error.defined && error.code === "TOO_MANY_REQUESTS") {
      return { ok: false, message: TOO_MANY_REQUESTS, values }
    }
    if (error instanceof ORPCError && error.defined && error.code === "BAD_REQUEST") {
      // The api's message is already translated to the caller's locale (`x-locale`); this page
      // never translates, so it must show its own English text rather than trust the live error
      // — the same reasoning as the `TOO_MANY_REQUESTS` branch above.
      return { ok: false, fieldErrors: { cv: CV_UPLOAD_MESSAGE }, values }
    }
    if (error instanceof ORPCError && error.defined && error.code === "SERVICE_UNAVAILABLE") {
      // Same reasoning as BAD_REQUEST and TOO_MANY_REQUESTS above: the api's own message is
      // already translated, so this page shows its own English constant instead.
      return { ok: false, message: STORAGE_UNAVAILABLE_MESSAGE, values }
    }
    logger.error("jobs.apply failed", { error })
    return { ok: false, message: UNAVAILABLE, values }
  }
}
