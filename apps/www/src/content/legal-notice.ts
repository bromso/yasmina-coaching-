import type { Locale } from "@repo/i18n/locales"
import type { LegalSection } from "@repo/ui/blocks/legal-page"

/** One legal page in one language: its headings, its date and its sections. */
export type LegalDoc = {
  /** The page's h1. */
  title: string
  /** The `<title>`'s own part (`… · Yasmina Petersson`). */
  metaTitle: string
  updatedAt: string
  sections: LegalSection[]
}

/** The words `LegalPage` shows around the sections, and the date's language, per locale. */
export const LEGAL_CHROME: Record<
  Locale,
  { notice: string; lastUpdated: string; contents: string; dateLocale: string }
> = {
  sv: {
    notice:
      "Det här är en mall, inte juridisk rådgivning. Låt en jurist granska den innan den publiceras.",
    lastUpdated: "Senast uppdaterad",
    contents: "Innehåll",
    dateLocale: "sv-SE",
  },
  en: {
    notice: "This is a template, not legal advice — review it with counsel before publishing.",
    lastUpdated: "Last updated",
    contents: "Contents",
    dateLocale: "en-GB",
  },
}
