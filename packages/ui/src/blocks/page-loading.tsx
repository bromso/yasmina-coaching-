import { Spinner } from "@repo/ui/components/spinner"
import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

type PageLoadingProps = React.ComponentProps<"div"> & {
  /** Read by screen readers; the spinner itself is decorative. */
  label?: string
}

/**
 * What a nested route segment shows while it suspends, rendered by that segment's `loading.tsx`.
 * Never at an app's root, nor directly above pages whose forms revalidate (CLAUDE.md, Status pages).
 */
export function PageLoading({ label = "Loading…", className, ...props }: PageLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="page-loading"
      className={cn("flex min-h-[50vh] items-center justify-center", className)}
      {...props}
    >
      {/* Spinner sets its own role/label; the wrapper is the single status region. */}
      <Spinner className="size-6" role="presentation" aria-label={undefined} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
