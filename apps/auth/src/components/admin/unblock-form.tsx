"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useActionState } from "react"
import { unblockDays } from "@/app/admin/(gated)/bookings/actions"
import type { FormState } from "@/lib/admin-booking-actions"

/** The **Unblock** button next to one blocked range. */
export function UnblockForm({ id, label }: { id: number; label: string }) {
  const [state, action, pending] = useActionState(unblockDays, { ok: false } as FormState)
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} aria-label={label}>
        {pending ? "Unblocking…" : "Unblock"}
      </Button>
      <FormMessage state={state} />
    </form>
  )
}
