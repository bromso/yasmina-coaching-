"use client"

import type { Passkey } from "@repo/api-contract"
import { MAX_PASSKEYS } from "@repo/api-contract/passkey-limits"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import {
  FieldError,
  FormMessage,
  type FormState,
  fieldAria,
} from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser"
import { startRegistration } from "@simplewebauthn/browser"
import { useTranslations } from "next-intl"
import {
  type FormEvent,
  type KeyboardEvent,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  deletePasskey,
  passkeyRegister,
  passkeyRegisterOptions,
  renamePasskey,
} from "@/app/(account)/security/actions"
import { ReauthNotice } from "@/components/reauth-notice"
import {
  classifyPasskeyRegisterError,
  focusHeadingAfterRemove,
  passkeyRegisterErrorState,
} from "@/lib/passkey"

/** `passkeyRegisterOptions`'s refusal keeps the shape its core returns — see `actions.ts`. */
type AddState = FormState & { reauthHref?: string }

const subscribeNever = () => () => {}

/**
 * **Add a passkey**: needs JavaScript (WebAuthn has no no-JS path). Before hydration (and, with
 * JavaScript off, forever) it renders the same form as an invisible, `aria-hidden`, `inert`
 * placeholder of identical size, hidden outright under `[@media(scripting:none)]` — exactly
 * `apps/auth`'s `PasskeySignIn` placeholder: the cards below it never shift when the real form
 * takes its place, and a visitor with scripts off sees no gap and no dead control. Support is
 * assumed while a mount effect checks `window.PublicKeyCredential`; only a browser with no WebAuthn
 * at all collapses the block (the one case that shifts the page).
 *
 * Two server round trips with a browser ceremony in between: `passkeyRegisterOptions` (sending
 * the current password when the account has one — the api re-checks it exactly as two-step setup
 * does, so a wrong one is a field error and a stale session on a passwordless account is
 * `ReauthNotice`, never a plain message), then `startRegistration`, then `passkeyRegister` with
 * the signed response and whatever name was typed. Because of that round trip this is a plain
 * `onSubmit` handler over local state rather than a `<form action>` read by `useActionState` —
 * there is no single server action that could own the whole thing.
 */
function AddPasskeyForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("account.passkeys")
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
  // `null` until the mount effect checks `window.PublicKeyCredential`, treated as "show".
  const [supported, setSupported] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<AddState>({ ok: false })
  const passwordId = useId()
  const nameId = useId()
  // Guards every state update that resumes after an `await`: a slow ceremony can still be in
  // flight when the visitor navigates away from the page.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  useEffect(() => {
    setSupported(typeof window !== "undefined" && Boolean(window.PublicKeyCredential))
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fd = new FormData(form)
    setPending(true)
    setState({ ok: false })
    try {
      const options = await passkeyRegisterOptions(fd)
      if (!mountedRef.current) return
      if (!options.ok) {
        setState(options)
        return
      }
      let response: unknown
      try {
        response = await startRegistration({
          optionsJSON: options.options as PublicKeyCredentialCreationOptionsJSON,
        })
      } catch (error) {
        if (!mountedRef.current) return
        const display = classifyPasskeyRegisterError(error)
        const next = passkeyRegisterErrorState(display, {
          cancelled: t("cancelled"),
          exists: t("exists"),
          failed: t("ceremonyFailed"),
        })
        if (next) setState(next)
        return
      }
      const registerFd = new FormData()
      registerFd.set("challengeId", options.challengeId)
      registerFd.set("response", JSON.stringify(response))
      registerFd.set("name", String(fd.get("name") ?? ""))
      const out = await passkeyRegister(registerFd)
      if (!mountedRef.current) return
      setState(out)
      if (out.ok) form.reset()
    } catch {
      // A server action that rejected outright (a dropped connection, or a deploy that no longer
      // knows this action's id): the same translated failure the ceremony itself would show.
      if (mountedRef.current) setState({ ok: false, message: t("ceremonyFailed") })
    } finally {
      if (mountedRef.current) setPending(false)
    }
  }

  if (supported === false) return null

  const reauthHref = !state.ok ? state.reauthHref : undefined

  const form = (
    <form onSubmit={handleSubmit} noValidate className="grid gap-3 border-t px-6 py-5">
      <p className="text-sm font-medium">{t("addHeading")}</p>
      {reauthHref ? (
        <ReauthNotice message={state.message} href={reauthHref} />
      ) : (
        <FormMessage state={state} />
      )}
      {hasPassword && (
        <div className="grid max-w-72 gap-1.5">
          <Label htmlFor={passwordId}>{t("currentPassword")}</Label>
          <Input
            id={passwordId}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            {...fieldAria("currentPassword", state, undefined, { idPrefix: passwordId })}
          />
          <FieldError name="currentPassword" state={state} idPrefix={passwordId} />
        </div>
      )}
      <div className="grid max-w-72 gap-1.5">
        <Label htmlFor={nameId}>{t("nameFieldLabel")}</Label>
        <Input id={nameId} name="name" maxLength={60} autoComplete="off" />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("adding") : t("addButton")}
        </Button>
      </div>
    </form>
  )

  if (!hydrated) {
    return (
      <div aria-hidden="true" inert className="invisible [@media(scripting:none)]:hidden">
        {form}
      </div>
    )
  }

  return form
}

/** The requirement warning's id, for the warned row's **Remove** button's `aria-describedby`. */
const PASSKEY_WARNING_ID = "passkey-requirement-warning"

/** One row: an inline rename form and a remove form, sharing the list's two `useActionState`
 * results (`renameState`/`removeState`) — every row posts into the same action, told apart by its
 * hidden `id` field, exactly as `MembersList`'s role form does. */
function PasskeyRow({
  passkey,
  locale,
  disabled,
  renameAction,
  renamePending,
  removeAction,
  removePending,
  armed,
  onArm,
  onDisarm,
  warning,
}: {
  passkey: Passkey
  locale: Locale
  disabled: boolean
  renameAction: (payload: FormData) => void
  renamePending: boolean
  removeAction: (payload: FormData) => void
  removePending: boolean
  /** Whether this row's own **Remove** was clicked once already (armed, awaiting confirmation). */
  armed: boolean
  onArm: () => void
  onDisarm: () => void
  /** What removing this passkey would block (only on the account's one passkey, with two-step
   * off): shown beside this row's **Remove** and read with it. */
  warning?: string
}) {
  const t = useTranslations("account.passkeys")
  const inputId = useId()
  const metaId = useId()
  const nameTextId = useId()
  const removeRef = useRef<HTMLButtonElement>(null)
  const neverUsed = passkey.lastUsedAt == null

  // Cancel (or Escape) puts focus back on this row's own Remove button — Cancel itself unmounts,
  // and focus must not fall to the page's body.
  function disarm() {
    onDisarm()
    removeRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (armed && event.key === "Escape") {
      event.preventDefault()
      disarm()
    }
  }

  return (
    <li className="flex flex-col gap-3 px-6 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <form action={renameAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={passkey.id} />
          <Label htmlFor={inputId} className="sr-only">
            {t("renameLabel", { name: passkey.name })}
          </Label>
          <Input
            id={inputId}
            name="name"
            defaultValue={passkey.name}
            maxLength={60}
            required
            disabled={disabled}
            aria-describedby={metaId}
            className="h-8 max-w-48"
          />
          <Button type="submit" variant="outline" size="sm" disabled={disabled || renamePending}>
            {t("save")}
          </Button>
        </form>
        <span id={metaId} className="text-muted-foreground text-xs">
          {t("meta", {
            date: formatUtcDate(passkey.createdAt, locale),
            neverUsed: neverUsed ? "yes" : "no",
            ...(neverUsed
              ? {}
              : { lastUsedDate: formatUtcDate(passkey.lastUsedAt as string, locale) }),
          })}
        </span>
        {/* Text (not the editable input above) for the remove button's `aria-describedby`. */}
        <span id={nameTextId} className="sr-only">
          {passkey.name}
        </span>
      </div>
      <form
        action={removeAction}
        onSubmit={(event) => {
          if (!armed) {
            event.preventDefault()
            onArm()
          }
        }}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="id" value={passkey.id} />
        <Button
          ref={removeRef}
          type="submit"
          variant={armed ? "destructive" : "outline"}
          size="sm"
          disabled={disabled || removePending}
          aria-describedby={warning ? `${nameTextId} ${PASSKEY_WARNING_ID}` : nameTextId}
        >
          {armed ? t("removeConfirm") : t("remove")}
        </Button>
        {armed && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={disarm}>
            {t("cancel")}
          </Button>
        )}
      </form>
      {warning && (
        <p id={PASSKEY_WARNING_ID} className="text-destructive basis-full">
          {warning}
        </p>
      )}
    </li>
  )
}

/**
 * The Security page's "Passkeys" card: the list (name, added/last-used dates, rename and remove),
 * then **Add a passkey**. Works without JavaScript except for adding — rename and remove are
 * plain `useActionState` forms, like the rest of this page. Read-only while impersonating: the
 * list stays visible, every write control is disabled, and the two-step card's own notice repeats
 * once rather than on every row.
 *
 * Removing is a two-click confirmation, not `window.confirm()` (the viewer's sandbox refuses that
 * dialog anyway): a first click arms that row's own **Remove** button, turning it destructive and
 * relabelling it, with a **Cancel** beside it; a second click submits. Arming is announced through
 * a polite status naming the passkey (a relabel of the already focused button is not announced by
 * every screen reader); **Cancel** or Escape disarms and returns focus to that **Remove** button,
 * and any answer to a removal — including a refusal, such as the last-way-in conflict or a passkey
 * already gone — disarms the row. A successful removal unmounts the row holding focus, so focus
 * moves to the card's title (`PASSKEYS_HEADING_ID`, `tabIndex={-1}`) rather than falling to
 * `<body>`. At `MAX_PASSKEYS` the add form gives way to a sentence saying why. Without JavaScript this
 * `onSubmit` guard never runs, so the plain button removes on the first click, the same way
 * `SessionsList`'s **Sign out** does — the confirmation is a client-side enhancement over a form
 * that already works without one.
 */
export function PasskeysCard({
  passkeys,
  hasPassword,
  isImpersonating,
  locale,
  requiredBy = [],
}: {
  passkeys: Passkey[]
  hasPassword: boolean
  isImpersonating: boolean
  locale: Locale
  /** Workspaces that require two-step verification and would block this account once its only
   * passkey is removed (empty unless two-step is off and this is the last one). Removing stays
   * allowed. */
  requiredBy?: string[]
}) {
  const t = useTranslations("account.passkeys")
  const tSecurity = useTranslations("account.security")
  // Only the account's one passkey can carry it (`requirementWarnings`), so the id stays unique.
  const warning =
    requiredBy.length > 0
      ? tSecurity("removeLastPasskeyBlocks", { names: requiredBy.join(", ") })
      : undefined
  const [renameState, renameAction, renamePending] = useActionState(renamePasskey, {
    ok: false,
  } as FormState)
  const [removeState, removeAction, removePending] = useActionState(deletePasskey, {
    ok: false,
  } as FormState)
  const [armedId, setArmedId] = useState<number | null>(null)
  // Every answer to a removal disarms: on success the row is gone anyway, and a refused one (the
  // last way in, or a passkey removed elsewhere) must not leave "Confirm removal" armed. Adjusted
  // during render, React's own pattern for state that follows a changing value.
  const [answeredRemove, setAnsweredRemove] = useState(removeState)
  if (removeState !== answeredRemove) {
    setAnsweredRemove(removeState)
    setArmedId(null)
  }
  const armedPasskey = passkeys.find((passkey) => passkey.id === armedId)
  // A successful removal unmounts the focused row: move focus to the card's title instead.
  useEffect(() => {
    focusHeadingAfterRemove(removeState)
  }, [removeState])

  return (
    <>
      {/* Always mounted, so the live regions inside it exist before a message arrives. */}
      <div
        className={renameState.message || removeState.message ? "grid gap-2 px-6 py-4" : undefined}
      >
        <FormMessage state={renameState} />
        <FormMessage state={removeState} />
      </div>
      {/* Always mounted (empty until a row is armed), so the arming is announced. */}
      <p role="status" className="sr-only">
        {armedPasskey ? t("armedHint", { name: armedPasskey.name }) : null}
      </p>
      {passkeys.length === 0 ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {passkeys.map((passkey) => (
            <PasskeyRow
              key={passkey.id}
              passkey={passkey}
              locale={locale}
              disabled={isImpersonating}
              renameAction={renameAction}
              renamePending={renamePending}
              removeAction={removeAction}
              removePending={removePending}
              armed={armedId === passkey.id}
              onArm={() => setArmedId(passkey.id)}
              onDisarm={() => setArmedId(null)}
              warning={warning}
            />
          ))}
        </ul>
      )}
      {isImpersonating ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("impersonating")}</p>
      ) : passkeys.length >= MAX_PASSKEYS ? (
        // The api refuses an eleventh (CONFLICT): say why, rather than offer a form that fails.
        <p className="text-muted-foreground px-6 py-4 text-sm">
          {t("limitReached", { max: MAX_PASSKEYS })}
        </p>
      ) : (
        <AddPasskeyForm hasPassword={hasPassword} />
      )}
    </>
  )
}
