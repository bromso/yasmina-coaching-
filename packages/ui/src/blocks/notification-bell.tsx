import { buttonVariants } from "@repo/ui/components/button"
import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

/** The most the badge shows as a number; anything above reads `99+`. */
export const NOTIFICATION_BELL_CAP = 99

/** The badge's text: nothing for an unknown or zero count, `99+` above the cap. */
export function notificationBadge(count: number | null): string | null {
  if (count === null || count <= 0) return null
  return count > NOTIFICATION_BELL_CAP ? `${NOTIFICATION_BELL_CAP}+` : String(count)
}

type NotificationBellProps = Omit<React.ComponentProps<"a">, "href" | "children"> & {
  /** Unread notifications; `null` when the count could not be read (the bell shows no badge). */
  count: number | null
  /** The notifications page. */
  href: string
  /**
   * The link's accessible name, which the app builds from an ICU plural ("3 unread
   * notifications", "No unread notifications"), or a plain "Notifications" when `count` is null.
   */
  label: string
  /** What the polite live region announces when the count changes; defaults to `label`. */
  liveLabel?: string
  /** The bell links to the page being shown (account's `/notifications`): `aria-current="page"`. */
  current?: boolean
}

/**
 * The header's notification bell: a link to the notifications page with a bell icon and an unread
 * badge capped at `99+`. Content-agnostic (every string is a prop) and a server component with no
 * hooks and no client JavaScript — the count is rendered per request, and a later re-render (a
 * `router.refresh()` or a server action's `refresh()`) updates the badge and the visually hidden
 * polite live region in place, so a changed count is announced without interrupting.
 */
export function NotificationBell({
  count,
  href,
  label,
  liveLabel,
  current = false,
  className,
  ...props
}: NotificationBellProps) {
  const badge = notificationBadge(count)
  return (
    <span data-slot="notification-bell" className="relative inline-flex">
      <a
        href={href}
        aria-label={label}
        aria-current={current ? "page" : undefined}
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative", className)}
        {...props}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </svg>
        {badge && (
          <span
            data-slot="notification-bell-badge"
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[0.625rem] text-primary-foreground leading-none tabular-nums"
          >
            {badge}
          </span>
        )}
      </a>
      <span data-slot="notification-bell-live" role="status" className="sr-only">
        {liveLabel ?? label}
      </span>
    </span>
  )
}
