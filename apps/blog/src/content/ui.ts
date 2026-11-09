import { localePrefix, type PostLocale } from "@repo/content/posts"
import { BLOG_META } from "@/content/blog-meta"
import { ROOT_LOCALE } from "@/lib/blog-core"

export { ROOT_LOCALE }

/**
 * Every word the blog's own chrome says, in Swedish and English: the header's links, the index
 * hero, the list and post pages, the closing call to action and the feeds' titles. The shared
 * pieces (skip link, theme toggle, nav landmarks, cookie banner, footer groups) come from
 * `@repo/i18n`'s `ui` catalog instead (`translatorFor(locale, "ui")`). Plain data and pure
 * functions, read at build time by server components only.
 */

/** The blog's two languages. Swedish is served at the root, English under `/en`. */
export const BLOG_LOCALES = ["sv", "en"] as const satisfies readonly PostLocale[]
export type BlogLocale = (typeof BLOG_LOCALES)[number]

/** `""` for Swedish, `"/en"` for English: the start of every list, tag, author and feed path. */
export function prefixFor(locale: BlogLocale): string {
  return localePrefix(locale, ROOT_LOCALE)
}

/** The other language. */
export function otherLocale(locale: BlogLocale): BlogLocale {
  return locale === "sv" ? "en" : "sv"
}

/**
 * How each language's tags read. A tag is a kebab-case ASCII slug (`aterhamtning`, `from-within`),
 * which is its address (`/tags/aterhamtning`, `/en/tags/from-within`); this is what the reader
 * sees on the cards, the post header and the tag page. Swedish posts use the Swedish slugs,
 * English posts the English ones. A tag missing here shows as its slug.
 */
export const TAG_LABELS: Record<BlogLocale, Record<string, string>> = {
  sv: {
    aterhamtning: "återhämtning",
    coachning: "coachning",
    forskning: "forskning",
    inifran: "Ledarskap inifrån",
    kris: "kris",
    ledarskap: "ledarskap",
    medarbetare: "medarbetare",
    mentorskap: "mentorskap",
    reflektion: "reflektion",
    samtal: "samtal",
  },
  en: {
    coaching: "coaching",
    conversations: "conversations",
    crisis: "crisis",
    employees: "employees",
    "from-within": "Leading from within",
    leadership: "leadership",
    mentoring: "mentoring",
    recovery: "recovery",
    reflection: "reflection",
    research: "research",
  },
}

/** A tag as the reader sees it in `locale`, or the slug itself when it has no label. */
export function tagLabel(locale: BlogLocale, tag: string): string {
  return Object.hasOwn(TAG_LABELS[locale], tag) ? (TAG_LABELS[locale][tag] ?? tag) : tag
}

export type BlogUi = {
  /** The `Intl` locale dates are written in. */
  dateLocale: string
  /** Open Graph's `og:locale`. */
  ogLocale: string
  /** The blog's name: the `<title>` default, the feeds' title, the OG image. */
  title: string
  /** One sentence for the whole blog: `<meta name="description">` and every feed. */
  description: string
  /** A tag slug as the reader sees it (`TAG_LABELS`). */
  tag: (slug: string) => string
  header: {
    /** www's Ledarskap inifrån page. */
    inner: string
    /** www's booking page. */
    book: string
    /** The language link, written in the *other* language, and its accessible name. */
    language: { label: string; name: string }
  }
  hero: { eyebrow: string; title: string; lead: string }
  list: {
    /** The index's accessible heading over the cards past page 1. */
    page: (n: number) => string
    empty: string
    pagination: string
    newer: string
    older: string
    tagTitle: (tag: string) => string
    tagDescription: (tag: string) => string
  }
  post: {
    featured: string
    readingTime: (minutes: number) => string
    updated: string
    toc: string
    prevNext: string
    newer: string
    older: string
    related: string
  }
  cta: { title: string; text: string; button: string }
  legal: { terms: string; privacy: string }
  /** The 404 page (`src/app/global-not-found.tsx`). */
  notFound: { title: string; description: string; back: string }
}

export const UI: Record<BlogLocale, BlogUi> = {
  sv: {
    dateLocale: "sv-SE",
    ogLocale: "sv_SE",
    tag: (slug) => tagLabel("sv", slug),
    title: BLOG_META.sv.title,
    description: BLOG_META.sv.description,
    header: {
      inner: "Ledarskap inifrån",
      book: "Boka",
      language: { label: "In English", name: "Read in English" },
    },
    hero: {
      eyebrow: "Bloggen",
      title: "Anteckningar om ledarskap",
      lead: "Om att leda människor, och sig själv. Om coaching, mentorskap och samtalen som gör skillnad, också när det blåser.",
    },
    list: {
      page: (n) => `Inlägg, sida ${n}`,
      empty: "Inga inlägg än.",
      pagination: "Sidor",
      newer: "Nyare inlägg",
      older: "Äldre inlägg",
      tagTitle: (tag) => `Inlägg om ${tag}`,
      tagDescription: (tag) => `Alla inlägg taggade med ”${tag}”.`,
    },
    post: {
      featured: "Senast",
      readingTime: (minutes) => `${minutes} min läsning`,
      updated: "Uppdaterad",
      toc: "På sidan",
      prevNext: "Fler inlägg",
      newer: "Nyare",
      older: "Äldre",
      related: "Läs vidare",
    },
    cta: {
      title: "Vill du prata om ditt ledarskap?",
      text: "Introsamtalet tar 30 minuter och kostar ingenting. Vi pratar om var du står och om coaching kan hjälpa, innan du bestämmer dig.",
      button: "Be om ett kostnadsfritt introsamtal",
    },
    legal: { terms: "Villkor", privacy: "Integritet" },
    notFound: {
      title: "Sidan finns inte",
      description: "Sidan du letar efter finns inte, eller har flyttat.",
      back: "Till bloggen",
    },
  },
  en: {
    dateLocale: "en-GB",
    ogLocale: "en_GB",
    tag: (slug) => tagLabel("en", slug),
    title: BLOG_META.en.title,
    description: BLOG_META.en.description,
    header: {
      inner: "Leading from within",
      book: "Book",
      language: { label: "På svenska", name: "Läs på svenska" },
    },
    hero: {
      eyebrow: "The blog",
      title: "Notes on leadership",
      lead: "On leading people, and yourself. On coaching, mentoring and the conversations that make a difference, when the wind picks up too.",
    },
    list: {
      page: (n) => `Posts, page ${n}`,
      empty: "No posts yet.",
      pagination: "Pages",
      newer: "Newer posts",
      older: "Older posts",
      tagTitle: (tag) => `Posts about ${tag}`,
      tagDescription: (tag) => `Every post tagged “${tag}”.`,
    },
    post: {
      featured: "Latest",
      readingTime: (minutes) => `${minutes} min read`,
      updated: "Updated",
      toc: "On this page",
      prevNext: "More posts",
      newer: "Newer",
      older: "Older",
      related: "Read on",
    },
    cta: {
      title: "Want to talk about your leadership?",
      text: "The intro call takes 30 minutes and is free. We talk about where you are and whether coaching can help, before you decide.",
      button: "Ask for a free intro call",
    },
    legal: { terms: "Terms", privacy: "Privacy" },
    notFound: {
      title: "Page not found",
      description: "The page you're looking for doesn't exist or has moved.",
      back: "Back to the blog",
    },
  },
}
