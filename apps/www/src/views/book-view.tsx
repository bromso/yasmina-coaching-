import {
  BOOKING_AUDIENCES,
  type BookingAudience,
  OFFERINGS,
} from "@repo/api-contract/booking-limits"
import type { Locale } from "@repo/i18n/locales"
import { Icon } from "@repo/ui/components/icon"
import { ArrowLink } from "@/components/arrow-link"
import { Eyebrow } from "@/components/eyebrow"
import { Reveal, RevealItem } from "@/components/motion/reveal"
import { Picture } from "@/components/picture"
import { bookingFor, priceLineFor } from "@/content/booking"
import { mediaFor, OFFERING_MEDIA } from "@/content/media"
import { cn } from "@/lib/utils"

type BookViewProps = { audience: BookingAudience; locale: Locale }

/**
 * The catalog: a private/organisation toggle (plain links, so it works without JavaScript) over
 * the content's headed groups (leadership coaching, then Ledarskap inifrån), each with one card
 * per offering the audience can book: its photo, how it is booked and its price line. Members'
 * sessions are in no group, so they are never listed (their pages still open from a link). The
 * cards rise in turn as they come into view and lift a touch on hover.
 */
export function BookView({ audience, locale }: BookViewProps) {
  const booking = bookingFor(locale)
  const { audienceHints, audienceLabels, locationLabels } = booking.form
  const media = mediaFor(locale)
  const groups = booking.catalogGroups
    .map((group) => ({
      ...group,
      keys: group.keys.filter((key) => OFFERINGS[key].audiences.includes(audience)),
    }))
    .filter((group) => group.keys.length > 0)
  return (
    <main id="main">
      <section aria-labelledby="book-title" className="container py-16 lg:py-24">
        <div className="max-w-3xl">
          <Eyebrow>{booking.catalog.eyebrow}</Eyebrow>
          <h1
            id="book-title"
            className="mt-5 scroll-mt-24 text-balance text-4xl sm:text-5xl lg:text-6xl"
          >
            {booking.catalog.title}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            {booking.catalog.description}
          </p>
        </div>

        <nav aria-label={booking.catalog.audienceLegend} className="mt-10">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
            {booking.catalog.audienceLegend}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {BOOKING_AUDIENCES.map((option) => {
              const active = option === audience
              return (
                <li key={option}>
                  <a
                    href={`/book?for=${option}`}
                    aria-current={active ? "page" : undefined}
                    title={audienceHints[option]}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-5 font-medium text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-foreground"
                    )}
                  >
                    {audienceLabels[option]}
                  </a>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-muted-foreground text-sm">{audienceHints[audience]}</p>
        </nav>

        {groups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`catalog-${group.id}-title`}
            className="mt-16 first-of-type:mt-12"
          >
            <h2
              id={`catalog-${group.id}-title`}
              className="hyphens-auto text-balance break-words text-3xl sm:text-4xl"
            >
              {group.title}
            </h2>
            <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">{group.description}</p>
            <Reveal
              as="ul"
              stagger={80}
              className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
            >
              {group.keys.map((key, i) => {
                const offering = OFFERINGS[key]
                const copy = booking.offerings[key]
                const titleId = `offering-${key}-title`
                return (
                  <RevealItem key={key} as="li" index={i} className="group">
                    <article
                      aria-labelledby={titleId}
                      className="flex h-full flex-col gap-5 rounded-4xl bg-sun-soft p-6 transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1 sm:p-8"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-background/60">
                        <Picture
                          image={media[OFFERING_MEDIA[key]]}
                          small
                          className="size-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{booking.kindLines[offering.kind]}</span>
                        <span className="text-muted-foreground text-xs">
                          {offering.sessions > 1
                            ? `${offering.sessions} × ${offering.durationMinutes} min`
                            : `${offering.durationMinutes} min`}
                        </span>
                      </div>
                      <h3
                        id={titleId}
                        className="hyphens-auto break-words font-display text-3xl leading-tight"
                      >
                        {copy.title}
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {copy.description}
                      </p>
                      <ul className="grid gap-1.5 text-sm">
                        {copy.included.map((line) => (
                          <li key={line} className="flex gap-2">
                            <Icon
                              icon="lucide:check"
                              aria-hidden="true"
                              className="mt-0.5 size-4 shrink-0"
                            />
                            {line}
                          </li>
                        ))}
                      </ul>
                      <p className="text-muted-foreground text-xs">
                        {offering.locations.map((l) => locationLabels[l]).join(" · ")}
                      </p>
                      <div className="mt-auto grid gap-4 pt-2">
                        <p className="text-muted-foreground text-xs">
                          {priceLineFor(key, audience, locale)}
                        </p>
                        <ArrowLink
                          href={`/book/${key}?for=${audience}`}
                          label={booking.kindLines[offering.kind]}
                          className="w-fit"
                        />
                      </div>
                    </article>
                  </RevealItem>
                )
              })}
            </Reveal>
          </section>
        ))}

        <p className="mt-12 text-muted-foreground">
          {booking.catalog.introCall.lead}{" "}
          <a
            href={booking.catalog.introCall.href}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {booking.catalog.introCall.label}
          </a>
        </p>
      </section>
    </main>
  )
}
