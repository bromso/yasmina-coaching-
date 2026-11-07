import type { FormState } from "@repo/ui/components/form-feedback"
import type { TwoFactorEnableState, TwoFactorRegenerateState, TwoFactorSetupState } from "./actions"

/** The card's four actions, named for `lastSubmitted`. */
export type TwoFactorAction = "setup" | "enable" | "regen" | "off"

/**
 * `message`, then " Start setup again." (or `startAgain`, the same sentence in the page's
 * language) — with a full stop between them when it has none.
 */
export function restartMessage(message: string, startAgain = "Start setup again.") {
  const trimmed = message.trim()
  return `${trimmed}${/[.!?]$/.test(trimmed) ? "" : "."} ${startAgain}`
}

export type TwoFactorView =
  | { kind: "recoveryCodes"; codes: string[] }
  | { kind: "impersonating"; enabled: boolean }
  | {
      kind: "setup"
      setupState: Extract<TwoFactorSetupState, { ok: true }>
      enableState: Extract<TwoFactorEnableState, { ok: false }>
    }
  | { kind: "off"; notice: FormState & { reauthHref?: string } }
  /** Off, and the email is unverified: the api refuses `setup` until it is, so no **Turn on**. */
  | { kind: "unverified"; notice: FormState }
  | {
      kind: "on"
      regenState: Extract<TwoFactorRegenerateState, { ok: false }>
      offState: FormState
    }

/**
 * What the "Two-step verification" card should show, given the account's current status and the
 * result of whichever of its four actions was last submitted. Pulled out of `TwoFactorCard` as a
 * pure function so the rule that matters most — a successful `enable` or `regenerate` wins over
 * everything else, including `enabled` itself — is testable without rendering React.
 *
 * That rule exists because of a round trip that *changes which branch would otherwise render*: a
 * successful `enable`/`regenerate` flips `enabled` true, and a successful `disable` flips it back
 * to false, in the very same update that carries the action's own result. If the decision below
 * picked a branch by `enabled` first, the branch holding the just-issued recovery codes (or the
 * just-completed disable's message) would already have been swapped out by the time that result
 * was available to show — lost with JavaScript enabled (its component unmounts on the same
 * re-render that would display it) and, without JavaScript, never rendered in the first place (a
 * fresh response to that POST renders the *new* status, not the branch that owns the action that
 * was actually submitted). Checking `enableState.ok` / `regenState.ok` first, before `enabled`,
 * is what makes the result visible in both modes — see `TwoFactorCard` for how its four
 * `useActionState` hooks all stay mounted at the top level to keep every one of these reachable.
 *
 * One gap this does not close: without JavaScript, each submission is an independent request with
 * no client memory, so `setupState` (the secret + QR) reflects only *this* request's action — a
 * wrong `enable` code arriving without JavaScript means `setupState` is back to its initial,
 * secret-less value on that same response (there is no "pending secret" read endpoint to recover
 * it from). The `"off"` branch's `notice` covers that case with a "start over" message instead of
 * a broken, secret-less `"setup"` branch.
 *
 * With JavaScript, every hook keeps its last result, so the off branch can hold both an old
 * success (a disable) and a newer failure (a setup that was refused). `lastSubmitted` — which of
 * the card's actions produced the most recent result, tracked by `TwoFactorCard` — picks the
 * fresh one; without it (no JavaScript, where only one result ever exists) a setup failure wins.
 */
export function resolveTwoFactorView(input: {
  enabled: boolean
  isImpersonating: boolean
  setupState: TwoFactorSetupState
  enableState: TwoFactorEnableState
  regenState: TwoFactorRegenerateState
  offState: FormState
  /** Defaults to true: only an explicit false hides **Turn on**. */
  emailVerified?: boolean
  lastSubmitted?: TwoFactorAction
  /** "Start setup again." in the page's language; English by default. */
  startAgain?: string
}): TwoFactorView {
  const { enabled, isImpersonating, setupState, enableState, regenState, offState } = input

  if (enableState.ok) return { kind: "recoveryCodes", codes: enableState.recoveryCodes }
  if (regenState.ok) return { kind: "recoveryCodes", codes: regenState.recoveryCodes }

  if (isImpersonating) return { kind: "impersonating", enabled }

  if (!enabled) {
    if (setupState.ok) return { kind: "setup", setupState, enableState }
    // A wrong setup password comes back as a field error alone (no `message`): still a failure.
    const setupFailure = setupState.message || setupState.fieldErrors ? setupState : undefined
    // `restart` is set only once an `enable` attempt has actually failed (its initial state has
    // neither field) — never on a plain, first visit to the off state.
    const restart = enableState.message ?? enableState.fieldErrors?.code
    let notice: FormState & { reauthHref?: string }
    if (setupFailure && (input.lastSubmitted === "setup" || !offState.ok)) notice = setupFailure
    else if (offState.ok) notice = offState
    else if (restart) notice = { ok: false, message: restartMessage(restart, input.startAgain) }
    else notice = setupState
    if (input.emailVerified === false) {
      // Setup's own refusal says the same thing as the card; only a disable's success is news.
      return { kind: "unverified", notice: offState.ok ? offState : { ok: false } }
    }
    return { kind: "off", notice }
  }

  return { kind: "on", regenState, offState }
}
