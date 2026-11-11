"use client"

import { useReveal } from "@repo/ui/components/motion/reveal"
import { type CSSProperties, Fragment, useRef } from "react"
import { cn } from "@/lib/utils"

type ManifestoTextProps = {
  /** The first sentence, in full colour. */
  lead: string
  /** The rest of the paragraph, a step lighter. */
  rest: string
  className?: string
}

/** How long each word waits after the previous one, in ms: ~45 words, about a second and a half. */
const STEP = 28

/**
 * The manifesto paragraph: when it scrolls into view its lead sentence turns from muted to
 * full colour one word after the other, and the rest follows, fading in behind it. One shot,
 * not scrubbed by scroll; the server's HTML and reduced motion get the finished paragraph.
 * Every hidden word is either in the muted colour (lead) or at opacity zero (rest), so the
 * paragraph never shows text below the contrast minimum, not even mid-animation.
 */
export function ManifestoText({ lead, rest, className }: ManifestoTextProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const phase = useReveal(ref)
  const animated = phase !== "static"
  const leadWords = words(lead, 0)
  const restWords = words(rest, leadWords.length)
  return (
    <p ref={ref} className={className}>
      <span className="text-foreground">
        {leadWords.map(({ word, at, order, last }) => (
          <Fragment key={at}>
            <span
              className={cn(
                animated && "transition-colors duration-500 ease-out",
                phase === "hidden" && "text-muted-foreground"
              )}
              style={animated ? delayStyle(order) : undefined}
            >
              {word}
            </span>
            {!last && " "}
          </Fragment>
        ))}
      </span>{" "}
      <span className="text-muted-foreground">
        {restWords.map(({ word, at, order, last }) => (
          <Fragment key={at}>
            <span
              className={cn(
                animated && "transition-opacity duration-500 ease-out",
                phase === "hidden" && "opacity-0"
              )}
              style={animated ? delayStyle(order) : undefined}
            >
              {word}
            </span>
            {!last && " "}
          </Fragment>
        ))}
      </span>
    </p>
  )
}

type Word = {
  word: string
  /** Character offset in its sentence: a stable key even where a word repeats. */
  at: number
  /** Place in the whole paragraph's stagger. */
  order: number
  last: boolean
}

function words(text: string, first: number): Word[] {
  const parts = text.split(" ")
  const out: Word[] = []
  let at = 0
  for (const word of parts) {
    out.push({ word, at, order: first + out.length, last: out.length === parts.length - 1 })
    at += word.length + 1
  }
  return out
}

const delayStyle = (order: number): CSSProperties => ({ transitionDelay: `${order * STEP}ms` })
