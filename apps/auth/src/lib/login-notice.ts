import type { AuthT } from "./i18n"

type Params = Record<string, string | string[] | undefined>

/**
 * The note above the sign-in form, from the query the other apps send here: a forced re-sign-in,
 * a password just changed, a sign-out, or an account just scheduled for deletion (`deleted=1`,
 * whose sessions all ended — signing in again is how its owner cancels).
 */
export function loginNotice(params: Params, t: AuthT): string | undefined {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  if (first(params.reauth) === "1") return t("login.reauth")
  if (params.reset) return t("login.passwordChanged")
  if (params.signedout) return t("login.signedOut")
  if (first(params.deleted) === "1") return t("login.deleted")
  return undefined
}
