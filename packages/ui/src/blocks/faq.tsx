import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/accordion"
import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"
import { SectionHeading, type SectionHeadingProps } from "../components/section-heading"

export type FaqItem = { question: string; answer: ReactNode }

/** Structured data only for string answers — rich answers have no clean text form. */
function faqJsonLd(items: FaqItem[]): string | null {
  const entity = items
    .filter((i): i is { question: string; answer: string } => typeof i.answer === "string")
    .map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    }))
  if (entity.length === 0) return null
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entity,
  })
}

export type FaqProps = {
  heading: SectionHeadingProps
  items: FaqItem[]
  jsonLd?: boolean
  id?: string
  className?: string
}

/** A heading plus an accordion of questions; `jsonLd` emits FAQPage structured data for string answers. */
export function Faq({ heading, items, jsonLd = false, id, className }: FaqProps) {
  const headingId = useId()
  const ld = jsonLd ? faqJsonLd(items) : null
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("container max-w-3xl py-20", className)}
    >
      <SectionHeading {...heading} id={headingId} />
      <Accordion type="single" collapsible className="mt-10">
        {items.map((item, i) => (
          <AccordionItem key={item.question} value={`item-${i}`}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {ld && (
        // No biome-ignore needed: this repo's Biome config (recommended preset, no `security`
        // domain enabled) does not flag `dangerouslySetInnerHTML` — this is `JSON.stringify`
        // output of our own typed data (escaped below), never user HTML.
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ld.replace(/</g, "\\u003c") }}
        />
      )}
    </section>
  )
}
