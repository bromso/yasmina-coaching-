import { describe, expect, test } from "bun:test"
import type { ProviderId } from "../queries/identities"
import { type Provider, pemToPkcs8 } from "./provider"
import { createProviders } from "./providers"

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = (payload: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(payload)}.sig`

// A throwaway ES256 key: Arctic's Apple client signs its client secret with it on every exchange.
const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
])
const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey))
const TEST_P8 = `-----BEGIN PRIVATE KEY-----\n${
  // gitleaks:allow
  der
    .toString("base64")
    .match(/.{1,64}/g)
    ?.join("\n") ?? ""
}\n-----END PRIVATE KEY-----`

const env = {
  OAUTH_GOOGLE_CLIENT_ID: "g",
  OAUTH_GOOGLE_CLIENT_SECRET: "gs",
  OAUTH_GITHUB_CLIENT_ID: "h",
  OAUTH_GITHUB_CLIENT_SECRET: "hs",
  OAUTH_APPLE_CLIENT_ID: "a",
  OAUTH_APPLE_TEAM_ID: "team",
  OAUTH_APPLE_KEY_ID: "key",
  OAUTH_APPLE_PRIVATE_KEY: TEST_P8,
}

// Arctic sends its token requests as a Request object, so read the URL off it.
const fakeFetch = (routes: Record<string, (init?: RequestInit) => Response>) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const key = url instanceof Request ? url.url : String(url)
    const handler = Object.entries(routes).find(([k]) => key.startsWith(k))?.[1]
    if (!handler) throw new Error(`unexpected fetch ${key}`)
    return handler(init)
  }) as typeof fetch

// Arctic calls the global fetch for the token endpoint and offers no injection point.
async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch
  globalThis.fetch = impl
  try {
    return await fn()
  } finally {
    globalThis.fetch = real
  }
}

function provider(id: ProviderId, fetchImpl: typeof fetch): Provider {
  const found = createProviders(env, "http://auth.example.com", fetchImpl).get(id)
  if (!found) throw new Error(`${id} is not configured`)
  return found
}

describe("createProviders", () => {
  test("only configured providers exist, in fixed order", () => {
    const p = createProviders(
      { OAUTH_GITHUB_CLIENT_ID: "h", OAUTH_GITHUB_CLIENT_SECRET: "hs" },
      "http://auth.example.com"
    )
    expect([...p.keys()]).toEqual(["github"])
    expect([...createProviders(env, "http://auth.example.com").keys()]).toEqual([
      "google",
      "github",
      "apple",
    ])
  })
})

describe("google", () => {
  test("start uses PKCE and the right redirect; exchange reads the id token", async () => {
    const fetch = fakeFetch({
      "https://oauth2.googleapis.com/token": () =>
        Response.json({
          access_token: "at",
          token_type: "Bearer",
          id_token: jwt({
            sub: "g-1",
            email: "ada@example.com",
            email_verified: true,
            name: "Ada",
          }),
        }),
    })
    const google = provider("google", fetch)
    const url = google.start("st", "verifier")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://auth.example.com/oauth/google/callback"
    )
    expect(url.searchParams.get("code_challenge")).toBeTruthy()
    expect(google.pkce).toBe(true)
    expect(
      await withFetch(fetch, () => google.exchange({ code: "c", codeVerifier: "verifier" }))
    ).toEqual({ providerUserId: "g-1", email: "ada@example.com", emailVerified: true, name: "Ada" })
  })
})

describe("github", () => {
  test("picks the primary verified email and reports unverified when there is none", async () => {
    const emails = [
      { email: "x@example.com", primary: false, verified: true },
      { email: "ada@example.com", primary: true, verified: true },
    ]
    const fetch = fakeFetch({
      "https://github.com/login/oauth/access_token": () =>
        Response.json({ access_token: "at", token_type: "bearer" }),
      "https://api.github.com/user/emails": () => Response.json(emails),
      "https://api.github.com/user": () => Response.json({ id: 42, name: "Ada", login: "ada" }),
    })
    const github = provider("github", fetch)
    expect(github.pkce).toBe(false)
    expect(github.start("st").searchParams.get("redirect_uri")).toBe(
      "http://auth.example.com/oauth/github/callback"
    )
    expect(await withFetch(fetch, () => github.exchange({ code: "c" }))).toEqual({
      providerUserId: "42",
      email: "ada@example.com",
      emailVerified: true,
      name: "Ada",
    })
    emails[1] = { email: "ada@example.com", primary: true, verified: false }
    expect(await withFetch(fetch, () => github.exchange({ code: "c" }))).toMatchObject({
      email: null,
      emailVerified: false,
    })
    // A null entry is skipped; a primary verified entry without an email string does not count.
    emails.splice(0, emails.length, null as never, { primary: true, verified: true } as never)
    expect(await withFetch(fetch, () => github.exchange({ code: "c" }))).toMatchObject({
      email: null,
      emailVerified: false,
    })
  })

  test("falls back to the login for the name; a failed profile call is unreachable", async () => {
    const fetch = fakeFetch({
      "https://github.com/login/oauth/access_token": () =>
        Response.json({ access_token: "at", token_type: "bearer" }),
      "https://api.github.com/user/emails": () => Response.json([]),
      "https://api.github.com/user": () => Response.json({ id: 7, name: null, login: "ada" }),
    })
    const github = provider("github", fetch)
    expect(await withFetch(fetch, () => github.exchange({ code: "c" }))).toEqual({
      providerUserId: "7",
      email: null,
      emailVerified: false,
      name: "ada",
    })
    const failing = fakeFetch({
      "https://github.com/login/oauth/access_token": () =>
        Response.json({ access_token: "at", token_type: "bearer" }),
      "https://api.github.com/user": () => new Response("rate limited", { status: 403 }),
    })
    const github2 = provider("github", failing)
    await expect(withFetch(failing, () => github2.exchange({ code: "c" }))).rejects.toMatchObject({
      kind: "unreachable",
    })
  })
})

describe("apple", () => {
  test("form_post, string email_verified, name from the first-consent body", async () => {
    let clientSecret: string | null = null
    const fetch = fakeFetch({
      "https://appleid.apple.com/auth/token": () =>
        Response.json({
          access_token: "at",
          token_type: "Bearer",
          id_token: jwt({
            sub: "001.abc",
            email: "r@privaterelay.appleid.com",
            email_verified: "true",
          }),
        }),
    })
    const spy = (async (url: string | URL | Request, init?: RequestInit) => {
      if (url instanceof Request)
        clientSecret = new URLSearchParams(await url.clone().text()).get("client_secret")
      return fetch(url, init)
    }) as typeof fetch
    const apple = provider("apple", fetch)
    const url = apple.start("st")
    expect(url.searchParams.get("response_mode")).toBe("form_post")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://auth.example.com/oauth/apple/callback"
    )
    expect(apple.pkce).toBe(false)
    expect(
      await withFetch(spy, () =>
        apple.exchange({ code: "c", appleUser: { name: { firstName: "Ada", lastName: "L" } } })
      )
    ).toEqual({
      providerUserId: "001.abc",
      email: "r@privaterelay.appleid.com",
      emailVerified: true,
      name: "Ada L",
    })
    // The client secret is an ES256 JWT signed with the configured key.
    const [header] = (clientSecret ?? "").split(".")
    expect(JSON.parse(Buffer.from(header ?? "", "base64url").toString())).toMatchObject({
      alg: "ES256",
      kid: "key",
    })
    expect((await withFetch(fetch, () => apple.exchange({ code: "c" }))).name).toBeNull()
  })
})

describe("errors", () => {
  test("a rejected code is invalid_code; a network failure is unreachable", async () => {
    // GitHub answers a bad code with 200 and an `error` field; Arctic turns that into OAuth2RequestError.
    const bad = fakeFetch({
      "https://github.com/login/oauth/access_token": () =>
        Response.json({ error: "bad_verification_code" }),
    })
    const github = provider("github", bad)
    await expect(withFetch(bad, () => github.exchange({ code: "c" }))).rejects.toMatchObject({
      kind: "invalid_code",
      providerCode: "bad_verification_code",
    })
    const down = (async () => {
      throw new TypeError("fetch failed")
    }) as unknown as typeof fetch
    const github2 = provider("github", down)
    await expect(withFetch(down, () => github2.exchange({ code: "c" }))).rejects.toMatchObject({
      kind: "unreachable",
    })
  })

  test("a rejected Google code is invalid_code", async () => {
    const bad = fakeFetch({
      "https://oauth2.googleapis.com/token": () =>
        Response.json({ error: "invalid_grant" }, { status: 400 }),
    })
    const google = provider("google", bad)
    await expect(
      withFetch(bad, () => google.exchange({ code: "c", codeVerifier: "v" }))
    ).rejects.toMatchObject({ kind: "invalid_code", providerCode: "invalid_grant" })
  })
})

describe("pemToPkcs8", () => {
  test("reads a multi-line PEM and a single-line \\n-escaped one alike", () => {
    const escaped = TEST_P8.replace(/\n/g, "\\n")
    expect(escaped).not.toContain("\n")
    expect(Buffer.from(pemToPkcs8(TEST_P8))).toEqual(der)
    expect(Buffer.from(pemToPkcs8(escaped))).toEqual(der)
  })

  test("rejects an empty body", () => {
    expect(() => pemToPkcs8("-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----")).toThrow()
  })
})

describe("odd provider answers", () => {
  const tokenOnly = (url: string, body: Record<string, unknown>) =>
    fakeFetch({ [url]: () => Response.json({ access_token: "at", token_type: "Bearer", ...body }) })
  const idTokenCases = [
    ["google", "https://oauth2.googleapis.com/token"],
    ["apple", "https://appleid.apple.com/auth/token"],
  ] as const

  for (const [id, url] of idTokenCases) {
    test(`${id}: a token response without an id token is unreachable`, async () => {
      const fetch = tokenOnly(url, {})
      const p = provider(id, fetch)
      await expect(
        withFetch(fetch, () => p.exchange({ code: "c", codeVerifier: "v" }))
      ).rejects.toMatchObject({ name: "ProviderExchangeError", kind: "unreachable" })
    })

    test(`${id}: an id token without a subject is unreachable`, async () => {
      for (const idToken of [jwt({ email: "ada@example.com" }), jwt({ sub: "" }), "not.a-jwt"]) {
        const fetch = tokenOnly(url, { id_token: idToken })
        const p = provider(id, fetch)
        await expect(
          withFetch(fetch, () => p.exchange({ code: "c", codeVerifier: "v" }))
        ).rejects.toMatchObject({ name: "ProviderExchangeError", kind: "unreachable" })
      }
    })
  }

  test("github: a /user body without a numeric id is unreachable", async () => {
    for (const user of [{ login: "ada" }, { id: "42", login: "ada" }]) {
      const fetch = fakeFetch({
        "https://github.com/login/oauth/access_token": () =>
          Response.json({ access_token: "at", token_type: "bearer" }),
        "https://api.github.com/user/emails": () => Response.json([]),
        "https://api.github.com/user": () => Response.json(user),
      })
      const p = provider("github", fetch)
      await expect(withFetch(fetch, () => p.exchange({ code: "c" }))).rejects.toMatchObject({
        name: "ProviderExchangeError",
        kind: "unreachable",
      })
    }
  })

  test("github: a token response without an access token is unreachable", async () => {
    const fetch = fakeFetch({
      "https://github.com/login/oauth/access_token": () => Response.json({ token_type: "bearer" }),
    })
    const p = provider("github", fetch)
    await expect(withFetch(fetch, () => p.exchange({ code: "c" }))).rejects.toMatchObject({
      name: "ProviderExchangeError",
      kind: "unreachable",
    })
  })
})
