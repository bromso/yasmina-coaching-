import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import type { AuditExport } from "@repo/api-contract"
import {
  auditExportErrorMessage,
  auditExportResponse,
  auditExportUnavailable,
  auditFiltersFromForm,
} from "./audit-export"

/** The headers every response from the route carries, a 404 included (cv-download.ts's SAFE). */
const expectSafe = (res: Response) => {
  expect(res.headers.get("cache-control")).toBe("no-store")
  expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  expect(res.headers.get("content-security-policy")).toBe("sandbox")
}

const form = (fields: Record<string, string>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const baseFields = { from: "2026-09-19", to: "2026-10-18", format: "csv" }

describe("auditFiltersFromForm", () => {
  test("parses and trims actorId/targetType/targetId, same rule the page's GET filters use", () => {
    expect(
      auditFiltersFromForm(form({ actorId: " 12 ", targetType: " user ", targetId: " 7 " }))
    ).toEqual({ actorId: "12", targetType: "user", targetId: "7" })
  })

  test("blank or missing fields are undefined, not empty strings", () => {
    expect(auditFiltersFromForm(form({}))).toEqual({
      actorId: undefined,
      targetType: undefined,
      targetId: undefined,
    })
  })

  test("a non-numeric actorId is undefined", () => {
    expect(auditFiltersFromForm(form({ actorId: "abc" })).actorId).toBeUndefined()
  })

  test("targetType/targetId are clamped to the contract's 50/100-char max", () => {
    expect(auditFiltersFromForm(form({ targetType: "x".repeat(60) })).targetType).toBe(
      "x".repeat(50)
    )
    expect(auditFiltersFromForm(form({ targetId: "y".repeat(120) })).targetId).toBe("y".repeat(100))
  })
})

describe("auditExportErrorMessage", () => {
  test("the known codes each carry their message", () => {
    expect(auditExportErrorMessage("bad_request")).toBe(
      "from and to must be valid YYYY-MM-DD dates, from on or before to, at most 366 days apart, and to no later than tomorrow (UTC)."
    )
    expect(auditExportErrorMessage("unavailable")).toBe(
      "The export is unavailable right now. Try again shortly."
    )
    expect(auditExportErrorMessage("conflict")).toBe(
      "Narrow the date range: more than 100 000 entries match."
    )
    expect(auditExportErrorMessage("too_many_requests")).toBe("Too many exports, try again later")
  })

  test("an unknown or missing code shows nothing", () => {
    expect(auditExportErrorMessage("nope")).toBeUndefined()
    expect(auditExportErrorMessage(undefined)).toBeUndefined()
  })
})

describe("auditExportResponse", () => {
  test("no exportFn (signed out, or the gate's own refusal path): a bare 404", async () => {
    const res = await auditExportResponse(null, form(baseFields))
    expect(res.status).toBe(404)
    expectSafe(res)
  })

  test("a stored export: the file body, Content-Disposition, Cache-Control and X-Content-Type-Options", async () => {
    let seen: AuditExport | undefined
    const res = await auditExportResponse(async (input) => {
      seen = input
      return new File(["id,at\n1,2026-10-18\n"], "audit-2026-09-19-2026-10-18.csv")
    }, form(baseFields))
    expect(seen).toEqual({
      from: "2026-09-19",
      to: "2026-10-18",
      format: "csv",
      actorId: undefined,
      targetType: undefined,
      targetId: undefined,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="audit-2026-09-19-2026-10-18.csv"'
    )
    expectSafe(res)
    expect(await res.text()).toBe("id,at\n1,2026-10-18\n")
  })

  test("Content-Type is set from the posted format, never from the returned File's own .type", async () => {
    const csv = await auditExportResponse(
      async () => new File(["x"], "audit.csv", { type: "" }),
      form({ ...baseFields, format: "csv" })
    )
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8")

    const jsonl = await auditExportResponse(
      async () => new File(["x"], "audit.jsonl", { type: "text/csv" }),
      form({ ...baseFields, format: "jsonl" })
    )
    expect(jsonl.headers.get("content-type")).toBe("application/x-ndjson")
  })

  test("actorId/targetType/targetId reach the export call", async () => {
    let seen: AuditExport | undefined
    await auditExportResponse(
      async (input) => {
        seen = input
        return new File(["x"], "audit.csv")
      },
      form({ ...baseFields, actorId: "9", targetType: "workspace", targetId: "3" })
    )
    expect(seen).toEqual({
      from: "2026-09-19",
      to: "2026-10-18",
      format: "csv",
      actorId: 9,
      targetType: "workspace",
      targetId: "3",
    })
  })

  test("NOT_FOUND (not an admin, or impersonating): a bare 404, not a redirect", async () => {
    const res = await auditExportResponse(async () => {
      throw new ORPCError("NOT_FOUND", { message: "Not found", defined: true })
    }, form(baseFields))
    expect(res.status).toBe(404)
    expectSafe(res)
  })

  test("BAD_REQUEST: 303 to /admin/audit?exportError=bad_request, filters kept", async () => {
    const res = await auditExportResponse(
      async () => {
        throw new ORPCError("BAD_REQUEST", { message: "bad input", defined: false })
      },
      form({ ...baseFields, actorId: "9", targetType: "workspace", targetId: "3" })
    )
    expect(res.status).toBe(303)
    expectSafe(res)
    const location = res.headers.get("location") ?? ""
    const url = new URL(location, "http://x")
    expect(url.pathname).toBe("/admin/audit")
    expect(url.searchParams.get("exportError")).toBe("bad_request")
    expect(url.searchParams.get("actorId")).toBe("9")
    expect(url.searchParams.get("targetType")).toBe("workspace")
    expect(url.searchParams.get("targetId")).toBe("3")
  })

  test("CONFLICT: 303 to /admin/audit?exportError=conflict", async () => {
    const res = await auditExportResponse(async () => {
      throw new ORPCError("CONFLICT", { message: "too many rows", defined: true })
    }, form(baseFields))
    expect(res.status).toBe(303)
    expect(
      new URL(res.headers.get("location") ?? "", "http://x").searchParams.get("exportError")
    ).toBe("conflict")
  })

  test("TOO_MANY_REQUESTS: 303 to /admin/audit?exportError=too_many_requests", async () => {
    const res = await auditExportResponse(async () => {
      throw new ORPCError("TOO_MANY_REQUESTS", { message: "slow down", defined: true })
    }, form(baseFields))
    expect(res.status).toBe(303)
    expect(
      new URL(res.headers.get("location") ?? "", "http://x").searchParams.get("exportError")
    ).toBe("too_many_requests")
  })

  test("no filters posted: the redirect carries no filter params, just the error code", async () => {
    const res = await auditExportResponse(async () => {
      throw new ORPCError("CONFLICT", { message: "too many rows", defined: true })
    }, form(baseFields))
    expect(res.headers.get("location")).toBe("/admin/audit?exportError=conflict")
  })

  test("the api unreachable (a non-ORPC error): 303 to exportError=unavailable, filters kept", async () => {
    const res = await auditExportResponse(
      async () => {
        throw new TypeError("fetch failed")
      },
      form({ ...baseFields, actorId: "9" })
    )
    expect(res.status).toBe(303)
    expectSafe(res)
    expect(res.headers.get("location")).toBe("/admin/audit?exportError=unavailable&actorId=9")
  })

  test("an api 5xx (its request timeout, an internal error): 303 to exportError=unavailable", async () => {
    for (const code of ["SERVICE_UNAVAILABLE", "INTERNAL_SERVER_ERROR"]) {
      const res = await auditExportResponse(async () => {
        throw new ORPCError(code, { message: "down" })
      }, form(baseFields))
      expect(res.status).toBe(303)
      expect(res.headers.get("location")).toBe("/admin/audit?exportError=unavailable")
    }
  })

  test("any other 4xx (UNAUTHORIZED, FORBIDDEN): a bare 404, like the gate", async () => {
    const res = await auditExportResponse(async () => {
      throw new ORPCError("FORBIDDEN", { message: "no" })
    }, form(baseFields))
    expect(res.status).toBe(404)
    expectSafe(res)
  })

  test("auditExportUnavailable: the route's own catch (a failed session lookup) redirects the same way", () => {
    const res = auditExportUnavailable(form({ ...baseFields, targetType: "user" }))
    expect(res.status).toBe(303)
    expectSafe(res)
    expect(res.headers.get("location")).toBe("/admin/audit?exportError=unavailable&targetType=user")
  })
})
