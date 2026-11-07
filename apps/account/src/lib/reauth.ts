import { loadEnv } from "@repo/session"
import { siteUrl } from "@repo/sites"

/**
 * The auth app's sign-in form, forced even for a signed-in visitor, then back to `path` on this
 * app: where a page action sends a session the api says is too old for what it asked.
 */
export function reauthHref(path: string) {
  const { AUTH_URL } = loadEnv(["AUTH_URL"])
  const next = `${siteUrl("account")}${path}`
  return `${AUTH_URL}/login?reauth=1&next=${encodeURIComponent(next)}`
}
