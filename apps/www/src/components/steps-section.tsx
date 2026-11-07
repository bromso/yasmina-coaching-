import { Eyebrow } from "@/components/eyebrow"
import { Reveal, RevealItem } from "@/components/motion/reveal"
import type { HomeContent } from "@/content/home"

type StepsSectionProps = HomeContent["steps"] & { id: string }

/** The three steps inside a sun disc: an ordered list (so the sequence survives without the styling), rising one by one. */
export function StepsSection({ id, heading, items }: StepsSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 container py-24 lg:py-32"
    >
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>{heading.eyebrow}</Eyebrow>
        <h2 id={`${id}-title`} className="mt-5 text-balance text-4xl sm:text-5xl">
          {heading.title}
        </h2>
        {heading.description && (
          <p className="mt-5 text-pretty text-lg text-muted-foreground">{heading.description}</p>
        )}
      </Reveal>
      <div className="relative isolate mt-16 px-6 py-16 sm:px-12 lg:py-24">
        {/*
          The sun glow: a soft, blurred light behind the steps with no box around it. It spills
          past the section on purpose; the page clips it at the viewport edges (`overflow-x: clip`
          on body), so it never scrolls sideways.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-[12%] -inset-y-[35%] -z-10 bg-[radial-gradient(closest-side,var(--sun)_0%,var(--sun-soft)_55%,transparent_100%)] opacity-90 blur-3xl"
        />
        <Reveal
          as="ol"
          stagger={120}
          className="mx-auto grid max-w-5xl gap-12 sm:grid-cols-3 sm:gap-8"
        >
          {items.map((step, i) => (
            <RevealItem
              key={step.number}
              as="li"
              index={i}
              className="flex flex-col items-center text-center"
            >
              <span
                aria-hidden="true"
                className="flex size-14 items-center justify-center rounded-full border border-foreground/20 font-display text-xl"
              >
                {step.number}
              </span>
              <h3 className="mt-6 font-display text-3xl">{step.title}</h3>
              <p className="mt-3 max-w-xs text-pretty text-muted-foreground">{step.description}</p>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
