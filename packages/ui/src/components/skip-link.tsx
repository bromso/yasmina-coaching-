/**
 * Accessibility skip link (WCAG 2.4.1) — first element inside <body> in
 * every app's root layout. Pair with id="main" on the page's main landmark.
 */
export function SkipLink({
  targetId = "main",
  label = "Skip to content",
}: {
  targetId?: string
  /** The link's text, in the page's language. */
  label?: string
}) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-md"
    >
      {label}
    </a>
  )
}
