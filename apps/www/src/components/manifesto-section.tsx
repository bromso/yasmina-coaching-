import { ManifestoText } from "@/components/motion/manifesto-text"
import type { HomeContent } from "@/content/home"

type ManifestoSectionProps = HomeContent["manifesto"] & {
  /** The section's accessible name. */
  label: string
}

/**
 * A paragraph set large: the first sentence in full colour, the rest a step lighter. As it
 * scrolls into view the words turn on one after the other (see `ManifestoText`).
 */
export function ManifestoSection({ lead, rest, label }: ManifestoSectionProps) {
  return (
    <section aria-label={label} className="container py-24 lg:py-32">
      <ManifestoText
        lead={lead}
        rest={rest}
        className="ml-auto max-w-4xl text-balance font-display text-3xl leading-snug sm:text-4xl lg:text-5xl"
      />
    </section>
  )
}
