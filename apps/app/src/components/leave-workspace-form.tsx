"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage, type FormState } from "@repo/ui/components/form-feedback"
import { useActionState } from "react"
import { leaveWorkspace } from "@/app/actions"

const initial: FormState = { ok: false }

/**
 * The two-step notice's **Leave**: a plain form (it works before hydration too) over
 * `leaveWorkspace`, which redirects once the user has left; a refusal (the last owner) shows here.
 * The labels come from the server view, so this ships no message catalog.
 */
export function LeaveWorkspaceForm({
  workspaceId,
  label,
  accessibleLabel,
  pendingLabel,
}: {
  /** The workspace the page was rendered for; the action refuses any other. */
  workspaceId: number
  /** The short visible label ("Leave"); the workspace's name is in the text around it. */
  label: string
  /** The button's name, starting with `label` and naming the workspace ("Leave Acme"). */
  accessibleLabel: string
  pendingLabel: string
}) {
  const [state, action, pending] = useActionState(leaveWorkspace, initial)
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormMessage state={state} />
      <div>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending}
          aria-label={pending ? undefined : accessibleLabel}
        >
          {pending ? pendingLabel : label}
        </Button>
      </div>
    </form>
  )
}
