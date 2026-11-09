import type { Locale } from "@repo/i18n/locales"
import { Faq } from "@repo/ui/blocks/faq"
import { ArrowLink } from "@/components/arrow-link"
import { CredentialsSection } from "@/components/credentials-section"
import { Eyebrow } from "@/components/eyebrow"
import { HeroSection } from "@/components/hero-section"
import { ManifestoSection } from "@/components/manifesto-section"
import { Reveal } from "@/components/motion/reveal"
import { OffersSection } from "@/components/offers-section"
import { Picture } from "@/components/picture"
import { StatementSection } from "@/components/statement-section"
import { StepsSection } from "@/components/steps-section"
import { WaitlistForm } from "@/components/waitlist-form"
import { WhySection } from "@/components/why-section"
import { homeFor } from "@/content/home"
import { clipsFor, mediaFor, mediaTextFor } from "@/content/media"

/** The landing page in `locale`: every section reads its words and alt texts from the content files. */
export function HomeView({ locale }: { locale: Locale }) {
  const home = homeFor(locale)
  const media = mediaFor(locale)
  const clips = clipsFor(locale)
  const text = mediaTextFor(locale)
  return (
    <main id="main">
      <HeroSection {...home.hero} clip={clips.hero} clipLabels={text.clip} />
      <StatementSection
        {...home.statement}
        image={media.sessionLounge}
        caption={text.statementCaption}
      />
      <OffersSection id="coaching" {...home.offers} media={media} />
      {/* Ledarskap inifrån in a few lines: what it is, and the way to its hub. */}
      <section aria-labelledby="inner-title" className="container pb-24 lg:pb-32">
        <Reveal className="grid grid-cols-1 overflow-hidden rounded-4xl bg-sun-soft md:grid-cols-12">
          <Picture
            image={media.innerMeditation}
            small
            className="aspect-[4/3] w-full object-cover object-[62%_40%] md:col-span-5 md:aspect-auto md:h-full"
          />
          <div className="flex flex-col justify-center gap-6 px-6 py-10 sm:px-10 md:col-span-7 lg:px-14 lg:py-16">
            <Eyebrow>{home.inner.eyebrow}</Eyebrow>
            <h2
              id="inner-title"
              className="hyphens-auto text-balance break-words text-4xl sm:text-5xl"
            >
              {home.inner.title}
            </h2>
            <p className="text-pretty text-lg text-muted-foreground">{home.inner.description}</p>
            <ArrowLink href={home.inner.link.href} label={home.inner.link.label} />
          </div>
        </Reveal>
      </section>
      <ManifestoSection {...home.manifesto} label={text.manifestoLabel} />
      <WhySection
        id="about"
        {...home.why}
        clip={clips.about}
        still={media.portraitPark}
        clipLabels={text.clip}
      />
      <StepsSection id="how" {...home.steps} />
      <CredentialsSection {...home.credentials} labels={text.credentials} />
      <Reveal>
        <Faq
          id="faq"
          heading={home.faq.heading}
          items={home.faq.items}
          jsonLd
          className="scroll-mt-24"
        />
      </Reveal>
      <div id="contact" className="scroll-mt-24 px-2.5 pb-2.5 lg:px-4 lg:pb-4">
        <Reveal className="relative overflow-hidden rounded-4xl bg-linear-to-b from-sun-soft via-sun to-sun px-6 py-24 lg:py-32">
          {/* On wide screens a small portrait leans into the band's right edge; the form keeps its centre. */}
          <Picture
            image={media.portraitOutdoors}
            small
            className="absolute top-1/2 right-10 hidden w-56 -translate-y-1/2 rotate-2 rounded-3xl object-cover shadow-lg xl:block 2xl:right-24 2xl:w-64"
          />
          <WaitlistForm
            title={home.contact.title}
            description={home.contact.description}
            buttonLabel={home.contact.button}
            legal={home.contact.legal}
            emailLabel={home.contact.emailLabel}
            placeholder={home.contact.placeholder}
          />
        </Reveal>
      </div>
    </main>
  )
}
