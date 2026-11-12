import { Fraunces, Inter, JetBrains_Mono } from "next/font/google"

/**
 * Canonical fonts for every app in the monorepo — the single point of truth.
 *
 * Apply in each app's root layout:
 *
 *   import { fontVariables } from "@repo/ui/lib/fonts"
 *   <html className={fontVariables}>
 *     <body className="font-sans antialiased">
 *
 * next/font sets `--font-inter` and `--font-fraunces`, which the typeface tokens
 * (`--typeface-sans`, `--typeface-display`, `packages/tokens`) name first, so every utility
 * (`font-sans`, `font-display`), every h1/h2 and every component renders identically across the
 * apps. They go on `<html>`: the tokens are declared on `:root`, and a custom property resolves
 * where it is declared, so on `<body>` they would come too late. Changing the typeface here
 * changes it everywhere. Requires `transpilePackages: ["@repo/ui"]` in each app's next config
 * (next/font extraction happens per-app at build time).
 */
export const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
})

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
})

/**
 * The editorial display serif every app's headlines are set in: `--typeface-display` (the tokens)
 * reads `--font-fraunces`. Fraunces is a variable font: `opsz` tunes the contrast to the rendered
 * size, `SOFT` rounds the terminals a little.
 */
export const fontDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  preload: true,
  axes: ["opsz", "SOFT"],
})

/**
 * The class names that define every font variable a page needs, for each root layout's `<html>`.
 * `fontMono` stays out, as before: no app applies it, and the `--typeface-mono` token names its
 * own stack.
 */
export const fontVariables = `${fontSans.variable} ${fontDisplay.variable}`
