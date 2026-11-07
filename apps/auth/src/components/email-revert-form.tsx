"use client"

import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { FormMessage } from "@repo/ui/components/form-feedback"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useActionState, useEffect } from "react"
import { revertEmailChange } from "@/app/email/revert/actions"
import type { EmailRevertState } from "@/lib/email-change"
import { EMAIL_REVERT_HEADING_ID, focusEmailRevertHeading } from "@/lib/email-change-focus"

/**
 * The success panel, swapped in for the whole card body: mirrors `EmailCancelSuccess`. The base
 * sentence is always shown; a line about the mailed password-reset link is added only when
 * `passwordReset` is true (a passwordless account has no password to reset); the line pointing at
 * the account's Security settings is always shown, since a revert can never tell a legitimate
 * owner's own recent changes apart from an attacker's. `securityUrl` is computed server-side
 * (`siteUrl` reads `process.env`, which is not inlined into the browser bundle) and passed down
 * as a plain string — the same pattern `security-view.tsx` uses for `ConnectedAccounts`.
 */
export function EmailRevertSuccess({
  passwordReset,
  securityUrl,
}: {
  passwordReset: boolean
  securityUrl: string
}) {
  const t = useTranslations("auth.emailRevert")
  useEffect(() => {
    focusEmailRevertHeading()
  }, [])
  return (
    <CardContent className="grid gap-4 text-sm">
      <p id={EMAIL_REVERT_HEADING_ID} tabIndex={-1} className="font-medium outline-none">
        {t("success")}
      </p>
      {passwordReset ? <p>{t("passwordResetNotice")}</p> : null}
      <p>
        {t.rich("review", {
          security: (chunks) => (
            <a href={securityUrl} className="underline underline-offset-4">
              {chunks}
            </a>
          ),
        })}
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
 * `/email/revert`'s one control: a button that consumes the link's token, never anything that
 * runs on load. Success swaps in `EmailRevertSuccess`; every refusal (an unknown, used or expired
 * link, or the old address taken by another account meanwhile — the "contact support" message)
 * shows in place via `FormMessage`. Anonymous, like `/magic` and `/email/cancel`: the action
 * clears this browser's own session cookie too, since the api just ended every session.
 * `securityUrl` is forwarded from `EmailRevertView` (a server component) straight through to
 * `EmailRevertSuccess` — see its own doc comment.
 */
export function EmailRevertForm({ token, securityUrl }: { token: string; securityUrl: string }) {
  const t = useTranslations("auth.emailRevert")
  const [state, action, pending] = useActionState(revertEmailChange, {
    ok: false,
  } as EmailRevertState)

  return (
    <Card>
      {state.ok ? (
        <EmailRevertSuccess passwordReset={state.passwordReset} securityUrl={securityUrl} />
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
                  {pending ? t("restoring") : t("restoreButton")}
                </Button>
              </div>
            </form>
          </CardContent>
        </>
      )}
    </Card>
  )
}
