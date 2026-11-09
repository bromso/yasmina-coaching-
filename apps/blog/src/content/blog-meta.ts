/**
 * The blog's name and one-sentence description per language, with no imports: `content/ui.ts`
 * reads it, and so does `app/manifest.ts`, which `scripts/pwa.test.ts` loads before any
 * `bun install` — so nothing here may import a package.
 */
export const BLOG_META = {
  sv: {
    title: "Anteckningar om ledarskap",
    shortName: "Blogg",
    description:
      "Yasmina Peterssons anteckningar om ledarskap, coaching och mentorskap: om att leda människor, och sig själv, också när det blåser.",
  },
  en: {
    title: "Notes on leadership",
    shortName: "Blog",
    description:
      "Yasmina Petersson's notes on leadership, coaching and mentoring: on leading people, and yourself, when the wind picks up too.",
  },
} as const
