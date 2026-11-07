import { expect, test } from "bun:test"
import { isORPCErrorJson } from "@orpc/client"
import { errorResponse } from "./errors"

test("the body is oRPC's error JSON, which oRPC clients recognize", async () => {
  const res = errorResponse("UNAUTHORIZED", { message: "Unauthorized" })
  expect(res.status).toBe(401)
  const body = await res.json()
  expect(body).toEqual({
    defined: false,
    code: "UNAUTHORIZED",
    status: 401,
    message: "Unauthorized",
  })
  expect(isORPCErrorJson(body)).toBe(true)
})

test("common codes carry their conventional status", () => {
  expect(errorResponse("FORBIDDEN").status).toBe(403)
  expect(errorResponse("NOT_FOUND").status).toBe(404)
  expect(errorResponse("TOO_MANY_REQUESTS").status).toBe(429)
  expect(errorResponse("INTERNAL_SERVER_ERROR").status).toBe(500)
  expect(errorResponse("SERVICE_UNAVAILABLE").status).toBe(503)
})

test("an explicit status and extra headers win", async () => {
  const res = errorResponse("TOO_MANY_REQUESTS", {
    message: "Too many requests",
    headers: { "retry-after": "7" },
  })
  expect(res.headers.get("retry-after")).toBe("7")
  expect(res.headers.get("content-type")).toContain("application/json")
  expect(errorResponse("TEAPOT", { status: 418 }).status).toBe(418)
})
