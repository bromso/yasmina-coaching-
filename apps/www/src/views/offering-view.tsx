import {
  type BookingAudience,
  OFFERINGS,
  type OfferingKey,
} from "@repo/api-contract/booking-limits"
import type { Locale } from "@repo/i18n/locales"
import { Eyebrow } from "@repo/ui/components/eyebrow"
import { Icon } from "@repo/ui/components/icon"
import { MediaClip } from "@repo/ui/components/motion/media-clip"
import { Picture } from "@repo/ui/components/picture"
import { SunPanel } from "@repo/ui/components/sun-panel"
import { GroupBooking } from "@/components/booking/group-booking"
import { InstantBooking } from "@/components/booking/instant-booking"
import { LocaleProvider } from "@/components/booking/locale-provider"
import { RequestForm } from "@/components/booking/request-form"
import { PauseIcon, PlayIcon } from "@/components/clip-icons"
import { amountFor, bookingFor, priceLineFor } from "@/content/booking"
import { clipsFor, mediaFor, mediaTextFor, OFFERING_CLIPS, OFFERING_MEDIA } from "@/content/media"
import { flowFor } from "@/lib/booking-flow"

type OfferingViewProps = {
  offering: OfferingKey
  audience: BookingAudience
  /** `?package=<id>`: an extra session on an existing programme (instant kinds only). */
  packageId?: string
  /** Tomorrow in the booking zone, the request form's earliest date. */
  minDate: string
  locale: Locale
}

/**
 * One offering: its photo (or, for the keynote, its clip over the still) and copy on the left,
 * the journey for its kind in a sun card on the right (`flowFor`: its steps, and whether it has a
 * payment step, priced from `amountFor`).
 */
export function OfferingView({
  offering,
  audience,
  packageId,
  minDate,
  locale,
}: OfferingViewProps) {
  const booking = bookingFor(locale)
  const spec = OFFERINGS[offering]
  const copy = booking.offerings[offering]
  const clipKey = OFFERING_CLIPS[offering]
  const clip = clipKey ? clipsFor(locale)[clipKey] : undefined
  const frame = "aspect-[16/10] w-full object-cover lg:aspect-[4/3]"
  const flow = flowFor(offering, packageId)
  const price = amountFor(offering)
  return (
    <main id="main">
      <section aria-labelledby="offering-title" className="container py-16 lg:py-24">
        <a
          href={`/book?for=${audience}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full font-medium text-muted-foreground text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon icon="lucide:arrow-left" aria-hidden="true" />
          {booking.offering.back}
        </a>
        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
          <div>
            <SunPanel className="mb-8 overflow-hidden">
              {clip ? (
                <MediaClip
                  src={clip.src}
                  poster={`/media/${clip.poster.name}.jpg`}
                  width={clip.width}
                  height={clip.height}
                  labels={mediaTextFor(locale).clip}
                  icons={{ play: <PlayIcon />, pause: <PauseIcon /> }}
                  className="aspect-[16/10] w-full lg:aspect-[4/3]"
                  toggleClassName="top-4 right-4"
                  still={<Picture image={clip.poster} className="size-full object-cover" />}
                />
              ) : (
                <Picture
                  image={mediaFor(locale)[OFFERING_MEDIA[offering]]}
                  small
                  className={frame}
                />
              )}
            </SunPanel>
            <Eyebrow>{booking.kindLines[spec.kind]}</Eyebrow>
            <h1
              id="offering-title"
              className="mt-5 scroll-mt-(--sticky-header-offset) hyphens-auto text-balance break-words text-3xl sm:text-5xl"
            >
              {copy.title}
            </h1>
            <p className="mt-6 text-pretty text-lg text-muted-foreground">{copy.description}</p>
            <p className="mt-4 text-muted-foreground text-sm">{booking.kindExplained[spec.kind]}</p>
            <ul className="mt-8 grid gap-2 text-sm">
              {copy.included.map((line) => (
                <li key={line} className="flex gap-2">
                  <Icon icon="lucide:check" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-muted-foreground text-sm">
              {priceLineFor(offering, audience, locale)}
            </p>
          </div>
          <SunPanel className="min-w-0 p-4 sm:p-8 lg:p-10">
            <LocaleProvider locale={locale}>
              {spec.kind === "instant" && (
                <InstantBooking
                  offering={offering}
                  audiences={spec.audiences}
                  locations={spec.locations}
                  sessions={spec.sessions}
                  initialAudience={audience}
                  packageId={packageId}
                  title={copy.title}
                  price={price}
                  flow={flow === "member" ? "member" : "instant"}
                />
              )}
              {spec.kind === "group" && (
                <GroupBooking
                  offering={offering}
                  audiences={spec.audiences}
                  initialAudience={audience}
                  title={copy.title}
                  price={price}
                />
              )}
              {spec.kind === "request" && (
                <RequestForm offering={offering} locations={spec.locations} minDate={minDate} />
              )}
            </LocaleProvider>
          </SunPanel>
        </div>
      </section>
    </main>
  )
}
