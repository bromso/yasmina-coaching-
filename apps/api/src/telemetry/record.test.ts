import { describe, expect, test } from "bun:test"
import type { ErrorRow } from "../queries/telemetry"
import { fingerprint } from "./fingerprint"
import { type RecordDeps, recordBatch, toErrorEvent } from "./record"

describe("toErrorEvent", () => {
  test("masks email addresses and long opaque tokens in the message", () => {
    const event = toErrorEvent(new Error("550 bob@example.com rejected"))
    expect(event.message).toBe("550 <email> rejected")
    expect(event.stack).not.toContain("bob@example.com")
    expect(toErrorEvent(new Error("bad token abcDEF123456789012345 for x")).message).toBe(
      "bad token <token> for x"
    )
    expect(toErrorEvent(new Error("Note 42 not found")).message).toBe("Note 42 not found")
  })

  test("masks only the stack's head; scoped-package frames survive and keep fingerprints apart", () => {
    const withFrame = (frame: string) => {
      const e = new Error("550 bob@example.com rejected")
      e.stack = `Error: 550 bob@example.com rejected\n    at ${frame}\n    at run (/app/src/x.ts:1:1)`
      return toErrorEvent(e)
    }
    const a = withFrame("send (/app/node_modules/@orpc/server/dist/index.js:10:5)")
    const b = withFrame("call (/app/node_modules/@orpc/client/dist/index.js:20:7)")
    expect(a.stack).toContain("node_modules/@orpc/server")
    expect(a.stack?.split("\n")[0]).toBe("Error: 550 <email> rejected")
    expect(a.stack).not.toContain("bob@example.com")
    expect(fingerprint("api", "server", a.message, a.stack)).not.toBe(
      fingerprint("api", "server", b.message, b.stack)
    )
    expect(toErrorEvent(new Error("Cannot find module '@repo/email'")).message).toBe(
      "Cannot find module '@repo/email'"
    )
  })

  test("keeps identifiers without digits; masks a long token that has digits", () => {
    expect(toErrorEvent(new Error("code ERR_INVALID_ARG_TYPE")).message).toBe(
      "code ERR_INVALID_ARG_TYPE"
    )
    const constraint = 'violates "memberships_workspace_id_user_id_key"'
    expect(toErrorEvent(new Error(constraint)).message).toBe(constraint)
    const token = "Qx7_kP2-vN9aR4tY8wZ1bC6dE3fG5hJ0mL2nS7uV9xA" // gitleaks:allow
    expect(token).toHaveLength(43)
    expect(toErrorEvent(new Error(`bad ${token}`)).message).toBe("bad <token>")
  })
})

describe("recordBatch", () => {
  test("the store provider (keyless) queues no telemetry.forward job for a new row", async () => {
    let enqueued = 0
    const deps: RecordDeps = {
      db: {
        telemetry: {
          upsertError: async () => ({ row: { id: 1 } as ErrorRow, created: true }),
          insertVitals: async () => {},
        } as unknown as RecordDeps["db"]["telemetry"],
      },
      provider: { kind: "store", onNewError: async () => {} },
      enqueue: (async () => {
        enqueued++
        return 1
      }) as RecordDeps["enqueue"],
      log: () => {},
    }
    await recordBatch(deps, {
      app: "app",
      errors: [{ kind: "boundary", message: "x" }],
      vitals: [],
    })
    expect(enqueued).toBe(0)
  })

  test("a non-store provider queues telemetry.forward only for newly created rows", async () => {
    const enqueuedIds: number[] = []
    let created = true
    const deps: RecordDeps = {
      db: {
        telemetry: {
          upsertError: async () => {
            const row = { id: created ? 1 : 2 } as ErrorRow
            const wasCreated = created
            created = false
            return { row, created: wasCreated }
          },
          insertVitals: async () => {},
        } as unknown as RecordDeps["db"]["telemetry"],
      },
      provider: { kind: "sentry", onNewError: async () => {} },
      enqueue: (async (_def, payload: { errorId: number }) => {
        enqueuedIds.push(payload.errorId)
        return payload.errorId
      }) as RecordDeps["enqueue"],
      log: () => {},
    }
    const batch = {
      app: "app" as const,
      errors: [{ kind: "boundary" as const, message: "x" }],
      vitals: [],
    }
    await recordBatch(deps, batch)
    await recordBatch(deps, batch)
    expect(enqueuedIds).toEqual([1])
  })
})
