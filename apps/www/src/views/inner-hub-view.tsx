import { Faq } from "@repo/ui/blocks/faq"
import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { ArrowLink } from "@/components/arrow-link"
import { Eyebrow } from "@/components/eyebrow"
import { ServiceCard } from "@/components/inner/service-card"
import { YogaPractice } from "@/components/inner/yoga-practice"
import { Reveal, RevealItem } from "@/components/motion/reveal"
import { Picture } from "@/components/picture"
import { INNER_SERVICE_IDS, innerFor, innerServiceHref } from "@/content/inner"
import { mediaFor } from "@/content/media"
import type { Locale } from "@/lib/site-locale"

/**
 * Ledarskap inifrån's hub, in the home page's rhythm: a hero card with Yasmina's photo, one
 * sentence set large, what the goals can be about, the four services as photo cards (the hero
 * links to them as `#services`), the yoga in practice, the start-and-membership model as a
 * timeline in a sun glow, the yoga certification, the research page, questions and a booking
 * band. Every word comes from `inner.tsx`.
 */
export function InnerHubView({ locale }: { locale: Locale }) {
  const { hub, services } = innerFor(locale)
  const media = mediaFor(locale)
  return (
    <main id="main">
      <section
        aria-labelledby="hub-title"
        className="mx-2.5 mt-2.5 overflow-hidden rounded-4xl bg-sun-soft lg:mx-4"
      >
        <div className="grid grid-cols-1 lg:min-h-[min(84vh,52rem)] lg:grid-cols-2">
          <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 lg:py-16">
            <Eyebrow className="motion-safe:animate-rise">{hub.hero.eyebrow}</Eyebrow>
            <h1
              id="hub-title"
              className="mt-5 hyphens-auto text-balance break-words text-5xl text-foreground motion-safe:animate-rise motion-safe:[animation-delay:90ms] sm:text-6xl lg:text-7xl"
            >
              {hub.hero.title}
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground motion-safe:animate-rise motion-safe:[animation-delay:180ms]">
              {hub.hero.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 motion-safe:animate-rise motion-safe:[animation-delay:270ms]">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-base">
                <a href={hub.hero.primary.href}>
                  {hub.hero.primary.label}
                  <Icon icon="lucide:arrow-down" aria-hidden="true" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full bg-background/70 px-6 text-base backdrop-blur"
              >
                <a href={hub.hero.secondary.href}>{hub.hero.secondary.label}</a>
              </Button>
            </div>
          </div>
          <Picture
            image={media[hub.hero.image]}
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="aspect-[4/3] w-full object-cover object-[62%_40%] sm:aspect-[16/10] lg:aspect-auto lg:h-full"
          />
        </div>
      </section>

      <div className="container py-24 lg:py-32">
        <Reveal
          as="p"
          className="mx-auto max-w-4xl text-balance text-center font-display text-3xl leading-snug sm:text-4xl lg:text-5xl"
        >
          {hub.statement}
        </Reveal>
      </div>

      <section aria-labelledby="outcomes-title" className="container pb-24 lg:pb-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <Eyebrow>{hub.outcomes.heading.eyebrow}</Eyebrow>
            <h2
              id="outcomes-title"
              className="mt-5 hyphens-auto text-balance break-words text-4xl sm:text-5xl"
            >
              {hub.outcomes.heading.title}
            </h2>
            <p className="mt-5 text-pretty text-lg text-muted-foreground">
              {hub.outcomes.heading.description}
            </p>
          </Reveal>
          <Reveal as="ul" stagger={70} className="grid gap-4 lg:col-span-7 lg:pt-10">
            {hub.outcomes.items.map((item, i) => (
              <RevealItem
                key={item}
                as="li"
                index={i}
                className="flex gap-4 border-foreground/15 border-b pb-4 text-lg dark:border-border/70"
              >
                <Icon icon="lucide:check" aria-hidden="true" className="mt-1.5 size-4 shrink-0" />
                <span className="text-pretty">{item}</span>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      <section
        id="services"
        aria-labelledby="services-title"
        className="scroll-mt-24 bg-linear-to-b from-background via-sun-soft to-background py-24 lg:py-32"
      >
        <div className="container">
          <Reveal className="max-w-3xl">
            <Eyebrow>{hub.services.heading.eyebrow}</Eyebrow>
            <h2
              id="services-title"
              className="mt-5 hyphens-auto text-balance break-words text-4xl sm:text-5xl"
            >
              {hub.services.heading.title}
            </h2>
            <p className="mt-5 text-pretty text-lg text-muted-foreground">
              {hub.services.heading.description}
            </p>
          </Reveal>
          <Reveal
            as="ul"
            stagger={90}
            className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4"
          >
            {INNER_SERVICE_IDS.map((id, i) => {
              const service = services[id]
              return (
                <RevealItem key={id} as="li" index={i} className="group">
                  <ServiceCard
                    href={innerServiceHref(service.slug)}
                    title={service.title}
                    lead={service.lead}
                    image={media[service.image]}
                    more={hub.services.more}
                  />
                </RevealItem>
              )
            })}
          </Reveal>
        </div>
      </section>

      <YogaPractice
        id="yoga"
        eyebrow={hub.yoga.heading.eyebrow}
        title={hub.yoga.heading.title}
        description={hub.yoga.heading.description}
        body={hub.yoga.body}
        practices={hub.yoga.practices}
        note={hub.yoga.note}
      />

      {/* Full-bleed, so the timeline's glow is clipped at the viewport's edges. */}
      <div className="overflow-x-clip">
        <section aria-labelledby="model-title" className="container py-24 lg:py-32">
          <Reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow>{hub.model.heading.eyebrow}</Eyebrow>
            <h2
              id="model-title"
              className="mt-5 hyphens-auto text-balance break-words text-4xl sm:text-5xl"
            >
              {hub.model.heading.title}
            </h2>
            <p className="mt-5 text-pretty text-lg text-muted-foreground">
              {hub.model.heading.description}
            </p>
          </Reveal>
          <div className="relative isolate mt-16 px-2 py-14 sm:px-10 lg:py-20">
            {/* The sun glow behind the timeline; the wrapper's `overflow-x: clip` keeps it from scrolling sideways. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-[12%] -inset-y-[25%] -z-10 bg-[radial-gradient(closest-side,var(--sun)_0%,var(--sun-soft)_55%,transparent_100%)] opacity-90 blur-3xl"
            />
            <Reveal
              as="ol"
              stagger={110}
              className="mx-auto grid max-w-6xl grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8"
            >
              {hub.model.steps.map((step, i) => (
                <RevealItem key={step.title} as="li" index={i} className="flex flex-col">
                  <span
                    aria-hidden="true"
                    className="flex size-12 items-center justify-center rounded-full border border-foreground/20 bg-background/60 font-display text-lg"
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-5 font-display text-2xl">{step.title}</h3>
                  <p className="mt-3 text-pretty text-muted-foreground">{step.description}</p>
                </RevealItem>
              ))}
            </Reveal>
          </div>
        </section>
      </div>

      <section aria-labelledby="certification-title" className="container pb-24 lg:pb-32">
        <Reveal className="grid grid-cols-1 gap-10 rounded-4xl border border-foreground/15 p-6 sm:p-10 lg:grid-cols-12 lg:p-14 dark:border-border/70">
          <div className="lg:col-span-5">
            <Eyebrow>{hub.certification.eyebrow}</Eyebrow>
            <h2
              id="certification-title"
              className="mt-5 hyphens-auto text-balance break-words text-4xl"
            >
              {hub.certification.title}
            </h2>
          </div>
          <div className="flex flex-col gap-5 lg:col-span-7">
            <p className="text-pretty font-display text-2xl leading-snug">
              {hub.certification.line}
            </p>
            <p className="text-pretty text-muted-foreground">{hub.certification.body}</p>
          </div>
        </Reveal>
      </section>

      <section aria-labelledby="research-title" className="container pb-24 lg:pb-32">
        <Reveal className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <h2
            id="research-title"
            className="hyphens-auto text-balance break-words text-4xl sm:text-5xl lg:col-span-6"
          >
            {hub.research.title}
          </h2>
          <div className="flex flex-col gap-6 lg:col-span-6">
            <p className="text-pretty text-lg text-muted-foreground">{hub.research.description}</p>
            <ArrowLink href={hub.research.link.href} label={hub.research.link.label} />
          </div>
        </Reveal>
      </section>

      <Reveal>
        <Faq
          id="faq"
          heading={hub.faq.heading}
          items={hub.faq.items}
          jsonLd
          className="scroll-mt-24"
        />
      </Reveal>

      <div className="px-2.5 pb-2.5 lg:px-4 lg:pb-4">
        <Reveal className="rounded-4xl bg-linear-to-b from-sun-soft via-sun to-sun px-6 py-20 text-center lg:py-28">
          <section aria-labelledby="cta-title" className="mx-auto max-w-2xl">
            <h2
              id="cta-title"
              className="hyphens-auto text-balance break-words text-4xl sm:text-5xl"
            >
              {hub.cta.title}
            </h2>
            <p className="mt-5 text-pretty text-lg text-foreground/80">{hub.cta.description}</p>
            <Button asChild size="lg" className="mt-8 h-12 rounded-full px-6 text-base">
              <a href={hub.cta.button.href}>
                {hub.cta.button.label}
                <Icon icon="lucide:arrow-right" aria-hidden="true" />
              </a>
            </Button>
          </section>
        </Reveal>
      </div>
    </main>
  )
}
