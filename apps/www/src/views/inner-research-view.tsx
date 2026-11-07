import { Icon } from "@repo/ui/components/icon"
import { ArrowLink } from "@/components/arrow-link"
import { Eyebrow } from "@/components/eyebrow"
import { Reveal } from "@/components/motion/reveal"
import { INNER_HREF, innerFor } from "@/content/inner"
import type { Locale } from "@/lib/site-locale"

/**
 * "Så vet vi": what research shows (each claim with its numbered sources, linking down to the
 * list), what it does not show, and the fourteen sources with their DOI links.
 */
export function InnerResearchView({ locale }: { locale: Locale }) {
  const { research, labels } = innerFor(locale)
  const text = labels.research
  return (
    <main id="main">
      <article aria-labelledby="research-title" className="container max-w-4xl py-16 lg:py-24">
        <a
          href={INNER_HREF}
          className="inline-flex min-h-11 items-center gap-2 rounded-full font-medium text-muted-foreground text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon icon="lucide:arrow-left" aria-hidden="true" />
          {text.back}
        </a>
        <Eyebrow className="mt-8">{text.eyebrow}</Eyebrow>
        <h1
          id="research-title"
          className="mt-5 hyphens-auto text-balance break-words text-4xl sm:text-5xl lg:text-6xl"
        >
          {text.title}
        </h1>
        <p className="mt-6 text-pretty text-lg text-muted-foreground">{research.intro}</p>

        <section aria-labelledby="findings-title" className="mt-16">
          <h2 id="findings-title" className="text-balance text-3xl sm:text-4xl">
            {text.findings}
          </h2>
          <Reveal as="ul" className="mt-8 grid gap-4">
            {research.findings.map((finding) => (
              <li
                key={finding.claim}
                className="rounded-3xl bg-sun-soft px-6 py-5 text-pretty leading-relaxed"
              >
                {finding.claim}{" "}
                <span className="whitespace-nowrap text-muted-foreground text-sm">
                  [
                  {finding.sources.map((n, i) => (
                    <span key={n}>
                      {i > 0 && ", "}
                      <a
                        href={`#ref-${n}`}
                        className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {n}
                      </a>
                    </span>
                  ))}
                  ]
                </span>
              </li>
            ))}
          </Reveal>
        </section>

        <section aria-labelledby="limits-title" className="mt-16">
          <h2 id="limits-title" className="text-balance text-3xl sm:text-4xl">
            {text.limits}
          </h2>
          <Reveal as="ul" className="mt-8 grid gap-4">
            {research.limits.map((limit) => (
              <li
                key={limit}
                className="flex gap-4 border-foreground/15 border-b pb-4 text-pretty dark:border-border/70"
              >
                <Icon icon="lucide:minus" aria-hidden="true" className="mt-1.5 size-4 shrink-0" />
                <span>{limit}</span>
              </li>
            ))}
          </Reveal>
        </section>

        <section aria-labelledby="references-title" className="mt-16">
          <h2 id="references-title" className="text-balance text-3xl sm:text-4xl">
            {text.references}
          </h2>
          <ol className="mt-8 grid gap-5 text-sm">
            {research.references.map((ref) => (
              <li
                key={ref.n}
                id={`ref-${ref.n}`}
                value={ref.n}
                className="flex scroll-mt-24 gap-3 break-words"
              >
                <span aria-hidden="true" className="w-6 shrink-0 font-display text-base">
                  {ref.n}.
                </span>
                <span className="min-w-0">
                  {ref.text}{" "}
                  <a
                    href={ref.url}
                    className="break-all underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {ref.url}
                  </a>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-16">
          <ArrowLink href={INNER_HREF} label={text.back} />
        </div>
      </article>
    </main>
  )
}
