/**
 * The indexable pages. `/book/<offering>`, `/book/done`, `/kontakt/tack`, the token manage pages
 * and the old legal pages (they redirect to the legal app) are not listed.
 */
export const PUBLIC_ROUTES = [
  "/",
  "/inifran",
  "/inifran/coachning",
  "/inifran/mentorskap",
  "/inifran/livsstil",
  "/inifran/grupp",
  "/inifran/forskning",
  "/book",
  "/kontakt",
] as const
