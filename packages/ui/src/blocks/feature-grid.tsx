import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"
import { SectionHeading, type SectionHeadingProps } from "../components/section-heading"

export type Feature = { icon?: ReactNode; title: string; description: string }

const cols = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
} as const

export type FeatureGridProps = {
  heading: SectionHeadingProps
  features: Feature[]
  columns?: 2 | 3 | 4
  id?: string
  className?: string
}

/** A heading plus a grid of feature cards, each an `<article>`. */
export function FeatureGrid({ heading, features, columns = 3, id, className }: FeatureGridProps) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className={cn("container py-20", className)}>
      <SectionHeading {...heading} id={headingId} />
      <div className={cn("mt-12 grid gap-8", cols[columns])}>
        {features.map((feature) => (
          <article key={feature.title} className="flex flex-col gap-3">
            {feature.icon && (
              <div
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground"
              >
                {feature.icon}
              </div>
            )}
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-muted-foreground text-sm">{feature.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
