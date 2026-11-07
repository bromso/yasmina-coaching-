# Correctness follow-ups (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the correctness follow-ups Phase 7 left open: S3 reads (one request, missing → 404),
the SQLite transaction gate (a hang, three latent gaps), two analytics races, and four realtime
edges.

**Architecture:** All server-side in `apps/api` (storage, `db.ts`, analytics job/query, realtime
server, stream and Postgres bus) plus `apps/app`'s `LiveNotes` client. No contract change, no
migration, no new environment variable.

**Tech Stack:** Bun 1.4.2 (`Bun.S3Client`, `Bun.sql`, `Bun.serve`), oRPC, Next 16.2, next-intl,
`bun test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-followups-sweep-design.md` — §8–§11 (PR 2). §1–§7
shipped in #80.

## Global Constraints

- Branch `fix/correctness-followups` from `main` (ea34f58); never stacked.
- Biome zero diagnostics; double quotes, no semicolons, 2 spaces, 100 columns.
- Conventional Commits, header ≤ 100 chars, one type per header; every commit ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new dependency, environment variable, migration or contract change.
- Database behaviour must hold on SQLite and on Postgres (`apps/api` tests run both with
  `TEST_DATABASE_URL`; CI's `api-postgres` job does).
- Every new user-facing string is in `packages/i18n/messages/{en,sv}/app.json`; `apps/app`'s
  i18n guard stays green with an empty allow-list.
- Implementers do **not** run the Playwright e2e suite (a 10-minute no-progress watchdog kills
  long waits on this machine); the controller runs `bun run ci` and e2e. Work in short steps; run
  long commands in the background.

## Review Focus

1. An S3 bucket whose credentials are simply wrong (every request 403) must not look healthy:
   images 404, but the failure is recorded each time (log + telemetry) so an operator sees it.
2. A transaction that awaits work started before it began must finish (or fail loudly), never
   hang the process silently — and the guard must still keep outside statements out of an open
   transaction.
3. With `ANALYTICS_RETENTION_DAYS=1`, a rollup that runs after the prune still finds yesterday's
   and the day before's raw rows.
4. A user whose session was revoked or who was removed from the workspace stops reconnecting and
   is told why; a normal API restart (502/503) still reconnects.
5. An admin impersonating a user who already has 10 streams open can still open one (it counts
   against the admin), and closing it frees the admin's slot, not the user's.

Each line has a test in the owning task (Tasks 1, 2, 3, 5, 4).

---

### Task 1: S3 reads — one request, missing or forbidden → `null`

**Files:**
- Modify: `apps/api/src/storage/s3.ts` (`get`), `apps/api/src/storage/create-storage.ts`
- Modify: callers of `createStorage` (`apps/api/src/index.ts:31`, `apps/api/src/worker.ts:49`)
- Modify: `apps/api/src/storage/fake-s3.ts` (if it cannot yet answer 403 / NoSuchKey on GET)
- Test: `apps/api/src/storage/storage.test.ts`

**Interfaces:**
- Produces: `s3Storage(options: S3Options & { onForbidden?: (key: string, error: unknown) => void })`;
  `createStorage(env, opts?: { onForbidden?: (key: string, error: unknown) => void })`.
- The content type comes from the key's extension via the same helper `local.ts` uses (find it:
  `grep -n "contentType\|png\|webp" apps/api/src/storage/local.ts`; export and reuse it rather than
  duplicating the map).

- [ ] **Step 1: Failing tests** in `storage.test.ts`'s s3-through-fake-endpoint block:

```ts
test("get on a missing key is null (NoSuchKey)", async () => { /* fake answers 404 NoSuchKey → null */ })
test("get on a key the bucket forbids is null and reported", async () => {
  // fake answers 403 AccessDenied for that key; onForbidden spy called once with the key
})
test("get is one request", async () => {
  // count requests the fake receives for one get of an existing key → 1
})
test("get keeps the content type from the key", async () => { /* avatars/1/x.png → image/png */ })
```

- [ ] **Step 2: Run** `bun test apps/api/src/storage/storage.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
    async get(key) {
      try {
        const body = await client.file(key).bytes()
        return { body, contentType: contentTypeFor(key), size: body.length }
      } catch (error) {
        if (isNotFound(error)) return null
        if (isForbidden(error)) {
          // A bucket without s3:ListBucket answers 403 for a missing object; wrong credentials
          // answer 403 for every object. Both read as "not found" to the browser, and the second
          // must not hide: report it every time.
          options.onForbidden?.(key, error)
          return null
        }
        throw error
      }
    },
```

`isNotFound` / `isForbidden` match the error the way `delete` already does (`/no.?such.?key/i`,
plus `/access.?denied|forbidden|\b403\b/i`); look at what Bun's `S3Error` exposes (`code`,
`message`) in the fake's responses and prefer a `code` match when present. Keep `delete`'s
matcher in one shared helper. `createStorage` passes `onForbidden` through; `index.ts` and
`worker.ts` pass `(key, error) => recordFailure("storage read forbidden", error)` (or whatever
failure recorder those entrypoints already build — reuse it; mask nothing extra, the key holds no
personal data).

- [ ] **Step 4: Run** the storage tests → PASS (`local` and `s3` contract suites both green).
`bun run --filter @repo/api typecheck`.

- [ ] **Step 5: Commit** — `fix(api): read S3 objects in one request, and answer 404 for a missing or forbidden key`

---

### Task 2: The SQLite transaction gate

**Files:**
- Modify: `apps/api/src/db.ts` (`serialiseSqlite`, `createDb`)
- Test: `apps/api/src/db.test.ts`

**Interfaces:** none new outward; `createDb` gains an optional `onPragmaFailure?: (error: unknown) => void`
second argument only if a logger is not otherwise reachable (prefer `console.error` with a clear
`[db]` prefix if the module has no recorder — check how `db.ts` reports anything today).

- [ ] **Step 1: Reproduce the hang as a test** (it must fail by timing out today):

```ts
test("a pool query started before a transaction and awaited inside it finishes", async () => {
  const db = createDb("sqlite://:memory:")
  await db.migrate()
  const pending = db.jobs.counts() // a pool-bound helper that issues more than one statement, or any helper
  const result = await Promise.race([
    db.transaction(async (tx) => {
      await tx.jobs.insert(/* the minimal valid job, as other db tests build one */)
      return await pending
    }),
    Bun.sleep(3000).then(() => "hung"),
  ])
  expect(result).not.toBe("hung")
  await db.close()
})
```

Use whatever pool helper reproduces it (the audit used `db.jobs.counts()` with `tx.jobs.insert`);
first confirm the cause by reading `SharedExclusiveLock`: a multi-statement pool helper started
before the transaction holds or re-requests the **shared** lock for its later statements, which
queue behind the transaction's **exclusive** lock, while the transaction awaits the helper.

- [ ] **Step 2: Run** → the test reports `"hung"`.

- [ ] **Step 3: Fix the hang.** Required outcome, in order of preference (record which you chose
and why in the report):
  1. It completes: e.g. a statement whose `then` is called while the *exclusive* holder is waiting
     on it can run inside the transaction's context — only if you can prove the guard's guarantee
     still holds (an outside statement never runs inside an open transaction *uninvited*). A
     statement started before `begin` and awaited from within the callback is "invited": the
     callback chose to wait for it.
  2. If (1) cannot be made sound, it fails loudly instead of hanging: the transaction rejects with
     a clear `Error("db.transaction: awaited a statement queued outside the transaction — …")`
     detected when a shared request queues behind the exclusive holder *and* the holder's callback
     is awaiting it, or by a bounded wait (e.g. `SQLITE_BUSY_TIMEOUT_MS`) with that message.
  Every existing `db.test.ts` case must still pass (they pin the guard's guarantees).

- [ ] **Step 4: The latent gaps**, each with a test:
  - `sql.transaction(...)` on the serialised client behaves exactly like `sql.begin(...)` (gated).
  - `sql.file(...)` and `sql.reserve(...)` throw `Error("…not supported on the serialised SQLite client")`.
  - A failing pragma is reported, not swallowed: replace `void lock.run(true, () => ready).catch(() => {})`
    with a catch that logs (`console.error("[db] SQLite pragmas failed", error)` or the module's
    recorder) — and the failure still does not crash the process at import. Test by injecting a
    rejecting `ready` through the smallest seam (e.g. export `serialiseSqlite` for tests if it is
    not already, or test through a corrupt path) and asserting the log.

- [ ] **Step 5: Run** `bun test apps/api/src/db.test.ts` then the whole `apps/api` suite →
PASS. `bun run --filter @repo/api typecheck`.

- [ ] **Step 6: Commit** — `fix(api): a pool query awaited inside a SQLite transaction no longer hangs` (and, if
separate, `fix(api): gate sql.transaction, refuse file/reserve, report pragma failures`).

---

### Task 3: Analytics — prune keeps the rollup's two days; `email_verified` once

**Files:**
- Modify: `apps/api/src/jobs/builtin/analytics.ts` (`analyticsPruneJob`)
- Modify: `apps/api/src/queries/users.ts` (`markEmailVerified` returns `boolean`)
- Modify: `apps/api/src/router.ts` (`auth.verifyEmail` ~line 897; the other caller ~690 just ignores the boolean)
- Modify: `CLAUDE.md` (**Analytics** / env table row for `ANALYTICS_RETENTION_DAYS`), `docs/guides/analytics.md`
- Test: `apps/api/src/analytics.test.ts` (or wherever `analyticsPruneJob` is tested — `grep -rn "analytics.prune\|analyticsPruneJob" apps/api/src --include=*.test.ts`), `apps/api/src/auth.test.ts` (verify-email)

- [ ] **Step 1: Failing tests**

```ts
test("prune never deletes the two days the nightly rollup rebuilds", async () => {
  // retention 1 day; raw rows on D-2 and D-1 (and D-3); run analytics.prune at now = D 00:20
  // → D-3 deleted, D-2 and D-1 kept; then run analytics.rollup → both days rolled up (Review Focus 3)
})
test("concurrent verifications record email_verified once", async () => {
  // sign up (unverified), grab the verify token; Promise.all two auth.verifyEmail calls with the same
  // token is not possible (single use) — instead call markEmailVerified twice concurrently through the
  // queries layer and assert exactly one returns true; and at the router level assert a second verify of
  // an already-verified account records no second event (drain jobs, count analytics_events rows)
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** In the prune job:

```ts
    const retentionCutoff = dayOf(new Date(now.getTime() - ctx.analyticsRetentionDays * DAY_MS).toISOString())
    // Never prune the days the nightly rollup rebuilds (yesterday and the day before): with a short
    // retention the cutoff would otherwise reach a day whose rollup has not run yet.
    const [oldestRolled] = rollupDays(now)
    const before = retentionCutoff < oldestRolled ? retentionCutoff : oldestRolled
```

`markEmailVerified` becomes `UPDATE … WHERE id = … AND email_verified_at IS NULL RETURNING id` and
returns `rows.length > 0`; `auth.verifyEmail` records `email_verified` only when it returns `true`
(drop the earlier `wasVerified` pre-read if it only fed that decision). Update the docs: with
`ANALYTICS_RETENTION_DAYS=1`, raw rows are effectively kept two days.

- [ ] **Step 4: Run** the analytics and auth tests, then the `apps/api` suite → PASS.

- [ ] **Step 5: Commit** — `fix(api): the analytics prune keeps the rollup's days, and email_verified is recorded once`

---

### Task 4: Realtime server edges

**Files:**
- Modify: `apps/api/src/server.ts` (~476-480, the `/events/workspaces/:workspaceId` route)
- Modify: `apps/api/src/realtime/stream.ts` (`perUser` at ~128, 228, 264, 299)
- Modify: `apps/api/src/realtime/postgres.ts` (~94-101)
- Test: `apps/api/src/realtime/*.test.ts` (find with `ls apps/api/src/realtime`)

- [ ] **Step 1: Failing tests**
  - Impersonation cap (Review Focus 5): user U has 10 streams open; admin A impersonating U opens an
    11th → allowed (counts against A); A's stream closing decrements A, and U still has 10. Use the
    stream module's test seam the existing cap tests use.
  - Postgres bus: `publish` after `close()` resolves (no throw), like the memory bus — test with the
    existing Postgres-bus test setup (skipped without `TEST_DATABASE_URL`, like its siblings).
  - Idle timeout: the route calls `server.timeout(req, 0)` before the stream handler runs, and
    restores the default (call `server.timeout(req, <Bun's default>)` — check the value the code or
    Bun documents; if the route cannot restore a specific value, call it only after a non-stream
    answer is known… see Step 2) when the answer is not a stream. Test through a fake `server`
    object recording `timeout` calls in order, if the route is reachable that way; otherwise
    extract the route body into a small exported function and test that.

- [ ] **Step 2: Implement**
  - `stream.ts`: key the per-user counter by `session.impersonated_by ?? user.id` at the check,
    the increment and the decrement (one `capKey` computed once per stream and captured by its
    `close`).
  - `postgres.ts`: `if (closed) return` (comment: matches the memory bus; `publishAfterCommit`
    would otherwise record a failure for every publish racing shutdown).
  - `server.ts`: turn the idle timeout off before awaiting the handler; if the result is not an
    event stream, restore Bun's idle timeout (`server.timeout(req, <idleTimeout configured on
    Bun.serve, or 10>)` — read the `Bun.serve({ idleTimeout })` call in this file for the value and
    use that constant).

- [ ] **Step 3: Run** the realtime tests and the `apps/api` suite → PASS.

- [ ] **Step 4: Commit** — `fix(api): realtime idle timeout, impersonation stream cap and a quiet closed bus`

---

### Task 5: `LiveNotes` stops reconnecting after a permanent refusal

**Files:**
- Modify: `apps/app/src/lib/realtime.ts` (pure helpers), `apps/app/src/components/live-notes.tsx`
- Modify: `packages/i18n/messages/en/app.json`, `packages/i18n/messages/sv/app.json`
- Test: `apps/app/src/lib/realtime.test.ts` (and a component test if one exists for `LiveNotes`)

**Interfaces:**
- Produces: `export type StreamRefusal = "signedOut" | "gone" | null` and
  `export function refusalFor(status: number): StreamRefusal` (`401` → `"signedOut"`, `404` →
  `"gone"`, anything else → `null`); `export async function probeStream(url: string, fetchImpl = fetch): Promise<number | null>`
  (GET the URL, read only the status, abort the body at once; `null` on a network error).

- [ ] **Step 1: Failing tests** for `refusalFor` (401, 404, 429, 502, 503, 200) and `probeStream`
  (a fake fetch returning a `Response` with a never-ending body: resolves with the status and the
  body is cancelled; a rejecting fetch → `null`).

- [ ] **Step 2: Implement** the helpers. In `LiveNotes`, where a `CLOSED` source is today
  recreated after the backoff: first `probeStream` the same URL; `refusalFor(status)` →
  `"signedOut"`: stop reconnecting and show `t("live.signedOut")` with a sign-in link (the same
  sign-in URL the header's `SignInLink` uses — pass it down from the server page as a prop);
  `"gone"`: stop and show `t("live.gone")`; `null` (including 429/5xx/network): today's backoff,
  unchanged. Strings (`app.json` under the existing realtime/live namespace — find it with
  `grep -n "Reconnecting" packages/i18n/messages/en/app.json`):
  - `signedOut`: "You've been signed out. Sign in to see live updates." / "Du har loggats ut. Logga in för att se uppdateringar direkt."
  - `gone`: "This workspace is no longer available." / "Den här arbetsytan är inte längre tillgänglig."
  - `signIn` (link): reuse an existing "Sign in" key if `app.json` has one.
  The status message uses the same polite live region "Reconnecting…" already uses.

- [ ] **Step 3: Run** `bun test apps/app`, the app i18n guard, `bun run --filter @repo/app typecheck`.

- [ ] **Step 4: Commit** — `fix(app): stop reconnecting live notes after a sign-out or a removed workspace`

---

### Task 6: Docs and full gate

**Files:**
- Modify: `CLAUDE.md` (**Storage**, **Jobs**/**Analytics**, **Realtime**, the SQLite note under **Jobs**),
  `apps/api/README.md`, `apps/app/README.md`, `docs/guides/storage.md`, `docs/guides/realtime.md`,
  `docs/guides/analytics.md` (if Task 3 did not already)

- [ ] **Step 1:** Update each doc where Tasks 1–5 changed behaviour, verifying every claim against
  the code: S3 `get` is one request and a missing/forbidden key is a 404 with a recorded failure for
  403; the SQLite gate's new behaviour (what happens when a transaction awaits an outside statement;
  `sql.transaction` gated; `file`/`reserve` refused; pragma failures logged); the analytics prune
  floor; `email_verified` recorded once; the realtime idle-timeout order, the impersonation cap and
  the Postgres bus after close; `LiveNotes`' permanent-refusal states.
- [ ] **Step 2:** `bun run ci` exits 0 (run it in the background and check back). Do **not** run e2e
  (the controller does).
- [ ] **Step 3: Commit** — `docs: S3 reads, the SQLite gate, analytics prune floor and realtime refusals`
