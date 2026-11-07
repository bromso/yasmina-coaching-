"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { type FormState, str } from "@/lib/actions"
import { getAuth } from "@/lib/auth"
import {
  changeMockPlanCore,
  openPortalCore,
  type RedirectState,
  startCheckoutCore,
} from "@/lib/billing-actions"
import { sameWorkspace, switchedMessage } from "@/lib/workspace-actions"

/**
 * Like the Workspace actions: the workspace acted on is the one `requireWorkspace()` resolved, and
 * the form's `workspaceId` only has to match it. Owner-only is the api's rule; a non-owner gets its
 * `FORBIDDEN` message.
 */
async function billingDeps() {
  const auth = getAuth()
  const { workspace } = await auth.requireWorkspace()
  const api = (await auth.api()).billing
  const locale = await auth.getLocale()
  return {
    workspace,
    switched: switchedMessage(locale),
    deps: { api, workspaceId: workspace.id, locale },
  }
}

/** The picker's choice, handed back so a refused form keeps it. */
const picked = (fd: FormData) => ({ plan: str(fd, "plan"), interval: str(fd, "interval") })

/** On success, leave for the provider's page (an external URL — `redirect` allows it). */
function redirectOnSuccess(out: RedirectState): FormState {
  if (out.ok) redirect(out.url)
  return out
}

export async function startCheckout(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await billingDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched, values: picked(fd) }
  const out = await startCheckoutCore(deps, fd)
  // The mock's "checkout" has already activated the plan and returns to this app: the header's
  // workspace summary carries the entitlements. Harmless before Stripe's external redirect.
  if (out.ok) revalidatePath("/", "layout")
  return redirectOnSuccess(out)
}

export async function openPortal(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await billingDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return redirectOnSuccess(await openPortalCore(deps))
}

export async function changeMockPlan(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await billingDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched, values: picked(fd) }
  const out = await changeMockPlanCore(deps, fd)
  if (out.ok) {
    revalidatePath("/payments")
    // The header's workspace summary carries the entitlements.
    revalidatePath("/", "layout")
  }
  return out
}

/**
 * The mock's Change-plan card: one action, so its forms share one result. `intent=checkout` (on
 * Free) goes through checkout exactly as with Stripe; anything else switches or cancels in place.
 */
export async function mockBilling(prev: FormState, fd: FormData): Promise<FormState> {
  return str(fd, "intent") === "checkout" ? startCheckout(prev, fd) : changeMockPlan(prev, fd)
}
