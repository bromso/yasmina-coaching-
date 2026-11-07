import { ORPCError } from "@orpc/client"
import { AcceptByIdSchema, type ApiClient, CreateWorkspaceSchema } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import { type AppT, appTranslator, zodMessage } from "./i18n"

const logger = createLogger({ service: "app" })

export type { FormState }

export type WorkspaceApi = {
  workspaces: Pick<ApiClient["workspaces"], "create">
  invitations: Pick<ApiClient["invitations"], "accept" | "acceptById">
}

/**
 * Everything a form action needs, injected so the cores run under bun test with a fake api.
 * `locale` is the request's language for this app's own messages (English when absent); the api's
 * messages already arrive in it (the client sends `x-locale`), so they pass through.
 */
export type Deps = { api: WorkspaceApi; locale?: Locale }

/** On success, the workspace the action should make current before redirecting. */
export type CreateResult = FormState & { workspaceId?: number }

/** The English outage message, for tests; the cores read `errors.workspaceUnavailable`. */
export const UNAVAILABLE = appTranslator("en")("errors.workspaceUnavailable")

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/** The api's own message for a declared error; anything undeclared is logged and "unavailable". */
function failure(t: AppT, error: unknown, codes: string[], what: string) {
  const known =
    error instanceof ORPCError && error.defined && ["UNAUTHORIZED", ...codes].includes(error.code)
      ? error
      : undefined
  if (!known) logger.error(`${what} failed`, { error })
  return known?.message ?? t("errors.workspaceUnavailable")
}

export async function createWorkspaceCore(deps: Deps, fd: FormData): Promise<CreateResult> {
  const t = appTranslator(deps.locale)
  const values = { name: str(fd, "name") }
  const parsed = CreateWorkspaceSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    const workspace = await deps.api.workspaces.create(parsed.data)
    return { ok: true, workspaceId: workspace.id }
  } catch (error) {
    // FORBIDDEN is the unverified-email case; its message is the copy the form shows.
    return { ok: false, message: failure(t, error, ["FORBIDDEN"], "workspaces.create"), values }
  }
}

/**
 * Accepts by `token` (an invitation link) or by `id` (a pending invitation listed to the signed-in
 * user). NOT_FOUND and FORBIDDEN (wrong address, unverified email) carry the exact copy to show.
 */
export async function acceptInvitationCore(deps: Deps, fd: FormData): Promise<CreateResult> {
  const t = appTranslator(deps.locale)
  const token = str(fd, "token")
  const byId = token ? undefined : AcceptByIdSchema.safeParse({ id: str(fd, "id") })
  if (byId && !byId.success) return { ok: false, message: t("invitations.invalid") }
  try {
    const { workspace } = byId?.success
      ? await deps.api.invitations.acceptById(byId.data)
      : await deps.api.invitations.accept({ token })
    return { ok: true, workspaceId: workspace.id }
  } catch (error) {
    const message = failure(t, error, ["NOT_FOUND", "FORBIDDEN"], "invitations.accept")
    return { ok: false, message }
  }
}

export type LeaveDeps = {
  api: Pick<ApiClient["workspaces"], "leave">
  locale?: Locale
}

/**
 * Leaves `workspaceId` — the two-step notice's **Leave** (`workspaces.leave` is exempt from the
 * requirement, so a blocked member can always go). The last owner is refused (`CONFLICT`), and
 * NOT_FOUND / FORBIDDEN carry the api's own copy; each is shown as is.
 */
export async function leaveWorkspaceCore(deps: LeaveDeps, workspaceId: number): Promise<FormState> {
  const t = appTranslator(deps.locale)
  try {
    await deps.api.leave({ workspaceId })
    return { ok: true }
  } catch (error) {
    const codes = ["NOT_FOUND", "FORBIDDEN", "CONFLICT"]
    return { ok: false, message: failure(t, error, codes, "workspaces.leave") }
  }
}

export type ResendDeps = {
  api: Pick<ApiClient["account"], "resendVerification">
  locale?: Locale
}

export async function resendVerificationCore(deps: ResendDeps): Promise<FormState> {
  const t = appTranslator(deps.locale)
  try {
    const { sent } = await deps.api.resendVerification()
    return { ok: true, message: t(sent ? "verify.sent" : "verify.alreadyVerified") }
  } catch (error) {
    return { ok: false, message: failure(t, error, ["TOO_MANY_REQUESTS"], "resendVerification") }
  }
}
