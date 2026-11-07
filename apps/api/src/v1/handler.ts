// The second `OpenAPIHandler`: `v1Router` with /v1's error shape, plus the generated spec at
// `/v1/openapi.json` and Scalar docs at `/v1/docs` (the contract's paths already carry `/v1`, so
// the handler takes no prefix). The spec itself is `buildV1OpenAPIDocument()` — the same document
// `@repo/public-api-contract/openapi` builds straight from the contract, so the two can never
// disagree (see `v1.test.ts`'s deep-equal test).
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { onError } from "@orpc/server"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { buildV1OpenAPIDocument, ERROR_BODY_JSON_SCHEMA } from "@repo/public-api-contract/openapi"
import { siteUrl } from "@repo/sites"
import { BRAND_NAME } from "@repo/sites/brand"
import { encodeV1Error, NOT_FOUND_MESSAGE, v1Error } from "./errors"
import type { V1Key } from "./guard"
import { type V1Context, v1Router } from "./router"

export const V1_SPEC_PATH = "/v1/openapi.json"
export const V1_DOCS_PATH = "/v1/docs"

export function createV1Handler({
  context,
  onUnexpected,
}: {
  /** Everything a handler needs but the key. */
  context: Omit<V1Context, "key">
  /** Logs and records a 5xx (`logUnexpected`); client errors are part of the contract. */
  onUnexpected: (error: unknown) => void
}) {
  // Built once, not per request: the open, unauthenticated spec route would otherwise run two full
  // generations on every GET. No `serverUrl` here — the plugin's own default `servers`
  // (`new URL("", origin)`, from the request) gives the same value. Each request gets its own copy,
  // so the plugin's second pass can never change the shared one.
  const base = buildV1OpenAPIDocument({
    title: `${BRAND_NAME} API`,
    docsUrl: `${siteUrl("docs")}/developers`,
  })
  const handler = new OpenAPIHandler(v1Router, {
    interceptors: [onError(onUnexpected)],
    customErrorResponseBodyEncoder: encodeV1Error,
    plugins: [
      new OpenAPIReferencePlugin({
        docsProvider: "scalar",
        docsTitle: `${BRAND_NAME} API v1`,
        docsPath: V1_DOCS_PATH,
        specPath: V1_SPEC_PATH,
        schemaConverters: [new ZodToJsonSchemaConverter()],
        // The document itself: built from the contract by `buildV1OpenAPIDocument()`, so
        // the live spec and `@repo/public-api-contract/openapi`'s own output can never disagree.
        // The plugin re-generates `paths` from `v1Router` afterwards (same route metadata, since
        // `implement()` carries it through unchanged) — so `customErrorResponseBodySchema` is
        // repeated here, for that second pass.
        specGenerateOptions: async () => ({
          ...structuredClone(await base),
          customErrorResponseBodySchema: () => ERROR_BODY_JSON_SCHEMA as never,
        }),
      }),
    ],
  })

  /** Runs `req` as `key` (null for the open spec and docs); an unmatched path is `not_found`. */
  return async (req: Request, key: V1Key | null): Promise<Response> => {
    const { matched, response } = await handler.handle(req, { context: { ...context, key } })
    return matched ? response : v1Error("not_found", NOT_FOUND_MESSAGE)
  }
}
