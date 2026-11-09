import { Eyebrow } from "@/components/eyebrow"
import { Reveal } from "@/components/motion/reveal"

type YogaPracticeProps = {
  id: string
  eyebrow?: string
  title: string
  description?: string
  /** How the yoga is used: the hub's general text, or one service's own. */
  body: string
  /** The practices used in the sessions, shown as small pills. */
  practices: readonly string[]
  /** That the practices are never a performance. */
  note: string
}

/**
 * "Yogan i praktiken": the conversation is the core and yoga's principles the frame. The text
 * sits beside a sun glow carrying the practices as pills; the same on the hub and every service
 * page, with the service's own paragraph there.
 */
export function YogaPractice({
  id,
  eyebrow,
  title,
  description,
  body,
  practices,
  note,
}: YogaPracticeProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="container scroll-mt-24 py-20 lg:py-28"
    >
      <Reveal className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2
            id={`${id}-title`}
            className="mt-5 hyphens-auto text-balance break-words text-4xl sm:text-5xl"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-5 text-pretty text-lg text-muted-foreground">{description}</p>
          )}
          <p className="mt-6 text-pretty text-lg leading-relaxed">{body}</p>
        </div>
        <div className="relative isolate px-6 py-12 lg:col-span-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-[10%] -z-10 bg-[radial-gradient(closest-side,var(--sun)_0%,var(--sun-soft)_55%,transparent_100%)] opacity-90 blur-3xl"
          />
          <ul className="flex flex-wrap justify-center gap-3">
            {practices.map((practice) => (
              <li
                key={practice}
                className="rounded-full border border-foreground/20 bg-background/70 px-5 py-2.5 font-display text-lg backdrop-blur"
              >
                {practice}
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-8 max-w-xs text-center text-muted-foreground text-sm">{note}</p>
        </div>
      </Reveal>
    </section>
  )
}
