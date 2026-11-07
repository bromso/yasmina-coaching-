// Zero DOM, zero zod, zero dependencies: this is the one implementation of the consent cookie
// rule shared by `browser.ts` (reads `document.cookie`) and `server.ts` (reads the `Cookie`
// header) — both are "name=value; name2=value2" strings, so one parser does both. It must stay
// DOM-free: `server.ts` is imported by every signed-in app's `/api/analytics` route, which in turn
// gets typechecked transitively by workspaces with no "dom" lib (e.g. `apps/ai`, a Bun service
// with no browser) — see server.ts's own history for the regression this caused when consent
// parsing briefly lived only in `browser.ts` and was imported from there instead.
// Duplicated from `@repo/ui/lib/consent` so this package stays React/Next-free.
export type Consent = "all" | "necessary" | null

export function readConsent(cookie: string): Consent {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.split("=")
    if (name?.trim() !== "consent") continue
    const value = rest.join("=").trim()
    if (value === "all" || value === "necessary") return value
  }
  return null
}
