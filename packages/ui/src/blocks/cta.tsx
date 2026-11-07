import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"

export type CtaProps = {
  title: string
  description?: string
  actions: ReactNode
  id?: string
  className?: string
}

/** A call-to-action band: title, optional description, and actions. */
export function Cta({ title, description, actions, id, className }: CtaProps) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className={cn("container py-20", className)}>
      <div className="rounded-2xl bg-primary px-6 py-16 text-center text-primary-foreground">
        <h2
          id={headingId}
          className="text-balance font-semibold text-3xl tracking-tight md:text-4xl"
        >
          {title}
        </h2>
        {description && (
          <p className="mx-auto mt-4 max-w-xl text-balance opacity-90">{description}</p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      </div>
    </section>
  )
}
