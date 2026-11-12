import { Faq } from "@repo/ui/blocks/faq"
import { ArrowLink } from "@repo/ui/components/arrow-link"
import { Button } from "@repo/ui/components/button"
import { Eyebrow } from "@repo/ui/components/eyebrow"
import { Icon } from "@repo/ui/components/icon"
import { MediaClip } from "@repo/ui/components/motion/media-clip"
import { Reveal, RevealItem } from "@repo/ui/components/motion/reveal"
import { Picture } from "@repo/ui/components/picture"
import { SunPanel } from "@repo/ui/components/sun-panel"
import { PauseIcon, PlayIcon } from "@/components/clip-icons"
import { PriceCard } from "@/components/inner/price-card"
import { YogaPractice } from "@/components/inner/yoga-practice"
import { INNER_HREF, innerFor } from "@/content/inner"
import { INNER_PRICES, type InnerServiceId } from "@/content/inner-pricing"
import { clipsFor, INNER_CLIPS, mediaFor, mediaTextFor } from "@/content/media"
import type { Locale } from "@/lib/site-locale"

type InnerServiceViewProps = { id: InnerServiceId; locale: Locale }

/** A short list under its own heading: "För dig som", "Det här arbetar ni mot", "Så går det till". */
function ListBlock({
  id,
  title,
  items,
  ordered = false,
}: {
  id: string
  title: string
  items: readonly string[]
  ordered?: boolean
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col">
      <h2 id={`${id}-title`} className="hyphens-auto text-balance break-words text-3xl">
        {title}
      </h2>
      <Reveal as={ordered ? "ol" : "ul"} stagger={70} className="mt-6 grid gap-3">
        {items.map((item, i) => (
          <RevealItem key={item} as="li" index={i} className="flex gap-3 text-pretty">
            {ordered ? (
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-foreground/20 font-display text-sm"
              >
                {i + 1}
              </span>
            ) : (
              <Icon icon="lucide:check" aria-hidden="true" className="mt-1 size-4 shrink-0" />
            )}
            <span>{item}</span>
          </RevealItem>
        ))}
      </Reveal>
    </section>
  )
}

/**
 * One Ledarskap inifrån service: a hero card (the service's clip over its still, or its photo),
 * who it is for, what you work towards and how it goes, the yoga in practice, the package and its
 * price with the booking buttons, and the service's questions. Every word comes from `inner.tsx`.
 */
export function InnerServiceView({ id, locale }: InnerServiceViewProps) {
  const inner = innerFor(locale)
  const { labels } = inner
  const service = inner.services[id]
  const media = mediaFor(locale)
  const clipKey = INNER_CLIPS[id]
  const clip = clipKey ? clipsFor(locale)[clipKey] : undefined
  const primary = service.startOffering
    ? { label: labels.book.start, href: `/book/${service.startOffering}` }
    : service.groupOffering
      ? { label: labels.book.group, href: `/book/${service.groupOffering}` }
      : undefined
  const frame = "aspect-[4/3] w-full sm:aspect-[16/10] lg:aspect-auto lg:h-full"
  return (
    <main id="main">
      <SunPanel
        as="section"
        aria-labelledby="service-title"
        className="mx-2.5 mt-2.5 overflow-hidden lg:mx-4"
      >
        <div className="grid grid-cols-1 lg:min-h-[min(80vh,48rem)] lg:grid-cols-2">
          <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:order-first lg:px-16 lg:py-16">
            <a
              href={INNER_HREF}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full font-medium text-muted-foreground text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Icon icon="lucide:arrow-left" aria-hidden="true" />
              {labels.back}
            </a>
            <Eyebrow className="mt-6 motion-safe:animate-rise">{labels.trackName}</Eyebrow>
            <h1
              id="service-title"
              className="mt-5 hyphens-auto text-balance break-words text-4xl text-foreground motion-safe:animate-rise motion-safe:[animation-delay:90ms] sm:text-6xl"
            >
              {service.title}
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground motion-safe:animate-rise motion-safe:[animation-delay:180ms]">
              {service.lead}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 motion-safe:animate-rise motion-safe:[animation-delay:270ms]">
              {primary && (
                <Button asChild size="lg" className="h-12 px-6 text-base">
                  <a href={primary.href}>
                    {primary.label}
                    <Icon icon="lucide:arrow-right" aria-hidden="true" />
                  </a>
                </Button>
              )}
              {service.memberOffering && (
                // `shrink` undoes Button's `shrink-0`: the long label wraps at 320 px instead of
                // running past the viewport.
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-auto min-h-12 shrink whitespace-normal bg-background/70 px-6 py-2 text-left text-base backdrop-blur"
                >
                  <a href={`/book/${service.memberOffering}`}>{labels.book.member}</a>
                </Button>
              )}
            </div>
          </div>
          <div className="relative lg:order-last">
            {clip ? (
              <MediaClip
                src={clip.src}
                poster={`/media/${clip.poster.name}.jpg`}
                width={clip.width}
                height={clip.height}
                labels={mediaTextFor(locale).clip}
                icons={{ play: <PlayIcon />, pause: <PauseIcon /> }}
                className={frame}
                toggleClassName="top-4 right-4 lg:top-6 lg:right-6"
                still={
                  <Picture
                    image={clip.poster}
                    priority
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="size-full object-cover"
                  />
                }
              />
            ) : (
              <Picture
                image={media[service.image]}
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className={`${frame} object-cover object-[58%_30%]`}
              />
            )}
          </div>
        </div>
      </SunPanel>

      <div className="container grid grid-cols-1 gap-14 py-20 md:grid-cols-3 md:gap-10 lg:py-28">
        <ListBlock id="for-whom" title={labels.forWhom} items={service.forWhom} />
        <ListBlock id="outcomes" title={labels.outcomes} items={service.outcomes} />
        <ListBlock id="how" title={labels.howItWorks} items={service.howItWorks} ordered />
      </div>

      <YogaPractice
        id="yoga"
        eyebrow={labels.trackName}
        title={labels.yoga}
        body={service.yoga}
        practices={inner.hub.yoga.practices}
        note={inner.hub.yoga.note}
      />

      <div className="px-2.5 lg:px-4">
        <Reveal>
          <PriceCard service={service} prices={INNER_PRICES[id]} labels={labels} locale={locale} />
        </Reveal>
      </div>

      <Reveal>
        <Faq
          id="faq"
          heading={{ title: labels.faq }}
          items={service.faq}
          jsonLd
          className="scroll-mt-(--sticky-header-offset)"
        />
      </Reveal>

      <div className="container pb-24">
        <ArrowLink href={INNER_HREF} label={labels.back} />
      </div>
    </main>
  )
}
