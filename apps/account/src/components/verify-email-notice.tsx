"use client"

import type { User } from "@repo/api-contract"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { resendVerification } from "@/app/(account)/personal-info/verification-actions"
import type { FormState } from "@/lib/actions"

/** Shown while the email is unverified: one sentence and a resend button with live feedback. */
export function VerifyEmailNotice({ user }: { user: Pick<User, "email" | "emailVerified"> }) {
  const t = useTranslations("account.verify")
  const [state, action, pending] = useActionState(resendVerification, { ok: false } as FormState)
  if (user.emailVerified) return null
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950"
    >
      <p>{t.rich("text", { email: user.email, strong: (chunks) => <strong>{chunks}</strong> })}</p>
      <FormMessage state={state} />
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {t(pending ? "sending" : "resend")}
        </Button>
      </div>
    </form>
  )
}
