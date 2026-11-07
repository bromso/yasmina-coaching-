import { cn } from "@repo/ui/lib/utils"
import type { ReactNode, SVGProps } from "react"

export type CalloutType = "note" | "tip" | "warning"

/** The three lucide icons `Callout` used through `@iconify/react`'s `Icon`, inlined so this file
 * has no Client Component anywhere in its import graph — `@iconify/react` fetches/caches icon
 * data client-side and cannot run in the static feed renderer. Paths copied verbatim from
 * `@iconify-json/lucide` (`info`, `lightbulb`, `triangle-alert`), 24x24, `currentColor` stroke.
 * `width`/`height` are intrinsic (16, matching `size-4`'s 1rem default), so a feed reader that
 * drops the stylesheet doesn't render it at the viewport's full width. */
function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4m0-4h.01" />
    </svg>
  )
}

function LightbulbIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4" />
    </svg>
  )
}

function TriangleAlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01" />
    </svg>
  )
}

const ICON: Record<CalloutType, (props: SVGProps<SVGSVGElement>) => ReactNode> = {
  note: InfoIcon,
  tip: LightbulbIcon,
  warning: TriangleAlertIcon,
}

const STYLE: Record<CalloutType, string> = {
  note: "border-border bg-muted/50",
  tip: "border-primary/30 bg-primary/5",
  warning: "border-destructive/30 bg-destructive/5",
}

export type CalloutProps = {
  type?: CalloutType
  title?: string
  children: ReactNode
}

/** An MDX admonition box: note, tip or warning, each with its own icon and tint. A pure
 * component — no Client Component anywhere in its graph — so it belongs in `mdxStaticComponents`
 * too. */
export function Callout({ type = "note", title, children }: CalloutProps) {
  const CalloutIcon = ICON[type]
  return (
    <div role="note" className={cn("my-4 flex gap-3 rounded-lg border p-4 text-sm", STYLE[type])}>
      <CalloutIcon className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        {title && <p className="font-medium">{title}</p>}
        <div className="text-muted-foreground [&>p]:m-0">{children}</div>
      </div>
    </div>
  )
}
