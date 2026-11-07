import { expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { authTranslator, oauthErrorMessageIn } from "./i18n"
import {
  appleFormPostRedirect,
  decodeOauthCookie,
  encodeOauthCookie,
  oauthCallbackCore,
  oauthStartCore,
} from "./oauth"
import { providerLabel } from "./providers"

const cookie = encodeOauthCookie({
  provider: "google",
  state: "st",
  codeVerifier: "v",
  next: "http://app.brand.localhost:3001/notes",
})
const deps = (overrides = {}) => ({
  providers: ["google", "github"],
  start: async () => ({
    url: "https://accounts.google.com/o/oauth2/v2/auth?x=1",
    state: "st",
    codeVerifier: "v",
  }),
  callback: async () => ({
    user: { id: 1 },
    session: { token: "t", expiresAt: "2026-11-01T00:00:00.000Z" },
  }),
  safeNextUrl: (c: string | null | undefined) => c ?? "http://app.brand.localhost:3001",
  ...overrides,
})

test("start: unknown provider is 404; known one redirects and sets the cookie", async () => {
  expect(await oauthStartCore(deps() as never, { provider: "apple", next: undefined })).toEqual({
    status: 404,
  })
  const out = await oauthStartCore(deps() as never, {
    provider: "google",
    next: "http://app.brand.localhost:3001/notes",
  })
  expect(out).toMatchObject({ redirectTo: expect.stringContaining("accounts.google.com") })
  expect(decodeOauthCookie((out as { cookie: string }).cookie)).toMatchObject({
    provider: "google",
    state: "st",
    codeVerifier: "v",
    next: "http://app.brand.localhost:3001/notes",
  })
})

test("start: next goes through safeNextUrl before it is stored", async () => {
  const seen: unknown[] = []
  const d = deps({
    safeNextUrl: (c: string | null | undefined) => {
      seen.push(c)
      return "http://app.brand.localhost:3001"
    },
  })
  const long = `https://evil.example/${"x".repeat(5000)}`
  const out = await oauthStartCore(d as never, { provider: "google", next: long })
  expect(seen).toEqual([long])
  const saved = decodeOauthCookie((out as { cookie: string }).cookie)
  expect(saved?.next).toBe("http://app.brand.localhost:3001")
  // No next: nothing stored, safeNextUrl not consulted.
  const bare = await oauthStartCore(d as never, { provider: "google", next: undefined })
  expect(decodeOauthCookie((bare as { cookie: string }).cookie)?.next).toBeUndefined()
  expect(seen).toHaveLength(1)
})

test("callback: missing cookie, state mismatch and provider mismatch never reach the api", async () => {
  let calls = 0
  const d = deps({
    callback: async () => {
      calls++
      throw new Error("no")
    },
  })
  expect(
    (
      (await oauthCallbackCore(d as never, {
        provider: "google",
        params: { code: "c", state: "st" },
        cookie: null,
      })) as { redirectTo: string }
    ).redirectTo
  ).toBe("/login?error=state")
  expect(
    (
      (await oauthCallbackCore(d as never, {
        provider: "google",
        params: { code: "c", state: "WRONG" },
        cookie,
      })) as { redirectTo: string }
    ).redirectTo
  ).toBe("/login?error=state")
  expect(
    (
      (await oauthCallbackCore(d as never, {
        provider: "github",
        params: { code: "c", state: "st" },
        cookie,
      })) as { redirectTo: string }
    ).redirectTo
  ).toBe("/login?error=state")
  expect(calls).toBe(0)
})

test("callback: access_denied is 'cancelled'; success sets the session and goes to the safe next", async () => {
  expect(
    (
      (await oauthCallbackCore(deps() as never, {
        provider: "google",
        params: { error: "access_denied", state: "st" },
        cookie,
      })) as { redirectTo: string }
    ).redirectTo
  ).toBe(
    `/login?error=cancelled&next=${encodeURIComponent("http://app.brand.localhost:3001/notes")}`
  )
  const out = await oauthCallbackCore(deps() as never, {
    provider: "google",
    params: { code: "c", state: "st" },
    cookie,
  })
  expect(out).toMatchObject({
    redirectTo: "http://app.brand.localhost:3001/notes",
    clearCookie: true,
    session: { token: "t" },
  })
})

test("callback: a two-factor account gets a challenge instead of a session", async () => {
  const d = deps({
    callback: async () => ({
      twoFactor: { challenge: "chal123", expiresAt: "2026-01-01T00:05:00.000Z" },
    }),
  })
  const out = await oauthCallbackCore(d as never, {
    provider: "google",
    params: { code: "c", state: "st" },
    cookie,
  })
  expect(out).toEqual({
    challenge: "chal123",
    next: "http://app.brand.localhost:3001/notes",
    clearCookie: true,
  })
})

test("callback: a stale session cookie still follows a two-factor challenge (not a plain failure)", async () => {
  const d = deps({
    callback: async () => ({
      twoFactor: { challenge: "chal123", expiresAt: "2026-01-01T00:05:00.000Z" },
    }),
  })
  const security = encodeOauthCookie({
    provider: "google",
    state: "st",
    next: "http://account.brand.localhost:3003/security",
  })
  const out = await oauthCallbackCore(d as never, {
    provider: "google",
    params: { code: "c", state: "st" },
    cookie: security,
    // A revoked/expired session cookie still sent `signedIn: true` to the api, which saw no live
    // session and issued a challenge regardless.
    signedIn: true,
  })
  expect(out).toEqual({
    challenge: "chal123",
    next: "http://account.brand.localhost:3003/security",
    clearCookie: true,
  })
})

test("callback: api errors map to login error codes with the provider", async () => {
  const err = (code: string) => new ORPCError(code, { defined: true, message: "x" })
  for (const [code, expected] of [
    ["FORBIDDEN", "unverified"],
    ["CONFLICT", "claimed"],
    ["BAD_GATEWAY", "provider"],
    ["BAD_REQUEST", "failed"],
  ] as const) {
    const d = deps({
      callback: async () => {
        throw err(code)
      },
    })
    expect(
      (
        (await oauthCallbackCore(d as never, {
          provider: "google",
          params: { code: "c", state: "st" },
          cookie,
        })) as { redirectTo: string }
      ).redirectTo
    ).toBe(
      `/login?error=${expected}&provider=google&next=${encodeURIComponent("http://app.brand.localhost:3001/notes")}`
    )
  }
})

test("callback: a suspended account is 'suspended', not 'unverified' (same code, different message)", async () => {
  for (const message of [
    "This account is suspended. Contact support.", // English
    "Det här kontot är avstängt. Kontakta supporten.", // Swedish
  ]) {
    const d = deps({
      callback: async () => {
        throw new ORPCError("FORBIDDEN", { defined: true, message })
      },
    })
    expect(
      (
        (await oauthCallbackCore(d as never, {
          provider: "google",
          params: { code: "c", state: "st" },
          cookie,
        })) as { redirectTo: string }
      ).redirectTo
    ).toBe(
      `/login?error=suspended&provider=google&next=${encodeURIComponent("http://app.brand.localhost:3001/notes")}`
    )
  }
  // A FORBIDDEN with any other message is still 'unverified', the declared default.
  const d = deps({
    callback: async () => {
      throw new ORPCError("FORBIDDEN", { defined: true, message: "x" })
    },
  })
  expect(
    (
      (await oauthCallbackCore(d as never, {
        provider: "google",
        params: { code: "c", state: "st" },
        cookie,
      })) as { redirectTo: string }
    ).redirectTo
  ).toBe(
    `/login?error=unverified&provider=google&next=${encodeURIComponent("http://app.brand.localhost:3001/notes")}`
  )
})

test("callback: a failure while signed in returns to the saved next with the error", async () => {
  const d = deps({
    callback: async () => {
      throw new ORPCError("CONFLICT", { defined: true, message: "x" })
    },
  })
  const security = encodeOauthCookie({
    provider: "google",
    state: "st",
    next: "http://account.brand.localhost:3003/security?tab=1",
  })
  const out = await oauthCallbackCore(d as never, {
    provider: "google",
    params: { code: "c", state: "st" },
    cookie: security,
    signedIn: true,
  })
  expect(out).toEqual({
    redirectTo: "http://account.brand.localhost:3003/security?tab=1&error=claimed&provider=google",
    clearCookie: true,
  })
  // A failed state check has no trusted next: always the login page.
  const stale = await oauthCallbackCore(d as never, {
    provider: "google",
    params: { code: "c", state: "WRONG" },
    cookie: security,
    signedIn: true,
  })
  expect((stale as { redirectTo: string }).redirectTo).toBe("/login?error=state")
})

test("callback: signed in, the api is called as the user; signed out, anonymously", async () => {
  const seen: string[] = []
  const d = deps({
    callback: async (_input: unknown, as: string) => {
      seen.push(as)
      return { user: { id: 1 }, session: { token: "t", expiresAt: "x" } }
    },
  })
  const appleCookie = encodeOauthCookie({ provider: "apple", state: "st" })
  // Apple's GET callback (after the form_post bounce) with a session cookie: a connect.
  await oauthCallbackCore(d as never, {
    provider: "apple",
    params: { code: "c", state: "st" },
    cookie: appleCookie,
    signedIn: true,
  })
  await oauthCallbackCore(d as never, {
    provider: "apple",
    params: { code: "c", state: "st" },
    cookie: appleCookie,
  })
  expect(seen).toEqual(["user", "anonymous"])
})

test("callback: connecting while signed in keeps the browser's session (no new one to set)", async () => {
  const d = deps({
    callback: async () => ({ user: { id: 1 }, session: { token: "mine", expiresAt: "x" } }),
  })
  const cookie = encodeOauthCookie({ provider: "google", state: "st", next: "/security" })
  const same = await oauthCallbackCore(d as never, {
    provider: "google",
    params: { code: "c", state: "st" },
    cookie,
    signedIn: true,
    currentToken: "mine",
  })
  expect(same).toEqual({ redirectTo: expect.any(String), clearCookie: true })
  expect("session" in same).toBe(false)
  // A different token back (the cookie was stale, so this was a sign-in): set it.
  const other = await oauthCallbackCore(d as never, {
    provider: "google",
    params: { code: "c", state: "st" },
    cookie,
    signedIn: true,
    currentToken: "stale",
  })
  expect(other).toMatchObject({ session: { token: "mine" } })
})

const reauthRefusal = () =>
  new ORPCError("FORBIDDEN", {
    defined: true,
    message: "Sign in again to connect a sign-in provider.",
    data: { reason: "reauth" },
  })

test("start: a connect refused for an old session goes to the sign-in form, no cookie", async () => {
  const d = deps({
    start: async () => {
      throw reauthRefusal()
    },
  })
  const out = await oauthStartCore(d as never, {
    provider: "google",
    next: "http://account.brand.localhost:3003/security",
  })
  expect(out).toEqual({
    signInAgain: `/login?reauth=1&next=${encodeURIComponent("http://account.brand.localhost:3003/security")}`,
  })
  // No next: the form alone.
  const bare = await oauthStartCore(d as never, { provider: "google", next: undefined })
  expect(bare).toEqual({ signInAgain: "/login?reauth=1" })
  // Any other failure is still thrown (the route answers /login?error=failed).
  const other = deps({
    start: async () => {
      throw new ORPCError("FORBIDDEN", { defined: true, message: "x" })
    },
  })
  await expect(
    oauthStartCore(other as never, { provider: "google", next: undefined })
  ).rejects.toBeInstanceOf(ORPCError)
})

test("start: the sign-in-again form's buttons mark the cookie, and only those", async () => {
  const marked = await oauthStartCore(deps() as never, {
    provider: "google",
    next: undefined,
    reauth: true,
  })
  expect(decodeOauthCookie((marked as { cookie: string }).cookie)?.reauth).toBe(true)
  const plain = await oauthStartCore(deps() as never, { provider: "google", next: undefined })
  expect(decodeOauthCookie((plain as { cookie: string }).cookie)?.reauth).toBeUndefined()
})

test("callback: a connect refused for an old session goes to the sign-in form", async () => {
  const d = deps({
    callback: async () => {
      throw reauthRefusal()
    },
  })
  const security = encodeOauthCookie({
    provider: "google",
    state: "st",
    next: "http://account.brand.localhost:3003/security",
  })
  const out = await oauthCallbackCore(d as never, {
    provider: "google",
    params: { code: "c", state: "st" },
    cookie: security,
    signedIn: true,
    currentToken: "mine",
  })
  expect(out).toEqual({
    redirectTo: `/login?reauth=1&next=${encodeURIComponent("http://account.brand.localhost:3003/security")}`,
    clearCookie: true,
  })
})

test("callback: begun on the sign-in-again form, a signed-in browser signs in afresh", async () => {
  const seen: string[] = []
  const d = deps({
    callback: async (_input: unknown, as: string) => {
      seen.push(as)
      return { user: { id: 1 }, session: { token: "fresh", expiresAt: "x" } }
    },
  })
  const out = await oauthCallbackCore(d as never, {
    provider: "google",
    params: { code: "c", state: "st" },
    cookie: encodeOauthCookie({ provider: "google", state: "st", next: "/security", reauth: true }),
    signedIn: true,
    currentToken: "old",
  })
  // Anonymous (no session forwarded, so no connect and no re-auth refusal), and the new session
  // is set: the route ends the old one.
  expect(seen).toEqual(["anonymous"])
  expect(out).toMatchObject({ redirectTo: "/security", session: { token: "fresh" } })
})

test("apple form_post: bounces to the same-origin GET callback with the fields in the query", () => {
  const user = JSON.stringify({ name: { firstName: "Ada", lastName: "L" } })
  const location = appleFormPostRedirect("apple", { code: "c/1+2", state: "s t", user })
  expect(location.startsWith("/oauth/apple/callback?")).toBe(true)
  const q = new URL(location, "http://auth.brand.localhost:3002").searchParams
  expect(q.get("code")).toBe("c/1+2")
  expect(q.get("state")).toBe("s t")
  expect(q.get("user")).toBe(user)
  expect(q.has("error")).toBe(false)
  expect(appleFormPostRedirect("apple", {})).toBe("/oauth/apple/callback")
  expect(appleFormPostRedirect("a/b", { state: "s" })).toBe("/oauth/a%2Fb/callback?state=s")
})

test("callback: apple's form body user JSON is parsed and passed through", async () => {
  let seen: unknown
  const d = deps({
    providers: ["apple"],
    callback: async (input: unknown) => {
      seen = input
      return { user: { id: 1 }, session: { token: "t", expiresAt: "x" } }
    },
  })
  const appleCookie = encodeOauthCookie({ provider: "apple", state: "st", next: undefined })
  await oauthCallbackCore(d as never, {
    provider: "apple",
    params: {
      code: "c",
      state: "st",
      user: JSON.stringify({ name: { firstName: "Ada", lastName: "L" } }),
    },
    cookie: appleCookie,
  })
  expect(seen).toMatchObject({ appleUser: { name: { firstName: "Ada", lastName: "L" } } })
})

// oauth.ts itself no longer builds this message — the login page does, through
// `oauthErrorMessageIn` (lib/i18n.ts) and `providerLabel` (lib/providers.ts). This test exercises
// that actual path rather than dead code oauth.ts used to re-export.
test("login error messages: known codes name the provider; unknown codes and keys show nothing", () => {
  const t = authTranslator("en")
  expect(oauthErrorMessageIn(t, "claimed", providerLabel("github"))).toContain(
    "That GitHub account is already connected"
  )
  expect(oauthErrorMessageIn(t, "provider", providerLabel("google"))).toContain(
    "Google is not responding"
  )
  expect(oauthErrorMessageIn(t, "unverified", providerLabel("google"))).toBe(
    "Your Google account's email is not verified — sign in with your email first, then connect Google in your account."
  )
  expect(oauthErrorMessageIn(t, "state", undefined)).toContain("expired")
  expect(oauthErrorMessageIn(t, "constructor", providerLabel("toString"))).toBeUndefined()
  expect(oauthErrorMessageIn(t, "unverified", providerLabel("constructor"))).toContain(
    "connect the provider"
  )
  expect(oauthErrorMessageIn(t, undefined, providerLabel("google"))).toBeUndefined()
})

test("cookie: anything we did not write decodes to null", () => {
  expect(decodeOauthCookie("not-base64-json")).toBeNull()
  expect(
    decodeOauthCookie(Buffer.from(JSON.stringify({ provider: "google" })).toString("base64url"))
  ).toBeNull()
  expect(decodeOauthCookie(undefined)).toBeNull()
})
