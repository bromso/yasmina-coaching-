import { createLogger, REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import { anonymousApi } from "@/lib/api"

export const dynamic = "force-dynamic"

const logger = createLogger({ service: "www" })
const NO_STORE = { "cache-control": "private, no-store" }

/**
 * Upcoming group events with seats left, relayed from `booking.groupEvents` on this origin (the
 * browser never calls `apps/api`). No input; never cached.
 */
export async function GET(req: Request): Promise<Response> {
  const { ip } = requestInfo(req.headers)
  const client = await anonymousApi(ip, undefined, req.headers.get(REQUEST_ID_HEADER))
  try {
    const result = await client.booking.groupEvents()
    return Response.json(result, { headers: NO_STORE })
  } catch (error) {
    logger.error("booking.groupEvents failed", { error })
    return Response.json(
      { error: { message: "Upcoming dates are unavailable right now." } },
      { status: 503, headers: NO_STORE }
    )
  }
}
