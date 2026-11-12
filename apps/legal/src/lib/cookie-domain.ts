/**
 * The `Domain` of the cookies the legal app writes in the browser (cookie consent, the `locale`
 * its language link sets), read at build time since the app is static. Production without
 * COOKIE_DOMAIN writes host-only cookies, so the choices are not shared with the other
 * subdomains — see the README. Server-only: client components get it as a prop.
 */
export const cookieDomain =
  process.env.COOKIE_DOMAIN ||
  (process.env.NODE_ENV === "production" ? undefined : ".brand.localhost")
