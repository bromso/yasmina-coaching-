import { requestIdFromRequest, unsubscribeTokenClientId } from "@repo/session/client"
import { oneClickRedirect, oneClickResponse } from "@/lib/unsubscribe"
import { unsubscribeApi } from "@/lib/unsubscribe-api"

/**
 * The RFC 8058 one-click unsubscribe endpoint an optional notification mail's `List-Unsubscribe`
 * header names. A mail client posts `List-Unsubscribe=One-Click` form-encoded; any body (or none)
 * works the same, since the token in the query string is all this needs, so the body is never read.
 *
 * Deliberately outside the CSRF same-origin check (`assertSameOrigin`) every other POST here sits
 * behind: the mail provider posts from its own servers, cross-site, with no cookie and no Origin
 * we could check. That is safe because the only thing this can do is turn one optional email type
 * off for the one user the token names — idempotent, never a sign-in, never a locked mail — and a
 * forged request needs the HMAC-signed token itself. (Next's server-action Origin check does not
 * apply to route handlers, and the shared security proxy only adds headers, so neither blocks it.)
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token")
  // Keyed per token, not per poster ip: these POSTs come from mail providers' shared egress
  // addresses, where a per-ip bucket would refuse real unsubscribes at scale (see
  // `unsubscribeTokenClientId`). The api verifies the token before spending any budget, so this
  // is one bucket per real link; a forged token costs one HMAC and spends nothing.
  return oneClickResponse(
    async (plausible) =>
      unsubscribeApi({
        clientId: await unsubscribeTokenClientId(plausible),
        requestId: requestIdFromRequest(req),
      }),
    token
  )
}

/** Opened in a browser (or fetched by a link scanner): only a redirect to the confirm page. */
export function GET(req: Request) {
  return oneClickRedirect(new URL(req.url).searchParams.get("token"))
}
