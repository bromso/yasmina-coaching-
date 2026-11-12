import { AsyncLocalStorage } from "node:async_hooks"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { createLogger, type Logger } from "@repo/log"
import { SQL } from "bun"
import { dialectOf } from "./dialect"
import { migrate } from "./migrate"
import { migrations } from "./migrations"
import { adminQueries } from "./queries/admin"
import { analyticsQueries } from "./queries/analytics"
import { apiKeysQueries } from "./queries/api-keys"
import { applicationsQueries } from "./queries/applications"
import { auditQueries } from "./queries/audit"
import { billingQueries } from "./queries/billing"
import { bookingQueries } from "./queries/booking"
import { exportsQueries } from "./queries/exports"
import { identitiesQueries } from "./queries/identities"
import { invitationsQueries } from "./queries/invitations"
import { jobsQueries } from "./queries/jobs"
import { leadsQueries } from "./queries/leads"
import { membershipsQueries } from "./queries/memberships"
import { notesQueries } from "./queries/notes"
import { notificationPreferencesQueries } from "./queries/notification-preferences"
import { notificationsQueries } from "./queries/notifications"
import { passkeysQueries } from "./queries/passkeys"
import { sessionsQueries } from "./queries/sessions"
import { supportQueries } from "./queries/support"
import { telemetryQueries } from "./queries/telemetry"
import { tokensQueries } from "./queries/tokens"
import { twoFactorQueries } from "./queries/two-factor"
import { usersQueries } from "./queries/users"
import { waitlistQueries } from "./queries/waitlist"
import { webhooksQueries } from "./queries/webhooks"
import { workspacesQueries } from "./queries/workspaces"

/**
 * Runs `fn` once the writes made so far are durable. On the pool every statement commits as it
 * resolves, so it runs at once; on a transaction's queries it waits for the commit and never runs
 * when the transaction rolls back. For fire-and-forget side effects that must not outlive a
 * rollback (a realtime publish). A throw is logged and swallowed: the change has committed.
 * It belongs to the `db.transaction` that built the queries — never nest one `db.transaction`
 * inside another (on SQLite the inner one's callbacks would run at its own end, before the outer
 * commit); no caller does.
 */
export type AfterCommit = (fn: () => void) => void

const runNow: AfterCommit = (fn) => fn()

/** The query helpers, bound to the pool or to one transaction. */
function queries(sql: SQL, afterCommit: AfterCommit = runNow) {
  return {
    afterCommit,
    notes: notesQueries(sql),
    users: usersQueries(sql),
    sessions: sessionsQueries(sql),
    tokens: tokensQueries(sql),
    identities: identitiesQueries(sql),
    waitlist: waitlistQueries(sql),
    workspaces: workspacesQueries(sql),
    memberships: membershipsQueries(sql),
    invitations: invitationsQueries(sql),
    billing: billingQueries(sql),
    audit: auditQueries(sql),
    admin: adminQueries(sql),
    telemetry: telemetryQueries(sql),
    twoFactor: twoFactorQueries(sql),
    jobs: jobsQueries(sql),
    analytics: analyticsQueries(sql),
    exports: exportsQueries(sql),
    support: supportQueries(sql),
    applications: applicationsQueries(sql),
    leads: leadsQueries(sql),
    passkeys: passkeysQueries(sql),
    apiKeys: apiKeysQueries(sql),
    webhooks: webhooksQueries(sql),
    notifications: notificationsQueries(sql),
    notificationPreferences: notificationPreferencesQueries(sql),
    booking: bookingQueries(sql),
  }
}

export type Queries = ReturnType<typeof queries>

/** How long a SQLite connection waits for another process's write lock before SQLITE_BUSY. */
export const SQLITE_BUSY_TIMEOUT_MS = 5_000

/**
 * How long a request queued behind an open SQLite transaction may wait while that transaction runs
 * no statement before it fails. Distinct from `SQLITE_BUSY_TIMEOUT_MS`: this bounds a cycle (the
 * transaction awaiting a statement queued behind it), not slowness — a transaction that keeps
 * running statements, however long, never trips it.
 */
export const SQLITE_GATE_WAIT_MS = 30_000

type Waiter = {
  exclusive: boolean
  grant: () => void
  fail: (error: Error) => void
  queuedAt: number
  timer?: ReturnType<typeof setTimeout>
}

/** The exclusive holder being watched: its callback is running, last active at `last`. */
type Watched = { last: number }

/**
 * A shared/exclusive lock, FIFO: shared holders run together, an exclusive holder runs alone, and
 * a queued exclusive request holds back shared requests that arrive after it (no starvation).
 * State changes synchronously on acquire, so a holder granted the lock owns it before its first
 * `await`.
 *
 * Waits are unbounded except behind a *watched* exclusive holder — a transaction whose callback is
 * running (`watch()`, kept alive by `touch()` on each of its statements). A queued request fails
 * with `timeout()` once it has waited `waitMs` *and* that holder has run nothing for `waitMs`: the
 * signature of a cycle, where the holder awaits a request queued behind it. Nothing is armed behind
 * an unwatched holder (the pragma run, a transaction still in BEGIN IMMEDIATE) or a shared one.
 */
class SharedExclusiveLock {
  private shared = 0
  private exclusive = false
  private watched: Watched | null = null
  private readonly queue: Waiter[] = []

  constructor(
    private readonly waitMs = Number.POSITIVE_INFINITY,
    private readonly timeout: (exclusive: boolean) => Error = () => new Error("lock wait timed out")
  ) {}

  async run<T>(exclusive: boolean, fn: () => PromiseLike<T>): Promise<T> {
    await this.acquire(exclusive)
    try {
      return await fn()
    } finally {
      if (exclusive) this.exclusive = false
      else this.shared--
      this.drain()
    }
  }

  /** Called by the exclusive holder when its own work starts; `end()` before it releases. */
  watch(): { touch: () => void; end: () => void } {
    const watched: Watched = { last: performance.now() }
    this.watched = watched
    for (const waiter of this.queue) this.arm(waiter)
    return {
      touch: () => {
        watched.last = performance.now()
      },
      end: () => {
        if (this.watched !== watched) return
        this.watched = null
        for (const waiter of this.queue) clearTimeout(waiter.timer)
      },
    }
  }

  private acquire(exclusive: boolean): Promise<void> {
    if (this.queue.length === 0 && this.free(exclusive)) {
      this.take(exclusive)
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        exclusive,
        grant: resolve,
        fail: reject,
        queuedAt: performance.now(),
      }
      this.queue.push(waiter)
      this.arm(waiter)
    })
  }

  /** Schedules `waiter`'s check for its deadline behind the watched holder, if there is one. */
  private arm(waiter: Waiter) {
    clearTimeout(waiter.timer)
    if (!this.watched || !Number.isFinite(this.waitMs)) return
    const deadline = Math.max(waiter.queuedAt, this.watched.last) + this.waitMs
    waiter.timer = setTimeout(() => this.check(waiter), Math.max(0, deadline - performance.now()))
  }

  private check(waiter: Waiter) {
    const at = this.queue.indexOf(waiter)
    if (at === -1 || !this.watched) return
    const deadline = Math.max(waiter.queuedAt, this.watched.last) + this.waitMs
    // The holder ran a statement since this was armed: not stuck, look again later.
    if (performance.now() < deadline) return this.arm(waiter)
    this.queue.splice(at, 1)
    // Leaving may unblock the requests behind it (a shared one behind this exclusive).
    this.drain()
    waiter.fail(this.timeout(waiter.exclusive))
  }

  private free(exclusive: boolean) {
    return !this.exclusive && (!exclusive || this.shared === 0)
  }

  private take(exclusive: boolean) {
    if (exclusive) this.exclusive = true
    else this.shared++
  }

  private drain() {
    while (this.queue[0] && this.free(this.queue[0].exclusive)) {
      const next = this.queue.shift() as Waiter
      clearTimeout(next.timer)
      this.take(next.exclusive)
      next.grant()
      if (next.exclusive) return
    }
  }
}

/** Calls that would bypass the gate on the serialised SQLite client. */
const UNSUPPORTED = new Set(["file", "reserve", "beginDistributed", "distributed"])

/** The message a request gets when it waited `waitMs` behind an open transaction that ran nothing. */
export function gateTimeoutMessage(exclusive: boolean, waitMs = SQLITE_GATE_WAIT_MS) {
  const what = exclusive ? "a transaction" : "a statement"
  return (
    `db: ${what} waited ${waitMs} ms behind an open SQLite transaction that ran no statement ` +
    "meanwhile — if that transaction awaits this one, it is a deadlock: run it on `tx`, or " +
    "await it before the transaction starts"
  )
}

const isTemplate = (value: unknown) => Array.isArray(value) && "raw" in value

/**
 * Replaces a lazy query's `then` (it runs when first awaited) with `around(run)`, and points its
 * `catch` and `finally` at that `then`. The query object
 * itself is returned, not a promise, because a tagged-template call may also be a fragment embedded
 * in another query (`sql\`… ${fragment}\``), which is never awaited.
 */
function wrapThen<Q extends PromiseLike<unknown>>(
  query: Q,
  around: (run: () => Promise<unknown>) => Promise<unknown>
): Q {
  const then = query.then
  const run = () => new Promise((ok, fail) => then.call(query, ok, fail))
  // biome-ignore lint/suspicious/noThenProperty: replaces the query's own `then` so awaiting it goes through `around`
  Object.defineProperty(query, "then", {
    configurable: true,
    writable: true,
    value(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return around(run).then(onFulfilled, onRejected)
    },
  })
  // Bun's own `catch` and `finally` start the query directly, skipping `then`: route both through it.
  Object.defineProperty(query, "catch", {
    configurable: true,
    writable: true,
    value(onRejected?: (reason: unknown) => unknown) {
      return query.then(undefined, onRejected)
    },
  })
  Object.defineProperty(query, "finally", {
    configurable: true,
    writable: true,
    value(onFinally?: () => unknown) {
      // Inside `sql.begin`, Bun calls `finally` on every statement and drops what it returns: a
      // failing statement would leave that promise rejected with no handler — an unhandled
      // rejection, which exits a Bun process. Marking it handled here loses nothing: the caller
      // that awaits the returned promise (or the query) still gets the rejection.
      const settled = Promise.resolve(query).finally(onFinally)
      settled.catch(() => {})
      return settled
    },
  })
  return query
}

/** `tx`, with every statement on it (and on its savepoints) reporting to `touch` as it runs. */
function trackActivity(tx: SQL, touch: () => void): SQL {
  const around = (run: () => Promise<unknown>) => {
    touch()
    return run().finally(touch)
  }
  return new Proxy(tx, {
    apply(target, thisArg, args: unknown[]) {
      const result = Reflect.apply(target, thisArg, args)
      return isTemplate(args[0]) ? wrapThen(result as PromiseLike<unknown>, around) : result
    },
    get(target, prop) {
      if (prop === "unsafe") {
        return (...args: Parameters<SQL["unsafe"]>) => wrapThen(target.unsafe(...args), around)
      }
      if (prop === "savepoint") {
        return (...args: unknown[]) => {
          const fn = args.at(-1) as (sp: SQL) => Promise<unknown>
          // `savepoint` exists on a transaction's SQL only, which the `SQL` type does not show.
          const { savepoint } = target as unknown as {
            savepoint: (...args: unknown[]) => Promise<unknown>
          }
          return savepoint.call(target, ...args.slice(0, -1), (sp: SQL) =>
            fn(trackActivity(sp, touch))
          )
        }
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

/**
 * SQLite only. Bun's SQL holds one connection to a SQLite file, and `sql.begin` runs on it: a
 * statement issued outside the transaction while it is open runs *inside* it, and is rolled back
 * with it (a worker's claim or succeed reverted, an enqueue lost while its request answered 200).
 * This wraps the pool-bound tag so a transaction holds an exclusive lock for its whole duration
 * and every other statement takes a shared one: outside statements wait for the transaction to
 * end instead of joining it. Statements on `tx` are never gated. A pool statement issued from
 * inside a transaction's own callback (its async context) passes straight through, as before,
 * rather than deadlocking on the lock its own transaction holds. Transactions also start with
 * `BEGIN IMMEDIATE`, so a second process on the same file waits (busy timeout) at BEGIN instead of
 * failing with SQLITE_BUSY when a read-then-write transaction tries to upgrade its lock.
 *
 * A transaction asks for the lock on the next macrotask, not synchronously: awaiting a query
 * calls its `then` one microtask later, so a statement started just before `db.transaction`
 * (`const p = db.jobs.counts(); await db.transaction(async () => … await p)`) would otherwise queue
 * behind the transaction that awaits it. Deferring lets every statement already started on this
 * turn take its shared lock first and run *before* the transaction, never inside it. What remains
 * — a transaction awaiting a statement issued outside it after it opened — is a real cycle. Once
 * the transaction's callback is running, its statements keep it alive; a request queued behind it
 * that has waited `SQLITE_GATE_WAIT_MS` while it ran nothing fails with `gateTimeoutMessage`
 * instead of hanging. Waits behind the pragma run or a BEGIN IMMEDIATE still waiting for another
 * process are never bounded here (the busy timeout bounds the latter).
 *
 * `transaction` is `begin`. `file`, `reserve` and the distributed-transaction calls are refused:
 * none of them goes through the gate. Exported for tests, which also shorten `waitMs`.
 */
export function serialiseSqlite(
  sql: SQL,
  ready: Promise<void>,
  waitMs = SQLITE_GATE_WAIT_MS,
  onPragmaError: (error: unknown) => void = reportPragmaError
): SQL {
  const lock = new SharedExclusiveLock(
    waitMs,
    (exclusive) => new Error(gateTimeoutMessage(exclusive, waitMs))
  )
  const inTransaction = new AsyncLocalStorage<{ open: boolean; touch: () => void }>()
  // Nothing runs until the connection's pragmas are set. A failure is reported, never thrown at
  // import: the statements behind it then run on Bun's defaults (no busy timeout, no WAL).
  lock.run(true, () => ready).catch(onPragmaError)

  const open = () => {
    const store = inTransaction.getStore()
    return store?.open === true ? store : undefined
  }

  // Awaiting a pool statement waits on the shared lock — or, from inside a transaction's own
  // callback, runs at once and counts as that transaction's activity.
  const gate = <Q extends PromiseLike<unknown>>(query: Q): Q =>
    wrapThen(query, (run) => {
      const store = open()
      if (!store) return lock.run(false, run)
      store.touch()
      return run().finally(store.touch)
    })

  const begin = (...args: unknown[]) => {
    const fn = args.at(-1) as (tx: SQL) => Promise<unknown>
    const options = args.length > 1 ? args[0] : "IMMEDIATE"
    const outer = open()
    // Nested in an open transaction's callback: no lock (its own transaction holds it), and its
    // activity keeps the outer transaction's watch alive.
    if (outer) {
      return sql.begin(options as string, (tx) => {
        const state = { open: true, touch: outer.touch }
        return inTransaction
          .run(state, () => fn(trackActivity(tx, outer.touch)))
          .finally(() => {
            state.open = false
          })
      })
    }
    const start = () =>
      sql.begin(options as string, (tx) => {
        // BEGIN IMMEDIATE has returned: from here on, waits behind this transaction are watched.
        const watch = lock.watch()
        const state = { open: true, touch: watch.touch }
        return inTransaction
          .run(state, () => fn(trackActivity(tx, watch.touch)))
          .finally(() => {
            state.open = false
            watch.end()
          })
      })
    return new Promise<void>((resolve) => setImmediate(resolve)).then(() => lock.run(true, start))
  }

  const unsupported = (name: string) => () => {
    throw new Error(`sql.${name} is not supported on the serialised SQLite client`)
  }

  return new Proxy(sql, {
    apply(target, thisArg, args: unknown[]) {
      const first = args[0]
      // A tagged-template call is a statement; `sql(values)` builds a fragment for one.
      if (isTemplate(first)) {
        return gate(Reflect.apply(target, thisArg, args) as PromiseLike<unknown>)
      }
      return Reflect.apply(target, thisArg, args)
    },
    get(target, prop) {
      if (prop === "begin" || prop === "transaction") return begin
      if (typeof prop === "string" && UNSUPPORTED.has(prop)) return unsupported(prop)
      if (prop === "unsafe") {
        return (...args: Parameters<SQL["unsafe"]>) => gate(target.unsafe(...args))
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

/**
 * Test-only (`API_TEST_QUERY_DELAY_MS`, apps/load's slow-query drill): `sql`, with every statement
 * waiting `delayMs` before it runs — pool statements, statements on a transaction's `tx` and on
 * its savepoints, tagged or `unsafe`. Engine-agnostic: on SQLite it wraps the *gated* client, so
 * a pool statement sleeps first and only then queues for its shared lock (the gate's ordering and
 * its watch are unchanged; a transaction's statements still touch the watch as they run), and a
 * transaction is still `begin` on the gate. Fragments (`sql(values)`, or a template embedded in
 * another query) are never awaited and so never delayed. `createDb` applies it only when the env
 * parsed a positive delay, which `loadEnv` never does in production. Exported for tests.
 */
export function delayStatements(sql: SQL, delayMs: number): SQL {
  const around = (run: () => Promise<unknown>) => Bun.sleep(delayMs).then(run)
  return new Proxy(sql, {
    apply(target, thisArg, args: unknown[]) {
      const result = Reflect.apply(target, thisArg, args)
      return isTemplate(args[0]) ? wrapThen(result as PromiseLike<unknown>, around) : result
    },
    get(target, prop) {
      if (prop === "unsafe") {
        return (...args: Parameters<SQL["unsafe"]>) => wrapThen(target.unsafe(...args), around)
      }
      if (prop === "begin" || prop === "transaction" || prop === "savepoint") {
        const method = Reflect.get(target, prop, target) as unknown
        // `savepoint` exists on a transaction's SQL only.
        if (typeof method !== "function") return method
        return (...args: unknown[]) => {
          const fn = args.at(-1) as (tx: SQL) => Promise<unknown>
          return method.call(target, ...args.slice(0, -1), (tx: SQL) =>
            fn(delayStatements(tx, delayMs))
          )
        }
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

// Without a caller's logger (tests, scripts), one is made only when it is needed, so importing
// this module never creates a logger (and never repeats an invalid-LOG_LEVEL warning).
const reportPragmaError = (error: unknown) =>
  createLogger({ service: "api" }).error("SQLite pragmas failed", { error })

/**
 * Thin data layer over Bun's native SQL client. The tagged template parameterises every
 * interpolation, so values never reach the query text.
 */
export function createDb(
  url: string,
  options: {
    logger?: Logger
    /** Test-only: every statement waits this long first (see `delayStatements`). 0 = off. */
    queryDelayMs?: number
  } = {}
) {
  const { logger, queryDelayMs = 0 } = options
  const file = url.match(/^sqlite:\/\/(?!:memory:)(.+)$/)?.[1]
  // SQLite creates the file but not its directory.
  if (file) mkdirSync(dirname(file), { recursive: true })

  const raw = new SQL(url)
  // Fail at startup, not on the first query, for an engine without tested DDL.
  let dialect: ReturnType<typeof dialectOf>
  try {
    dialect = dialectOf(raw)
  } catch (error) {
    void raw.close()
    throw error
  }

  // Bun opens SQLite with busy_timeout 0 and the rollback journal: a second process on the same
  // file (an api and a dedicated worker) would fail with "database is locked" on any overlap. WAL
  // lets readers and one writer overlap; the busy timeout makes writers queue. `:memory:` has no
  // WAL (and no second process).
  const engine =
    dialect === "sqlite"
      ? serialiseSqlite(
          raw,
          (async () => {
            await raw.unsafe(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`)
            if (file) await raw.unsafe("PRAGMA journal_mode = WAL")
          })(),
          SQLITE_GATE_WAIT_MS,
          logger ? (error) => logger.error("SQLite pragmas failed", { error }) : reportPragmaError
        )
      : raw
  // Migrations run undelayed, so a slowed stack still starts within its readiness timeout.
  const sql = queryDelayMs > 0 ? delayStatements(engine, queryDelayMs) : engine
  const reportAfterCommitError = (error: unknown) =>
    (logger ?? createLogger({ service: "api" })).error("db: an after-commit callback threw", {
      error,
    })

  return {
    /** The engine Bun.sql picked from `url` — lets a caller branch without its own probe. */
    dialect,
    /**
     * The client itself (gated on SQLite, like every helper). For code that must read or write
     * every table generically — the backup's dump and restore — never for product queries.
     */
    sql,
    /**
     * A file-backed SQLite database's path (null for `:memory:` and Postgres): the backup dumps
     * through its own read-only connection to it, outside this connection's gate.
     */
    sqliteFile: file ?? null,
    /** Applies the migrations in src/migrations/ that this database has not seen. */
    migrate: () => migrate(engine, migrations),
    ...queries(sql),

    /**
     * Runs `fn` with the query helpers bound to one transaction: all of it commits, or none. What
     * `fn` hands to `tx.afterCommit` runs once the commit has resolved, in order, and is dropped on
     * a rollback.
     */
    transaction: async <T>(fn: (tx: Queries) => Promise<T>): Promise<T> => {
      const committed: Array<() => void> = []
      const result = (await sql.begin((tx) =>
        fn(queries(tx, (callback) => committed.push(callback)))
      )) as T
      // The change has committed: a callback that throws is logged, never skips the ones after
      // it and never turns the committed transaction into a failure.
      for (const callback of committed) {
        try {
          callback()
        } catch (error) {
          reportAfterCommitError(error)
        }
      }
      return result
    },

    /** Readiness probe: throws when the database does not answer. */
    async ping() {
      await sql`SELECT 1`
    },

    close: () => raw.close(),
  }
}

export type Db = ReturnType<typeof createDb>
