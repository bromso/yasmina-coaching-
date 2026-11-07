"use client"

import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { FormMessage } from "@repo/ui/components/form-feedback"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useActionState, useEffect } from "react"
import { cancelEmailChange } from "@/app/email/cancel/actions"
import type { EmailCancelState } from "@/lib/email-change"
import { EMAIL_CANCEL_HEADING_ID, focusEmailCancelHeading } from "@/lib/email-change-focus"

/**
 * The success panel, swapped in for the whole card body: like apps/account's
 * `EmailConfirmSuccess`, focus moves to its own heading on mount (`tabIndex={-1}`, never a tab
 * stop, found by id — see `focusEmailCancelHeading` — so the lookup has a unit test without a
 * DOM) so a screen reader announces it: nothing else on the page changed to draw attention to
 * the swap, and the button that had focus a moment ago (**Cancel this change**) is gone from the
 * DOM.
 */
export function EmailCancelSuccess({ message }: { message: string }) {
  const t = useTranslations("auth.emailCancel")
  useEffect(() => {
    focusEmailCancelHeading()
  }, [])
  return (
    <CardContent className="grid gap-4 text-sm">
      <p id={EMAIL_CANCEL_HEADING_ID} tabIndex={-1} className="font-medium outline-none">
        {message}
      </p>
      <div>
        <Button asChild size="sm">
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      </div>
    </CardContent>
  )
}

/**
 * `/email/cancel`'s one control: a button that consumes the link's token, never anything that
 * runs on load (a mail scanner that prefetches the page must not spend it). Success swaps in
 * `EmailCancelSuccess`; every refusal (an unknown, used or expired link) shows in place via
 * `FormMessage`. Anonymous, like `/magic`: whoever holds the account's old mailbox, signed in or
 * not — the action clears this browser's own session cookie too, since the api just ended every
 * session.
 */
export function EmailCancelForm({ token }: { token: string }) {
  const t = useTranslations("auth.emailCancel")
  const [state, action, pending] = useActionState(cancelEmailChange, {
    ok: false,
  } as EmailCancelState)

  return (
    <Card>
      {state.ok ? (
        <EmailCancelSuccess message={state.message ?? ""} />
      ) : (
        <>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription>{t("intro")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={action} noValidate>
              <input type="hidden" name="token" value={token} />
              <div className="grid gap-6">
                <FormMessage state={state} />
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? t("cancelling") : t("cancelButton")}
                </Button>
              </div>
            </form>
          </CardContent>
        </>
      )}
    </Card>
  )
}
