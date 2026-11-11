import type { Locale } from "@repo/i18n/locales"
import { Eyebrow } from "@repo/ui/components/eyebrow"
import { Picture } from "@repo/ui/components/picture"
import { SunPanel } from "@repo/ui/components/sun-panel"
import { ContactForm } from "@/components/contact/contact-form"
import { contactFor } from "@/content/contact"
import { mediaFor } from "@/content/media"

type ContactViewProps = {
  /** The www page the visitor came from (already checked by the page), sent with the form. */
  page: string
  locale: Locale
}

/**
 * `/kontakt`: who Yasmina is, what happens after you write and when you hear back, beside the
 * three-step contact form in a sun card (the booking pages' layout).
 */
export function ContactView({ page, locale }: ContactViewProps) {
  const copy = contactFor(locale)
  return (
    <main id="main">
      <section aria-labelledby="contact-title" className="container py-16 lg:py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16">
          <div>
            <SunPanel className="mb-8 overflow-hidden">
              <Picture
                image={mediaFor(locale).portraitOffice}
                small
                priority
                className="aspect-[4/5] w-full object-cover object-top lg:aspect-[3/4]"
              />
            </SunPanel>
            <Eyebrow>{copy.hero.eyebrow}</Eyebrow>
            <h1
              id="contact-title"
              className="mt-5 scroll-mt-24 hyphens-auto text-balance break-words text-4xl sm:text-5xl"
            >
              {copy.hero.title}
            </h1>
            <p className="mt-6 text-pretty text-lg text-muted-foreground">{copy.hero.lead}</p>
            <p className="mt-4 text-pretty text-muted-foreground">{copy.hero.after}</p>
            <p className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-background/70 px-4 py-3 font-medium">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 7v5l3 2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {copy.hero.response}
            </p>
          </div>
          <SunPanel className="min-w-0 p-4 sm:p-8 lg:p-10">
            <ContactForm locale={locale} page={page} />
          </SunPanel>
        </div>
      </section>
    </main>
  )
}
