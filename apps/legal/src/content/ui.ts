import type { LegalLocale } from "@repo/sites/legal"
import { LEGAL_META } from "./legal-meta"

/**
 * Every word the legal app's own chrome says, in Swedish and English. The shared pieces (skip
 * link, theme toggle, nav landmarks, cookie banner, footer groups) come from `@repo/i18n`'s `ui`
 * catalog instead (`translatorFor(locale, "ui")`). Plain data, read at build time by server
 * components only.
 */

/** The app's two languages. Swedish is served at the root, English under `/en`. */
export const LEGAL_LOCALES = ["sv", "en"] as const satisfies readonly LegalLocale[]

/** The language served at the root. */
export const ROOT_LOCALE: LegalLocale = "sv"

export type LegalUi = {
  /** Open Graph's `og:locale`. */
  ogLocale: string
  /** The app's name: the `<title>` default, the index heading, the OG image. */
  title: string
  /** One sentence for the whole app: `<meta name="description">`. */
  description: string
  /** The index's heading over the list of pages. */
  pages: string
  /** The footer's legal line. */
  legal: { privacy: string; terms: string; accessibility: string }
  /** The 404 page (`src/app/global-not-found.tsx`). */
  notFound: { title: string; description: string; back: string }
}

export const UI: Record<LegalLocale, LegalUi> = {
  sv: {
    ogLocale: "sv_SE",
    title: LEGAL_META.sv.title,
    description: LEGAL_META.sv.description,
    pages: "Sidor",
    legal: { privacy: "Integritet", terms: "Villkor", accessibility: "Tillgänglighet" },
    notFound: {
      title: "Sidan finns inte",
      description: "Sidan du letar efter finns inte, eller har flyttat.",
      back: "Till juridisk information",
    },
  },
  en: {
    ogLocale: "en_GB",
    title: LEGAL_META.en.title,
    description: LEGAL_META.en.description,
    pages: "Pages",
    legal: { privacy: "Privacy", terms: "Terms", accessibility: "Accessibility" },
    notFound: {
      title: "Page not found",
      description: "The page you're looking for doesn't exist or has moved.",
      back: "Back to legal information",
    },
  },
}
