"use client"

import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState, useEffect } from "react"
import { confirmEmailChange } from "@/app/(account)/email/confirm/actions"
import type { EmailChangeConfirmState } from "@/lib/actions"
import { EMAIL_CONFIRM_HEADING_ID, focusEmailConfirmHeading } from "@/lib/email-confirm"

/**
 * The success panel, swapped in for the whole form: like `TwoFactorCard`'s `RecoveryCodes` (and
 * `PasskeysCard`'s `focusHeadingAfterRemove`), focus moves to its own heading on mount
 * (`tabIndex={-1}`, never a tab stop, found by id — see `focusEmailConfirmHeading` — so the
 * lookup has a unit test without a DOM) so a screen reader announces it: nothing else on the page
 * changed to draw attention to the swap, and the button that had focus a moment ago
 * (**Confirm new email**) is gone from the DOM.
 */
export function EmailConfirmSuccess({ email }: { email: string }) {
  const t = useTranslations("account.emailConfirm")
  useEffect(() => {
    focusEmailConfirmHeading()
  }, [])
  return (
    <div className="grid gap-4 px-6 py-5 text-sm">
      <p id={EMAIL_CONFIRM_HEADING_ID} tabIndex={-1} className="font-medium outline-none">
        {t("success", { email })}
      </p>
      <div>
        <Button asChild size="sm">
          <a href="/personal-info">{t("backToPersonalInfo")}</a>
        </Button>
      </div>
    </div>
  )
}

/**
 * `/email/confirm`'s one control: a button that consumes the link's token, never anything that
 * runs on load (a mail scanner that prefetches the page must not spend it). Success swaps in
 * `EmailConfirmSuccess` (the new address, a link back to Personal info, focus moved and
 * announced); every refusal (an unknown, used, expired or another account's link, or the address
 * taken meanwhile) shows in place via `FormMessage`.
 */
export function EmailConfirmForm({ token }: { token: string }) {
  const t = useTranslations("account.emailConfirm")
  const [state, action, pending] = useActionState(confirmEmailChange, {
    ok: false,
  } as EmailChangeConfirmState)

  if (state.ok) return <EmailConfirmSuccess email={state.email} />

  return (
    <form action={action} className="grid gap-4 px-6 py-5" noValidate>
      <p className="text-sm">{t("intro")}</p>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("confirmingButton") : t("confirmButton")}
        </Button>
      </div>
    </form>
  )
}
