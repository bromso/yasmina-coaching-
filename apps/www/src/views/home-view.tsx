import { siteUrl } from "@repo/sites"
import { Cta } from "@repo/ui/blocks/cta"
import { Faq } from "@repo/ui/blocks/faq"
import { FeatureGrid } from "@repo/ui/blocks/feature-grid"
import { Hero } from "@repo/ui/blocks/hero"
import { LogoCloud } from "@repo/ui/blocks/logo-cloud"
import { Pricing } from "@repo/ui/blocks/pricing"
import { Testimonials } from "@repo/ui/blocks/testimonials"
import { Button } from "@repo/ui/components/button"
import { Background } from "@/components/background"
import { PricingViewTracker } from "@/components/pricing-view-tracker"
import { WaitlistForm } from "@/components/waitlist-form"
import { home } from "@/content/home"

// Demo quotes stay visibly labelled until they are replaced by real ones.
const testimonials = home.testimonials.items.map(({ placeholder, ...item }) =>
  placeholder ? { ...item, role: `${item.role} · Example` } : item
)

export function HomeView() {
  return (
    <main id="main">
      <Background>
        <Hero
          {...home.hero}
          actions={
            <>
              <Button asChild>
                <a href={siteUrl("app")}>Open app</a>
              </Button>
              <Button asChild variant="outline">
                <a href={siteUrl("docs")}>Read the docs</a>
              </Button>
            </>
          }
        />
      </Background>
      <LogoCloud title={home.logos.title} logos={home.logos.items} />
      <FeatureGrid id="features" heading={home.features.heading} features={home.features.items} />
      <Testimonials heading={home.testimonials.heading} items={testimonials} />
      <PricingViewTracker>
        <Pricing
          id="pricing"
          heading={home.pricing.heading}
          tiers={home.pricing.tiers}
          note={home.pricing.note}
        />
      </PricingViewTracker>
      <Faq id="faq" heading={home.faq.heading} items={home.faq.items} jsonLd />
      <Cta
        title={home.cta.title}
        description={home.cta.description}
        actions={
          <Button asChild size="lg">
            <a href={home.cta.href}>{home.cta.label}</a>
          </Button>
        }
      />
      <WaitlistForm title={home.newsletter.title} description={home.newsletter.description} />
    </main>
  )
}
