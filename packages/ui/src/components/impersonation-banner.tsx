import { cn } from "@repo/ui/lib/utils"

export type ImpersonationBannerProps = {
  name: string
  email: string
  reason: string
  expiresAt: string
  /** The auth app's /admin/stop; a plain link so the banner has no client code. */
  stopUrl: string
  className?: string
  /** The banner's words, in the page's language; English by default. */
  labels?: { viewingAs: string; ends: string; stop: string }
  /** The end time as the page's language writes it; `formatEndsAt(expiresAt)` by default. */
  endsAtText?: string
}

const ENGLISH = { viewingAs: "Viewing as", ends: "ends", stop: "Stop impersonating" }

// A fixed zone: the layout renders this on the server and hydrates it in whatever zone the
// browser has — the text must be identical in both.
const time = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
})
export const formatEndsAt = (iso: string) => `${time.format(new Date(iso))} UTC`

/** The amber bar, stuck to the top of the viewport, above every header while a superadmin is viewing as someone else. */
export function ImpersonationBanner({
  name,
  email,
  reason,
  expiresAt,
  stopUrl,
  className,
  labels = ENGLISH,
  endsAtText,
}: ImpersonationBannerProps) {
  const who = name ? `${name} (${email})` : email
  return (
    <div
      role="status"
      data-slot="impersonation-banner"
      className={cn(
        "sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
        className
      )}
    >
      <span>
        {/* Template literals keep the text nodes the literals had, so the markup is unchanged. */}
        {`${labels.viewingAs} `}
        <strong className="font-semibold">{who}</strong>
        {` · ${labels.ends}`}{" "}
        <time dateTime={expiresAt}>{endsAtText ?? formatEndsAt(expiresAt)}</time> · {reason}
      </span>
      <a href={stopUrl} className="font-medium underline underline-offset-4">
        {labels.stop}
      </a>
    </div>
  )
}
