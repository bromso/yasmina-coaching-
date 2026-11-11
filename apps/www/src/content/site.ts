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
  legal: { terms: string; privacy: string; contact: string }
  switcher: { label: string; submit: string }
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
    legal: { terms: "Villkor", privacy: "Integritet", contact: "Kontakt" },
    switcher: { label: "Språk", submit: "Byt" },
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
    legal: { terms: "Terms", privacy: "Privacy", contact: "Contact" },
    switcher: { label: "Language", submit: "Change" },
  },
}

export const siteFor = (locale: Locale): SiteChrome => SITE[locale]
