import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"
import { SectionHeading, type SectionHeadingProps } from "../components/section-heading"

export type PricingTier = {
  name: string
  price: string
  period?: string
  description?: string
  features: string[]
  cta: { label: string; href: string }
  highlighted?: boolean
}

export type PricingProps = {
  heading: SectionHeadingProps
  tiers: PricingTier[]
  note?: ReactNode
  id?: string
  className?: string
}

/** The CTA's accessible name: the tier appended unless the visible label already names it. */
function ctaLabel({ cta, name }: PricingTier): string | undefined {
  return cta.label.toLowerCase().includes(name.toLowerCase())
    ? undefined
    : `${cta.label} with ${name}`
}

const cols = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3" } as const

/** A heading plus a tier grid — one card per plan, the highlighted tier badged and ringed. */
export function Pricing({ heading, tiers, note, id, className }: PricingProps) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className={cn("container py-20", className)}>
      <SectionHeading {...heading} id={headingId} />
      <div className={cn("mt-12 grid gap-8", cols[Math.min(tiers.length, 3) as 1 | 2 | 3])}>
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "relative flex flex-col rounded-xl border p-6",
              tier.highlighted && "ring-2 ring-primary"
            )}
          >
            {tier.highlighted && <Badge className="absolute -top-3 left-6">Most popular</Badge>}
            <h3 className="font-semibold">{tier.name}</h3>
            <p>
              <span className="font-semibold text-4xl">{tier.price}</span>
              {tier.period && <span className="text-muted-foreground"> {tier.period}</span>}
            </p>
            {tier.description && (
              <p className="mt-2 text-muted-foreground text-sm">{tier.description}</p>
            )}
            <ul className="mt-6 flex flex-col gap-2 text-sm">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Icon icon="lucide:check" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button asChild variant={tier.highlighted ? "default" : "outline"} className="mt-auto">
              <a href={tier.cta.href} aria-label={ctaLabel(tier)}>
                {tier.cta.label}
              </a>
            </Button>
          </div>
        ))}
      </div>
      {note && <p className="mt-8 text-center text-muted-foreground text-sm">{note}</p>}
    </section>
  )
}
