import { ORPCError } from "@orpc/client"
import {
  AUDIT_EXPORT_CAP_MESSAGE,
  AUDIT_EXPORT_DATE_MESSAGE,
  AUDIT_EXPORT_RATE_MESSAGE,
  type AuditExport,
  type AuditExportFormat,
} from "@repo/api-contract"
import { createLogger } from "@repo/log"
import type { AuditFilters } from "@/views/admin-audit-view"

const logger = createLogger({ service: "auth" })

/** `?exportError=<code>` on `/admin/audit`: the export route's redirect-carrying refusals, plus
 * `unavailable` for an api outage or 5xx. A gate refusal (not an admin, or impersonating) is a
 * bare 404 instead — never one of these. */
export const AUDIT_EXPORT_ERROR_CODES = [
  "bad_request",
  "conflict",
  "too_many_requests",
  "unavailable",
] as const
export type AuditExportErrorCode = (typeof AUDIT_EXPORT_ERROR_CODES)[number]

/** English only, like the rest of `/admin`. */
export const AUDIT_EXPORT_UNAVAILABLE_MESSAGE =
  "The export is unavailable right now. Try again shortly."

const AUDIT_EXPORT_ERROR_MESSAGES: Record<AuditExportErrorCode, string> = {
  bad_request: AUDIT_EXPORT_DATE_MESSAGE,
  conflict: AUDIT_EXPORT_CAP_MESSAGE,
  too_many_requests: AUDIT_EXPORT_RATE_MESSAGE,
  unavailable: AUDIT_EXPORT_UNAVAILABLE_MESSAGE,
}

/** On every response the route sends, a 404 and a redirect included — `cv-download.ts`'s own
 * `SAFE` set: never cached, never sniffed, and sandboxed should a browser ever render the body. */
const SAFE = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "sandbox",
}

const notFound = () => new Response(null, { status: 404, headers: SAFE })

/** The message `/admin/audit` shows for `?exportError=<code>`; an unknown or missing code shows
 * nothing, the same rule `@repo/ui/lib/oauth-errors`'s `oauthErrorMessage` uses. */
export function auditExportErrorMessage(code: string | undefined): string | undefined {
  if (!code || !Object.hasOwn(AUDIT_EXPORT_ERROR_MESSAGES, code)) return undefined
  return AUDIT_EXPORT_ERROR_MESSAGES[code as AuditExportErrorCode]
}

const contentTypeFor = (format: string): string =>
  format === "jsonl" ? "application/x-ndjson" : "text/csv; charset=utf-8"

/**
 * `actorId`/`targetType`/`targetId` from the Export card's hidden fields, trimmed and clamped the
 * same way `/admin/audit`'s own GET filters are (its `page.tsx`) — so the redirect this module
 * builds round-trips exactly what the list page itself would show.
 */
export function auditFiltersFromForm(form: FormData): AuditFilters {
  const field = (name: string): string => {
    const v = form.get(name)
    return typeof v === "string" ? v : ""
  }
  const actorIdRaw = field("actorId").trim()
  return {
    actorId: /^\d+$/.test(actorIdRaw) ? actorIdRaw : undefined,
    targetType: field("targetType").trim().slice(0, 50) || undefined,
    targetId: field("targetId").trim().slice(0, 100) || undefined,
  }
}

function redirectToAuditList(filters: AuditFilters, code?: AuditExportErrorCode): Response {
  const params = new URLSearchParams()
  if (code) params.set("exportError", code)
  if (filters.actorId) params.set("actorId", filters.actorId)
  if (filters.targetType) params.set("targetType", filters.targetType)
  if (filters.targetId) params.set("targetId", filters.targetId)
  const qs = params.toString()
  return new Response(null, {
    status: 303,
    headers: { ...SAFE, Location: qs ? `/admin/audit?${qs}` : "/admin/audit" },
  })
}

/** The route's own catch (the session lookup itself failed — the api is down): the same
 * `exportError=unavailable` redirect an outage during the export gets, filters kept. */
export function auditExportUnavailable(form: FormData): Response {
  return redirectToAuditList(auditFiltersFromForm(form), "unavailable")
}

/**
 * `POST /admin/audit/export`'s core, wrapped by the route handler the same way `cvDownloadResponse`
 * wraps the CV route: `exportFn` is null for a signed-out caller — a bare `404`, the gate. Signed
 * in but not a superadmin (or impersonating) reaches `admin.audit.export` itself, which answers
 * `NOT_FOUND` the same way `apps/api` answers every other admin procedure — also a bare `404`.
 * `BAD_REQUEST` (an invalid date range), `CONFLICT` (over the row cap), `TOO_MANY_REQUESTS` and —
 * as `unavailable` — an api 5xx or an unreachable api each redirect (303) to `/admin/audit` with `?exportError=<code>` and the posted
 * actorId/targetType/targetId filters, so the page shows the matching notice with its filter form
 * unchanged. Bun's `Response.formData()` drops a multipart file part's `Content-Type` on decode
 * (a pre-existing transport quirk — see Task 2's report), so the response's own `Content-Type` is
 * set from the posted `format`, never from the returned `File` object's `.type`; `file.name` *is*
 * reliable and already exactly `audit-<from>-<to>.<format>`.
 */
export async function auditExportResponse(
  exportFn: ((input: AuditExport) => Promise<File>) | null,
  form: FormData
): Promise<Response> {
  const filters = auditFiltersFromForm(form)
  if (!exportFn) return notFound()

  const field = (name: string): string => {
    const v = form.get(name)
    return typeof v === "string" ? v : ""
  }
  const format = field("format")

  try {
    const file = await exportFn({
      from: field("from"),
      to: field("to"),
      // The contract's `z.enum(AUDIT_EXPORT_FORMATS)` is what actually validates this — an
      // unrecognised value comes back as `BAD_REQUEST` below, redirected like any other bad input.
      format: format as AuditExportFormat,
      actorId: filters.actorId ? Number(filters.actorId) : undefined,
      targetType: filters.targetType,
      targetId: filters.targetId,
    })
    return new Response(file.stream(), {
      status: 200,
      headers: {
        ...SAFE,
        "content-type": contentTypeFor(format),
        "content-disposition": `attachment; filename="${file.name}"`,
      },
    })
  } catch (error) {
    if (error instanceof ORPCError && error.status < 500) {
      if (error.code === "BAD_REQUEST") return redirectToAuditList(filters, "bad_request")
      if (error.code === "CONFLICT") return redirectToAuditList(filters, "conflict")
      if (error.code === "TOO_MANY_REQUESTS")
        return redirectToAuditList(filters, "too_many_requests")
      // NOT_FOUND (not a live superadmin) and any other 4xx: the gate's bare 404.
      return notFound()
    }
    // The api unreachable (a non-ORPC error) or answering 5xx (its request timeout included):
    // worth a retry, so say so rather than a 404 that reads as "this does not exist".
    logger.error("audit export failed", { error })
    return redirectToAuditList(filters, "unavailable")
  }
}
