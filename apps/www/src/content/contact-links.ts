/** The contact page's own path, which every "contact" link on the site points at. */
export const CONTACT_HREF = "/kontakt"
/** Where the contact form lands after sending (`?ref=`, `?for=`, `?need=`, `?when=`). */
export const CONTACT_DONE_HREF = "/kontakt/tack"

/**
 * The contact page from a link on `from` (a root-relative path: `/`, `/book`, `/blog/<slug>`),
 * carried as `?from=` into the lead's `page`, so Yasmina sees where the visitor was. The page
 * keeps it only when it is a lowercase path (`leadPage`); anything else reads as `/kontakt`.
 */
export const contactFrom = (from: string) => `${CONTACT_HREF}?from=${from}`
