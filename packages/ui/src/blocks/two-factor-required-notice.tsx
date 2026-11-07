import { Button } from "@repo/ui/components/button"
import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"
import { useId } from "react"

type TwoFactorRequiredNoticeProps = Omit<React.ComponentProps<"section">, "title"> & {
  title: string
  /** Names the workspace and what to do, e.g. "Acme requires two-step verification. …". */
  body: string
  /** Where two-step verification is set up (the account app's Security page). */
  setupHref: string
  setupLabel: string
  /** The app's own way to switch to another workspace (or make one): forms, links. */
  switchSlot?: React.ReactNode
  /** The app's own form that leaves this workspace. */
  leaveSlot?: React.ReactNode
}

/**
 * Shown in place of a workspace page when the workspace requires two-step verification and the
 * signed-in member has turned on neither it nor a passkey: what is required, a link to set it up,
 * and the app's own switch and leave controls. Content-agnostic (every string is a prop), no
 * client hooks and no navigation of its own — the app renders it server-side, so it works without
 * JavaScript and can never loop through a redirect.
 */
export function TwoFactorRequiredNotice({
  title,
  body,
  setupHref,
  setupLabel,
  switchSlot,
  leaveSlot,
  className,
  ...props
}: TwoFactorRequiredNoticeProps) {
  const titleId = useId()
  return (
    <section
      data-slot="two-factor-required-notice"
      aria-labelledby={titleId}
      className={cn("mx-auto grid w-full max-w-xl gap-6", className)}
      {...props}
    >
      <div className="grid gap-3">
        <h1 id={titleId} className="text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground text-balance">{body}</p>
      </div>
      <div>
        <Button asChild size="lg">
          <a href={setupHref}>{setupLabel}</a>
        </Button>
      </div>
      {switchSlot && (
        <div data-slot="two-factor-required-notice-switch" className="grid gap-2">
          {switchSlot}
        </div>
      )}
      {leaveSlot && (
        <div data-slot="two-factor-required-notice-leave" className="border-t pt-6">
          {leaveSlot}
        </div>
      )}
    </section>
  )
}
