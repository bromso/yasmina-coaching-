"use client"

import "@/styles/globals.css"

import ErrorPage from "./error"

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Replaces the root layout when the layout itself throws, so it owns <html> and <body>. Fonts and
 * the theme provider live in that layout and are not retried here; the default palette is fine
 * for a last-resort page.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="sv" data-scroll-behavior="smooth">
      <body className="antialiased">
        <ErrorPage error={error} reset={reset} />
      </body>
    </html>
  )
}
