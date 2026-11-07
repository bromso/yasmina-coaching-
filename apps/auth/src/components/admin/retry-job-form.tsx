"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useActionState } from "react"
import { retryJob } from "@/app/admin/(gated)/actions"
import type { FormState } from "@/lib/admin-actions"

export function RetryJobForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(retryJob, { ok: false } as FormState)
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Retry
      </Button>
      <FormMessage state={state} />
    </form>
  )
}
