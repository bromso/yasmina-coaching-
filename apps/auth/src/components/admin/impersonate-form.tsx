"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { impersonate } from "@/app/admin/(gated)/users/[id]/actions"
import type { FormState } from "@/lib/admin-actions"

export function ImpersonateForm({
  userId,
  disabledReason,
}: {
  userId: number
  disabledReason?: string
}) {
  const [state, action, pending] = useActionState(impersonate, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-1.5">
        <Label htmlFor="reason">Reason</Label>
        <Textarea
          id="reason"
          name="reason"
          required
          minLength={3}
          maxLength={200}
          rows={2}
          defaultValue={values?.reason ?? ""}
          disabled={Boolean(disabledReason)}
          {...fieldAria("reason", state, "reason-hint")}
        />
        <p id="reason-hint" className="text-muted-foreground text-xs">
          Shown to the user in the audit log
        </p>
        <FieldError name="reason" state={state} />
      </div>
      <FormMessage state={state} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || Boolean(disabledReason)}>
          Impersonate
        </Button>
        {disabledReason && <span className="text-muted-foreground text-sm">{disabledReason}</span>}
      </div>
    </form>
  )
}
