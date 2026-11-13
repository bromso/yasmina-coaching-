import type { Locale } from "@repo/i18n/locales"

/**
 * The words the layout's own chrome says around every page, in Swedish and English: the
 * navigation's labels and its booking note, the contact link, the footer's legal line and the
 * language switcher. The shared pieces (skip link, theme toggle, sign-in link, cookie banner,
 * footer groups) come from the `ui` catalog instead (`translatorFor(locale, "ui")`).
 */
export type SiteChrome = {
  book: string
  bookNote: { title: string; detail: string }
  contact: string
  nav: {
    explore: string
    close: string
    offerings: string
    previous: string
    next: string
    current: string
    overview: string
  }
  legal: { privacy: string; terms: string; accessibility: string; contact: string }
  switcher: { label: string }
}

export const SITE: Record<Locale, SiteChrome> = {
  sv: {
    book: "Boka",
    bookNote: {
      title: "Kostnadsfritt introsamtal",
      detail: "30 minuter i telefon, innan du bestämmer dig",
    },
    contact: "Kontakta Yasmina",
    nav: {
      explore: "Utforska",
      close: "Stäng menyn",
      offerings: "Sätt att arbeta med Yasmina",
      previous: "Föregående",
      next: "Nästa",
      current: "Du är här",
      overview: "På sidan",
    },
    legal: {
      privacy: "Integritet",
      terms: "Villkor",
      accessibility: "Tillgänglighet",
      contact: "Kontakt",
    },
    switcher: { label: "Språk" },
  },
  en: {
    book: "Book",
    bookNote: {
      title: "Free intro call",
      detail: "30 minutes by phone, before you decide",
    },
    contact: "Contact Yasmina",
    nav: {
      explore: "Explore",
      close: "Close menu",
      offerings: "Ways to work with Yasmina",
      previous: "Previous",
      next: "Next",
      current: "You are here",
      overview: "On this page",
    },
    legal: {
      privacy: "Privacy",
      terms: "Terms",
      accessibility: "Accessibility",
      contact: "Contact",
    },
    switcher: { label: "Language" },
  },
}

export const siteFor = (locale: Locale): SiteChrome => SITE[locale]
