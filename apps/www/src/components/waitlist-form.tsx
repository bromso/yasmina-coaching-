"use client"

import { Newsletter } from "@repo/ui/blocks/newsletter"
import { useActionState } from "react"
import { joinWaitlist } from "@/app/actions"

/** Copy comes in as props so the content module (icons, logos) stays out of the client bundle. */
export function WaitlistForm({ title, description }: { title: string; description?: string }) {
  const [state, action] = useActionState(joinWaitlist, { ok: false })
  return (
    <Newsletter
      id="waitlist"
      heading={{ title }}
      description={description}
      action={action}
      state={state}
      legal="No marketing without a separate opt-in. Unsubscribe any time."
    />
  )
}
