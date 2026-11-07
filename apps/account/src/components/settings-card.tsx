import { Card, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Icon } from "@repo/ui/components/icon"
import { cn } from "@repo/ui/lib/utils"
import Link from "next/link"
import type { ReactNode } from "react"

interface SettingsCardProps {
  title?: string
  /** Makes the title a programmatic focus target: this id plus `tabIndex={-1}` (focusable from
   * script, never a tab stop) — e.g. where focus goes after the card's own content unmounts. */
  titleId?: string
  description?: string
  className?: string
  children: ReactNode
}

/**
 * The core "My Account" pattern: a card with an optional title + description
 * followed by a stack of tappable setting rows divided by borders.
 */
export function SettingsCard({
  title,
  titleId,
  description,
  className,
  children,
}: SettingsCardProps) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      {(title || description) && (
        <CardHeader className="gap-1 px-6 pt-5 pb-4">
          {title && (
            <CardTitle className="text-base" {...(titleId ? { id: titleId, tabIndex: -1 } : {})}>
              {title}
            </CardTitle>
          )}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <div className={cn("flex flex-col divide-y", (title || description) && "border-t")}>
        {children}
      </div>
    </Card>
  )
}

interface SettingsRowProps {
  /** Row label (default variant) or title (icon/two-line variant). */
  label: string
  /** Current value shown in the value column. */
  value?: ReactNode
  /** Optional lucide:* icon name — switches the row to the icon + two-line variant. */
  icon?: string
  /** Second line under the label (icon/two-line variant). */
  description?: string
  /** When set the whole row is a link; otherwise it renders as a button. */
  href?: string
  className?: string
}

/**
 * A single setting row. Default variant: [muted label (w-40) | value | chevron].
 * Icon variant: [leading icon | title + description | value | chevron].
 * The entire row is a link (`href`) or a button, and is keyboard accessible.
 */
export function SettingsRow({
  label,
  value,
  icon,
  description,
  href,
  className,
}: SettingsRowProps) {
  const rowClassName = cn(
    "hover:bg-muted/50 focus-visible:ring-ring/50 grid min-h-14 w-full items-center gap-4 px-6 py-3 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset",
    icon
      ? "grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]"
      : "grid-cols-[10rem_minmax(0,1fr)_auto]",
    className
  )

  const content = (
    <>
      {icon && (
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
          <Icon icon={icon} className="size-4.5" aria-hidden />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span
          className={cn("truncate", icon ? "text-foreground font-medium" : "text-muted-foreground")}
        >
          {label}
        </span>
        {description && (
          <span className="text-muted-foreground truncate text-xs">{description}</span>
        )}
      </span>
      <span className="text-foreground min-w-0 truncate">{value}</span>
      <Icon icon="lucide:chevron-right" className="text-muted-foreground" aria-hidden />
    </>
  )

  if (href) {
    return (
      <Link href={href} className={rowClassName}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" className={rowClassName}>
      {content}
    </button>
  )
}
