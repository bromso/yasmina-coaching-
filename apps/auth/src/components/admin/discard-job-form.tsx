"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useActionState } from "react"
import { discardJob } from "@/app/admin/(gated)/actions"
import type { FormState } from "@/lib/admin-actions"

export function DiscardJobForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(discardJob, { ok: false } as FormState)
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="destructive" disabled={pending}>
        Discard
      </Button>
      <FormMessage state={state} />
    </form>
  )
}
