import { cn } from "@repo/ui/lib/utils"

export type DeletionBannerProps = {
  /** When the account will be purged (ISO 8601). */
  deletionScheduledAt: string
  /** The app's `cancelDeletion` server action; a plain form post, so it works without JavaScript. */
  cancel: (formData: FormData) => void | Promise<void>
  className?: string
  /** The banner's words, in the page's language; English by default. */
  labels?: { cancel: string }
  /** The whole sentence as the page's language writes it, date included; English by default. */
  text?: string
}

// A fixed zone, as the impersonation banner's time: server and client must print the same date.
const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" })
export const formatDeletionText = (iso: string) =>
  `Your account will be deleted on ${date.format(new Date(iso))}.`

/** The red bar above every header while the signed-in account is scheduled for deletion. */
export function DeletionBanner({
  deletionScheduledAt,
  cancel,
  className,
  labels = { cancel: "Cancel deletion" },
  text,
}: DeletionBannerProps) {
  return (
    <div
      role="status"
      data-slot="deletion-banner"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-red-300 bg-red-100 px-4 py-2 text-center text-sm text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
        className
      )}
    >
      <span>{text ?? formatDeletionText(deletionScheduledAt)}</span>
      <form action={cancel}>
        <button type="submit" className="cursor-pointer font-medium underline underline-offset-4">
          {labels.cancel}
        </button>
      </form>
    </div>
  )
}
