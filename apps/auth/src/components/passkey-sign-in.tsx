"use client"

import { Button } from "@repo/ui/components/button"
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser"
import {
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
} from "@simplewebauthn/browser"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { passkeyOptions, passkeySignIn } from "@/app/login/actions"
import { FormMessage } from "@/components/form-message"
import { OrDivider } from "@/components/social-buttons"
import type { FormState } from "@/lib/actions"
import { classifyPasskeyError, quietCeremonyMayProceed } from "@/lib/passkey"

const subscribeNever = () => () => {}

/**
 * The login page's fast path: a discoverable passkey signs in on its own — no password, no
 * authenticator code.
 *
 * Before hydration (and, with JavaScript off, forever) this renders the same button, message
 * area and divider as an invisible, `aria-hidden`, `inert` placeholder of identical size —
 * `@repo/ui/components/static-locale-switcher`'s own trick, for the same reason: the real block
 * mounts in the same box once hydrated, so the password form below it never shifts (a layout
 * shift this exact swap caused before this placeholder existed, caught by the Lighthouse CLS
 * budget on `/login`). `useSyncExternalStore(subscribeNever, () => true, () => false)` is
 * `StaticLocaleSwitcher`'s own hydration probe: server and the first client render agree (both
 * `false`), so there is no hydration-mismatch warning, and the swap to the real content happens
 * before the browser's next paint. Unlike `StaticLocaleSwitcher`, this placeholder must leave no
 * gap without JavaScript at all — there is no form here to fall back to showing, the way a static
 * app's header still reserves its switcher's width — so it also carries
 * `[@media(scripting:none)]:hidden`, collapsing the reserved space to nothing when scripting is
 * off (confirmed emitted by this repo's Tailwind v4 build: the arbitrary variant compiles to a
 * literal `@media (scripting:none)` rule).
 *
 * Two ceremonies share one button and one message area once mounted: a quiet one started on
 * mount, offered through the login email field's browser-autofill dropdown when the browser
 * supports it (that field's `autocomplete="username webauthn"` is the caller's job, not this
 * component's), and the explicit one this button starts. Calling `startAuthentication` a second
 * time — the explicit click — replaces (aborts) whichever ceremony is still pending, the quiet
 * one included; that is `@simplewebauthn/browser`'s own `WebAuthnAbortService`, not anything this
 * component does. The reverse must never happen: a click while the quiet ceremony is still waiting
 * for its options would otherwise be aborted by the quiet ceremony's own later
 * `startAuthentication`, so `explicitRuns` counts clicks and the quiet ceremony stands down for
 * good once one has begun since it started (`quietCeremonyMayProceed`). Once a ceremony signs in,
 * the button stays disabled until the browser has left the page, so a second click cannot start
 * another one. What each outcome shows is `classifyPasskeyError` (`@/lib/passkey`), a pure
 * function with its own unit tests, since this component has none of its own (no
 * interactive-component test precedent exists in this repo to follow). A browser that turns out
 * not to support WebAuthn at all (rare) collapses the block after mount instead — the one case
 * that does shift the page, accepted as the cost of not knowing until then.
 */
export function PasskeySignIn({
  next,
  dividerLabel,
}: {
  next?: string
  /** Shown as a divider under the button, leading into the email/password form below — rendered
   * together with the button and its placeholder alike, so nothing but the rare
   * confirmed-unsupported case ever shows a divider with nothing above it. */
  dividerLabel: string
}) {
  const t = useTranslations("auth")
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
  // `null` until the mount effect below checks `window.PublicKeyCredential`: treated as "show the
  // block" (the same as `true`) so the placeholder's assumed size — the overwhelmingly common
  // case — never has to shrink and then grow again while this is being decided.
  const [supported, setSupported] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<FormState>({ ok: false })
  // Guards every state update that resumes after an `await`: a ceremony (almost always the quiet
  // autofill one) can still be in flight when the visitor navigates away from /login, and its
  // `setState`/`setPending` calls must not run once this component is gone.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // How many explicit (button) ceremonies have begun: the quiet one compares it with the count
  // it started under after every `await`, and stands down once a click has come in between.
  const explicitRuns = useRef(0)

  const run = useCallback(
    async (useBrowserAutofill: boolean) => {
      if (!useBrowserAutofill) {
        explicitRuns.current += 1
        setPending(true)
        setState({ ok: false })
      }
      const explicitAtStart = explicitRuns.current
      // False once this run must not touch the page any more: the component is gone, or this is
      // the quiet ceremony and the visitor has since clicked the button.
      const current = () =>
        mountedRef.current &&
        (!useBrowserAutofill || quietCeremonyMayProceed(explicitAtStart, explicitRuns.current))
      // Set once the browser is on its way to the signed-in page: the button then stays disabled
      // (and pending) until it gets there, rather than offering a second ceremony meanwhile.
      let leaving = false
      try {
        const options = await passkeyOptions()
        if (!current()) return
        if (!options.ok) {
          if (!useBrowserAutofill) setState({ ok: false, message: options.message })
          return
        }
        const response = await startAuthentication({
          optionsJSON: options.options as PublicKeyCredentialRequestOptionsJSON,
          useBrowserAutofill,
        })
        if (!current()) return
        const fd = new FormData()
        fd.set("challengeId", options.challengeId)
        fd.set("response", JSON.stringify(response))
        fd.set("next", next ?? "")
        const out = await passkeySignIn({ ok: false }, fd)
        if (!mountedRef.current) return
        if ("redirectTo" in out) {
          leaving = true
          setPending(true)
          window.location.href = out.redirectTo
          return
        }
        if (!current()) return
        setState(out)
      } catch (error) {
        if (!current()) return
        const display = classifyPasskeyError(error, useBrowserAutofill)
        if (display === "cancelled") setState({ ok: true, message: t("passkey.cancelled") })
        else if (display === "failed") setState({ ok: false, message: t("passkey.failed") })
      } finally {
        if (!useBrowserAutofill && !leaving && mountedRef.current) setPending(false)
      }
    },
    [next, t]
  )

  useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setSupported(false)
      return
    }
    setSupported(true)
    let active = true
    browserSupportsWebAuthnAutofill()
      .then((ok) => {
        if (ok && active) run(true)
      })
      .catch(() => {})
    return () => {
      active = false
      // Tears down whichever ceremony is still in flight — almost always the quiet autofill one,
      // since the explicit button's own ceremony only starts on a click the visitor just made —
      // so a navigation away from /login never leaves a native credential prompt running. The
      // rejection this produces lands in `run`'s own `catch` above (classified as "none"), never
      // unhandled.
      WebAuthnAbortService.cancelCeremony()
    }
  }, [run])

  // The one confirmed-unsupported case: collapse for good, rather than keep reserving space for
  // a button that will never work here.
  if (supported === false) return null

  const content = (
    <div className="grid gap-3">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() => run(false)}
      >
        {pending ? t("passkey.pending") : t("passkey.button")}
      </Button>
      <FormMessage state={state} />
      <OrDivider label={dividerLabel} />
    </div>
  )

  if (!hydrated) {
    return (
      <div aria-hidden="true" inert className="invisible [@media(scripting:none)]:hidden">
        {content}
      </div>
    )
  }

  return content
}
