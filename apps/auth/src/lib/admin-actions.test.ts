import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  JOB_RETRY_CONFLICT_MESSAGE,
  type Me,
  SELF_REMOVE_PASSKEYS_MESSAGE,
  SELF_SUSPEND_MESSAGE,
  SUPERADMIN_REMOVE_PASSKEYS_MESSAGE,
  SUPERADMIN_RESET_MESSAGE,
  SUPERADMIN_SUSPEND_MESSAGE,
  SUPERADMIN_TARGET_MESSAGE,
  SUSPEND_UNTIL_INVALID_MESSAGE,
  SUSPENDED_TARGET_MESSAGE,
} from "@repo/api-contract"
import { suspendUntilBounds } from "./admin"
import {
  discardJobCore,
  type ImpersonateDeps,
  impersonateCore,
  type JobActionDeps,
  type RemovePasskeysDeps,
  type ResetTwoFactorDeps,
  removePasskeysCore,
  resetTwoFactorCore,
  retryJobCore,
  revokeSessionsCore,
  type StopDeps,
  type SuspendDeps,
  shouldStop,
  stopImpersonationCore,
  suspendUserCore,
  type UnsuspendDeps,
  unsuspendUserCore,
  untilFromDateInput,
} from "./admin-actions"

// Unknown failures are logged; keep the output clean and assert on what was logged instead.
let logged: Mock<typeof console.error>
beforeEach(() => {
  logged = spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => logged.mockRestore())

const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const user = {
  id: 9,
  email: "ada@example.com",
  name: "Ada",
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerified: true,
  hasPassword: true,
  superadmin: false,
  avatarUrl: null,
  locale: "en" as const,
  deletionScheduledAt: null,
  passkeys: 0,
  twoFactorSatisfied: false,
}

function impersonateDeps(impersonate: ImpersonateDeps["api"]["users"]["impersonate"]) {
  const started: Array<{ token: string; expiresAt: string }> = []
  const d: ImpersonateDeps & { started: typeof started } = {
    api: { users: { impersonate, revokeSessions: async () => ({ ok: true }) } },
    startImpersonation: async (s) => {
      started.push(s)
    },
    appUrl: "http://app.brand.localhost:3001",
    client: { userAgent: "UA", ip: "203.0.113.9" },
    started,
  }
  return d
}

describe("impersonateCore", () => {
  test("a valid reason starts the impersonation and redirects to the app's notes", async () => {
    let seen: unknown
    const d = impersonateDeps(async (input) => {
      seen = input
      return { token: "imp", expiresAt: "2026-06-01T13:00:00.000Z", user }
    })
    const out = await impersonateCore(d, form({ userId: "9", reason: "  ticket #12 " }))
    expect(out).toEqual({ redirectTo: "http://app.brand.localhost:3001/notes" })
    expect(seen).toEqual({
      id: 9,
      reason: "ticket #12",
      client: { userAgent: "UA", ip: "203.0.113.9" },
    })
    expect(d.started).toEqual([{ token: "imp", expiresAt: "2026-06-01T13:00:00.000Z" }])
  })

  test("a short reason is a field error and never calls the api", async () => {
    let called = false
    const d = impersonateDeps(async () => {
      called = true
      throw new Error("unreachable")
    })
    const out = await impersonateCore(d, form({ userId: "9", reason: "ab" }))
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { reason: expect.any(String) },
      values: { reason: "ab" },
    })
    expect(called).toBe(false)
  })

  test("api refusals are shown verbatim; an unknown failure is 'unavailable'", async () => {
    const forbidden = impersonateDeps(async () => {
      throw defined("FORBIDDEN", SUPERADMIN_TARGET_MESSAGE)
    })
    expect(await impersonateCore(forbidden, form({ userId: "9", reason: "ticket" }))).toMatchObject(
      { ok: false, message: SUPERADMIN_TARGET_MESSAGE }
    )
    const suspended = impersonateDeps(async () => {
      throw defined("FORBIDDEN", SUSPENDED_TARGET_MESSAGE)
    })
    expect(await impersonateCore(suspended, form({ userId: "9", reason: "ticket" }))).toMatchObject(
      { ok: false, message: SUSPENDED_TARGET_MESSAGE }
    )
    const limited = impersonateDeps(async () => {
      throw defined("TOO_MANY_REQUESTS", "Too many impersonations, try again later")
    })
    expect(await impersonateCore(limited, form({ userId: "9", reason: "ticket" }))).toMatchObject({
      ok: false,
      message: "Too many impersonations, try again later",
    })
    const down = impersonateDeps(async () => {
      throw new TypeError("fetch failed")
    })
    const out = await impersonateCore(down, form({ userId: "9", reason: "ticket" }))
    expect(out).toMatchObject({ ok: false })
    expect((out as { message?: string }).message).toMatch(/unavailable/)
    expect(logged).toHaveBeenCalledTimes(1)
  })

  test("an undeclared NOT_FOUND (a revoked superadmin) is 'Not found', not 'unavailable'", async () => {
    const revoked = impersonateDeps(async () => {
      throw new ORPCError("NOT_FOUND", { message: "Not found" })
    })
    expect(await impersonateCore(revoked, form({ userId: "9", reason: "ticket" }))).toMatchObject({
      ok: false,
      message: "Not found",
    })
    expect(logged).not.toHaveBeenCalled()
  })
})

describe("stopImpersonationCore", () => {
  const stopDeps = (over: Partial<StopDeps>): StopDeps & { calls: string[] } => {
    const calls: string[] = []
    return {
      api: {
        stopImpersonation: async () => {
          calls.push("stop")
          return { ok: true }
        },
      },
      endImpersonation: async () => {
        calls.push("end")
        return true
      },
      impersonatedUserId: 9,
      calls,
      ...over,
    }
  }

  test("revokes the impersonation session, restores the admin, returns to the user's page", async () => {
    const d = stopDeps({})
    expect(await stopImpersonationCore(d)).toEqual({ redirectTo: "/admin/users/9" })
    expect(d.calls).toEqual(["stop", "end"])
  })

  test("a NOT_FOUND from the api (already stopped) still restores the admin", async () => {
    const d = stopDeps({
      api: {
        stopImpersonation: async () => {
          throw defined("NOT_FOUND", "Not found")
        },
      },
    })
    expect(await stopImpersonationCore(d)).toEqual({ redirectTo: "/admin/users/9" })
    expect(logged).not.toHaveBeenCalled()
  })

  test("without a parked admin token the browser is signed out", async () => {
    const d = stopDeps({ endImpersonation: async () => false })
    expect(await stopImpersonationCore(d)).toEqual({ redirectTo: "/login?signedout=1" })
  })

  test("an unreachable api still ends the impersonation in the browser", async () => {
    const d = stopDeps({
      api: {
        stopImpersonation: async () => {
          throw new TypeError("fetch failed")
        },
      },
      impersonatedUserId: null,
    })
    expect(await stopImpersonationCore(d)).toEqual({ redirectTo: "/admin" })
    expect(logged).toHaveBeenCalledTimes(1)
  })
})

describe("revokeSessionsCore", () => {
  const unused = async (): Promise<never> => {
    throw new Error("unused")
  }

  test("confirms, calls the api, reports", async () => {
    let revoked: unknown
    const out = await revokeSessionsCore(
      {
        api: {
          users: {
            revokeSessions: async (input) => {
              revoked = input
              return { ok: true }
            },
            impersonate: unused,
          },
        },
      },
      form({ userId: "9", confirm: "yes" })
    )
    expect(out).toEqual({ ok: true, message: "Signed out everywhere." })
    expect(revoked).toEqual({ id: 9 })
  })

  test("without confirmation nothing is called", async () => {
    const out = await revokeSessionsCore(
      {
        api: {
          users: {
            revokeSessions: async () => {
              throw new Error("unreachable")
            },
            impersonate: unused,
          },
        },
      },
      form({ userId: "9" })
    )
    expect(out).toMatchObject({ ok: false, message: "Tick the box to confirm." })
  })

  test("an undeclared NOT_FOUND (a revoked superadmin) is 'Not found', not 'unavailable'", async () => {
    const out = await revokeSessionsCore(
      {
        api: {
          users: {
            revokeSessions: async () => {
              throw new ORPCError("NOT_FOUND", { message: "Not found" })
            },
            impersonate: unused,
          },
        },
      },
      form({ userId: "9", confirm: "yes" })
    )
    expect(out).toEqual({ ok: false, message: "Not found" })
    expect(logged).not.toHaveBeenCalled()
  })
})

describe("resetTwoFactorCore", () => {
  const resetDeps = (
    resetTwoFactor: ResetTwoFactorDeps["api"]["users"]["resetTwoFactor"]
  ): ResetTwoFactorDeps => ({ api: { users: { resetTwoFactor } } })

  test("a valid reason calls the api and reports", async () => {
    let seen: unknown
    const d = resetDeps(async (input) => {
      seen = input
      return { ok: true }
    })
    const out = await resetTwoFactorCore(d, form({ userId: "9", reason: "  lost phone  " }))
    expect(out).toEqual({
      ok: true,
      message: "Two-step verification turned off; the user is signed out everywhere.",
    })
    expect(seen).toEqual({ userId: 9, reason: "lost phone" })
  })

  test("a short reason is a field error and never calls the api", async () => {
    let called = false
    const d = resetDeps(async () => {
      called = true
      return { ok: true }
    })
    const out = await resetTwoFactorCore(d, form({ userId: "9", reason: "ab" }))
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { reason: expect.any(String) },
      values: { reason: "ab" },
    })
    expect(called).toBe(false)
  })

  test("the api's self/superadmin refusal and the no-2FA conflict are shown verbatim", async () => {
    const selfTarget = resetDeps(async () => {
      throw defined("FORBIDDEN", "You cannot reset your own two-step verification here")
    })
    expect(
      await resetTwoFactorCore(selfTarget, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: "You cannot reset your own two-step verification here" })

    const superadmin = resetDeps(async () => {
      throw defined("FORBIDDEN", SUPERADMIN_RESET_MESSAGE)
    })
    expect(
      await resetTwoFactorCore(superadmin, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: SUPERADMIN_RESET_MESSAGE })

    const noTwoFactor = resetDeps(async () => {
      throw defined("CONFLICT", "That user does not have two-step verification on")
    })
    expect(
      await resetTwoFactorCore(noTwoFactor, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: "That user does not have two-step verification on" })

    const missing = resetDeps(async () => {
      throw defined("NOT_FOUND", "Not found")
    })
    expect(
      await resetTwoFactorCore(missing, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: "Not found" })

    const limited = resetDeps(async () => {
      throw defined("TOO_MANY_REQUESTS", "Too many resets, try again later")
    })
    expect(
      await resetTwoFactorCore(limited, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: "Too many resets, try again later" })
  })

  test("an unknown failure is 'unavailable' and logged", async () => {
    const down = resetDeps(async () => {
      throw new TypeError("fetch failed")
    })
    const out = await resetTwoFactorCore(down, form({ userId: "9", reason: "testing" }))
    expect(out).toMatchObject({ ok: false })
    expect((out as { message?: string }).message).toMatch(/unavailable/)
    expect(logged).toHaveBeenCalledTimes(1)
  })
})

describe("removePasskeysCore", () => {
  const removeDeps = (
    removePasskeys: RemovePasskeysDeps["api"]["users"]["removePasskeys"]
  ): RemovePasskeysDeps => ({ api: { users: { removePasskeys } } })

  test("a valid reason calls the api and reports", async () => {
    let seen: unknown
    const d = removeDeps(async (input) => {
      seen = input
      return { ok: true }
    })
    const out = await removePasskeysCore(d, form({ userId: "9", reason: "  lost phone  " }))
    expect(out).toEqual({
      ok: true,
      message: "Passkeys removed; the user is signed out everywhere.",
    })
    expect(seen).toEqual({ userId: 9, reason: "lost phone" })
  })

  test("a short reason is a field error and never calls the api", async () => {
    let called = false
    const d = removeDeps(async () => {
      called = true
      return { ok: true }
    })
    const out = await removePasskeysCore(d, form({ userId: "9", reason: "ab" }))
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { reason: expect.any(String) },
      values: { reason: "ab" },
    })
    expect(called).toBe(false)
  })

  test("the api's self/superadmin refusal and NOT_FOUND are shown verbatim", async () => {
    const selfTarget = removeDeps(async () => {
      throw defined("FORBIDDEN", SELF_REMOVE_PASSKEYS_MESSAGE)
    })
    expect(
      await removePasskeysCore(selfTarget, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: SELF_REMOVE_PASSKEYS_MESSAGE })

    const superadmin = removeDeps(async () => {
      throw defined("FORBIDDEN", SUPERADMIN_REMOVE_PASSKEYS_MESSAGE)
    })
    expect(
      await removePasskeysCore(superadmin, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: SUPERADMIN_REMOVE_PASSKEYS_MESSAGE })

    const missing = removeDeps(async () => {
      throw defined("NOT_FOUND", "Not found")
    })
    expect(
      await removePasskeysCore(missing, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: "Not found" })

    const limited = removeDeps(async () => {
      throw defined("TOO_MANY_REQUESTS", "Too many removals, try again later")
    })
    expect(
      await removePasskeysCore(limited, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: "Too many removals, try again later" })
  })

  test("an unknown failure is 'unavailable' and logged", async () => {
    const down = removeDeps(async () => {
      throw new TypeError("fetch failed")
    })
    const out = await removePasskeysCore(down, form({ userId: "9", reason: "testing" }))
    expect(out).toMatchObject({ ok: false })
    expect((out as { message?: string }).message).toMatch(/unavailable/)
    expect(logged).toHaveBeenCalledTimes(1)
  })
})

describe("untilFromDateInput", () => {
  test("a date reads as 'suspended through that UTC day': the start of the next one", () => {
    expect(untilFromDateInput("2026-11-01")).toBe("2026-11-02T00:00:00.000Z")
    // Rolls over month and year boundaries using native Date arithmetic.
    expect(untilFromDateInput("2026-12-31")).toBe("2027-01-01T00:00:00.000Z")
  })

  test("empty is indefinite (undefined); a malformed value is left for the api's schema to refuse", () => {
    expect(untilFromDateInput("")).toBeUndefined()
    expect(untilFromDateInput("not-a-date")).toBe("not-a-date")
  })

  test("a calendar-invalid date is rejected (passed through), not silently 'corrected' by overflow", () => {
    // 2026 is not a leap year: Feb 30 and Feb 29 both overflow into March if left unchecked.
    expect(untilFromDateInput("2026-02-30")).toBe("2026-02-30")
    expect(untilFromDateInput("2026-02-29")).toBe("2026-02-29")
    // Month 13 would overflow into the next January.
    expect(untilFromDateInput("2026-13-01")).toBe("2026-13-01")
    // Day 00 and month 00 are not real calendar fields either.
    expect(untilFromDateInput("2026-01-00")).toBe("2026-01-00")
    expect(untilFromDateInput("2026-00-01")).toBe("2026-00-01")
    // A leap day in an actual leap year is a real date, and still converts correctly.
    expect(untilFromDateInput("2028-02-29")).toBe("2028-03-01T00:00:00.000Z")
  })
})

describe("the date picker's bounds against the api's limit", () => {
  test("the last day offered converts to an until within 365 days; the day after does not", () => {
    const limitMs = 365 * 24 * 60 * 60 * 1000
    for (const at of [
      "2026-10-18T10:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
      "2027-02-28T12:00:00.000Z",
    ]) {
      const now = new Date(at)
      const { max } = suspendUntilBounds(now)
      const until = Date.parse(untilFromDateInput(max) ?? "")
      expect(until).toBeLessThanOrEqual(now.getTime() + limitMs)
      expect(until + 24 * 60 * 60 * 1000).toBeGreaterThan(now.getTime() + limitMs)
    }
  })
})

describe("suspendUserCore", () => {
  const suspendDeps = (suspend: SuspendDeps["api"]["users"]["suspend"]): SuspendDeps => ({
    api: { users: { suspend } },
  })

  test("a valid reason with no end date calls the api and reports", async () => {
    let seen: unknown
    const d = suspendDeps(async (input) => {
      seen = input
      return { ok: true }
    })
    const out = await suspendUserCore(d, form({ userId: "9", reason: "  abuse report  " }))
    expect(out).toMatchObject({ ok: true })
    expect(seen).toEqual({ userId: 9, reason: "abuse report" })
  })

  test("an end date is converted to the start of the next UTC day", async () => {
    let seen: unknown
    const d = suspendDeps(async (input) => {
      seen = input
      return { ok: true }
    })
    await suspendUserCore(d, form({ userId: "9", reason: "abuse report", until: "2026-11-01" }))
    expect(seen).toEqual({
      userId: 9,
      reason: "abuse report",
      until: "2026-11-02T00:00:00.000Z",
    })
  })

  test("a short reason is a field error and never calls the api", async () => {
    let called = false
    const d = suspendDeps(async () => {
      called = true
      return { ok: true }
    })
    const out = await suspendUserCore(d, form({ userId: "9", reason: "ab" }))
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { reason: expect.any(String) },
      values: { reason: "ab" },
    })
    expect(called).toBe(false)
  })

  test("the api's self/superadmin/invalid-date refusals are shown verbatim", async () => {
    const selfTarget = suspendDeps(async () => {
      throw defined("FORBIDDEN", SELF_SUSPEND_MESSAGE)
    })
    expect(
      await suspendUserCore(selfTarget, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: SELF_SUSPEND_MESSAGE })

    const superadmin = suspendDeps(async () => {
      throw defined("FORBIDDEN", SUPERADMIN_SUSPEND_MESSAGE)
    })
    expect(
      await suspendUserCore(superadmin, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: SUPERADMIN_SUSPEND_MESSAGE })

    const badUntil = suspendDeps(async () => {
      throw defined("BAD_REQUEST", SUSPEND_UNTIL_INVALID_MESSAGE)
    })
    expect(
      await suspendUserCore(badUntil, form({ userId: "9", reason: "testing", until: "2026-11-01" }))
    ).toMatchObject({ ok: false, message: SUSPEND_UNTIL_INVALID_MESSAGE })

    const missing = suspendDeps(async () => {
      throw defined("NOT_FOUND", "Not found")
    })
    expect(await suspendUserCore(missing, form({ userId: "9", reason: "testing" }))).toMatchObject({
      ok: false,
      message: "Not found",
    })

    const limited = suspendDeps(async () => {
      throw defined("TOO_MANY_REQUESTS", "Too many suspension changes, try again later")
    })
    expect(await suspendUserCore(limited, form({ userId: "9", reason: "testing" }))).toMatchObject({
      ok: false,
      message: "Too many suspension changes, try again later",
    })
  })

  test("an unknown failure is 'unavailable' and logged", async () => {
    const down = suspendDeps(async () => {
      throw new TypeError("fetch failed")
    })
    const out = await suspendUserCore(down, form({ userId: "9", reason: "testing" }))
    expect(out).toMatchObject({ ok: false })
    expect((out as { message?: string }).message).toMatch(/unavailable/)
    expect(logged).toHaveBeenCalledTimes(1)
  })
})

describe("unsuspendUserCore", () => {
  const unsuspendDeps = (unsuspend: UnsuspendDeps["api"]["users"]["unsuspend"]): UnsuspendDeps => ({
    api: { users: { unsuspend } },
  })

  test("a valid reason calls the api and reports", async () => {
    let seen: unknown
    const d = unsuspendDeps(async (input) => {
      seen = input
      return { ok: true }
    })
    const out = await unsuspendUserCore(d, form({ userId: "9", reason: "  mistake  " }))
    expect(out).toMatchObject({ ok: true })
    expect(seen).toEqual({ userId: 9, reason: "mistake" })
  })

  test("a short reason is a field error and never calls the api", async () => {
    let called = false
    const d = unsuspendDeps(async () => {
      called = true
      return { ok: true }
    })
    const out = await unsuspendUserCore(d, form({ userId: "9", reason: "ab" }))
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { reason: expect.any(String) },
      values: { reason: "ab" },
    })
    expect(called).toBe(false)
  })

  test("the api's self/superadmin refusals and NOT_FOUND are shown verbatim", async () => {
    const selfTarget = unsuspendDeps(async () => {
      throw defined("FORBIDDEN", SELF_SUSPEND_MESSAGE)
    })
    expect(
      await unsuspendUserCore(selfTarget, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: SELF_SUSPEND_MESSAGE })

    const superadmin = unsuspendDeps(async () => {
      throw defined("FORBIDDEN", SUPERADMIN_SUSPEND_MESSAGE)
    })
    expect(
      await unsuspendUserCore(superadmin, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: SUPERADMIN_SUSPEND_MESSAGE })

    const missing = unsuspendDeps(async () => {
      throw defined("NOT_FOUND", "Not found")
    })
    expect(
      await unsuspendUserCore(missing, form({ userId: "9", reason: "testing" }))
    ).toMatchObject({ ok: false, message: "Not found" })
  })

  test("an unknown failure is 'unavailable' and logged", async () => {
    const down = unsuspendDeps(async () => {
      throw new TypeError("fetch failed")
    })
    const out = await unsuspendUserCore(down, form({ userId: "9", reason: "testing" }))
    expect(out).toMatchObject({ ok: false })
    expect((out as { message?: string }).message).toMatch(/unavailable/)
    expect(logged).toHaveBeenCalledTimes(1)
  })
})

describe("shouldStop", () => {
  const me = (impersonation: Me["impersonation"]): Me => ({
    user,
    session: { id: 1, expiresAt: "2027-01-01T00:00:00.000Z" },
    impersonation,
    localeChosen: false,
  })
  const impersonation = {
    by: { id: 1, name: "Root", email: "root@example.com" },
    reason: "ticket #12",
    expiresAt: "2027-01-01T00:00:00.000Z",
  }

  test("an impersonation session may stop", () => {
    expect(shouldStop(me(impersonation), null)).toBe(true)
  })
  test("api unreachable but an admin token is parked: still stop", () => {
    expect(shouldStop(null, "parked-token")).toBe(true)
  })
  test("api unreachable and nothing parked: nothing to stop", () => {
    expect(shouldStop(null, null)).toBe(false)
  })
  test("an ordinary session has nothing to stop, parked cookie or not", () => {
    expect(shouldStop(me(null), null)).toBe(false)
    expect(shouldStop(me(null), "stale")).toBe(false)
  })
})

describe("retryJobCore", () => {
  const jobDeps = (retry: JobActionDeps["api"]["jobs"]["retry"]): JobActionDeps => ({
    api: { jobs: { retry, discard: async () => ({ ok: true }) } },
  })

  test("a valid id calls the api and reports", async () => {
    let seen: unknown
    const d = jobDeps(async (input) => {
      seen = input
      return { ok: true }
    })
    const out = await retryJobCore(d, form({ id: "9" }))
    expect(out).toEqual({ ok: true, message: "Job requeued." })
    expect(seen).toEqual({ id: 9 })
  })

  test("a missing or invalid id never calls the api", async () => {
    let called = false
    const d = jobDeps(async () => {
      called = true
      throw new Error("unreachable")
    })
    expect(await retryJobCore(d, form({}))).toMatchObject({ ok: false, message: "Job not found" })
    expect(await retryJobCore(d, form({ id: "0" }))).toMatchObject({
      ok: false,
      message: "Job not found",
    })
    expect(called).toBe(false)
  })

  test("the api's CONFLICT and NOT_FOUND are shown verbatim; an unknown failure is 'unavailable'", async () => {
    const conflict = jobDeps(async () => {
      throw defined("CONFLICT", JOB_RETRY_CONFLICT_MESSAGE)
    })
    expect(await retryJobCore(conflict, form({ id: "9" }))).toMatchObject({
      ok: false,
      message: JOB_RETRY_CONFLICT_MESSAGE,
    })

    const missing = jobDeps(async () => {
      throw new ORPCError("NOT_FOUND", { message: "Not found" })
    })
    expect(await retryJobCore(missing, form({ id: "9" }))).toMatchObject({
      ok: false,
      message: "Not found",
    })
    expect(logged).not.toHaveBeenCalled()

    const down = jobDeps(async () => {
      throw new TypeError("fetch failed")
    })
    const out = await retryJobCore(down, form({ id: "9" }))
    expect(out).toMatchObject({ ok: false })
    expect((out as { message?: string }).message).toMatch(/unavailable/)
    expect(logged).toHaveBeenCalledTimes(1)
  })
})

describe("discardJobCore", () => {
  const jobDeps = (discard: JobActionDeps["api"]["jobs"]["discard"]): JobActionDeps => ({
    api: { jobs: { retry: async () => ({ ok: true }), discard } },
  })

  test("a valid id calls the api and reports", async () => {
    let seen: unknown
    const d = jobDeps(async (input) => {
      seen = input
      return { ok: true }
    })
    const out = await discardJobCore(d, form({ id: "9" }))
    expect(out).toEqual({ ok: true, message: "Job discarded." })
    expect(seen).toEqual({ id: 9 })
  })

  test("a missing or invalid id never calls the api", async () => {
    let called = false
    const d = jobDeps(async () => {
      called = true
      throw new Error("unreachable")
    })
    expect(await discardJobCore(d, form({}))).toMatchObject({
      ok: false,
      message: "Job not found",
    })
    expect(called).toBe(false)
  })

  test("an undeclared NOT_FOUND is 'Not found'; an unknown failure is 'unavailable'", async () => {
    const missing = jobDeps(async () => {
      throw new ORPCError("NOT_FOUND", { message: "Not found" })
    })
    expect(await discardJobCore(missing, form({ id: "9" }))).toMatchObject({
      ok: false,
      message: "Not found",
    })
    expect(logged).not.toHaveBeenCalled()

    const down = jobDeps(async () => {
      throw new TypeError("fetch failed")
    })
    const out = await discardJobCore(down, form({ id: "9" }))
    expect(out).toMatchObject({ ok: false })
    expect((out as { message?: string }).message).toMatch(/unavailable/)
    expect(logged).toHaveBeenCalledTimes(1)
  })
})
