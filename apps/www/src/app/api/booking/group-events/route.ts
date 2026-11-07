import { GROUP_OFFERING_KEYS, type OfferingKey } from "@repo/api-contract/booking-limits"
import { createLogger, REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import { anonymousApi } from "@/lib/api"

export const dynamic = "force-dynamic"

const logger = createLogger({ service: "www" })
const NO_STORE = { "cache-control": "private, no-store" }

const groupKeys: readonly string[] = GROUP_OFFERING_KEYS

/**
 * Upcoming events with seats left for one group offering (`?offering=`, the plain group when
 * absent), relayed from `booking.groupEvents` on this origin (the browser never calls
 * `apps/api`). Anything but a group offering is a 400; never cached.
 */
export async function GET(req: Request): Promise<Response> {
  const offering = new URL(req.url).searchParams.get("offering") ?? "group"
  if (!groupKeys.includes(offering)) {
    return Response.json(
      { error: { message: "Unknown group offering." } },
      { status: 400, headers: NO_STORE }
    )
  }
  const { ip } = requestInfo(req.headers)
  const client = await anonymousApi(ip, undefined, req.headers.get(REQUEST_ID_HEADER))
  try {
    const result = await client.booking.groupEvents({ offering: offering as OfferingKey })
    return Response.json(result, { headers: NO_STORE })
  } catch (error) {
    logger.error("booking.groupEvents failed", { error })
    return Response.json(
      { error: { message: "Upcoming dates are unavailable right now." } },
      { status: 503, headers: NO_STORE }
    )
  }
}
