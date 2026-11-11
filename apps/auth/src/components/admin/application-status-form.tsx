"use client"

import type { ApplicationStatus } from "@repo/api-contract"
import { APPLICATION_STATUSES } from "@repo/api-contract/application-statuses"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { NativeSelect } from "@repo/ui/components/native-select"
import { useActionState, useId } from "react"
import { setApplicationStatus } from "@/app/admin/(gated)/applications/actions"
import type { FormState } from "@/lib/admin-actions"

const LABELS: Record<ApplicationStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  rejected: "Rejected",
  hired: "Hired",
}

export function ApplicationStatusForm({ id, status }: { id: number; status: ApplicationStatus }) {
  const [state, action, pending] = useActionState(setApplicationStatus, { ok: false } as FormState)
  const selectId = useId()
  return (
    <form action={action} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-end gap-2">
        <label htmlFor={selectId} className="sr-only">
          Status
        </label>
        {/* key: a fresh default once the action re-renders with the new status. */}
        <NativeSelect
          key={status}
          id={selectId}
          name="status"
          defaultValue={status}
          className="h-8 w-auto"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Set status
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  )
}
