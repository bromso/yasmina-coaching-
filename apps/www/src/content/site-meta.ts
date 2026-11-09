/**
 * The site's name line and one-sentence description per language, with no imports: the home
 * page's metadata reads it (`home.tsx`), and so does `app/manifest.ts`, which
 * `scripts/pwa.test.ts` loads before any `bun install` — so nothing here may import a package.
 */
export const SITE_META = {
  sv: {
    title: "Ledarskapscoaching",
    description:
      "Ledarskapscoaching, teamutveckling och handledning för chefer inom socialtjänst, vård och skola, med Yasmina Petersson. Varberg och online.",
  },
  en: {
    title: "Leadership coaching",
    description:
      "Leadership coaching, team development and supervision for managers in social services, healthcare and schools, with Yasmina Petersson. Varberg and online.",
  },
} as const
