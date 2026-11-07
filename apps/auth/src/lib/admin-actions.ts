import { ORPCError } from "@orpc/client"
import {
  APPLICATION_STATUSES,
  type ApiClient,
  type ApplicationStatus,
  ImpersonateSchema,
  type Me,
  RemovePasskeysSchema,
  ResetTwoFactorSchema,
  SuspendUserSchema,
  UnsuspendUserSchema,
} from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"

const logger = createLogger({ service: "auth" })

export type { FormState }

export type AdminApi = {
  users: Pick<ApiClient["admin"]["users"], "impersonate" | "revokeSessions">
}
export type ResetTwoFactorDeps = {
  api: { users: Pick<ApiClient["admin"]["users"], "resetTwoFactor"> }
}
export type RemovePasskeysDeps = {
  api: { users: Pick<ApiClient["admin"]["users"], "removePasskeys"> }
}
export type SuspendDeps = { api: { users: Pick<ApiClient["admin"]["users"], "suspend"> } }
export type UnsuspendDeps = { api: { users: Pick<ApiClient["admin"]["users"], "unsuspend"> } }
export type ImpersonateDeps = {
  api: AdminApi
  startImpersonation(session: { token: string; expiresAt: string }): Promise<void>
  appUrl: string
  client: { userAgent?: string; ip?: string }
}
export type StopDeps = {
  api: Pick<ApiClient["admin"], "stopImpersonation">
  /** Restores the parked admin token; false when there was none (then the browser is signed out). */
  endImpersonation(): Promise<boolean>
  /** Who was being impersonated, for the redirect back to their page. */
  impersonatedUserId: number | null
}
export type RevokeDeps = { api: AdminApi }
export type JobActionDeps = { api: { jobs: Pick<ApiClient["admin"]["jobs"], "retry" | "discard"> } }
export type SupportActionDeps = {
  api: { support: Pick<ApiClient["admin"]["support"], "resolve" | "reopen"> }
}
export type ApplicationActionDeps = {
  api: { applications: Pick<ApiClient["admin"]["applications"], "setStatus" | "delete"> }
}

export const UNAVAILABLE = "The admin service is unavailable right now. Try again in a moment."

/** A form field as a string (empty when missing or a file). Shared with the booking cores. */
export const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/**
 * A declared api error with one of the given codes, else undefined (anything else is "unavailable").
 * NOT_FOUND counts even undeclared: the `superadmin` middleware throws it for a caller who is no
 * longer an admin, and that caller should read "Not found", not an outage.
 */
export function apiError(error: unknown, codes: string[]) {
  if (!(error instanceof ORPCError) || !codes.includes(error.code)) return undefined
  return error.defined || error.code === "NOT_FOUND" ? error : undefined
}

export async function impersonateCore(
  deps: ImpersonateDeps,
  fd: FormData
): Promise<FormState | { redirectTo: string }> {
  const values = { reason: str(fd, "reason") }
  const parsed = ImpersonateSchema.safeParse({
    id: str(fd, "userId"),
    reason: values.reason,
    client: deps.client,
  })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    const result = await deps.api.users.impersonate(parsed.data)
    await deps.startImpersonation({ token: result.token, expiresAt: result.expiresAt })
    return { redirectTo: `${deps.appUrl}/notes` }
  } catch (error) {
    const known = apiError(error, ["FORBIDDEN", "NOT_FOUND", "TOO_MANY_REQUESTS", "UNAUTHORIZED"])
    if (!known) logger.error("impersonate failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/**
 * Whether Stop may run. An impersonation session may; so may a browser whose api lookup failed
 * (`me` null — the api is down or slow, not necessarily signed out) but which holds a parked admin
 * token: it was impersonating, and it must not stay signed in as the user because of an outage.
 */
export function shouldStop(me: Me | null, parked: string | null): boolean {
  return me ? me.impersonation !== null : parked !== null
}

/**
 * Ends the impersonation api-side first, then in the browser, whatever the api said: the user's
 * session must never outlive the admin's intent to stop. NOT_FOUND means it was already gone.
 */
export async function stopImpersonationCore(deps: StopDeps): Promise<{ redirectTo: string }> {
  try {
    await deps.api.stopImpersonation()
  } catch (error) {
    if (!apiError(error, ["NOT_FOUND", "UNAUTHORIZED"])) {
      logger.error("stopImpersonation failed", { error })
    }
  }
  const restored = await deps.endImpersonation()
  if (!restored) return { redirectTo: "/login?signedout=1" }
  return {
    redirectTo: deps.impersonatedUserId ? `/admin/users/${deps.impersonatedUserId}` : "/admin",
  }
}

export async function revokeSessionsCore(deps: RevokeDeps, fd: FormData): Promise<FormState> {
  if (str(fd, "confirm") !== "yes") return { ok: false, message: "Tick the box to confirm." }
  const id = Number(str(fd, "userId"))
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Not found" }
  try {
    await deps.api.users.revokeSessions({ id })
    return { ok: true, message: "Signed out everywhere." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND", "UNAUTHORIZED"])
    if (!known) logger.error("revokeSessions failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}

/**
 * Lost-phone recovery: turns the user's two-step verification off and ends every session (the
 * api does both). Same shape as `revokeSessionsCore` — a reason instead of a checkbox, and the
 * api's own refusals (self, another superadmin, no 2FA to reset, the per-admin limiter) shown
 * verbatim.
 */
export async function resetTwoFactorCore(
  deps: ResetTwoFactorDeps,
  fd: FormData
): Promise<FormState> {
  const values = { reason: str(fd, "reason") }
  const parsed = ResetTwoFactorSchema.safeParse({
    userId: str(fd, "userId"),
    reason: values.reason,
  })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.users.resetTwoFactor(parsed.data)
    return {
      ok: true,
      message: "Two-step verification turned off; the user is signed out everywhere.",
    }
  } catch (error) {
    const known = apiError(error, [
      "FORBIDDEN",
      "CONFLICT",
      "NOT_FOUND",
      "TOO_MANY_REQUESTS",
      "UNAUTHORIZED",
    ])
    if (!known) logger.error("resetTwoFactor failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/**
 * Lost-device recovery for passkeys: removes every one of the user's passkeys and ends every
 * session (the api does both, like `resetTwoFactorCore`'s two-step equivalent). Allowed even for a
 * passwordless, provider-less account — the magic link remains — unlike the user's own
 * `account.passkeys.delete`, which refuses to leave someone with no way in.
 */
export async function removePasskeysCore(
  deps: RemovePasskeysDeps,
  fd: FormData
): Promise<FormState> {
  const values = { reason: str(fd, "reason") }
  const parsed = RemovePasskeysSchema.safeParse({
    userId: str(fd, "userId"),
    reason: values.reason,
  })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.users.removePasskeys(parsed.data)
    return {
      ok: true,
      message: "Passkeys removed; the user is signed out everywhere.",
    }
  } catch (error) {
    const known = apiError(error, ["FORBIDDEN", "NOT_FOUND", "TOO_MANY_REQUESTS", "UNAUTHORIZED"])
    if (!known) logger.error("removePasskeys failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/**
 * `SuspensionForm`'s `<input type="date">` value ("2026-11-01") as `SuspendUserSchema`'s `until`: the
 * start of the *next* UTC day, so "until 2026-11-01" reads as "suspended through Nov 1" rather
 * than "suspended until the morning of Nov 1". Empty is indefinite (`undefined`); anything that
 * does not match `YYYY-MM-DD` is passed through unchanged for the api's own schema to refuse (a
 * field error on `until`, same as any other bad input) rather than silently dropped here.
 */
export function untilFromDateInput(value: string): string | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Date.UTC silently overflows a calendar-invalid date (month 13, Feb 30, …) into a different,
  // "corrected" one rather than refusing — a raw form POST can reach this without the picker's own
  // constraints, since the app works without JavaScript. Round-tripping the parts catches that: if
  // they don't come back exactly, the input was never a real date, so it is passed through
  // unchanged for the api's own schema to refuse, same as any other malformed string.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value
  }
  return new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Suspends an account from signing in: a reason (shown to the user nowhere — the audit log is its
 * only reader; neither mail nor the data export carries it) and an optional end date.
 * Re-suspending an account whose suspension is in force updates its reason/end date (the api's
 * own rule); the api alone
 * validates "future" and "at most 365 days ahead" for `until` — this core only shapes the date.
 */
export async function suspendUserCore(deps: SuspendDeps, fd: FormData): Promise<FormState> {
  const values = { reason: str(fd, "reason"), until: str(fd, "until") }
  const until = untilFromDateInput(values.until)
  const parsed = SuspendUserSchema.safeParse({
    userId: str(fd, "userId"),
    reason: values.reason,
    ...(until !== undefined ? { until } : {}),
  })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.users.suspend(parsed.data)
    return {
      ok: true,
      message: "Account suspended; the user is signed out everywhere.",
    }
  } catch (error) {
    const known = apiError(error, [
      "FORBIDDEN",
      "BAD_REQUEST",
      "NOT_FOUND",
      "TOO_MANY_REQUESTS",
      "UNAUTHORIZED",
    ])
    if (!known) logger.error("suspendUser failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/** Lifts a suspension; a no-op success on an account that is not suspended (the api's own rule). */
export async function unsuspendUserCore(deps: UnsuspendDeps, fd: FormData): Promise<FormState> {
  const values = { reason: str(fd, "reason") }
  const parsed = UnsuspendUserSchema.safeParse({ userId: str(fd, "userId"), reason: values.reason })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.users.unsuspend(parsed.data)
    return {
      ok: true,
      message: "Suspension lifted; the user can sign in again.",
    }
  } catch (error) {
    const known = apiError(error, ["FORBIDDEN", "NOT_FOUND", "TOO_MANY_REQUESTS", "UNAUTHORIZED"])
    if (!known) logger.error("unsuspendUser failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

const jobId = (fd: FormData) => {
  const id = Number(str(fd, "id"))
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Requeues a dead job. CONFLICT (a newer live copy holds its dedupe key) is shown verbatim. */
export async function retryJobCore(deps: JobActionDeps, fd: FormData): Promise<FormState> {
  const id = jobId(fd)
  if (id === null) return { ok: false, message: "Job not found" }
  try {
    await deps.api.jobs.retry({ id })
    return { ok: true, message: "Job requeued." }
  } catch (error) {
    const known = apiError(error, ["CONFLICT", "NOT_FOUND"])
    if (!known) logger.error("retryJob failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}

/** Deletes a dead job row for good. */
export async function discardJobCore(deps: JobActionDeps, fd: FormData): Promise<FormState> {
  const id = jobId(fd)
  if (id === null) return { ok: false, message: "Job not found" }
  try {
    await deps.api.jobs.discard({ id })
    return { ok: true, message: "Job discarded." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("discardJob failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}

const supportId = (fd: FormData) => {
  const id = Number(str(fd, "id"))
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Marks a support request resolved. */
export async function resolveSupportCore(
  deps: SupportActionDeps,
  fd: FormData
): Promise<FormState> {
  const id = supportId(fd)
  if (id === null) return { ok: false, message: "Support request not found" }
  try {
    await deps.api.support.resolve({ id })
    return { ok: true, message: "Marked resolved." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("resolveSupport failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}

/** Reopens a resolved support request. */
export async function reopenSupportCore(deps: SupportActionDeps, fd: FormData): Promise<FormState> {
  const id = supportId(fd)
  if (id === null) return { ok: false, message: "Support request not found" }
  try {
    await deps.api.support.reopen({ id })
    return { ok: true, message: "Reopened." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("reopenSupport failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}

const applicationId = (fd: FormData) => {
  const id = Number(str(fd, "id"))
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Changes a job application's status. */
export async function setApplicationStatusCore(
  deps: ApplicationActionDeps,
  fd: FormData
): Promise<FormState> {
  const id = applicationId(fd)
  if (id === null) return { ok: false, message: "Application not found" }
  const status = str(fd, "status")
  if (!APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
    return { ok: false, message: "Not a valid status" }
  }
  try {
    await deps.api.applications.setStatus({ id, status: status as ApplicationStatus })
    return { ok: true, message: "Status updated." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("setApplicationStatus failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}

/** Deletes a job application and queues its CV for deletion. */
export async function deleteApplicationCore(
  deps: ApplicationActionDeps,
  fd: FormData
): Promise<FormState> {
  const id = applicationId(fd)
  if (id === null) return { ok: false, message: "Application not found" }
  try {
    await deps.api.applications.delete({ id })
    return { ok: true, message: "Application deleted." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("deleteApplication failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}
