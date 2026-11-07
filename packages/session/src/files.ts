import { ORPCError } from "@orpc/client"
import { type ApiClient, FILE_KEY_PATTERN } from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { createApiClient, filesClientId, requestIdFromRequest } from "./client"
import { loadEnv } from "./env"
import { requestInfo } from "./request-info"

const logger = createLogger({ service: "session" })

const SAFE = {
  "x-content-type-options": "nosniff",
  "content-disposition": "inline",
  "content-security-policy": "sandbox; default-src 'none'",
}

/**
 * GET /files/<key> on the app's own origin: the uploaded image, fetched with the service token.
 * Every caller shares this one route, so the api call carries a `files:<hash>` client id derived
 * from the request's ip (see `requestInfo`) — without it every visitor would share one rate-limit
 * bucket keyed to this server's own address, and a burst of well-formed but nonexistent keys from
 * one browser would 429 the route for everyone.
 */
export function createFileRoute(
  options: {
    client?: (clientId: string | undefined, requestId: string | null) => Pick<ApiClient, "files">
  } = {}
) {
  const client =
    options.client ??
    ((clientId: string | undefined, requestId: string | null) => {
      const env = loadEnv(["API_URL", "API_SERVICE_TOKEN"])
      return createApiClient({
        apiUrl: env.API_URL,
        serviceToken: env.API_SERVICE_TOKEN,
        clientId,
        requestId,
      })
    })
  return async (req: Request, ctx: { params: Promise<{ key: string[] }> }) => {
    const key = (await ctx.params).key.join("/")
    if (!FILE_KEY_PATTERN.test(key)) return miss(404)
    const clientId = await filesClientId(requestInfo(req.headers).ip)
    const requestId = requestIdFromRequest(req)
    try {
      const file = await client(clientId, requestId).files.get({ key })
      return new Response(file.stream(), {
        headers: {
          ...SAFE,
          "content-type": file.type,
          "content-length": String(file.size),
          "cache-control": "public, max-age=31536000, immutable",
        },
      })
    } catch (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") return miss(404)
      // A 401/429/etc. from the api is not "unavailable" — the code and status say which; a
      // network failure (no ORPCError) has neither, and is logged as-is. Either way: 502.
      const detail = error instanceof ORPCError ? ` (${error.code} ${error.status})` : ""
      logger.error(`files: api call failed${detail}`, {
        error,
        ...(requestId ? { requestId } : {}),
      })
      return miss(502)
    }
  }
}

const miss = (status: number) =>
  new Response(null, { status, headers: { ...SAFE, "cache-control": "no-store" } })
