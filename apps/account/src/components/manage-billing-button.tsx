"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { openPortal } from "@/app/(account)/payments/actions"
import type { FormState } from "@/lib/actions"

/**
 * Stripe's customer portal: change or cancel the plan, payment method and invoices. `description`
 * defaults to `account.payments.manageDescription`.
 */
export function ManageBillingButton({
  workspaceId,
  description,
}: {
  workspaceId: number
  description?: string
}) {
  const t = useTranslations("account.payments")
  const [state, action, pending] = useActionState(openPortal, { ok: false } as FormState)
  return (
    <form action={action} className="grid gap-4 px-6 py-5">
      <FormMessage state={state} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <p className="text-muted-foreground text-sm">{description ?? t("manageDescription")}</p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("opening") : t("manage")}
        </Button>
      </div>
    </form>
  )
}
