import { contract } from "@repo/api-contract"
import type { Logger } from "@repo/log"
import { publicContract } from "@repo/public-api-contract"

export { type WithRequestOptions, withRequest } from "@repo/service-kit"

/** The api's internal `log(message, error)` callback, backed by a structured logger. */
export function legacyLog(logger: Logger): (message: string, error: unknown) => void {
  return (message, error) =>
    error == null ? logger.info(message) : logger.error(message, { error })
}

type ContractNode = { [key: string]: unknown }

/** Every procedure path (`auth/signIn`) and every REST path's first segment in the contract. */
function contractRoutes(node: ContractNode, path: string[] = [], depth = 0) {
  const procedures = new Set<string>()
  const openapiRoots = new Set<string>()
  if (depth > 8) return { procedures, openapiRoots }
  for (const [key, value] of Object.entries(node)) {
    if (typeof value !== "object" || value === null) continue
    const orpc = (value as { "~orpc"?: { route?: { path?: string } } })["~orpc"]
    if (orpc) {
      procedures.add([...path, key].join("/"))
      const root = orpc.route?.path?.split("/")[1]
      if (root) openapiRoots.add(root)
    } else if (Object.getPrototypeOf(value) === Object.prototype) {
      const inner = contractRoutes(value as ContractNode, [...path, key], depth + 1)
      for (const p of inner.procedures) procedures.add(p)
      for (const r of inner.openapiRoots) openapiRoots.add(r)
    }
  }
  return { procedures, openapiRoots }
}

const { procedures: PROCEDURES, openapiRoots: OPENAPI_ROOTS } = contractRoutes(contract)

/** Every `/v1` path's second segment (`/v1/notes/{id}` → `notes`) in the public contract. */
function v1Roots(node: ContractNode, depth = 0, roots = new Set<string>()) {
  if (depth > 8) return roots
  for (const value of Object.values(node)) {
    if (typeof value !== "object" || value === null) continue
    const orpc = (value as { "~orpc"?: { route?: { path?: string } } })["~orpc"]
    const root = orpc?.route?.path?.split("/")[2]
    if (root) roots.add(root)
    else if (!orpc && Object.getPrototypeOf(value) === Object.prototype)
      v1Roots(value as ContractNode, depth + 1, roots)
  }
  return roots
}

const V1_ROOTS = v1Roots(publicContract)

/**
 * The api's route label: `/rpc/<procedure path>`, `openapi:<first segment>`, `v1:<segment>`,
 * `events`, `events.me`, `billing.webhook`, else `other` — only names the contract declares, so a label never carries a
 * raw id, a query string or whatever path a caller made up.
 */
export function apiRouteOf(req: Request): string {
  const { pathname } = new URL(req.url)
  if (pathname.startsWith("/rpc/")) {
    const procedure = pathname.slice("/rpc/".length)
    return PROCEDURES.has(procedure) ? `/rpc/${procedure}` : "other"
  }
  if (pathname.startsWith("/openapi/")) {
    const first = pathname.slice("/openapi/".length).split("/")[0] ?? ""
    return OPENAPI_ROOTS.has(first) ? `openapi:${first}` : "other"
  }
  if (pathname.startsWith("/v1/")) {
    const root = pathname.slice("/v1/".length).split("/")[0] ?? ""
    return V1_ROOTS.has(root) ? `v1:${root}` : "other"
  }
  if (/^\/events\/workspaces\/[^/]+$/.test(pathname)) return "events"
  if (pathname === "/events/me") return "events.me"
  if (pathname === "/billing/webhook") return "billing.webhook"
  return "other"
}
