import { Fraunces, Inter, JetBrains_Mono } from "next/font/google"

/**
 * Canonical fonts for every app in the monorepo — the single point of truth.
 *
 * Apply in each app's root layout:
 *
 *   import { fontVariables } from "@repo/ui/lib/fonts"
 *   <body className={`${fontVariables} font-sans antialiased`}>
 *
 * The variables feed the design-system tokens in globals.css
 * (`--font-sans` / `--font-display` / `--font-mono`), so every utility
 * (`font-sans`, `font-display`, `font-mono`), every h1/h2 and every
 * component renders identically across www, app, auth, and any future
 * subdomain app. Changing the typeface here changes it
 * everywhere. Requires `transpilePackages: ["@repo/ui"]` in each app's
 * next config (next/font extraction happens per-app at build time).
 */
export const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
})

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  preload: false,
})

/**
 * The editorial display serif every app's headlines are set in: `--display-family` (the tokens)
 * reads `--font-display`. Fraunces is a variable font: `opsz` tunes the contrast to the rendered
 * size, `SOFT` rounds the terminals a little.
 */
export const fontDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  preload: true,
  axes: ["opsz", "SOFT"],
})

/**
 * The class names that define every font variable a page needs, for each root layout's `<body>`.
 * `fontMono` stays out, as before: no app applies it, and the `--font-mono` token names its own
 * stack.
 */
export const fontVariables = `${fontSans.variable} ${fontDisplay.variable}`
