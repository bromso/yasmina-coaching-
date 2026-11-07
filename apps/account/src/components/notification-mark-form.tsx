"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage, type FormState } from "@repo/ui/components/form-feedback"
import { useActionState, useEffect, useRef } from "react"
import { markNotificationsRead } from "@/app/(account)/notifications/actions"
import { focusHeadingIfLost } from "@/lib/notifications-focus"

const initial: FormState = { ok: false }

/**
 * **Mark all as read** (no `id`) or one row's **Mark as read**: a plain form that works before
 * hydration too, over the page's `markNotificationsRead` action, whose `refresh()` re-renders the
 * list and the header's bell. A refusal shows here. The labels come from the server view, so this
 * ships no message catalog; `ariaLabel` makes each row's button name unique. A success re-renders
 * the list without this form (its row is read now), so if it held focus, focus moves to the
 * list's heading rather than falling to the page's body.
 */
export function NotificationMarkForm({
  id,
  label,
  ariaLabel,
}: {
  /** The one notification to mark; omitted for **Mark all as read**. */
  id?: number
  label: string
  ariaLabel?: string
}) {
  const [state, action, pending] = useActionState(markNotificationsRead, initial)
  // Whether focus is inside this form, read when it unmounts (a ref, so no re-render).
  const hadFocus = useRef(false)
  useEffect(() => () => void focusHeadingIfLost(hadFocus.current), [])
  return (
    <form
      action={action}
      className="grid gap-2"
      onFocus={() => {
        hadFocus.current = true
      }}
      onBlur={(event) => {
        // Only focus moved to another element counts as leaving: a button disabled while the
        // action is pending (or a click on nothing focusable) drops focus with no related target.
        const next = event.relatedTarget
        if (next && !event.currentTarget.contains(next)) hadFocus.current = false
      }}
    >
      {id === undefined ? (
        <input type="hidden" name="all" value="1" />
      ) : (
        <input type="hidden" name="id" value={id} />
      )}
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={ariaLabel}>
          {label}
        </Button>
      </div>
    </form>
  )
}
