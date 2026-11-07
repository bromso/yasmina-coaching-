import { type ApiClient, CheckoutSchema, MockChangeSchema } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import { failure, str } from "@/lib/actions"
import { accountTranslator, zodMessage } from "@/lib/i18n"

export type BillingApi = Pick<ApiClient["billing"], "checkout" | "portal" | "mockChange">

/**
 * Everything a Payments form action needs. `workspaceId` is the current workspace as
 * `requireWorkspace()` resolved it on the server, never a value from the form.
 */
export type BillingDeps = { api: BillingApi; workspaceId: number; locale?: Locale }

/** A failure for the form, or the provider's URL to redirect to. */
export type RedirectState = Extract<FormState, { ok: false }> | { ok: true; url: string }

/** Owner-only on the api: a non-owner's `FORBIDDEN` ("Requires the owner role") passes through. */
const OWNER_CODES = ["NOT_FOUND", "FORBIDDEN"]

export async function startCheckoutCore(deps: BillingDeps, fd: FormData): Promise<RedirectState> {
  const t = accountTranslator(deps.locale)
  const values = { plan: str(fd, "plan"), interval: str(fd, "interval") }
  const parsed = CheckoutSchema.safeParse({ workspaceId: deps.workspaceId, ...values })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    const { url } = await deps.api.checkout(parsed.data)
    return { ok: true, url }
  } catch (error) {
    const codes = [...OWNER_CODES, "CONFLICT", "BAD_REQUEST"]
    return { ok: false, message: failure(error, codes, "startCheckout", t), values }
  }
}

export async function openPortalCore(deps: BillingDeps): Promise<RedirectState> {
  const t = accountTranslator(deps.locale)
  try {
    const { url } = await deps.api.portal({ workspaceId: deps.workspaceId })
    return { ok: true, url }
  } catch (error) {
    return { ok: false, message: failure(error, OWNER_CODES, "openPortal", t) }
  }
}

/** Mock provider only (the api answers `NOT_FOUND` otherwise). `cancel` needs no interval. */
export async function changeMockPlanCore(deps: BillingDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale)
  const values = { plan: str(fd, "plan"), interval: str(fd, "interval") }
  const parsed = MockChangeSchema.safeParse({
    workspaceId: deps.workspaceId,
    plan: values.plan,
    interval: values.interval || undefined,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues, zodMessage(t)), values }
  }
  try {
    const billing = await deps.api.mockChange(parsed.data)
    if (parsed.data.plan === "cancel") return { ok: true, message: t("payments.cancelled") }
    return { ok: true, message: t("payments.onPlan", { plan: billing.planName }) }
  } catch (error) {
    return { ok: false, message: failure(error, OWNER_CODES, "changeMockPlan", t), values }
  }
}
