"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useActionState } from "react"
import { deleteApplication } from "@/app/admin/(gated)/applications/actions"
import type { FormState } from "@/lib/admin-actions"

export function DeleteApplicationForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(deleteApplication, { ok: false } as FormState)
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Delete…
      </summary>
      <form action={action} className="mt-2 grid gap-1">
        <input type="hidden" name="id" value={id} />
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          Delete permanently
        </Button>
        <FormMessage state={state} />
      </form>
    </details>
  )
}
