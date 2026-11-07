"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { acceptInvitation } from "@/app/invitations/[token]/actions"
import type { CreateResult } from "@/lib/workspace-actions"

/** Consumes the invitation only on this POST; a wrong address or unverified email shows here. */
export function AcceptInvitationButton({ token }: { token: string }) {
  const t = useTranslations("app.invitations")
  const [state, action, pending] = useActionState(acceptInvitation, { ok: false } as CreateResult)
  return (
    <form action={action} className="grid gap-3">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <div>
        <Button type="submit" disabled={pending}>
          {t(pending ? "accepting" : "accept")}
        </Button>
      </div>
    </form>
  )
}
