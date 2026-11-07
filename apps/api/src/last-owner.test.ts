import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/server"
import { DELETION_GRACE_MS } from "@repo/api-contract"
import { purgeUser } from "./jobs/builtin/privacy"
import { signUpVerified, signUpWithWorkspace, start } from "./test-server"
import { removeMemberInTx, setRoleInTx } from "./workspaces"

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start()
})
afterAll(async () => {
  await app.stop()
})

/**
 * A pause for `parties` transactions: each call waits until all of them have arrived, or until
 * `timeoutMs` after the first arrival. With the workspace-row lock the second transaction blocks
 * before its check and never arrives while the first is open, so the timeout lets the first go on.
 */
function barrier(parties: number, timeoutMs = 300) {
  let arrived = 0
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return async () => {
    arrived += 1
    if (arrived >= parties) release()
    else setTimeout(release, timeoutMs)
    await gate
  }
}

/** A workspace owned by A and B, with C as a plain member so it stays shared. */
async function coOwned() {
  const a = await signUpWithWorkspace(app)
  const b = await signUpVerified(app)
  const c = await signUpVerified(app)
  await app.db.memberships.add({ workspaceId: a.workspaceId, userId: b.user.id, role: "owner" })
  await app.db.memberships.add({ workspaceId: a.workspaceId, userId: c.user.id, role: "member" })
  return { a, b, workspaceId: a.workspaceId }
}

const isConflict = (result: PromiseSettledResult<unknown>) =>
  result.status === "rejected" &&
  result.reason instanceof ORPCError &&
  result.reason.code === "CONFLICT"

describe("workspaces.lockForOwnership", () => {
  test("true for an existing workspace, false for a missing one", async () => {
    const { workspaceId } = await signUpWithWorkspace(app)
    expect(await app.db.transaction((tx) => tx.workspaces.lockForOwnership(workspaceId))).toBe(true)
    expect(await app.db.workspaces.lockForOwnership(workspaceId + 1_000_000)).toBe(false)
  })
})

// SQLite has one writer at a time (BEGIN IMMEDIATE), so there is no overlap to race there.
describe.skipIf(!Bun.env.TEST_DATABASE_URL)("last owner under concurrency (Postgres)", () => {
  test("two co-owners leaving at once: one leaves, the other gets CONFLICT", async () => {
    const { a, b, workspaceId } = await coOwned()
    const pause = barrier(2)
    const results = await Promise.allSettled(
      [a.user.id, b.user.id].map((userId) =>
        app.db.transaction((tx) =>
          removeMemberInTx(tx, workspaceId, userId, "en", { afterCheck: pause })
        )
      )
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(isConflict)).toHaveLength(1)
    expect(await app.db.memberships.ownerCount(workspaceId)).toBe(1)
  })

  test("B demoting A while B leaves: the workspace keeps an owner", async () => {
    const { a, b, workspaceId } = await coOwned()
    const pause = barrier(2)
    const results = await Promise.allSettled([
      app.db.transaction((tx) =>
        setRoleInTx(tx, workspaceId, a.user.id, "admin", "en", { afterCheck: pause })
      ),
      app.db.transaction((tx) =>
        removeMemberInTx(tx, workspaceId, b.user.id, "en", { afterCheck: pause })
      ),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(results.filter(isConflict)).toHaveLength(1)
    expect(await app.db.memberships.ownerCount(workspaceId)).toBe(1)
  })

  test("purging co-owner A while B leaves: the workspace keeps an owner", async () => {
    const { a, b, workspaceId } = await coOwned()
    await a.client.account.delete({ email: a.email })
    const pause = barrier(2)
    const failures: string[] = []
    const [purge, leave] = await Promise.allSettled([
      purgeUser(
        a.user.id,
        new Date(Date.now() + DELETION_GRACE_MS + 60_000).toISOString(),
        {
          db: app.db,
          billing: app.billing,
          enqueue: app.enqueue,
          recordFailure: (message) => failures.push(message),
        },
        { beforePurge: pause }
      ),
      app.db.transaction((tx) =>
        removeMemberInTx(tx, workspaceId, b.user.id, "en", { afterCheck: pause })
      ),
    ])
    if (purge?.status !== "fulfilled") throw purge?.reason
    // Either the purge went first and B's leave was refused, or B left first and the purge was
    // skipped (A had become the sole owner of a shared workspace). Never "ownerless": that is the
    // re-count safety net catching a leave that raced past the lock.
    if (purge.value.purged) {
      expect(isConflict(leave as PromiseSettledResult<unknown>)).toBe(true)
    } else {
      expect(leave?.status).toBe("fulfilled")
      expect(purge.value.reason).toBe("sole owner")
    }
    expect(await app.db.memberships.ownerCount(workspaceId)).toBe(1)
  })
})
