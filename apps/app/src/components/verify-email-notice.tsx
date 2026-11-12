"use client"

import type { User } from "@repo/api-contract"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { SunPanel } from "@repo/ui/components/sun-panel"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { resendVerification } from "@/app/workspaces/new/actions"
import type { FormState } from "@/lib/workspace-actions"

/** Shown while the email is unverified: one sentence and a resend button with live feedback. */
export function VerifyEmailNotice({ user }: { user: Pick<User, "email" | "emailVerified"> }) {
  const t = useTranslations("app.verify")
  const [state, action, pending] = useActionState(resendVerification, { ok: false } as FormState)
  if (user.emailVerified) return null
  return (
    <SunPanel as="form" action={action} className="flex flex-col gap-3 px-6 py-5 text-sm">
      <p>{t.rich("text", { email: user.email, strong: (chunks) => <strong>{chunks}</strong> })}</p>
      <FormMessage state={state} />
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {t(pending ? "sending" : "resend")}
        </Button>
      </div>
    </SunPanel>
  )
}
