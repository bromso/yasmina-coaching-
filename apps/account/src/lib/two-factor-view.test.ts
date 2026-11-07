import { describe, expect, test } from "bun:test"
import { resolveTwoFactorView, restartMessage } from "./two-factor-view"

const off = { ok: false as const }
const notOk = { ok: false as const, message: "" }

describe("resolveTwoFactorView", () => {
  test("a successful enable wins even though `enabled` has not caught up yet", () => {
    // The exact shape of the original bug: the server action's revalidate has already flipped
    // `enabled` to true by the time this render happens, which used to mean the sub-component
    // holding the recovery codes (keyed off `enabled: false`) was never rendered at all.
    const view = resolveTwoFactorView({
      enabled: true,
      isImpersonating: false,
      setupState: notOk,
      enableState: { ok: true, recoveryCodes: ["aaaaa-aaaaa"] },
      regenState: off,
      offState: off,
    })
    expect(view).toEqual({ kind: "recoveryCodes", codes: ["aaaaa-aaaaa"] })
  })

  test("a successful regenerate wins even if `enabled` were somehow stale as false", () => {
    const view = resolveTwoFactorView({
      enabled: false,
      isImpersonating: false,
      setupState: notOk,
      enableState: off,
      regenState: { ok: true, recoveryCodes: ["bbbbb-bbbbb"] },
      offState: off,
    })
    expect(view).toEqual({ kind: "recoveryCodes", codes: ["bbbbb-bbbbb"] })
  })

  test("recovery codes outrank the impersonation note", () => {
    const view = resolveTwoFactorView({
      enabled: true,
      isImpersonating: true,
      setupState: notOk,
      enableState: { ok: true, recoveryCodes: ["ccccc-ccccc"] },
      regenState: off,
      offState: off,
    })
    expect(view.kind).toBe("recoveryCodes")
  })

  test("impersonating (no pending codes) reports the current status read-only", () => {
    expect(
      resolveTwoFactorView({
        enabled: true,
        isImpersonating: true,
        setupState: notOk,
        enableState: off,
        regenState: off,
        offState: off,
      })
    ).toEqual({ kind: "impersonating", enabled: true })
  })

  test("off + a pending secret from setup goes to the setup step", () => {
    const setupState = {
      ok: true as const,
      secret: "ABCD",
      otpauthUrl: "otpauth://x",
      qrSvg: "<svg/>",
    }
    const enableState = { ok: false as const, message: "wrong" }
    expect(
      resolveTwoFactorView({
        enabled: false,
        isImpersonating: false,
        setupState,
        enableState,
        regenState: off,
        offState: off,
      })
    ).toEqual({ kind: "setup", setupState, enableState })
  })

  test("off, no pending secret, a just-completed disable: its message survives the branch switch", () => {
    const offState = { ok: true as const, message: "Two-step verification is off." }
    expect(
      resolveTwoFactorView({
        enabled: false,
        isImpersonating: false,
        setupState: notOk,
        enableState: off,
        regenState: off,
        offState,
      })
    ).toEqual({ kind: "off", notice: offState })
  })

  test("off, no pending secret, a failed enable (the no-JS lost-QR case): a start-over notice", () => {
    const view = resolveTwoFactorView({
      enabled: false,
      isImpersonating: false,
      setupState: notOk,
      enableState: { ok: false, fieldErrors: { code: "Wrong code" } },
      regenState: off,
      offState: off,
    })
    expect(view).toEqual({
      kind: "off",
      notice: { ok: false, message: "Wrong code. Start setup again." },
    })
  })

  test("off, a reauth refusal: its reauthHref rides along in the notice", () => {
    const setupFailure = {
      ok: false as const,
      message: "Sign in again to turn on two-step verification.",
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1",
    }
    expect(
      resolveTwoFactorView({
        enabled: false,
        isImpersonating: false,
        setupState: setupFailure,
        enableState: off,
        regenState: off,
        offState: off,
      })
    ).toEqual({ kind: "off", notice: setupFailure })
  })

  test("off, nothing pending at all: setup's own message (if any), unchanged", () => {
    const setupFailure = { ok: false as const, message: "Two-step verification is already on" }
    expect(
      resolveTwoFactorView({
        enabled: false,
        isImpersonating: false,
        setupState: setupFailure,
        enableState: off,
        regenState: off,
        offState: off,
      })
    ).toEqual({ kind: "off", notice: setupFailure })
  })

  test("on, nothing pending: the on step with its two forms' state", () => {
    const regenState = { ok: false as const, message: "nope" }
    const offState = { ok: false as const, message: "nope2" }
    expect(
      resolveTwoFactorView({
        enabled: true,
        isImpersonating: false,
        setupState: notOk,
        enableState: off,
        regenState,
        offState,
      })
    ).toEqual({ kind: "on", regenState, offState })
  })

  test("a fresh setup failure is not masked by an older disable success", () => {
    const setupFailure = { ok: false as const, message: "Verify your email first" }
    const offState = { ok: true as const, message: "Two-step verification is off." }
    const base = {
      enabled: false,
      isImpersonating: false,
      setupState: setupFailure,
      enableState: off,
      regenState: off,
      offState,
    }
    expect(resolveTwoFactorView({ ...base, lastSubmitted: "setup" })).toEqual({
      kind: "off",
      notice: setupFailure,
    })
    // The other way round — the setup failure is the stale one — the disable's success shows.
    expect(resolveTwoFactorView({ ...base, lastSubmitted: "off" })).toEqual({
      kind: "off",
      notice: offState,
    })
  })

  test("a fresh setup failure outranks an older failed enable's restart notice", () => {
    const setupFailure = { ok: false as const, message: "Two-step verification is already on" }
    expect(
      resolveTwoFactorView({
        enabled: false,
        isImpersonating: false,
        setupState: setupFailure,
        enableState: { ok: false, fieldErrors: { code: "Wrong code" } },
        regenState: off,
        offState: off,
        lastSubmitted: "setup",
      })
    ).toEqual({ kind: "off", notice: setupFailure })
  })

  test("a setup failure carrying only a field error (a wrong password) is still a failure", () => {
    const setupFailure = {
      ok: false as const,
      fieldErrors: { currentPassword: "Current password is incorrect" },
    }
    const base = {
      enabled: false,
      isImpersonating: false,
      setupState: setupFailure,
      regenState: off,
    }
    // After turning 2FA off, a mistyped password on Turn on shows, not "turned off".
    expect(
      resolveTwoFactorView({
        ...base,
        enableState: off,
        offState: { ok: true as const, message: "Two-step verification is off." },
        lastSubmitted: "setup",
      })
    ).toEqual({ kind: "off", notice: setupFailure })
    // After a failed enable (no JavaScript), it outranks the restart notice.
    expect(
      resolveTwoFactorView({
        ...base,
        enableState: { ok: false, fieldErrors: { code: "Wrong code" } },
        offState: off,
        lastSubmitted: "setup",
      })
    ).toEqual({ kind: "off", notice: setupFailure })
  })

  test("restartMessage adds a full stop only when the message lacks one", () => {
    expect(restartMessage("Start setup first")).toBe("Start setup first. Start setup again.")
    expect(restartMessage("That code didn't work. Try again.")).toBe(
      "That code didn't work. Try again. Start setup again."
    )
    expect(restartMessage("Too many attempts!")).toBe("Too many attempts! Start setup again.")
  })

  test("the start-over sentence comes in the page's language when given", () => {
    expect(restartMessage("Koden fungerade inte", "Börja om med inställningen.")).toBe(
      "Koden fungerade inte. Börja om med inställningen."
    )
    const view = resolveTwoFactorView({
      enabled: false,
      isImpersonating: false,
      setupState: notOk,
      enableState: { ok: false, fieldErrors: { code: "Fel kod." } },
      regenState: off,
      offState: off,
      startAgain: "Börja om med inställningen.",
    })
    expect(view).toEqual({
      kind: "off",
      notice: { ok: false, message: "Fel kod. Börja om med inställningen." },
    })
  })

  test("off with an unverified email: the unverified state, no setup", () => {
    expect(
      resolveTwoFactorView({
        enabled: false,
        isImpersonating: false,
        emailVerified: false,
        setupState: { ok: false, message: "Verify your email to turn on two-step verification" },
        enableState: off,
        regenState: off,
        offState: off,
      })
    ).toEqual({ kind: "unverified", notice: { ok: false } })
  })

  test("unverified still shows a just-completed disable's success", () => {
    const offState = { ok: true as const, message: "Two-step verification is off." }
    expect(
      resolveTwoFactorView({
        enabled: false,
        isImpersonating: false,
        emailVerified: false,
        setupState: notOk,
        enableState: off,
        regenState: off,
        offState,
      })
    ).toEqual({ kind: "unverified", notice: offState })
  })

  test("an unverified email does not hide a 2FA that is on", () => {
    const view = resolveTwoFactorView({
      enabled: true,
      isImpersonating: false,
      emailVerified: false,
      setupState: notOk,
      enableState: off,
      regenState: off,
      offState: off,
    })
    expect(view.kind).toBe("on")
  })
})
