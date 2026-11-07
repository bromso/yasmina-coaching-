"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useActionState } from "react"
import { blockDays } from "@/app/admin/(gated)/bookings/actions"
import type { FormState } from "@/lib/admin-booking-actions"

/** Blocks a range of days (holiday, travel): nothing can be booked on them. */
export function BlockDaysForm() {
  const [state, action, pending] = useActionState(blockDays, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  const idPrefix = "block-"
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="block-from">From</Label>
          <Input
            id="block-from"
            name="from"
            type="date"
            required
            defaultValue={values?.from ?? ""}
            {...fieldAria("from", state, undefined, { idPrefix })}
          />
          <FieldError name="from" state={state} idPrefix={idPrefix} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="block-to">To</Label>
          <Input
            id="block-to"
            name="to"
            type="date"
            defaultValue={values?.to ?? ""}
            {...fieldAria("to", state, "block-to-hint", { idPrefix })}
          />
          <p id="block-to-hint" className="text-muted-foreground text-xs">
            Inclusive. Leave blank to block the one day.
          </p>
          <FieldError name="to" state={state} idPrefix={idPrefix} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="block-reason">Reason (optional, internal)</Label>
        <Input
          id="block-reason"
          name="reason"
          type="text"
          maxLength={200}
          defaultValue={values?.reason ?? ""}
          {...fieldAria("reason", state, undefined, { idPrefix })}
        />
        <FieldError name="reason" state={state} idPrefix={idPrefix} />
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Blocking…" : "Block days"}
        </Button>
      </div>
    </form>
  )
}
