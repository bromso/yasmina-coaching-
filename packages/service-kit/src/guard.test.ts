import { describe, expect, test } from "bun:test"
import { createGuard } from "./guard"

const guard = createGuard({
  token: "secret-token",
  allowedOrigins: ["https://app.example.com"],
  allowLocalhostOrigins: false,
})
const devGuard = createGuard({
  token: "secret-token",
  allowedOrigins: [],
  allowLocalhostOrigins: true,
})

const request = (headers: Record<string, string>) =>
  new Request("http://ai.brand.localhost/chat", { method: "POST", headers })
const auth = { authorization: "Bearer secret-token" }

describe("token", () => {
  test("missing token is 401", () => {
    expect(guard(request({}))?.status).toBe(401)
  })

  test("wrong token is 401", () => {
    expect(guard(request({ authorization: "Bearer nope" }))?.status).toBe(401)
  })

  test("a token that is a prefix of the real one is 401", () => {
    expect(guard(request({ authorization: "Bearer secret" }))?.status).toBe(401)
  })

  test("valid token with no Origin (server-to-server) passes", () => {
    expect(guard(request(auth))).toBeNull()
  })

  test("the Bearer scheme is case-insensitive", () => {
    expect(guard(request({ authorization: "bearer secret-token" }))).toBeNull()
  })
})

describe("origin", () => {
  test("an allowlisted origin passes", () => {
    expect(guard(request({ ...auth, origin: "https://app.example.com" }))).toBeNull()
  })

  test("any other origin is 403", () => {
    expect(guard(request({ ...auth, origin: "https://evil.example" }))?.status).toBe(403)
  })

  test('the opaque "null" origin is rejected, not treated as absent', () => {
    expect(guard(request({ ...auth, origin: "null" }))?.status).toBe(403)
  })

  test("development allows localhost and *.localhost origins", () => {
    expect(devGuard(request({ ...auth, origin: "http://localhost:3001" }))).toBeNull()
    expect(devGuard(request({ ...auth, origin: "http://app.localhost:3001" }))).toBeNull()
    expect(devGuard(request({ ...auth, origin: "http://app.brand.localhost:3001" }))).toBeNull()
  })

  test("localhost look-alikes are rejected even in development", () => {
    const evil = request({ ...auth, origin: "http://localhost.evil.example" })
    expect(devGuard(evil)?.status).toBe(403)
  })
})

describe("error shape", () => {
  test("a denied token answers in oRPC's error shape with a Bearer challenge", async () => {
    const res = guard(request({}))
    expect(res?.headers.get("www-authenticate")).toBe("Bearer")
    expect(await res?.json()).toEqual({
      defined: false,
      code: "UNAUTHORIZED",
      status: 401,
      message: "Unauthorized",
    })
  })

  test("a denied origin answers FORBIDDEN", async () => {
    const res = guard(request({ ...auth, origin: "https://evil.example" }))
    expect(await res?.json()).toMatchObject({ code: "FORBIDDEN", message: "Origin not allowed" })
  })
})
