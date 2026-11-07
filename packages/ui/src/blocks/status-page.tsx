import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

type StatusPageProps = React.ComponentProps<"section"> & {
  /** Short status code shown above the title, e.g. "404". */
  code?: string
  title: string
  description: string
}

/**
 * A full-height status message: not found, error, maintenance. Content-agnostic; the app's
 * `not-found.tsx` / `error.tsx` supply the copy and the actions (as children). No client hooks,
 * so it renders from server and client components alike, including `global-error.tsx`.
 */
export function StatusPage({
  code,
  title,
  description,
  children,
  className,
  ...props
}: StatusPageProps) {
  return (
    <section
      data-slot="status-page"
      className={cn(
        "container flex min-h-[70vh] flex-col items-center justify-center py-24 text-center",
        className
      )}
      {...props}
    >
      <div className="max-w-xl">
        {code && (
          <p className="text-muted-foreground mb-4 font-mono text-sm tracking-widest">{code}</p>
        )}
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="text-muted-foreground mb-8 text-lg text-balance">{description}</p>
        {children && (
          <div
            data-slot="status-page-actions"
            className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            {children}
          </div>
        )}
      </div>
    </section>
  )
}
