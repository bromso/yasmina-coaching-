"use client"

import type { LeadStatus } from "@repo/api-contract/leads"
import { LEAD_NOTES_MAX, LEAD_STATUS_LABELS, LEAD_STATUSES } from "@repo/api-contract/leads"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { updateLead } from "@/app/admin/(gated)/leads/actions"
import type { FormState } from "@/lib/admin-actions"

const selectClass =
  "h-9 w-full max-w-60 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

/** The lead's status and Yasmina's own notes (never shown to the visitor), saved together. */
export function LeadUpdateForm({
  id,
  status,
  notes,
}: {
  id: number
  status: LeadStatus
  notes: string | null
}) {
  const [state, action, pending] = useActionState(updateLead, { ok: false } as FormState)
  const typed = state.ok ? undefined : state.values
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1.5">
        <Label htmlFor="lead-status">Status</Label>
        {/* key: a fresh default once the action re-renders with the new status. */}
        <select
          key={status}
          id="lead-status"
          name="status"
          defaultValue={typed?.status ?? status}
          className={selectClass}
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={6}
          maxLength={LEAD_NOTES_MAX}
          defaultValue={typed?.notes ?? notes ?? ""}
          {...fieldAria("notes", state)}
        />
        <FieldError name="notes" state={state} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  )
}
