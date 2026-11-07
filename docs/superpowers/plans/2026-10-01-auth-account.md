# Account pages on the real session (Phase 4c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/account` shows the signed-in user's real profile, lets them change their name and
password, and lists their sessions with "sign out" per device and "sign out all other devices";
every page is behind `requireUser()`. Phase 4 is complete.

**Architecture:** The 4b pattern verbatim — `getAuth()` in `src/lib/auth.ts`, pure DI'd action
cores in `src/lib/actions.ts` tested with a fake api, thin `"use server"` wrappers, forms on
`useActionState`, the shared form-feedback helpers moved into `@repo/ui` so `auth` and `account`
share one copy. The `(account)` route-group layout does the guard once and passes the user down.

**Tech Stack:** Next 16 App Router, React 19, `@repo/session`, `@repo/api-contract`
(`account.*` procedures), `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-30-authentication-design.md` (sub-project 4c)

## Global Constraints

- Branch `feat/auth-account` from `main` after PR #42 (4b). Dev host `account.brand.localhost:3003`.
- One lazy `getAuth()`; `instrumentation.ts` with `assertAuthEnv`; `transpilePackages` gains `@repo/api-contract`, `@repo/session`; `@repo/account` joins root `typecheck` and `test:services` (planner tests updated).
- Validation via the contract schemas (`UpdateProfileSchema`, `ChangePasswordSchema`, `SessionIdSchema`) with `safeParse`; invalid input never reaches the api.
- Exact copy: wrong current password → the api's `FORBIDDEN` message `"Current password is incorrect"`; mismatched confirmation → field error `confirm`: `"Passwords do not match"`; success messages: profile `"Name updated."`, password `"Password changed. Other devices were signed out."`, revoke `"Device signed out."`, revoke-others `"All other devices were signed out."`; anything undeclared → `"The account service is unavailable right now. Try again in a moment."`.
- All mutations are server actions (Next's Origin check); every action re-checks `requireUser()` before calling the api; the api scopes by session, so a forged session id is `NOT_FOUND`, never another user's.
- The sessions list never shows the current device's "Sign out" button (use the header's sign-out); other rows do. `current` comes from the api.
- Mockup content that implies unbuilt features (passkeys, 2FA, "security recommendations", birthday/gender/phone/address rows) is removed from the two pages 4c makes real; the other pages (`payments`, `people-sharing`, `data-privacy`) stay mockups with their existing note.
- 4b follow-ups included: signing in/up while a session cookie is present ends that session first (best effort); `setSession` moves out of the api `try` in the auth cores.
- Biome 0/0; double quotes, no semicolons, 2-space indent, 100-char lines. Commits: Conventional Commits, blank line, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (subjects ≤100 chars).

## Review Focus

1. **A forged `sessionId` in the revoke form** (another user's id, or garbage) must not revoke anything and must read as "Session not found" — Task 2's core test + the api's owner scoping (4a-tested).
2. **Changing the password must leave the current device signed in and sign the others out** — Task 3's browser walk with two browser contexts.
3. **An empty name** must be accepted (the schema allows it) and the header must fall back to the email — Task 2's core test and the header component.
4. **A signed-out visit to any account page** must redirect to `auth` with `next=` and come back — Task 3's walk.
5. **Signing in over an existing session** must not leave a phantom device in the list — Task 1's `endCurrentSession` test and Task 3's walk (sign in twice in one browser → one row).

---

### Task 1: Shared form feedback in `@repo/ui`, 4b follow-ups in `apps/auth`, `apps/account` foundation

**Files:**
- Create: `packages/ui/src/components/form-feedback.tsx`, `packages/ui/src/components/form-feedback.test.tsx`
- Modify: `apps/auth/src/components/form-message.tsx` (becomes a re-export), `apps/auth/src/lib/actions.ts` + `actions.test.ts`, `apps/auth/src/app/{login,signup}/actions.ts`
- Create: `apps/account/src/lib/auth.ts`, `apps/account/src/instrumentation.ts`, `apps/account/.env.example`, `apps/account/src/app/actions.ts` (sign-out)
- Modify: `apps/account/package.json`, `apps/account/next.config.mjs`, root `package.json`, `scripts/ci-plan.test.ts`

**Interfaces:**
- Produces (`@repo/ui/components/form-feedback`): `type FormState = { ok: false; message?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | { ok: true; message?: string }`; `FormMessage({ state })`; `FieldError({ name, state })`; `fieldAria(name, state, describedBy?)`; `fieldErrors(issues)`.
- `apps/auth/src/lib/actions.ts`: `ActionDeps.endCurrentSession?: () => Promise<void>` — called before `api.signIn`/`api.signUp` when provided; `setSession` runs after the try block.
- `apps/account/src/lib/auth.ts`: `getAuth()`.

- [ ] **Step 1: Move the form helpers to `@repo/ui`**

`packages/ui/src/components/form-feedback.tsx` = the current `apps/auth/src/components/form-message.tsx` plus `FormState` (from `apps/auth/src/lib/actions.ts`) and `fieldErrors` (same file), with the `@/lib/actions` import removed. Test (`renderToStaticMarkup`, like `status-page.test.tsx`): `FormMessage` renders `role="alert"` for an error and `role="status"` for success, and nothing for `{ ok: false }`; `FieldError` renders the id `name-error`; `fieldAria` returns both attributes undefined when valid and joins `describedBy` + the error id when invalid; `fieldErrors` keeps the first message per field and keys path-less issues as `form`.

`apps/auth/src/components/form-message.tsx` → `export { FieldError, fieldAria, FormMessage } from "@repo/ui/components/form-feedback"`; `apps/auth/src/lib/actions.ts` imports `FormState`/`fieldErrors` from there and re-exports `FormState` for its callers. `apps/auth` tests unchanged and green.

- [ ] **Step 2: 4b follow-ups in the auth cores (tests first)**

`actions.test.ts`: (a) "an existing session is ended before a new sign-in" — `deps.endCurrentSession` is a spy; after `signInCore` succeeds it was called once, before `api.signIn` (record call order); (b) same for `signUpCore`; (c) "a cookie write failure after the api issued a session is reported, not swallowed as unavailable" — make `setSession` throw: the result is `{ ok: false, message: UNAVAILABLE, ... }` **and** `console.error` was called (spy) — i.e. `setSession` runs after the try with its own catch that logs. Implement: in both cores, `await deps.endCurrentSession?.()` first (errors logged, not fatal); `const { session } = await deps.api.signIn(...)` in the try; then outside it `try { await deps.setSession(session) } catch (error) { console.error("[auth] setSession failed", error); return { ok: false, message: UNAVAILABLE, values } }`. Wrappers (`login/actions.ts`, `signup/actions.ts`) pass `endCurrentSession: async () => { if ((await cookies()).get(SESSION_COOKIE)) await (await auth.api()).auth.signOut().catch(() => {}) }`.

- [ ] **Step 3: `apps/account` foundation**

`package.json`: deps `@repo/api-contract`, `@repo/session`, `@orpc/client` (`workspace:*` / `catalog:`), devDep `@types/bun: catalog:`, script `"test": "bun test"`. `next.config.mjs` `transpilePackages: ["@repo/ui", "@repo/api-contract", "@repo/session"]`. Root `typecheck` and `test:services` gain `--filter @repo/account`; `scripts/ci-plan.test.ts` pinned lists + the "session change reaches …" expectation gains `@repo/account`. `src/lib/auth.ts` = `apps/auth`'s. `src/instrumentation.ts` = the README snippet. `.env.example` = `apps/auth`'s five vars. `src/app/actions.ts` = `apps/auth`'s `signOut` but redirecting to `${AUTH_URL}/login?signedout=1` (read with `loadEnv(["AUTH_URL"])`). `bun install`.

- [ ] **Step 4: Run and commit**

Run: `bunx biome check --write packages/ui apps/auth apps/account scripts package.json && bun run --filter @repo/ui test && bun run --filter @repo/auth test && bun run typecheck && bun test scripts`
Expected: ui 19 pass (4 new), auth 20 pass (3 new), typecheck green incl. `@repo/account`, planner 25.

```bash
git add packages/ui apps/auth apps/account package.json bun.lock scripts/ci-plan.test.ts
git commit -m "feat(account): foundation on @repo/session; shared form feedback in @repo/ui; sign-in ends a prior session"
```

---

### Task 2: Action cores, guarded layout, personal-info and security pages

**Files:**
- Create: `apps/account/src/lib/actions.ts`, `apps/account/src/lib/actions.test.ts`, `apps/account/src/app/(account)/personal-info/actions.ts`, `apps/account/src/app/(account)/security/actions.ts`, `apps/account/src/components/{name-form,password-form,sessions-list}.tsx`
- Modify: `apps/account/src/app/(account)/layout.tsx`, `apps/account/src/app/(account)/{page,personal-info/page,security/page}.tsx`, `apps/account/src/views/{home-view,personal-info-view,security-view}.tsx`, `apps/account/src/components/account-header.tsx`

**Interfaces:**
- Produces:
  - `type AccountApi = Pick<ApiClient["account"], "updateProfile" | "changePassword"> & { sessions: Pick<ApiClient["account"]["sessions"], "revoke" | "revokeOthers"> }`; `type ActionDeps = { api: AccountApi }`
  - `updateProfileCore(deps, fd): Promise<FormState>`; `changePasswordCore(deps, fd): Promise<FormState>`; `revokeSessionCore(deps, fd): Promise<FormState>`; `revokeOtherSessionsCore(deps): Promise<FormState>`
  - `initialsOf(user: { name: string; email: string }): string` — first letters of up to two name words, else the email's first letter, upper-cased
  - Server actions `updateProfile`, `changePassword`, `revokeSession`, `revokeOtherSessions` (`(prev: FormState, fd: FormData) => Promise<FormState>`; each `await getAuth().requireUser()` first, then `revalidatePath` on success)
  - `AccountHeader({ user })`, `NameForm({ user })`, `PasswordForm()`, `SessionsList({ items })`

- [ ] **Step 1: Failing tests**

`apps/account/src/lib/actions.test.ts` (same fake-api style as `apps/auth`):

```ts
import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  type ActionDeps,
  changePasswordCore,
  initialsOf,
  revokeOtherSessionsCore,
  revokeSessionCore,
  updateProfileCore,
} from "./actions"

const user = { id: 1, email: "ada@example.com", name: "Ada Lovelace", createdAt: "2026-01-01T00:00:00.000Z" }
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })
const deps = (api: Partial<ActionDeps["api"]> & { sessions?: Partial<ActionDeps["api"]["sessions"]> }) =>
  ({ api: { ...api, sessions: api.sessions ?? {} } }) as ActionDeps

describe("updateProfileCore", () => {
  test("trims and saves the name", async () => {
    let seen: unknown
    const d = deps({ updateProfile: async (input) => ((seen = input), { ...user, name: input.name }) })
    expect(await updateProfileCore(d, form({ name: "  Ada L. " }))).toEqual({ ok: true, message: "Name updated." })
    expect(seen).toEqual({ name: "Ada L." })
  })
  test("an empty name is allowed", async () => {
    const d = deps({ updateProfile: async () => ({ ...user, name: "" }) })
    expect(await updateProfileCore(d, form({ name: "" }))).toMatchObject({ ok: true })
  })
  test("a 101-char name is a field error and never reaches the api", async () => {
    let called = false
    const d = deps({ updateProfile: async () => ((called = true), user) })
    expect(await updateProfileCore(d, form({ name: "x".repeat(101) }))).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String) },
      values: { name: "x".repeat(101) },
    })
    expect(called).toBe(false)
  })
})

describe("changePasswordCore", () => {
  test("success message names the side effect", async () => {
    const d = deps({ changePassword: async () => undefined })
    expect(await changePasswordCore(d, form({ currentPassword: "old-old-old", newPassword: "new-new-new", confirm: "new-new-new" }))).toEqual({
      ok: true,
      message: "Password changed. Other devices were signed out.",
    })
  })
  test("mismatch, reuse, short and wrong-current are reported in that order of precedence", async () => {
    const d = deps({ changePassword: async () => { throw defined("FORBIDDEN", "Current password is incorrect") } })
    expect(await changePasswordCore(d, form({ currentPassword: "a", newPassword: "new-new-new", confirm: "nope" }))).toMatchObject({ fieldErrors: { confirm: "Passwords do not match" } })
    expect(await changePasswordCore(d, form({ currentPassword: "same-same", newPassword: "same-same", confirm: "same-same" }))).toMatchObject({ fieldErrors: { newPassword: expect.any(String) } })
    expect(await changePasswordCore(d, form({ currentPassword: "a", newPassword: "short", confirm: "short" }))).toMatchObject({ fieldErrors: { newPassword: expect.any(String) } })
    expect(await changePasswordCore(d, form({ currentPassword: "wrong-wrong", newPassword: "new-new-new", confirm: "new-new-new" }))).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "Current password is incorrect" },
    })
  })
  test("passwords are never echoed", async () => {
    const d = deps({ changePassword: async () => { throw new TypeError("fetch failed") } })
    const out = await changePasswordCore(d, form({ currentPassword: "a-a-a-a-a", newPassword: "new-new-new", confirm: "new-new-new" }))
    expect(JSON.stringify(out)).not.toContain("new-new-new")
    expect(out).toMatchObject({ ok: false, message: "The account service is unavailable right now. Try again in a moment." })
  })
})

describe("sessions", () => {
  test("revoke passes the id and reports; a foreign/garbage id is the api's NOT_FOUND message", async () => {
    let seen: unknown
    const ok = deps({ sessions: { revoke: async (input) => ((seen = input), undefined) } })
    expect(await revokeSessionCore(ok, form({ sessionId: "7" }))).toEqual({ ok: true, message: "Device signed out." })
    expect(seen).toEqual({ id: 7 })
    const missing = deps({ sessions: { revoke: async () => { throw defined("NOT_FOUND", "Session not found") } } })
    expect(await revokeSessionCore(missing, form({ sessionId: "999" }))).toEqual({ ok: false, message: "Session not found" })
    expect(await revokeSessionCore(ok, form({ sessionId: "abc" }))).toMatchObject({ ok: false })
  })
  test("revokeOthers reports", async () => {
    const d = deps({ sessions: { revokeOthers: async () => undefined } })
    expect(await revokeOtherSessionsCore(d)).toEqual({ ok: true, message: "All other devices were signed out." })
  })
})

describe("initialsOf", () => {
  test("two words, one word, none", () => {
    expect(initialsOf({ name: "Ada Lovelace", email: "ada@example.com" })).toBe("AL")
    expect(initialsOf({ name: "ada", email: "ada@example.com" })).toBe("A")
    expect(initialsOf({ name: "", email: "zoe@example.com" })).toBe("Z")
  })
})
```

Run: `cd apps/account && bun test` — FAIL (module not found).

- [ ] **Step 2: Cores**

`apps/account/src/lib/actions.ts` (same conventions as `apps/auth/src/lib/actions.ts`: `str()`, `apiError` requiring `error.defined`, `console.error` on undeclared errors, `UNAVAILABLE = "The account service is unavailable right now. Try again in a moment."`), using `UpdateProfileSchema`, `ChangePasswordSchema` (the refine supplies the reuse message on `newPassword`; check `confirm` first), `SessionIdSchema` (`z.coerce` handles the string id). `initialsOf` as specified.

- [ ] **Step 3: Wrappers, layout, header, pages**

`(account)/layout.tsx`: `await connection(); const auth = getAuth(); const user = await auth.requireUser();` and render `<AccountHeader user={user} />` (the layout is a server component; `SidebarProvider` stays). `AccountHeader({ user })`: replace the hard-coded badge with `initialsOf(user)` / `user.name || user.email`, and add a `<form action={signOut}>` ghost "Sign out" button next to it; drop the fake Help button or keep it — keep.

`personal-info/actions.ts`: `updateProfile` → `requireUser()`, `updateProfileCore({ api: (await getAuth().api()).account }, fd)`, `revalidatePath("/personal-info")` and `revalidatePath("/")` on success. `security/actions.ts`: the other three the same way (`revalidatePath("/security")`).

Pages pass the user: `(account)/page.tsx` → `HomeView({ user })` (welcome line + badge from the user; remove other mock copy that names "Ada"); `personal-info/page.tsx` → `PersonalInfoView({ user })`: the "Basic info" card holds the badge + `NameForm` (`useActionState(updateProfile)`, `defaultValue={user.name}`, `autoComplete="name"`, `FormMessage`), the "Contact info" card shows the email read-only ("Email is your sign-in and cannot be changed here yet."); the Birthday/Gender/Phone/Addresses rows go. `security/page.tsx` → fetches `items = (await (await getAuth().api()).account.sessions.list()).items` and renders `SecurityView({ items })`: heading; a "Password" `SettingsCard` with `PasswordForm` (`currentPassword` `autoComplete="current-password"`, `newPassword` + `confirm` `autoComplete="new-password"`, hint id linked via `fieldAria`); a "Your devices" `SettingsCard` with `SessionsList({ items })` — one row per session: user agent (or "Unknown device"), "This device" badge when `current`, `createdAt`/`lastSeenAt` as "Signed in <date> · Last seen <date>" (use `Intl.DateTimeFormat` with `dateStyle: "medium"`, no time zone surprises), and for non-current rows a form posting `revokeSession` with `<input type="hidden" name="sessionId" value={id} />`; below the list a form posting `revokeOtherSessions` (disabled when there is only one session). The recommendations banner, passkeys, 2FA and "recent activity" mock rows are removed.

- [ ] **Step 4: Run**

Run: `bunx biome check --write apps/account && cd apps/account && bun test && bun run typecheck && cd ../.. && bun --filter @repo/account build`
Expected: 9 tests pass; typecheck green; build green.

```bash
git add apps/account
git commit -m "feat(account): real profile, name and password changes, sessions list with revoke — all behind requireUser"
```

---

### Task 3: Docs, the walk, and closing Phase 4

**Files:**
- Modify: `apps/account/README.md` (create if absent), `CLAUDE.md`, `docs/ROADMAP.md`, `docs/superpowers/specs/2026-09-30-authentication-design.md` (status line → "implemented")

- [ ] **Step 1: Docs**

`apps/account/README.md`: what is real (home, personal-info name, security password + devices), what is mockup, env, tests. CLAUDE.md "Authentication": `apps/account` added to the list of apps with `createAuth`; the form-feedback helpers now live in `@repo/ui/components/form-feedback` (mention under Design System Single Points as **Form feedback**). ROADMAP: tick 4c and the Phase 4 top item; keep the Follow-ups sub-bullet. Spec status → "implemented (4a #41, 4b #42, 4c this PR)".

- [ ] **Step 2: The walk (`bun dev`; Chrome DevTools, two isolated contexts A and B)**

1. A: `account.brand.localhost:3003/security` signed out → `auth…/login?next=…security` → sign in → back on `/security`; header shows the name; the devices card lists one row marked "This device".
2. A: `/personal-info` → change the name → "Name updated." and the header updates.
3. B: sign in as the same user → A's `/security` (reload) now lists two rows; B's row has a "Sign out" button.
4. A: "Sign out" on B's row → "Device signed out." → B's next navigation redirects to login.
5. B: sign in again (this reuses the browser that already had a dead cookie — fine); then A: change password → "Password changed. Other devices were signed out." → A still signed in; B redirected to login; signing in with the old password fails, the new one works.
6. A: sign in a second time in the same context from `/login` (visit it, use the signed-in card's Sign out, sign in again): the devices list shows **one** row, not two (Review Focus 5).
7. Console: zero CSP messages on all account pages.

- [ ] **Step 3: Full gate and commit**

Run: `bun run ci` — exit 0.

```bash
git add apps/account/README.md CLAUDE.md docs
git commit -m "docs: Phase 4c — account pages on the real session; Phase 4 complete"
```
