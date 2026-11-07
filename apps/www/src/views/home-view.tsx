import type { Locale } from "@repo/i18n/locales"
import { Faq } from "@repo/ui/blocks/faq"
import { CredentialsSection } from "@/components/credentials-section"
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
