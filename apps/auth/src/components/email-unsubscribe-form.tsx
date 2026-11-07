"use client"

import type { OptionalNotificationEmailType } from "@repo/api-contract/notifications"
import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { FormMessage } from "@repo/ui/components/form-feedback"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useActionState, useEffect } from "react"
import { turnOffEmails } from "@/app/email/unsubscribe/actions"
import {
  EMAIL_UNSUBSCRIBE_HEADING_ID,
  focusEmailUnsubscribeHeading,
} from "@/lib/email-change-focus"
import type { UnsubscribeState } from "@/lib/unsubscribe"
import { UNSUBSCRIBE_TYPE_KEYS } from "@/lib/unsubscribe-types"

/** A link `peek` did not recognise: one neutral sentence and a way to sign in, nothing more. */
export function EmailUnsubscribeInvalid() {
  const t = useTranslations("auth.emailUnsubscribe")
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("invalid")}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild size="sm">
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * The api could not be asked about the link (rate-limited or down): a try-again note, never the
 * "isn't valid" one — a real link never expires. No button and no sign-in link: nothing here can
 * work until the api answers, and reloading the page is the retry.
 */
export function EmailUnsubscribeUnavailable() {
  const t = useTranslations("auth.emailUnsubscribe")
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("unavailable")}</CardDescription>
      </CardHeader>
    </Card>
  )
}

/**
 * The success panel, swapped in for the whole card body: focus moves to its own heading on mount
 * (`tabIndex={-1}`, never a tab stop) so a screen reader announces it — the button that held
 * focus is gone. Links to account `/notifications`, where the choice can be undone.
 */
export function EmailUnsubscribeSuccess({
  message,
  settingsUrl,
}: {
  message: string
  settingsUrl: string
}) {
  const t = useTranslations("auth.emailUnsubscribe")
  useEffect(() => {
    focusEmailUnsubscribeHeading()
  }, [])
  return (
    <CardContent className="grid gap-4 text-sm">
      <p id={EMAIL_UNSUBSCRIBE_HEADING_ID} tabIndex={-1} className="font-medium outline-none">
        {message}
      </p>
      <div>
        <Button asChild size="sm">
          <a href={settingsUrl}>{t("settings")}</a>
        </Button>
      </div>
    </CardContent>
  )
}

/**
 * `/email/unsubscribe`'s one control: a button that turns the link's email type off, never
 * anything that runs on load (a mail scanner that prefetches the page must not spend it). A plain
 * form post without JavaScript; a refusal (too many requests, the api unreachable) shows in place
 * via `FormMessage`.
 */
export function EmailUnsubscribeForm({
  token,
  type,
  settingsUrl,
}: {
  token: string
  type: OptionalNotificationEmailType
  settingsUrl: string
}) {
  const t = useTranslations("auth.emailUnsubscribe")
  const [state, action, pending] = useActionState(turnOffEmails, {
    ok: false,
  } as UnsubscribeState)

  return (
    <Card>
      {state.ok ? (
        <EmailUnsubscribeSuccess message={state.message ?? ""} settingsUrl={settingsUrl} />
      ) : (
        <>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription>
              {t(`types.${UNSUBSCRIBE_TYPE_KEYS[type]}`)} {t("intro")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={action} noValidate>
              <input type="hidden" name="token" value={token} />
              <div className="grid gap-6">
                <FormMessage state={state} />
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? t("working") : t("button")}
                </Button>
              </div>
            </form>
          </CardContent>
        </>
      )}
    </Card>
  )
}
