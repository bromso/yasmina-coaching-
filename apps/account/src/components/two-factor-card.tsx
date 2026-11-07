"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState, useEffect, useRef, useState } from "react"
import {
  disableTwoFactor,
  enableTwoFactor,
  regenerateRecoveryCodes,
  setupTwoFactor,
} from "@/app/(account)/security/actions"
import { ReauthNotice } from "@/components/reauth-notice"
import type {
  FormState,
  TwoFactorEnableState,
  TwoFactorRegenerateState,
  TwoFactorSetupState,
} from "@/lib/actions"
import { resolveTwoFactorView, type TwoFactorAction } from "@/lib/two-factor-view"

/** Below this many recovery codes left, the status line warns rather than just reports. */
const RECOVERY_CODES_WARNING = 3

/** A `useActionState` dispatch, as passed straight to a `<form action={...}>`. */
type Dispatch = (payload: FormData) => void

/** "ABCDEFGHIJKLMNOP" → "ABCD EFGH IJKL MNOP" — easier to read and type by hand. */
function groupSecret(secret: string) {
  return secret.replace(/(.{4})/g, "$1 ").trim()
}

/** Copy is an enhancement only: the codes are already selectable text in the `<pre>` above it. */
function CopyButton({ text }: { text: string }) {
  const t = useTranslations("account.twoFactor")
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch (error) {
          console.error("[account] copy to clipboard failed", error)
        }
      }}
    >
      {t(copied ? "copied" : "copy")}
    </Button>
  )
}

/**
 * The ten (or newly regenerated) recovery codes: shown once, never retrievable again. Rendered by
 * `TwoFactorCard` itself (not a child of `OnStep`/`SetupStep`) so it survives whichever branch the
 * next render picks — see the module comment on why that matters. Focus moves to the heading on
 * mount so a screen reader announces it, since nothing else on the page changed to draw attention.
 */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const t = useTranslations("account.twoFactor")
  const headingRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const text = codes.join("\n")
  return (
    <div className="grid gap-3 px-6 py-5">
      <p ref={headingRef} tabIndex={-1} className="text-sm font-medium outline-none">
        {t("recoveryTitle")}
      </p>
      <p className="text-muted-foreground text-xs">{t("recoveryText")}</p>
      <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-sm leading-relaxed">
        {text}
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={text} />
        <Button asChild variant="outline" size="sm">
          {/* No script needed to save the file: a plain `data:` link works without JavaScript. */}
          <a
            download="recovery-codes.txt"
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(`${text}\n`)}`}
          >
            {t("download")}
          </a>
        </Button>
      </div>
      <div>
        <Button asChild size="sm">
          <a href="/security">{t("done")}</a>
        </Button>
      </div>
    </div>
  )
}

/** Step 2 of setup: the QR + secret are already on screen (from `setupState`); this confirms with
 * a code. `enableState`/`enableAction`/`enablePending` come from `TwoFactorCard` (lifted — see
 * module comment); a success is handled there, before this component is reached. */
function SetupStep({
  setupState,
  enableState,
  enableAction,
  enablePending,
}: {
  setupState: Extract<TwoFactorSetupState, { ok: true }>
  enableState: Extract<TwoFactorEnableState, { ok: false }>
  enableAction: Dispatch
  enablePending: boolean
}) {
  const t = useTranslations("account")
  return (
    <div className="grid gap-4 px-6 py-5">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
        {/*
          uqr's own SVG markup, rendered server-side in `setupTwoFactorCore` from the
          `otpauthUrl` this response just issued — never user input, never sent to a third-party
          QR service, so inlining it here is safe.
         */}
        <div className="size-40 shrink-0" dangerouslySetInnerHTML={{ __html: setupState.qrSvg }} />
        <div className="grid gap-1.5">
          <p className="text-sm">{t("twoFactor.scan")}</p>
          <p className="bg-muted w-fit rounded-md px-2 py-1 font-mono text-sm tracking-wider">
            {groupSecret(setupState.secret)}
          </p>
        </div>
      </div>
      <form action={enableAction} className="grid max-w-56 gap-3" noValidate>
        <FormMessage state={enableState} />
        <div className="grid gap-1.5">
          <Label htmlFor="enable-code">{t("common.code")}</Label>
          <Input
            id="enable-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            minLength={6}
            maxLength={20}
            {...fieldAria("code", enableState)}
          />
          <FieldError name="code" state={enableState} />
        </div>
        <div>
          <Button type="submit" disabled={enablePending}>
            {t(enablePending ? "twoFactor.turningOn" : "twoFactor.turnOn")}
          </Button>
        </div>
      </form>
    </div>
  )
}

/**
 * Step 1 (or back here after turning off, or after a lost setup attempt): one button starts — or,
 * after a reload, restarts — setup. `notice` is whichever of those three is relevant right now,
 * computed by `TwoFactorCard` in one place: a just-turned-off success, a "start over" explanation,
 * or `setupState`'s own failure (e.g. a stale double-submit's CONFLICT).
 *
 * The api re-checks who is asking before it turns on 2FA: an account with a password must send it
 * (`hasPassword`, so the field is always in the form and setup works without JavaScript), and a
 * refused attempt comes back either as a field error on that password or — for a passwordless
 * account whose session has aged out of the re-authentication window — a notice carrying
 * `reauthHref`, rendered as a link to the auth app's sign-in form instead of the plain message.
 */
function OffStep({
  notice,
  hasPassword,
  setupAction,
  setupPending,
}: {
  notice: FormState & { reauthHref?: string }
  hasPassword: boolean
  setupAction: Dispatch
  setupPending: boolean
}) {
  const t = useTranslations("account.twoFactor")
  const reauthHref = !notice.ok ? notice.reauthHref : undefined
  return (
    <form action={setupAction} className="grid gap-3 px-6 py-5">
      {reauthHref ? (
        <ReauthNotice message={notice.message} href={reauthHref} />
      ) : (
        <FormMessage state={notice} />
      )}
      {hasPassword ? (
        <div className="grid max-w-72 gap-2">
          <Label htmlFor="2fa-current-password">{t("currentPassword")}</Label>
          <Input
            id="2fa-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            {...fieldAria("currentPassword", notice, undefined, { idPrefix: "2fa" })}
          />
          <FieldError name="currentPassword" state={notice} idPrefix="2fa" />
        </div>
      ) : null}
      <div>
        <Button type="submit" disabled={setupPending}>
          {t(setupPending ? "starting" : "turnOn")}
        </Button>
      </div>
    </form>
  )
}

/** `regenState`/`offState` and their dispatches come from `TwoFactorCard` (lifted) for the same
 * reason as `SetupStep`'s `enableState`: a successful regenerate is shown by the parent before
 * this component is reached, but a successful *disable* flips `enabled` to false, which unmounts
 * this component entirely — its message has nowhere to go but back up to the parent too (shown in
 * `OffStep` instead, as `notice`). */
function OnStep({
  recoveryCodesLeft,
  requiredBy,
  regenState,
  regenAction,
  regenPending,
  offState,
  offAction,
  offPending,
}: {
  recoveryCodesLeft: number
  /** Workspaces that would block this account once it is off (see `requirementWarnings`). */
  requiredBy: string[]
  regenState: Extract<TwoFactorRegenerateState, { ok: false }>
  regenAction: Dispatch
  regenPending: boolean
  offState: FormState
  offAction: Dispatch
  offPending: boolean
}) {
  const t = useTranslations("account")
  const low = recoveryCodesLeft <= RECOVERY_CODES_WARNING

  return (
    <div className="grid gap-6 px-6 py-5">
      <div className="grid gap-1 text-sm">
        <p>{t("twoFactor.isOn")}</p>
        <p className={low ? "text-destructive" : "text-muted-foreground"}>
          {t("twoFactor.codesLeft", { count: recoveryCodesLeft, low: low ? "yes" : "no" })}
        </p>
      </div>

      <form action={regenAction} className="grid max-w-56 gap-3" noValidate>
        <FormMessage state={regenState} />
        <div className="grid gap-1.5">
          <Label htmlFor="regen-code">{t("common.code")}</Label>
          <Input
            id="regen-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={20}
            {...fieldAria("code", regenState, "regen-hint")}
          />
          <p id="regen-hint" className="text-muted-foreground text-xs">
            {t("twoFactor.regenHint")}
          </p>
          <FieldError name="code" state={regenState} />
        </div>
        <div>
          <Button type="submit" variant="outline" disabled={regenPending}>
            {t(regenPending ? "twoFactor.regenerating" : "twoFactor.regenerate")}
          </Button>
        </div>
      </form>

      <form action={offAction} className="grid max-w-56 gap-3" noValidate>
        <FormMessage state={offState} />
        <div className="grid gap-1.5">
          <Label htmlFor="off-code">{t("common.code")}</Label>
          <Input
            id="off-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={20}
            {...fieldAria("code", offState, "off-hint")}
          />
          <p id="off-hint" className="text-muted-foreground text-xs">
            {t("twoFactor.offHint")}
          </p>
          <FieldError name="code" state={offState} />
        </div>
        {requiredBy.length > 0 && (
          <p id="off-warning" className="text-destructive text-sm">
            {t("security.turnOffBlocks", { names: requiredBy.join(", ") })}
          </p>
        )}
        <div>
          <Button
            type="submit"
            variant="destructive"
            disabled={offPending}
            aria-describedby={requiredBy.length > 0 ? "off-warning" : undefined}
          >
            {t(offPending ? "twoFactor.turningOff" : "twoFactor.turnOff")}
          </Button>
        </div>
      </form>
    </div>
  )
}

/**
 * The Security page's "Two-step verification" card: off → setup (QR + secret, then a code) →
 * recovery codes once, or on → status + regenerate / turn off. Server-rendered and works without
 * JavaScript (every form is a plain `useActionState` action, like the rest of this app's forms);
 * read-only while impersonating, since the api refuses every write with that session anyway.
 *
 * All four `useActionState` hooks are called here, unconditionally, rather than inside the
 * off/setup/on sub-components — and stay that way even though only one or two are ever "live" at
 * once: see `resolveTwoFactorView` for why (a round trip that changes which branch would
 * otherwise render, in both the JS and no-JS case). That function also decides which of the four
 * sub-components below gets rendered; this component only owns the hooks and the JSX per `kind`.
 */
export function TwoFactorCard({
  enabled,
  recoveryCodesLeft,
  isImpersonating,
  emailVerified,
  hasPassword,
  requiredBy = [],
}: {
  enabled: boolean
  recoveryCodesLeft: number
  isImpersonating: boolean
  emailVerified: boolean
  /** Whether setup must send the current password (see `OffStep`). */
  hasPassword: boolean
  /** Workspaces that require two-step verification and would block this account once it is
   * turned off (empty when a passkey still satisfies them). Turning off stays allowed. */
  requiredBy?: string[]
}) {
  const t = useTranslations("account.twoFactor")
  const [setupState, setupAction, setupPending] = useActionState(setupTwoFactor, {
    ok: false,
    message: "",
  } as TwoFactorSetupState)
  const [enableState, enableAction, enablePending] = useActionState(enableTwoFactor, {
    ok: false,
  } as TwoFactorEnableState)
  const [regenState, regenAction, regenPending] = useActionState(regenerateRecoveryCodes, {
    ok: false,
  } as TwoFactorRegenerateState)
  const [offState, offAction, offPending] = useActionState(disableTwoFactor, {
    ok: false,
  } as FormState)

  // Which action's result is the newest, so a stale one never masks it (see
  // `resolveTwoFactorView`). React's "adjust state while rendering" pattern: each action returns
  // a new state object, so an identity change names the action that just finished.
  const states = { setup: setupState, enable: enableState, regen: regenState, off: offState }
  const [seen, setSeen] = useState<{ states: typeof states; last?: TwoFactorAction }>({ states })
  const changed = (Object.keys(states) as TwoFactorAction[]).find(
    (key) => states[key] !== seen.states[key]
  )
  if (changed) setSeen({ states, last: changed })

  const view = resolveTwoFactorView({
    enabled,
    isImpersonating,
    setupState,
    enableState,
    regenState,
    offState,
    emailVerified,
    lastSubmitted: changed ?? seen.last,
    startAgain: t("startAgain"),
  })

  switch (view.kind) {
    case "recoveryCodes":
      return <RecoveryCodes codes={view.codes} />
    case "impersonating":
      return (
        <div className="grid gap-1 px-6 py-5 text-sm">
          <p>{t("status", { enabled: view.enabled ? "yes" : "no" })}</p>
          <p className="text-muted-foreground">{t("impersonating")}</p>
        </div>
      )
    case "setup":
      return (
        <SetupStep
          setupState={view.setupState}
          enableState={view.enableState}
          enableAction={enableAction}
          enablePending={enablePending}
        />
      )
    case "off":
      return (
        <OffStep
          notice={view.notice}
          hasPassword={hasPassword}
          setupAction={setupAction}
          setupPending={setupPending}
        />
      )
    case "unverified":
      return (
        <div className="grid gap-3 px-6 py-5 text-sm">
          <FormMessage state={view.notice} />
          <p>
            {t.rich("unverified", {
              link: (chunks) => (
                <a href="/personal-info" className="underline underline-offset-4">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      )
    case "on":
      return (
        <OnStep
          recoveryCodesLeft={recoveryCodesLeft}
          requiredBy={requiredBy}
          regenState={view.regenState}
          regenAction={regenAction}
          regenPending={regenPending}
          offState={view.offState}
          offAction={offAction}
          offPending={offPending}
        />
      )
  }
}
