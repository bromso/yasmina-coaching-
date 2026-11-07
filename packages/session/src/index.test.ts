import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { os } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import {
  type ApiClient,
  entitlementsFor,
  type Me,
  type User,
  type WorkspaceList,
  type WorkspaceSummary,
} from "@repo/api-contract"

// `server-only` throws outside a react-server bundle; stub it so createAuth loads under bun test.
mock.module("server-only", () => ({}))
// The request scope: the cookies and request headers a test sets, and every cookie written.
let requestHeaders = new Headers()
let requestCookies = new Map<string, string>()
let cookieWrites: { name: string; value: string; options: Record<string, unknown> }[] = []
mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      requestCookies.has(name) ? { name, value: requestCookies.get(name) } : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieWrites.push({ name, value, options })
    },
  }),
  headers: async () => requestHeaders,
}))
// The api, as fixtures: while `fakeApi` is set, `createApiClient` returns it. The real functions
// are captured first (bun test shares one process, so other files must still see them).
const real = await import("./client")
let fakeApi: {
  user: User | null
  list: WorkspaceList
  down?: boolean
  impersonation?: Me["impersonation"]
  /** `notifications.unreadCount`'s answer; "down" throws a network error. Default 0. */
  unread?: number | "down"
} | null = null
const fakeMe = (): Me => {
  if (!fakeApi?.user) throw new ORPCError("UNAUTHORIZED")
  return {
    user: fakeApi.user,
    session: { id: 1, expiresAt: "2027-01-01T00:00:00.000Z" },
    impersonation: fakeApi.impersonation ?? null,
    localeChosen: true,
  }
}
const logged: unknown[][] = []
const fakeClient = () =>
  ({
    auth: { me: async () => fakeMe() },
    notifications: {
      unreadCount: async () => {
        if (fakeApi?.unread === "down") throw new TypeError("fetch failed")
        if (!fakeApi?.user) throw new ORPCError("UNAUTHORIZED")
        return { count: fakeApi.unread ?? 0 }
      },
    },
    workspaces: {
      list: async () => {
        if (fakeApi?.down) throw new TypeError("fetch failed")
        if (!fakeApi?.user) throw new ORPCError("UNAUTHORIZED")
        return fakeApi.list
      },
    },
  }) as unknown as ApiClient
const {
  createApiClient: realCreateApiClient,
  getMeFromToken: realGetMeFromToken,
  getUserFromToken: realGetUserFromToken,
} = real
mock.module("./client", () => ({
  ...real,
  createApiClient: (opts: Parameters<typeof realCreateApiClient>[0]) =>
    fakeApi ? fakeClient() : realCreateApiClient(opts),
  getMeFromToken: async (
    opts: Parameters<typeof realGetMeFromToken>[0],
    token: string | null | undefined
  ) => {
    if (!fakeApi) return realGetMeFromToken(opts, token)
    if (!token) return null
    try {
      return fakeMe()
    } catch {
      return null
    }
  },
  getUserFromToken: async (
    opts: Parameters<typeof realGetUserFromToken>[0],
    token: string | null | undefined
  ) => {
    if (!fakeApi) return realGetUserFromToken(opts, token)
    if (!token) return null
    try {
      return fakeMe().user
    } catch {
      return null
    }
  },
}))
class Redirect extends Error {}
mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url)
  },
}))
// React's `cache` memoizes only inside a server render, never under bun test. While `perRequest`
// is on, it memoizes per `cache()` call — per createAuth instance, which stands in for one request.
let perRequest = false
const realReact = await import("react")
mock.module("react", () => ({
  ...realReact,
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    let memo: { value: R } | undefined
    return (...args: A): R => {
      if (!perRequest) return fn(...args)
      memo ??= { value: fn(...args) }
      return memo.value
    }
  },
}))
const { createAuth, localeFromRequest, UNREAD_COUNT_TIMEOUT_MS } = await import("./index")

const options = {
  apiUrl: "http://127.0.0.1:1",
  serviceToken: "svc",
  cookieDomain: ".brand.localhost",
  authUrl: "http://auth.brand.localhost:3002",
  appUrl: "http://app.brand.localhost:3001",
}

test("getUserFromRequest resolves a malformed session cookie to null instead of throwing", async () => {
  const auth = createAuth(options)
  const req = new Request("http://app.brand.localhost:3001/api/x", {
    headers: { cookie: "session=abc%E0%A4%A" },
  })
  await expect(auth.getUserFromRequest(req)).resolves.toBeNull()
})

test("requireUser targets next, then x-url, then appUrl — never referer", async () => {
  const login = (target: string) =>
    `http://auth.brand.localhost:3002/login?next=${encodeURIComponent(target)}`
  const redirectOf = async (run: () => Promise<unknown>) => {
    try {
      await run()
    } catch (error) {
      if (error instanceof Redirect) return error.message
      throw error
    }
    throw new Error("requireUser did not redirect")
  }
  requestHeaders = new Headers({
    "x-url": "http://app.brand.localhost:3001/notes",
    referer: "http://evil.com/",
  })
  expect(await redirectOf(() => createAuth(options).requireUser({ next: "http://x/" }))).toBe(
    login("http://x/")
  )
  expect(await redirectOf(() => createAuth(options).requireUser())).toBe(
    login("http://app.brand.localhost:3001/notes")
  )
  requestHeaders = new Headers({ referer: "http://evil.com/" })
  expect(await redirectOf(() => createAuth(options).requireUser())).toBe(
    login("http://app.brand.localhost:3001")
  )
})

const user: User = {
  id: 7,
  email: "ada@example.com",
  name: "Ada",
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerified: true,
  hasPassword: true,
  superadmin: false,
  avatarUrl: null,
  locale: "en",
  deletionScheduledAt: null,
  passkeys: 0,
  twoFactorSatisfied: false,
}
const ws = (id: number, role: WorkspaceSummary["role"]): WorkspaceSummary => ({
  id,
  name: `Workspace ${id}`,
  slug: `workspace-${id}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  role,
  memberCount: 1,
  entitlements: entitlementsFor({ subscription: null, memberCount: 1, portalAvailable: false }),
  logoUrl: null,
  requireTwoFactor: false,
})
const redirectOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    if (error instanceof Redirect) return error.message
    throw error
  }
  throw new Error("did not redirect")
}
const onboarding = "http://app.brand.localhost:3001/workspaces/new"

describe("the current workspace", () => {
  const signIn = (items: WorkspaceSummary[]) => {
    fakeApi = { user, list: { items, pendingInvitations: [] } }
    requestCookies.set("session", "tok")
  }
  beforeEach(() => {
    requestHeaders = new Headers()
    requestCookies = new Map()
    cookieWrites = []
  })
  afterEach(() => {
    fakeApi = null
  })

  test("requireWorkspace returns the cookie's workspace and the role in it", async () => {
    signIn([ws(1, "owner"), ws(2, "member")])
    requestCookies.set("workspace", "2")
    const access = await createAuth(options).requireWorkspace()
    expect(access).toEqual({
      user,
      workspace: ws(2, "member"),
      role: "member",
      entitlements: ws(2, "member").entitlements,
    })
  })

  test("requireWorkspace carries the workspace's entitlements", async () => {
    const pro = {
      ...ws(1, "owner"),
      entitlements: entitlementsFor({
        subscription: {
          plan: "pro",
          interval: "month",
          status: "active",
          currentPeriodEnd: "2026-11-01T00:00:00.000Z",
          cancelAtPeriodEnd: false,
        },
        memberCount: 1,
        portalAvailable: true,
      }),
    }
    signIn([pro])
    const access = await createAuth(options).requireWorkspace()
    expect(access.entitlements).toEqual(pro.entitlements)
    expect(access.entitlements.features).toContain("chat")
  })

  test("a stale cookie with two workspaces redirects to onboarding", async () => {
    signIn([ws(1, "owner"), ws(2, "member")])
    requestCookies.set("workspace", "9")
    expect(await redirectOf(() => createAuth(options).requireWorkspace())).toBe(onboarding)
  })

  test("a stale cookie with one workspace uses that one, without writing a cookie", async () => {
    signIn([ws(1, "admin")])
    requestCookies.set("workspace", "9")
    const access = await createAuth(options).requireWorkspace()
    expect(access.workspace.id).toBe(1)
    expect(access.role).toBe("admin")
    expect(cookieWrites).toEqual([])
  })

  test("no cookie and no workspaces redirects to onboarding", async () => {
    signIn([])
    expect(await redirectOf(() => createAuth(options).requireWorkspace())).toBe(onboarding)
  })

  test("signed out goes through requireUser's login redirect", async () => {
    fakeApi = { user: null, list: { items: [ws(1, "owner")], pendingInvitations: [] } }
    expect(await redirectOf(() => createAuth(options).requireWorkspace())).toBe(
      `http://auth.brand.localhost:3002/login?next=${encodeURIComponent(options.appUrl)}`
    )
  })

  test("currentWorkspace reads the cookie against the list, never redirecting", async () => {
    const auth = createAuth(options)
    const list = { items: [ws(1, "owner"), ws(2, "viewer")], pendingInvitations: [] }
    expect(await auth.currentWorkspace(list)).toBeNull()
    requestCookies.set("workspace", "2")
    expect(await auth.currentWorkspace(list)).toEqual(ws(2, "viewer"))
    requestCookies.set("workspace", "abc")
    expect(await auth.currentWorkspace({ ...list, items: [ws(1, "owner")] })).toEqual(
      ws(1, "owner")
    )
  })

  test("setCurrentWorkspace refuses a workspace the user is not a member of", async () => {
    signIn([ws(1, "owner"), ws(2, "member")])
    expect(await createAuth(options).setCurrentWorkspace(9)).toBe(false)
    expect(cookieWrites).toEqual([])
  })

  test("setCurrentWorkspace writes the workspace cookie for a membership", async () => {
    signIn([ws(1, "owner"), ws(2, "member")])
    expect(await createAuth(options).setCurrentWorkspace(2)).toBe(true)
    expect(cookieWrites).toEqual([
      {
        name: "workspace",
        value: "2",
        options: {
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure: false,
          domain: ".brand.localhost",
          maxAge: 31536000,
        },
      },
    ])
  })

  test("clearCurrentWorkspace expires the cookie", async () => {
    await createAuth(options).clearCurrentWorkspace()
    expect(cookieWrites).toEqual([
      {
        name: "workspace",
        value: "",
        options: {
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure: false,
          domain: ".brand.localhost",
          maxAge: 0,
        },
      },
    ])
  })
})

describe("getWorkspaceFromRequest", () => {
  const request = (cookie?: string) =>
    new Request("http://app.brand.localhost:3001/api/chat", {
      headers: cookie ? { cookie } : {},
    })
  const two = { items: [ws(1, "owner"), ws(2, "member")], pendingInvitations: [] }
  const realError = console.error
  beforeEach(() => {
    logged.length = 0
    console.error = (...args: unknown[]) => {
      logged.push(args)
    }
  })
  afterEach(() => {
    fakeApi = null
    console.error = realError
  })

  test("the workspace cookie's workspace when the user is a member", async () => {
    fakeApi = { user, list: two }
    const found = await createAuth(options).getWorkspaceFromRequest(
      request("session=tok; workspace=2")
    )
    expect(found).toEqual(ws(2, "member"))
  })

  test("no workspace cookie: the only workspace, else null", async () => {
    fakeApi = { user, list: { items: [ws(1, "admin")], pendingInvitations: [] } }
    expect(await createAuth(options).getWorkspaceFromRequest(request("session=tok"))).toEqual(
      ws(1, "admin")
    )
    fakeApi = { user, list: two }
    expect(await createAuth(options).getWorkspaceFromRequest(request("session=tok"))).toBeNull()
  })

  test("a stale workspace cookie falls back by the same rule", async () => {
    fakeApi = { user, list: two }
    const auth = createAuth(options)
    expect(await auth.getWorkspaceFromRequest(request("session=tok; workspace=9"))).toBeNull()
    fakeApi = { user, list: { items: [ws(1, "owner")], pendingInvitations: [] } }
    expect(await auth.getWorkspaceFromRequest(request("session=tok; workspace=9"))).toEqual(
      ws(1, "owner")
    )
  })

  test("signed out is null: no session cookie, or one the api refuses (not logged)", async () => {
    fakeApi = { user, list: two }
    const auth = createAuth(options)
    expect(await auth.getWorkspaceFromRequest(request("workspace=1"))).toBeNull()
    expect(await auth.getWorkspaceFromRequest(request())).toBeNull()
    fakeApi = { user: null, list: two }
    expect(await auth.getWorkspaceFromRequest(request("session=gone; workspace=1"))).toBeNull()
    expect(logged).toEqual([])
  })

  test("an unreachable api is null and logged", async () => {
    fakeApi = { user, list: two, down: true }
    expect(
      await createAuth(options).getWorkspaceFromRequest(request("session=tok; workspace=1"))
    ).toBeNull()
    expect(logged.length).toBe(1)
  })
})

describe("resolveWorkspaceFromRequest", () => {
  const request = (cookie?: string) =>
    new Request("http://app.brand.localhost:3001/api/chat", {
      headers: cookie ? { cookie } : {},
    })
  const realError = console.error
  beforeEach(() => {
    logged.length = 0
    console.error = (...args: unknown[]) => {
      logged.push(args)
    }
  })
  afterEach(() => {
    fakeApi = null
    console.error = realError
  })

  test("found, none and signed out carry no error", async () => {
    const auth = createAuth(options)
    fakeApi = { user, list: { items: [ws(1, "owner")], pendingInvitations: [] } }
    expect(await auth.resolveWorkspaceFromRequest(request("session=tok"))).toEqual({
      workspace: ws(1, "owner"),
    })
    fakeApi = { user, list: { items: [], pendingInvitations: [] } }
    expect(await auth.resolveWorkspaceFromRequest(request("session=tok"))).toEqual({
      workspace: null,
    })
    expect(await auth.resolveWorkspaceFromRequest(request())).toEqual({ workspace: null })
    fakeApi = { user: null, list: { items: [], pendingInvitations: [] } }
    expect(await auth.resolveWorkspaceFromRequest(request("session=gone"))).toEqual({
      workspace: null,
    })
  })

  test("an unreachable api is null with the error, so the caller can tell it from no workspace", async () => {
    fakeApi = { user, list: { items: [ws(1, "owner")], pendingInvitations: [] }, down: true }
    const result = await createAuth(options).resolveWorkspaceFromRequest(request("session=tok"))
    expect(result.workspace).toBeNull()
    expect(result.error).toBeDefined()
    expect(logged.length).toBe(1)
  })
})

describe("unreadNotificationCount", () => {
  const realError = console.error
  beforeEach(() => {
    logged.length = 0
    requestHeaders = new Headers()
    requestCookies = new Map([["session", "tok"]])
    console.error = (...args: unknown[]) => {
      logged.push(args)
    }
  })
  afterEach(() => {
    fakeApi = null
    requestCookies = new Map()
    console.error = realError
  })

  test("the api's count for the signed-in user", async () => {
    fakeApi = { user, list: { items: [], pendingInvitations: [] }, unread: 3 }
    expect(await createAuth(options).unreadNotificationCount()).toBe(3)
    fakeApi = { user, list: { items: [], pendingInvitations: [] }, unread: 100 }
    expect(await createAuth(options).unreadNotificationCount()).toBe(100)
  })

  test("signed out is null without asking, and an expired session is null, not logged", async () => {
    requestCookies = new Map()
    fakeApi = { user, list: { items: [], pendingInvitations: [] }, unread: 3 }
    expect(await createAuth(options).unreadNotificationCount()).toBeNull()
    requestCookies = new Map([["session", "gone"]])
    fakeApi = { user: null, list: { items: [], pendingInvitations: [] } }
    expect(await createAuth(options).unreadNotificationCount()).toBeNull()
    expect(logged).toEqual([])
  })

  test("an unreachable api is null and logged, never thrown", async () => {
    fakeApi = { user, list: { items: [], pendingInvitations: [] }, unread: "down" }
    expect(await createAuth(options).unreadNotificationCount()).toBeNull()
    expect(logged.length).toBe(1)
  })

  test(
    "an api that never answers is null once the timeout passes",
    async () => {
      const hang = ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
        })) as typeof fetch
      const started = Date.now()
      expect(await createAuth({ ...options, fetch: hang }).unreadNotificationCount()).toBeNull()
      expect(Date.now() - started).toBeGreaterThanOrEqual(UNREAD_COUNT_TIMEOUT_MS - 50)
      expect(logged.length).toBe(1)
    },
    UNREAD_COUNT_TIMEOUT_MS + 3_000
  )
})

describe("impersonation cookies", () => {
  const imp = { token: "imp-token", expiresAt: "2026-06-01T13:00:00.000Z" }
  beforeEach(() => {
    cookieWrites = []
    requestCookies = new Map([["session", "admin-token"]])
    fakeApi = { user, list: { items: [], pendingInvitations: [] } }
  })
  afterEach(() => {
    fakeApi = null
  })

  test("startImpersonation stashes the admin token under /admin and swaps session", async () => {
    await createAuth(options).startImpersonation(imp)
    expect(cookieWrites).toEqual([
      {
        name: "admin_session",
        value: "admin-token",
        options: { httpOnly: true, path: "/admin", sameSite: "lax", secure: false, maxAge: 3600 },
      },
      {
        name: "session",
        value: "imp-token",
        options: expect.objectContaining({
          domain: ".brand.localhost",
          path: "/",
          expires: new Date(imp.expiresAt),
        }),
      },
    ])
    expect(cookieWrites[1]?.options).not.toHaveProperty("maxAge")
  })

  test("startImpersonation without a session to stash throws (nothing written)", async () => {
    requestCookies = new Map()
    await expect(createAuth(options).startImpersonation(imp)).rejects.toThrow()
    expect(cookieWrites).toEqual([])
  })

  test("endImpersonation restores the stashed token and clears the stash", async () => {
    requestCookies = new Map([
      ["session", "imp-token"],
      ["admin_session", "admin-token"],
    ])
    expect(await createAuth(options).endImpersonation()).toBe(true)
    expect(cookieWrites).toEqual([
      {
        name: "admin_session",
        value: "",
        options: expect.objectContaining({ maxAge: 0, path: "/admin" }),
      },
      {
        name: "session",
        value: "admin-token",
        options: expect.objectContaining({ domain: ".brand.localhost", maxAge: 30 * 24 * 3600 }),
      },
    ])
  })

  test("endImpersonation with no stash clears session and reports false", async () => {
    requestCookies = new Map([["session", "imp-token"]])
    expect(await createAuth(options).endImpersonation()).toBe(false)
    expect(cookieWrites.map((w) => [w.name, w.value, w.options.maxAge])).toEqual([
      ["admin_session", "", 0],
      ["session", "", 0],
    ])
  })

  test("readAdminSession and getMe", async () => {
    requestCookies = new Map([
      ["session", "imp-token"],
      ["admin_session", "admin-token"],
    ])
    fakeApi = {
      user,
      list: { items: [], pendingInvitations: [] },
      impersonation: {
        by: { id: 1, name: "Root", email: "root@example.com" },
        reason: "r",
        expiresAt: imp.expiresAt,
      },
    }
    const auth = createAuth(options)
    expect(await auth.readAdminSession()).toBe("admin-token")
    expect((await auth.getMe())?.impersonation?.by.email).toBe("root@example.com")
    expect(await auth.getUser()).toEqual(user)
  })
})

describe("the locale", () => {
  // A real api client over a fake api: every request's headers are recorded, per procedure.
  type Call = { path: string; headers: Headers }
  let calls: Call[] = []
  let stubUser: (User & { chosen: boolean }) | null = null
  let down = false
  const setLocaleInputs: unknown[] = []
  const handler = new RPCHandler({
    auth: {
      me: os.handler(() => {
        if (!stubUser) throw new ORPCError("UNAUTHORIZED")
        const { chosen, ...rest } = stubUser
        return {
          user: rest,
          session: { id: 1, expiresAt: "2027-01-01T00:00:00.000Z" },
          impersonation: null,
          localeChosen: chosen,
        }
      }),
    },
    account: {
      setLocale: os.handler(({ input }) => {
        if (!stubUser) throw new ORPCError("UNAUTHORIZED")
        setLocaleInputs.push(input)
        const { locale } = input as { locale: User["locale"] }
        stubUser = { ...stubUser, locale, chosen: true }
        return input
      }),
      updateProfile: os.handler(({ input }) => {
        if (!stubUser) throw new ORPCError("UNAUTHORIZED")
        const { name } = input as { name: string }
        if (!name) throw new ORPCError("BAD_REQUEST")
        stubUser = { ...stubUser, name }
        return { user: stubUser }
      }),
    },
    workspaces: { list: os.handler(() => ({ items: [], pendingInvitations: [] })) },
    waitlist: { join: os.handler(() => ({ ok: true })) },
  })
  const fakeFetch = (async (input: Request | string | URL, init?: RequestInit) => {
    if (down) throw new TypeError("fetch failed")
    const request = new Request(input, init)
    calls.push({ path: new URL(request.url).pathname, headers: request.headers })
    const { response } = await handler.handle(request, { prefix: "/rpc", context: {} })
    return response ?? new Response("nope", { status: 404 })
  }) as typeof fetch
  const auth = (production = false) => createAuth({ ...options, fetch: fakeFetch, production })
  const signedIn = (locale: User["locale"], chosen: boolean) => {
    stubUser = { ...user, locale, chosen }
    requestCookies.set("session", "tok")
  }
  const localeOf = (path: string) => calls.find((c) => c.path === path)?.headers.get("x-locale")
  const realError = console.error

  beforeEach(() => {
    fakeApi = null
    calls = []
    stubUser = null
    down = false
    setLocaleInputs.length = 0
    perRequest = false
    requestHeaders = new Headers()
    requestCookies = new Map()
    cookieWrites = []
    console.error = () => {}
  })
  afterEach(() => {
    perRequest = false
    console.error = realError
  })

  test("signed in with a chosen locale: the saved preference beats the cookie", async () => {
    signedIn("sv", true)
    requestCookies.set("locale", "en")
    requestHeaders = new Headers({ "accept-language": "en" })
    expect(await auth().getLocale()).toBe("sv")
  })

  test("signed in without a chosen locale: the cookie, not the English default", async () => {
    signedIn("en", false)
    requestCookies.set("locale", "sv")
    expect(await auth().getLocale()).toBe("sv")
  })

  test("signed out: the cookie, then Accept-Language, then English", async () => {
    requestCookies.set("locale", "sv")
    expect(await auth().getLocale()).toBe("sv")
    requestCookies = new Map()
    requestHeaders = new Headers({ "accept-language": "de, sv-SE;q=0.8" })
    expect(await auth().getLocale()).toBe("sv")
    requestHeaders = new Headers()
    expect(await auth().getLocale()).toBe("en")
    requestCookies.set("locale", "xx")
    expect(await auth().getLocale()).toBe("en")
  })

  test("an unreachable api never throws: the cookie, then Accept-Language", async () => {
    requestCookies.set("session", "tok")
    requestCookies.set("locale", "sv")
    down = true
    expect(await auth().getLocale()).toBe("sv")
    requestCookies.delete("locale")
    requestHeaders = new Headers({ "accept-language": "sv" })
    expect(await auth().getLocale()).toBe("sv")
  })

  test("api() and anonymousApi() send x-locale: the resolved locale", async () => {
    signedIn("sv", true)
    requestCookies.set("locale", "en")
    await (await auth().api()).workspaces.list()
    expect(localeOf("/rpc/workspaces/list")).toBe("sv")
    calls = []
    stubUser = null
    requestCookies = new Map([["locale", "sv"]])
    await (await auth().anonymousApi({ ip: "203.0.113.9" })).waitlist.join({
      email: "ada@example.com",
    })
    expect(localeOf("/rpc/waitlist/join")).toBe("sv")
  })

  test("anonymousApi sends x-locale only from a real signal, never the English fallback", async () => {
    requestHeaders = new Headers({ "accept-language": "de, fr;q=0.5" })
    await (await auth().anonymousApi()).waitlist.join({ email: "ada@example.com" })
    expect(calls.at(-1)?.headers.has("x-locale")).toBe(false)
    requestHeaders = new Headers({ "accept-language": "en-US" })
    await (await auth().anonymousApi()).waitlist.join({ email: "ada@example.com" })
    expect(calls.at(-1)?.headers.get("x-locale")).toBe("en")
  })

  test("api(), anonymousApi() and auth.me forward the proxy's x-request-id from headers()", async () => {
    const idOf = (path: string) =>
      calls.find((c) => c.path === path)?.headers.get("x-request-id") ?? null
    signedIn("en", true)
    requestHeaders = new Headers({ "x-request-id": "req-from-proxy-1" })
    await (await auth().api()).workspaces.list()
    expect(idOf("/rpc/auth/me")).toBe("req-from-proxy-1")
    expect(idOf("/rpc/workspaces/list")).toBe("req-from-proxy-1")
    calls = []
    await (await auth().anonymousApi()).waitlist.join({ email: "ada@example.com" })
    expect(idOf("/rpc/waitlist/join")).toBe("req-from-proxy-1")
    calls = []
    requestHeaders = new Headers({ "x-request-id": "not valid!" })
    await (await auth().anonymousApi()).waitlist.join({ email: "ada@example.com" })
    expect(idOf("/rpc/waitlist/join")).toBeNull()
  })

  test("route handlers' calls forward the request's own x-request-id", async () => {
    signedIn("en", true)
    const req = new Request("http://app.brand.localhost:3001/api/chat", {
      headers: { cookie: "session=tok", "x-request-id": "req-route-0001" },
    })
    await auth().getMeFromRequest(req)
    await auth().resolveWorkspaceFromRequest(req)
    const ids = calls.map((c) => [c.path, c.headers.get("x-request-id")])
    expect(ids).toEqual([
      ["/rpc/auth/me", "req-route-0001"],
      ["/rpc/workspaces/list", "req-route-0001"],
    ])
  })

  test("auth.me itself carries the request's locale (cookie, then Accept-Language)", async () => {
    signedIn("en", true)
    requestHeaders = new Headers({ "accept-language": "sv" })
    await auth().getUser()
    expect(localeOf("/rpc/auth/me")).toBe("sv")
  })

  test("route handlers' calls carry the request's cookie or Accept-Language", async () => {
    signedIn("en", true)
    const req = new Request("http://app.brand.localhost:3001/api/chat", {
      headers: { cookie: "session=tok; locale=sv" },
    })
    await auth().getUserFromRequest(req)
    await auth().resolveWorkspaceFromRequest(req)
    expect(localeOf("/rpc/auth/me")).toBe("sv")
    expect(localeOf("/rpc/workspaces/list")).toBe("sv")
  })

  test("auth.me runs once per request for getLocale, requireUser, getUser and api()", async () => {
    perRequest = true
    signedIn("sv", true)
    const a = auth()
    await Promise.all([a.getLocale(), a.requireUser(), a.getUser(), a.getMe()])
    await (await a.api()).workspaces.list()
    expect(await a.getLocale()).toBe("sv")
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(1)
  })

  test("without React's cache (a server action), getMe reads stay deduped within a request", async () => {
    signedIn("sv", true)
    const a = auth()
    await a.requireUser()
    await a.getMe()
    await a.getLocale()
    await a.api() // building a client calls nothing
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(1)
    // Another request (a new headers object) asks again.
    requestHeaders = new Headers()
    await a.getUser()
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(2)
  })

  test("two getMe calls with nothing between them fetch once", async () => {
    signedIn("sv", true)
    const a = auth()
    await a.getMe()
    await a.getMe()
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(1)
  })

  test("any other api call drops the request's memo: getMe, a write, getMe fetches twice", async () => {
    signedIn("en", true)
    const a = auth()
    expect((await a.getMe())?.user.name).toBe("Ada")
    await (await a.api()).account.updateProfile({ name: "Grace" })
    expect((await a.getMe())?.user.name).toBe("Grace")
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(2)
  })

  test("a failed call drops the memo too: the write may have committed", async () => {
    signedIn("en", true)
    const a = auth()
    await a.getMe()
    await expect((await a.api()).account.updateProfile({ name: "" })).rejects.toThrow()
    await a.getMe()
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(2)
  })

  test("anonymousApi() calls drop the memo as well", async () => {
    signedIn("en", true)
    const a = auth()
    await a.getMe()
    await (await a.anonymousApi()).waitlist.join({ email: "ada@example.com" })
    await a.getMe()
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(2)
  })

  test("invalidateMe() still drops the memo on its own", async () => {
    signedIn("en", true)
    const a = auth()
    await a.getMe()
    await a.invalidateMe()
    await a.getMe()
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(2)
  })

  test("setLocale, then getLocale in the same request: the new locale for a chosen user", async () => {
    signedIn("en", true)
    const a = auth()
    expect(await a.getLocale()).toBe("en")
    await a.setLocale("sv")
    expect(await a.getLocale()).toBe("sv")
  })

  test("the locale outlives a write: requireUser, a write, then api() twice ask auth.me once", async () => {
    signedIn("sv", true)
    const a = auth()
    await a.requireUser()
    await (await a.api()).account.updateProfile({ name: "Grace" })
    const second = await a.api()
    await a.api()
    await second.workspaces.list()
    expect(localeOf("/rpc/workspaces/list")).toBe("sv")
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(1)
    // The write dropped Me, though: a later getMe() asks again, once.
    expect((await a.getMe())?.user.name).toBe("Grace")
    await a.getMe()
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(2)
  })

  test("setLocale overwrites the request's locale: getLocale answers it without auth.me", async () => {
    signedIn("en", true)
    const a = auth()
    expect(await a.getLocale()).toBe("en")
    const before = calls.filter((c) => c.path === "/rpc/auth/me").length
    await a.setLocale("sv")
    expect(await a.getLocale()).toBe("sv")
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(before)
  })

  test("setLocale signed out overwrites it too, from the cookie it just wrote", async () => {
    const a = auth()
    expect(await a.getLocale()).toBe("en")
    await a.setLocale("sv")
    expect(await a.getLocale()).toBe("sv")
    expect(calls.some((c) => c.path === "/rpc/auth/me")).toBe(false)
  })

  test("invalidateMe() drops the cached locale as well as Me", async () => {
    signedIn("en", true)
    const a = auth()
    expect(await a.getLocale()).toBe("en")
    stubUser = { ...user, locale: "sv", chosen: true } // changed behind the clients' back
    expect(await a.getLocale()).toBe("en")
    await a.invalidateMe()
    expect(await a.getLocale()).toBe("sv")
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(2)
  })

  test("the cached locale is per request and per session token", async () => {
    signedIn("sv", true)
    const a = auth()
    expect(await a.getLocale()).toBe("sv")
    requestHeaders = new Headers() // another request
    stubUser = { ...user, locale: "en", chosen: true }
    expect(await a.getLocale()).toBe("en")
    // A session swapped within the request (a sign-in) resolves again.
    stubUser = { ...user, locale: "sv", chosen: true }
    requestCookies.set("session", "other")
    expect(await a.getLocale()).toBe("sv")
  })

  test("localeFromRequest: the cookie, then Accept-Language, then English", () => {
    const req = (headers: Record<string, string>) =>
      new Request("http://www.brand.localhost:3000/", { headers })
    expect(localeFromRequest(req({ cookie: "locale=sv", "accept-language": "en" }))).toBe("sv")
    expect(localeFromRequest(req({ "accept-language": "sv-SE" }))).toBe("sv")
    expect(localeFromRequest(req({ "accept-language": "de" }))).toBe("en")
  })

  test("the per-request memo is per session token: a swapped session asks again", async () => {
    signedIn("sv", true)
    const a = auth()
    await a.getUser()
    requestCookies.set("session", "other")
    await a.getUser()
    expect(calls.filter((c) => c.path === "/rpc/auth/me").length).toBe(2)
  })

  test("setLocale writes the locale cookie on COOKIE_DOMAIN, readable by scripts", async () => {
    await auth().setLocale("sv")
    expect(cookieWrites).toEqual([
      {
        name: "locale",
        value: "sv",
        options: {
          path: "/",
          maxAge: 31_536_000,
          sameSite: "lax",
          domain: ".brand.localhost",
          secure: false,
          httpOnly: false,
        },
      },
    ])
    cookieWrites = []
    await auth(true).setLocale("en")
    expect(cookieWrites[0]?.options).toMatchObject({ secure: true, domain: ".brand.localhost" })
  })

  test("setLocale saves the preference only when signed in", async () => {
    await auth().setLocale("sv")
    expect(setLocaleInputs).toEqual([])
    signedIn("en", false)
    await auth().setLocale("sv")
    expect(setLocaleInputs).toEqual([{ locale: "sv" }])
    expect(localeOf("/rpc/account/setLocale")).toBe("sv")
  })

  test("setLocale with an expired session still writes the cookie", async () => {
    requestCookies.set("session", "gone")
    await auth().setLocale("sv")
    expect(cookieWrites.map((w) => w.value)).toEqual(["sv"])
    expect(setLocaleInputs).toEqual([])
  })

  test("setLocale saves before writing: an api failure throws and leaves the cookie alone", async () => {
    signedIn("en", true)
    down = true
    await expect(auth().setLocale("sv")).rejects.toThrow()
    expect(cookieWrites).toEqual([])
  })

  test("setLocale refuses an unsupported locale and writes nothing", async () => {
    signedIn("en", true)
    // biome-ignore lint/suspicious/noExplicitAny: an input the type forbids, on purpose
    await expect(auth().setLocale("xx" as any)).rejects.toThrow()
    expect(cookieWrites).toEqual([])
    expect(setLocaleInputs).toEqual([])
  })
})
