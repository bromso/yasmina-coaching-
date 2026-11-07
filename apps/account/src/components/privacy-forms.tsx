"use client"

import type { DataExport } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Button, buttonVariants } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import type { Consent } from "@repo/ui/lib/consent"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { deleteAccount, requestExport, setConsent } from "@/app/(account)/data-privacy/actions"
import { ReauthNotice } from "@/components/reauth-notice"
import type { DeleteAccountState, FormState } from "@/lib/actions"

/**
 * The Your data card: the latest export's state — being prepared, ready to download until it
 * expires, or expired — and a button to ask for a new one (except while one is being prepared).
 * Dates in the page's locale and UTC, so the server render and the hydrated client agree.
 */
export function ExportForm({ latest, locale }: { latest: DataExport | null; locale: Locale }) {
  const t = useTranslations("account.privacy")
  const [state, action, pending] = useActionState(requestExport, { ok: false } as FormState)
  const status = latest?.status
  return (
    <form action={action} className="grid gap-4 px-6 py-5">
      <FormMessage state={state} />
      {latest && status === "pending" && !state.ok && (
        <p className="text-muted-foreground text-sm">{t("preparing")}</p>
      )}
      {latest && status === "ready" && (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/data-privacy/export?id=${latest.id}`}
            download
            className={buttonVariants({ variant: "default" })}
          >
            {t("download")}
          </a>
          {latest.expiresAt && (
            <span className="text-muted-foreground text-sm">
              {t("availableUntil", { date: formatUtcDate(latest.expiresAt, locale) })}
            </span>
          )}
        </div>
      )}
      {status === "expired" && <p className="text-muted-foreground text-sm">{t("expired")}</p>}
      {status !== "pending" && (
        <div>
          <Button type="submit" variant="outline" disabled={pending}>
            {t("request")}
          </Button>
        </div>
      )}
    </form>
  )
}

const consentPrefix = "consent-"

/** The Cookies and analytics card: the same choice the cookie banner offers, changeable here. */
export function ConsentForm({ current }: { current: Consent | null }) {
  const t = useTranslations("account.privacy")
  const [state, action, pending] = useActionState(setConsent, { ok: false } as FormState)
  const options = [
    { value: "all", label: t("consentAll") },
    { value: "necessary", label: t("consentNecessary") },
  ] as const
  return (
    <form action={action} noValidate className="grid gap-4 px-6 py-5">
      <FormMessage state={state} />
      <fieldset
        className="grid gap-2"
        {...fieldAria("consent", state, undefined, { idPrefix: consentPrefix })}
      >
        <legend className="sr-only">{t("cookies")}</legend>
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <input
              type="radio"
              id={`consent-${option.value}`}
              name="consent"
              value={option.value}
              defaultChecked={current === option.value}
              className="size-4 accent-primary"
            />
            <Label htmlFor={`consent-${option.value}`} className="font-normal">
              {option.label}
            </Label>
          </div>
        ))}
      </fieldset>
      <FieldError name="consent" state={state} idPrefix={consentPrefix} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  )
}

const deletePrefix = "delete-account-"

/**
 * The Delete account card: the account's email, typed, schedules the deletion. A session too
 * old for it gets the sign-in-again notice; success signs out and lands on the sign-in page.
 */
export function DeleteAccountForm() {
  const t = useTranslations("account.privacy")
  const [state, action, pending] = useActionState(deleteAccount, {
    ok: false,
  } as DeleteAccountState)
  const values = state.ok ? undefined : state.values
  return (
    <form action={action} noValidate className="grid gap-4 px-6 py-5">
      {!state.ok && state.reauthHref ? (
        <ReauthNotice message={state.message} href={state.reauthHref} />
      ) : (
        <FormMessage state={state} />
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${deletePrefix}email`}>{t("email")}</Label>
        <Input
          id={`${deletePrefix}email`}
          name="email"
          type="email"
          autoComplete="off"
          // A new key per answer, so a refusal shows what was typed (React resets the form).
          key={values?.email ?? ""}
          defaultValue={values?.email ?? ""}
          {...fieldAria("email", state, `${deletePrefix}hint`, { idPrefix: deletePrefix })}
        />
        <p id={`${deletePrefix}hint`} className="text-muted-foreground text-xs">
          {t("deleteHelp")}
        </p>
        <FieldError name="email" state={state} idPrefix={deletePrefix} />
      </div>
      <div>
        <Button type="submit" variant="destructive" disabled={pending}>
          {t("deleteSubmit")}
        </Button>
      </div>
    </form>
  )
}
