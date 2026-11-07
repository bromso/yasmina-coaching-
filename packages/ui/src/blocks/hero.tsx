import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

interface HeroProps extends React.HTMLAttributes<HTMLElement> {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}

export function Hero({ className, eyebrow, title, description, actions, ...props }: HeroProps) {
  return (
    <section
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-24 text-center",
        className
      )}
      {...props}
    >
      {eyebrow && (
        <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </span>
      )}
      <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
        {title}
      </h1>
      {description && (
        <p className="max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
          {description}
        </p>
      )}
      {actions && <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </section>
  )
}
