"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { useActionState } from "react"
import { revokeSessions } from "@/app/admin/(gated)/users/[id]/actions"
import type { FormState } from "@/lib/admin-actions"

export function RevokeSessionsForm({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(revokeSessions, { ok: false } as FormState)
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        {/* Native, not the Radix Checkbox: that one submits its value only once hydrated. */}
        <input
          type="checkbox"
          id="confirm"
          name="confirm"
          value="yes"
          className="size-4 accent-primary"
        />
        <Label htmlFor="confirm">Sign this user out of every device</Label>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant="destructive" disabled={pending}>
          Sign out everywhere
        </Button>
      </div>
    </form>
  )
}
