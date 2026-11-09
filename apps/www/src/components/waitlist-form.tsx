"use client"

import { Newsletter } from "@repo/ui/blocks/newsletter"
import { useActionState } from "react"
import { joinWaitlist } from "@/app/actions"

type WaitlistFormProps = {
  title: string
  description?: string
  buttonLabel: string
  legal: string
  emailLabel: string
  placeholder: string
}

/** Copy comes in as props so the content module stays out of the client bundle. */
export function WaitlistForm({
  title,
  description,
  buttonLabel,
  legal,
  emailLabel,
  placeholder,
}: WaitlistFormProps) {
  const [state, action] = useActionState(joinWaitlist, { ok: false })
  return (
    <Newsletter
      id="waitlist"
      heading={{ title }}
      description={description}
      action={action}
      state={state}
      buttonLabel={buttonLabel}
      emailLabel={emailLabel}
      placeholder={placeholder}
      legal={legal}
      className="py-0"
    />
  )
}
