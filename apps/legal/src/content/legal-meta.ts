/**
 * The legal app's name and one-sentence description per language, with no imports:
 * `content/ui.ts` reads it, and so does `app/manifest.ts`, which `scripts/pwa.test.ts` loads before
 * any `bun install` — so nothing here may import a package.
 */
export const LEGAL_META = {
  sv: {
    title: "Juridisk information",
    shortName: "Juridik",
    description:
      "Integritet och cookies, villkor och bokningsregler, tillgänglighet och kontaktuppgifter för Yasmina Peterssons webbplats.",
  },
  en: {
    title: "Legal information",
    shortName: "Legal",
    description:
      "Privacy and cookies, terms and booking rules, accessibility and contact details for Yasmina Petersson's site.",
  },
} as const
