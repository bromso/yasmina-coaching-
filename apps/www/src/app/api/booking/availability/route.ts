import { createLogger, REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import { anonymousApi } from "@/lib/api"
import { parseAvailabilityQuery } from "@/lib/booking"

export const dynamic = "force-dynamic"

const logger = createLogger({ service: "www" })
const NO_STORE = { "cache-control": "private, no-store" }

/**
 * The booking calendar's free slots, relayed from `booking.availability` on this origin so the
 * browser never calls `apps/api` (and `connect-src 'self'` holds). The query is checked with the
 * contract's own schema before anything is forwarded; the api's rate limiter is keyed per
 * browser ip, and the answer is never cached.
 */
export async function GET(req: Request): Promise<Response> {
  const query = parseAvailabilityQuery(new URL(req.url).searchParams)
  if (!query.ok) {
    return Response.json(
      { error: { fieldErrors: query.errors } },
      { status: 400, headers: NO_STORE }
    )
  }
  const { ip } = requestInfo(req.headers)
  const client = await anonymousApi(ip, undefined, req.headers.get(REQUEST_ID_HEADER))
  try {
    const availability = await client.booking.availability(query.data)
    return Response.json(availability, { headers: NO_STORE })
  } catch (error) {
    logger.error("booking.availability failed", { error })
    return Response.json(
      { error: { message: "Availability is unavailable right now." } },
      { status: 503, headers: NO_STORE }
    )
  }
}
