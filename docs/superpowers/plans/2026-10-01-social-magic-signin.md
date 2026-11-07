# Social Sign-in and Magic Link (Phase 6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google, GitHub and Apple sign-in plus magic-link sign-in that issue the api's existing sessions, with account linking by verified email, passwordless accounts, and sign-in-method management in the account app.

**Architecture:** `apps/api` owns provider secrets and the token exchange through small Arctic-based adapters (`src/oauth/`), two new procedure groups (`auth.oauth.*`, `auth.magicLink.*`) and an `identities` table. `apps/auth` runs the browser legs as route handlers (`/oauth/[provider]/start|callback`) with an HttpOnly state cookie, renders real provider buttons, and adds a magic-link form and a `/magic` page whose **Continue** button consumes the token. `apps/account` shows sign-in methods (set password, connected accounts). Mail goes through the 6a seam.

**Tech Stack:** Bun 1.3+, oRPC, `Bun.sql` (SQLite + Postgres), Arctic 3.7, `@repo/email` (React Email), Next 16 route handlers + server actions, Biome.

**Spec:** `docs/superpowers/specs/2026-10-01-social-magic-signin-design.md`

## Global Constraints

- Biome 0 errors / 0 warnings / 0 infos; double quotes, no semicolons, 2-space, 100 cols; `bunx biome check --write <paths>` before each commit.
- Commit trailer, the only attribution line: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; subjects ≤ 100 chars.
- New catalog entry: `arctic` `^3.7.0` (root `package.json` catalog; `apps/api` references `"catalog:"`).
- Providers are exactly `google`, `github`, `apple` (fixed order). Redirect URI `${AUTH_URL}/oauth/<provider>/callback`. Google uses PKCE; GitHub and Apple do not. Apple uses `response_mode=form_post` and scopes `name email`; Google `openid email profile`; GitHub `read:user user:email`.
- Linking rule (binding): a provider identity (`provider`, `provider_user_id`) is the key; a new identity links to an existing user only when the provider asserts a **verified** email that matches; a verified unknown email creates a passwordless, verified user; an unverified or missing email → `FORBIDDEN` with nothing created. Connecting while signed in: unclaimed identity links to the session user (any email); claimed by another user → `CONFLICT`.
- Secrets never leave `apps/api`; logs carry provider ids only — never codes, tokens, or key material.
- State cookie on the auth host: name `oauth`, HttpOnly, `Secure`, `SameSite=None`, `Path=/oauth`, `Max-Age=600`, host-only (no `Domain`). Cleared on callback. State generated with `arctic.generateState()`, verifier with `arctic.generateCodeVerifier()`.
- Magic link: token from `newToken()`/`tokenHash()`, purpose `magic_link`, TTL 15 min (`MAGIC_TTL_MS = 15 * 60_000`), limiter `magic:<email>` 3 / 15 min silent, template subject "Your sign-in link", link `${AUTH_URL}/magic?token=…`, consumed only by a POST server action.
- Passwordless accounts: `password_hash NULL`; `signIn` verifies against `DUMMY_HASH` and returns `UNAUTHORIZED`; `changePassword` on a null hash → `FORBIDDEN` (current password cannot match); `setPassword` → `CONFLICT` when a hash exists; `identities.disconnect` → `FORBIDDEN` when it would leave no password and no identity.
- Mail sends use `detach()` from `apps/api/src/mail/mailer.ts`; token writes are awaited before it.
- Every api test runs on SQLite and (`bun --filter @repo/api test:postgres`, Postgres at `postgres://postgres:postgres@127.0.0.1:5432/postgres`) on Postgres. Tests read captured mail with the `mailsTo` helper, never by array position.
- `apps/app` is not modified.

## Review Focus

1. A callback whose URL provider differs from the cookie's provider (e.g. a Google code posted to the GitHub callback) must be refused before any api call — Task 5 test.
2. Apple sends `email_verified` as the string `"true"` in some id tokens — the adapter must normalise both boolean and string forms — Task 2 test.
3. A GitHub user with no verified primary email must get `FORBIDDEN` and leave no `users`/`identities` rows — Task 2 (adapter returns `emailVerified: false`) and Task 3 (callback matrix) tests.
4. A magic link requested for an unknown email whose owner then signs up with a password before clicking: consume must find that user by email, not create a duplicate — Task 4 test.
5. A signed-in user connecting a provider identity that is already theirs must be idempotent (no duplicate row, no error) — Task 3 test.

---

### Task 1: Schema — `identities`, nullable password, `magic_link` purpose, `tokens.email`

**Files:**
- Create: `apps/api/src/migrations/0005_identities.ts`, `apps/api/src/queries/identities.ts`
- Modify: `apps/api/src/migrations/index.ts`, `apps/api/src/db.ts`, `apps/api/src/queries/users.ts`, `apps/api/src/queries/tokens.ts`, `apps/api/src/router.ts` (null-hash handling in `changePassword`), `apps/api/src/queries/queries.test.ts`, `apps/api/src/migrate.test.ts`, `apps/api/src/credentials.ts` (`MAGIC_TTL_MS`)

**Interfaces:**
- Produces: `ProviderId = "google" | "github" | "apple"`; `IdentityRow = { id, user_id, provider, provider_user_id, email: string | null, created_at }`; `db.identities.create({ userId, provider, providerUserId, email })`, `findByProviderUser(provider, providerUserId)`, `listForUser(userId)`, `deleteForUser(userId, provider) → boolean`, `countForUser(userId)`; `UserRow.password_hash: string | null`; `users.create({ email, passwordHash: string | null, name, emailVerifiedAt?: string })`; `TokenPurpose` gains `"magic_link"`; `tokens.create({ …, email? })`; `tokens.consume → { userId: number | null; email: string | null } | undefined`; `MAGIC_TTL_MS`.

- [ ] **Step 1: Failing tests**

`apps/api/src/queries/queries.test.ts` (use the file's `fresh()`/db idiom):
```ts
describe("identities", () => {
  test("create, find by provider user, list, count, delete", async () => {
    const user = await db.users.create({ email: "i1@example.com", passwordHash: null, name: "" })
    await db.identities.create({ userId: user.id, provider: "google", providerUserId: "g-1", email: "i1@example.com" })
    expect(await db.identities.findByProviderUser("google", "g-1")).toMatchObject({ user_id: user.id })
    expect(await db.identities.findByProviderUser("github", "g-1")).toBeUndefined()
    expect((await db.identities.listForUser(user.id)).map((i) => i.provider)).toEqual(["google"])
    expect(await db.identities.countForUser(user.id)).toBe(1)
    expect(await db.identities.deleteForUser(user.id, "google")).toBe(true)
    expect(await db.identities.deleteForUser(user.id, "google")).toBe(false)
  })

  test("the same provider user cannot be claimed twice", async () => {
    const a = await db.users.create({ email: "i2@example.com", passwordHash: null, name: "" })
    const b = await db.users.create({ email: "i3@example.com", passwordHash: null, name: "" })
    await db.identities.create({ userId: a.id, provider: "github", providerUserId: "42", email: null })
    await expect(
      db.identities.create({ userId: b.id, provider: "github", providerUserId: "42", email: null })
    ).rejects.toThrow()
  })
})

describe("passwordless users and magic tokens", () => {
  test("a user can be created without a password and verified at once", async () => {
    const user = await db.users.create({ email: "p1@example.com", passwordHash: null, name: "Ada", emailVerifiedAt: "2026-10-01T00:00:00.000Z" })
    expect(user.password_hash).toBeNull()
    expect(user.email_verified_at).toBe("2026-10-01T00:00:00.000Z")
  })

  test("a magic token can carry an email instead of a user", async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    await db.tokens.create({ userId: null, purpose: "magic_link", tokenHash: "m1", expiresAt: future, email: "new@example.com" })
    expect(await db.tokens.consume("m1", "magic_link", new Date().toISOString())).toEqual({ userId: null, email: "new@example.com" })
  })
})
```

`apps/api/src/migrate.test.ts`: a test that applies `0001`–`0004`, inserts a user with a password and a `tokens` row, applies `0005`, and asserts: the user row is intact (`email`, `password_hash`, `email_verified_at`), inserting a user with `password_hash NULL` now succeeds, inserting a duplicate email still fails (unique index survived the SQLite rebuild), `tokens` accepts `purpose = 'magic_link'` and has an `email` column, and `identities` exists with the unique pair.

- [ ] **Step 2: Run to verify they fail** — `bun test apps/api/src/queries apps/api/src/migrate.test.ts` → FAIL.

- [ ] **Step 3: Migration**

`apps/api/src/migrations/0005_identities.ts`:
```ts
import { ddl, type Dialect } from "../dialect"
import type { Migration } from "../migrate"

// Accounts can now exist without a password (social / magic-link sign-in), one-time tokens gain
// the `magic_link` purpose and may carry an email before a user exists, and `identities` maps a
// provider's user id to ours. SQLite cannot alter constraints, so its tables are rebuilt.
const identities: Migration = {
  name: "0005_identities",
  async up(sql, dialect: Dialect) {
    if (dialect === "postgres") {
      await sql.unsafe("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
      await sql.unsafe("ALTER TABLE tokens DROP CONSTRAINT tokens_purpose_check")
      await sql.unsafe(
        "ALTER TABLE tokens ADD CONSTRAINT tokens_purpose_check CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link'))"
      )
      await sql.unsafe("ALTER TABLE tokens ALTER COLUMN user_id DROP NOT NULL")
      await sql.unsafe("ALTER TABLE tokens ADD COLUMN email TEXT")
    } else {
      await sql.unsafe(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          email_verified_at TEXT
        )
      `)
      await sql.unsafe(`
        INSERT INTO users_new (id, email, password_hash, name, created_at, updated_at, email_verified_at)
        SELECT id, email, password_hash, name, created_at, updated_at, email_verified_at FROM users
      `)
      await sql.unsafe("DROP TABLE users")
      await sql.unsafe("ALTER TABLE users_new RENAME TO users")
      await sql.unsafe(`
        CREATE TABLE tokens_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link')),
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL,
          email TEXT
        )
      `)
      await sql.unsafe(`
        INSERT INTO tokens_new (id, user_id, purpose, token_hash, expires_at, consumed_at, created_at)
        SELECT id, user_id, purpose, token_hash, expires_at, consumed_at, created_at FROM tokens
      `)
      await sql.unsafe("DROP TABLE tokens")
      await sql.unsafe("ALTER TABLE tokens_new RENAME TO tokens")
      await sql.unsafe("CREATE INDEX tokens_user_purpose ON tokens (user_id, purpose)")
    }
    await sql.unsafe(`
      CREATE TABLE identities (
        id ${ddl.serialId(dialect)},
        user_id INTEGER NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('google', 'github', 'apple')),
        provider_user_id TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (provider, provider_user_id)
      )
    `)
    await sql.unsafe("CREATE INDEX identities_user_id ON identities (user_id)")
  },
}

export default identities
```
Check `0002_auth` / `dialect.ts` for how the SQLite serial id is spelled (`ddl.serialId("sqlite")`) and use that expression instead of the literal if it differs. Postgres: the CHECK constraint name `tokens_purpose_check` is Postgres's default for an inline CHECK on column `purpose` — verify with `SELECT conname FROM pg_constraint WHERE conrelid = 'tokens'::regclass` in the Postgres test run; if the name differs, look it up dynamically in the migration (`SELECT conname … WHERE contype = 'c'`) and drop that. Register in `migrations/index.ts`.

- [ ] **Step 4: Queries**

`apps/api/src/queries/identities.ts`:
```ts
import type { SQL } from "bun"

export type ProviderId = "google" | "github" | "apple"
export type IdentityRow = {
  id: number
  user_id: number
  provider: ProviderId
  provider_user_id: string
  email: string | null
  created_at: string
}

export function identitiesQueries(sql: SQL) {
  return {
    async create(input: { userId: number; provider: ProviderId; providerUserId: string; email: string | null }): Promise<void> {
      await sql`
        INSERT INTO identities (user_id, provider, provider_user_id, email, created_at)
        VALUES (${input.userId}, ${input.provider}, ${input.providerUserId}, ${input.email}, ${new Date().toISOString()})
      `
    },
    async findByProviderUser(provider: ProviderId, providerUserId: string): Promise<IdentityRow | undefined> {
      const [row]: IdentityRow[] = await sql`
        SELECT * FROM identities WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
      `
      return row
    },
    async listForUser(userId: number): Promise<IdentityRow[]> {
      return sql`SELECT * FROM identities WHERE user_id = ${userId} ORDER BY created_at, id`
    },
    async countForUser(userId: number): Promise<number> {
      const [row]: Array<{ n: number | string }> = await sql`SELECT COUNT(*) AS n FROM identities WHERE user_id = ${userId}`
      return Number(row?.n ?? 0)
    },
    /** True when a row was removed. */
    async deleteForUser(userId: number, provider: ProviderId): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        DELETE FROM identities WHERE user_id = ${userId} AND provider = ${provider} RETURNING id
      `
      return rows.length > 0
    },
  }
}
```
`users.ts`: `password_hash: string | null`; `create(input: { email; passwordHash: string | null; name; emailVerifiedAt?: string })` inserts `email_verified_at` (`${input.emailVerifiedAt ?? null}`). `tokens.ts`: `TokenPurpose` += `"magic_link"`; `create` input `userId: number | null`, `email?: string | null` (insert `${input.email ?? null}`); `consume` returns `{ userId: row.user_id, email: row.email }` with `RETURNING user_id, email`; `invalidateForUser` unchanged. `db.ts`: `identities: identitiesQueries(sql)`. `credentials.ts`: `export const MAGIC_TTL_MS = 15 * 60_000`.

`router.ts`: `changePassword` → `verifyPassword(input.currentPassword, context.user.password_hash ?? (await DUMMY_HASH))` (a passwordless account can never match → `FORBIDDEN`). `tokens.consume` now returns `userId: number | null`; the existing `resetPassword` and `verifyEmail` handlers add `if (!consumed.userId) throw errors.BAD_REQUEST()` right after the consume (reset and verify rows always carry a user; the guard keeps the types honest). `signIn` already uses `user?.password_hash ?? (await DUMMY_HASH)` — confirm it compiles with the nullable type. `requireSession`/`toUser` unchanged for now (`hasPassword` is Task 3).

- [ ] **Step 5: Run on both engines** — `bun test apps/api && bun --filter @repo/api test:postgres && bun run --filter @repo/api typecheck` → green.

- [ ] **Step 6: Commit**
```bash
bunx biome check --write apps/api
git add apps/api
git commit -m "feat(api): identities table, passwordless users and magic_link tokens (migration 0005)"
```

---

### Task 2: Provider adapters on Arctic and their env

**Files:**
- Create: `apps/api/src/oauth/provider.ts`, `google.ts`, `github.ts`, `apple.ts`, `providers.ts`, `oauth.test.ts`
- Modify: root `package.json` (catalog `arctic`), `apps/api/package.json`, `apps/api/src/env.ts`, `env.test.ts`, `apps/api/.env.example`

**Interfaces:**
- Produces:
```ts
export type Profile = { providerUserId: string; email: string | null; emailVerified: boolean; name: string | null }
export type AppleUser = { name?: { firstName?: string; lastName?: string } }
export type Provider = {
  id: ProviderId
  pkce: boolean
  start(state: string, codeVerifier?: string): URL
  exchange(input: { code: string; codeVerifier?: string; appleUser?: AppleUser }): Promise<Profile>
}
export class ProviderExchangeError extends Error { kind: "invalid_code" | "unreachable" }
export function createProviders(env: OAuthEnv, redirectBase: string, fetchImpl?: typeof fetch): Map<ProviderId, Provider>
```
and `Env` fields `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`, `OAUTH_APPLE_CLIENT_ID`, `OAUTH_APPLE_TEAM_ID`, `OAUTH_APPLE_KEY_ID`, `OAUTH_APPLE_PRIVATE_KEY` (all `string | undefined`).

- [ ] **Step 1: Dependency** — root catalog `"arctic": "^3.7.0"`; `apps/api` dependencies `"arctic": "catalog:"`; `bun install`.

- [ ] **Step 2: Failing tests**

`apps/api/src/oauth/oauth.test.ts` — build id tokens with a helper `jwt(payload)` = `base64url(header).base64url(payload).sig` (no signature check: Arctic's `decodeIdToken` only decodes):
```ts
import { describe, expect, test } from "bun:test"
import { createProviders } from "./providers"

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = (payload: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(payload)}.sig`
const env = {
  OAUTH_GOOGLE_CLIENT_ID: "g", OAUTH_GOOGLE_CLIENT_SECRET: "gs",
  OAUTH_GITHUB_CLIENT_ID: "h", OAUTH_GITHUB_CLIENT_SECRET: "hs",
  OAUTH_APPLE_CLIENT_ID: "a", OAUTH_APPLE_TEAM_ID: "team", OAUTH_APPLE_KEY_ID: "key",
  OAUTH_APPLE_PRIVATE_KEY: TEST_P8, // a throwaway ES256 PKCS#8 PEM generated in the test with crypto.subtle (exported as pkcs8) — see Step 4
}
const fakeFetch = (routes: Record<string, (init?: RequestInit) => Response>) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const key = String(url)
    const handler = Object.entries(routes).find(([k]) => key.startsWith(k))?.[1]
    if (!handler) throw new Error(`unexpected fetch ${key}`)
    return handler(init)
  }) as typeof fetch

describe("createProviders", () => {
  test("only configured providers exist, in fixed order", () => {
    const p = createProviders({ OAUTH_GITHUB_CLIENT_ID: "h", OAUTH_GITHUB_CLIENT_SECRET: "hs" }, "http://auth.example.com")
    expect([...p.keys()]).toEqual(["github"])
    expect([...createProviders(env, "http://auth.example.com").keys()]).toEqual(["google", "github", "apple"])
  })
})

describe("google", () => {
  test("start uses PKCE and the right redirect; exchange reads the id token", async () => {
    const fetch = fakeFetch({ "https://oauth2.googleapis.com/token": () => Response.json({ access_token: "at", token_type: "Bearer", id_token: jwt({ sub: "g-1", email: "ada@example.com", email_verified: true, name: "Ada" }) }) })
    const google = createProviders(env, "http://auth.example.com", fetch).get("google")!
    const url = google.start("st", "verifier")
    expect(url.searchParams.get("redirect_uri")).toBe("http://auth.example.com/oauth/google/callback")
    expect(url.searchParams.get("code_challenge")).toBeTruthy()
    expect(google.pkce).toBe(true)
    expect(await google.exchange({ code: "c", codeVerifier: "verifier" })).toEqual({ providerUserId: "g-1", email: "ada@example.com", emailVerified: true, name: "Ada" })
  })
})

describe("github", () => {
  test("picks the primary verified email and reports unverified when there is none", async () => {
    const emails = [{ email: "x@example.com", primary: false, verified: true }, { email: "ada@example.com", primary: true, verified: true }]
    const fetch = fakeFetch({
      "https://github.com/login/oauth/access_token": () => Response.json({ access_token: "at", token_type: "bearer" }),
      "https://api.github.com/user/emails": () => Response.json(emails),
      "https://api.github.com/user": () => Response.json({ id: 42, name: "Ada", login: "ada" }),
    })
    const github = createProviders(env, "http://auth.example.com", fetch).get("github")!
    expect(github.pkce).toBe(false)
    expect(await github.exchange({ code: "c" })).toEqual({ providerUserId: "42", email: "ada@example.com", emailVerified: true, name: "Ada" })
    emails[1] = { email: "ada@example.com", primary: true, verified: false }
    expect(await github.exchange({ code: "c" })).toMatchObject({ email: null, emailVerified: false })
  })
})

describe("apple", () => {
  test("form_post, string email_verified, name from the first-consent body", async () => {
    const fetch = fakeFetch({ "https://appleid.apple.com/auth/token": () => Response.json({ access_token: "at", token_type: "Bearer", id_token: jwt({ sub: "001.abc", email: "r@privaterelay.appleid.com", email_verified: "true" }) }) })
    const apple = createProviders(env, "http://auth.example.com", fetch).get("apple")!
    const url = apple.start("st")
    expect(url.searchParams.get("response_mode")).toBe("form_post")
    expect(apple.pkce).toBe(false)
    expect(await apple.exchange({ code: "c", appleUser: { name: { firstName: "Ada", lastName: "L" } } })).toEqual({ providerUserId: "001.abc", email: "r@privaterelay.appleid.com", emailVerified: true, name: "Ada L" })
    expect((await apple.exchange({ code: "c" })).name).toBeNull()
  })
})

describe("errors", () => {
  test("a rejected code is invalid_code; a network failure is unreachable", async () => {
    const bad = fakeFetch({ "https://github.com/login/oauth/access_token": () => Response.json({ error: "bad_verification_code" }, { status: 400 }) })
    const github = createProviders(env, "http://auth.example.com", bad).get("github")!
    await expect(github.exchange({ code: "c" })).rejects.toMatchObject({ kind: "invalid_code" })
    const down = (async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch
    const github2 = createProviders(env, "http://auth.example.com", down).get("github")!
    await expect(github2.exchange({ code: "c" })).rejects.toMatchObject({ kind: "unreachable" })
  })
})
```
`env.test.ts`: partial provider config throws naming the missing key (`OAUTH_GOOGLE_CLIENT_ID` without the secret → `/OAUTH_GOOGLE_CLIENT_SECRET/`); Apple with an unparseable key → `/OAUTH_APPLE_PRIVATE_KEY/`; `\n`-escaped PEM is accepted; no config → all undefined, no throw.

- [ ] **Step 3: Run to verify they fail** — `bun test apps/api/src/oauth apps/api/src/env.test.ts` → FAIL.

- [ ] **Step 4: Adapters**

`provider.ts`: the types above plus
```ts
export class ProviderExchangeError extends Error {
  constructor(public kind: "invalid_code" | "unreachable", provider: ProviderId) {
    super(`${provider} exchange failed: ${kind}`)
    this.name = "ProviderExchangeError"
  }
}
/** PEM (PKCS#8) → DER bytes, as Arctic's Apple client wants it. Accepts `\n`-escaped single-line PEM. */
export function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "")
  if (!body) throw new Error("not a PKCS#8 PEM")
  return new Uint8Array(Buffer.from(body, "base64"))
}
export const mapArcticError = (provider: ProviderId, error: unknown): ProviderExchangeError =>
  error instanceof arctic.OAuth2RequestError
    ? new ProviderExchangeError("invalid_code", provider)
    : new ProviderExchangeError("unreachable", provider)
```
(Arctic's `ArcticFetchError` and anything else → `unreachable`.)

Fetch injection: Arctic 3 calls the global `fetch` for the token endpoint and offers no injection point, so the token-exchange tests stub `globalThis.fetch` for the duration of one call with a helper in the test file:
```ts
async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch
  globalThis.fetch = impl
  try { return await fn() } finally { globalThis.fetch = real }
}
```
Wrap every `exchange(...)` call in the tests above as `withFetch(fetch, () => provider.exchange(...))`. `createProviders`' third parameter `fetchImpl` is used only for GitHub's `api.github.com` profile calls (so those are injectable without the stub); the GitHub test stubs the token endpoint with `withFetch` and passes the same fake as `fetchImpl` for the profile calls.

`google.ts`:
```ts
import * as arctic from "arctic"
import type { Provider } from "./provider"
import { mapArcticError } from "./provider"

export function googleProvider(clientId: string, clientSecret: string, redirect: string): Provider {
  const google = new arctic.Google(clientId, clientSecret, redirect)
  return {
    id: "google",
    pkce: true,
    start: (state, codeVerifier) => google.createAuthorizationURL(state, codeVerifier ?? "", ["openid", "email", "profile"]),
    async exchange({ code, codeVerifier }) {
      let tokens: arctic.OAuth2Tokens
      try {
        tokens = await google.validateAuthorizationCode(code, codeVerifier ?? "")
      } catch (error) {
        throw mapArcticError("google", error)
      }
      const claims = arctic.decodeIdToken(tokens.idToken()) as { sub: string; email?: string; email_verified?: boolean; name?: string }
      return { providerUserId: claims.sub, email: claims.email ?? null, emailVerified: claims.email_verified === true, name: claims.name ?? null }
    },
  }
}
```
`github.ts`: `new arctic.GitHub(id, secret, redirect)`, scopes `["read:user", "user:email"]`, after `validateAuthorizationCode(code)` call `fetchImpl("https://api.github.com/user", { headers: { authorization: \`Bearer ${tokens.accessToken()}\`, "user-agent": "boilerplate-bun" } })` and `/user/emails`; `providerUserId = String(user.id)`, `name = user.name ?? user.login ?? null`, email = the entry with `primary && verified` → `{ email, emailVerified: true }` else `{ email: null, emailVerified: false }`; a non-2xx profile response → `ProviderExchangeError("unreachable")`.
`apple.ts`: `new arctic.Apple(clientId, teamId, keyId, pemToPkcs8(privateKey), redirect)`; `start` → `createAuthorizationURL(state, ["name", "email"])` then `url.searchParams.set("response_mode", "form_post")`; `exchange` → `validateAuthorizationCode(code)`, claims `{ sub, email?, email_verified?: boolean | string }`, `emailVerified: claims.email_verified === true || claims.email_verified === "true"`, `name` = `[appleUser?.name?.firstName, appleUser?.name?.lastName].filter(Boolean).join(" ") || null`.
`providers.ts`: `createProviders(env, redirectBase, fetchImpl = globalThis.fetch)` builds the map in order google, github, apple from the env fields that are fully present; redirect = `${redirectBase}/oauth/${id}/callback`.

- [ ] **Step 5: Env**

`env.ts`: eight `optionalString` fields; in `loadEnv`, a helper `requireGroup(name, keys)` that throws `\`${missing} is not set (needed with ${present})\`` when some but not all keys of a provider group are present; for Apple additionally `pemToPkcs8(key)` inside try/catch → `Error("OAUTH_APPLE_PRIVATE_KEY is not a PKCS#8 PEM")`. `.env.example` (api): the eight vars with one comment per provider naming the console and the redirect URI `${AUTH_URL}/oauth/<provider>/callback`.

- [ ] **Step 6: Run** — `bun test apps/api/src/oauth apps/api/src/env.test.ts && bun run --filter @repo/api typecheck` → green.

- [ ] **Step 7: Commit**
```bash
bunx biome check --write apps/api package.json
git add apps/api package.json bun.lock
git commit -m "feat(api): Google, GitHub and Apple provider adapters on Arctic, configured by env"
```

---

### Task 3: OAuth procedures, identities, set-password, `hasPassword`

**Files:**
- Modify: `packages/api-contract/src/auth.ts`, `packages/api-contract/src/index.ts`, `apps/api/src/router.ts`, `apps/api/src/server.ts` (`providers` option + `Context.providers`, `Context.sessionUser` lookup for the callback), `apps/api/src/test-server.ts` (`start({ providers })` with a `fakeProvider()` helper), `apps/api/src/auth.test.ts` (new describe), `packages/session/src/client.test.ts` + `apps/auth`/`apps/account` `actions.test.ts` fixtures (`hasPassword`)

**Interfaces:**
- Produces: `ProviderIdSchema`; `User.hasPassword: boolean`; `auth.providers() → { providers: ProviderId[] }`; `auth.oauth.start({ provider }) → { url: string; state: string; codeVerifier?: string }` (`NOT_FOUND`); `auth.oauth.callback({ provider, code, codeVerifier?, appleUser?, client }) → AuthResult` (`BAD_REQUEST`, `BAD_GATEWAY`, `FORBIDDEN`, `CONFLICT`, `NOT_FOUND`), reads `x-session-token` if present; `account.identities.list() → { items: { provider, email: string | null, createdAt }[] }`; `account.identities.disconnect({ provider }) → void` (`NOT_FOUND`, `FORBIDDEN`); `account.setPassword({ password }) → void` (`CONFLICT`); `ServerOptions.providers?: Map<ProviderId, Provider>`; test helper `fakeProvider(id, profile | (input) => Profile)`.

- [ ] **Step 1: Failing tests** (`auth.test.ts`, with `start({ providers: new Map([["google", fakeProvider("google", …)]]) })` per describe or per test where the profile varies):
```ts
describe("oauth", () => {
  const verified = { providerUserId: "g-1", email: "ada@example.com", emailVerified: true, name: "Ada" }

  test("providers() lists the configured ones; start gives a URL, state and verifier", async () => {
    const own = await start({ providers: providersWith(["google", "github"]) })
    try {
      expect(await clientFor(own).auth.providers()).toEqual({ providers: ["google", "github"] })
      const s = await clientFor(own).auth.oauth.start({ provider: "google" })
      expect(s.url).toContain("code_challenge")
      expect(s.state).toHaveLength(32) // arctic.generateState() → 32 chars? assert non-empty if the length differs
      expect(s.codeVerifier).toBeTruthy()
      const [missing] = await safe(clientFor(own).auth.oauth.start({ provider: "apple" }))
      expect(missing).toMatchObject({ code: "NOT_FOUND" })
    } finally { await own.stop() }
  })

  test("a verified unknown email creates a passwordless, verified account", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      const { user, session } = await clientFor(own).auth.oauth.callback({ provider: "google", code: "c", codeVerifier: "v" })
      expect(user).toMatchObject({ email: "ada@example.com", name: "Ada", emailVerified: true, hasPassword: false })
      expect((await clientFor(own, session.token).auth.me()).user.id).toBe(user.id)
      // Password sign-in on it fails like a wrong password.
      const [err] = await safe(clientFor(own).auth.signIn({ email: "ada@example.com", password: "whatever-12345" }))
      expect(err).toMatchObject({ code: "UNAUTHORIZED" })
    } finally { await own.stop() }
  })

  test("a verified email links to the existing account and marks it verified", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      const { user: existing } = await signUp(own, "ada@example.com")
      const { user } = await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      expect(user.id).toBe(existing.id)
      expect(user.emailVerified).toBe(true)
      expect(user.hasPassword).toBe(true)
    } finally { await own.stop() }
  })

  test("a known identity wins even after the provider email changed", async () => {
    const profile = { ...verified }
    const own = await start({ providers: providersWith({ google: () => profile }) })
    try {
      const first = await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      profile.email = "new@example.com"
      const second = await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      expect(second.user.id).toBe(first.user.id)
      expect(second.user.email).toBe("ada@example.com")
    } finally { await own.stop() }
  })

  test("an unverified or missing email is FORBIDDEN and creates nothing", async () => {
    const own = await start({ providers: providersWith({ github: { providerUserId: "42", email: null, emailVerified: false, name: "x" } }) })
    try {
      const [err] = await safe(clientFor(own).auth.oauth.callback({ provider: "github", code: "c" }))
      expect(err).toMatchObject({ code: "FORBIDDEN" })
      const [again] = await safe(clientFor(own).auth.signIn({ email: "x@example.com", password: "12345678" }))
      expect(again).toMatchObject({ code: "UNAUTHORIZED" }) // still no account
    } finally { await own.stop() }
  })

  test("connecting while signed in links an unclaimed identity (any email) and is idempotent", async () => {
    const own = await start({ providers: providersWith({ github: { providerUserId: "7", email: "work@example.com", emailVerified: true, name: null } }) })
    try {
      const me = await signUp(own)
      const linked = await me.client.auth.oauth.callback({ provider: "github", code: "c" })
      expect(linked.user.id).toBe(me.user.id)
      const again = await me.client.auth.oauth.callback({ provider: "github", code: "c" })
      expect(again.user.id).toBe(me.user.id)
      expect((await me.client.account.identities.list()).items).toEqual([expect.objectContaining({ provider: "github", email: "work@example.com" })])
    } finally { await own.stop() }
  })

  test("an identity claimed by another account is CONFLICT when connecting", async () => {
    const own = await start({ providers: providersWith({ github: { providerUserId: "7", email: "a@example.com", emailVerified: true, name: null } }) })
    try {
      await signUp(own, "a@example.com") // owner; the callback below links to this account
      await clientFor(own).auth.oauth.callback({ provider: "github", code: "c" })
      const other = await signUp(own, "b@example.com")
      const [err] = await safe(other.client.auth.oauth.callback({ provider: "github", code: "c" }))
      expect(err).toMatchObject({ code: "CONFLICT" })
    } finally { await own.stop() }
  })

  test("disconnect refuses the last way in; setPassword then allows it", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      const { session } = await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      const c = clientFor(own, session.token)
      const [last] = await safe(c.account.identities.disconnect({ provider: "google" }))
      expect(last).toMatchObject({ code: "FORBIDDEN" })
      await c.account.setPassword({ password: "correct horse battery" })
      expect((await c.auth.me()).user.hasPassword).toBe(true)
      const [twice] = await safe(c.account.setPassword({ password: "another horse battery" }))
      expect(twice).toMatchObject({ code: "CONFLICT" })
      await c.account.identities.disconnect({ provider: "google" })
      expect((await c.account.identities.list()).items).toEqual([])
      const [none] = await safe(c.account.identities.disconnect({ provider: "google" }))
      expect(none).toMatchObject({ code: "NOT_FOUND" })
      expect((await mailsTo(own.mailer, "ada@example.com", passwordChangedSubject)).length).toBe(1)
    } finally { await own.stop() }
  })

  test("provider failures map to BAD_REQUEST / BAD_GATEWAY", async () => {
    const own = await start({ providers: new Map([
      ["google", fakeProvider("google", () => { throw new ProviderExchangeError("invalid_code", "google") })],
      ["github", fakeProvider("github", () => { throw new ProviderExchangeError("unreachable", "github") })],
    ]) })
    try {
      expect((await safe(clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })))[0]).toMatchObject({ code: "BAD_REQUEST" })
      expect((await safe(clientFor(own).auth.oauth.callback({ provider: "github", code: "c" })))[0]).toMatchObject({ code: "BAD_GATEWAY" })
    } finally { await own.stop() }
  })
})
```
`test-server.ts`: `fakeProvider(id, profile)` → `{ id, pkce: id === "google", start: (state) => new URL(\`https://provider.example/${id}?state=${state}\`), exchange: async (input) => typeof profile === "function" ? profile(input) : profile }`; `providersWith(ids | record)` builds the map (ids → a default verified profile per id).

- [ ] **Step 2: Run to verify they fail** — FAIL (procedures missing).

- [ ] **Step 3: Contract**

`auth.ts`: `UserSchema` += `hasPassword: z.boolean()`; `ProviderIdSchema = z.enum(["google","github","apple"])`; `OAuthStartSchema = z.object({ provider: ProviderIdSchema })`; `OAuthStartResultSchema = z.object({ url: z.string().url(), state: z.string(), codeVerifier: z.string().optional() })`; `OAuthCallbackSchema = z.object({ provider: ProviderIdSchema, code: z.string().min(1).max(2048), codeVerifier: z.string().max(256).optional(), appleUser: z.object({ name: z.object({ firstName: z.string().max(100).optional(), lastName: z.string().max(100).optional() }).optional() }).optional(), client: ClientInfoSchema })`; `ProvidersSchema = z.object({ providers: z.array(ProviderIdSchema) })`; `IdentitySchema = z.object({ provider: ProviderIdSchema, email: z.string().nullable(), createdAt: z.iso.datetime() })`; `IdentityListSchema`; `DisconnectIdentitySchema = z.object({ provider: ProviderIdSchema })`; `SetPasswordSchema = z.object({ password: PasswordSchema })`.
`index.ts`: `auth.providers` (GET `/auth/providers`), `auth.oauth.start` (POST `/auth/oauth/start`, errors `NOT_FOUND`), `auth.oauth.callback` (POST `/auth/oauth/callback`, errors `BAD_REQUEST` "Sign-in failed, try again", `BAD_GATEWAY` "The provider is not responding", `FORBIDDEN` "That account's email is not verified — sign in with your email first, then connect it in your account", `CONFLICT` "That account is already connected to another user", `NOT_FOUND`), `account.identities.list` (GET `/account/identities`), `account.identities.disconnect` (DELETE `/account/identities/{provider}`, errors `AUTH_ERRORS`, `NOT_FOUND`, `FORBIDDEN` "This is your only way to sign in — set a password first"), `account.setPassword` (POST `/account/password/set`, errors `AUTH_ERRORS`, `CONFLICT` "You already have a password — change it instead").

- [ ] **Step 4: Server + router**

`server.ts`: `ServerOptions.providers?: Map<ProviderId, Provider>`; default `createProviders(envFields, options.authUrl)` is wired in `index.ts` (pass `providers: createProviders(env, env.AUTH_URL)`), `createServer` defaults to an empty map; `Context.providers`. `router.ts`:
```ts
/** The session user when the caller forwarded a live token, else null (never throws). */
async function optionalSessionUser(context: Context): Promise<UserRow | null> {
  const token = context.sessionToken
  const session = token ? await context.db.sessions.findByToken(tokenHash(token)) : undefined
  return session ? ((await context.db.users.find(session.user_id)) ?? null) : null
}

const toUser = (row: UserRow): User => ({ …, hasPassword: row.password_hash !== null })

    providers: api.auth.providers.handler(({ context }) => ({ providers: [...context.providers.keys()] })),
    oauth: {
      start: api.auth.oauth.start.handler(({ input, context, errors }) => {
        const provider = context.providers.get(input.provider)
        if (!provider) throw errors.NOT_FOUND()
        const state = arctic.generateState()
        const codeVerifier = provider.pkce ? arctic.generateCodeVerifier() : undefined
        return { url: provider.start(state, codeVerifier).href, state, codeVerifier }
      }),
      callback: api.auth.oauth.callback.handler(async ({ input, context, errors }) => {
        const provider = context.providers.get(input.provider)
        if (!provider) throw errors.NOT_FOUND()
        let profile: Profile
        try {
          profile = await provider.exchange(input)
        } catch (error) {
          if (error instanceof ProviderExchangeError && error.kind === "invalid_code") throw errors.BAD_REQUEST()
          context.log(`${input.provider} exchange failed`, error)
          throw errors.BAD_GATEWAY()
        }
        const now = new Date().toISOString()
        const sessionUser = await optionalSessionUser(context)
        const known = await context.db.identities.findByProviderUser(provider.id, profile.providerUserId)
        let user: UserRow | undefined
        if (known) {
          if (sessionUser && sessionUser.id !== known.user_id) throw errors.CONFLICT()
          user = await context.db.users.find(known.user_id)
        } else if (sessionUser) {
          await context.db.identities.create({ userId: sessionUser.id, provider: provider.id, providerUserId: profile.providerUserId, email: profile.email })
          user = sessionUser
        } else if (profile.emailVerified && profile.email) {
          const existing = await context.db.users.findByEmail(profile.email)
          if (existing) {
            if (!existing.email_verified_at) await context.db.users.markEmailVerified(existing.id, now)
            user = (await context.db.users.find(existing.id)) ?? existing
          } else {
            user = await context.db.users.create({ email: profile.email, passwordHash: null, name: profile.name ?? "", emailVerifiedAt: now })
          }
          await context.db.identities.create({ userId: user.id, provider: provider.id, providerUserId: profile.providerUserId, email: profile.email })
        } else {
          throw errors.FORBIDDEN()
        }
        if (!user) throw errors.BAD_REQUEST()
        return issueSession(context.db, user, input.client)
      }),
    },
```
`identities.create` for a *new* user may race with a concurrent callback for the same provider user: catch the unique violation and re-read `findByProviderUser` (same pattern as `EmailTakenError`). `account.identities.list` maps rows; `disconnect`: `if (!context.user.password_hash && (await context.db.identities.countForUser(context.user.id)) <= 1) throw errors.FORBIDDEN()`, then `deleteForUser` → `NOT_FOUND` when false; `setPassword`: `if (context.user.password_hash) throw errors.CONFLICT()`, `users.update({ passwordHash: await hashPassword(input.password) })`, `tokens.invalidateForUser(id, "password_reset", now)`, `sendPasswordChanged(context, { ...context.user, password_hash: "set" })` (or re-read the user).

Update fixtures that build a `User` (`packages/session/src/client.test.ts`, `apps/auth/src/lib/actions.test.ts`, `apps/account/src/lib/actions.test.ts`) with `hasPassword: true`.

- [ ] **Step 5: Run on both engines** — `bun test apps/api packages/api-contract packages/session apps/auth apps/account && bun --filter @repo/api test:postgres && bun run typecheck` → green.

- [ ] **Step 6: Commit**
```bash
bunx biome check --write apps/api packages/api-contract packages/session apps/auth apps/account
git add apps/api packages/api-contract packages/session apps/auth apps/account
git commit -m "feat(api): oauth start/callback with verified-email linking, identities, setPassword, hasPassword"
```

---

### Task 4: Magic link — template, procedures

**Files:**
- Create: `packages/email/src/templates/magic-link.tsx`, `apps/story/stories/email/MagicLink.stories.tsx`
- Modify: `packages/email/src/index.tsx` (+ test), `packages/api-contract/src/{auth,index}.ts`, `apps/api/src/router.ts`, `server.ts` (`magicLimiter`), `apps/api/src/auth.test.ts`

**Interfaces:**
- Produces: `emails.magicLink({ link, brand? })`, `magicLinkSubject = "Your sign-in link"`; `auth.magicLink.request({ email }) → void`; `auth.magicLink.consume({ token, client }) → AuthResult` (`BAD_REQUEST`); `ServerOptions.magicLimiter?`.

- [ ] **Step 1: Failing tests**

`packages/email/src/index.test.tsx`: `magicLink` renders subject "Your sign-in link", the link in html and text, "15 minutes", no tags in text.
`apps/api/src/auth.test.ts`:
```ts
describe("magic link", () => {
  const tokenOf = (text: string) => text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""

  test("an existing user gets a link that signs them in once", async () => {
    const { email, user } = await signUp(app)
    await clientFor(app).auth.magicLink.request({ email })
    const [mail] = await mailsTo(app.mailer, email, magicLinkSubject)
    const token = tokenOf(mail.text)
    const { user: signedIn, session } = await clientFor(app).auth.magicLink.consume({ token })
    expect(signedIn.id).toBe(user.id)
    expect(signedIn.emailVerified).toBe(true)
    expect((await clientFor(app, session.token).auth.me()).user.id).toBe(user.id)
    const [again] = await safe(clientFor(app).auth.magicLink.consume({ token }))
    expect(again).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("an unknown email gets a link too; consuming creates a passwordless verified account", async () => {
    await clientFor(app).auth.magicLink.request({ email: "fresh@example.com" })
    const [mail] = await mailsTo(app.mailer, "fresh@example.com", magicLinkSubject)
    const { user } = await clientFor(app).auth.magicLink.consume({ token: tokenOf(mail.text) })
    expect(user).toMatchObject({ email: "fresh@example.com", emailVerified: true, hasPassword: false })
  })

  test("if the address signs up with a password before clicking, the link signs that account in", async () => {
    await clientFor(app).auth.magicLink.request({ email: "late@example.com" })
    const [mail] = await mailsTo(app.mailer, "late@example.com", magicLinkSubject)
    const { user: viaPassword } = await signUp(app, "late@example.com")
    const { user } = await clientFor(app).auth.magicLink.consume({ token: tokenOf(mail.text) })
    expect(user.id).toBe(viaPassword.id)
    expect(user.hasPassword).toBe(true)
  })

  test("a newer link burns the older one; the limiter is silent", async () => {
    const own = await start({ magicLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }) })
    try {
      const { email } = await signUp(own)
      await clientFor(own).auth.magicLink.request({ email })
      await clientFor(own).auth.magicLink.request({ email })
      const [first, second] = await mailsTo(own.mailer, email, magicLinkSubject, 2)
      await clientFor(own).auth.magicLink.request({ email }) // over the limit: void, no third mail
      await Bun.sleep(50)
      expect((await mailsTo(own.mailer, email, magicLinkSubject, 2)).length).toBe(2)
      const [old] = await safe(clientFor(own).auth.magicLink.consume({ token: tokenOf(first.text) }))
      expect(old).toMatchObject({ code: "BAD_REQUEST" })
      await clientFor(own).auth.magicLink.consume({ token: tokenOf(second.text) })
    } finally { await own.stop() }
  })

  test("a verify or reset token is not a magic link", async () => {
    const { email } = await signUp(app)
    await clientFor(app).auth.requestPasswordReset({ email })
    const [reset] = await mailsTo(app.mailer, email, resetPasswordSubject)
    const token = reset.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const [err] = await safe(clientFor(app).auth.magicLink.consume({ token }))
    expect(err).toMatchObject({ code: "BAD_REQUEST" })
  })
})
```
Note "burns the older one": for a **known** user `request` invalidates earlier `magic_link` tokens for that user. For an unknown email there is no user id; invalidate by `email` instead — add `tokens.invalidateForEmail(email, "magic_link", at)` to Task 1's queries in this task (one more query + test).

- [ ] **Step 2: Run to verify they fail** — FAIL.

- [ ] **Step 3: Template, contract, handlers**

`magic-link.tsx` (same shape as `verify-email.tsx`): heading "Sign in to {brand}", "Use this link within 15 minutes to sign in. It works once.", button "Sign in", the raw link line, "If you did not request this, ignore this email." Export `magicLinkSubject` from the index.
Contract: `MagicLinkRequestSchema = z.object({ email: EmailSchema })`, `MagicLinkConsumeSchema = z.object({ token: z.string().min(1).max(128), client: ClientInfoSchema })`; `auth.magicLink.request` (POST `/auth/magic-link/request` → void), `auth.magicLink.consume` (POST `/auth/magic-link/consume`, errors `BAD_REQUEST` "This sign-in link is invalid, expired or already used" → `AuthResultSchema`).
Router:
```ts
    magicLink: {
      request: api.auth.magicLink.request.handler(async ({ input, context }) => {
        // Silent like the reset request: the response never says whether the email exists.
        const now = Date.now()
        const at = new Date(now).toISOString()
        const limit = await context.magicLimiter.hit(`magic:${input.email}`)
        if (!limit.allowed) return
        const user = await context.db.users.findByEmail(input.email)
        const token = newToken()
        if (user) await context.db.tokens.invalidateForUser(user.id, "magic_link", at)
        else await context.db.tokens.invalidateForEmail(input.email, "magic_link", at)
        await context.db.tokens.create({ userId: user?.id ?? null, purpose: "magic_link", tokenHash: tokenHash(token), expiresAt: new Date(now + MAGIC_TTL_MS).toISOString(), email: user ? null : input.email })
        const link = `${context.authUrl}/magic?token=${token}`
        const to = user?.email ?? input.email
        detach(async () => {
          const mail = await emails.magicLink({ link })
          await context.mailer.send({ to, ...mail, idempotencyKey: `magic:${tokenHash(token).slice(0, 16)}` })
          context.log(`mail sent magic-link to ${maskEmail(to)}`, undefined)
        }, (error) => context.log("magic-link mail failed", error))
      }),
      consume: api.auth.magicLink.consume.handler(async ({ input, context, errors }) => {
        const at = new Date().toISOString()
        const consumed = await context.db.tokens.consume(tokenHash(input.token), "magic_link", at)
        if (!consumed) throw errors.BAD_REQUEST()
        let user = consumed.userId ? await context.db.users.find(consumed.userId) : undefined
        if (!user && consumed.email) {
          user = await context.db.users.findByEmail(consumed.email)
          if (!user) {
            try {
              user = await context.db.users.create({ email: consumed.email, passwordHash: null, name: "", emailVerifiedAt: at })
            } catch (error) {
              if (!(error instanceof EmailTakenError)) throw error
              user = await context.db.users.findByEmail(consumed.email)
            }
          }
        }
        if (!user) throw errors.BAD_REQUEST()
        if (!user.email_verified_at) await context.db.users.markEmailVerified(user.id, at)
        await context.db.tokens.invalidateForUser(user.id, "magic_link", at)
        const fresh = (await context.db.users.find(user.id)) ?? user
        return issueSession(context.db, fresh, input.client)
      }),
    },
```
`server.ts`: `magicLimiter` default 3 / 15 min; `Context.magicLimiter`. `tokens.invalidateForEmail(email, purpose, at)`: `UPDATE tokens SET consumed_at = … WHERE email = ${normalizeEmail(email)} AND purpose = … AND consumed_at IS NULL` (store the normalised email on create too). Story `Email/MagicLink` like the others.

- [ ] **Step 4: Run** — api on both engines, `bun test packages/email`, the story (`cd apps/story && bunx vitest run --project=storybook stories/email`), typechecks → green.

- [ ] **Step 5: Commit**
```bash
bunx biome check --write apps/api packages/api-contract packages/email apps/story
git add apps/api packages/api-contract packages/email apps/story
git commit -m "feat(api,email): magic-link sign-in — silent request, one-time consume that creates passwordless accounts"
```

---

### Task 5: `apps/auth` — OAuth route handlers and real provider buttons

**Files:**
- Create: `apps/auth/src/app/oauth/[provider]/start/route.ts`, `apps/auth/src/app/oauth/[provider]/callback/route.ts`, `apps/auth/src/lib/oauth.ts`, `apps/auth/src/lib/oauth.test.ts`
- Modify: `apps/auth/src/components/social-buttons.tsx`, `login-form.tsx`, `signup-form.tsx`, `apps/auth/src/views/login-view.tsx`, `signup-view.tsx`, `apps/auth/src/app/login/page.tsx`, `signup/page.tsx`, `apps/auth/README.md`

**Interfaces:**
- Consumes: `auth.providers`, `auth.oauth.start`, `auth.oauth.callback`; `@repo/session` `setSession`, `safeNextUrl`, `anonymousApi`, `api()`, `SESSION_COOKIE`.
- Produces: `OAUTH_COOKIE = "oauth"`; `encodeOauthCookie(v) / decodeOauthCookie(s)`; `oauthStartCore(deps, { provider, next }) → { redirectTo, cookie } | { status: 404 }`; `oauthCallbackCore(deps, { provider, params: { code?, state?, error?, user? }, cookie }) → { redirectTo: string; clearCookie: true; session?: { token, expiresAt } }`; `OAUTH_ERROR_MESSAGES: Record<"state"|"cancelled"|"unverified"|"claimed"|"provider"|"failed", (provider?: string) => string>`.

- [ ] **Step 1: Failing core tests** (`oauth.test.ts`):
```ts
const cookie = encodeOauthCookie({ provider: "google", state: "st", codeVerifier: "v", next: "http://app.brand.localhost:3001/notes" })
const deps = (overrides = {}) => ({
  providers: ["google", "github"],
  start: async () => ({ url: "https://accounts.google.com/o/oauth2/v2/auth?x=1", state: "st", codeVerifier: "v" }),
  callback: async () => ({ user: { id: 1 }, session: { token: "t", expiresAt: "2026-11-01T00:00:00.000Z" } }),
  safeNextUrl: (c: string | null | undefined) => c ?? "http://app.brand.localhost:3001",
  ...overrides,
})

test("start: unknown provider is 404; known one redirects and sets the cookie", async () => {
  expect(await oauthStartCore(deps() as never, { provider: "apple", next: undefined })).toEqual({ status: 404 })
  const out = await oauthStartCore(deps() as never, { provider: "google", next: "http://app.brand.localhost:3001/notes" })
  expect(out).toMatchObject({ redirectTo: expect.stringContaining("accounts.google.com") })
  expect(decodeOauthCookie((out as { cookie: string }).cookie)).toMatchObject({ provider: "google", state: "st", codeVerifier: "v" })
})

test("callback: missing cookie, state mismatch and provider mismatch never reach the api", async () => {
  let calls = 0
  const d = deps({ callback: async () => { calls++; throw new Error("no") } })
  expect((await oauthCallbackCore(d as never, { provider: "google", params: { code: "c", state: "st" }, cookie: null })).redirectTo).toBe("/login?error=state")
  expect((await oauthCallbackCore(d as never, { provider: "google", params: { code: "c", state: "WRONG" }, cookie })).redirectTo).toBe("/login?error=state")
  expect((await oauthCallbackCore(d as never, { provider: "github", params: { code: "c", state: "st" }, cookie })).redirectTo).toBe("/login?error=state")
  expect(calls).toBe(0)
})

test("callback: access_denied is 'cancelled'; success sets the session and goes to the safe next", async () => {
  expect((await oauthCallbackCore(deps() as never, { provider: "google", params: { error: "access_denied", state: "st" }, cookie })).redirectTo).toBe("/login?error=cancelled")
  const out = await oauthCallbackCore(deps() as never, { provider: "google", params: { code: "c", state: "st" }, cookie })
  expect(out).toMatchObject({ redirectTo: "http://app.brand.localhost:3001/notes", clearCookie: true, session: { token: "t" } })
})

test("callback: api errors map to login error codes with the provider", async () => {
  const err = (code: string) => new ORPCError(code, { defined: true, message: "x" })
  for (const [code, expected] of [["FORBIDDEN", "unverified"], ["CONFLICT", "claimed"], ["BAD_GATEWAY", "provider"], ["BAD_REQUEST", "failed"]] as const) {
    const d = deps({ callback: async () => { throw err(code) } })
    expect((await oauthCallbackCore(d as never, { provider: "google", params: { code: "c", state: "st" }, cookie })).redirectTo).toBe(`/login?error=${expected}&provider=google`)
  }
})

test("callback: apple's form body user JSON is parsed and passed through", async () => {
  let seen: unknown
  const d = deps({ providers: ["apple"], callback: async (input: unknown) => { seen = input; return { user: { id: 1 }, session: { token: "t", expiresAt: "x" } } } })
  const appleCookie = encodeOauthCookie({ provider: "apple", state: "st", next: undefined })
  await oauthCallbackCore(d as never, { provider: "apple", params: { code: "c", state: "st", user: JSON.stringify({ name: { firstName: "Ada", lastName: "L" } }) }, cookie: appleCookie })
  expect(seen).toMatchObject({ appleUser: { name: { firstName: "Ada", lastName: "L" } } })
})
```

- [ ] **Step 2: Run to verify they fail** — FAIL.

- [ ] **Step 3: Core, routes, buttons**

`lib/oauth.ts`: `OAUTH_COOKIE = "oauth"`; `encodeOauthCookie` = base64url of JSON; `decodeOauthCookie` → object or null on any parse failure; `oauthCookieAttributes = { httpOnly: true, secure: true, sameSite: "none" as const, path: "/oauth", maxAge: 600 }`; `oauthStartCore`: provider not in `deps.providers` → `{ status: 404 }`, else `start`, return `{ redirectTo: url, cookie: encode({ provider, state, codeVerifier, next }) }`; `oauthCallbackCore`: decode cookie; missing / `cookie.provider !== provider` / `params.state !== cookie.state` → `/login?error=state`; `params.error === "access_denied"` → `/login?error=cancelled`; any other `params.error` or missing `code` → `/login?error=failed`; `appleUser` = `JSON.parse(params.user)` inside try (ignore failures); call `deps.callback({ provider, code, codeVerifier: cookie.codeVerifier, appleUser, client })`; map `ORPCError` codes `FORBIDDEN→unverified`, `CONFLICT→claimed`, `BAD_GATEWAY→provider`, else `failed` (+ `&provider=<p>`), log undeclared errors; success → `{ redirectTo: deps.safeNextUrl(cookie.next), clearCookie: true, session }`. `OAUTH_ERROR_MESSAGES`: state → "That sign-in attempt expired or did not start here. Try again."; cancelled → "You cancelled the sign-in."; unverified → `${p} account's email is not verified — sign in with your email first, then connect ${p} in your account.`; claimed → `That ${p} account is already connected to another user.`; provider → `${p} is not responding right now. Try again in a moment.`; failed → "Sign-in failed. Try again."

`start/route.ts`:
```ts
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const auth = getAuth()
  const url = new URL(req.url)
  const api = await auth.anonymousApi({ ip: requestInfo(req.headers).ip })
  const { providers } = await api.auth.providers()
  const out = await oauthStartCore({ providers, start: (p) => api.auth.oauth.start({ provider: p }) }, { provider: provider as ProviderId, next: url.searchParams.get("next") ?? undefined })
  if ("status" in out) return new Response("Not found", { status: 404 })
  const res = NextResponse.redirect(out.redirectTo, 302)
  res.cookies.set(OAUTH_COOKIE, out.cookie, oauthCookieAttributes)
  return res
}
```
`callback/route.ts`: `GET` reads `url.searchParams`; `POST` (Apple) reads `await req.formData()`; both build `params`, read the cookie from `req.headers.get("cookie")` (a small `readCookie(header, name)` helper), call the core with `callback: (input) => (hasSessionCookie ? auth.api() : auth.anonymousApi({ ip })).then((c) => c.auth.oauth.callback({ ...input, client }))`, then: if `out.session` → `endCurrentSession` logic as in `login/actions.ts` (sign out the old session api-side when a cookie exists and the user differs — simplest: always call `signOut` on the old token when present, as `signInCore` does), `await auth.setSession(out.session)`; `NextResponse.redirect(out.redirectTo, 303)` and delete the `oauth` cookie (`res.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieAttributes, maxAge: 0 })`). The POST handler must not be blocked by the shared security proxy's CSRF/`sec-fetch-site` logic — check `apps/auth/src/proxy.ts` / `createSecurityProxy`; if it refuses cross-site POSTs, exempt `/oauth/*/callback` (document why: the state cookie is the CSRF check here).

`social-buttons.tsx` (server component now): `SocialButtons({ providers, label, next })` renders one `<Button asChild variant="outline">` per provider with `<a href={\`/oauth/${p}/start${next ? \`?next=${encodeURIComponent(next)}\` : ""}\`}>` and the glyphs `simple-icons:google|github|apple`; labels "Google", "GitHub", "Apple"; returns null when empty. `OrDivider` stays. Login/sign-up pages fetch `auth.providers()` via `anonymousApi` and pass `providers` down through the views to the forms; the forms render `{providers.length > 0 && (<><SocialButtons … /><OrDivider /></>)}`. `login/page.tsx`: read `error` + `provider`, pass `errorMessage = OAUTH_ERROR_MESSAGES[error]?.(providerLabel)` to the view, rendered as an `Alert` with `role="alert"`. Card descriptions: "Login with Google, GitHub or Apple" → make it generic: "Sign in with a connected account or your email" when providers exist, "Sign in with your email" otherwise.

- [ ] **Step 4: Run** — `bun test apps/auth && bun run --filter @repo/auth typecheck && bun --filter @repo/auth build` (routes `/oauth/[provider]/start`, `/oauth/[provider]/callback` dynamic). Run `bun run icons:bundle` if any new `simple-icons:*` name is not in the bundle (the bundle covers `lucide:*` only — check how `simple-icons:apple` renders today in `social-buttons.tsx`; if it goes to the Iconify API at runtime, keep that behaviour and note it in the report).

- [ ] **Step 5: README and commit**
```bash
bunx biome check --write apps/auth
git add apps/auth
git commit -m "feat(auth): Google, GitHub and Apple sign-in via /oauth routes with a state cookie; real provider buttons"
```

---

### Task 6: `apps/auth` — magic-link form and `/magic` page

**Files:**
- Create: `apps/auth/src/app/magic/page.tsx`, `apps/auth/src/app/magic/actions.ts`, `apps/auth/src/views/magic-view.tsx`, `apps/auth/src/components/magic-link-form.tsx`, `apps/auth/src/components/magic-continue-form.tsx`
- Modify: `apps/auth/src/lib/actions.ts` (+ `requestMagicLinkCore`, `consumeMagicLinkCore`, `AuthApi` picks `magicLink`), `actions.test.ts`, `login-form.tsx` (render `MagicLinkForm` under the password form), `apps/auth/src/app/login/actions.ts` (+ `requestMagicLink` action), `apps/auth/README.md`

**Interfaces:**
- Consumes: `auth.magicLink.request/consume`; `isPlausibleToken` from `lib/verify-email.ts` (reuse: move it to `lib/tokens.ts` if cleaner, update the import).
- Produces: `requestMagicLinkCore(deps, fd) → FormState` (always `{ ok: true, message: MAGIC_SENT }` after validation; `MAGIC_SENT = "Check your inbox for a sign-in link."`); `consumeMagicLinkCore(deps, fd) → FormState | { redirectTo }` (fields `token`, `next`).

- [ ] **Step 1: Failing core tests** (`apps/auth/src/lib/actions.test.ts`, reusing its `deps()`/`fd()` helpers):
```ts
describe("requestMagicLinkCore", () => {
  test("invalid email is a field error", async () => {
    const out = await requestMagicLinkCore(deps(), fd({ email: "nope" }))
    expect(out).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } })
  })
  test("valid email always reports sent, even when the api is down", async () => {
    const out = await requestMagicLinkCore(deps({ api: { ...fakeAuthApi, magicLink: { request: async () => { throw new Error("down") }, consume: fakeAuthApi.magicLink.consume } } }), fd({ email: "a@example.com" }))
    expect(out).toEqual({ ok: true, message: MAGIC_SENT })
  })
})

describe("consumeMagicLinkCore", () => {
  const good = "a".repeat(43)
  test("an implausible token never reaches the api", async () => {
    let calls = 0
    const out = await consumeMagicLinkCore(deps({ api: { ...fakeAuthApi, magicLink: { ...fakeAuthApi.magicLink, consume: async () => { calls++; throw new Error("x") } } } }), fd({ token: "short" }))
    expect(out).toEqual({ ok: false, message: MAGIC_INVALID })
    expect(calls).toBe(0)
  })
  test("BAD_REQUEST shows the same message", async () => {
    const bad = new ORPCError("BAD_REQUEST", { defined: true, message: "x" })
    const out = await consumeMagicLinkCore(deps({ api: { ...fakeAuthApi, magicLink: { ...fakeAuthApi.magicLink, consume: async () => { throw bad } } } }), fd({ token: good }))
    expect(out).toEqual({ ok: false, message: MAGIC_INVALID })
  })
  test("success ends the old session, stores the new one and redirects to the safe next", async () => {
    const calls: string[] = []
    const d = deps({ endCurrentSession: async () => { calls.push("end") }, setSession: async () => { calls.push("set") } })
    const out = await consumeMagicLinkCore(d, fd({ token: good, next: "http://app.brand.localhost:3001/notes" }))
    expect(out).toEqual({ redirectTo: "http://app.brand.localhost:3001/notes" })
    expect(calls).toEqual(["end", "set"])
  })
})
```
(`fakeAuthApi` is whatever the file names its fake `AuthApi`; add `magicLink: { request: async () => {}, consume: async () => issued }` to it, where `issued` is the file's existing fake `AuthResult`.) `MAGIC_INVALID = "This sign-in link has expired or was already used."`
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — cores mirror `forgotPasswordCore` / `resetPasswordCore` (copy their shape, including `storeSession` and `endCurrentSession`). `MagicLinkForm` (client): one email field + "Email me a sign-in link" button, `useActionState(requestMagicLink)`, `FormMessage`; placed in `LoginForm` below the password form under a small divider "Or". `/magic/page.tsx`: `token` from search params; implausible → failure card ("This link has expired or was already used" → "Request a new one" → `/login`); else `MagicView` with a card "Continue to sign in" + `MagicContinueForm` (client) containing hidden `token` and `next` and a **Continue** submit → `consumeMagicLink` action (`"use server"`, `anonymousApi` + `setSession` + `endCurrentSession`, `redirect` on success; on failure returns the `FormState` and the form shows the message with the "Request a new one" link). `next` is carried on the magic URL only if present (`/magic?token=…&next=…`) — the api link has no `next`; the page accepts an optional one.
- [ ] **Step 4: Run** — `bun test apps/auth && bun run --filter @repo/auth typecheck && bun --filter @repo/auth build`.
- [ ] **Step 5: README and commit**
```bash
bunx biome check --write apps/auth
git add apps/auth
git commit -m "feat(auth): magic-link sign-in — request form on login and a /magic page that signs in on Continue"
```

---

### Task 7: `apps/account` — sign-in methods

**Files:**
- Create: `apps/account/src/components/set-password-form.tsx`, `apps/account/src/components/connected-accounts.tsx`
- Modify: `apps/account/src/lib/actions.ts` (+ `setPasswordCore`, `disconnectIdentityCore`; `AccountApi` picks `setPassword`, `identities`), `actions.test.ts`, `apps/account/src/app/(account)/security/actions.ts` (+ `setPassword`, `disconnectIdentity`), `security/page.tsx` (fetch `identities.list()` and `auth.providers()`), `apps/account/src/views/security-view.tsx`, `apps/account/README.md`

**Interfaces:**
- Consumes: `User.hasPassword`, `account.setPassword`, `account.identities.list/disconnect`, `auth.providers`, `AUTH_URL` (from `@repo/session`'s `loadEnv` in `lib/auth.ts` — expose `authUrl` from `getAuth()` or read `siteUrl("auth")`; use `siteUrl("auth")` from `@repo/sites`, already a dependency, for the connect link).
- Produces: `setPasswordCore(deps, fd)` (fields `password`, `confirm`; mismatch → field error on `confirm`; `CONFLICT` → message), `disconnectIdentityCore(deps, fd)` (field `provider`; `FORBIDDEN`/`NOT_FOUND` messages pass through).

- [ ] **Step 1: Failing core tests** (`apps/account/src/lib/actions.test.ts`, reusing `fakeApi`):
```ts
describe("setPasswordCore", () => {
  test("mismatched confirmation is a field error and never calls the api", async () => {
    let calls = 0
    const out = await setPasswordCore({ api: { ...fakeApi, setPassword: async () => { calls++ } } }, fd({ password: "correct horse battery", confirm: "different horse" }))
    expect(out).toMatchObject({ ok: false, fieldErrors: { confirm: expect.any(String) } })
    expect(calls).toBe(0)
  })
  test("success and CONFLICT", async () => {
    expect(await setPasswordCore({ api: { ...fakeApi, setPassword: async () => {} } }, fd({ password: "correct horse battery", confirm: "correct horse battery" }))).toEqual({ ok: true, message: "Password set. You can now sign in with it." })
    const conflict = new ORPCError("CONFLICT", { defined: true, message: "You already have a password — change it instead" })
    expect(await setPasswordCore({ api: { ...fakeApi, setPassword: async () => { throw conflict } } }, fd({ password: "correct horse battery", confirm: "correct horse battery" }))).toEqual({ ok: false, message: conflict.message, values: {} })
  })
})

describe("disconnectIdentityCore", () => {
  test("unknown provider value is rejected before the api", async () => {
    const out = await disconnectIdentityCore({ api: fakeApi }, fd({ provider: "myspace" }))
    expect(out).toMatchObject({ ok: false })
  })
  test("success, FORBIDDEN and NOT_FOUND pass the api's message through", async () => {
    expect(await disconnectIdentityCore({ api: { ...fakeApi, identities: { ...fakeApi.identities, disconnect: async () => {} } } }, fd({ provider: "github" }))).toEqual({ ok: true, message: "GitHub disconnected." })
    const forbidden = new ORPCError("FORBIDDEN", { defined: true, message: "This is your only way to sign in — set a password first" })
    expect(await disconnectIdentityCore({ api: { ...fakeApi, identities: { ...fakeApi.identities, disconnect: async () => { throw forbidden } } } }, fd({ provider: "github" }))).toEqual({ ok: false, message: forbidden.message })
  })
})
```
(`fakeApi` gains `setPassword: async () => {}` and `identities: { list: async () => ({ items: [] }), disconnect: async () => {} }`.) Provider display names: `{ google: "Google", github: "GitHub", apple: "Apple" }` exported from `lib/actions.ts` as `PROVIDER_LABELS`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — `SecurityView({ items, email, user, identities, providers })`: Password card shows `SetPasswordForm` when `!user.hasPassword` (description "Your account signs in with a connected account or a sign-in link. Add a password to sign in with it too.") else the existing `PasswordForm`. New card **Connected accounts** ("Sign in with these accounts as well as your email."): for each provider in `providers` — connected: row with the provider name, `identity.email ?? "connected"`, "Connected <date>", a **Disconnect** form button (disabled with hint text "This is your only way to sign in — set a password first" when `!user.hasPassword && identities.length === 1`); not connected: **Connect** `<a href={\`${siteUrl("auth")}/oauth/${p}/start?next=${encodeURIComponent(securityUrl)}\`}>`; `providers.length === 0` → one line "No sign-in providers are configured." Server actions call `requireUser()` then the cores; `revalidatePath("/security")` after success (and `"/", "layout"` after `setPassword` because `hasPassword` reaches the layout's user).
- [ ] **Step 4: Run** — `bun test apps/account && bun run --filter @repo/account typecheck && bun --filter @repo/account build`.
- [ ] **Step 5: README and commit**
```bash
bunx biome check --write apps/account
git add apps/account
git commit -m "feat(account): sign-in methods — set a password, connected accounts with connect and disconnect"
```

---

### Task 8: Docs, provider guide, browser pass, full gate

**Files:**
- Create: `docs/guides/oauth-providers.md`
- Modify: `CLAUDE.md`, `apps/api/README.md`, `.env.example`, `docker-compose.yml` (api env: the eight `OAUTH_*` vars as `${VAR:-}`), `docs/ROADMAP.md` (tick 6b), spec status

- [ ] **Step 1: Docs** — CLAUDE.md Authentication: **Social sign-in and magic link** paragraph (flow: button → `/oauth/<p>/start` → provider → `/oauth/<p>/callback` → api exchange → session cookie; secrets in `apps/api`; linking rule in one sentence; passwordless accounts + `hasPassword`; magic link consumed by a button; the `oauth` cookie's `SameSite=None` and why); env table rows for the eight vars (Apps = api, optional, grouped); `docs/guides/oauth-providers.md`: per provider the console path, app type, redirect URIs for dev and prod, scopes, what to copy into `.env`, Apple's Services ID / Sign in with Apple key `.p8` → `OAUTH_APPLE_PRIVATE_KEY` with `\n` escapes, plus the local-testing note (`*.localhost` is a secure context in Chromium; Firefox/Safari need `https` or a tunnel for the `Secure` cookie — say so). READMEs: routes and procedures. ROADMAP: tick 6b; spec status → implemented.
- [ ] **Step 2: Browser pass** (controller): keyless — login/sign-up show no social block or divider; magic link for an existing user (request → api log → `/magic` → Continue → app; reuse → failure state) and for a new address (account created, `account` Security shows **Set a password** and "No sign-in providers are configured"); set password → password sign-in works; passwordless account's password sign-in before that → "Invalid email or password". With Google/GitHub credentials in `apps/api/.env` (optional): sign in with each; link to an existing account; connect/disconnect from Security; `?error=` messages for cancelled.
- [ ] **Step 3: Gate** — `bun run ci` → exit 0; `bun --filter @repo/api test:postgres` → green.
- [ ] **Step 4: Commit**
```bash
git add CLAUDE.md docs apps/api/README.md .env.example docker-compose.yml
git commit -m "docs(auth): social sign-in and magic link — provider guide, env, single points; Phase 6b done"
```
