import { blockedByTwoFactor } from "@repo/session"
import type { Metadata } from "next"
import { connection } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { twoFactorRequiredProps } from "@/lib/two-factor-required"
import { type CheckoutReturn, PaymentsView } from "@/views/payments-view"
import { TwoFactorRequiredView } from "@/views/two-factor-required-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.meta"))("payments") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const asCheckout = (v: string | undefined): CheckoutReturn | undefined =>
  v === "success" || v === "cancelled" ? v : undefined

export default async function Page({ searchParams }: { searchParams: Search }) {
  await connection()
  const params = await searchParams
  const auth = getAuth()
  const { user, workspace, role } = await auth.requireWorkspace()
  // A workspace requiring two-step verification refuses `billing.get` to a member without it: the
  // notice instead, before any workspace call (never a redirect, so never a loop).
  if (blockedByTwoFactor(workspace, user)) {
    return <TwoFactorRequiredView {...(await twoFactorRequiredProps(workspace))} />
  }
  const api = await auth.api()
  // Read fresh rather than from the cached workspace summary, so a reload after checkout shows the
  // plan the webhook just wrote.
  const billing = await api.billing.get({ workspaceId: workspace.id })
  return (
    <PaymentsView
      workspace={workspace}
      role={role}
      billing={billing}
      checkout={asCheckout(first(params.checkout))}
      locale={await getLocale()}
    />
  )
}
