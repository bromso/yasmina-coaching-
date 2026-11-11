import { Eyebrow } from "@repo/ui/components/eyebrow"
import { Reveal, RevealItem } from "@repo/ui/components/motion/reveal"
import { Picture } from "@repo/ui/components/picture"
import type { HomeContent } from "@/content/home"
import { type MediaImage, type MediaKey, OFFER_MEDIA } from "@/content/media"

type OffersSectionProps = HomeContent["offers"] & {
  id: string
  /** Every photo, alt texts in the page's language. */
  media: Record<MediaKey, MediaImage>
}

/**
 * The four formats, each a card with a photo, the serif numeral as a small badge over its
 * corner, a title and two lines. The cards rise one after the other as the row comes into view;
 * on hover a card lifts a touch and its photo grows a little (CSS, `motion-safe` only).
 */
export function OffersSection({ id, heading, items, media }: OffersSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-(--sticky-header-offset) bg-linear-to-b from-background via-sun-soft to-background py-24 lg:py-32"
    >
      <div className="container">
        <Reveal className="max-w-3xl">
          <Eyebrow>{heading.eyebrow}</Eyebrow>
          <h2 id={`${id}-title`} className="mt-5 text-balance text-4xl sm:text-5xl">
            {heading.title}
          </h2>
        </Reveal>
        <Reveal
          as="ul"
          stagger={90}
          className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4"
        >
          {items.map((item, i) => {
            const image = media[OFFER_MEDIA[i % OFFER_MEDIA.length] ?? "sessionLounge"]
            return (
              <RevealItem key={item.number} as="li" index={i} className="group">
                <div className="flex flex-col gap-5 transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-sun-soft sm:aspect-[4/5]">
                    <Picture
                      image={image}
                      small
                      className="size-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute bottom-4 left-4 rounded-full bg-background/85 px-3.5 py-1.5 font-display text-foreground text-lg leading-none backdrop-blur"
                    >
                      {item.number}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl leading-tight">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </RevealItem>
            )
          })}
        </Reveal>
      </div>
    </section>
  )
}
