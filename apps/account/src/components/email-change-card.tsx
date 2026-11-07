"use client"

import type { EmailChangePending } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { requestEmailChange } from "@/app/(account)/personal-info/actions"
import { ReauthNotice } from "@/components/reauth-notice"
import type { EmailChangeRequestState } from "@/lib/actions"

/**
 * The Personal info page's "Email address" card: the current address and its verified state,
 * then **Change email** — a new address, the current password (re-checked the same way
 * `account.twoFactor.disable` is) or, on a passwordless account whose session has outlived the
 * re-authentication window, a sign-in link instead, and, with two-step verification on, a current
 * authenticator or recovery code.
 *
 * A pending change — from this form's own last answer, or an earlier visit's
 * `account.email.get` — shows as a status line above the form and turns the submit button into
 * **Send again**: the same request again. React resets the form after every answer, so the new
 * address comes back from the action's state (`values`, on success and refusal alike, like the
 * name and sign-in forms) as the field's default; the password and the code are never echoed and
 * are typed again. Works without JavaScript; read-only while impersonating, like the Two-step and
 * Passkeys cards.
 */
export function EmailChangeCard({
  email,
  emailVerified,
  pending,
  hasPassword,
  twoFactorEnabled,
  isImpersonating,
  locale,
}: {
  email: string
  emailVerified: boolean
  pending: EmailChangePending | null
  hasPassword: boolean
  twoFactorEnabled: boolean
  isImpersonating: boolean
  locale: Locale
}) {
  const t = useTranslations("account")
  const tc = useTranslations("account.emailChange")
  const [state, action, pendingSubmit] = useActionState(requestEmailChange, {
    ok: false,
  } as EmailChangeRequestState)
  const effectivePending = state.pending ?? pending
  const reauthHref = !state.ok ? state.reauthHref : undefined

  return (
    <>
      <div className="grid gap-1 px-6 py-5">
        <span className="flex items-center gap-2 text-sm font-medium">
          {t("personalInfo.email")}
          <Badge variant={emailVerified ? "secondary" : "outline"}>
            {t(emailVerified ? "personalInfo.verified" : "personalInfo.unverified")}
          </Badge>
        </span>
        <span className="text-sm break-all">{email}</span>
      </div>
      {isImpersonating ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{tc("impersonating")}</p>
      ) : (
        <form action={action} className="grid max-w-96 gap-3 border-t px-6 py-5" noValidate>
          {/*
            Its own live region, separate from FormMessage's just below: this one can hold text
            (an earlier or just-renewed pending change) at the same time FormMessage legitimately
            shows an error alert (a failed resend, say) — they are never the same announcement,
            so they are never merged into one. `empty:absolute` rather than `empty:hidden`,
            matching FormMessage's own region: `display:none` would pull the node out of the
            accessibility tree while empty, so the transition from empty to carrying the "Check
            n***@…" text might not be announced at all (see FormMessage's own comment).
          */}
          <p role="status" aria-live="polite" className="text-sm empty:absolute">
            {effectivePending
              ? tc("pending", {
                  email: effectivePending.maskedEmail,
                  date: formatUtcDate(effectivePending.expiresAt, locale, { time: true }),
                })
              : null}
          </p>
          {reauthHref ? (
            <ReauthNotice message={!state.ok ? state.message : undefined} href={reauthHref} />
          ) : (
            <FormMessage state={state} />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="email-change-new">{tc("newEmailLabel")}</Label>
            <Input
              id="email-change-new"
              name="newEmail"
              type="email"
              autoComplete="email"
              required
              defaultValue={state.values?.newEmail}
              {...fieldAria("newEmail", state, undefined, { idPrefix: "email-change-" })}
            />
            <FieldError name="newEmail" state={state} idPrefix="email-change-" />
          </div>
          {hasPassword && (
            <div className="grid gap-1.5">
              <Label htmlFor="email-change-password">{tc("currentPassword")}</Label>
              <Input
                id="email-change-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                {...fieldAria("currentPassword", state, undefined, { idPrefix: "email-change-" })}
              />
              <FieldError name="currentPassword" state={state} idPrefix="email-change-" />
            </div>
          )}
          {twoFactorEnabled && (
            <div className="grid gap-1.5">
              <Label htmlFor="email-change-code">{t("common.code")}</Label>
              <Input
                id="email-change-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={20}
                {...fieldAria("code", state, undefined, { idPrefix: "email-change-" })}
              />
              <FieldError name="code" state={state} idPrefix="email-change-" />
            </div>
          )}
          <div>
            <Button type="submit" disabled={pendingSubmit}>
              {effectivePending
                ? tc(pendingSubmit ? "sendingAgain" : "sendAgainButton")
                : tc(pendingSubmit ? "changing" : "changeButton")}
            </Button>
          </div>
        </form>
      )}
    </>
  )
}
