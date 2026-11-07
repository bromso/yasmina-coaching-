import { Inter, JetBrains_Mono } from "next/font/google"

/**
 * Canonical fonts for every app in the monorepo — the single point of truth.
 *
 * Apply in each app's root layout:
 *
 *   import { fontSans } from "@repo/ui/lib/fonts"
 *   <body className={`${fontSans.variable} font-sans antialiased`}>
 *
 * The variables feed the design-system tokens in globals.css
 * (`--font-sans` / `--font-mono`), so every utility (`font-sans`,
 * `font-mono`) and component renders identically across www, app, auth,
 * and any future subdomain app. Changing the typeface here changes it
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
