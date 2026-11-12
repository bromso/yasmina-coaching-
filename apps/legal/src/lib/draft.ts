/**
 * Whether the legal pages are still drafts awaiting a lawyer's review: on unless `LEGAL_DRAFT`
 * is exactly `false`. Read at build time (the app is static), so turning it off is a rebuild.
 * While on, every page shows the draft notice, every layout sends `noindex`, and robots.txt
 * disallows the whole app.
 */
export function isDraft(env: Record<string, string | undefined> = process.env): boolean {
  return env.LEGAL_DRAFT !== "false"
}
