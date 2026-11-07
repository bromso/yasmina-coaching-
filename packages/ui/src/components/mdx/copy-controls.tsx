import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import type { MouseEvent } from "react"

/** Where the last copy attempt left the button: none yet, it worked, or the clipboard refused. */
export type CopyStatus = "idle" | "copied" | "failed"

/** What the live region announces for each status — nothing while idle. */
const ANNOUNCEMENTS: Record<CopyStatus, string> = {
  idle: "",
  copied: "Copied to clipboard",
  failed: "Couldn't copy",
}

export type CopyControlsProps = {
  status: CopyStatus
  onCopy: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * The copy button and its screen-reader announcement, split out from `CopyButton` so this
 * markup's own structure (the live region sitting next to the button) can be tested directly,
 * independent of the "only after mount" gate around it. Presentational only — no hooks of its
 * own — but `Icon` (`@iconify/react`) makes this a Client Component, so it stays out of
 * `CodeBlockFrame`'s own file and the static feed map never renders it.
 */
export function CopyControls({ status, onCopy }: CopyControlsProps) {
  const copied = status === "copied"
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-2 top-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon icon={copied ? "lucide:check" : "lucide:copy"} aria-hidden="true" />
      </Button>
      {/* Visually hidden, announced by a screen reader when it changes; empty (and so silent)
          until a copy is attempted, then cleared again once the button's label reverts. */}
      <span role="status" aria-live="polite" className="sr-only">
        {ANNOUNCEMENTS[status]}
      </span>
    </>
  )
}
