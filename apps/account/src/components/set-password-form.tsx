"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { setPassword } from "@/app/(account)/security/actions"
import { PasswordInput } from "@/components/password-input"
import { ReauthNotice } from "@/components/reauth-notice"
import type { SetPasswordState } from "@/lib/actions"

export function SetPasswordForm({ email }: { email: string }) {
  const t = useTranslations("account.password")
  const [state, action, pending] = useActionState(setPassword, { ok: false } as SetPasswordState)

  return (
    // React resets the fields after every submit; passwords are never echoed back as `values`.
    <form action={action} noValidate className="grid gap-4 px-6 py-5">
      {!state.ok && state.reauthHref ? (
        <ReauthNotice message={state.message} href={state.reauthHref} />
      ) : (
        <FormMessage state={state} />
      )}
      {/* Tells a password manager whose password this is, so it saves it against the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={email} />
      <div className="grid gap-2">
        <Label htmlFor="password">{t("new")}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          {...fieldAria("password", state, "password-hint")}
        />
        <p id="password-hint" className="text-muted-foreground text-xs">
          {t("setHint")}
        </p>
        <FieldError name="password" state={state} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">{t("confirm")}</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          {...fieldAria("confirm", state)}
        />
        <FieldError name="confirm" state={state} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t(pending ? "setting" : "set")}
        </Button>
      </div>
    </form>
  )
}
