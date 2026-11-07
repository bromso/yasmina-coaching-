"use client"

import type { ApiKeySummary } from "@repo/api-contract"
import {
  API_KEY_EXPIRY_DAYS,
  API_SCOPES,
  type ApiKeyStatus,
  type ApiScope,
  DEFAULT_API_KEY_EXPIRY_DAYS,
} from "@repo/api-contract/api-keys-limits"
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
import { useTranslations } from "next-intl"
import {
  type KeyboardEvent,
  type MouseEvent,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { flushSync } from "react-dom"
import { createApiKey, revokeApiKey } from "@/app/(account)/workspace/actions"
import { NativeSelect } from "@/components/native-select"
import { dismissCreatedKey, focusApiKeysHeadingAfterRevoke } from "@/lib/api-keys-focus"
import { discardOnPersistedPageHide } from "@/lib/discard-on-page-hide"
import type { CreateApiKeyState } from "@/lib/workspace-actions"

const initialCreateState: CreateApiKeyState = { ok: false }
const initialRevokeState: FormState = { ok: false }

/** A `CreateApiKeyState` narrowed to the plain `FormState` shape `FormMessage` / `FieldError` /
 * `fieldAria` accept — its own `values.scopes` is a `string[]`, which `FormState`'s `values:
 * Record<string, string>` cannot describe, so the two types are never assignable to one another
 * even though these three helpers only ever read `ok`, `message` and `fieldErrors`. */
function messageState(state: CreateApiKeyState): FormState {
  return state.ok
    ? { ok: true }
    : { ok: false, message: state.message, fieldErrors: state.fieldErrors }
}

/** Every scope's words, by the raw value a checkbox submits (`fd.getAll("scopes")`) — a switch,
 * not a lookup object, so each call is a literal key next-intl's strict typing can check (an
 * object indexed by a variable loses that). */
function scopeLabel(t: ReturnType<typeof useTranslations<"account.apiKeys">>, scope: ApiScope) {
  switch (scope) {
    case "workspace:read":
      return t("scopeWorkspaceRead")
    case "members:read":
      return t("scopeMembersRead")
    case "notes:read":
      return t("scopeNotesRead")
    case "notes:write":
      return t("scopeNotesWrite")
  }
}

function statusLabel(
  t: ReturnType<typeof useTranslations<"account.apiKeys">>,
  status: ApiKeyStatus
) {
  switch (status) {
    case "active":
      return t("statusActive")
    case "expired":
      return t("statusExpired")
    case "revoked":
      return t("statusRevoked")
  }
}

/** Copy is an enhancement only: without JavaScript the key is already selectable text in the
 * read-only input above it. */
function CopyButton({ text }: { text: string }) {
  const t = useTranslations("account.apiKeys")
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
 * `create`'s own answer, shown exactly once: held only in `CreateApiKeySection`'s React state
 * (never a cookie, the URL, or anything a later `revalidatePath` could re-expose). **Done** is a
 * plain link to `/workspace`: without JavaScript that GET discards the form's POST result, the key
 * with it, and never re-submits; once hydrated, `onDone` cancels the navigation and remounts the
 * section instead, which drops the key from React state too (`dismissCreatedKey`).
 *
 * Like `TwoFactorCard`'s `RecoveryCodes` and `EmailConfirmSuccess`, focus moves to this panel's
 * own heading on mount: nothing else on the page changed to draw a screen reader's attention to
 * the swap, and the button that had focus a moment ago (**Create key**) is gone from the DOM.
 */
export function CreatedKeyPanel({
  keyValue,
  onDone,
}: {
  keyValue: string
  onDone: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const t = useTranslations("account.apiKeys")
  const inputId = useId()
  const headingRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  return (
    <div className="grid gap-3 border-t px-6 py-5">
      <p ref={headingRef} tabIndex={-1} className="text-sm font-medium outline-none">
        {t("createdHeading")}
      </p>
      <p className="text-destructive text-sm">{t("createdWarning")}</p>
      <div className="grid max-w-lg gap-1.5">
        <Label htmlFor={inputId}>{t("keyFieldLabel")}</Label>
        <Input
          id={inputId}
          readOnly
          value={keyValue}
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={keyValue} />
        <Button asChild size="sm">
          <a href="/workspace" onClick={onDone}>
            {t("done")}
          </a>
        </Button>
      </div>
    </div>
  )
}

/** One key's row: its details, then **Revoke** (two-click, like `PasskeysCard`'s **Remove**) for
 * a key that is still active — a revoked or expired key keeps its place in the list but offers no
 * action. */
function ApiKeyRow({
  apiKey,
  workspaceId,
  locale,
  disabled,
  armed,
  onArm,
  onDisarm,
  revokeAction,
  revokePending,
}: {
  apiKey: ApiKeySummary
  /** The current workspace, as a hidden field — `revokeApiKey`'s `sameWorkspace` check refuses
   * the whole submission without it, exactly as `MembersList` / `InvitationsList` / `DangerZone`'s
   * row forms already carry it. */
  workspaceId: number
  locale: Locale
  disabled: boolean
  armed: boolean
  onArm: () => void
  onDisarm: () => void
  revokeAction: (payload: FormData) => void
  revokePending: boolean
}) {
  const t = useTranslations("account.apiKeys")
  const removeRef = useRef<HTMLButtonElement>(null)
  const nameTextId = useId()

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

  const creator = apiKey.creatorLeft
    ? t("creatorFormer")
    : (apiKey.createdBy?.name ?? t("creatorFormer"))
  const scopesText = apiKey.scopes.map((scope) => scopeLabel(t, scope)).join(", ")

  return (
    <li className="flex flex-col gap-2 px-6 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{apiKey.name}</p>
          <p className="text-muted-foreground font-mono text-xs">
            {t("keyPrefix", { prefix: apiKey.prefix })}
          </p>
        </div>
        <span className="text-muted-foreground text-xs">{statusLabel(t, apiKey.status)}</span>
      </div>
      <p className="text-muted-foreground text-xs">{scopesText}</p>
      <p className="text-muted-foreground text-xs">
        {t("createdBy", { date: formatUtcDate(apiKey.createdAt, locale), creator })}
        {" · "}
        {t("lastUsed", {
          date: apiKey.lastUsedAt ? formatUtcDate(apiKey.lastUsedAt, locale) : t("never"),
        })}
        {" · "}
        {t("expires", {
          date: apiKey.expiresAt ? formatUtcDate(apiKey.expiresAt, locale) : t("never"),
        })}
      </p>
      {/* Text (not shown elsewhere as a single node) for the revoke button's `aria-describedby`. */}
      <span id={nameTextId} className="sr-only">
        {apiKey.name}
      </span>
      {apiKey.status === "active" && (
        <form
          action={revokeAction}
          onSubmit={(event) => {
            if (!armed) {
              event.preventDefault()
              onArm()
            }
          }}
          onKeyDown={handleKeyDown}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="id" value={apiKey.id} />
          <Button
            ref={removeRef}
            type="submit"
            variant={armed ? "destructive" : "outline"}
            size="sm"
            disabled={disabled || revokePending}
            aria-describedby={nameTextId}
          >
            {armed ? t("revokeConfirm") : t("revoke")}
          </Button>
          {armed && (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={disarm}>
              {t("cancel")}
            </Button>
          )}
        </form>
      )}
    </li>
  )
}

/**
 * The create form: a name, scope checkboxes (none ticked), and an expiry `<select>` of 30/90/365
 * days or "no expiry" (default 90). Choosing "no expiry" shows a warning — through `group-has-*`,
 * pure CSS reacting to the `<select>`'s own native state, so it shows (and hides again) with no
 * JavaScript at all, exactly as the browser's own selection does.
 */
function CreateApiKeyForm({
  workspaceId,
  action,
  pending,
  state,
}: {
  workspaceId: number
  action: (payload: FormData) => void
  pending: boolean
  state: CreateApiKeyState
}) {
  const t = useTranslations("account.apiKeys")
  const nameId = useId()
  const expiryId = useId()
  const scopesId = useId()
  const values = state.ok ? undefined : state.values
  const fs = messageState(state)

  return (
    <form action={action} noValidate className="grid gap-4 border-t px-6 py-5">
      <FormMessage state={fs} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="grid max-w-72 gap-1.5">
        <Label htmlFor={nameId}>{t("nameFieldLabel")}</Label>
        <Input
          id={nameId}
          name="name"
          required
          maxLength={60}
          defaultValue={values?.name ?? ""}
          {...fieldAria("name", fs)}
        />
        <FieldError name="name" state={fs} />
      </div>
      <fieldset className="grid gap-2" {...fieldAria("scopes", fs)}>
        <legend className="text-sm font-medium">{t("scopesLegend")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {API_SCOPES.map((scope) => {
            const id = `${scopesId}-${scope.replace(":", "-")}`
            return (
              <div key={scope} className="flex items-center gap-2">
                {/* Native, not the Radix Checkbox: that one submits its value only once hydrated. */}
                <input
                  type="checkbox"
                  id={id}
                  name="scopes"
                  value={scope}
                  defaultChecked={values?.scopes.includes(scope) ?? false}
                  className="size-4 accent-primary"
                />
                <Label htmlFor={id} className="text-sm font-normal">
                  {scopeLabel(t, scope)}
                </Label>
              </div>
            )
          })}
        </div>
        <FieldError name="scopes" state={fs} />
      </fieldset>
      <div className="group grid max-w-72 gap-1.5">
        <Label htmlFor={expiryId}>{t("expiryFieldLabel")}</Label>
        <NativeSelect
          id={expiryId}
          name="expiresInDays"
          defaultValue={values?.expiresInDays ?? String(DEFAULT_API_KEY_EXPIRY_DAYS)}
          {...fieldAria("expiresInDays", fs)}
        >
          {API_KEY_EXPIRY_DAYS.map((days) => (
            <option key={days} value={days}>
              {t("expiryDays", { days })}
            </option>
          ))}
          <option value="none">{t("expiryNone")}</option>
        </NativeSelect>
        <FieldError name="expiresInDays" state={fs} />
        {/* No JavaScript needed: `:checked` on the option is the browser's own live state, and
            `group-has-*` reacts to it purely in CSS — the warning shows and hides exactly when
            "No expiry" is the selected option, scripting or not. */}
        <p className="text-xs text-amber-600 group-has-[option[value=none]:checked]:block hidden dark:text-amber-500">
          {t("expiryWarning")}
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("creating") : t("create")}
        </Button>
      </div>
    </form>
  )
}

/**
 * The create form, then — once a key is created — the show-once panel in its place. Its own
 * component so the card can remount it (a new `key`) on **Done**: that resets `useActionState`,
 * the only place the key was ever held.
 */
function CreateApiKeySection({
  workspaceId,
  onDone,
}: {
  workspaceId: number
  onDone: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const [createState, createAction, creating] = useActionState(createApiKey, initialCreateState)
  if (createState.ok) return <CreatedKeyPanel keyValue={createState.key} onDone={onDone} />
  return (
    <CreateApiKeyForm
      workspaceId={workspaceId}
      action={createAction}
      pending={creating}
      state={createState}
    />
  )
}

/**
 * The Workspace page's "API keys" card, for an admin (or owner) — `WorkspaceView` decides that,
 * and whether the plan allows creating (`canCreate`: the `api` feature); listing and revoking work
 * on every plan, so a downgraded workspace's keys can still be retired. Works without JavaScript
 * except the show-once panel's copy button; read-only while impersonating, like `PasskeysCard`.
 */
export function ApiKeysCard({
  apiKeys,
  workspaceId,
  isImpersonating,
  canCreate = true,
  locale,
  docsUrl,
}: {
  apiKeys: ApiKeySummary[]
  workspaceId: number
  isImpersonating: boolean
  /** False on a plan without the `api` feature: the list and Revoke stay, the create form goes
   * (`WorkspaceView` shows the upsell in its place). */
  canCreate?: boolean
  locale: Locale
  /** `${siteUrl("docs")}/developers/authentication`, computed server-side by `page.tsx` — this
   * is a Client Component and must never import `@repo/sites` itself. */
  docsUrl: string
}) {
  const t = useTranslations("account.apiKeys")
  const [revokeState, revokeAction, revoking] = useActionState(revokeApiKey, initialRevokeState)
  const [armedId, setArmedId] = useState<number | null>(null)
  // Every answer to a revoke disarms: on success the row's button is gone (or disabled) anyway,
  // and a refusal must not leave "Confirm revoke" armed. Adjusted during render, as `PasskeysCard`
  // does for the same reason.
  const [answeredRevoke, setAnsweredRevoke] = useState(revokeState)
  if (revokeState !== answeredRevoke) {
    setAnsweredRevoke(revokeState)
    setArmedId(null)
  }
  const armedKey = apiKeys.find((key) => key.id === armedId)
  // A successful revoke unmounts the row's form and the button that held focus.
  useEffect(() => focusApiKeysHeadingAfterRevoke(revokeState), [revokeState])

  // Bumped by **Done**: a new `key` remounts the create section, dropping the created key.
  const [createGeneration, setCreateGeneration] = useState(0)
  // And as the page goes into the back-forward cache, so Back never shows the key again —
  // synchronously, since a scheduled render might not run before the page is frozen.
  useEffect(
    () =>
      discardOnPersistedPageHide(window, () =>
        flushSync(() => setCreateGeneration((generation) => generation + 1))
      ),
    []
  )

  return (
    <>
      {/* Always mounted, so the live region inside it exists before a message arrives. */}
      <div className={revokeState.message ? "grid gap-2 px-6 py-4" : undefined}>
        <FormMessage state={revokeState} />
      </div>
      {/* Always mounted (empty until a row is armed), so the arming is announced. */}
      <p role="status" className="sr-only">
        {armedKey ? t("armedHint", { name: armedKey.name }) : null}
      </p>
      {apiKeys.length === 0 ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {apiKeys.map((apiKey) => (
            <ApiKeyRow
              key={apiKey.id}
              apiKey={apiKey}
              workspaceId={workspaceId}
              locale={locale}
              disabled={isImpersonating}
              armed={armedId === apiKey.id}
              onArm={() => setArmedId(apiKey.id)}
              onDisarm={() => setArmedId(null)}
              revokeAction={revokeAction}
              revokePending={revoking}
            />
          ))}
        </ul>
      )}
      {isImpersonating ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("impersonating")}</p>
      ) : canCreate ? (
        <CreateApiKeySection
          key={createGeneration}
          workspaceId={workspaceId}
          onDone={(event) =>
            dismissCreatedKey(event, () => setCreateGeneration((generation) => generation + 1))
          }
        />
      ) : null}
      <p className="border-t px-6 py-4 text-sm">
        <a href={docsUrl} className="underline underline-offset-4">
          {t("docsLink")}
        </a>
      </p>
    </>
  )
}
