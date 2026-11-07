"use client"

import type { WebhookDelivery, WebhookEndpoint } from "@repo/api-contract"
import {
  WEBHOOK_DESCRIPTION_MAX,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_URL_MAX,
  type WebhookDeliveryError,
  type WebhookDeliveryEventType,
  type WebhookDisabledReason,
} from "@repo/api-contract/webhooks-limits"
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
import {
  createWebhook,
  deleteWebhook,
  rotateWebhookSecret,
  testWebhook,
  updateWebhook,
} from "@/app/(account)/workspace/actions"
import { discardOnPersistedPageHide } from "@/lib/discard-on-page-hide"
import {
  dismissCreatedWebhookSecret,
  dismissRotatedWebhookSecret,
  focusWebhooksHeadingAfterDelete,
} from "@/lib/webhooks-focus"
import type {
  CreateWebhookState,
  RotateWebhookSecretState,
  TestWebhookState,
  UpdateWebhookState,
} from "@/lib/workspace-actions"

const initialCreateState: CreateWebhookState = { ok: false }
const initialUpdateState: UpdateWebhookState = { ok: false }
const initialRotateState: RotateWebhookSecretState = { ok: false, message: "" }
const initialTestState: TestWebhookState = { ok: false, message: "" }
const initialDeleteState: FormState = { ok: false }

/** A `CreateWebhookState` / `UpdateWebhookState` narrowed to the plain `FormState` shape
 * `FormMessage` / `FieldError` / `fieldAria` accept — their own `values.events` is a `string[]`,
 * which `FormState`'s `values: Record<string, string>` cannot describe. Mirrors `api-keys-card`'s
 * `messageState`. */
function createMessageState(state: CreateWebhookState): FormState {
  return state.ok
    ? { ok: true }
    : { ok: false, message: state.message, fieldErrors: state.fieldErrors }
}
function updateMessageState(state: UpdateWebhookState): FormState {
  return state.ok
    ? { ok: true, message: state.message }
    : { ok: false, message: state.message, fieldErrors: state.fieldErrors }
}

/** Every event a delivery can name, by its raw value — a switch, not a lookup object, so each
 * call is a literal key next-intl's strict typing can check. Mirrors `scopeLabel`. */
function eventLabel(
  t: ReturnType<typeof useTranslations<"account.webhooks">>,
  event: WebhookDeliveryEventType
) {
  switch (event) {
    case "note.created":
      return t("eventNoteCreated")
    case "note.deleted":
      return t("eventNoteDeleted")
    case "member.joined":
      return t("eventMemberJoined")
    case "member.left":
      return t("eventMemberLeft")
    case "member.role_changed":
      return t("eventMemberRoleChanged")
    case "workspace.updated":
      return t("eventWorkspaceUpdated")
    case "api_key.created":
      return t("eventApiKeyCreated")
    case "api_key.revoked":
      return t("eventApiKeyRevoked")
    case "ping":
      return t("eventPing")
    default: {
      // A new event type without a case here (and its `account.webhooks.event*` keys) fails the
      // typecheck instead of rendering an `undefined` label.
      const unhandled: never = event
      return unhandled
    }
  }
}

function disabledReasonLabel(
  t: ReturnType<typeof useTranslations<"account.webhooks">>,
  reason: WebhookDisabledReason
) {
  switch (reason) {
    case "failures":
      return t("statusDisabledFailures")
    case "gone":
      return t("statusDisabledGone")
    case "manual":
      return t("statusDisabledManual")
  }
}

/** Active, or disabled with its reason — never just "off". */
function statusText(
  t: ReturnType<typeof useTranslations<"account.webhooks">>,
  endpoint: WebhookEndpoint
) {
  if (endpoint.enabled) return t("statusActive")
  return endpoint.disabledReason
    ? disabledReasonLabel(t, endpoint.disabledReason)
    : t("statusDisabledManual")
}

function deliveryErrorLabel(
  t: ReturnType<typeof useTranslations<"account.webhooks">>,
  error: WebhookDeliveryError
) {
  switch (error) {
    case "timeout":
      return t("errorTimeout")
    case "network":
      return t("errorNetwork")
    case "blocked":
      return t("errorBlocked")
    case "redirect":
      return t("errorRedirect")
    case "http":
      return t("errorHttp")
  }
}

/** The HTTP status on success, the error's class otherwise — never a response body. */
function deliveryOutcome(
  t: ReturnType<typeof useTranslations<"account.webhooks">>,
  delivery: WebhookDelivery
) {
  return delivery.error ? deliveryErrorLabel(t, delivery.error) : String(delivery.status)
}

/** One delivery's line: event, attempt, status or error class, duration, time — shared by the
 * row's "Last delivery" summary and each line of "Recent deliveries". */
function deliverySummaryText(
  t: ReturnType<typeof useTranslations<"account.webhooks">>,
  delivery: WebhookDelivery,
  locale: Locale
) {
  return [
    eventLabel(t, delivery.eventType),
    t("deliveryAttempt", { attempt: delivery.attempt }),
    deliveryOutcome(t, delivery),
    t("deliveryDuration", { ms: delivery.durationMs }),
    formatUtcDate(delivery.createdAt, locale, { time: true }),
  ].join(" · ")
}

/** Copy is an enhancement only: without JavaScript the secret is already selectable text in the
 * read-only input above it. Mirrors `api-keys-card`'s `CopyButton`. */
function CopyButton({ text }: { text: string }) {
  const t = useTranslations("account.webhooks")
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
 * A signing secret, shown exactly once: `create`'s and `rotateSecret`'s own answers, held only in
 * React state (never a cookie, the URL, or anything a later `revalidatePath` could re-expose).
 * **Done** is a plain link to `/workspace`: without JavaScript that GET discards the form's POST
 * result, the secret with it, and never re-submits; once hydrated, `onDone` cancels the navigation
 * and dismisses the panel instead. Shared by the add form (`AddWebhookSection`) and each row's
 * rotate form (`RotateSecretSection`); focus moves to its own heading on mount, like
 * `CreatedKeyPanel`'s.
 */
function WebhookSecretPanel({
  secret,
  heading,
  warning,
  onDone,
}: {
  secret: string
  heading: string
  warning: string
  onDone: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const t = useTranslations("account.webhooks")
  const inputId = useId()
  const headingRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  return (
    <div className="grid gap-3 border-t px-6 py-5">
      <p ref={headingRef} tabIndex={-1} className="text-sm font-medium outline-none">
        {heading}
      </p>
      <p className="text-destructive text-sm">{warning}</p>
      <div className="grid max-w-lg gap-1.5">
        <Label htmlFor={inputId}>{t("secretFieldLabel")}</Label>
        <Input
          id={inputId}
          readOnly
          value={secret}
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={secret} />
        <Button asChild size="sm">
          <a href="/workspace" onClick={onDone}>
            {t("done")}
          </a>
        </Button>
      </div>
    </div>
  )
}

/** The event checkboxes, none preselected on the add form: shared by `AddWebhookForm` and
 * `EditSection` so the two can never list the events differently. */
function EventsFieldset({
  idPrefix,
  checked,
  state,
  disabled,
}: {
  idPrefix: string
  checked: readonly string[]
  state: FormState
  disabled?: boolean
}) {
  const t = useTranslations("account.webhooks")
  return (
    <fieldset className="grid gap-2" {...fieldAria("events", state, undefined, { idPrefix })}>
      <legend className="text-sm font-medium">{t("eventsLegend")}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {WEBHOOK_EVENT_TYPES.map((event) => {
          const id = `${idPrefix}-${event.replace(/[._]/g, "-")}`
          return (
            <div key={event} className="flex items-center gap-2">
              {/* Native, not the Radix Checkbox: that one submits its value only once hydrated. */}
              <input
                type="checkbox"
                id={id}
                name="events"
                value={event}
                defaultChecked={checked.includes(event)}
                disabled={disabled}
                className="size-4 accent-primary"
              />
              <Label htmlFor={id} className="text-sm font-normal">
                {eventLabel(t, event)}
              </Label>
            </div>
          )
        })}
      </div>
      <FieldError name="events" state={state} idPrefix={idPrefix} />
    </fieldset>
  )
}

/** The add form: an endpoint URL, a description, and the event checkboxes (none ticked). */
function AddWebhookForm({
  workspaceId,
  action,
  pending,
  state,
}: {
  workspaceId: number
  action: (payload: FormData) => void
  pending: boolean
  state: CreateWebhookState
}) {
  const t = useTranslations("account.webhooks")
  const idPrefix = useId()
  const urlId = useId()
  const descriptionId = useId()
  const values = state.ok ? undefined : state.values
  const fs = createMessageState(state)
  return (
    <form action={action} noValidate className="grid gap-4 border-t px-6 py-5">
      <p className="text-sm font-medium">{t("addHeading")}</p>
      <FormMessage state={fs} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="grid max-w-lg gap-1.5">
        <Label htmlFor={urlId}>{t("urlFieldLabel")}</Label>
        <Input
          id={urlId}
          name="url"
          type="url"
          required
          maxLength={WEBHOOK_URL_MAX}
          defaultValue={values?.url ?? ""}
          {...fieldAria("url", fs, undefined, { idPrefix })}
        />
        <FieldError name="url" state={fs} idPrefix={idPrefix} />
      </div>
      <div className="grid max-w-lg gap-1.5">
        <Label htmlFor={descriptionId}>{t("descriptionFieldLabel")}</Label>
        <Input
          id={descriptionId}
          name="description"
          maxLength={WEBHOOK_DESCRIPTION_MAX}
          defaultValue={values?.description ?? ""}
          {...fieldAria("description", fs, undefined, { idPrefix })}
        />
        <FieldError name="description" state={fs} idPrefix={idPrefix} />
      </div>
      <EventsFieldset idPrefix={idPrefix} checked={values?.events ?? []} state={fs} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("adding") : t("add")}
        </Button>
      </div>
    </form>
  )
}

/** The add form, then — once an endpoint is created — the show-once secret panel in its place.
 * Its own component so the card can remount it (a new `key`) on **Done**: that resets
 * `useActionState`, the only place the secret was ever held. Mirrors `CreateApiKeySection`. */
function AddWebhookSection({
  workspaceId,
  onDone,
}: {
  workspaceId: number
  onDone: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const t = useTranslations("account.webhooks")
  const [state, action, pending] = useActionState(createWebhook, initialCreateState)
  if (state.ok) {
    return (
      <WebhookSecretPanel
        secret={state.secret}
        heading={t("createdHeading")}
        warning={t("createdWarning")}
        onDone={onDone}
      />
    )
  }
  return (
    <AddWebhookForm workspaceId={workspaceId} action={action} pending={pending} state={state} />
  )
}

/** One endpoint's edit form: URL, description, events and the `enabled` checkbox, all submitted
 * together (never a partial patch) — unlike the api's own `update`. Behind a disclosure, opened by
 * the reader or automatically once a submission fails (so the error stays visible). */
function EditSection({
  endpoint,
  workspaceId,
  disabled,
  describedBy,
}: {
  endpoint: WebhookEndpoint
  workspaceId: number
  disabled: boolean
  /** The row's visually hidden URL, so several rows' "Edit" can be told apart. */
  describedBy: string
}) {
  const t = useTranslations("account.webhooks")
  const [state, action, pending] = useActionState(updateWebhook, initialUpdateState)
  const idPrefix = useId()
  const urlId = useId()
  const descriptionId = useId()
  const enabledId = useId()
  const values = state.ok ? undefined : state.values
  const fs = updateMessageState(state)
  const open = !state.ok && (state.message != null || state.fieldErrors != null)

  return (
    <details open={open} className="border-t">
      <summary
        className="cursor-pointer px-6 py-3 text-sm font-medium"
        aria-describedby={describedBy}
      >
        {t("editSummary")}
      </summary>
      <form action={action} noValidate className="grid gap-4 px-6 py-4">
        <FormMessage state={fs} />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="id" value={endpoint.id} />
        <div className="grid max-w-lg gap-1.5">
          <Label htmlFor={urlId}>{t("urlFieldLabel")}</Label>
          <Input
            id={urlId}
            name="url"
            type="url"
            required
            maxLength={WEBHOOK_URL_MAX}
            disabled={disabled}
            defaultValue={values?.url ?? endpoint.url}
            {...fieldAria("url", fs, undefined, { idPrefix })}
          />
          <FieldError name="url" state={fs} idPrefix={idPrefix} />
        </div>
        <div className="grid max-w-lg gap-1.5">
          <Label htmlFor={descriptionId}>{t("descriptionFieldLabel")}</Label>
          <Input
            id={descriptionId}
            name="description"
            maxLength={WEBHOOK_DESCRIPTION_MAX}
            disabled={disabled}
            defaultValue={values?.description ?? endpoint.description ?? ""}
            {...fieldAria("description", fs, undefined, { idPrefix })}
          />
          <FieldError name="description" state={fs} idPrefix={idPrefix} />
        </div>
        <EventsFieldset
          idPrefix={idPrefix}
          checked={values?.events ?? endpoint.events}
          state={fs}
          disabled={disabled}
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={enabledId}
            name="enabled"
            defaultChecked={values?.enabled ?? endpoint.enabled}
            disabled={disabled}
            className="size-4 accent-primary"
          />
          <Label htmlFor={enabledId} className="text-sm font-normal">
            {t("enabledFieldLabel")}
          </Label>
        </div>
        <div>
          <Button type="submit" size="sm" disabled={disabled || pending}>
            {pending ? t("editSaving") : t("editSave")}
          </Button>
        </div>
      </form>
    </details>
  )
}

/** **Rotate secret**, then — once rotated — the show-once secret panel in its row's place.
 * Rotating breaks a live integration at once (no overlap window), so once hydrated it is two
 * clicks, like **Delete**: the first arms it and says so, the second (**Confirm rotate**) submits;
 * Escape or **Cancel** disarms. Without JavaScript the form submits on the first click, as
 * Delete's does. Remounted (a new `key`, bumped from the row) on **Done**, dropping the secret
 * from state; `focusOnMount` then puts focus back on this row's button. */
function RotateSecretSection({
  workspaceId,
  endpointId,
  disabled,
  describedBy,
  focusOnMount,
  onDone,
}: {
  workspaceId: number
  endpointId: number
  disabled: boolean
  /** The row's visually hidden URL, so several rows' "Rotate secret" can be told apart. */
  describedBy: string
  focusOnMount: boolean
  onDone: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const t = useTranslations("account.webhooks")
  const [state, action, pending] = useActionState(rotateWebhookSecret, initialRotateState)
  const [armed, setArmed] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Every answer disarms: a refusal must not leave "Confirm rotate" armed. Adjusted during render.
  const [answered, setAnswered] = useState(state)
  if (state !== answered) {
    setAnswered(state)
    setArmed(false)
  }
  useEffect(() => {
    if (focusOnMount) buttonRef.current?.focus()
  }, [focusOnMount])

  if (state.ok) {
    return (
      <WebhookSecretPanel
        secret={state.secret}
        heading={t("rotatedHeading")}
        warning={t("rotatedWarning")}
        onDone={onDone}
      />
    )
  }

  function disarm() {
    setArmed(false)
    buttonRef.current?.focus()
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!armed) {
          event.preventDefault()
          setArmed(true)
        }
      }}
      onKeyDown={(event: KeyboardEvent<HTMLFormElement>) => {
        if (armed && event.key === "Escape") {
          event.preventDefault()
          disarm()
        }
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="id" value={endpointId} />
      <Button
        ref={buttonRef}
        type="submit"
        variant={armed ? "destructive" : "outline"}
        size="sm"
        disabled={disabled || pending}
        aria-describedby={describedBy}
      >
        {pending ? t("rotatingSecret") : armed ? t("rotateConfirm") : t("rotateSecret")}
      </Button>
      {armed && (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={disarm}>
          {t("cancel")}
        </Button>
      )}
      {/* Always mounted (empty until armed), so the warning is announced when it appears. */}
      <span role="status" className="text-destructive text-xs">
        {armed ? t("rotateArmedWarning") : null}
      </span>
      {state.message && <span className="text-destructive text-xs">{state.message}</span>}
    </form>
  )
}

/** **Send test event**: queues one `ping` to this endpoint and shows the enqueue's own result —
 * never a delivery outcome, which only "Recent deliveries" (after the job runs) can show. */
function TestSection({
  workspaceId,
  endpointId,
  disabled,
  describedBy,
}: {
  workspaceId: number
  endpointId: number
  disabled: boolean
  /** The row's visually hidden URL, so several rows' "Send test event" can be told apart. */
  describedBy: string
}) {
  const t = useTranslations("account.webhooks")
  const [state, action, pending] = useActionState(testWebhook, initialTestState)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="id" value={endpointId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        aria-describedby={describedBy}
      >
        {pending ? t("testingEvent") : t("testEvent")}
      </Button>
      {state.ok ? (
        <span className="text-muted-foreground text-xs">
          {t("testSent", { eventId: state.eventId })}
        </span>
      ) : (
        state.message && <span className="text-destructive text-xs">{state.message}</span>
      )}
    </form>
  )
}

/** Recent deliveries, pre-fetched (`page.tsx`) so the disclosure works without JavaScript: event,
 * attempt, status or error class, duration, time — never a response body. */
function DeliveriesSection({
  deliveries,
  locale,
  describedBy,
}: {
  deliveries: WebhookDelivery[]
  locale: Locale
  /** The row's visually hidden URL, so several rows' "Recent deliveries" can be told apart. */
  describedBy: string
}) {
  const t = useTranslations("account.webhooks")
  return (
    <details className="border-t">
      <summary
        className="cursor-pointer px-6 py-3 text-sm font-medium"
        aria-describedby={describedBy}
      >
        {t("deliveriesSummary")}
      </summary>
      {deliveries.length === 0 ? (
        <p className="text-muted-foreground px-6 py-3 text-xs">{t("deliveriesEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y px-6 py-2 text-xs">
          {deliveries.map((delivery) => (
            <li key={delivery.id} className="py-1.5">
              {deliverySummaryText(t, delivery, locale)}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

/** One endpoint's row: its details, edit, rotate, test, deliveries, then **Delete** (two-click,
 * like `ApiKeyRow`'s **Revoke**). */
function EndpointRow({
  endpoint,
  deliveries,
  workspaceId,
  locale,
  disabled,
  canManage,
  armed,
  onArm,
  onDisarm,
  deleteAction,
  deletePending,
  secretEpoch,
}: {
  endpoint: WebhookEndpoint
  deliveries: WebhookDelivery[]
  /** The current workspace, as a hidden field on every row form — `sameWorkspace`'s check refuses
   * the whole submission without it, exactly as `ApiKeysCard`'s rows carry it. */
  workspaceId: number
  locale: Locale
  disabled: boolean
  /** False on a plan without the `api` feature: Edit, Rotate secret and Send test event all need
   * it (same as `create`), so they are hidden — never shown disabled, which would offer a control
   * that can only ever answer `FORBIDDEN` — in favour of a short upgrade note. Listing, Recent
   * deliveries and Delete stay, since those work on every plan. */
  canManage: boolean
  armed: boolean
  onArm: () => void
  onDisarm: () => void
  deleteAction: (payload: FormData) => void
  deletePending: boolean
  /** Bumped by the card when the page goes into the back-forward cache: remounts the rotate
   * section, so a rotated secret on screen is dropped from state. */
  secretEpoch: number
}) {
  const t = useTranslations("account.webhooks")
  const deleteRef = useRef<HTMLButtonElement>(null)
  const urlTextId = useId()
  const [rotateGeneration, setRotateGeneration] = useState(0)
  // Set by the rotate panel's Done: the remounted section focuses this row's Rotate secret.
  const [focusRotate, setFocusRotate] = useState(false)

  function disarm() {
    onDisarm()
    deleteRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (armed && event.key === "Escape") {
      event.preventDefault()
      disarm()
    }
  }

  const eventsText = endpoint.events.map((event) => eventLabel(t, event)).join(", ")

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-col gap-1 px-6">
        <p className="break-all font-medium">{endpoint.url}</p>
        {endpoint.description && (
          <p className="text-muted-foreground text-xs">{endpoint.description}</p>
        )}
        <p className="text-muted-foreground text-xs">{eventsText}</p>
        <p className="text-xs">{statusText(t, endpoint)}</p>
        <p className="text-muted-foreground text-xs">
          {endpoint.lastDelivery
            ? t("lastDeliveryLine", {
                summary: deliverySummaryText(t, endpoint.lastDelivery, locale),
              })
            : t("lastDeliveryNone")}
        </p>
      </div>

      {/* Text (not shown elsewhere as a single node) for every row control's `aria-describedby`. */}
      <span id={urlTextId} className="sr-only">
        {endpoint.url}
      </span>

      {canManage ? (
        <>
          <EditSection
            endpoint={endpoint}
            workspaceId={workspaceId}
            disabled={disabled}
            describedBy={urlTextId}
          />

          <div className="flex flex-wrap items-center gap-2 border-t px-6 py-3">
            <RotateSecretSection
              key={`${secretEpoch}:${rotateGeneration}`}
              workspaceId={workspaceId}
              endpointId={endpoint.id}
              disabled={disabled}
              describedBy={urlTextId}
              focusOnMount={focusRotate}
              onDone={(event) =>
                dismissRotatedWebhookSecret(event, () => {
                  setFocusRotate(true)
                  setRotateGeneration((g) => g + 1)
                })
              }
            />
            <TestSection
              workspaceId={workspaceId}
              endpointId={endpoint.id}
              disabled={disabled}
              describedBy={urlTextId}
            />
          </div>
        </>
      ) : (
        // The api refuses update/rotateSecret/test without the `api` feature (FORBIDDEN below
        // `manage`): say why rather than offer controls that can only ever answer that.
        <p className="text-muted-foreground border-t px-6 py-3 text-xs">{t("upgradeNote")}</p>
      )}

      <DeliveriesSection deliveries={deliveries} locale={locale} describedBy={urlTextId} />

      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!armed) {
            event.preventDefault()
            onArm()
          }
        }}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 border-t px-6 py-3"
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="id" value={endpoint.id} />
        <Button
          ref={deleteRef}
          type="submit"
          variant={armed ? "destructive" : "outline"}
          size="sm"
          disabled={disabled || deletePending}
          aria-describedby={urlTextId}
        >
          {armed ? t("deleteConfirm") : t("delete")}
        </Button>
        {armed && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={disarm}>
            {t("cancel")}
          </Button>
        )}
      </form>
    </li>
  )
}

/**
 * The Workspace page's "Webhooks" card, for an admin (or owner) — `WorkspaceView` decides that,
 * and whether the plan allows managing endpoints (`canManage`: the `api` feature). Listing,
 * Recent deliveries and Delete work on every plan, so a downgraded workspace's endpoints can
 * still be retired; `canManage={false}` hides Edit, Rotate secret and Send test event on every
 * row (an upgrade note in their place) and the add form (`WorkspaceView` shows its own upsell in
 * that place). Works without JavaScript except the show-once panels' copy buttons; read-only
 * while impersonating, like `ApiKeysCard`.
 */
export function WebhooksCard({
  endpoints,
  deliveriesByEndpoint,
  workspaceId,
  isImpersonating,
  canManage = true,
  locale,
  docsUrl,
}: {
  endpoints: WebhookEndpoint[]
  /** Each endpoint's most recent delivery attempts (newest first), pre-fetched by `page.tsx` so
   * "Recent deliveries" works without JavaScript. */
  deliveriesByEndpoint: Record<number, WebhookDelivery[]>
  workspaceId: number
  isImpersonating: boolean
  /** False on a plan without the `api` feature: the list, Recent deliveries and Delete stay; the
   * add form goes (`WorkspaceView` shows the upsell in its place) and every row hides Edit,
   * Rotate secret and Send test event behind an upgrade note instead of offering a control that
   * can only ever answer `FORBIDDEN`. */
  canManage?: boolean
  locale: Locale
  /** `${siteUrl("docs")}/developers/webhooks`, computed server-side by `page.tsx` — this is a
   * Client Component and must never import `@repo/sites` itself. */
  docsUrl: string
}) {
  const t = useTranslations("account.webhooks")
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteWebhook,
    initialDeleteState
  )
  const [armedId, setArmedId] = useState<number | null>(null)
  // Every answer to a delete disarms: on success the row's button is gone anyway, and a refusal
  // must not leave "Confirm delete" armed. Adjusted during render, as `ApiKeysCard` does.
  const [answeredDelete, setAnsweredDelete] = useState(deleteState)
  if (deleteState !== answeredDelete) {
    setAnsweredDelete(deleteState)
    setArmedId(null)
  }
  const armedEndpoint = endpoints.find((endpoint) => endpoint.id === armedId)
  // A successful delete unmounts the row's form and the button that held focus.
  useEffect(() => focusWebhooksHeadingAfterDelete(deleteState), [deleteState])

  // Bumped by **Done**: a new `key` remounts the add section, dropping the created secret.
  const [addGeneration, setAddGeneration] = useState(0)
  // Bumped as the page goes into the back-forward cache: every show-once secret on screen (the add
  // panel's, any row's rotate panel's) is remounted away before the page is frozen — synchronously,
  // since a scheduled render might not run before the freeze.
  const [secretEpoch, setSecretEpoch] = useState(0)
  useEffect(
    () =>
      discardOnPersistedPageHide(window, () =>
        flushSync(() => {
          setAddGeneration((generation) => generation + 1)
          setSecretEpoch((epoch) => epoch + 1)
        })
      ),
    []
  )

  return (
    <>
      {/* Always mounted, so the live region inside it exists before a message arrives. */}
      <div className={deleteState.message ? "grid gap-2 px-6 py-4" : undefined}>
        <FormMessage state={deleteState} />
      </div>
      {/* Always mounted (empty until a row is armed), so the arming is announced. */}
      <p role="status" className="sr-only">
        {armedEndpoint ? t("armedHint", { url: armedEndpoint.url }) : null}
      </p>
      {endpoints.length === 0 ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {endpoints.map((endpoint) => (
            <EndpointRow
              key={endpoint.id}
              endpoint={endpoint}
              deliveries={deliveriesByEndpoint[endpoint.id] ?? []}
              workspaceId={workspaceId}
              locale={locale}
              disabled={isImpersonating}
              canManage={canManage}
              armed={armedId === endpoint.id}
              onArm={() => setArmedId(endpoint.id)}
              onDisarm={() => setArmedId(null)}
              deleteAction={deleteAction}
              deletePending={deletePending}
              secretEpoch={secretEpoch}
            />
          ))}
        </ul>
      )}
      {isImpersonating ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("impersonating")}</p>
      ) : canManage ? (
        <AddWebhookSection
          key={addGeneration}
          workspaceId={workspaceId}
          onDone={(event) =>
            dismissCreatedWebhookSecret(event, () =>
              setAddGeneration((generation) => generation + 1)
            )
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
