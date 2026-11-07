"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { changeSuspension } from "@/app/admin/(gated)/users/[id]/actions"
import type { FormState } from "@/lib/admin-actions"

/**
 * The Suspension card's form: **Suspend account** (reason, optional end date) when the account has
 * no suspension record, **Lift suspension** (reason) whenever it has one — in force or expired, since
 * lifting is what clears an expired record (re-suspending after expiry means lifting first). One
 * `useActionState` for both, so the confirmation stays on screen when a success re-renders the
 * card with the other set of fields.
 */
export function SuspensionForm({
  userId,
  record,
  minDate,
  maxDate,
  disabledReason,
}: {
  userId: number
  /** The account's suspension record (`AdminUser.suspended`): none, in force, or expired. */
  record: "none" | "active" | "expired"
  /** `suspendUntilBounds()`'s hint for the date input — the api is what actually enforces it. */
  minDate: string
  maxDate: string
  disabledReason?: string
}) {
  const [state, action, pending] = useActionState(changeSuspension, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  const disabled = Boolean(disabledReason)
  const lift = record !== "none"
  // The suspension field's id, label and error id differ from the other admin forms' `reason`
  // (Impersonate, Reset two-step verification, Remove passkeys), so this card's control has its
  // own accessible name and a field error here never shares an id with one there.
  const prefix = lift ? "unsuspend" : "suspend"
  const idPrefix = `${prefix}-`
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="intent" value={prefix} />
      <div className="grid gap-1.5">
        <Label htmlFor={`${prefix}-reason`}>
          {lift ? "Reason for lifting" : "Reason for suspending"}
        </Label>
        <Textarea
          key={prefix}
          id={`${prefix}-reason`}
          name="reason"
          required
          minLength={3}
          maxLength={200}
          rows={2}
          defaultValue={values?.reason ?? ""}
          disabled={disabled}
          {...fieldAria("reason", state, `${prefix}-reason-hint`, { idPrefix })}
        />
        <p id={`${prefix}-reason-hint`} className="text-muted-foreground text-xs">
          Internal: kept in the audit log, never shown to the user
        </p>
        <FieldError name="reason" state={state} idPrefix={idPrefix} />
      </div>
      {record === "expired" && (
        <p className="text-muted-foreground text-sm">
          This suspension has ended. Lift it to clear the record before suspending the account
          again.
        </p>
      )}
      {!lift && (
        <div className="grid gap-1.5">
          <Label htmlFor="suspend-until">End date (optional)</Label>
          <Input
            id="suspend-until"
            name="until"
            type="date"
            min={minDate}
            max={maxDate}
            defaultValue={values?.until ?? ""}
            disabled={disabled}
            {...fieldAria("until", state, "suspend-until-hint", { idPrefix })}
          />
          <p id="suspend-until-hint" className="text-muted-foreground text-xs">
            Leave blank to suspend indefinitely. The account is suspended through this date (UTC);
            the user's mail names the next day, when signing in works again.
          </p>
          <FieldError name="until" state={state} idPrefix={idPrefix} />
        </div>
      )}
      <FormMessage state={state} />
      <div className="flex items-center gap-3">
        {lift ? (
          <Button type="submit" disabled={pending || disabled}>
            {pending ? "Lifting…" : "Lift suspension"}
          </Button>
        ) : (
          <Button type="submit" variant="destructive" disabled={pending || disabled}>
            {pending ? "Suspending…" : "Suspend account"}
          </Button>
        )}
        {disabledReason && <span className="text-muted-foreground text-sm">{disabledReason}</span>}
      </div>
    </form>
  )
}
