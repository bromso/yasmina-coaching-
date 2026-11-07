/** The query flag the layout reads to say a language change could not be saved. */
export const LOCALE_ERROR_PARAM = "locale_error"

/**
 * Where the language switcher's action sends the browser back to: the page it was on, from the
 * `Referer`, but only when that is this app's own origin (anything else, or none, is `/`), as a
 * path — never a protocol-relative `//host`. `failed` adds `locale_error=1`; a success drops an
 * earlier one.
 */
export function localeReturnPath(
  referer: string | null | undefined,
  authUrl: string,
  { failed = false }: { failed?: boolean } = {}
): string {
  let path = "/"
  let params = new URLSearchParams()
  try {
    const url = new URL(referer ?? "")
    if (url.origin === new URL(authUrl).origin && !url.pathname.startsWith("//")) {
      path = url.pathname
      params = url.searchParams
    }
  } catch {
    // Not a URL: back to the start.
  }
  params.delete(LOCALE_ERROR_PARAM)
  if (failed) params.set(LOCALE_ERROR_PARAM, "1")
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
